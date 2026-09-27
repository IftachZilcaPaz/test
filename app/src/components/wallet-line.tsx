import Link from "next/link";
import { formatShekels } from "@/lib/pricing";

/** Balance line for price dialogs; offers a top-up when the balance is short. */
export function WalletLine({ balanceIls, priceIls }: { balanceIls: number; priceIls: number }) {
  const short = priceIls > balanceIls + 1e-9;
  return (
    <p className={`rounded-2xl px-4 py-2 text-sm ${short ? "bg-bad-soft text-bad" : "bg-well text-ink-2"}`}>
      יתרה בארנק: <b className="tabular-nums">{formatShekels(balanceIls)}</b>
      {short && (
        <>
          {" "}
          — לא מספיק.{" "}
          <Link href="/app/wallet" className="font-semibold underline underline-offset-4">
            טעינת הארנק
          </Link>
        </>
      )}
    </p>
  );
}

export const canAfford = (balanceIls: number, priceIls: number) => priceIls <= balanceIls + 1e-9;
