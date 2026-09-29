"use server";

import { and, count, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { project, scriptDraft, voiceTake } from "@/db/schema";
import { customerPriceIls } from "@/lib/pricing";
import { writerBrief } from "@/lib/projects/brief.server";
import { approvedMaterial, approvedScript, currentNarration, getOwnedProject, latestRender, listScenes, scriptScreens } from "@/lib/projects.server";
import { estimateLook, isSceneDemoMode, SceneError } from "@/lib/scenes/higgsfield.server";
import { isStale } from "@/lib/scenes/stale";
import { wordTarget } from "@/lib/script/hebrew";
import { ANGLES } from "@/lib/script/prompt";
import { estimateScripts, ScriptWriterError, writeScripts } from "@/lib/script/writer.server";
import { requireUser } from "@/lib/session";
import { isVoiceId, voiceCostUsd } from "@/lib/voice/voices";
import { assertCanPay, balance, charge, InsufficientFunds } from "@/lib/wallet.server";
import { recordNarration } from "./voice-actions";

/**
 * The fast track: the customer approves twice and the app does the rest.
 * 1. Script, narration and character (cheap), then a stop to listen and look.
 * 2. The exact price of the scenes; then filming, approving and assembling run on their own.
 * Each step here is short (one request each) and safe to repeat: the page drives them in order
 * and can resume after a reload from quickStatus.
 */

// The fast track writes one script, from the first angle: a frustration, then the relief.
const QUICK_ANGLES = [ANGLES[0]];

const FEMALE_VOICE = "EXAVITQu4vr4xnSDxMaL"; // שרה
const MALE_VOICE = "CwhRBWXzGAHq8TQ4Fs17"; // רוג'ר

/** A voice that matches the person the script describes (the presenter speaks in her own voice). */
function voiceFor(character: string | undefined): string {
  if (character && /\b(woman|female|girl|lady|she)\b/i.test(character)) return FEMALE_VOICE;
  if (character && /\b(man|male|guy|he)\b/i.test(character)) return MALE_VOICE;
  return FEMALE_VOICE;
}

export type QuickQuote = { demo: boolean; priceIls: number; balanceIls: number } | { error: string };

/** Upper bound for step 1: one script, its narration (from the target length) and the character image. */
export async function quoteQuickStart(projectId: string): Promise<QuickQuote> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  const brief = item && (await writerBrief(item));
  if (!item || !brief) return { error: "קודם ממלאים ושומרים את הפרטים על העסק." };
  try {
    const script = await estimateScripts(brief, await scriptScreens(item), item.style, QUICK_ANGLES);
    // Generous: 20% over the target length, six characters a word including the space.
    const voiceUsd = voiceCostUsd("x".repeat(Math.ceil(wordTarget(brief.seconds) * 1.2 * 6)));
    const lookUsd = !isSceneDemoMode() && !item.lookImageKey ? await estimateLook("Photorealistic vertical photo shot on an iPhone") : 0;
    const priceIls = customerPriceIls(script.maxUsd) + customerPriceIls(voiceUsd) + customerPriceIls(lookUsd);
    return { demo: script.demo, priceIls, balanceIls: await balance(user.id) };
  } catch (error) {
    console.error("[quick] quote failed", error instanceof Error ? error.message : error);
    return { error: error instanceof SceneError ? error.message : "לא הצלחנו לחשב מחיר כרגע. נסו שוב." };
  }
}

/** Writes one script and approves it, unless the project already has an approved script. */
export async function quickScript(projectId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  const brief = item && (await writerBrief(item));
  if (!item || !brief) return { error: "קודם ממלאים ושומרים את הפרטים על העסק." };
  if ((await approvedScript(projectId)) !== null) return {};
  const [{ drafts }] = await db.select({ drafts: count() }).from(scriptDraft).where(eq(scriptDraft.projectId, projectId));
  if (drafts >= 30) return { error: "הגעתם למספר הגרסאות המרבי בפרויקט הזה." };
  try {
    const screens = await scriptScreens(item);
    const quote = await estimateScripts(brief, screens, item.style, QUICK_ANGLES);
    await assertCanPay(user.id, customerPriceIls(quote.maxUsd));
    const { options, usage } = await writeScripts(brief, screens, item.style, QUICK_ANGLES);
    const chosen = options[0]!;
    const [draft] = await db
      .insert(scriptDraft)
      .values({ projectId, options, ...usage, chosenIndex: 0, chosenScript: chosen.script })
      .returning({ id: scriptDraft.id });
    await charge(user.id, customerPriceIls(usage.costUsd), "כתיבת תסריט", projectId, `script:${draft!.id}`);
    await db
      .update(project)
      .set({ status: "voice", voiceId: item.voiceId && isVoiceId(item.voiceId) ? item.voiceId : voiceFor(chosen.look?.character) })
      .where(eq(project.id, projectId));
  } catch (error) {
    if (error instanceof ScriptWriterError || error instanceof InsufficientFunds) return { error: error.message };
    console.error("[quick] script failed", error instanceof Error ? error.message : error);
    return { error: "משהו השתבש בכתיבה. נסו שוב." };
  }
  revalidatePath(`/app/projects/${projectId}`);
  return {};
}

/** Records the narration of the approved script, unless a take of the current text already exists. */
export async function quickVoice(projectId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  if (!item) return { error: "הפרויקט לא נמצא." };
  if (!item.voiceId || !isVoiceId(item.voiceId)) {
    const { option } = await approvedMaterial(projectId);
    await db.update(project).set({ voiceId: voiceFor(option?.look?.character) }).where(eq(project.id, projectId));
  }
  if (await currentTake(projectId, item.lexicon)) return {};
  return recordNarration(projectId);
}

async function currentTake(projectId: string, lexicon: string) {
  const text = await currentNarration(projectId, lexicon);
  if (text === null) return null;
  const [take] = await db
    .select({ id: voiceTake.id, approved: voiceTake.approved })
    .from(voiceTake)
    .where(and(eq(voiceTake.projectId, projectId), eq(voiceTake.spokenText, text)))
    .orderBy(desc(voiceTake.createdAt))
    .limit(1);
  return take ?? null;
}

export type QuickStatus = {
  script: boolean;
  take: { id: string; approved: boolean } | null;
  look: "none" | "generating" | "ready";
  scenes: { total: number; ready: number; generating: number; failed: number; stale: number; demo: number };
  render: "none" | "rendering" | "done" | "failed";
};

/** Where the project stands, for the fast track to pick its next step. */
export async function quickStatus(projectId: string): Promise<QuickStatus | { error: string }> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  if (!item) return { error: "הפרויקט לא נמצא." };
  const [script, take, scenes, render] = await Promise.all([
    approvedScript(projectId),
    currentTake(projectId, item.lexicon),
    listScenes(projectId),
    latestRender(projectId),
  ]);
  return {
    script: script !== null,
    take,
    look: item.lookImageKey ? "ready" : item.lookRequestId ? "generating" : "none",
    scenes: {
      total: scenes.length,
      ready: scenes.filter((entry) => entry.status === "ready").length,
      generating: scenes.filter((entry) => entry.status === "generating").length,
      failed: scenes.filter((entry) => entry.status === "failed").length,
      stale: scenes.filter((entry) => isStale(entry, take?.id)).length,
      demo: scenes.filter((entry) => entry.demo && entry.status === "ready").length,
    },
    render: render?.status ?? "none",
  };
}
