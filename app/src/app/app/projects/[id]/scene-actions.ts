"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { project, scene, type Project, type Scene } from "@/db/schema";
import { approvedMaterial, getOwnedProject, listScenes } from "@/lib/projects.server";
import { publicMediaUrl } from "@/lib/public-media.server";
import { DEMO_CLIPS_PER_POLL, demoSceneClip } from "@/lib/scenes/demo.server";
import {
  estimateScene,
  estimateTalk,
  isSceneDemoMode,
  RESOLUTIONS,
  type Resolution,
  SceneError,
  sceneStatus,
  submitScene,
  submitTalk,
} from "@/lib/scenes/higgsfield.server";
import { isStale, STALE_MESSAGE } from "@/lib/scenes/stale";
import { publishSlices, talkGroups, type TalkGroup, talkPrompt, talkSlices, voiceSliceKey } from "@/lib/scenes/presenter.server";
import { customerPriceIls } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { assertCanPay, balance, charge, InsufficientFunds, refund } from "@/lib/wallet.server";
import { deleteMedia, putMedia } from "@/lib/storage.server";

const NO_TEXT = "Vertical 9:16 cinematic shot. No text, letters, captions, logos, signs or readable screens.";

const refresh = (projectId: string) => revalidatePath(`/app/projects/${projectId}`);

const NEEDS_LOOK = "קודם יוצרים את הדמות של הסרטון (בכרטיס למעלה), כדי שכל הסצנות יראו את אותו אדם ואותו מקום.";
const NEEDS_PRESENTER = "קודם יוצרים את הקריינית (בכרטיס למעלה): כל הסצנות מצולמות ממנה.";

class PlanError extends Error {}

/**
 * How the real clips of the given scenes are made, priced before anything is spent:
 * - presenter: the presenter image talking, lip-synced to that beat's slice of the narration;
 * - otherwise: generated shots, anchored to the character image when there is one, so every
 *   scene shows the same person and place. A script written with a look must have that image
 *   first (older scripts without a look are exempt).
 */
async function planReal(owner: Project, todo: Scene[], resolution: Resolution) {
  const { option, take } = await approvedMaterial(owner.id);
  const lookUrl = owner.lookImageKey ? publicMediaUrl(owner.lookImageKey) : undefined;

  if (owner.style === "presenter") {
    if (!lookUrl) throw new PlanError(NEEDS_PRESENTER);
    if (!take) throw new PlanError("קודם מאשרים הקראה.");
    const groups = talkGroups(talkSlices(take, await listScenes(owner.id)), todo);
    // The price depends on the clip length only; the whole narration stands in for the slice.
    const narrationUrl = publicMediaUrl(take.audioKey);
    const prompt = (group: TalkGroup) => talkPrompt(group.scenes.map((item) => item.prompt).join(" Then: "));
    const groupUsd = await Promise.all(groups.map((group) => estimateTalk(prompt(group), lookUrl, narrationUrl, group.slice.end - group.slice.start)));
    // One clip per group: its price sits on the group's first scene, which is what gets charged and refunded.
    const usd = todo.map((item) => {
      const index = groups.findIndex((group) => group.scenes[0] === item);
      return index >= 0 ? groupUsd[index]! : 0;
    });
    const label = todo.map((item) => {
      const group = groups.find((entry) => entry.scenes.includes(item))!;
      const [first, last] = [group.scenes[0]!.position + 1, group.scenes.at(-1)!.position + 1];
      return first === last ? `סצנה ${first}` : `סצנות ${first} עד ${last}`;
    });
    return {
      usd,
      label,
      async submitAll(onSubmitted: (item: Scene, requestId: string, patch: Partial<Scene>) => Promise<void>) {
        const audioUrls = await publishSlices(owner.id, take, groups.map((group) => ({ sceneId: group.scenes[0]!.id, slice: group.slice })));
        for (const [index, group] of groups.entries()) {
          const requestId = await submitTalk(prompt(group), lookUrl, audioUrls[index]!, group.slice.end - group.slice.start);
          for (const item of group.scenes) await onSubmitted(item, requestId, { takeId: take.id, audioStart: group.slice.start });
        }
      },
    };
  }

  const look = option?.look;
  if (look && !lookUrl) throw new PlanError(NEEDS_LOOK);
  const lead = look ? (lookUrl ? `The same person and place as in the reference image. Setting: ${look.setting}.` : `${look.character}, in ${look.setting}.`) : "";
  const prompts = todo.map((item) => [lead, item.prompt, NO_TEXT].filter(Boolean).join(" "));
  const usd = await Promise.all(todo.map((item, index) => estimateScene(prompts[index]!, item.seconds, resolution, lookUrl)));
  return {
    usd,
    label: todo.map((item) => `סצנה ${item.position + 1}`),
    async submitAll(onSubmitted: (item: Scene, requestId: string, patch: Partial<Scene>) => Promise<void>) {
      for (const [index, item] of todo.entries()) {
        const requestId = await submitScene(prompts[index]!, item.seconds, resolution, lookUrl);
        await onSubmitted(item, requestId, { takeId: null, audioStart: null });
      }
    },
  };
}

