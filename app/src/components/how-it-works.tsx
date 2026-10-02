"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";

const SEEN_KEY = "reyn:tour-seen";

/** Mini, non-interactive copies of the real controls, so each step shows what the customer will see. */
const FakeButton = ({ children, primary = false }: { children: ReactNode; primary?: boolean }) => (
  <span className={`btn pointer-events-none px-4 py-2 text-sm ${primary ? "btn-primary" : "btn-ghost"}`}>{children}</span>
);
const FakeField = ({ label, value }: { label: string; value: string }) => (
  <span className="flex w-full flex-col gap-1 text-start text-xs font-medium text-ink-2">
    {label}
    <span className="field py-2 text-sm text-ink">{value}</span>
  </span>
);
const Chip = ({ children, active = false }: { children: ReactNode; active?: boolean }) => (
  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-accent text-white" : "bg-card text-ink-2"}`}>{children}</span>
);
const Tile = ({ delay }: { delay: string }) => (
  <span className="aspect-[9/16] w-14 animate-pulse rounded-xl bg-gradient-to-b from-tint-1 to-tint-2" style={{ animationDelay: delay }} />
);

type Step = { title: string; text: string; art: ReactNode };

const STEPS: Step[] = [
  {
    title: "סרטון פרומו בעברית, תוך דקות",
    text: "בלי צילום, בלי עריכה ובלי לדעת כלום על וידאו. מספרים לנו על העסק, ואנחנו עושים את השאר. בואו נראה איך.",
    art: (
      <span className="relative grid place-items-center">
        <Mascot size={132} />
        <span className="absolute -top-2 -right-6 text-3xl">🎬</span>
        <span className="absolute -bottom-1 -left-6 text-3xl">🎙️</span>
        <span className="absolute top-2 -left-8 text-2xl">✨</span>
      </span>
    ),
  },
  {
    title: "1. פותחים פרויקט",
    text: "כל פרויקט הוא סרטון אחד. נותנים לו שם, למשל שם העסק, ולוחצים „פרויקט חדש”.",
    art: (
      <span className="flex w-full max-w-64 flex-col items-center gap-3">
        <FakeField label="שם הפרויקט" value="מאפיית רחל" />
        <FakeButton primary>פרויקט חדש</FakeButton>
      </span>
    ),
  },
  {
    title: "2. מספרים על העסק",
    text: "כמה משפטים פשוטים: מה העסק עושה, למי הסרטון, ומה הצופה צריך לעשות בסוף. בוחרים סגנון ולוחצים „שמירה”.",
    art: (
      <span className="flex w-full max-w-72 flex-col items-center gap-3">
        <FakeField label="מה העסק עושה" value="מאפייה שכונתית עם לחמי מחמצת…" />
        <span className="flex flex-wrap justify-center gap-1.5">
          <Chip>דמות אחת</Chip>
          <Chip>סצנות + תמונות</Chip>
          <Chip active>קריינית</Chip>
        </span>
      </span>
    ),
  },
  {
    title: "3. לוחצים „צרו לי סרטון”",
    text: "רואים מחיר לפני שמשלמים, ומאשרים. אנחנו כותבים תסריט, מקליטים אותו בעברית נכונה, ויוצרים את הדמות של הסרטון.",
    art: (
      <span className="flex flex-col items-center gap-3">
        <span className="rounded-full p-1 ring-4 ring-accent/30 motion-safe:animate-pulse">
          <FakeButton primary>צרו לי סרטון</FakeButton>
        </span>
        <span className="flex flex-col gap-1 text-start text-sm text-ink-2">
          <span>✓ כותבים את התסריט</span>
          <span>✓ מקליטים את ההקראה</span>
          <span className="animate-pulse">… יוצרים את הדמות</span>
        </span>
      </span>
    ),
  },
  {
    title: "4. שומעים ומאשרים",
    text: "עוצרים רגע: שומעים את ההקראה ורואים את הדמות. מילה נשמעת לא טוב? מתקנים אותה בבודק ההגייה, בחינם, ומקליטים שוב.",
    art: (
      <span className="flex w-full max-w-72 flex-col items-center gap-3">
        <span className="well flex w-full items-center gap-3 rounded-full px-3 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm text-white">▶</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-line">
            <span className="absolute inset-y-0 right-0 w-2/3 rounded-full bg-gradient-to-l from-accent-2 to-accent" />
          </span>
          <span className="text-xs tabular-nums text-ink-3">0:14</span>
        </span>
        <span className="flex flex-wrap justify-center gap-2">
          <FakeButton primary>נשמע טוב, ממשיכים</FakeButton>
          <FakeButton>מילה נשמעת לא טוב</FakeButton>
        </span>
      </span>
    ),
  },
  {
    title: "5. מאשרים צילום, והשאר קורה לבד",
    text: "רואים את המחיר המדויק של הצילום ומאשרים. אנחנו מצלמים את הסצנות, מוסיפים כיתובים בעברית ומרכיבים את הסרטון. סצנה שנכשלת? הכסף חוזר.",
    art: (
      <span className="flex flex-col items-center gap-3">
        <span className="flex gap-2">
          <Tile delay="0s" />
          <Tile delay=".2s" />
          <Tile delay=".4s" />
          <Tile delay=".6s" />
        </span>
        <span className="rounded-2xl bg-tint-3 px-4 py-2 text-sm font-semibold text-ink">מצלמים את הסצנות…</span>
      </span>
    ),
  },
  {
    title: "6. הסרטון מוכן 🎉",
    text: "סרטון אנכי, מוכן לרילס, טיקטוק וסטוריז. מורידים ומפרסמים.",
    art: (
      <span className="relative aspect-[9/16] w-28 overflow-hidden rounded-3xl bg-gradient-to-b from-accent to-accent-2 shadow-lg">
        <span className="absolute inset-0 grid place-items-center text-4xl text-white/90">▶</span>
        <span className="absolute inset-x-2 bottom-4 rounded-xl bg-ink/75 px-2 py-1 text-center text-[10px] font-bold text-white">
          לחם טרי כל בוקר
        </span>
      </span>
    ),
  },
  {
    title: "עוד שני דברים",
    text: "לפני כל דבר שעולה כסף תראו את המחיר ותאשרו, והיתרה תמיד מופיעה בארנק. רוצים לשלוט בכל שלב בעצמכם? בכל פרויקט יש „מצב מתקדם”.",
    art: (
      <span className="flex w-full max-w-64 flex-col items-center gap-3">
        <span className="well flex w-full items-center justify-between rounded-3xl px-4 py-3">
          <span className="text-sm text-ink-2">הארנק</span>
          <span className="font-semibold tabular-nums">‏50.00 ‏₪</span>
        </span>
        <span className="clay w-full px-4 py-3 text-center text-sm font-semibold text-ink-2">מצב מתקדם: לעשות כל שלב בעצמי</span>
      </span>
    ),
  },
];

