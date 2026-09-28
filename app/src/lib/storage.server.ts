import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

import { getStore } from "@netlify/blobs";
import { BlobNotFoundError, del, get, head, put } from "@vercel/blob";

/**
 * Media storage behind opaque keys. Callers never see where bytes live:
 * - Netlify: Netlify Blobs (site-private), picked when the Netlify runtime provides a blobs context.
 * - Vercel: private Vercel Blob, when BLOB_READ_WRITE_TOKEN is set.
 * - Otherwise (the Mac): files under data/media.
 * MEDIA_STORE=netlify|vercel|local forces a driver. Either way media is only
 * readable through the owner-checked API routes.
 */
type MediaStore = {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
};

const ROOT = join(process.cwd(), "data", "media");

function resolveKey(key: string): string {
  const path = normalize(join(ROOT, key));
  if (!path.startsWith(ROOT + sep)) throw new Error("Invalid media key");
  return path;
}

const localStore: MediaStore = {
  async put(key, bytes) {
    const path = resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  },
  async get(key) {
    try {
      return await readFile(resolveKey(key));
    } catch {
      return null;
    }
  },
  async delete(key) {
    await rm(resolveKey(key), { force: true });
  },
  async has(key) {
    try {
      return (await stat(resolveKey(key))).isFile();
    } catch {
      return false;
    }
  },
};

function blobPath(key: string): string {
  if (!/^[\w-]+(\/[\w.-]+)*$/.test(key) || key.includes("..")) throw new Error("Invalid media key");
  return `media/${key}`;
}

// Strong consistency: a render reads clips right after they were written.
const netlifyMedia = () => getStore({ name: "media", consistency: "strong" });

const netlifyStore: MediaStore = {
  async put(key, bytes) {
    await netlifyMedia().set(blobPath(key), new Blob([bytes as BlobPart]));
  },
  async get(key) {
    const data = await netlifyMedia().get(blobPath(key), { type: "arrayBuffer" });
    return data ? new Uint8Array(data) : null;
  },
  async delete(key) {
    await netlifyMedia().delete(blobPath(key));
  },
  async has(key) {
    return (await netlifyMedia().getMetadata(blobPath(key))) !== null;
  },
};

const blobStore: MediaStore = {
  async put(key, bytes) {
    await put(blobPath(key), Buffer.from(bytes), { access: "private", addRandomSuffix: false, allowOverwrite: true });
  },
  async get(key) {
    const result = await get(blobPath(key), { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  },
  async delete(key) {
    await del(blobPath(key));
  },
  async has(key) {
    try {
      await head(blobPath(key));
      return true;
    } catch (error) {
      if (error instanceof BlobNotFoundError) return false;
      throw error;
    }
  },
};

const STORES = { netlify: netlifyStore, vercel: blobStore, local: localStore } as const;

/** Resolved per call: Netlify injects its blobs context per request, not at boot. */
function store(): MediaStore {
  const forced = process.env.MEDIA_STORE as keyof typeof STORES | undefined;
  if (forced && forced in STORES) return STORES[forced];
  const netlifyContext = (globalThis as { netlifyBlobsContext?: string }).netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT;
  if (netlifyContext) return netlifyStore;
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobStore;
  return localStore;
}

export const putMedia = (key: string, bytes: Uint8Array) => store().put(key, bytes);
export const getMedia = (key: string) => store().get(key);
export const deleteMedia = (key: string) => store().delete(key);
export const hasMedia = (key: string) => store().has(key);

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
