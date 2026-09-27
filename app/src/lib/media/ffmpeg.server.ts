import "server-only";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/** Runs the bundled ffmpeg (no system install needed on the Mac or the server). */
export function ffmpeg(args: string[]): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg binary is not available for this platform");
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath as string, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-800)}`)),
    );
  });
}

export const VIDEO_WIDTH = 720;
export const VIDEO_HEIGHT = 1280;
