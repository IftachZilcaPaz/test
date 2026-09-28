import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived public links to private media. Higgsfield only accepts public URLs for
 * reference images, so a stored file is exposed through an HMAC-signed, expiring token:
 * nothing is guessable, and the link stops working after `ttlSeconds`.
 */
const secret = () => {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is required to sign media links");
  return value;
};

const sign = (payload: string) => createHmac("sha256", secret()).update(`public-media:${payload}`).digest("base64url");

export function publicMediaUrl(key: string, ttlSeconds = 2 * 60 * 60): string {
  const base = process.env.BETTER_AUTH_URL;
  if (!base) throw new Error("BETTER_AUTH_URL is required to build public media links");
  const payload = Buffer.from(JSON.stringify({ k: key, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  // The extension lets the fetcher infer the type from the URL alone.
  const extension = key.match(/\.(png|jpe?g|webp|mp3|mp4)$/i)?.[0] ?? "";
  return `${base.replace(/\/$/, "")}/api/public/${payload}.${sign(payload)}${extension}`;
}

/** The media key a token grants, or null when it is forged, malformed or expired. */
export function verifyPublicToken(token: string): string | null {
  const [payload, signature] = token.replace(/\.(png|jpe?g|webp|mp3|mp4)$/i, "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { k, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { k?: unknown; e?: unknown };
    if (typeof k !== "string" || typeof e !== "number" || e < Date.now() / 1000) return null;
    return k;
  } catch {
    return null;
  }
}
