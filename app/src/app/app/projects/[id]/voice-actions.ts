"use server";

import { and, count, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { project, voiceTake } from "@/db/schema";
import { vouch } from "@/lib/pronunciation/shared.server";
import { currentNarration, getOwnedProject } from "@/lib/projects.server";
import { rewindProject } from "@/lib/projects/rewind.server";
import { ensureScenes } from "@/lib/scenes/ensure.server";
import { customerPriceIls } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { assertCanPay, balance, charge, InsufficientFunds } from "@/lib/wallet.server";
import { deleteMedia, putMedia } from "@/lib/storage.server";
import { isVoiceDemoMode, synthesize, VoiceError } from "@/lib/voice/tts.server";
import { isVoiceId, voiceCostUsd } from "@/lib/voice/voices";

const MAX_TAKES_PER_PROJECT = 20;

export async function selectVoice(projectId: string, voiceId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!isVoiceId(voiceId)) return { error: "קול לא מוכר." };
  const item = await getOwnedProject(user.id, projectId);
  if (!item) return { error: "הפרויקט לא נמצא." };
  await db.update(project).set({ voiceId }).where(eq(project.id, projectId));
  revalidatePath(`/app/projects/${projectId}`);
  return {};
}

type Narration = { error: string } | { voiceId: string; text: string };

async function narrationFor(userId: string, projectId: string): Promise<Narration> {
  const item = await getOwnedProject(userId, projectId);
  if (!item) return { error: "הפרויקט לא נמצא." };
  if (!item.voiceId || !isVoiceId(item.voiceId)) return { error: "קודם בוחרים קול." };
  // Re-applies the lexicon: the customer may have edited the approved text by hand.
  const text = await currentNarration(projectId, item.lexicon);
  if (text === null) return { error: "קודם מאשרים תסריט." };
  return { voiceId: item.voiceId, text };
}

export type VoiceQuote =
  | { demo: boolean; usd: number; characters: number; duplicate: boolean; balanceIls: number }
  | { error: string };

// A retake of the exact same text in the same voice within this window is almost
// certainly a double click, so it is refused instead of billed twice.
const DUPLICATE_WINDOW_MS = 60_000;

async function latestTake(projectId: string) {
  const [take] = await db
    .select({ voiceId: voiceTake.voiceId, spokenText: voiceTake.spokenText, createdAt: voiceTake.createdAt })
    .from(voiceTake)
    .where(eq(voiceTake.projectId, projectId))
    .orderBy(desc(voiceTake.createdAt))
    .limit(1);
  return take ?? null;
}

/** ElevenLabs bills per character, so the price is exact before we ask. */
export async function quoteNarration(projectId: string): Promise<VoiceQuote> {
  const user = await requireUser();
  const narration = await narrationFor(user.id, projectId);
  if ("error" in narration) return { error: narration.error };
  const [{ same }] = await db
    .select({ same: count() })
    .from(voiceTake)
    .where(
      and(
        eq(voiceTake.projectId, projectId),
        eq(voiceTake.voiceId, narration.voiceId),
        eq(voiceTake.spokenText, narration.text),
      ),
    );
  return {
    demo: isVoiceDemoMode(),
    usd: voiceCostUsd(narration.text),
    characters: narration.text.length,
    duplicate: same > 0,
    balanceIls: await balance(user.id),
  };
}

