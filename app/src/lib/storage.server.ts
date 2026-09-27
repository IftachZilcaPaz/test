import "server-only";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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

export async function hasMedia(key: string): Promise<boolean> {
  try {
    return (await stat(resolveKey(key))).isFile();
  } catch {
    return false;
  }
}

export function audioResponse(bytes: Uint8Array): Response {
  return new Response(new Blob([bytes as BlobPart], { type: "audio/mpeg" }), {
    headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" },
  });
}
