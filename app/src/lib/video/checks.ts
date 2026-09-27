import { captionQuotes } from "@/lib/script/hebrew";
import { MIN_SCENE_SECONDS, type Timeline } from "./timeline";

/** Automatic QA shown next to every render, in plain Hebrew. */
export type RenderCheck = { ok: boolean; label: string };

export function renderChecks(timeline: Timeline, captions: string[], narration: string): RenderCheck[] {
  const found = timeline.scenes.filter((slot) => slot.caption).length;
  const quoted = captions.filter((caption) => captionQuotes(caption, narration)).length;
  const shortest = Math.min(...timeline.scenes.map((slot) => slot.end - slot.start));
  return [
    { ok: quoted === captions.length, label: `כל כיתוב מצטט את הקריינות מילה במילה (${quoted}/${captions.length})` },
    { ok: found === captions.length, label: `כל כיתוב מסונכרן לרגע שבו אומרים אותו (${found}/${captions.length})` },
    { ok: shortest >= MIN_SCENE_SECONDS - 0.001, label: `כל סצנה נשארת על המסך לפחות ${MIN_SCENE_SECONDS} שניות (הקצרה: ${shortest.toFixed(1)})` },
    { ok: timeline.total <= 61, label: `אורך הסרטון ${timeline.total.toFixed(1)} שניות (עד דקה מתאים לרילס וטיקטוק)` },
  ];
}
