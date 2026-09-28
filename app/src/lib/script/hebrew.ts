/**
 * Pure Hebrew-script helpers shared by server and browser. The constants are the
 * ones measured on real renders (video/pricing.json): the narrator speaks
 * ~1.85 words/second, the finished cut plays at ×1.25, and the final 3.8 s is
 * the end card, which carries no narration.
 */
export const WORDS_PER_SECOND = 1.85;
export const PLAYBACK_SPEED = 1.25;
/** Narration speeds the customer can pick at render time; ×1.25 (the default) suits Reels and TikTok. */
export const SPEEDS = [1, 1.1, 1.25] as const;
export type Speed = (typeof SPEEDS)[number];
export const isSpeed = (value: number): value is Speed => (SPEEDS as readonly number[]).includes(value);
export const END_CARD_SECONDS = 3.8;

export const DURATIONS = [15, 20, 30] as const;
export type Duration = (typeof DURATIONS)[number];

export const TONES = [
  { value: "warm", title: "חם ואישי" },
  { value: "pro", title: "מקצועי" },
  { value: "energetic", title: "אנרגטי" },
  { value: "luxury", title: "יוקרתי" },
] as const;
export type Tone = (typeof TONES)[number]["value"];
export const TONE_VALUES = TONES.map((tone) => tone.value) as [Tone, ...Tone[]];

export function wordTarget(seconds: number): number {
  return Math.round(Math.max(seconds * PLAYBACK_SPEED - END_CARD_SECONDS, 5) * WORDS_PER_SECOND);
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

/** Seconds the finished (sped-up) video needs for this narration, end card included. */
export function estimateSeconds(text: string): number {
  return Math.round((countWords(text) / WORDS_PER_SECOND / PLAYBACK_SPEED + END_CARD_SECONDS) * 10) / 10;
}

export type LengthVerdict = "short" | "ok" | "long";
export function lengthVerdict(words: number, target: number): LengthVerdict {
  const ratio = words / target;
  return ratio > 1.15 ? "long" : ratio < 0.8 ? "short" : "ok";
}

const NIQQUD = /[֑-ׇ]/gu;
export const stripNiqqud = (text: string) => text.replace(NIQQUD, "");

export type Lexicon = Record<string, string>;

/** Parses "word = pointed" lines. A line is kept only when the pointed form spells the same word. */
export function parseLexicon(source: string): Lexicon {
  const lexicon: Lexicon = {};
  for (const line of source.split("\n")) {
    const [rawWord, rawPointed] = line.split("=");
    const word = stripNiqqud(rawWord?.trim() ?? "");
    const pointed = rawPointed?.trim() ?? "";
    if (word && pointed && stripNiqqud(pointed) === word) lexicon[word] = pointed;
  }
  return lexicon;
}

export const formatLexicon = (lexicon: Lexicon) =>
  Object.entries(lexicon)
    .map(([word, pointed]) => `${word} = ${pointed}`)
    .join("\n");

const PREFIXES = "והבלמשכ";
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What the narrator receives: lexicon words (also behind a one-letter prefix) replaced by their pointed form. */
export function applyLexicon(text: string, lexicon: Lexicon): string {
  let spoken = text;
  for (const word of Object.keys(lexicon).sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(
      `(^|[\\s"'(\\[׳״-])([${PREFIXES}]?)${escapeRegExp(word)}(?=$|[\\s.,!?:;"')\\]׳״-])`,
      "gu",
    );
    spoken = spoken.replace(pattern, (_match, lead: string, prefix: string) => `${lead}${prefix}${lexicon[word]}`);
  }
  return spoken;
}

/** A caption must quote the narration word for word (ignoring niqqud). */
export const captionQuotes = (caption: string, script: string) =>
  stripNiqqud(script).includes(stripNiqqud(caption.trim()));
