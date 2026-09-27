import type { Metadata } from "next";
import Link from "next/link";
import { formatShekels, PRICE_MULTIPLIER } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { balance, DEMO_TOPUP_ILS, demoTopupAllowed, history } from "@/lib/wallet.server";
import { demoTopUp } from "./actions";

export const metadata: Metadata = { title: "הארנק שלי · reynovation" };

const KIND = { gift: "מתנה", topup: "טעינה", charge: "חיוב", refund: "החזר" } as const;
const when = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });

export default async function WalletPage() {
  const user = await requireUser();
  const [available, entries] = await Promise.all([balance(user.id), history(user.id)]);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app" className="text-sm text-ink-2 hover:text-accent">
        → כל הפרויקטים
      </Link>
      <section className="clay flex flex-col gap-4 p-6 md:p-8">
        <h1 className="text-3xl">הארנק שלי</h1>
        <p className="font-round text-5xl tabular-nums text-accent">{formatShekels(available)}</p>
        <p className="max-w-[60ch] text-ink-2">
          לפני כל שלב שעולה כסף תראו את המחיר המדויק ותאשרו. תשלום רק על מה שנוצר בפועל — סצנה שנכשלת מוחזרת לארנק אוטומטית.
        </p>
        {demoTopupAllowed() && (
          <form action={demoTopUp} className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary">
              טעינה של {formatShekels(DEMO_TOPUP_ILS)}
            </button>
            <span className="rounded-full bg-tint-3 px-3 py-1 text-xs font-semibold text-ink">מצב פיתוח — בלי תשלום אמיתי</span>
          </form>
        )}
        <p className="text-xs text-ink-3">המחירים = עלות הספקים × {PRICE_MULTIPLIER}, מעוגלים ל-10 אגורות.</p>
      </section>

      <section className="clay flex flex-col gap-3 p-6 md:p-8" aria-labelledby="history-title">
        <h2 id="history-title" className="text-2xl">
          פעולות אחרונות
        </h2>
        <ul className="flex flex-col divide-y divide-line">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium" title={entry.description}>
                  {entry.description}
                </p>
                <p className="text-xs text-ink-3">
                  {KIND[entry.kind]} · {when.format(entry.createdAt)}
                </p>
              </div>
              <span className={`shrink-0 font-semibold tabular-nums ${entry.amountIls < 0 ? "text-ink" : "text-good"}`} dir="ltr">
                {entry.amountIls > 0 ? "+" : "−"}
                {formatShekels(Math.abs(entry.amountIls))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
