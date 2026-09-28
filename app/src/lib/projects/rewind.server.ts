import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { project, scene, voiceTake } from "@/db/schema";
import { listScenes } from "@/lib/projects.server";
import { deleteMedia } from "@/lib/storage.server";

/**
 * Server-only: callers must have verified project ownership first.
 *
 * Walks a project back to an earlier step after the customer changed their mind
 * about the script or the narration. Later work that no longer matches is
 * released: the approved narration is un-approved (takes are kept, they were paid
 * for), and scenes are rebuilt from the new material unless any were paid for, in
 * which case they are kept rather than thrown away.
 */
export async function rewindProject(projectId: string, to: "script" | "voice"): Promise<void> {
  const scenes = await listScenes(projectId);
  const paid = scenes.some((item) => !item.demo && item.status !== "draft");
  await db.batch([
    db.update(voiceTake).set({ approved: false }).where(eq(voiceTake.projectId, projectId)),
    ...(paid ? [] : [db.delete(scene).where(eq(scene.projectId, projectId))]),
    db.update(project).set({ status: to }).where(eq(project.id, projectId)),
  ]);
  if (!paid) {
    // A beat showing the customer's own image points at their upload: never delete that file.
    await Promise.all(scenes.flatMap((item) => (item.mediaKey && !item.uploadId ? [deleteMedia(item.mediaKey)] : [])));
  }
}
