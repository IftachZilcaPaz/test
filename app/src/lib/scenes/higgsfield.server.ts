import "server-only";

/**
 * Higgsfield API (open.higgsfield.ai). Schema verified against
 * docs.higgsfield.ai/docs/models/seedance-2/text-to-video: prompt (required),
 * duration 4-15, resolution, aspect_ratio incl. 9:16, generate_audio.
 */
const MODEL_PATH = "bytedance/seedance-2.0/text-to-video";
// Same model, anchored to one reference image so every scene shows the same person and place.
const REFERENCE_PATH = "bytedance/seedance-2.0/reference-to-video";
// Default scene engine since a side-by-side test against Seedance (docs: kling-o3/image-reference: prompt,
// image_urls (optional), duration 3-15, aspect_ratio 9:16, sound on|off, mode std|pro|4k).
const KLING_PATH = "kling-video/o3/image-reference";
// Photoreal portrait model used for the video's recurring character (docs: soul-2/generate).
const LOOK_PATH = "higgsfield-ai/soul/v2/standard";
// Talking presenter, lip-synced to our own narration slice (docs: wan-2-7/image-to-video:
// image_url, audio_url, duration 2-15, resolution 720p|1080p; the frame follows the image).
const TALK_PATH = "wan/v2.7/image-to-video";
const base = () => process.env.HF_API_URL ?? "https://api.higgsfield.ai";

export class SceneError extends Error {}

function credential(): string | null {
  const whole = process.env.HF_API_KEY?.trim();
  if (whole) return whole;
  const id = process.env.HF_API_KEY_ID?.trim();
  const secret = process.env.HF_API_KEY_SECRET?.trim();
  return id && secret ? `${id}:${secret}` : null;
}

export const isSceneDemoMode = () => !credential();

/**
 * Clip quality the customer can choose. The final video is 720×1280, so 720p is the
 * full-quality choice; 480p is cheaper and a little softer once scaled up.
 */
