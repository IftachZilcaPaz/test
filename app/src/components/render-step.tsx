"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { renderState, startRender } from "@/app/app/projects/[id]/render-actions";
import { END_CARD_SECONDS, PLAYBACK_SPEED, SPEEDS, type Speed } from "@/lib/script/hebrew";
import type { RenderCheck } from "@/lib/video/checks";

export type RenderView = {
  id: string;
  status: "rendering" | "done" | "failed";
  durationSeconds: number | null;
  checks: RenderCheck[] | null;
  error: string | null;
};

const SPEED_LABEL: Record<Speed, string> = { 1: "רגילה", 1.1: "קצת מהירה", 1.25: "מהירה (מומלץ לרילס)" };
const PRESENTER_SPEED_LABEL: Record<Speed, string> = { 1: "רגילה (מומלץ)", 1.1: "קצת מהירה", 1.25: "מהירה" };

export function RenderStep({
  projectId,
  ready,
  latest,
  narrationSeconds,
  presenter = false,
}: {
  projectId: string;
  ready: boolean;
  latest: RenderView | null;
  /** Length of the approved narration at normal speed, to show what each speed produces. */
  narrationSeconds: number | null;
  /** Presenter videos default to normal speed: sped-up lips look rushed. */
  presenter?: boolean;
}) {
  const router = useRouter();
  const [speed, setSpeed] = useState<Speed>(presenter ? 1 : (PLAYBACK_SPEED as Speed));
  const [error, setError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const rendering = latest?.status === "rendering";

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Each poll also moves the render forward a step, so polls never overlap.
  useEffect(() => {
    if (!rendering) return;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const state = await renderState(projectId);
        if (state.total) setProgress({ done: state.done ?? 0, total: state.total });
        if (state.status !== "rendering") router.refresh();
      } finally {
        inFlight = false;
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [rendering, projectId, router]);

  const start = () =>
    startTransition(async () => {
      setError(null);
      const result = await startRender(projectId, speed);
      if (result.error) setError(result.error);
      router.refresh();
    });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="render-title">
      <div className="clay flex flex-col gap-3 p-6 md:p-8">
        <h2 id="render-title" className="text-2xl">
          5 · הסרטון
        </h2>
        <p className="text-ink-2">
          {ready
            ? "מרכיבים הכול: הסצנות לפי הקריינות, כיתובים בעברית ברגע שאומרים אותם וכרטיס סיום. ההרכבה בחינם."
            : "קודם מאשרים את הסצנות."}
        </p>
        {ready && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-ink-2">מהירות הקריינות</legend>
            {presenter && <p className="mb-2 text-sm text-ink-3">בסרטון עם קריינית מומלץ רגילה: בהאצה גם השפתיים מואצות ונראות פחות טבעיות.</p>}
            <div className="flex flex-wrap gap-2">
              {SPEEDS.map((option) => (
                <label key={option} className="cursor-pointer">
                  <input
                    type="radio"
                    name="speed"
                    value={option}
                    checked={speed === option}
                    onChange={() => setSpeed(option)}
                    disabled={starting || rendering}
                    className="peer sr-only"
                  />
                  <span className="well flex flex-col rounded-2xl px-4 py-2 text-sm peer-checked:bg-accent peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                    <span className="font-semibold">
                      {presenter ? PRESENTER_SPEED_LABEL[option] : SPEED_LABEL[option]} <bdi dir="ltr">×{option}</bdi>
                    </span>
                    {narrationSeconds !== null && (
                      <span className="tabular-nums opacity-80">סרטון של כ־{(narrationSeconds / option + END_CARD_SECONDS).toFixed(0)} שניות</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {ready && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={starting || rendering} onClick={start}>
              {rendering ? (progress ? `מרכיב… ${progress.done}/${progress.total}` : "מרכיב…") : starting ? "מתחיל…" : latest?.status === "done" ? "הרכבה מחדש" : "הרכיבו לי את הסרטון"}
            </button>
          </div>
        )}
        {(error || latest?.status === "failed") && (
          <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">
            {error ?? latest?.error}
          </p>
        )}
      </div>

      {rendering && <div className="clay mx-auto aspect-[9/16] w-full max-w-sm animate-pulse" aria-busy="true" aria-label="מרכיב את הסרטון" />}

      {latest?.status === "done" && (
        <div className="clay grid gap-6 p-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:p-8">
          <video
            key={latest.id}
            src={`/api/renders/${latest.id}/video`}
            controls
            playsInline
            preload="metadata"
            className="aspect-[9/16] w-full rounded-3xl bg-ink"
          />
          <div className="flex flex-col gap-4">
            <h3 className="text-xl">הסרטון מוכן 🎬</h3>
            <p className="text-ink-2 tabular-nums">אורך: {latest.durationSeconds?.toFixed(1)} שניות · <bdi dir="ltr">720×1280</bdi> (אנכי, לרילס, טיקטוק וסטוריז)</p>
            {latest.checks && (
              <ul className="flex flex-col gap-2" aria-label="בדיקות אוטומטיות">
                {latest.checks.map((check) => (
                  <li key={check.label} className={`rounded-2xl px-4 py-2 text-sm ${check.ok ? "bg-good-soft text-good" : "bg-tint-3 text-ink"}`}>
                    {check.ok ? "✓" : "!"} {check.label}
                  </li>
                ))}
              </ul>
            )}
            <a href={`/api/renders/${latest.id}/video?download=1`} className="btn btn-primary self-start" download>
              הורדת הסרטון
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
