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

export const sceneRequest = (prompt: string, seconds: number) => ({
  prompt,
  duration: Math.min(15, Math.max(4, Math.round(seconds))),
  resolution: "720p",
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
    if (response.status === 401) throw new SceneError("מפתח Higgsfield לא תקין. בדקו את HF_API_KEY ב-.env.local.");
    if (response.status === 402 || /balance|credit|insufficient/i.test(body)) throw new SceneError("אין מספיק יתרה בחשבון Higgsfield API.");
    if (response.status === 429) throw new SceneError("יותר מדי בקשות ברגע זה. נסו שוב בעוד דקה.");
    throw new SceneError("יצירת הסצנות לא זמינה כרגע. נסו שוב בעוד רגע.");
  }
  return response.status === 202 ? null : response.json();
}

/** Free price check before generating. */
export async function estimateScene(prompt: string, seconds: number): Promise<number> {
  const result = (await call(`/estimate/${MODEL_PATH}`, {
    method: "POST",
    body: JSON.stringify(sceneRequest(prompt, seconds)),
  })) as { usd?: string | number };
  const usd = Number(result.usd);
  if (!Number.isFinite(usd)) throw new SceneError("לא התקבל מחיר מ-Higgsfield.");
  return usd;
}

export async function submitScene(prompt: string, seconds: number): Promise<string> {
  const result = (await call(`/${MODEL_PATH}`, {
    method: "POST",
    body: JSON.stringify(sceneRequest(prompt, seconds)),
  })) as { request_id?: string };
  if (!result.request_id) throw new SceneError("Higgsfield לא החזיר מזהה בקשה.");
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
