import "server-only";
import type { TimedWord } from "./voices";

const MODEL = "eleven_v3"; // Hebrew tested 5/5; eleven_multilingual_v2 was 1/5.

export class VoiceError extends Error {}

export const isVoiceDemoMode = () => !process.env.ELEVENLABS_API_KEY;

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/** Groups ElevenLabs' character timings into word timings (for captions and karaoke). */
export function wordsFromAlignment(alignment: Alignment | null | undefined): TimedWord[] {
  if (!alignment) return [];
  const words: TimedWord[] = [];
  let current: TimedWord | null = null;
  alignment.characters.forEach((char, index) => {
    if (/\s/u.test(char)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    const start = alignment.character_start_times_seconds[index] ?? 0;
    const end = alignment.character_end_times_seconds[index] ?? start;
    if (current) {
      current.word += char;
      current.end = end;
    } else {
      current = { word: char, start, end };
    }
  });
  if (current) words.push(current);
  return words;
}

async function explain(response: Response): Promise<VoiceError> {
  const body = await response.text().catch(() => "");
  console.error("[voice] ElevenLabs error", { status: response.status, body: body.slice(0, 300) });
  // ElevenLabs answers 401 for several different problems; the reason is in detail.status.
  let reason = "";
  try {
    reason = String((JSON.parse(body) as { detail?: { status?: string } }).detail?.status ?? "");
  } catch {
    // Not JSON: fall back to the HTTP status below.
  }
  if (reason === "detected_unusual_activity") {
    return new VoiceError("ElevenLabs חסמו את החשבון החינמי לשימוש משרת. צריך מנוי בתשלום (Starter ומעלה) ב-elevenlabs.io.");
  }
  if (reason === "quota_exceeded" && /API key/i.test(body)) {
    // A credit cap set on the key itself; the account may still have credits.
    return new VoiceError("המפתח של ElevenLabs הגיע למגבלת הקרדיטים שהוגדרה לו. הגדילו אותה ב-elevenlabs.io תחת API Keys.");
  }
  if (reason === "quota_exceeded" || /quota|credits|insufficient/i.test(body)) {
    return new VoiceError("נגמרו הקרדיטים בחשבון ElevenLabs.");
  }
  if (reason === "missing_permissions") {
    return new VoiceError("למפתח ElevenLabs חסרות הרשאות (Text to Speech ו-Voices). צרו מפתח עם ההרשאות האלה.");
  }
  if (response.status === 401) return new VoiceError("מפתח ElevenLabs לא תקין. בדקו את ELEVENLABS_API_KEY.");
  if (response.status === 429) return new VoiceError("יותר מדי בקשות ברגע זה. נסו שוב בעוד דקה.");
  return new VoiceError("הקריין לא זמין כרגע. נסו שוב בעוד רגע.");
}

/** Hebrew speech with word timings, in one call. */
export async function synthesize(text: string, voiceId: string): Promise<{ audio: Uint8Array; words: TimedWord[]; duration: number }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new VoiceError("עוד לא חובר מפתח ElevenLabs.");
  const response = await fetch(
    `${process.env.ELEVENLABS_API_URL ?? "https://api.elevenlabs.io"}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL, language_code: "he" }),
    },
  );
  if (!response.ok) throw await explain(response);
  const payload = (await response.json()) as { audio_base64: string; alignment?: Alignment | null };
  const words = wordsFromAlignment(payload.alignment);
  const audio = Uint8Array.from(Buffer.from(payload.audio_base64, "base64"));
  return { audio, words, duration: words.at(-1)?.end ?? 0 };
}
