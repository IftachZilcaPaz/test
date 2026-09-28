import { getOwnedProject } from "@/lib/projects.server";
import { getSession } from "@/lib/session";
import { getMedia, mediaResponse } from "@/lib/storage.server";

/** The project's character image, for its owner only. */
export async function GET(request: Request, { params }: RouteContext<"/api/projects/[id]/look">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const item = await getOwnedProject(session.user.id, id);
  const bytes = item?.lookImageKey ? await getMedia(item.lookImageKey) : null;
  if (!bytes) return new Response("Not found", { status: 404 });
  const extension = item!.lookImageKey!.split(".").pop()?.toLowerCase();
  const type = extension === "webp" ? "image/webp" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : "image/png";
  return mediaResponse(bytes, type, request);
}