export const RESOLUTIONS = ["480p", "720p"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** Which model films the scenes. The customer picks; the page offers Kling first. */
export const SCENE_MODELS = ["seedance", "kling"] as const;
export type SceneModel = (typeof SCENE_MODELS)[number];

/** Kling O3 at "std" (720p, the finished video's size), no generated sound: the narration is the soundtrack. */
const klingRequest = (prompt: string, seconds: number, referenceUrl?: string) => ({
  prompt,
  ...(referenceUrl ? { image_urls: [referenceUrl] } : {}),
  duration: Math.min(15, Math.max(3, Math.round(seconds))),
  aspect_ratio: "9:16",
  sound: "off",
  mode: "std",
});

export const sceneRequest = (prompt: string, seconds: number, resolution: Resolution = "720p", referenceUrl?: string) => ({
  prompt,
  ...(referenceUrl ? { image_urls: [referenceUrl] } : {}),
  duration: Math.min(15, Math.max(4, Math.round(seconds))),
  resolution,
  aspect_ratio: "9:16",
  // Our Hebrew narration is the soundtrack; generated audio would clash with it.
  generate_audio: false,
});

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const key = credential();
  if (!key) throw new SceneError("עוד לא חובר מפתח Higgsfield.");
  const response = await fetch(`${base()}${path}`, {
    ...init,
    headers: { authorization: `Key ${key}`, "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[scenes] Higgsfield error", { path, status: response.status, body: body.slice(0, 300) });
    if (response.status === 401) throw new SceneError("מפתח Higgsfield לא תקין. בדקו את HF_API_KEY.");
    if (response.status === 402 || /balance|credit|insufficient/i.test(body)) throw new SceneError("אין מספיק יתרה בחשבון Higgsfield API.");
    if (response.status === 429) throw new SceneError("יותר מדי בקשות ברגע זה. נסו שוב בעוד דקה.");
    throw new SceneError("יצירת הסצנות לא זמינה כרגע. נסו שוב בעוד רגע.");
  }
  return response.status === 202 ? null : response.json();
}

// Highest published Seedance 2.0 rate. Used only when the estimate endpoint returns no
// price, so a quote can never be below what Higgsfield will actually charge.
const FALLBACK_USD_PER_SECOND = 0.1408;

/** Reads the dollar price from an estimate, tolerating shapes beyond the documented `{ credits, usd }`. */
function usdFrom(result: unknown): number | null {
  const record = (result ?? {}) as Record<string, unknown>;
  const nested = (key: string) => (record[key] as Record<string, unknown> | undefined)?.usd;
  for (const candidate of [record.usd, record.cost_usd, record.price_usd, nested("price"), nested("cost"), nested("estimate")]) {
    const usd = Number(candidate);
    if (candidate !== null && candidate !== undefined && candidate !== "" && Number.isFinite(usd) && usd >= 0) return usd;
  }
  return null;
}

// Kling O3 has no published API price (the estimate returns it); used only when the estimate carries none, set high so a quote never undercuts.
const FALLBACK_KLING_USD_PER_SECOND = 0.2;

/** The endpoint and body for one scene clip on the chosen model. */
function sceneCall(model: SceneModel, prompt: string, seconds: number, resolution: Resolution, referenceUrl?: string) {
  if (model === "kling") return { path: KLING_PATH, body: klingRequest(prompt, seconds, referenceUrl), perSecond: FALLBACK_KLING_USD_PER_SECOND };
  return {
    path: referenceUrl ? REFERENCE_PATH : MODEL_PATH,
    body: sceneRequest(prompt, seconds, resolution, referenceUrl),
    perSecond: FALLBACK_USD_PER_SECOND,
  };
}

/** Free price check before generating. */
export async function estimateScene(
  prompt: string,
  seconds: number,
  resolution: Resolution = "720p",
  referenceUrl?: string,
  model: SceneModel = "seedance",
): Promise<number> {
  const { path, body, perSecond } = sceneCall(model, prompt, seconds, resolution, referenceUrl);
  const result = await call(`/estimate/${path}`, { method: "POST", body: JSON.stringify(body) });
  const usd = usdFrom(result);
  if (usd !== null) return usd;
  console.error("[scenes] estimate without a price", { model, response: JSON.stringify(result).slice(0, 400) });
  return Math.round(body.duration * perSecond * 10_000) / 10_000;
}

async function submit(path: string, body: unknown): Promise<string> {
  const result = (await call(`/${path}`, { method: "POST", body: JSON.stringify(body) })) as { request_id?: string } | null;
  if (!result?.request_id) {
    console.error("[scenes] submit without request_id", { path, response: JSON.stringify(result).slice(0, 400) });
    throw new SceneError("Higgsfield לא החזיר מזהה בקשה.");
  }
  return result.request_id;
}

export async function submitScene(
  prompt: string,
  seconds: number,
  resolution: Resolution = "720p",
  referenceUrl?: string,
  model: SceneModel = "seedance",
): Promise<string> {
  const { path, body } = sceneCall(model, prompt, seconds, resolution, referenceUrl);
  return submit(path, body);
}

/** The recurring character/place as one vertical photo, used as every scene's reference. */
const lookRequest = (prompt: string) => ({ prompt, aspect_ratio: "9:16", resolution: "720p" });

// Used only if the estimate carries no price; above Soul v2's list price so a quote never undercuts.
const FALLBACK_LOOK_USD = 0.1;

export async function estimateLook(prompt: string): Promise<number> {
  const result = await call(`/estimate/${LOOK_PATH}`, { method: "POST", body: JSON.stringify(lookRequest(prompt)) });
  const usd = usdFrom(result);
  if (usd !== null) return usd;
  console.error("[scenes] look estimate without a price", { response: JSON.stringify(result).slice(0, 400) });
  return FALLBACK_LOOK_USD;
}

export const submitLook = (prompt: string) => submit(LOOK_PATH, lookRequest(prompt));

/** The presenter clip: always 720p (Wan has no 480p), as long as its audio slice. */
export const talkRequest = (prompt: string, imageUrl: string, audioUrl: string, seconds: number) => ({
  prompt,
  image_url: imageUrl,
  audio_url: audioUrl,
  duration: Math.min(15, Math.max(2, Math.ceil(seconds))),
  resolution: "720p",
  negative_prompt: "text, captions, subtitles, watermark, logo, extra people, distorted face, blurry mouth",
});

// Used only when the estimate carries no price; above Wan 2.7's 720p list rates so a quote never undercuts.
const FALLBACK_TALK_USD_PER_SECOND = 0.15;

export async function estimateTalk(prompt: string, imageUrl: string, audioUrl: string, seconds: number): Promise<number> {
  const request = talkRequest(prompt, imageUrl, audioUrl, seconds);
  const result = await call(`/estimate/${TALK_PATH}`, { method: "POST", body: JSON.stringify(request) });
  const usd = usdFrom(result);
  if (usd !== null) return usd;
  console.error("[scenes] talk estimate without a price", { response: JSON.stringify(result).slice(0, 400) });
  return Math.round(request.duration * FALLBACK_TALK_USD_PER_SECOND * 10_000) / 10_000;
}

export const submitTalk = (prompt: string, imageUrl: string, audioUrl: string, seconds: number) =>
  submit(TALK_PATH, talkRequest(prompt, imageUrl, audioUrl, seconds));

export type SceneStatus =
  | { state: "pending" }
  | { state: "completed"; videoUrl: string }
  | { state: "failed"; reason: string };

/** Status of any request; `videoUrl` is the output file (a video, or the first image for image models). */
export async function sceneStatus(requestId: string): Promise<SceneStatus> {
  const result = (await call(`/requests/${encodeURIComponent(requestId)}/status`)) as {
    status?: string;
    video?: { url?: string };
    images?: { url?: string }[];
    error?: string;
  };
  const output = result.video?.url ?? result.images?.[0]?.url;
  switch (result.status) {
    case "completed":
      return output ? { state: "completed", videoUrl: output } : { state: "failed", reason: "הבקשה הסתיימה בלי קובץ." };
    case "failed":
      return { state: "failed", reason: "יצירת הסצנה נכשלה (לא חויבתם)." };
    case "nsfw":
      return { state: "failed", reason: "הסצנה נחסמה בסינון התוכן (לא חויבתם). נסחו אחרת." };
    case "canceled":
      return { state: "failed", reason: "הסצנה בוטלה." };
    default:
      return { state: "pending" };
  }
}