/**
 * The "how it works" tour: opens by itself on a customer's first visit (remembered in this
 * browser), and again from the button. One step at a time, each with a small picture of the
 * real screen. Esc closes; the arrow keys move between steps.
 */
export function HowItWorks() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const primary = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Storage blocked: the tour may show again next time, which is harmless.
    }
  }, []);

  // First visit: open once, a moment after the page appears. If storage is unavailable,
  // stay closed rather than open on every page.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
      } catch {
        // ignore
      }
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    primary.current?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      // Right-to-left: the next step is to the left.
      if (event.key === "ArrowLeft") setStep((current) => Math.min(current + 1, STEPS.length - 1));
      if (event.key === "ArrowRight") setStep((current) => Math.max(current - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = scroll;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost w-full"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
      >
        איך זה עובד?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            className="clay flex max-h-[calc(100dvh-2rem)] w-[min(28rem,100%)] flex-col gap-5 overflow-y-auto p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-3 tabular-nums">
                {step + 1} מתוך {STEPS.length}
              </span>
              <button type="button" className="text-sm font-semibold text-ink-2 hover:text-accent" onClick={close}>
                דילוג
              </button>
            </div>

            <div key={step} className="flex flex-col gap-5 motion-safe:animate-[tour-in_.35s_ease-out]">
              <div className="well grid min-h-56 place-items-center rounded-3xl p-5">{current.art}</div>
              <div className="flex flex-col gap-2 text-center">
                <h2 id="tour-title" className="text-2xl">
                  {current.title}
                </h2>
                <p className="text-ink-2 leading-7">{current.text}</p>
              </div>
            </div>

            <div className="flex justify-center gap-1.5" aria-hidden>
              {STEPS.map((_, index) => (
                <span key={index} className={`h-2 rounded-full transition-all ${index === step ? "w-6 bg-accent" : "w-2 bg-line"}`} />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                ref={primary}
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => (last ? close() : setStep(step + 1))}
              >
                {last ? "יאללה, מתחילים" : step === 0 ? "תראו לי" : "הבא"}
              </button>
              {step > 0 && (
                <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                  הקודם
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
