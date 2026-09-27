import { getSession } from "@/lib/session";
import { audioResponse, getMedia, putMedia } from "@/lib/storage.server";
import { synthesize, VoiceError } from "@/lib/voice/tts.server";
import { isVoiceId, SAMPLE_TEXT } from "@/lib/voice/voices";

/**
 * Hebrew sample for the voice gallery. Rendered once per voice on first request and
 * cached, so customers can listen for free (one-time ~$0.01 per voice for us).
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/voices/[voiceId]/sample">) {
  if (!(await getSession())) return new Response("Unauthorized", { status: 401 });
  const { voiceId } = await params;
  if (!isVoiceId(voiceId)) return new Response("Not found", { status: 404 });

  const key = `voices/${voiceId}/sample-v1.mp3`;
  const cached = await getMedia(key);
  if (cached) return audioResponse(cached);
  try {
    const { audio } = await synthesize(SAMPLE_TEXT, voiceId);
    await putMedia(key, audio);
    return audioResponse(audio);
  } catch (error) {
    const message = error instanceof VoiceError ? error.message : "הדגימה לא זמינה כרגע.";
    return new Response(message, { status: 503 });
  }
}