async function ownedScenes(userId: string, projectId: string) {
  const item = await getOwnedProject(userId, projectId);
  if (!item) return null;
  return listScenes(projectId);
}

/** "demo": free placeholder backgrounds; "real": Higgsfield clips, which also replace ready placeholders. */
const sceneMode = z.enum(["demo", "real"]);
export type SceneMode = z.infer<typeof sceneMode>;

const pending = (list: Scene[], mode: SceneMode, takeId: string | undefined) =>
  list.filter(
    (item) =>
      item.status === "draft" ||
      item.status === "failed" ||
      (mode === "real" && item.status === "ready" && (item.demo || isStale(item, takeId))),
  );

/** The scenes still to make, and the project they belong to (null when not the user's). */
async function workFor(userId: string, projectId: string, mode: SceneMode) {
  const owner = await getOwnedProject(userId, projectId);
  if (!owner) return null;
  const [list, { take }] = await Promise.all([listScenes(projectId), approvedMaterial(projectId)]);
  return { owner, todo: pending(list, mode, take?.id) };
}

const resolutionOf = (requested: unknown): Resolution => {
  const parsed = z.enum(RESOLUTIONS).safeParse(requested);
  return parsed.success ? parsed.data : "720p";
};

/** Demo whenever asked for, or when no Higgsfield key is configured. */
const effectiveMode = (requested: unknown): SceneMode => {
  const mode = sceneMode.safeParse(requested);
  return isSceneDemoMode() || !mode.success ? "demo" : mode.data;
};

export async function updateScenePrompt(sceneId: string, prompt: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), prompt: z.string().trim().min(3, "התיאור קצר מדי").max(600, "התיאור ארוך מדי") }).safeParse({ id: sceneId, prompt });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [row] = await db
    .select({ projectId: scene.projectId, prompt: scene.prompt, status: scene.status, uploadId: scene.uploadId })
    .from(scene)
    .innerJoin(project, eq(scene.projectId, project.id))
    .where(and(eq(scene.id, parsed.data.id), eq(project.userId, user.id)))
    .limit(1);
  if (!row) return { error: "הסצנה לא נמצאה." };
  if (row.uploadId) return { error: "הסצנה הזו מציגה תמונה שלכם." };
  if (row.status === "generating") return { error: "הסצנה בתהליך יצירה. אפשר לשנות אחרי שתסתיים." };
  if (row.prompt === parsed.data.prompt) return {};
  // A new description means the clip must be generated again.
  await db.update(scene).set({ prompt: parsed.data.prompt, status: "draft", mediaKey: null, error: null }).where(eq(scene.id, parsed.data.id));
  refresh(row.projectId);
  return {};
}

export type SceneQuote = { demo: boolean; usd: number; count: number; priceIls: number; balanceIls: number } | { error: string };

