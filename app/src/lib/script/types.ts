import { z } from "zod";
import { DURATIONS, TONE_VALUES } from "./hebrew";

export const briefSchema = z.object({
  business: z.string().trim().min(1, "חסר שם העסק").max(80, "שם העסק ארוך מדי"),
  about: z.string().trim().min(10, "ספרו במשפט אחד לפחות מה העסק עושה").max(1200, "הטקסט ארוך מדי (עד 1,200 תווים)"),
  audience: z.string().trim().max(300, "ארוך מדי (עד 300 תווים)"),
  callToAction: z.string().trim().max(200, "ארוך מדי (עד 200 תווים)"),
  tone: z.enum(TONE_VALUES),
  seconds: z.coerce.number().refine((value): value is (typeof DURATIONS)[number] =>
    (DURATIONS as readonly number[]).includes(value), "אורך לא נתמך"),
  lexicon: z.string().max(2000, "המילון ארוך מדי").default(""),
});
export type Brief = z.infer<typeof briefSchema>;

/** Shape of one script Claude returns (enforced with structured outputs). */
export const scriptOptionSchema = z.object({
  title: z.string(),
  script: z.string(),
  scenes: z.array(z.object({ caption: z.string(), visual: z.string() })),
});

export type ScriptScene = { caption: string; visual: string };
export type ScriptOption = { title: string; script: string; scenes: ScriptScene[] };

export type ScriptUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  demo: boolean;
};
