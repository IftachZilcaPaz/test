import Link from "next/link";
import { HowItWorks } from "@/components/how-it-works";
import { Mascot } from "@/components/mascot";
import { SignOutButton } from "@/components/sign-out-button";
import { formatShekels } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { balance } from "@/lib/wallet.server";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  const available = await balance(user.id);
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="clay flex flex-col items-center gap-4 p-6 lg:sticky lg:top-6 lg:self-start">
        <Link href="/app" className="flex flex-col items-center gap-3" aria-label="הפרויקטים שלי">
          <Mascot size={112} />
          <span className="font-round text-xl">reynovation</span>
        </Link>
        <p className="text-center text-sm text-ink-2">
          שלום, <bdi className="font-semibold text-ink">{user.name}</bdi>
        </p>
        <Link href="/app/wallet" className="well flex w-full items-center justify-between rounded-3xl px-4 py-3 hover:text-accent">
          <span className="text-sm text-ink-2">הארנק</span>
          <span className="font-semibold tabular-nums">{formatShekels(available)}</span>
        </Link>
        <HowItWorks />
        <SignOutButton />
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
