import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { project, render } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getMedia, mediaResponse } from "@/lib/storage.server";

/** Finished video for the owner; ?download=1 saves it as a file. */
export async function GET(request: Request, { params }: RouteContext<"/api/renders/[renderId]/video">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { renderId } = await params;
  const [row] = await db
    .select({ mediaKey: render.mediaKey, name: project.name })
    .from(render)
    .innerJoin(project, eq(render.projectId, project.id))
    .where(and(eq(render.id, renderId), eq(project.userId, session.user.id)))
    .limit(1);
  const bytes = row?.mediaKey ? await getMedia(row.mediaKey) : null;
  if (!bytes) return new Response("Not found", { status: 404 });
  const response = mediaResponse(bytes, "video/mp4", request);
  if (new URL(request.url).searchParams.has("download")) {
    const file = `${row!.name.replace(/[\\/:*?"<>|]/g, "").trim() || "video"}.mp4`;
    response.headers.set("content-disposition", `attachment; filename="video.mp4"; filename*=UTF-8''${encodeURIComponent(file)}`);
  }
  return response;
}
