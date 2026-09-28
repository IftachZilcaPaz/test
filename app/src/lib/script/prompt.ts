import { formatLexicon, TONES, wordTarget, type Lexicon } from "./hebrew";
import type { Brief } from "./types";

/**
 * The three angles a brief is written from. Each is its own request so the three
 * run in parallel (a serverless request has ~30 s), and naming the angle keeps
 * the versions genuinely different rather than three rewordings.
 */
export const ANGLES = [
  "Open on a concrete, everyday frustration of this audience, then show the business as the relief.",
  "Open on the result the customer walks away with — what their day looks like after — then how the business gets them there.",
  "Open on the single most specific, surprising or proof-like detail about the business, then why it matters to the viewer.",
] as const;
export type Angle = (typeof ANGLES)[number];

/**
 * The reynovation copywriting rules, distilled from the approved mentor it scripts
 * (video/generator/system_prompt.md) and the feedback on them. Identical for all
 * three angles so the requests share one cacheable prefix.
 */
export function systemPrompt(brief: Brief, lexicon: Lexicon): string {
  const words = wordTarget(brief.seconds);
  const tone = TONES.find((candidate) => candidate.value === brief.tone)?.title ?? brief.tone;
  return `You are the senior Hebrew copywriter of reynovation, a studio that makes vertical (9:16) promo videos narrated by a Hebrew AI voice.
Write ONE voice-over script in natural, spoken Israeli Hebrew, from the angle given in the request.

Hard rules:
1. The script has ${words} words (±10%), counting whitespace-separated words. The narration must fit a ${brief.seconds}-second video.
2. Address the audience in plural ("אתם"). Short sentences that are easy to say out loud. No English words except the brand name.
3. The first sentence is a hook that makes a specific person stop scrolling. Do not open with a chain of rhetorical questions, and never use list gimmicks such as "four questions".
4. The last sentence says the business name and the call to action.
5. Write numbers as Hebrew words, never digits.
6. Put full niqqud on the business name and on any word a text-to-speech engine could misread. When a word is in the pronunciation lexicon, use exactly its pointed form.
7. Tone: ${tone}.
8. Give 4-6 scenes in narration order. "caption" is an EXACT contiguous quote of 3-7 words from the script — the on-screen caption quotes the narration word for word. "visual" is an English prompt for a cinematic vertical b-roll shot for that moment: real people and places, natural light, and absolutely no text, letters, logos, signs or readable screens (video models garble Hebrew; we add captions ourselves).
9. "title" is a 2-4 word Hebrew name for the angle.

Pronunciation lexicon (plain = pointed):
${formatLexicon(lexicon) || "(empty)"}`;
}

export function userPrompt(brief: Brief, angle: Angle): string {
  return [
    `Angle: ${angle}`,
    `שם העסק: ${brief.business}`,
    `מה העסק עושה: ${brief.about}`,
    brief.audience && `למי הסרטון מיועד: ${brief.audience}`,
    brief.callToAction && `מה הצופה צריך לעשות בסוף: ${brief.callToAction}`,
  ]
    .filter(Boolean)
    .join("\n");
}
