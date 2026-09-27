import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { demoOptions } from "./demo";
import { applyLexicon, captionQuotes, parseLexicon } from "./hebrew";
import { systemPrompt, userPrompt } from "./prompt";
import { scriptOptionsSchema, type Brief, type ScriptOption, type ScriptUsage } from "./types";

export const SCRIPT_MODEL = "claude-opus-5";
// Anthropic list prices, USD per token (Claude Opus 5: $5 / $25 per million).
const INPUT_USD = 5 / 1_000_000;
const OUTPUT_USD = 25 / 1_000_000;
// Output ceiling for three short scripts plus adaptive thinking; also the worst case we quote.
const MAX_OUTPUT_TOKENS = 6000;

export class ScriptWriterError extends Error {}

const client = () => (process.env.ANTHROPIC_API_KEY ? new Anthropic() : null);
export const isDemoMode = () => !process.env.ANTHROPIC_API_KEY;

const request = (brief: Brief) => {
  const lexicon = parseLexicon(brief.lexicon);
  return {
    lexicon,
    system: systemPrompt(brief, lexicon),
    messages: [{ role: "user" as const, content: userPrompt(brief) }],
  };
};

/** Upper-bound price quote shown before the user confirms. Counting tokens is free. */
export async function estimateScripts(brief: Brief): Promise<{ demo: boolean; maxUsd: number }> {
  const anthropic = client();
  if (!anthropic) return { demo: true, maxUsd: 0 };
  const { system, messages } = request(brief);
  const { input_tokens } = await anthropic.messages.countTokens({ model: SCRIPT_MODEL, system, messages });
  // +400 tokens covers the structured-output schema the real request adds.
  return { demo: false, maxUsd: (input_tokens + 400) * INPUT_USD + MAX_OUTPUT_TOKENS * OUTPUT_USD };
}

function clean(options: ScriptOption[], lexicon: ReturnType<typeof parseLexicon>): ScriptOption[] {
  return options.slice(0, 3).map((option) => {
    // Enforce the lexicon even if the model forgot it; keep only captions that truly quote the narration.
    const script = applyLexicon(option.script.trim(), lexicon);
    return {
      title: option.title.trim(),
      script,
      scenes: option.scenes.filter((scene) => scene.caption.trim() && captionQuotes(scene.caption, script)),
    };
  });
}

export async function writeScripts(brief: Brief): Promise<{ options: ScriptOption[]; usage: ScriptUsage }> {
  const { lexicon, system, messages } = request(brief);
  const anthropic = client();
  if (!anthropic) {
    return {
      options: clean(demoOptions(brief), lexicon),
      usage: { model: "demo", inputTokens: 0, outputTokens: 0, costUsd: 0, demo: true },
    };
  }

  let response;
  try {
    response = await anthropic.beta.messages.parse({
      model: SCRIPT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages,
      thinking: { type: "adaptive" },
      // Short creative copy: medium effort keeps cost low without hurting quality.
      output_config: { effort: "medium", format: betaZodOutputFormat(scriptOptionsSchema) },
      // A safety decline is re-run server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ScriptWriterError("מפתח Claude לא תקין. בדקו את ANTHROPIC_API_KEY ב-.env.local.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ScriptWriterError("יותר מדי בקשות ברגע זה. נסו שוב בעוד דקה.");
    }
    if (error instanceof Anthropic.BadRequestError && /credit|balance|billing/i.test(error.message)) {
      throw new ScriptWriterError("אין מספיק יתרה בחשבון Claude. טענו יתרה ב-console.anthropic.com.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[scripts] Claude API error", { status: error.status });
      throw new ScriptWriterError("Claude לא זמין כרגע. נסו שוב בעוד רגע.");
    }
    throw error;
  }

  const usage: ScriptUsage = {
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsd: response.usage.input_tokens * INPUT_USD + response.usage.output_tokens * OUTPUT_USD,
    demo: false,
  };
  if (response.stop_reason === "refusal") {
    throw new ScriptWriterError("Claude סירב לכתוב על הנושא הזה. נסחו את תיאור העסק אחרת ונסו שוב.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new ScriptWriterError("התשובה נקטעה באמצע. נסו שוב.");
  }
  return { options: clean(response.parsed_output.options, lexicon), usage };
}