export async function quoteScenes(projectId: string, requested: SceneMode = "real", quality: Resolution = "720p"): Promise<SceneQuote> {
  const user = await requireUser();
  const mode = effectiveMode(requested);
  const work = await workFor(user.id, projectId, mode);
  if (!work) return { error: "הפרויקט לא נמצא." };
  const { owner, todo } = work;
  if (todo.length === 0) return { error: "כל הסצנות כבר מוכנות." };
  const balanceIls = await balance(user.id);
  if (mode === "demo") return { demo: true, usd: 0, count: todo.length, priceIls: 0, balanceIls };
  try {
    const { usd } = await planReal(owner, todo, resolutionOf(quality));
    const priceIls = usd.reduce((sum, value) => sum + customerPriceIls(value), 0);
    return { demo: false, usd: usd.reduce((sum, value) => sum + value, 0), count: todo.length, priceIls, balanceIls };
  } catch (error) {
    if (error instanceof PlanError || error instanceof SceneError) return { error: error.message };
    console.error("[scenes] quote failed", error instanceof Error ? error.message : error);
    return { error: "לא הצלחנו לחשב מחיר כרגע." };
  }
}

export async function generateScenes(
  projectId: string,
  requested: SceneMode = "real",
  quality: Resolution = "720p",
): Promise<{ error?: string }> {
  const user = await requireUser();
  const mode = effectiveMode(requested);
  const work = await workFor(user.id, projectId, mode);
  if (!work) return { error: "הפרויקט לא נמצא." };
  const { owner, todo } = work;
  if (todo.length === 0) return {};

  try {
    if (mode === "demo") {
      // Queued like real scenes: refreshScenes renders them a couple at a time.
      await db
        .update(scene)
        .set({ status: "generating", demo: true, requestId: null, mediaKey: null, costUsd: 0, error: null, takeId: null, audioStart: null })
        .where(inArray(scene.id, todo.map((item) => item.id)));
    } else {
      const plan = await planReal(owner, todo, resolutionOf(quality));
      await assertCanPay(user.id, plan.usd.reduce((sum, usd) => sum + customerPriceIls(usd), 0));
      // Clips being replaced are deleted, unless a scene that is not being remade still shows them.
      const remade = new Set(todo.map((item) => item.id));
      const kept = new Set((await listScenes(projectId)).flatMap((entry) => (!remade.has(entry.id) && entry.mediaKey ? [entry.mediaKey] : [])));
      await plan.submitAll(async (item, requestId, patch) => {
        const index = todo.indexOf(item);
        const usd = plan.usd[index]!;
        await db
          .update(scene)
          .set({ status: "generating", demo: false, requestId, mediaKey: null, costUsd: usd, error: null, ...patch })
          .where(eq(scene.id, item.id));
        if (item.mediaKey && !item.uploadId && !kept.has(item.mediaKey)) await deleteMedia(item.mediaKey).catch(() => undefined);
        // Keyed by our scene id too: a charge must never be skipped because a provider id repeated.
        if (usd > 0) await charge(user.id, customerPriceIls(usd), plan.label[index]!, projectId, `scene:${item.id}:${requestId}`);
      });
    }
  } catch (error) {
    refresh(projectId);
    if (error instanceof PlanError || error instanceof SceneError || error instanceof InsufficientFunds) return { error: error.message };
    console.error("[scenes] generate failed", error instanceof Error ? error.message : error);
    return { error: "משהו השתבש ביצירת הסצנות." };
  }
  refresh(projectId);
  return {};
}

const MAX_DOWNLOADS_PER_POLL = 2;

