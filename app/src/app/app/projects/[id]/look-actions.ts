"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { project, type VideoStyle } from "@/db/schema";
import { customerPriceIls } from "@/lib/pricing";
import { approvedMaterial, getOwnedProject } from "@/lib/projects.server";
import { estimateLook, isSceneDemoMode, SceneError, sceneStatus, submitLook } from "@/lib/scenes/higgsfield.server";
import { requireUser } from "@/lib/session";
import { deleteMedia, putMedia } from "@/lib/storage.server";
import { assertCanPay, balance, charge, InsufficientFunds, refund } from "@/lib/wallet.server";

/**
 * The character image prompt: one photoreal vertical frame of the script's person in its place.
 * A presenter is framed as the first frame of a selfie video: facing the lens, face in the upper
 * half (clear of the captions), mouth closed so the lip-sync starts from rest.
 */
async function lookPrompt(projectId: string, style: VideoStyle): Promise<string | null> {
  const { option } = await approvedMaterial(projectId);
  const look = option?.look;
  if (!look) return null;
  if (style === "presenter") {
    return `Photorealistic vertical selfie video frame, shot on an iPhone front camera held at arm's length, natural light. ${look.character}, in ${look.setting}. Looking straight into the lens with a relaxed, friendly expression, mouth gently closed, face and shoulders in the upper half of the frame. No text, letters, logos or signs.`;
  }
  return `Photorealistic vertical photo shot on an iPhone, natural light. ${look.character}, in ${look.setting}. The person is clearly visible, relaxed and friendly. No text, letters, logos or signs.`;
}

export type LookQuote = { priceIls: number; balanceIls: number } | { error: string };

export async function quoteLook(projectId: string): Promise<LookQuote> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  if (!item) return { error: "הפרויקט לא נמצא." };
  if (isSceneDemoMode()) return { error: "הדמות נוצרת רק כשמחובר Higgsfield." };
  const prompt = await lookPrompt(projectId, item.style);
  if (!prompt) return { error: "קודם מאשרים תסריט." };
  try {
    return { priceIls: customerPriceIls(await estimateLook(prompt)), balanceIls: await balance(user.id) };
  } catch (error) {
    return { error: error instanceof SceneError ? error.message : "לא הצלחנו לחשב מחיר כרגע." };
  }
}

/** Orders the character image (or a new one); the finished image arrives through refreshLook. */
export async function createLook(projectId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  if (!item) return { error: "הפרויקט לא נמצא." };
  if (item.lookRequestId) return { error: "הדמות כבר בהכנה." };
  const prompt = await lookPrompt(projectId, item.style);
  if (!prompt) return { error: "קודם מאשרים תסריט." };
  try {
    const usd = await estimateLook(prompt);
    await assertCanPay(user.id, customerPriceIls(usd));
    const requestId = await submitLook(prompt);
    await db.update(project).set({ lookRequestId: requestId, lookCostUsd: usd }).where(eq(project.id, projectId));
    await charge(user.id, customerPriceIls(usd), "הדמות של הסרטון", projectId, `look:${projectId}:${requestId}`);
  } catch (error) {
    if (error instanceof SceneError || error instanceof InsufficientFunds) return { error: error.message };
    console.error("[look] create failed", error instanceof Error ? error.message : error);
    return { error: "משהו השתבש ביצירת הדמות." };
  }
  revalidatePath(`/app/projects/${projectId}`);
  return {};
}

/** Polls the character image; stores it when ready, refunds when it failed. Safe to call repeatedly. */
export async function refreshLook(projectId: string): Promise<{ pending: boolean; error?: string }> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  if (!item?.lookRequestId) return { pending: false };
  const requestId = item.lookRequestId;
  try {
    const status = await sceneStatus(requestId);
    if (status.state === "pending") return { pending: true };
    if (status.state === "failed") {
      await db.update(project).set({ lookRequestId: null }).where(eq(project.id, projectId));
      await refund(user.id, customerPriceIls(item.lookCostUsd), "החזר: הדמות לא נוצרה", projectId, `refund:look:${projectId}:${requestId}`);
      revalidatePath(`/app/projects/${projectId}`);
      return { pending: false, error: status.reason };
    }
    const response = await fetch(status.videoUrl);
    if (!response.ok) return { pending: true };
    // Keep the provider's format in the key: the signed public link derives the content type from it.
    const extension = status.videoUrl.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1]?.toLowerCase() ?? "png";
    const key = `projects/${projectId}/look/${requestId}.${extension}`;
    await putMedia(key, new Uint8Array(await response.arrayBuffer()));
    await db.update(project).set({ lookImageKey: key, lookRequestId: null }).where(eq(project.id, projectId));
    if (item.lookImageKey) await deleteMedia(item.lookImageKey).catch(() => undefined);
    revalidatePath(`/app/projects/${projectId}`);
    return { pending: false };
  } catch (error) {
    console.error("[look] poll failed", error instanceof Error ? error.message : error);
    return { pending: true };
  }
}
