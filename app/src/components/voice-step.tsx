"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { approveTake, deleteTake, quoteNarration, recordNarration, selectVoice } from "@/app/app/projects/[id]/voice-actions";
import { canAfford, WalletLine } from "@/components/wallet-line";
import { customerPriceIls, formatCustomerPrice } from "@/lib/pricing";
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

  async function explainFailure() {
    // The <audio> element hides the server's reason; ask for it once.
    const response = await fetch(`/api/voices/${voiceId}/sample`).catch(() => null);
    setError(response && !response.ok ? await response.text() : "לא הצלחנו להשמיע את הדגימה. נסו שוב.");
    setState("error");
  }

  function toggle() {
    if (state === "playing" || state === "loading") {
      audioRef.current?.pause();
      return setState("idle");
    }
    document.dispatchEvent(new CustomEvent("voice-sample-play", { detail: voiceId }));
    setError(null);
    if (!audioRef.current) {
      const audio = new Audio(`/api/voices/${voiceId}/sample`);
      audio.preload = "auto";
      audio.onplaying = () => setState("playing");
      audio.onended = () => setState("idle");
      audio.onerror = () => void explainFailure();
      audioRef.current = audio;
    }
    audioRef.current.currentTime = 0;
    setState("loading");
    // play() is called inside the click, so the browser allows sound even though the
    // first sample takes a few seconds to render.
    audioRef.current.play().catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (reason instanceof DOMException && reason.name === "NotAllowedError") {
        setError("הדפדפן חסם את ההשמעה. לחצו שוב על האזנה.");
        return setState("error");
      }
      void explainFailure();
    });
  }

  return (
    <>
      <button type="button" onClick={toggle} className="btn px-4 py-2 text-sm" aria-label={`השמעת דגימה של ${voiceName(voiceId)}`}>
        {state === "loading" ? "טוען…" : state === "playing" ? "■ עצירה" : "▶ האזנה"}
      </button>
      {error && (
        <span role="alert" className="w-full text-xs text-bad">
          {error}
        </span>
      )}
    </>
  );
}

function TakePlayer({
  take,
  onApprove,
  onDelete,
  busy,
}: {
  take: TakeView;
  onApprove: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
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
        {take.durationSeconds.toFixed(1)} שניות קריינות · בסרטון (×{PLAYBACK_SPEED} + כרטיס סיום) כ־{finalSeconds.toFixed(1)} שניות · מחיר{" "}
        {formatCustomerPrice(take.costUsd)}
      </p>
      {!take.approved && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onApprove}>
            {busy ? "שומר…" : "אישור ההקראה"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onDelete}>
            מחיקה
          </button>
        </div>
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
  const [quote, setQuote] = useState<{ demo: boolean; usd: number; characters: number; duplicate: boolean; balanceIls: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selecting, startSelect] = useTransition();
  const [quoting, startQuote] = useTransition();
  const [recording, startRecord] = useTransition();
  const [approving, startApprove] = useTransition();
  const latest = takes[0];
  const newestRef = useRef<HTMLDivElement>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const seenLatest = useRef(latest?.id);

  // After a new take arrives, bring it into view so the customer sees what they paid for.
  useEffect(() => {
    if (latest && latest.id !== seenLatest.current) {
      seenLatest.current = latest.id;
      setFreshId(latest.id);
      newestRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [latest]);

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
            {!quote.demo && quote.duplicate && (
              <p role="alert" className="rounded-2xl bg-tint-3 px-4 py-3 text-sm text-ink">
                כבר יש לכם הקראה של אותו טקסט באותו קול (למטה). הקראה נוספת תיצור גרסה חדשה ותעלה שוב.
              </p>
            )}
            {quote.demo ? (
              <p className="text-ink-2">עוד לא חובר מפתח ElevenLabs, אז אי אפשר להקריא. הוסיפו ELEVENLABS_API_KEY ל-.env.local.</p>
            ) : (
              <>
                <p className="text-ink-2">
                  {quote.characters} תווים בקול של {voiceName(selectedVoiceId ?? "")}. המחיר <b>{formatCustomerPrice(quote.usd)}</b>.
                </p>
                <WalletLine balanceIls={quote.balanceIls} priceIls={customerPriceIls(quote.usd)} />
              </>
            )}
            <div className="flex gap-2">
              {!quote.demo && (
                <button type="button" className="btn btn-primary" disabled={!canAfford(quote.balanceIls, customerPriceIls(quote.usd))} onClick={record}>
                  {quote.duplicate ? "כן, הקראה נוספת" : "הקריאו"}
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
        takes.slice(0, 3).map((take, index) => (
          <div key={take.id} ref={index === 0 ? newestRef : undefined} className={take.id === freshId ? "rounded-[2rem] ring-4 ring-accent-2/60" : ""}>
            {take.id === freshId && <p className="px-2 pb-2 text-sm font-semibold text-accent">ההקראה החדשה ↓</p>}
          <TakePlayer
            take={take}
            busy={approving}
            onDelete={() => {
              if (!window.confirm("למחוק את ההקראה הזו? (העלות שכבר שולמה לא חוזרת)")) return;
              startApprove(async () => {
                const result = await deleteTake(take.id);
                if (result.error) setError(result.error);
                else router.refresh();
              });
            }}
            onApprove={() =>
              startApprove(async () => {
                const result = await approveTake(take.id);
                if (result.error) setError(result.error);
                else router.refresh();
              })
            }
          />
          </div>
        ))}
    </section>
  );
}
