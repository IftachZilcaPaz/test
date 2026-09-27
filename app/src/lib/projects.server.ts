import "server-only";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { project, render, scene, scriptDraft, voiceTake } from "@/db/schema";

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

export async function listScenes(projectId: string) {
  return db.select().from(scene).where(eq(scene.projectId, projectId)).orderBy(asc(scene.position));
}

/** The approved script option (its scene suggestions) and the approved narration take. */
export async function approvedMaterial(projectId: string) {
  const [draft] = await db
    .select()
    .from(scriptDraft)
    .where(and(eq(scriptDraft.projectId, projectId), isNotNull(scriptDraft.chosenScript)))
    .limit(1);
  const [take] = await db
    .select()
    .from(voiceTake)
    .where(and(eq(voiceTake.projectId, projectId), eq(voiceTake.approved, true)))
    .limit(1);
  const option = draft && draft.chosenIndex !== null ? draft.options[draft.chosenIndex] : undefined;
  return { draft: draft ?? null, option: option ?? null, take: take ?? null };
}

export async function latestRender(projectId: string) {
  const [row] = await db.select().from(render).where(eq(render.projectId, projectId)).orderBy(desc(render.createdAt)).limit(1);
  return row ?? null;
}
