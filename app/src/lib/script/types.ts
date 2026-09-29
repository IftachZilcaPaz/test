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
  look: z.object({ summary: z.string(), character: z.string(), setting: z.string() }),
  scenes: z.array(z.object({ caption: z.string(), visual: z.string(), screen: z.number().int(), onCamera: z.boolean() })),
});

/**
 * `screen` is the 1-based number of the customer's screenshot shown in this beat; 0 (or absent) = generated shot.
 * `onCamera` (presenter style) is true when the presenter says the line to the camera; false for a silent
 * cutaway shot of her while her voice continues. Absent on older scripts, which were all on camera.
 */
export type ScriptScene = { caption: string; visual: string; screen?: number; onCamera?: boolean };
/**
 * The one character and place the whole video follows. `summary` is Hebrew for the
 * customer; `character` and `setting` are English prompts. Absent on drafts written
 * before looks existed.
 */
export type ScriptLook = { summary: string; character: string; setting: string };
export type ScriptOption = { title: string; script: string; look?: ScriptLook; scenes: ScriptScene[] };

export type ScriptUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  demo: boolean;
};
