"use client";

import { useEffect } from "react";

const RELOADED_AT = "reyn:reloaded-at";

/**
 * Friendly Hebrew fallback instead of a blank screen. The common cause in production
 * is a page left open across a deploy: its server actions no longer exist, so one
 * automatic reload (at most once a minute) brings the new version.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const staleDeploy = /server action/i.test(error.message);

  useEffect(() => {
    console.error(error);
    if (!staleDeploy) return;
    try {
      const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    } catch {
      // Storage blocked (private mode): still reload once; the button below covers repeats.
    }
    window.location.reload();
  }, [error, staleDeploy]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4">
      <section className="clay flex w-full flex-col items-center gap-4 p-8 text-center">
        <h1 className="text-2xl">{staleDeploy ? "יש גרסה חדשה של האתר" : "משהו השתבש"}</h1>
        <p className="text-ink-2">
          {staleDeploy
            ? "טוענים אותה עכשיו. העבודה שלכם שמורה."
            : "לא איבדתם כלום. הפרויקטים והתשלומים שמורים. נסו שוב, ואם זה חוזר, רעננו את הדף."}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            רענון הדף
          </button>
          {!staleDeploy && (
            <button type="button" className="btn btn-ghost" onClick={() => retry()}>
              לנסות שוב
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
