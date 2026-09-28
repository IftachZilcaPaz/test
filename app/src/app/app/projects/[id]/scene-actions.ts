"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { project, scene, type Scene } from "@/db/schema";
import { getOwnedProject, listScenes } from "@/lib/projects.server";
import { DEMO_CLIPS_PER_POLL, demoSceneClip } from "@/lib/scenes/demo.server";
import { estimateScene, isSceneDemoMode, SceneError, sceneStatus, submitScene } from "@/lib/scenes/higgsfield.server";
import { customerPriceIls } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { assertCanPay, balance, charge, InsufficientFunds, refund } from "@/lib/wallet.server";
import { putMedia } from "@/lib/storage.server";

const NO_TEXT = "Vertical 9:16 cinematic shot. No text, letters, captions, logos, signs or readable screens.";

const refresh = (projectId: string) => revalidatePath(`/app/projects/${projectId}`);

async function ownedScenes(userId: string, projectId: string) {
  const item = await getOwnedProject(userId, projectId);
  if (!item) return null;
  return listScenes(projectId);
}

const pending = (list: Scene[]) => list.filter((item) => item.status === "draft" || item.status === "failed");

export async function updateScenePrompt(sceneId: string, prompt: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), prompt: z.string().trim().min(3, "התיאור קצר מדי").max(600, "התיאור ארוך מדי") }).safeParse({ id: sceneId, prompt });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [row] = await db
    .select({ projectId: scene.projectId, prompt: scene.prompt, status: scene.status })
    .from(scene)
    .innerJoin(project, eq(scene.projectId, project.id))
    .where(and(eq(scene.id, parsed.data.id), eq(project.userId, user.id)))
    .limit(1);
  if (!row) return { error: "הסצנה לא נמצאה." };
  if (row.status === "generating") return { error: "הסצנה בתהליך יצירה. אפשר לשנות אחרי שתסתיים." };
  if (row.prompt === parsed.data.prompt) return {};
  // A new description means the clip must be generated again.
  await db.update(scene).set({ prompt: parsed.data.prompt, status: "draft", mediaKey: null, error: null }).where(eq(scene.id, parsed.data.id));
  refresh(row.projectId);
  return {};
}

export type SceneQuote = { demo: boolean; usd: number; count: number; priceIls: number; balanceIls: number } | { error: string };

export async function quoteScenes(projectId: string): Promise<SceneQuote> {
  const user = await requireUser();
  const list = await ownedScenes(user.id, projectId);
  if (!list) return { error: "הפרויקט לא נמצא." };
  const todo = pending(list);
  if (todo.length === 0) return { error: "כל הסצנות כבר מוכנות." };
  const balanceIls = await balance(user.id);
  if (isSceneDemoMode()) return { demo: true, usd: 0, count: todo.length, priceIls: 0, balanceIls };
  try {
    const prices = await Promise.all(todo.map((item) => estimateScene(`${item.prompt}. ${NO_TEXT}`, item.seconds)));
    const priceIls = prices.reduce((sum, value) => sum + customerPriceIls(value), 0);
    return { demo: false, usd: prices.reduce((sum, value) => sum + value, 0), count: todo.length, priceIls, balanceIls };
  } catch (error) {
    return { error: error instanceof SceneError ? error.message : "לא הצלחנו לחשב מחיר כרגע." };
  }
}

export async function generateScenes(projectId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const list = await ownedScenes(user.id, projectId);
  if (!list) return { error: "הפרויקט לא נמצא." };
  const todo = pending(list);
  if (todo.length === 0) return {};

  try {
    if (isSceneDemoMode()) {
      // Queued like real scenes: refreshScenes renders them a couple at a time.
      await db
        .update(scene)
        .set({ status: "generating", demo: true, requestId: null, mediaKey: null, costUsd: 0, error: null })
        .where(inArray(scene.id, todo.map((item) => item.id)));
    } else {
      const prompts = todo.map((item) => `${item.prompt}. ${NO_TEXT}`);
      const prices = await Promise.all(todo.map((item, index) => estimateScene(prompts[index]!, item.seconds)));
      await assertCanPay(user.id, prices.reduce((sum, usd) => sum + customerPriceIls(usd), 0));
      for (const [index, item] of todo.entries()) {
        const requestId = await submitScene(prompts[index]!, item.seconds);
        const usd = prices[index]!;
        await db.update(scene).set({ status: "generating", demo: false, requestId, costUsd: usd, error: null }).where(eq(scene.id, item.id));
        // Keyed by our scene id too: a charge must never be skipped because a provider id repeated.
        await charge(user.id, customerPriceIls(usd), `סצנה ${item.position + 1}`, projectId, `scene:${item.id}:${requestId}`);
      }
    }
  } catch (error) {
    refresh(projectId);
    if (error instanceof SceneError || error instanceof InsufficientFunds) return { error: error.message };
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
  let downloads = 0;
  for (const item of running.filter((entry) => !entry.demo && entry.requestId)) {
    try {
      const status = await sceneStatus(item.requestId!);
      if (status.state === "completed") {
        if (downloads >= MAX_DOWNLOADS_PER_POLL) continue;
        downloads++;
        const response = await fetch(status.videoUrl);
        if (!response.ok) continue;
        const key = `projects/${projectId}/scenes/${item.id}.mp4`;
        await putMedia(key, new Uint8Array(await response.arrayBuffer()));
        await db.update(scene).set({ status: "ready", mediaKey: key }).where(eq(scene.id, item.id));
      } else if (status.state === "failed") {
        // Failed and moderated requests are not billed by Higgsfield, so the customer is refunded too.
        await db.update(scene).set({ status: "failed", error: status.reason, costUsd: 0 }).where(eq(scene.id, item.id));
        await refund(user.id, customerPriceIls(item.costUsd), `החזר: סצנה ${item.position + 1} לא נוצרה`, projectId, `refund:scene:${item.id}:${item.requestId}`);
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
  if (item.status === "scenes") await db.update(project).set({ status: "render" }).where(eq(project.id, projectId));
  refresh(projectId);
  return {};
}

export async function resetScene(sceneId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const [row] = await db
    .select({ projectId: scene.projectId, status: scene.status })
    .from(scene)
    .innerJoin(project, eq(scene.projectId, project.id))
    .where(and(inArray(scene.id, [sceneId]), eq(project.userId, user.id)))
    .limit(1);
  if (!row) return { error: "הסצנה לא נמצאה." };
  if (row.status === "generating") return { error: "הסצנה עדיין בתהליך." };
  await db.update(scene).set({ status: "draft", mediaKey: null, error: null }).where(eq(scene.id, sceneId));
  refresh(row.projectId);
  return {};
}
