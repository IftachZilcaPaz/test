import { verifyPublicToken } from "@/lib/public-media.server";
import { getMedia, mediaResponse } from "@/lib/storage.server";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", mp4: "video/mp4" };

/** Serves one private file to an external model provider through a signed, expiring link. */
export async function GET(request: Request, { params }: RouteContext<"/api/public/[token]">) {
  const { token } = await params;
  const key = verifyPublicToken(token);
  if (!key) return new Response("Not found", { status: 404 });
  const bytes = await getMedia(key);
  if (!bytes) return new Response("Not found", { status: 404 });
  const type = TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  return mediaResponse(bytes, type, request);
}
