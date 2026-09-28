"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db/client";
import { project, render, type Scene } from "@/db/schema";
import { approvedMaterial, getOwnedProject, latestRender, listScenes } from "@/lib/projects.server";
import { requireUser } from "@/lib/session";
import { putMedia } from "@/lib/storage.server";
import { renderChecks } from "@/lib/video/checks";
import { type RenderInput, renderVideo } from "@/lib/video/render.server";
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

  // Assembly takes seconds to a minute; it runs after the response and the page polls.
  after(async () => {
    try {
      const { video, timeline } = await renderVideo(input);
      const mediaKey = `projects/${projectId}/renders/${job.id}.mp4`;
      await putMedia(mediaKey, video);
      const checks = renderChecks(timeline, input.scenes.map((entry) => entry.caption), draft.chosenScript!);
      await db.update(render).set({ status: "done", mediaKey, durationSeconds: timeline.total, checks }).where(eq(render.id, job.id));
      await db.update(project).set({ status: "done" }).where(eq(project.id, projectId));
    } catch (error) {
      console.error("[render] failed", error instanceof Error ? error.message : error);
      await db.update(render).set({ status: "failed", error: "ההרכבה נכשלה. נסו שוב." }).where(eq(render.id, job.id));
    }
  });

  revalidatePath(`/app/projects/${projectId}`);
  return {};
}

export async function renderState(projectId: string): Promise<{ status: "none" | "rendering" | "done" | "failed" }> {
  const user = await requireUser();
  const item = await getOwnedProject(user.id, projectId);
  const job = item && (await latestRender(projectId));
  return { status: job?.status ?? "none" };
}
