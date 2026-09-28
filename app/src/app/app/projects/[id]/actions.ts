"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { project, scene, scriptDraft, upload, VIDEO_STYLES } from "@/db/schema";
import { narrationLexicon, vouch } from "@/lib/pronunciation/shared.server";
import { approvedScript, getOwnedProject, scriptScreens } from "@/lib/projects.server";
import { deleteMedia } from "@/lib/storage.server";
import { rewindProject } from "@/lib/projects/rewind.server";
import { briefSchema, type Brief } from "@/lib/script/types";
import { estimateScripts, ScriptWriterError, writeScripts } from "@/lib/script/writer.server";
import { customerPriceIls } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { assertCanPay, balance, charge, InsufficientFunds } from "@/lib/wallet.server";

// Guard against runaway spend from repeated clicks or scripted abuse.
const MAX_DRAFTS_PER_PROJECT = 30;

export type BriefState = {
  ok?: boolean;
  errors?: Partial<Record<keyof Brief, string>>;
  /** Echo of what was submitted, so a failed save doesn't wipe the form (React resets it after an action). */
  values?: Record<string, string>;
};

function briefFromProject(item: NonNullable<Awaited<ReturnType<typeof getOwnedProject>>>) {
  return briefSchema.safeParse({
    business: item.business ?? "",
    about: item.about ?? "",
    audience: item.audience ?? "",
    callToAction: item.callToAction ?? "",
    tone: item.tone,
    seconds: item.seconds,
    lexicon: item.lexicon,
  });
}

/** The brief as Claude receives it: the lexicon includes the shared pronunciations the narrator will use. */
async function writerBrief(item: NonNullable<Awaited<ReturnType<typeof getOwnedProject>>>): Promise<Brief | null> {
  const brief = briefFromProject(item);
  return brief.success ? { ...brief.data, lexicon: await narrationLexicon(brief.data.lexicon) } : null;
}

export async function saveBrief(projectId: string, _previous: BriefState, formData: FormData): Promise<BriefState> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  if (!item) return { errors: { business: "הפרויקט לא נמצא" } };

  const submitted = Object.fromEntries(
    [...formData.entries()].filter(([, value]) => typeof value === "string"),
  ) as Record<string, string>;
  const parsed = briefSchema.safeParse(submitted);
  if (!parsed.success) {
    const errors: BriefState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof Brief;
      errors[key] ??= issue.message;
    }
    return { errors, values: submitted };
  }
  const style = z.enum(VIDEO_STYLES).catch(item.style).parse(submitted.style);
  await db
    .update(project)
    .set({ ...parsed.data, style, status: item.status === "brief" ? "script" : item.status })
    .where(eq(project.id, projectId));
  await vouch(user.id, parsed.data.lexicon);
  revalidatePath(`/app/projects/${projectId}`);
  return { ok: true };
}

export type EstimateResult = { demo: boolean; maxUsd: number; balanceIls: number } | { error: string };

export async function estimateScriptCost(projectId: string): Promise<EstimateResult> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  const brief = item && (await writerBrief(item));
  if (!brief) return { error: "קודם שומרים את הפרטים על העסק." };
  try {
    return { ...(await estimateScripts(brief, await scriptScreens(item), item.style)), balanceIls: await balance(user.id) };
  } catch (error) {
    console.error("[scripts] estimate failed", error instanceof Error ? error.message : error);
    return { error: "לא הצלחנו לחשב מחיר כרגע. נסו שוב." };
  }
}

