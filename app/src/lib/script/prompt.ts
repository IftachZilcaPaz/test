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
6. Niqqud only where it prevents a misreading: the business name, foreign/brand names, and words with more than one plausible reading. Leave every other word unpointed. Dagesh ONLY in ב/כ/פ and only when the word needs the hard sound (בְּחִינָם, קִיבַּלְתִי); never a dagesh in any other letter (תַסְרִיט not תַּסְרִיט, נַסוּ not נַסּוּ) — it shifts the stress. Shuruk (וּ) is a vowel and stays. When a word is in the pronunciation lexicon, use exactly its pointed form. (Rules: docs/HEBREW_PRONUNCIATION.md)
7. Tone: ${tone}.
8. Visual continuity: the whole video follows ONE protagonist in ONE setting, like a short film. Define them in "look": "character" is an English description of one person who fits the audience (age range, appearance, clothing), "setting" is an English description of one place that fits the business, and "summary" is one short Hebrew sentence describing both for the customer. Every scene shows that same person and/or place: its "visual" describes only the action, framing and camera for that moment (e.g. "Close-up of the person smiling at her phone, handheld"). Never introduce a different main character or a crowd of new faces.
9. Give 4-6 scenes in narration order. "caption" is an EXACT contiguous quote of 3-7 words from the script — the on-screen caption quotes the narration word for word. "visual" is an English prompt for a cinematic vertical shot for that moment: natural light, and absolutely no text, letters, logos, signs or readable screens (video models garble Hebrew; we add captions ourselves).
10. "screen": the customer's own screenshots, when listed in the request, are numbered from 1. When a sentence talks about something a screenshot shows, set that scene's "screen" to its number (the screenshot is shown instead of a generated shot) and write the sentence so it matches what the screenshot shows. Use each screenshot at most once and only where it fits; keep at least two scenes with "screen": 0. When no screenshots are listed, every "screen" is 0.
11. "title" is a 2-4 word Hebrew name for the angle.

Pronunciation lexicon (plain = pointed):
${formatLexicon(lexicon) || "(empty)"}`;
}

export function userPrompt(brief: Brief, angle: Angle, screens: string[] = []): string {
  return [
    `Angle: ${angle}`,
    screens.length > 0 && `Screenshots (by number):\n${screens.map((label, index) => `${index + 1}. ${label || "צילום מסך"}`).join("\n")}`,
    `שם העסק: ${brief.business}`,
    `מה העסק עושה: ${brief.about}`,
    brief.audience && `למי הסרטון מיועד: ${brief.audience}`,
    brief.callToAction && `מה הצופה צריך לעשות בסוף: ${brief.callToAction}`,
  ]
    .filter(Boolean)
    .join("\n");
}
