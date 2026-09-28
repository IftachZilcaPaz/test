"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  approveScenes,
  type SceneMode,
  generateScenes,
  quoteScenes,
  refreshScenes,
  resetScene,
  updateScenePrompt,
} from "@/app/app/projects/[id]/scene-actions";
import { canAfford, WalletLine } from "@/components/wallet-line";
import type { Resolution } from "@/lib/scenes/higgsfield.server";
import { formatCustomerPrice, formatShekels } from "@/lib/pricing";

export type SceneView = {
  id: string;
  position: number;
  caption: string;
  prompt: string;
  seconds: number;
  status: "draft" | "generating" | "ready" | "failed";
  demo: boolean;
  costUsd: number;
  error: string | null;
};

const STATUS = {
  draft: { label: "ממתינה ליצירה", className: "bg-well text-ink-2" },
  generating: { label: "נוצרת עכשיו…", className: "bg-tint-3 text-ink" },
  ready: { label: "מוכנה", className: "bg-good-soft text-good" },
  failed: { label: "נכשלה", className: "bg-bad-soft text-bad" },
} as const;

function SceneCard({ item, onError }: { item: SceneView; onError: (message: string) => void }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(item.prompt);
  const [pending, startTransition] = useTransition();
  const status = STATUS[item.status];
  const dirty = prompt.trim() !== item.prompt;

  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (result.error) onError(result.error);
      else router.refresh();
    });

  return (
    <li className="clay flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-round text-lg">סצנה {item.position + 1}</span>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>
          {item.demo && item.status === "ready" ? "דוגמה" : status.label}
        </span>
      </div>
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-3xl bg-well">
        {item.status === "ready" ? (
          <video src={`/api/scenes/${item.id}/video`} className="size-full object-cover" muted loop playsInline autoPlay preload="metadata" />
        ) : (
          <div className={`grid size-full place-items-center text-sm text-ink-3 ${item.status === "generating" ? "animate-pulse" : ""}`}>
            {item.status === "generating" ? (item.demo ? "יוצר סצנה לדוגמה…" : "Higgsfield יוצר את הסצנה…") : `${item.seconds} שניות`}
          </div>
        )}
        {/* Caption preview, as it will appear in the video. */}
        <p className="absolute inset-x-3 bottom-4 rounded-2xl bg-ink/75 px-3 py-2 text-center text-sm font-bold text-white">{item.caption}</p>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-2">
        מה רואים (באנגלית, בלי טקסט על המסך)
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          dir="ltr"
          rows={3}
          disabled={item.status === "generating"}
          className="field text-start text-sm leading-6"
        />
      </label>
      {item.error && <p className="text-xs text-bad">{item.error}</p>}
      <div className="flex flex-wrap gap-2">
        {dirty && (
          <button type="button" className="btn px-4 py-2 text-sm" disabled={pending} onClick={() => run(() => updateScenePrompt(item.id, prompt))}>
            שמירת התיאור
          </button>
        )}
        {item.status === "ready" && !dirty && (
          <button type="button" className="btn btn-ghost px-4 py-2 text-sm" disabled={pending} onClick={() => run(() => resetScene(item.id))}>
            ליצור מחדש
          </button>
        )}
      </div>
    </li>
  );
}