export async function generateScripts(projectId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  const brief = item && (await writerBrief(item));
  if (!brief) return { error: "קודם שומרים את הפרטים על העסק." };

  const [{ drafts }] = await db.select({ drafts: count() }).from(scriptDraft).where(eq(scriptDraft.projectId, projectId));
  if (drafts >= MAX_DRAFTS_PER_PROJECT) return { error: "הגעתם למספר הגרסאות המרבי בפרויקט הזה." };

  try {
    const screens = await scriptScreens(item);
    const quote = await estimateScripts(brief, screens, item.style);
    await assertCanPay(user.id, customerPriceIls(quote.maxUsd));
    const { options, usage } = await writeScripts(brief, screens, item.style);
    const [draft] = await db.insert(scriptDraft).values({ projectId, options, ...usage }).returning({ id: scriptDraft.id });
    const label = options.length === 1 ? "כתיבת תסריט" : `כתיבת ${options.length} תסריטים`;
    await charge(user.id, customerPriceIls(usage.costUsd), label, projectId, `script:${draft.id}`);
  } catch (error) {
    if (error instanceof ScriptWriterError || error instanceof InsufficientFunds) return { error: error.message };
    console.error("[scripts] write failed", error instanceof Error ? error.message : error);
    return { error: "משהו השתבש בכתיבה. נסו שוב." };
  }
  revalidatePath(`/app/projects/${projectId}`);
  return {};
}

const approveInput = z.object({
  draftId: z.string().uuid(),
  index: z.number().int().min(0).max(2),
  script: z.string().trim().min(1, "התסריט ריק").max(2000, "התסריט ארוך מדי"),
});

export async function approveScript(input: z.input<typeof approveInput>): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = approveInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const [row] = await db
    .select({ draft: scriptDraft, projectId: project.id, status: project.status })
    .from(scriptDraft)
    .innerJoin(project, eq(scriptDraft.projectId, project.id))
    .where(and(eq(scriptDraft.id, parsed.data.draftId), eq(project.userId, user.id)))
    .limit(1);
  if (!row || !row.draft.options[parsed.data.index]) return { error: "התסריט לא נמצא." };

  // Changing an already-approved script invalidates the narration recorded from it.
  const previous = await approvedScript(row.projectId);
  const changed = previous !== null && previous !== parsed.data.script;

  await db.batch([
    // Only one approved script per project.
    db.update(scriptDraft).set({ chosenIndex: null, chosenScript: null }).where(eq(scriptDraft.projectId, row.projectId)),
    db
      .update(scriptDraft)
      .set({ chosenIndex: parsed.data.index, chosenScript: parsed.data.script })
      .where(eq(scriptDraft.id, parsed.data.draftId)),
    db
      .update(project)
      .set({ status: row.status === "brief" || row.status === "script" ? "voice" : row.status })
      .where(eq(project.id, row.projectId)),
  ]);
  if (changed) await rewindProject(row.projectId, "voice");
  revalidatePath(`/app/projects/${row.projectId}`);
  return {};
}

/** Takes back the script approval so the customer can edit it or pick another version. */
export async function unapproveScript(projectId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  if (!item) return { error: "הפרויקט לא נמצא." };
  await db.update(scriptDraft).set({ chosenIndex: null, chosenScript: null }).where(eq(scriptDraft.projectId, projectId));
  await rewindProject(projectId, "script");
  revalidatePath(`/app/projects/${projectId}`);
  return {};
}

async function ownedUpload(userId: string, uploadId: string) {
  const id = z.string().uuid().safeParse(uploadId);
  if (!id.success) return null;
  const [row] = await db
    .select({ upload, projectId: project.id })
    .from(upload)
    .innerJoin(project, eq(upload.projectId, project.id))
    .where(and(eq(upload.id, id.data), eq(project.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** What the image shows, in a few Hebrew words; the script uses it to talk about the screen. */
export async function updateUploadLabel(uploadId: string, label: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const row = await ownedUpload(user.id, uploadId);
  if (!row) return { error: "התמונה לא נמצאה." };
  await db.update(upload).set({ label: label.trim().slice(0, 60) }).where(eq(upload.id, row.upload.id));
  revalidatePath(`/app/projects/${row.projectId}`);
  return {};
}

export async function deleteUpload(uploadId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const row = await ownedUpload(user.id, uploadId);
  if (!row) return { error: "התמונה לא נמצאה." };
  const [used] = await db.select({ id: scene.id }).from(scene).where(eq(scene.uploadId, row.upload.id)).limit(1);
  if (used) return { error: "התמונה כבר מופיעה בסצנה, ולכן אי אפשר למחוק אותה." };
  await db.delete(upload).where(eq(upload.id, row.upload.id));
  await deleteMedia(row.upload.mediaKey).catch(() => undefined);
  revalidatePath(`/app/projects/${row.projectId}`);
  return {};
}
