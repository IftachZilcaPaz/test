import { END_CARD_SECONDS, PLAYBACK_SPEED, stripNiqqud } from "@/lib/script/hebrew";
import type { TimedWord } from "@/lib/voice/voices";

/**
 * Builds the video timeline from the narration's word timings. Scene i starts
 * when its caption's first word is spoken; captions stay up until their last
 * word ends. Everything is returned in finished-video time (after ×1.25).
 */
export type TimelineScene = {
  index: number;
  start: number;
  end: number;
  caption: { text: string; start: number; end: number } | null;
};

export type Timeline = {
  scenes: TimelineScene[];
  narrationEnd: number;
  endCard: { start: number; end: number };
  total: number;
};

const normalize = (word: string) => stripNiqqud(word).replace(/[^\p{L}\p{N}]/gu, "");

const PREFIXES = "והבלמשכ";

/** Shortest time a scene may stay on screen; faster cuts read as glitches. */
export const MIN_SCENE_SECONDS = 1.2;

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * Nudges cut points so every slot lasts at least MIN_SCENE_SECONDS while staying
 * as close as possible to the spoken cues. Falls back to even slots when the
 * narration is too short to fit them all.
 */
function spaceCuts(cuts: number[], end: number): number[] {
  const count = cuts.length;
  if (end < count * MIN_SCENE_SECONDS) return cuts.map((_, index) => round((end / count) * index));
  const spaced = [...cuts];
  for (let i = 1; i < count; i++) spaced[i] = Math.max(spaced[i]!, spaced[i - 1]! + MIN_SCENE_SECONDS);
  for (let i = count - 1; i >= 1; i--) {
    spaced[i] = Math.min(spaced[i]!, (i + 1 < count ? spaced[i + 1]! : end) - MIN_SCENE_SECONDS);
  }
  return spaced.map(round);
}

/** Same word, allowing one Hebrew prefix letter on either side ("ומקום" ≈ "מקום"). */
function sameWord(spoken: string, written: string): boolean {
  if (spoken === written) return true;
  const [longer, shorter] = spoken.length > written.length ? [spoken, written] : [written, spoken];
  return longer.length === shorter.length + 1 && PREFIXES.includes(longer[0]!) && longer.slice(1) === shorter;
}

/** Index of the first word of `phrase` in `words`, searching from `from`. -1 if absent. */
function locate(words: string[], phrase: string[], from: number): number {
  if (phrase.length === 0) return -1;
  for (let i = from; i <= words.length - phrase.length; i++) {
    if (phrase.every((part, offset) => sameWord(words[i + offset]!, part))) return i;
  }
  return -1;
}

export function buildTimeline(words: TimedWord[], captions: string[], speed = PLAYBACK_SPEED): Timeline {
  const spoken = words.map((word) => normalize(word.word));
  const toFinal = (seconds: number) => Math.round((seconds / speed) * 1000) / 1000;
  const narrationEnd = toFinal(words.at(-1)?.end ?? 0);

  let cursor = 0;
  const located = captions.map((text) => {
    const phrase = text.split(/\s+/u).map(normalize).filter(Boolean);
    const at = locate(spoken, phrase, cursor);
    if (at < 0) return null;
    cursor = at + phrase.length;
    return { text, first: at, last: at + phrase.length - 1 };
  });

  // Scenes whose caption wasn't found still get a slot, spread evenly between found neighbours.
  const count = Math.max(captions.length, 1);
  const starts: number[] = located.map((hit, index) =>
    index === 0 ? 0 : hit ? toFinal(words[hit.first]!.start) : Number.NaN,
  );
  for (let i = 1; i < count; i++) {
    if (Number.isNaN(starts[i]!)) {
      const next = starts.slice(i + 1).find((value) => !Number.isNaN(value)) ?? narrationEnd;
      starts[i] = Math.round((starts[i - 1]! + (next - starts[i - 1]!) / 2) * 1000) / 1000;
    }
  }

  // Captions follow the voice exactly; only the visual cuts are spaced out.
  const cuts = spaceCuts(starts, narrationEnd);
  const scenes: TimelineScene[] = Array.from({ length: count }, (_, index) => {
    const hit = located[index];
    const nextCaption = index + 1 < count ? starts[index + 1]! : narrationEnd + 0.35;
    return {
      index,
      start: cuts[index]!,
      end: index + 1 < count ? cuts[index + 1]! : narrationEnd,
      caption: hit
        ? {
            text: hit.text,
            start: toFinal(words[hit.first]!.start),
            end: round(Math.min(toFinal(words[hit.last]!.end) + 0.35, nextCaption)),
          }
        : null,
    };
  });

  const endCard = { start: narrationEnd, end: narrationEnd + END_CARD_SECONDS };
  return { scenes, narrationEnd, endCard, total: endCard.end };
}

/** Seedance clip length to request for a scene slot (the API accepts 4-15 s). */
export const clipSecondsFor = (slot: number) => Math.min(15, Math.max(4, Math.ceil(slot + 0.5)));
