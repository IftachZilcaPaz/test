import "server-only";

/**
 * Higgsfield API (open.higgsfield.ai). Schema verified against
 * docs.higgsfield.ai/docs/models/seedance-2/text-to-video: prompt (required),
 * duration 4-15, resolution, aspect_ratio incl. 9:16, generate_audio.
 */
const MODEL_PATH = "bytedance/seedance-2.0/text-to-video";
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

export const sceneRequest = (prompt: string, seconds: number, resolution: Resolution = "720p") => ({
  prompt,
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

/** Free price check before generating. */
export async function estimateScene(prompt: string, seconds: number, resolution: Resolution = "720p"): Promise<number> {
  const request = sceneRequest(prompt, seconds, resolution);
  const result = await call(`/estimate/${MODEL_PATH}`, { method: "POST", body: JSON.stringify(request) });
  const usd = usdFrom(result);
  if (usd !== null) return usd;
  console.error("[scenes] estimate without a price", { response: JSON.stringify(result).slice(0, 400) });
  return Math.round(request.duration * FALLBACK_USD_PER_SECOND * 10_000) / 10_000;
}

export async function submitScene(prompt: string, seconds: number, resolution: Resolution = "720p"): Promise<string> {
  const result = (await call(`/${MODEL_PATH}`, {
    method: "POST",
    body: JSON.stringify(sceneRequest(prompt, seconds, resolution)),
  })) as { request_id?: string };
  if (!result?.request_id) {
    console.error("[scenes] submit without request_id", { response: JSON.stringify(result).slice(0, 400) });
    throw new SceneError("Higgsfield לא החזיר מזהה בקשה.");
  }
  return result.request_id;
}

export type SceneStatus =
  | { state: "pending" }
  | { state: "completed"; videoUrl: string }
  | { state: "failed"; reason: string };

export async function sceneStatus(requestId: string): Promise<SceneStatus> {
  const result = (await call(`/requests/${encodeURIComponent(requestId)}/status`)) as {
    status?: string;
    video?: { url?: string };
    error?: string;
  };
  switch (result.status) {
    case "completed":
      return result.video?.url ? { state: "completed", videoUrl: result.video.url } : { state: "failed", reason: "הסצנה הסתיימה בלי קובץ." };
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
