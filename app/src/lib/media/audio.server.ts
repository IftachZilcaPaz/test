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
