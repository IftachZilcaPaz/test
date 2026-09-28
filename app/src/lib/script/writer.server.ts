import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { demoOptions } from "./demo";
import { applyLexicon, captionQuotes, parseLexicon } from "./hebrew";
import { ANGLES, systemPrompt, userPrompt, type Angle } from "./prompt";
import type { VideoStyle } from "@/db/schema";
import { scriptOptionSchema, type Brief, type ScriptOption, type ScriptUsage } from "./types";

export const SCRIPT_MODEL = "claude-opus-5";
// Anthropic list prices, USD per token (Claude Opus 5: $5 / $25 per million).
const INPUT_USD = 5 / 1_000_000;
const OUTPUT_USD = 25 / 1_000_000;
// Output ceiling for one short script plus adaptive thinking; three of these are the worst case we quote.
const MAX_OUTPUT_TOKENS = 3000;
// Serverless hosts cut a request at 30 s (Netlify). The three scripts are written in
// parallel and each gets this long, leaving room for the quote, the database and the reply.
const SCRIPT_TIMEOUT_MS = 24_000;

export class ScriptWriterError extends Error {}

const client = () => (process.env.ANTHROPIC_API_KEY ? new Anthropic() : null);
export const isDemoMode = () => !process.env.ANTHROPIC_API_KEY;

const request = (brief: Brief, angle: Angle, screens: string[], style: VideoStyle) => {
  const lexicon = parseLexicon(brief.lexicon);
  return {
    lexicon,
    system: systemPrompt(brief, lexicon, style),
    messages: [{ role: "user" as const, content: userPrompt(brief, angle, screens) }],
  };
};

/** Upper-bound price quote shown before the user confirms. Counting tokens is free. */
export async function estimateScripts(brief: Brief, screens: string[] = [], style: VideoStyle = "character"): Promise<{ demo: boolean; maxUsd: number }> {
  const anthropic = client();
  if (!anthropic) return { demo: true, maxUsd: 0 };
  const { system, messages } = request(brief, ANGLES[0], screens, style);
  const { input_tokens } = await anthropic.messages.countTokens({ model: SCRIPT_MODEL, system, messages });
  // +400 tokens covers the structured-output schema the real request adds; angles differ by a few tokens.
  const perScript = (input_tokens + 400) * INPUT_USD + MAX_OUTPUT_TOKENS * OUTPUT_USD;
  return { demo: false, maxUsd: perScript * ANGLES.length };
}

// Long dashes read as foreign in Hebrew copy; a comma does the same job. Applied to the
// script and its captions alike, so captions still quote the narration exactly.
const noDashes = (text: string) => text.replace(/\s*[—–]\s*/gu, ", ").replace(/^, |, $/gu, "").trim();

function clean(options: ScriptOption[], lexicon: ReturnType<typeof parseLexicon>, screenCount: number): ScriptOption[] {
  return options.slice(0, ANGLES.length).map((option) => {
    // Enforce the lexicon even if the model forgot it; keep only captions that truly quote the narration.
    const script = applyLexicon(noDashes(option.script), lexicon);
    const used = new Set<number>();
    const scenes = option.scenes
      .map((scene) => ({ ...scene, caption: noDashes(scene.caption) }))
      .filter((scene) => scene.caption && captionQuotes(scene.caption, script))
      .map((scene) => {
        // A screenshot number must exist and appear once; anything else becomes a generated shot.
        const screen = scene.screen && scene.screen >= 1 && scene.screen <= screenCount && !used.has(scene.screen) ? scene.screen : 0;
        if (screen) used.add(screen);
        return { caption: scene.caption, visual: scene.visual, screen };
      });
    const look = option.look && { ...option.look, summary: noDashes(option.look.summary) };
    return { title: noDashes(option.title), script, look, scenes };
  });
}

/** Maps SDK failures to messages a customer can act on. */
function writerError(error: unknown): ScriptWriterError {
  if (error instanceof ScriptWriterError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ScriptWriterError("הכתיבה לקחה יותר מדי זמן. נסו שוב, לא חויבתם.");
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new ScriptWriterError("מפתח Claude לא תקין. בדקו את ANTHROPIC_API_KEY.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ScriptWriterError("יותר מדי בקשות ברגע זה. נסו שוב בעוד דקה.");
  }
  if (error instanceof Anthropic.BadRequestError && /credit|balance|billing/i.test(error.message)) {
    return new ScriptWriterError("אין מספיק יתרה בחשבון Claude. טענו יתרה ב-console.anthropic.com.");
  }
  if (error instanceof Anthropic.APIError) {
    console.error("[scripts] Claude API error", { status: error.status });
    return new ScriptWriterError("Claude לא זמין כרגע. נסו שוב בעוד רגע.");
  }
  console.error("[scripts] unexpected error", error instanceof Error ? error.message : error);
  return new ScriptWriterError("משהו השתבש בכתיבה. נסו שוב.");
}

type Written = { option: ScriptOption; model: string; inputTokens: number; outputTokens: number };

async function writeOne(anthropic: Anthropic, brief: Brief, angle: Angle, screens: string[], style: VideoStyle): Promise<Written> {
  const { system, messages } = request(brief, angle, screens, style);
  const response = await anthropic.beta.messages.parse(
    {
      model: SCRIPT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages,
      thinking: { type: "adaptive" },
      // Short creative copy: medium effort keeps cost low without hurting quality.
      output_config: { effort: "medium", format: betaZodOutputFormat(scriptOptionSchema) },
      // A safety decline is re-run server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    // A retry would not fit in the request window; a failed angle is simply left out.
    { timeout: SCRIPT_TIMEOUT_MS, maxRetries: 0 },
  );
  if (response.stop_reason === "refusal") {
    throw new ScriptWriterError("Claude סירב לכתוב על הנושא הזה. נסחו את תיאור העסק אחרת ונסו שוב.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new ScriptWriterError("התשובה נקטעה באמצע. נסו שוב.");
  }
  return {
    option: response.parsed_output,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Writes one script per angle, in parallel. Whatever finishes is kept (one or two
 * versions beat none); the customer is charged only for scripts they receive.
 */
export async function writeScripts(
  brief: Brief,
  screens: string[] = [],
  style: VideoStyle = "character",
): Promise<{ options: ScriptOption[]; usage: ScriptUsage }> {
  const lexicon = parseLexicon(brief.lexicon);
  const anthropic = client();
  if (!anthropic) {
    return {
      options: clean(demoOptions(brief, screens.length), lexicon, screens.length),
      usage: { model: "demo", inputTokens: 0, outputTokens: 0, costUsd: 0, demo: true },
    };
  }

  const started = Date.now();
  const results = await Promise.allSettled(ANGLES.map((angle) => writeOne(anthropic, brief, angle, screens, style)));
  const written = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const failures = results.flatMap((result) => (result.status === "rejected" ? [writerError(result.reason)] : []));
  console.info("[scripts] written", { ok: written.length, failed: failures.length, ms: Date.now() - started });
  if (written.length === 0) throw failures[0] ?? new ScriptWriterError("משהו השתבש בכתיבה. נסו שוב.");

  const inputTokens = written.reduce((sum, entry) => sum + entry.inputTokens, 0);
  const outputTokens = written.reduce((sum, entry) => sum + entry.outputTokens, 0);
  return {
    options: clean(
      written.map((entry) => entry.option),
      lexicon,
      screens.length,
    ),
    usage: {
      model: written[0]!.model,
      inputTokens,
      outputTokens,
      costUsd: inputTokens * INPUT_USD + outputTokens * OUTPUT_USD,
      demo: false,
    },
  };
}