export async function recordNarration(projectId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const narration = await narrationFor(user.id, projectId);
  if ("error" in narration) return { error: narration.error };
  if (isVoiceDemoMode()) return { error: "עוד לא חובר מפתח ElevenLabs, אז אי אפשר להקריא." };

  const [{ takes }] = await db.select({ takes: count() }).from(voiceTake).where(eq(voiceTake.projectId, projectId));
  if (takes >= MAX_TAKES_PER_PROJECT) return { error: "הגעתם למספר ההקלטות המרבי בפרויקט הזה." };
  const last = await latestTake(projectId);
  if (
    last &&
    last.voiceId === narration.voiceId &&
    last.spokenText === narration.text &&
    Date.now() - last.createdAt.getTime() < DUPLICATE_WINDOW_MS
  ) {
    return { error: "ההקראה הזו בדיוק נוצרה עכשיו, והיא מופיעה למטה." };
  }

  const price = customerPriceIls(voiceCostUsd(narration.text));
  try {
    await assertCanPay(user.id, price);
    const { audio, words, duration } = await synthesize(narration.text, narration.voiceId);
    const id = crypto.randomUUID();
    const audioKey = `projects/${projectId}/voice/${id}.mp3`;
    await putMedia(audioKey, audio);
    await db.insert(voiceTake).values({
      id,
      projectId,
      voiceId: narration.voiceId,
      spokenText: narration.text,
      audioKey,
      words,
      durationSeconds: duration,
      characters: narration.text.length,
      costUsd: voiceCostUsd(narration.text),
    });
    await charge(user.id, price, "הקראת התסריט", projectId, `take:${id}`);
  } catch (error) {
    if (error instanceof VoiceError || error instanceof InsufficientFunds) return { error: error.message };
    console.error("[voice] record failed", error instanceof Error ? error.message : error);
    return { error: "משהו השתבש בהקלטה. נסו שוב." };
  }
  revalidatePath(`/app/projects/${projectId}`);
  return {};
}

export async function approveTake(takeId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(takeId);
  if (!id.success) return { error: "ההקלטה לא נמצאה." };
  const [row] = await db
    .select({ projectId: project.id, status: project.status, lexicon: project.lexicon, spokenText: voiceTake.spokenText })
    .from(voiceTake)
    .innerJoin(project, eq(voiceTake.projectId, project.id))
    .where(and(eq(voiceTake.id, id.data), eq(project.userId, user.id)))
    .limit(1);
  if (!row) return { error: "ההקלטה לא נמצאה." };
  if (row.spokenText !== (await currentNarration(row.projectId, row.lexicon))) {
    return { error: "ההקראה הזו הוקלטה מנוסח קודם של התסריט או של המילון. הקריאו שוב." };
  }
  await db.batch([
    db.update(voiceTake).set({ approved: false }).where(eq(voiceTake.projectId, row.projectId)),
    db.update(voiceTake).set({ approved: true }).where(eq(voiceTake.id, id.data)),
    db
      .update(project)
      .set({ status: row.status === "voice" ? "scenes" : row.status })
      .where(eq(project.id, row.projectId)),
  ]);
  // The customer heard this narration and approved it: its spellings are vouched for.
  await vouch(user.id, row.lexicon);
  await ensureScenes(row.projectId);
  revalidatePath(`/app/projects/${row.projectId}`);
  return {};
}

/** Takes back the narration approval so the customer can record it again. */
export async function unapproveTake(takeId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(takeId);
  if (!id.success) return { error: "ההקראה לא נמצאה." };
  const [row] = await db
    .select({ projectId: project.id })
    .from(voiceTake)
    .innerJoin(project, eq(voiceTake.projectId, project.id))
    .where(and(eq(voiceTake.id, id.data), eq(project.userId, user.id)))
    .limit(1);
  if (!row) return { error: "ההקראה לא נמצאה." };
  await rewindProject(row.projectId, "voice");
  revalidatePath(`/app/projects/${row.projectId}`);
  return {};
}

/** Removes an unapproved take and its audio. Paid characters are not refunded by the provider. */
export async function deleteTake(takeId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(takeId);
  if (!id.success) return { error: "ההקראה לא נמצאה." };
  const [row] = await db
    .select({ projectId: project.id, approved: voiceTake.approved, audioKey: voiceTake.audioKey })
    .from(voiceTake)
    .innerJoin(project, eq(voiceTake.projectId, project.id))
    .where(and(eq(voiceTake.id, id.data), eq(project.userId, user.id)))
    .limit(1);
  if (!row) return { error: "ההקראה לא נמצאה." };
  if (row.approved) return { error: "אי אפשר למחוק את ההקראה המאושרת." };
  await db.delete(voiceTake).where(eq(voiceTake.id, id.data));
  await deleteMedia(row.audioKey);
  revalidatePath(`/app/projects/${row.projectId}`);
  return {};
}
