"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { project } from "@/db/schema";
import { requireUser } from "@/lib/session";

export type CreateProjectState = { error?: string };

const projectName = z
  .string()
  .trim()
  .min(1, "צריך לתת לפרויקט שם, למשל שם העסק")
  .max(80, "השם ארוך מדי (עד 80 תווים)");

export async function createProject(
  _previous: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const user = await requireUser();
  const parsed = projectName.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const [created] = await db
    .insert(project)
    .values({ userId: user.id, name: parsed.data })
    .returning({ id: project.id });
  revalidatePath("/app");
  redirect(`/app/projects/${created.id}`);
}

export async function deleteProject(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  // Scoped by owner: a user can never delete someone else's project.
  await db.delete(project).where(and(eq(project.id, id.data), eq(project.userId, user.id)));
  revalidatePath("/app");
}
