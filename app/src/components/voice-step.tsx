"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { approveTake, quoteNarration, recordNarration, selectVoice } from "@/app/app/projects/[id]/voice-actions";
import { formatIls, formatUsd } from "@/lib/money";
import { END_CARD_SECONDS, PLAYBACK_SPEED } from "@/lib/script/hebrew";
import { VOICES, type TimedWord } from "@/lib/voice/voices";

export type TakeView = {
  id: string;
  voiceId: string;
  durationSeconds: number;
  words: TimedWord[];
  costUsd: number;
  approved: boolean;
};

const voiceName = (id: string) => VOICES.find((voice) => voice.id === id)?.name ?? "קול";
const GENDER = { male: "גבר", female: "אישה", neutral: "ניטרלי" } as const;

function SamplePlayer({ voiceId }: { voiceId: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  async function toggle() {
    if (state === "playing") {
      audioRef.current?.pause();
      return setState("idle");
    }
    // Stop any other sample that is playing.
    document.dispatchEvent(new CustomEvent("voice-sample-play", { detail: voiceId }));
    setState("loading");
    setError(null);
    if (!audioRef.current) {
      const response = await fetch(`/api/voices/${voiceId}/sample`);
      if (!response.ok) {
        setError(await response.text());
        return setState("error");
      }
      const audio = new Audio(URL.createObjectURL(await response.blob()));
      audio.onended = () => setState("idle");
      audioRef.current = audio;
    }
    audioRef.current.currentTime = 0;
    await audioRef.current.play();
    setState("playing");
  }

  useEffect(() => {
    const stop = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== voiceId && audioRef.current) {
        audioRef.current.pause();
        setState("idle");
      }
    };
    document.addEventListener("voice-sample-play", stop);
    return () => document.removeEventListener("voice-sample-play", stop);
  }, [voiceId]);

  return (
    <>
      <button type="button" onClick={toggle} disabled={state === "loading"} className="btn px-4 py-2 text-sm" aria-label={`השמעת דגימה של ${voiceName(voiceId)}`}>
        {state === "loading" ? "טוען…" : state === "playing" ? "■ עצירה" : "▶ האזנה"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-bad">
          {error}
        </span>
      )}
    </>
  );
}

