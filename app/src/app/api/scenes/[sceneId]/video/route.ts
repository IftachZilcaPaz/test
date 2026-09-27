import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { project, scene } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getMedia, mediaResponse } from "@/lib/storage.server";

/** Scene clip, served only to the project's owner. */
export async function GET(request: Request, { params }: RouteContext<"/api/scenes/[sceneId]/video">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { sceneId } = await params;
  const [row] = await db
    .select({ mediaKey: scene.mediaKey })
    .from(scene)
    .innerJoin(project, eq(scene.projectId, project.id))
    .where(and(eq(scene.id, sceneId), eq(project.userId, session.user.id)))
    .limit(1);
  const bytes = row?.mediaKey ? await getMedia(row.mediaKey) : null;
  return bytes ? mediaResponse(bytes, "video/mp4", request) : new Response("Not found", { status: 404 });
}