export function SceneStep({
  projectId,
  ready,
  scenes,
  approved,
  realAvailable,
}: {
  projectId: string;
  ready: boolean;
  scenes: SceneView[];
  approved: boolean;
  /** A Higgsfield key is configured, so real clips can be ordered besides the free placeholders. */
  realAvailable: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [quote, setQuote] = useState<{ demo: boolean; usd: number; count: number; priceIls: number; balanceIls: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<Resolution>("720p");
  const [quoting, startQuote] = useTransition();
  const [generating, startGenerate] = useTransition();
  const [approving, startApprove] = useTransition();
  const waiting = scenes.some((item) => item.status === "generating");
  const demoTodo = scenes.filter((item) => item.status === "draft" || item.status === "failed").length;
  // Real clips also replace placeholders that are already there.
  const realTodo = demoTodo + scenes.filter((item) => item.status === "ready" && item.demo).length;
  const allReady = scenes.length > 0 && scenes.every((item) => item.status === "ready");
  const spent = scenes.reduce((sum, item) => sum + (item.status === "ready" ? item.costUsd : 0), 0);

  // Real clips take a minute or two; demo placeholders are made a couple per poll, so poll faster.
  const demoWaiting = scenes.some((item) => item.status === "generating" && item.demo);
  useEffect(() => {
    if (!waiting) return;
    let inFlight = false; // never overlap polls: a slow one would render the same clips twice
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { generating: left } = await refreshScenes(projectId);
        if (left === 0) router.refresh();
      } finally {
        inFlight = false;
      }
    }, demoWaiting ? 1500 : 5000);
    return () => clearInterval(timer);
  }, [waiting, demoWaiting, projectId, router]);

  const askPrice = (mode: SceneMode, resolution: Resolution = quality) =>
    startQuote(async () => {
      setError(null);
      const result = await quoteScenes(projectId, mode, resolution);
      if ("error" in result) return setError(result.error);
      setQuote(result);
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
    });

  const chooseQuality = (resolution: Resolution) => {
    setQuality(resolution);
    askPrice("real", resolution); // the price depends on the quality: ask Higgsfield again
  };

  const generate = (mode: SceneMode) => {
    dialogRef.current?.close();
    startGenerate(async () => {
      const result = await generateScenes(projectId, mode, quality);
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="scenes-title">
      <div className="clay flex flex-col gap-3 p-6 md:p-8">
        <h2 id="scenes-title" className="text-2xl">
          4 · סצנות
        </h2>
        <p className="text-ink-2">
          {ready
            ? "סצנה לכל חלק בקריינות. הכיתוב מצוטט מהקריינות מילה במילה, והסצנות עצמן בלי שום טקסט — את הכיתוב בעברית אנחנו מוסיפים."
            : "קודם מאשרים הקראה, ואז יוצרים סצנות."}
        </p>
        {ready && (
          <div className="flex flex-wrap items-center gap-3">
            {realAvailable ? (
              <>
                {realTodo > 0 && (
                  <button type="button" className="btn btn-primary" disabled={quoting || generating || waiting} onClick={() => askPrice("real")}>
                    {generating ? "שולח…" : quoting ? "מחשב מחיר…" : `סצנות אמיתיות (${realTodo})`}
                  </button>
                )}
                {demoTodo > 0 && (
                  <button type="button" className="btn btn-ghost" disabled={quoting || generating || waiting} onClick={() => generate("demo")}>
                    סצנות לדוגמה (חינם)
                  </button>
                )}
              </>
            ) : (
              demoTodo > 0 && (
                <button type="button" className="btn btn-primary" disabled={quoting || generating || waiting} onClick={() => askPrice("demo")}>
                  {generating ? "שולח…" : quoting ? "מחשב מחיר…" : `יצירת ${demoTodo} סצנות`}
                </button>
              )
            )}
            {allReady && !approved && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={approving}
                onClick={() =>
                  startApprove(async () => {
                    const result = await approveScenes(projectId);
                    if (result.error) setError(result.error);
                    else router.refresh();
                  })
                }
              >
                {approving ? "שומר…" : "אישור הסצנות — לסרטון"}
              </button>
            )}
            {waiting && (
              <span className="text-sm text-ink-2">
                {demoWaiting ? "יוצרים סצנות לדוגמה…" : "הסצנות נוצרות ב-Higgsfield (בדרך כלל דקה-שתיים). אפשר להישאר בעמוד."}
              </span>
            )}
            {realAvailable && !waiting && demoTodo === 0 && realTodo > 0 && (
              <span className="text-sm text-ink-3">הסצנות הנוכחיות הן לדוגמה. כשהסרטון נראה לכם טוב — מחליפים לאמיתיות.</span>
            )}
            {spent > 0 && <span className="text-sm text-ink-3">שילמתם על הסצנות: {formatCustomerPrice(spent)}</span>}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">
            {error}
          </p>
        )}
      </div>

      <dialog ref={dialogRef} className="clay m-auto w-[min(28rem,calc(100vw-2rem))] p-6 backdrop:bg-ink/30" aria-labelledby="scene-price-title">
        {quote && (
          <div className="flex flex-col gap-4">
            <h3 id="scene-price-title" className="text-xl">
              לפני שיוצרים
            </h3>
            {quote.demo ? (
              <p className="text-ink-2">
                <b>סצנות לדוגמה — בחינם.</b> כל סצנה תהיה רקע צבעוני, כדי לראות את כל הסרטון — קריינות, כיתובים ותזמון — לפני
                שמשלמים על סצנות אמיתיות.
              </p>
            ) : (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-semibold text-ink-2">איכות הסצנות</legend>
                  {(
                    [
                      ["720p", "רגילה (720p)", "חדה לגמרי בסרטון הסופי"],
                      ["480p", "חסכונית (480p)", "זולה יותר, קצת פחות חדה — טובה לטיוטה"],
                    ] as const
                  ).map(([value, title, hint]) => (
                    <label key={value} className="cursor-pointer">
                      <input
                        type="radio"
                        name="quality"
                        value={value}
                        checked={quality === value}
                        onChange={() => chooseQuality(value)}
                        disabled={quoting}
                        className="peer sr-only"
                      />
                      <span className="well flex flex-col rounded-2xl px-4 py-2 text-sm peer-checked:bg-accent peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                        <span className="font-semibold">{title}</span>
                        <span className="opacity-80">{hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="text-ink-2" aria-live="polite">
                  {quote.count} סצנות. המחיר <b>{quoting ? "מחשב…" : formatShekels(quote.priceIls)}</b>. סצנה שנכשלת — הכסף חוזר לארנק.
                </p>
                <WalletLine balanceIls={quote.balanceIls} priceIls={quote.priceIls} />
              </>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={quoting || (!quote.demo && !canAfford(quote.balanceIls, quote.priceIls))}
                onClick={() => generate(quote.demo ? "demo" : "real")}
              >
                {quote.demo ? "צרו סצנות לדוגמה" : "צרו"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>
                ביטול
              </button>
            </div>
          </div>
        )}
      </dialog>

      {ready && scenes.length > 0 && (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="סצנות">
          {scenes.map((item) => (
            // Keyed by prompt so a saved description resets the local draft.
            <SceneCard key={`${item.id}:${item.prompt}`} item={item} onError={setError} />
          ))}
        </ol>
      )}
    </section>
  );
}