/** Polls Higgsfield for scenes in progress and stores finished clips. Safe to call repeatedly. */
export async function refreshScenes(projectId: string): Promise<{ generating: number }> {
  const user = await requireUser();
  const list = await ownedScenes(user.id, projectId);
  if (!list) return { generating: 0 };
  const running = list.filter((item) => item.status === "generating");
  // Demo placeholders are rendered here, a few per poll, so no single request runs long.
  for (const item of running.filter((entry) => entry.demo).slice(0, DEMO_CLIPS_PER_POLL)) {
    try {
      const key = `projects/${projectId}/scenes/${item.id}-demo.mp4`;
      await putMedia(key, await demoSceneClip(item.position));
      await db.update(scene).set({ status: "ready", mediaKey: key }).where(eq(scene.id, item.id));
    } catch (error) {
      console.error("[scenes] demo clip failed", error instanceof Error ? error.message : error);
      await db.update(scene).set({ status: "failed", error: "הסצנה לדוגמה לא נוצרה. נסו שוב." }).where(eq(scene.id, item.id));
    }
  }
  // Finished clips are a few MB each; download a couple per poll so a request stays short.
  // Presenter scenes can share one clip (one request); each request is handled once.
  let downloads = 0;
  const requests = new Map<string, Scene[]>();
  for (const item of running.filter((entry) => !entry.demo && entry.requestId)) {
    requests.set(item.requestId!, [...(requests.get(item.requestId!) ?? []), item]);
  }
  for (const [requestId, items] of requests) {
    const ids = items.map((item) => item.id);
    const first = items[0]!;
    try {
      const status = await sceneStatus(requestId);
      if (status.state === "completed") {
        if (downloads >= MAX_DOWNLOADS_PER_POLL) continue;
        downloads++;
        const response = await fetch(status.videoUrl);
        if (!response.ok) continue;
        const key = `projects/${projectId}/scenes/${first.id}.mp4`;
        await putMedia(key, new Uint8Array(await response.arrayBuffer()));
        await db.update(scene).set({ status: "ready", mediaKey: key }).where(inArray(scene.id, ids));
        if (first.takeId) await deleteMedia(voiceSliceKey(projectId, first.id)).catch(() => undefined);
      } else if (status.state === "failed") {
        // Failed and moderated requests are not billed by Higgsfield, so the customer is refunded too.
        const usd = items.reduce((sum, item) => sum + item.costUsd, 0);
        await db.update(scene).set({ status: "failed", error: status.reason, costUsd: 0 }).where(inArray(scene.id, ids));
        const what = items.length === 1 ? `סצנה ${first.position + 1}` : `סצנות ${first.position + 1} עד ${items.at(-1)!.position + 1}`;
        if (usd > 0) await refund(user.id, customerPriceIls(usd), `החזר: ${what} לא נוצרה`, projectId, `refund:scene:${first.id}:${requestId}`);
      }
    } catch (error) {
      console.error("[scenes] poll failed", error instanceof Error ? error.message : error);
    }
  }
  const after = await listScenes(projectId);
  const generating = after.filter((item) => item.status === "generating").length;
  if (generating !== running.length) refresh(projectId);
  return { generating };
}

export async function approveScenes(projectId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  const list = item && (await listScenes(projectId));
  if (!item || !list) return { error: "הפרויקט לא נמצא." };
  if (list.length === 0 || list.some((entry) => entry.status !== "ready")) return { error: "קודם כל הסצנות צריכות להיות מוכנות." };
  const { take } = await approvedMaterial(projectId);
  if (list.some((entry) => isStale(entry, take?.id))) return { error: STALE_MESSAGE };
  if (item.status === "scenes") await db.update(project).set({ status: "render" }).where(eq(project.id, projectId));
  refresh(projectId);
  return {};
}

export async function resetScene(sceneId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const [row] = await db
    .select({ projectId: scene.projectId, status: scene.status, uploadId: scene.uploadId })
    .from(scene)
    .innerJoin(project, eq(scene.projectId, project.id))
    .where(and(inArray(scene.id, [sceneId]), eq(project.userId, user.id)))
    .limit(1);
  if (!row) return { error: "הסצנה לא נמצאה." };
  if (row.uploadId) return { error: "הסצנה הזו מציגה תמונה שלכם." };
  if (row.status === "generating") return { error: "הסצנה עדיין בתהליך." };
  await db.update(scene).set({ status: "draft", mediaKey: null, error: null }).where(eq(scene.id, sceneId));
  refresh(row.projectId);
  return {};
}
