import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { project, upload } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getMedia, mediaResponse } from "@/lib/storage.server";
import { imageTypeOf } from "@/lib/uploads";

/** One of the customer's own images, for its owner only. */
export async function GET(request: Request, { params }: RouteContext<"/api/uploads/[uploadId]">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { uploadId } = await params;
  const [row] = await db
    .select({ mediaKey: upload.mediaKey })
    .from(upload)
    .innerJoin(project, eq(upload.projectId, project.id))
    .where(and(eq(upload.id, uploadId), eq(project.userId, session.user.id)))
    .limit(1);
  const bytes = row ? await getMedia(row.mediaKey) : null;
  return bytes ? mediaResponse(bytes, imageTypeOf(row!.mediaKey), request) : new Response("Not found", { status: 404 });
}
