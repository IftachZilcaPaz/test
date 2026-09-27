"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { approveScript, estimateScriptCost, generateScripts } from "@/app/app/projects/[id]/actions";
import { formatIls, formatUsd } from "@/lib/money";
import { applyLexicon, countWords, estimateSeconds, lengthVerdict, parseLexicon, wordTarget } from "@/lib/script/hebrew";
import type { ScriptOption } from "@/lib/script/types";

export type DraftView = {
  id: string;
  options: ScriptOption[];
  chosenIndex: number | null;
  chosenScript: string | null;
  costUsd: number;
  demo: boolean;
  createdAt: string;
};

const VERDICT = {
  ok: { label: "אורך מדויק", className: "bg-good-soft text-good" },
  short: { label: "קצר מהיעד", className: "bg-tint-3 text-ink-2" },
  long: { label: "ארוך מדי", className: "bg-bad-soft text-bad" },
} as const;

function OptionCard({
  draft,
  index,
  option,
  seconds,
  lexicon,
}: {
  draft: DraftView;
  index: number;
  option: ScriptOption;
  seconds: number;
  lexicon: string;
}) {
  const router = useRouter();
  const chosen = draft.chosenIndex === index;
  const [text, setText] = useState(chosen && draft.chosenScript ? draft.chosenScript : option.script);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const target = wordTarget(seconds);
  const words = countWords(text);
  const verdict = VERDICT[lengthVerdict(words, target)];
  const spoken = applyLexicon(text, parseLexicon(lexicon));

  return (
    <article className={`clay flex min-w-0 flex-col gap-3 p-5 ${chosen ? "ring-4 ring-accent/40" : ""}`}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-lg">{option.title}</h3>
        {chosen && <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">מאושר</span>}
      </header>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
        הטקסט של הקריין (אפשר לערוך)
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={7} className="field field-sizing-content min-h-40 resize-none leading-7" />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-3 py-1 font-semibold ${verdict.className}`}>{verdict.label}</span>
        <span className="text-ink-2 tabular-nums">
          {words} / {target} מילים · כ־{estimateSeconds(text)} שניות
        </span>
      </div>
      {spoken !== text && (
        <p className="well rounded-2xl p-3 text-sm text-ink-2">
          <span className="block text-xs font-semibold text-ink-3">מה הקריין מקבל (עם הניקוד שלכם)</span>
          {spoken}
        </p>
      )}
      {option.scenes.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-ink-2">סצנות מוצעות ({option.scenes.length})</summary>
          <ol className="mt-2 flex flex-col gap-2">
            {option.scenes.map((scene, sceneIndex) => (
              <li key={sceneIndex} className="rounded-2xl border border-line p-3 text-sm">
                <span className="font-semibold">„{scene.caption}”</span>
                <span className="mt-1 block text-xs text-ink-3" dir="ltr">
                  {scene.visual}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending || !text.trim()}
        className={`btn mt-auto ${chosen ? "" : "btn-primary"}`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await approveScript({ draftId: draft.id, index, script: text });
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        {pending ? "שומר…" : chosen ? "שמירת השינויים" : "אישור התסריט הזה"}
      </button>
    </article>
  );
}

export function ScriptStep({
  projectId,
  ready,
  seconds,
  lexicon,
  drafts,
}: {
  projectId: string;
  ready: boolean;
  seconds: number;
  lexicon: string;
  drafts: DraftView[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [quote, setQuote] = useState<{ demo: boolean; maxUsd: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimating, startEstimate] = useTransition();
  const [writing, startWrite] = useTransition();
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = drafts.find((draft) => draft.id === shownId) ?? drafts[0];

  const askPrice = () =>
    startEstimate(async () => {
      setError(null);
      const result = await estimateScriptCost(projectId);
      if ("error" in result) return setError(result.error);
      setQuote(result);
      dialogRef.current?.showModal();
    });

  const write = () => {
    dialogRef.current?.close();
    startWrite(async () => {
      const result = await generateScripts(projectId);
      if (result.error) setError(result.error);
      else {
        setShownId(null);
        router.refresh();
      }
    });
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="script-title">
      <div className="clay flex flex-col gap-3 p-6 md:p-8">
        <h2 id="script-title" className="text-2xl">
          2 · תסריט
        </h2>
        <p className="text-ink-2">
          {ready
            ? `שלוש גרסאות קריינות של ${wordTarget(seconds)} מילים בערך — מתאים לסרטון של ${seconds} שניות.`
            : "קודם שומרים את הפרטים על העסק, ואז כותבים."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={!ready || estimating || writing} onClick={askPrice}>
            {writing ? "כותב… (כחצי דקה)" : estimating ? "מחשב מחיר…" : drafts.length ? "כתבו לי 3 גרסאות נוספות" : "כתבו לי 3 תסריטים"}
          </button>
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">
            {error}
          </p>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="clay m-auto w-[min(28rem,calc(100vw-2rem))] p-6 backdrop:bg-ink/30"
        aria-labelledby="price-title"
      >
        {quote && (
          <div className="flex flex-col gap-4">
            <h3 id="price-title" className="text-xl">
              לפני שכותבים
            </h3>
            {quote.demo ? (
              <p className="text-ink-2">
                <b>מצב דמו — בחינם.</b> עוד לא חובר מפתח Claude, אז תקבלו תסריטים לדוגמה כדי לראות איך המסך עובד.
              </p>
            ) : (
              <p className="text-ink-2">
                שלושה תסריטים ייכתבו על ידי Claude. העלות <b>לכל היותר {formatIls(quote.maxUsd)}</b>{" "}
                <span className="text-ink-3" dir="ltr">
                  ({formatUsd(quote.maxUsd)})
                </span>
                , ובדרך כלל פחות. המחיר המדויק יופיע אחרי הכתיבה.
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={write}>
                {quote.demo ? "הראו לי דוגמה" : "כתבו"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>
                ביטול
              </button>
            </div>
          </div>
        )}
      </dialog>

      {writing && (
        <div className="grid gap-4 md:grid-cols-3" aria-busy="true" aria-label="כותב תסריטים">
          {[0, 1, 2].map((key) => (
            <div key={key} className="clay h-80 animate-pulse" />
          ))}
        </div>
      )}

      {!writing && shown && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            {shown.demo ? (
              <span className="rounded-full bg-tint-3 px-3 py-1 font-semibold">תסריטים לדוגמה · מצב דמו · ₪0</span>
            ) : (
              <>
                עלות הכתיבה: <b>{formatIls(shown.costUsd)}</b>{" "}
                <span className="text-ink-3" dir="ltr">
                  ({formatUsd(shown.costUsd)})
                </span>
              </>
            )}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {shown.options.map((option, index) => (
              <OptionCard key={`${shown.id}-${index}`} draft={shown} index={index} option={option} seconds={seconds} lexicon={lexicon} />
            ))}
          </div>
          {drafts.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-2">גרסאות קודמות:</span>
              {drafts.map((draft, index) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => setShownId(draft.id)}
                  aria-pressed={draft.id === shown.id}
                  className={`btn px-3 py-1.5 text-sm ${draft.id === shown.id ? "btn-primary" : "btn-ghost"}`}
                >
                  #{drafts.length - index}
                  {draft.chosenIndex !== null ? " ✓" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