function TakePlayer({ take, onApprove, approving }: { take: TakeView; onApprove: () => void; approving: boolean }) {
  const [now, setNow] = useState(-1);
  const finalSeconds = take.durationSeconds / PLAYBACK_SPEED + END_CARD_SECONDS;
  return (
    <article className={`clay flex flex-col gap-4 p-6 ${take.approved ? "ring-4 ring-accent/40" : ""}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg">ההקראה בקול של {voiceName(take.voiceId)}</h3>
        {take.approved && <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">מאושר</span>}
      </header>
      <audio
        controls
        preload="metadata"
        src={`/api/takes/${take.id}/audio`}
        onTimeUpdate={(event) => setNow(event.currentTarget.currentTime)}
        onEnded={() => setNow(-1)}
        className="w-full"
      />
      {take.words.length > 0 && (
        <p className="well rounded-2xl p-4 text-lg leading-9" aria-label="הטקסט עם סימון המילה שנשמעת עכשיו">
          {take.words.map((word, index) => (
            <span
              key={index}
              className={`rounded-md px-0.5 transition-colors ${now >= word.start && now < word.end ? "bg-accent text-white" : ""}`}
            >
              {word.word}{" "}
            </span>
          ))}
        </p>
      )}
      <p className="text-sm text-ink-2 tabular-nums">
        {take.durationSeconds.toFixed(1)} שניות קריינות · בסרטון (×{PLAYBACK_SPEED} + כרטיס סיום) כ־{finalSeconds.toFixed(1)} שניות · עלות{" "}
        {formatIls(take.costUsd)}
      </p>
      {!take.approved && (
        <button type="button" className="btn btn-primary self-start" disabled={approving} onClick={onApprove}>
          {approving ? "שומר…" : "אישור ההקראה"}
        </button>
      )}
    </article>
  );
}

export function VoiceStep({
  projectId,
  ready,
  selectedVoiceId,
  takes,
}: {
  projectId: string;
  ready: boolean;
  selectedVoiceId: string | null;
  takes: TakeView[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [quote, setQuote] = useState<{ demo: boolean; usd: number; characters: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selecting, startSelect] = useTransition();
  const [quoting, startQuote] = useTransition();
  const [recording, startRecord] = useTransition();
  const [approving, startApprove] = useTransition();
  const latest = takes[0];

  const choose = (voiceId: string) =>
    startSelect(async () => {
      setError(null);
      const result = await selectVoice(projectId, voiceId);
      if (result.error) setError(result.error);
      else router.refresh();
    });

  const askPrice = () =>
    startQuote(async () => {
      setError(null);
      const result = await quoteNarration(projectId);
      if ("error" in result) return setError(result.error);
      setQuote(result);
      dialogRef.current?.showModal();
    });

  const record = () => {
    dialogRef.current?.close();
    startRecord(async () => {
      const result = await recordNarration(projectId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="voice-title">
      <div className="clay flex flex-col gap-4 p-6 md:p-8">
        <div>
          <h2 id="voice-title" className="text-2xl">
            3 · קול
          </h2>
          <p className="text-ink-2">
            {ready ? "האזינו לדגימות (בחינם), בחרו קול, ושמעו את התסריט שלכם." : "קודם מאשרים תסריט, ואז בוחרים קול."}
          </p>
        </div>

        {ready && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="קולות">
            {VOICES.map((voice) => {
              const selected = voice.id === selectedVoiceId;
              return (
                <li key={voice.id} className={`well flex flex-col gap-2 rounded-3xl p-4 ${selected ? "ring-4 ring-accent/50" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-round text-lg">{voice.name}</span>
                    <span className="rounded-full bg-card px-2 py-0.5 text-xs text-ink-2">{GENDER[voice.gender]}</span>
                  </div>
                  <span className="text-sm text-ink-2">{voice.description}</span>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <SamplePlayer voiceId={voice.id} />
                    <button
                      type="button"
                      className={`btn px-4 py-2 text-sm ${selected ? "btn-primary" : "btn-ghost"}`}
                      aria-pressed={selected}
                      disabled={selecting}
                      onClick={() => choose(voice.id)}
                    >
                      {selected ? "נבחר ✓" : "בחירה"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {ready && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={!selectedVoiceId || quoting || recording} onClick={askPrice}>
              {recording ? "מקריא… (כמה שניות)" : quoting ? "מחשב מחיר…" : latest ? "הקראה נוספת" : "הקריאו את התסריט שלי"}
            </button>
            {!selectedVoiceId && <span className="text-sm text-ink-3">קודם בוחרים קול</span>}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">
            {error}
          </p>
        )}
      </div>

      <dialog ref={dialogRef} className="clay m-auto w-[min(28rem,calc(100vw-2rem))] p-6 backdrop:bg-ink/30" aria-labelledby="voice-price-title">
        {quote && (
          <div className="flex flex-col gap-4">
            <h3 id="voice-price-title" className="text-xl">
              לפני שמקריאים
            </h3>
            {quote.demo ? (
              <p className="text-ink-2">עוד לא חובר מפתח ElevenLabs, אז אי אפשר להקריא. הוסיפו ELEVENLABS_API_KEY ל-.env.local.</p>
            ) : (
              <p className="text-ink-2">
                {quote.characters} תווים בקול של {voiceName(selectedVoiceId ?? "")}. העלות <b>{formatIls(quote.usd)}</b>{" "}
                <span className="text-ink-3" dir="ltr">
                  ({formatUsd(quote.usd)})
                </span>
                .
              </p>
            )}
            <div className="flex gap-2">
              {!quote.demo && (
                <button type="button" className="btn btn-primary" onClick={record}>
                  הקריאו
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>
                {quote.demo ? "סגירה" : "ביטול"}
              </button>
            </div>
          </div>
        )}
      </dialog>

      {recording && <div className="clay h-48 animate-pulse" aria-busy="true" aria-label="מקריא" />}
      {!recording &&
        takes.slice(0, 3).map((take) => (
          <TakePlayer
            key={take.id}
            take={take}
            approving={approving}
            onApprove={() =>
              startApprove(async () => {
                const result = await approveTake(take.id);
                if (result.error) setError(result.error);
                else router.refresh();
              })
            }
          />
        ))}
    </section>
  );
}
