import { count, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { upload } from "@/db/schema";
import { getOwnedProject } from "@/lib/projects.server";
import { getSession } from "@/lib/session";
import { putMedia } from "@/lib/storage.server";
import { MAX_UPLOAD_BYTES, MAX_UPLOADS, UPLOAD_TYPES } from "@/lib/uploads";

const fail = (message: string, status = 400) => Response.json({ error: message }, { status });

/** Adds one screenshot or photo to a project (the browser downsizes it first). */
export async function POST(request: Request, { params }: RouteContext<"/api/projects/[id]/uploads">) {
  const session = await getSession();
  if (!session) return fail("צריך להתחבר מחדש.", 401);
  const { id } = await params;
  const item = await getOwnedProject(session.user.id, id);
  if (!item) return fail("הפרויקט לא נמצא.", 404);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("לא התקבלה תמונה.");
  const extension = UPLOAD_TYPES[file.type];
  if (!extension) return fail("אפשר להעלות תמונות JPG, PNG או WEBP.");
  if (file.size > MAX_UPLOAD_BYTES) return fail("התמונה גדולה מדי (עד 5MB).");
  const label = String(form?.get("label") ?? "").trim().slice(0, 60);

  const [{ total, last }] = await db
    .select({ total: count(), last: max(upload.position) })
    .from(upload)
    .where(eq(upload.projectId, id));
  if (total >= MAX_UPLOADS) return fail(`אפשר עד ${MAX_UPLOADS} תמונות בפרויקט.`);

  const uploadId = crypto.randomUUID();
  const mediaKey = `projects/${id}/uploads/${uploadId}.${extension}`;
  await putMedia(mediaKey, new Uint8Array(await file.arrayBuffer()));
  await db.insert(upload).values({ id: uploadId, projectId: id, mediaKey, label, position: (last ?? -1) + 1 });
  revalidatePath(`/app/projects/${id}`);
  return Response.json({ id: uploadId });
}
