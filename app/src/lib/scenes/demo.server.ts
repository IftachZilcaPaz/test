import "server-only";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpeg, VIDEO_HEIGHT, VIDEO_WIDTH } from "@/lib/media/ffmpeg.server";

// Brand pastel pairs; each demo scene gets its own slowly moving gradient.
const PALETTES = [
  ["0xE6DEFB", "0xF49BB7"],
  ["0xDCF1E9", "0x8B6FE8"],
  ["0xFFF0D3", "0xF49BB7"],
  ["0xEAE1FD", "0x63AFD0"],
  ["0xFDE2E9", "0x9B84EE"],
  ["0xDCEBFF", "0xA07CF0"],
] as const;

/** How many placeholder clips one poll renders, so every request stays well under the host's time limit. */
export const DEMO_CLIPS_PER_POLL = 2;

/**
 * Free placeholder clip (demo mode, no Higgsfield key): 9:16, silent, short. The
 * render loops a clip to fill its slot, so a few seconds are enough and keep this fast.
 */
export async function demoSceneClip(index: number, seconds = 3): Promise<Uint8Array> {
  const [from, to] = PALETTES[index % PALETTES.length]!;
  const dir = await mkdtemp(join(tmpdir(), "reyn-demo-"));
  const out = join(dir, "scene.mp4");
  try {
    await ffmpeg([
      "-f", "lavfi",
      "-i", `gradients=s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:c0=${from}:c1=${to}:speed=0.015:duration=${seconds}:rate=30`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-movflags", "+faststart",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
