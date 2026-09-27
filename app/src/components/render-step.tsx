"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { renderState, startRender } from "@/app/app/projects/[id]/render-actions";
import type { RenderCheck } from "@/lib/video/checks";

export type RenderView = {
  id: string;
  status: "rendering" | "done" | "failed";
  durationSeconds: number | null;
  checks: RenderCheck[] | null;
  error: string | null;
};

export function RenderStep({ projectId, ready, latest }: { projectId: string; ready: boolean; latest: RenderView | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const rendering = latest?.status === "rendering";

  useEffect(() => {
    if (!rendering) return;
    const timer = setInterval(async () => {
      const { status } = await renderState(projectId);
      if (status !== "rendering") router.refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [rendering, projectId, router]);

  const start = () =>
    startTransition(async () => {
      setError(null);
      const result = await startRender(projectId);
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
            ? "מרכיבים הכול: הסצנות לפי הקריינות, כיתובים בעברית ברגע שאומרים אותם, קריינות מואצת ×1.25 וכרטיס סיום. ההרכבה בחינם."
            : "קודם מאשרים את הסצנות."}
        </p>
        {ready && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={starting || rendering} onClick={start}>
              {rendering ? "מרכיב… (עד דקה)" : starting ? "מתחיל…" : latest?.status === "done" ? "הרכבה מחדש" : "הרכיבו לי את הסרטון"}
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
            <p className="text-ink-2 tabular-nums">אורך: {latest.durationSeconds?.toFixed(1)} שניות · 720×1280 (אנכי, לרילס, טיקטוק וסטוריז)</p>
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
