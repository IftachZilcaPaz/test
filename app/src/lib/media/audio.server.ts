import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpeg } from "./ffmpeg.server";

/** Cuts [start, end) seconds out of an audio file into a standalone MP3. */
export async function sliceAudio(audio: Uint8Array, start: number, end: number): Promise<Uint8Array> {
  if (!(end > start) || start < 0) throw new Error(`invalid audio slice ${start}-${end}`);
  const dir = await mkdtemp(join(tmpdir(), "reyn-slice-"));
  try {
    const input = join(dir, "in.mp3");
    const output = join(dir, "out.mp3");
    await writeFile(input, audio);
    // Re-encoded (not stream-copied) so the cut lands on the exact sample, not the nearest MP3 frame.
    await ffmpeg(["-ss", start.toFixed(3), "-t", (end - start).toFixed(3), "-i", input, "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", output]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const ENVELOPE_RATE = 100; // loudness samples per second (10 ms)

/**
 * Loudness envelope of an audio or video file's soundtrack, 100 values a second, or null
 * when the file has no sound. `from`/`seconds` cut a stretch of it first.
 */
export async function loudnessEnvelope(media: Uint8Array, from = 0, seconds?: number): Promise<Float32Array | null> {
  const dir = await mkdtemp(join(tmpdir(), "reyn-env-"));
  try {
    const input = join(dir, "in");
    const output = join(dir, "out.raw");
    await writeFile(input, media);
    const window = seconds ? ["-ss", from.toFixed(3), "-t", seconds.toFixed(3)] : [];
    try {
      await ffmpeg([...window, "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", output]);
    } catch {
      return null; // no audio stream
    }
    const samples = new Float32Array((await readFile(output)).buffer.slice(0));
    if (samples.length === 0) return null;
    const hop = 16000 / ENVELOPE_RATE;
    const envelope = new Float32Array(Math.floor(samples.length / hop));
    for (let frame = 0; frame < envelope.length; frame++) {
      let sum = 0;
      for (let i = frame * hop; i < (frame + 1) * hop; i++) sum += samples[i]! * samples[i]!;
      envelope[frame] = Math.sqrt(sum / hop);
    }
    return envelope;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Where `reference` sits inside `recording`: the delay in seconds (positive = the
 * recording starts it later) with the best match, and how well they match (Pearson
 * correlation, 1 = identical loudness shape). Searches up to ±`maxSeconds`.
 */
export function alignEnvelopes(recording: Float32Array, reference: Float32Array, maxSeconds = 1): { delay: number; match: number } {
  const maxLag = Math.round(maxSeconds * ENVELOPE_RATE);
  let best = { delay: 0, match: -1 };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < reference.length; i++) {
      const j = i + lag;
      if (j >= 0 && j < recording.length) pairs.push([recording[j]!, reference[i]!]);
    }
    if (pairs.length < ENVELOPE_RATE) continue; // under a second of overlap says nothing
    const n = pairs.length;
    const [ma, mb] = pairs.reduce(([a, b], [x, y]) => [a + x / n, b + y / n], [0, 0]);
    let cov = 0;
    let va = 0;
    let vb = 0;
    for (const [x, y] of pairs) {
      cov += (x - ma) * (y - mb);
      va += (x - ma) ** 2;
      vb += (y - mb) ** 2;
    }
    const match = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
    if (match > best.match) best = { delay: lag / ENVELOPE_RATE, match };
  }
  return best;
}
