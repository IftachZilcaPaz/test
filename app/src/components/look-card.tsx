"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createLook, quoteLook, refreshLook } from "@/app/app/projects/[id]/look-actions";
import { canAfford } from "@/components/wallet-line";
import { formatShekels } from "@/lib/pricing";

export type LookView = {
  summary: string;
  /** Changes whenever a new image is stored, so the browser fetches it again. */
  imageVersion: string | null;
  generating: boolean;
};

const CHARACTER_WORDS = {
  title: "הדמות של הסרטון",
  hint: "כל הסצנות האמיתיות נוצרות מהתמונה הזו — אותו אדם ואותו מקום לאורך כל הסרטון.",
  making: "יוצר את הדמות…",
  none: "עוד אין דמות",
  create: "צרו את הדמות",
  another: "דמות אחרת",
  confirmFirst: "ליצור את הדמות",
  confirmAnother: "ליצור דמות אחרת",
};

const PRESENTER_WORDS = {
  title: "הקריינית של הסרטון",
  hint: "כל הסצנות מצולמות מהתמונה הזו: היא אומרת את הקריינות שלכם מול המצלמה, והשפתיים מסונכרנות לקול.",
  making: "יוצר את הקריינית…",
  none: "עוד אין קריינית",
  create: "צרו את הקריינית",
  another: "קריינית אחרת",
  confirmFirst: "ליצור את הקריינית",
  confirmAnother: "ליצור קריינית אחרת",
};

/**
 * The video's recurring character and place. Real scenes are generated from this one
 * image, so the customer sees and approves who appears before paying for clips.
 */
export function LookCard({ projectId, look, presenter = false }: { projectId: string; look: LookView; presenter?: boolean }) {
  const words = presenter ? PRESENTER_WORDS : CHARACTER_WORDS;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!look.generating) return;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await refreshLook(projectId);
        if (result.error) setError(result.error);
        if (!result.pending) router.refresh();
      } finally {
        inFlight = false;
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [look.generating, projectId, router]);

  const order = () =>
    start(async () => {
      setError(null);
      const quote = await quoteLook(projectId);
      if ("error" in quote) return setError(quote.error);
      if (!canAfford(quote.balanceIls, quote.priceIls)) {
        return setError(`צריך ${formatShekels(quote.priceIls)} בארנק, ויש ${formatShekels(quote.balanceIls)}.`);
      }
      const verb = look.imageVersion ? words.confirmAnother : words.confirmFirst;
      if (!window.confirm(`${verb}? המחיר ${formatShekels(quote.priceIls)}.`)) return;
      const result = await createLook(projectId);
      if (result.error) setError(result.error);
      router.refresh();
    });

  return (
    <div className="well flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-center">
      <div className="aspect-[9/16] w-28 shrink-0 overflow-hidden rounded-2xl bg-card">
        {look.generating ? (
          <div className="grid size-full animate-pulse place-items-center p-2 text-center text-xs text-ink-3">{words.making}</div>
        ) : look.imageVersion ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, owner-checked media route
          <img src={`/api/projects/${projectId}/look?v=${encodeURIComponent(look.imageVersion)}`} alt={words.title} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center p-2 text-center text-xs text-ink-3">{words.none}</div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg">{words.title}</h3>
        <p className="text-sm text-ink-2">{look.summary}</p>
        <p className="text-xs text-ink-3">{words.hint}</p>
        <div>
          <button type="button" className={`btn ${look.imageVersion ? "btn-ghost" : "btn-primary"}`} disabled={busy || look.generating} onClick={order}>
            {busy ? "רגע…" : look.generating ? "בהכנה…" : look.imageVersion ? words.another : words.create}
          </button>
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
