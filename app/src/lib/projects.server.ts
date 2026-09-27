import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { project, scriptDraft } from "@/db/schema";

/** Every project read goes through the owner filter, so ids from the URL can't leak other users' data. */
export async function getOwnedProject(userId: string, projectId: string) {
  const [item] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  return item ?? null;
}

export async function listDrafts(projectId: string) {
  return db.select().from(scriptDraft).where(eq(scriptDraft.projectId, projectId)).orderBy(desc(scriptDraft.createdAt));
}
