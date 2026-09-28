import "server-only";
import type { Scene, VoiceTake } from "@/db/schema";
import { sliceAudio } from "@/lib/media/audio.server";
import { publicMediaUrl } from "@/lib/public-media.server";
import { getMedia, putMedia } from "@/lib/storage.server";
import { buildTimeline } from "@/lib/video/timeline";

/**
 * The presenter style: each beat is the presenter saying that part of the narration,
 * lip-synced by Wan 2.7 to a slice of the approved take. Slices overlap their beat a
 * little on both sides, so the render can cut anywhere near the beat (cuts shift
 * slightly with the playback speed) and still show the lips that match the voice.
 */
const LEAD_IN = 0.4;
const TAIL = 0.6;

export type TalkSlice = { start: number; end: number };

/** Per scene, the stretch of the take (at 1×, in seconds) its clip is lip-synced to. */
export function talkSlices(take: Pick<VoiceTake, "words" | "durationSeconds">, scenes: Pick<Scene, "caption">[]): TalkSlice[] {
  const timeline = buildTimeline(take.words, scenes.map((item) => item.caption), 1);
  const audioEnd = Math.max(take.durationSeconds, timeline.narrationEnd);
  return timeline.scenes.map((slot) => {
    const start = Math.max(0, slot.start - LEAD_IN);
    return { start: round(start), end: round(Math.min(audioEnd, Math.max(slot.end + TAIL, start + 2))) };
  });
}

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

export const talkPrompt = (visual: string) =>
  [
    "The person in the image talks directly to the camera, lips moving in sync with the speech.",
    visual,
    "Handheld phone selfie video, natural light, same framing throughout. No text, captions or logos.",
  ].join(" ");

export const voiceSliceKey = (projectId: string, sceneId: string) => `projects/${projectId}/scenes/${sceneId}-voice.mp3`;

/** Stores each scene's narration slice and returns public links Higgsfield can fetch. */
export async function publishSlices(projectId: string, take: Pick<VoiceTake, "audioKey">, jobs: { sceneId: string; slice: TalkSlice }[]) {
  const narration = await getMedia(take.audioKey);
  if (!narration) throw new Error(`missing narration ${take.audioKey}`);
  return Promise.all(
    jobs.map(async ({ sceneId, slice }) => {
      const key = voiceSliceKey(projectId, sceneId);
      await putMedia(key, await sliceAudio(narration, slice.start, slice.end));
      return publicMediaUrl(key);
    }),
  );
}
