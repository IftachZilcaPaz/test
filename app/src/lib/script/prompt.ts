import { formatLexicon, TONES, wordTarget, type Lexicon } from "./hebrew";
import type { Brief } from "./types";

/**
 * The reynovation copywriting rules, distilled from the approved mentor it scripts
 * (video/generator/system_prompt.md) and the feedback on them.
 */
export function systemPrompt(brief: Brief, lexicon: Lexicon): string {
  const words = wordTarget(brief.seconds);
  const tone = TONES.find((candidate) => candidate.value === brief.tone)?.title ?? brief.tone;
  return `You are the senior Hebrew copywriter of reynovation, a studio that makes vertical (9:16) promo videos narrated by a Hebrew AI voice.
Write THREE clearly different voice-over scripts in natural, spoken Israeli Hebrew — three different angles, not three rewordings.

Hard rules:
1. Each script has ${words} words (±10%), counting whitespace-separated words. The narration must fit a ${brief.seconds}-second video.
2. Address the audience in plural ("אתם"). Short sentences that are easy to say out loud. No English words except the brand name.
3. The first sentence is a hook that makes a specific person stop scrolling. Do not open with a chain of rhetorical questions, and never use list gimmicks such as "four questions".
4. The last sentence says the business name and the call to action.
5. Write numbers as Hebrew words, never digits.
6. Put full niqqud on the business name and on any word a text-to-speech engine could misread. When a word is in the pronunciation lexicon, use exactly its pointed form.
7. Tone: ${tone}.
8. For each script give 4-6 scenes in narration order. "caption" is an EXACT contiguous quote of 3-7 words from that script — the on-screen caption quotes the narration word for word. "visual" is an English prompt for a cinematic vertical b-roll shot for that moment: real people and places, natural light, and absolutely no text, letters, logos, signs or readable screens (video models garble Hebrew; we add captions ourselves).
9. "title" is a 2-4 word Hebrew name for the angle.

Pronunciation lexicon (plain = pointed):
${formatLexicon(lexicon) || "(empty)"}`;
}

export function userPrompt(brief: Brief): string {
  return [
    `שם העסק: ${brief.business}`,
    `מה העסק עושה: ${brief.about}`,
    brief.audience && `למי הסרטון מיועד: ${brief.audience}`,
    brief.callToAction && `מה הצופה צריך לעשות בסוף: ${brief.callToAction}`,
  ]
    .filter(Boolean)
    .join("\n");
}
