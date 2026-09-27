import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { project, voiceTake } from "@/db/schema";
import { getSession } from "@/lib/session";
import { audioResponse, getMedia } from "@/lib/storage.server";

/** Narration audio, served only to the project's owner. */
export async function GET(_request: Request, { params }: RouteContext<"/api/takes/[takeId]/audio">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { takeId } = await params;
  const [row] = await db
    .select({ audioKey: voiceTake.audioKey })
    .from(voiceTake)
    .innerJoin(project, eq(voiceTake.projectId, project.id))
    .where(and(eq(voiceTake.id, takeId), eq(project.userId, session.user.id)))
    .limit(1);
  const bytes = row && (await getMedia(row.audioKey));
  return bytes ? audioResponse(bytes) : new Response("Not found", { status: 404 });
}
