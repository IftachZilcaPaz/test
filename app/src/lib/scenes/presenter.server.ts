import "server-only";
import type { Scene, VoiceTake } from "@/db/schema";
import { alignEnvelopes, loudnessEnvelope, sliceAudio } from "@/lib/media/audio.server";
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

/**
 * Wan follows the voice best over a longer take (a clip starts from the still image, so
 * a very short one barely gets going before the cut). Consecutive scenes are therefore
 * filmed as one clip of up to this many seconds, and each scene is cut from inside it.
 */
const MAX_TALK_SECONDS = 14;

export type TalkGroup = { scenes: Scene[]; slice: TalkSlice };

/** Groups the scenes to film (in order) into as few clips as fit, never across a scene that is not being filmed. */
export function talkGroups(slices: TalkSlice[], scenes: Scene[]): TalkGroup[] {
  const groups: TalkGroup[] = [];
  for (const item of [...scenes].sort((a, b) => a.position - b.position)) {
    const slice = slices[item.position] ?? { start: 0, end: 2 };
    const last = groups.at(-1);
    const adjacent = last && last.scenes.at(-1)!.position === item.position - 1;
    if (last && adjacent && slice.end - last.slice.start <= MAX_TALK_SECONDS) {
      last.scenes.push(item);
      last.slice = { start: last.slice.start, end: Math.max(last.slice.end, slice.end) };
    } else {
      groups.push({ scenes: [item], slice });
    }
  }
  return groups;
}

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

// Below this the clip's sound is not our narration (Wan replaced or garbled it).
const MIN_VOICE_MATCH = 0.6;

export type TalkCheck =
  | { ok: true; audioStart: number; delay: number; match: number }
  | { ok: false; reason: "no-audio" | "mismatch"; match?: number };

/**
 * Checks a finished presenter clip against the narration it was filmed to. Wan returns the
 * clip with the voice it lip-synced to, so matching that sound to our slice tells exactly
 * where the lips are: when the voice starts `delay` seconds into the clip, the clip is
 * re-anchored so the render shows the lips that go with each word.
 */
export async function checkTalkClip(clip: Uint8Array, narration: Uint8Array, audioStart: number): Promise<TalkCheck> {
  const recording = await loudnessEnvelope(clip);
  if (!recording) return { ok: false, reason: "no-audio" };
  const reference = await loudnessEnvelope(narration, audioStart, recording.length / 100);
  if (!reference) return { ok: false, reason: "no-audio" };
  const { delay, match } = alignEnvelopes(recording, reference);
  if (match < MIN_VOICE_MATCH) return { ok: false, reason: "mismatch", match };
  return { ok: true, audioStart: round(audioStart - delay), delay, match };
}
