"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { project, render, type Scene } from "@/db/schema";
import { approvedMaterial, getOwnedProject, latestRender, listScenes } from "@/lib/projects.server";
import { requireUser } from "@/lib/session";
import { createRenderJob, advanceRender } from "@/lib/video/render-job.server";
import type { RenderInput } from "@/lib/video/render.server";
import { isSpeed, PLAYBACK_SPEED } from "@/lib/script/hebrew";
import { isStale, STALE_MESSAGE } from "@/lib/scenes/stale";

/** How a ready scene is shown: the customer's image, a lip-synced presenter clip, or a plain clip. */
const beatOf = (entry: Scene): RenderInput["scenes"][number] => {
  const base = { mediaKey: entry.mediaKey!, caption: entry.caption };
  if (entry.uploadId) return { ...base, kind: "image" };
  if (entry.takeId && entry.audioStart !== null && !entry.demo) return { ...base, kind: "talking", audioStart: entry.audioStart };
  return { ...base, kind: "video" };
};

export async function startRender(projectId: string, speed: number = PLAYBACK_SPEED): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!isSpeed(speed)) return { error: "מהירות לא נתמכת." };
  const item = await getOwnedProject(user.id, projectId);
  if (!item) return { error: "הפרויקט לא נמצא." };
  const [{ draft, take }, scenes, previous] = await Promise.all([approvedMaterial(projectId), listScenes(projectId), latestRender(projectId)]);
  if (!draft?.chosenScript || !take) return { error: "חסרים תסריט או הקראה מאושרים." };
  if (scenes.length === 0 || scenes.some((entry) => entry.status !== "ready" || !entry.mediaKey)) {
    return { error: "קודם כל הסצנות צריכות להיות מוכנות." };
  }
  if (scenes.some((entry) => isStale(entry, take.id))) return { error: STALE_MESSAGE };
  if (previous?.status === "rendering") return { error: "הסרטון כבר בהרכבה." };

  const [job] = await db.insert(render).values({ projectId }).returning({ id: render.id });
  const input = {
    business: item.business ?? item.name,
    callToAction: item.callToAction || "דברו איתנו עוד היום",
    narrationKey: take.audioKey,
    words: take.words,
    scenes: scenes.map(beatOf),
    speed,
  };

  // Rendered part by part as the page polls renderState (each request stays short).
  await createRenderJob(projectId, job.id, input, draft.chosenScript);

  revalidatePath(`/app/projects/${projectId}`);
  return {};
}

export type RenderStatus = { status: "none" | "rendering" | "done" | "failed"; done?: number; total?: number };

/** Polled by the page while rendering: moves the render one step forward and reports where it is. */
export async function renderState(projectId: string): Promise<RenderStatus> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  const job = item && (await latestRender(projectId));
  if (!job) return { status: "none" };
  if (job.status !== "rendering") return { status: job.status };
  const progress = await advanceRender(projectId, job.id);
  const after = await latestRender(projectId);
  return { status: after?.status ?? "failed", ...progress };
}
