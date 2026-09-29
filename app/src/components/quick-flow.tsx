"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createLook, quoteLook, refreshLook } from "@/app/app/projects/[id]/look-actions";
import { quickScript, quickStatus, quickVoice, quoteQuickStart } from "@/app/app/projects/[id]/quick-actions";
import { renderState, startRender } from "@/app/app/projects/[id]/render-actions";
import { approveScenes, generateScenes, quoteScenes, refreshScenes } from "@/app/app/projects/[id]/scene-actions";
import { approveTake } from "@/app/app/projects/[id]/voice-actions";
import { canAfford, WalletLine } from "@/components/wallet-line";
import { formatShekels } from "@/lib/pricing";

export type QuickView = "idle" | "listen" | "producing" | "done";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `upTo`: the price is a ceiling (charged by what is actually made); otherwise it is exact. */
type Confirm = { title: string; text: string; priceIls: number; upTo: boolean; balanceIls: number; onYes: () => void };

/**
 * The fast track for customers who just want the video: approve the first steps, listen
 * to the voice and see the character, approve the filming, and receive the finished video.
 * Every step is one of the regular actions, run in order; the detailed steps below stay
 * available for anyone who wants to change something by hand.
 */
export function QuickFlow({
  projectId,
  ready,
  initialView,
  take,
  look,
  script,
  presenter,
  realScenes,
}: {
  projectId: string;
  /** The brief is saved. */
  ready: boolean;
  initialView: QuickView;
  /** The narration of the current script, if recorded. */
  take: { id: string } | null;
  look: { imageVersion: string | null; summary: string | null };
  script: string | null;
  presenter: boolean;
  /** A Higgsfield key is configured (otherwise scenes are free placeholders and there is no character image). */
  realScenes: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<QuickView>(initialView);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [fixing, setFixing] = useState(false);
  const busy = progress !== null;

  const fail = (message: string) => {
    setProgress(null);
    setError(message);
    router.refresh();
  };

  const ask = (next: Confirm) => {
    setError(null);
    if (!canAfford(next.balanceIls, next.priceIls)) {
      setError(`צריך ${formatShekels(next.priceIls)} בארנק, ויש ${formatShekels(next.balanceIls)}.`);
      return;
    }
    setConfirm(next);
  };

  /** Waits for the character image; true when it is ready. */
  const waitForLook = async () => {
    for (;;) {
      const state = await refreshLook(projectId);
      if (state.error) {
        fail(state.error);
        return false;
      }
      if (!state.pending) return true;
      await sleep(3000);
    }
  };

  // Step 1: script, narration and character, then a stop to listen.
  const prepare = async () => {
    setError(null);
    setProgress("כותבים את התסריט…");
    const written = await quickScript(projectId);
    if (written.error) return fail(written.error);
    setProgress("מקליטים את ההקראה…");
    const voiced = await quickVoice(projectId);
    if (voiced.error) return fail(voiced.error);
    if (realScenes) {
      const status = await quickStatus(projectId);
      if ("error" in status) return fail(status.error);
      if (status.look !== "ready") {
        setProgress(presenter ? "יוצרים את הקריינית…" : "יוצרים את הדמות…");
        if (status.look === "none") {
          const created = await createLook(projectId);
          if (created.error) return fail(created.error);
        }
        if (!(await waitForLook())) return;
      }
    }
    setProgress(null);
    setView("listen");
    router.refresh();
  };

  const start = async () => {
    setError(null);
    setProgress("מחשבים מחיר…");
    const quote = await quoteQuickStart(projectId);
    setProgress(null);
    if ("error" in quote) return setError(quote.error);
    ask({
      title: "שלב 1: תסריט, הקראה ודמות",
      text: `כותבים תסריט, מקליטים אותו ויוצרים ${presenter ? "את הקריינית" : "את הדמות של הסרטון"}. אחר כך עוצרים כדי שתשמעו ותראו לפני הצילום.`,
      priceIls: quote.priceIls,
      upTo: true,
      balanceIls: quote.balanceIls,
      onYes: prepare,
    });
  };

  // Step 2: filming, approving and assembling, all on its own. `send` orders the scenes still
  // to film (already priced and approved); scenes already filming are waited for either way.
  const produce = async (send: boolean) => {
    setError(null);
    setView("producing");
    setProgress("מצלמים את הסצנות… (בדרך כלל שתיים עד ארבע דקות, אפשר להישאר בעמוד)");
    if (send) {
      const sent = await generateScenes(projectId, "real");
      if (sent.error) return fail(sent.error);
    }
    for (;;) {
      const { generating } = await refreshScenes(projectId);
      if (generating === 0) break;
      await sleep(5000);
    }
    const status = await quickStatus(projectId);
    if ("error" in status) return fail(status.error);
    if (status.scenes.failed > 0) {
      return fail(`${status.scenes.failed} סצנות לא נוצרו, והכסף עליהן חזר לארנק. לחצו „ממשיכים” כדי לנסות שוב.`);
    }
    setProgress("מאשרים את הסצנות…");
    const approved = await approveScenes(projectId);
    if (approved.error) return fail(approved.error);
    setProgress("מרכיבים את הסרטון…");
    const started = await startRender(projectId, presenter ? 1 : 1.25);
    if (started.error && !/כבר בהרכבה/.test(started.error)) return fail(started.error);
    for (;;) {
      const state = await renderState(projectId);
      if (state.total) setProgress(`מרכיבים את הסרטון… ${state.done ?? 0}/${state.total}`);
      if (state.status === "done") break;
      if (state.status !== "rendering") return fail("ההרכבה נכשלה. לחצו „ממשיכים” כדי לנסות שוב, זה בחינם.");
      await sleep(1500);
    }
    setProgress(null);
    setView("done");
    router.refresh();
  };

  const proceed = async () => {
    if (!take) return setError("קודם צריך הקראה.");
    setError(null);
    setProgress("שומרים את ההקראה…");
    const approved = await approveTake(take.id);
    if (approved.error) return fail(approved.error);
    setProgress("מחשבים את מחיר הצילום…");
    const quote = await quoteScenes(projectId, "real");
    setProgress(null);
    router.refresh();
    if ("error" in quote) {
      // Nothing left to order (all filmed, or still filming): wait for them and assemble.
      if (/כבר מוכנות/.test(quote.error)) return produce(false);
      return setError(quote.error);
    }
    if (quote.demo) return produce(true);
    ask({
      title: "שלב 2: צילום והרכבה",
      text: `מצלמים ${quote.count} סצנות ומרכיבים את הסרטון עם כיתובים. ההרכבה בחינם. סצנה שנכשלת? הכסף חוזר לארנק.`,
      priceIls: quote.priceIls,
      upTo: false,
      balanceIls: quote.balanceIls,
      onYes: () => produce(true),
    });
  };

  const revoice = async () => {
    setFixing(false);
    setError(null);
    setProgress("מקליטים מחדש…");
    const voiced = await quickVoice(projectId);
    if (voiced.error) return fail(voiced.error);
    setProgress(null);
    router.refresh();
  };

  const otherLook = async () => {
    setError(null);
    const quote = await quoteLook(projectId);
    if ("error" in quote) return setError(quote.error);
    ask({
      title: presenter ? "קריינית אחרת" : "דמות אחרת",
      text: "יוצרים תמונה חדשה במקום הנוכחית.",
      priceIls: quote.priceIls,
      upTo: false,
      balanceIls: quote.balanceIls,
      onYes: async () => {
        setProgress(presenter ? "יוצרים קריינית חדשה…" : "יוצרים דמות חדשה…");
        const created = await createLook(projectId);
        if (created.error) return fail(created.error);
        if (await waitForLook()) {
          setProgress(null);
          router.refresh();
        }
      },
    });
  };

  if (!ready) return null;

  return (
    <section className="clay flex flex-col gap-4 p-6 md:p-8" aria-labelledby="quick-title">
      <h2 id="quick-title" className="text-2xl">
        הדרך המהירה ✨
      </h2>

      {view === "idle" && (
        <>
          <p className="text-ink-2">אנחנו עושים הכול: תסריט, הקראה, צילום והרכבה. אתם רק מאשרים מחיר פעמיים, ושומעים את הקול באמצע.</p>
          <div>
            <button type="button" className="btn btn-primary text-lg" disabled={busy} onClick={start}>
              צרו לי סרטון
            </button>
          </div>
        </>
      )}

      {view === "listen" && (
        <>
          <p className="text-ink-2">כמעט שם. תשמעו את ההקראה ותסתכלו על {presenter ? "הקריינית" : "הדמות"}. אם הכול טוב, ממשיכים לצילום.</p>
          <div className="flex flex-col gap-4 sm:flex-row">
            {look.imageVersion && (
              // eslint-disable-next-line @next/next/no-img-element -- private, owner-checked media route
              <img
                src={`/api/projects/${projectId}/look?v=${encodeURIComponent(look.imageVersion)}`}
                alt={presenter ? "הקריינית של הסרטון" : "הדמות של הסרטון"}
                className="aspect-[9/16] w-32 shrink-0 rounded-2xl object-cover"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {take && <audio controls preload="metadata" src={`/api/takes/${take.id}/audio`} className="w-full" />}
              {script && <p className="well rounded-2xl p-4 leading-8">{script}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={proceed}>
              נשמע טוב, ממשיכים
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setFixing(!fixing)}>
              מילה נשמעת לא טוב
            </button>
            {realScenes && (
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={otherLook}>
                {presenter ? "קריינית אחרת" : "דמות אחרת"}
              </button>
            )}
          </div>
          {fixing && (
            <div className="well flex flex-col gap-3 rounded-2xl p-4 text-sm text-ink-2">
              <p>
                <b>איך מתקנים:</b> למעלה, בחלק „איך הקריין יגיד מילים מיוחדות”, כותבים את המילה עם ניקוד, לוחצים 🔊 ושומעים (בחינם). כשזה
                נשמע נכון: „הוספה למילון”, ואז „שמירה”. אחר כך חוזרים לכאן ולוחצים „הקראה מחדש”.
              </p>
              <div className="flex flex-wrap gap-2">
                <a href="#brief" className="btn btn-ghost px-4 py-2 text-sm">
                  לבודק ההגייה
                </a>
                <button type="button" className="btn px-4 py-2 text-sm" disabled={busy} onClick={revoice}>
                  הקראה מחדש
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {view === "producing" && !busy && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-ink-2">הסרטון בדרך. לחצו כדי להמשיך מאיפה שעצרנו.</p>
          <button type="button" className="btn btn-primary" onClick={proceed}>
            ממשיכים
          </button>
        </div>
      )}

      {view === "done" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-ink-2">הסרטון מוכן! 🎬</p>
          <a href="#render-title" className="btn btn-primary">
            לצפייה בסרטון
          </a>
        </div>
      )}

      {busy && (
        <p className="animate-pulse rounded-2xl bg-tint-3 px-4 py-3 font-semibold text-ink" role="status">
          {progress}
        </p>
      )}

      {confirm && (
        <div className="well flex flex-col gap-3 rounded-2xl p-4" role="dialog" aria-labelledby="quick-confirm-title">
          <h3 id="quick-confirm-title" className="text-lg">
            {confirm.title}
          </h3>
          <p className="text-ink-2">{confirm.text}</p>
          <p className="text-lg">
            המחיר: <b>{confirm.priceIls === 0 ? "בחינם" : `${confirm.upTo ? "עד " : ""}${formatShekels(confirm.priceIls)}`}</b>
          </p>
          <WalletLine balanceIls={confirm.balanceIls} priceIls={confirm.priceIls} />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const next = confirm.onYes;
                setConfirm(null);
                next();
              }}
            >
              אישור
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>
              ביטול
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">
          {error}
        </p>
      )}
    </section>
  );
}
