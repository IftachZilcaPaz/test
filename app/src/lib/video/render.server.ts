import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpeg, VIDEO_HEIGHT, VIDEO_WIDTH } from "@/lib/media/ffmpeg.server";
import type { Speed } from "@/lib/script/hebrew";
import { getMedia } from "@/lib/storage.server";
import type { TimedWord } from "@/lib/voice/voices";
import { captionPng, endCardPng } from "./graphics.server";
import { buildTimeline, type Timeline } from "./timeline";

export type RenderInput = {
  business: string;
  callToAction: string;
  narrationKey: string;
  words: TimedWord[];
  /**
   * "image" beats are the customer's own screenshots: shown crisp over a blurred copy, gently zooming.
   * "talking" beats are presenter clips lip-synced to the narration from `audioStart` (seconds at 1×):
   * they are cut to the matching moment and sped up with the voice, so the lips stay in sync.
   */
  scenes: ({ mediaKey: string; caption: string } & ({ kind: "video" | "image" } | { kind: "talking"; audioStart: number }))[];
  /** Narration speed-up; the scene cuts and captions follow it. */
  speed: Speed;
};

export type RenderResult = { video: Uint8Array; timeline: Timeline };

const FPS = 30;
const CAPTION_BOTTOM = 230; // px from the bottom edge, above platform UI on Reels/TikTok
// Customer screenshots: top edge and max height, leaving room for the caption and the 4% zoom.
const SCREEN_TOP = 130;
const SCREEN_MAX_HEIGHT = 800;

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
  const timeline = buildTimeline(input.words, input.scenes.map((scene) => scene.caption), input.speed);
  const dir = await mkdtemp(join(tmpdir(), "reyn-render-"));
  try {
    const narration = join(dir, "narration.mp3");
    await load(input.narrationKey, narration);
    const clips = await Promise.all(
      input.scenes.map(async (scene, index) => {
        const path = join(dir, `scene-${index}${scene.kind === "image" ? ".img" : ".mp4"}`);
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
    clips.forEach((clip, index) => {
      if (input.scenes[index]!.kind === "image") {
        const slot = timeline.scenes[index]!;
        args.push("-loop", "1", "-framerate", String(FPS), "-t", (Math.max(slot.end - slot.start, 0.2) + 0.5).toFixed(3), "-i", clip);
      } else if (input.scenes[index]!.kind === "talking") {
        // Never looped: a restarted clip would show lips from another sentence.
        args.push("-i", clip);
      } else {
        args.push("-stream_loop", "-1", "-i", clip);
      }
    });
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
      const seconds = Math.max(slot.end - slot.start, 0.2);
      const duration = seconds.toFixed(3);
      const beat = input.scenes[index]!;
      if (beat.kind === "talking") {
        // Clip time c shows the lips of narration second audioStart + c; this slot plays narration from start × speed.
        const offset = Math.max(0, slot.start * input.speed - beat.audioStart).toFixed(3);
        filters.push(
          `[${index}:v]trim=start=${offset},setpts=(PTS-STARTPTS)/${input.speed},${fit},tpad=stop_mode=clone:stop_duration=2,trim=duration=${duration},setpts=PTS-STARTPTS[s${index}]`,
        );
      } else if (beat.kind === "image") {
        // Blurred, darkened fill behind the whole image, which grows ~4% over its beat.
        const grow = `scale=w='trunc(iw*(1+0.04*t/${duration})/2)*2':h=-2:eval=frame`;
        filters.push(
          `[${index}:v]split=2[bg${index}][fg${index}]`,
          `[bg${index}]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},gblur=sigma=28,eq=brightness=-0.06[bb${index}]`,
          // Kept above the caption band (captions sit CAPTION_BOTTOM px from the bottom), so neither hides the other.
          `[fg${index}]scale=${VIDEO_WIDTH - 100}:${SCREEN_MAX_HEIGHT}:force_original_aspect_ratio=decrease,${grow}[ff${index}]`,
          `[bb${index}][ff${index}]overlay=x=(W-w)/2:y=${SCREEN_TOP}:eval=frame,setsar=1,fps=${FPS},format=yuv420p,trim=duration=${duration},setpts=PTS-STARTPTS[s${index}]`,
        );
      } else {
        filters.push(`[${index}:v]${fit},trim=duration=${duration},setpts=PTS-STARTPTS[s${index}]`);
      }
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
    filters.push(`[${audioIndex}:a]atempo=${input.speed},apad[a]`);

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
