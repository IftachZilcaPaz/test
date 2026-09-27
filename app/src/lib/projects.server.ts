import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { project, scriptDraft, voiceTake } from "@/db/schema";

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

export async function listTakes(projectId: string) {
  return db.select().from(voiceTake).where(eq(voiceTake.projectId, projectId)).orderBy(desc(voiceTake.createdAt));
}

/** The approved narration, after the customer's edits; null until a script is approved. */
export async function approvedScript(projectId: string) {
  const [row] = await db
    .select({ script: scriptDraft.chosenScript })
    .from(scriptDraft)
    .where(and(eq(scriptDraft.projectId, projectId), isNotNull(scriptDraft.chosenScript)))
    .limit(1);
  return row?.script ?? null;
}
