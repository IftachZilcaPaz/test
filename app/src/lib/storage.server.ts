import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

/**
 * Media storage. Locally files live under data/media; in production this module
 * is the single place to swap for S3/R2 — callers only see opaque keys.
 */
const ROOT = join(process.cwd(), "data", "media");

function resolveKey(key: string): string {
  const path = normalize(join(ROOT, key));
  if (!path.startsWith(ROOT + sep)) throw new Error("Invalid media key");
  return path;
}

export async function putMedia(key: string, bytes: Uint8Array): Promise<void> {
  const path = resolveKey(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export async function getMedia(key: string): Promise<Uint8Array | null> {
  try {
    return await readFile(resolveKey(key));
  } catch {
    return null;
  }
}

export async function deleteMedia(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true });
}

export async function hasMedia(key: string): Promise<boolean> {
  try {
    return (await stat(resolveKey(key))).isFile();
  } catch {
    return false;
  }
}

/** Serves stored media with HTTP Range support, so <video>/<audio> can seek. */
export function mediaResponse(bytes: Uint8Array, contentType: string, request?: Request): Response {
  const headers = { "content-type": contentType, "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
  const range = request?.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const start = range[1] ? Number(range[1]) : bytes.length - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    if (start >= 0 && start <= end && start < bytes.length) {
      return new Response(new Blob([bytes.subarray(start, end + 1) as BlobPart]), {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${start}-${end}/${bytes.length}`, "content-length": String(end - start + 1) },
      });
    }
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${bytes.length}` } });
  }
  return new Response(new Blob([bytes as BlobPart]), { headers: { ...headers, "content-length": String(bytes.length) } });
}

export function audioResponse(bytes: Uint8Array): Response {
  return new Response(new Blob([bytes as BlobPart], { type: "audio/mpeg" }), {
    headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" },
  });
}
