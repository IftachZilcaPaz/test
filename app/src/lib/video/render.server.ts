import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpeg, VIDEO_HEIGHT, VIDEO_WIDTH } from "@/lib/media/ffmpeg.server";
import { PLAYBACK_SPEED } from "@/lib/script/hebrew";
import { getMedia } from "@/lib/storage.server";
import type { TimedWord } from "@/lib/voice/voices";
import { captionPng, endCardPng } from "./graphics.server";
import { buildTimeline, type Timeline } from "./timeline";

export type RenderInput = {
  business: string;
  callToAction: string;
  narrationKey: string;
  words: TimedWord[];
  scenes: { mediaKey: string; caption: string }[];
};

export type RenderResult = { video: Uint8Array; timeline: Timeline };

const FPS = 30;
const CAPTION_BOTTOM = 230; // px from the bottom edge, above platform UI on Reels/TikTok

async function load(key: string, path: string) {
  const bytes = await getMedia(key);
  if (!bytes) throw new Error(`missing media ${key}`);
  await writeFile(path, bytes);
}

/**
 * Assembles the final 9:16 video: scenes cut to the narration timeline, Hebrew
 * captions burned in while their words are spoken, narration at ×1.25, and the
 * branded end card.
 */
export async function renderVideo(input: RenderInput): Promise<RenderResult> {
  const timeline = buildTimeline(input.words, input.scenes.map((scene) => scene.caption));
  const dir = await mkdtemp(join(tmpdir(), "reyn-render-"));
  try {
    const narration = join(dir, "narration.mp3");
    await load(input.narrationKey, narration);
    const clips = await Promise.all(
      input.scenes.map(async (scene, index) => {
        const path = join(dir, `scene-${index}.mp4`);
        await load(scene.mediaKey, path);
        return path;
      }),
    );
    const endCard = join(dir, "endcard.png");
    await writeFile(endCard, await endCardPng(input.business, input.callToAction));
    const captions = await Promise.all(
      timeline.scenes.map(async (slot, index) => {
        if (!slot.caption) return null;
        const path = join(dir, `caption-${index}.png`);
        const plate = await captionPng(slot.caption.text);
        await writeFile(path, plate.png);
        return { path, ...slot.caption };
      }),
    );

    const args: string[] = [];
    clips.forEach((clip) => args.push("-stream_loop", "-1", "-i", clip));
    const endIndex = clips.length;
    args.push("-loop", "1", "-framerate", String(FPS), "-t", (timeline.endCard.end - timeline.endCard.start).toFixed(3), "-i", endCard);
    const audioIndex = endIndex + 1;
    args.push("-i", narration);
    const captionInputs = captions.map((caption) => {
      if (!caption) return null;
      args.push("-loop", "1", "-framerate", String(FPS), "-t", timeline.total.toFixed(3), "-i", caption.path);
      return { ...caption, input: audioIndex + 1 + captions.filter(Boolean).indexOf(caption) };
    });

    const fit = `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=${FPS},format=yuv420p`;
    const filters: string[] = [];
    timeline.scenes.forEach((slot, index) => {
      const duration = Math.max(slot.end - slot.start, 0.2).toFixed(3);
      filters.push(`[${index}:v]${fit},trim=duration=${duration},setpts=PTS-STARTPTS[s${index}]`);
    });
    filters.push(`[${endIndex}:v]${fit},fade=t=in:st=0:d=0.35,setpts=PTS-STARTPTS[end]`);
    filters.push(`${timeline.scenes.map((_, index) => `[s${index}]`).join("")}[end]concat=n=${timeline.scenes.length + 1}:v=1:a=0[base]`);

    let current = "base";
    captionInputs.forEach((caption, index) => {
      if (!caption) return;
      const next = `c${index}`;
      filters.push(
        `[${current}][${caption.input}:v]overlay=x=(W-w)/2:y=H-h-${CAPTION_BOTTOM}:enable='between(t,${caption.start.toFixed(3)},${caption.end.toFixed(3)})'[${next}]`,
      );
      current = next;
    });
    filters.push(`[${audioIndex}:a]atempo=${PLAYBACK_SPEED},apad[a]`);

    const output = join(dir, "video.mp4");
    await ffmpeg([
      ...args,
      "-filter_complex", filters.join(";"),
      "-map", `[${current}]`,
      "-map", "[a]",
      "-t", timeline.total.toFixed(3),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
      "-movflags", "+faststart",
      output,
    ]);
    return { video: await readFile(output), timeline };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
