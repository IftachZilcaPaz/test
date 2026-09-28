import { createHash } from "node:crypto";
import { getSession } from "@/lib/session";
import { audioResponse, getMedia, putMedia } from "@/lib/storage.server";
import { synthesize, VoiceError } from "@/lib/voice/tts.server";
import { isVoiceId } from "@/lib/voice/voices";

// A word or a short phrase: Hebrew letters, niqqud, spaces and Hebrew punctuation only.
const PHRASE = /^[֐-׿\s'"׳״-]{1,40}$/u;
// Previews are free for the customer (~10 characters each for us); this caps abuse.
const DAILY_LIMIT = 40;

/**
 * Pronunciation check for the lexicon: reads one pointed word aloud so the customer
 * can hear it before paying for a narration. Each (voice, text) is rendered once and
 * cached, so listening again or trying the same spelling later costs nothing.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const voice = url.searchParams.get("voice") ?? "";
  const text = (url.searchParams.get("text") ?? "").normalize("NFC").trim();
  if (!isVoiceId(voice)) return new Response("קול לא מוכר.", { status: 400 });
  if (!PHRASE.test(text)) return new Response("אפשר לבדוק מילה או צירוף קצר בעברית (עד 40 תווים).", { status: 400 });

  const key = `pronounce/${voice}/${createHash("sha256").update(text).digest("hex")}.mp3`;
  const cached = await getMedia(key);
  if (cached) return audioResponse(cached);

  const usageKey = `usage/pronounce/${session.user.id}/${new Date().toISOString().slice(0, 10)}.json`;
  const used = await readCount(usageKey);
  if (used >= DAILY_LIMIT) {
    return new Response("הגעתם למספר הבדיקות להיום. אפשר להמשיך מחר, או פשוט להקריא את התסריט.", { status: 429 });
  }
  try {
    const { audio } = await synthesize(text, voice);
    await Promise.all([putMedia(key, audio), putMedia(usageKey, new TextEncoder().encode(JSON.stringify({ count: used + 1 })))]);
    return audioResponse(audio);
  } catch (error) {
    const message = error instanceof VoiceError ? error.message : "הבדיקה לא זמינה כרגע.";
    return new Response(message, { status: 503 });
  }
}

async function readCount(key: string): Promise<number> {
  const bytes = await getMedia(key);
  if (!bytes) return 0;
  try {
    return Number((JSON.parse(new TextDecoder().decode(bytes)) as { count?: number }).count) || 0;
  } catch {
    return 0;
  }
}
