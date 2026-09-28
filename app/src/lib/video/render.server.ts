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

/**
 * The video is assembled in parts so no single step runs long (a serverless request
 * has ~30 s): one part per scene plus the end card, each encoded on its own with its
 * captions burned in, then joined without re-encoding and given the narration.
 * Part boundaries sit on whole frames, so the joined parts keep the timeline exact.
 */
export type RenderPart = { index: number; startFrame: number; frames: number };
export type RenderPlan = { timeline: Timeline; parts: RenderPart[] };

const FPS = 30;
const CAPTION_BOTTOM = 230; // px from the bottom edge, above platform UI on Reels/TikTok
// Customer screenshots: top edge and max height, leaving room for the caption and the 4% zoom.
const SCREEN_TOP = 130;
const SCREEN_MAX_HEIGHT = 800;
// Share of a presenter clip's height cut from the bottom, where invented subtitles appear.
const TALK_BOTTOM_CROP = 0.12;
// Every part is encoded identically, so the parts join without re-encoding.
const VIDEO_CODEC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS)];

const frameOf = (seconds: number) => Math.round(seconds * FPS);

export function planRender(input: RenderInput): RenderPlan {
  const timeline = buildTimeline(input.words, input.scenes.map((scene) => scene.caption), input.speed);
  const bounds = [...timeline.scenes.map((slot) => frameOf(slot.start)), frameOf(timeline.endCard.start), frameOf(timeline.endCard.end)];
  const parts = bounds.slice(0, -1).map((startFrame, index) => ({ index, startFrame, frames: Math.max(1, bounds[index + 1]! - startFrame) }));
  return { timeline, parts };
}

/** The end card is always the last part. */
export const isEndCard = (plan: RenderPlan, part: RenderPart) => part.index === plan.parts.length - 1;

async function load(key: string, path: string) {
  const bytes = await getMedia(key);
  if (!bytes) throw new Error(`missing media ${key}`);
  await writeFile(path, bytes);
}

const fit = `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=${FPS},format=yuv420p`;

/** Encodes one part (video only), with the captions shown during it. */
export async function renderPart(input: RenderInput, plan: RenderPlan, part: RenderPart): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "reyn-part-"));
  try {
    const start = part.startFrame / FPS;
    const duration = (part.frames / FPS).toFixed(3);
    const args: string[] = [];
    const filters: string[] = [];

    if (isEndCard(plan, part)) {
      const card = join(dir, "endcard.png");
      await writeFile(card, await endCardPng(input.business, input.callToAction));
      args.push("-loop", "1", "-framerate", String(FPS), "-t", duration, "-i", card);
      filters.push(`[0:v]${fit},fade=t=in:st=0:d=0.35,setpts=PTS-STARTPTS[base]`);
    } else {
      const beat = input.scenes[part.index]!;
      const clip = join(dir, beat.kind === "image" ? "scene.img" : "scene.mp4");
      await load(beat.mediaKey, clip);
      if (beat.kind === "image") {
        args.push("-loop", "1", "-framerate", String(FPS), "-t", (part.frames / FPS + 0.5).toFixed(3), "-i", clip);
        // Blurred, darkened fill behind the whole image, which grows ~4% over its beat.
        const grow = `scale=w='trunc(iw*(1+0.04*t/${duration})/2)*2':h=-2:eval=frame`;
        filters.push(
          "[0:v]split=2[bg][fg]",
          `[bg]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},gblur=sigma=28,eq=brightness=-0.06[bb]`,
          // Kept above the caption band (captions sit CAPTION_BOTTOM px from the bottom), so neither hides the other.
          `[fg]scale=${VIDEO_WIDTH - 100}:${SCREEN_MAX_HEIGHT}:force_original_aspect_ratio=decrease,${grow}[ff]`,
          `[bb][ff]overlay=x=(W-w)/2:y=${SCREEN_TOP}:eval=frame,setsar=1,fps=${FPS},format=yuv420p,trim=duration=${duration},setpts=PTS-STARTPTS[base]`,
        );
      } else if (beat.kind === "talking") {
        // Never looped: a restarted clip would show lips from another sentence.
        args.push("-i", clip);
        // Clip time c shows the lips of narration second audioStart + c; this part plays narration from start × speed.
        const offset = Math.max(0, start * input.speed - beat.audioStart).toFixed(3);
        // Talking-head models sometimes draw fake subtitles along the bottom edge (they learned
        // from captioned social videos); that band is cropped away, keeping the face in frame.
        filters.push(
          `[0:v]trim=start=${offset},setpts=(PTS-STARTPTS)/${input.speed},crop=iw:trunc(ih*${1 - TALK_BOTTOM_CROP}/2)*2:0:0,${fit},tpad=stop_mode=clone:stop_duration=2,trim=duration=${duration},setpts=PTS-STARTPTS[base]`,
        );
      } else {
        args.push("-stream_loop", "-1", "-i", clip);
        filters.push(`[0:v]${fit},trim=duration=${duration},setpts=PTS-STARTPTS[base]`);
      }
    }

    // Captions are timed on the whole video; burn in the ones that overlap this part.
    const end = (part.startFrame + part.frames) / FPS;
    const captions = plan.timeline.scenes.flatMap((slot) => (slot.caption && slot.caption.end > start && slot.caption.start < end ? [slot.caption] : []));
    let current = "base";
    for (const [index, caption] of captions.entries()) {
      const path = join(dir, `caption-${index}.png`);
      await writeFile(path, (await captionPng(caption.text)).png);
      args.push("-loop", "1", "-framerate", String(FPS), "-t", duration, "-i", path);
      const from = Math.max(0, caption.start - start).toFixed(3);
      const to = (caption.end - start).toFixed(3);
      filters.push(`[${current}][${index + 1}:v]overlay=x=(W-w)/2:y=H-h-${CAPTION_BOTTOM}:enable='between(t,${from},${to})'[c${index}]`);
      current = `c${index}`;
    }

    const output = join(dir, "part.mp4");
    await ffmpeg([...args, "-filter_complex", filters.join(";"), "-map", `[${current}]`, "-frames:v", String(part.frames), ...VIDEO_CODEC, "-an", output]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Joins the encoded parts in order (no re-encoding) and lays the narration under them. */
export async function assembleParts(input: RenderInput, plan: RenderPlan, parts: Uint8Array[]): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "reyn-join-"));
  try {
    const list = await Promise.all(
      parts.map(async (bytes, index) => {
        const path = join(dir, `part-${index}.mp4`);
        await writeFile(path, bytes);
        return `file '${path}'`;
      }),
    );
    await writeFile(join(dir, "parts.txt"), list.join("\n"));
    const narration = join(dir, "narration.mp3");
    await load(input.narrationKey, narration);
    const output = join(dir, "video.mp4");
    await ffmpeg([
      "-f", "concat", "-safe", "0", "-i", join(dir, "parts.txt"),
      "-i", narration,
      "-filter_complex", `[1:a]atempo=${input.speed},apad[a]`,
      "-map", "0:v", "-map", "[a]",
      "-t", plan.timeline.total.toFixed(3),
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
      "-movflags", "+faststart",
      output,
    ]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The whole video in one go (scripts and tests); the app renders part by part instead. */
export async function renderVideo(input: RenderInput): Promise<{ video: Uint8Array; timeline: Timeline }> {
  const plan = planRender(input);
  const parts: Uint8Array[] = [];
  for (const part of plan.parts) parts.push(await renderPart(input, plan, part));
  return { video: await assembleParts(input, plan, parts), timeline: plan.timeline };
}
