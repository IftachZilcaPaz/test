import Link from "next/link";
import { redirect } from "next/navigation";
import { Mascot } from "@/components/mascot";
import { STEPS } from "@/lib/brand";
import { getSession } from "@/lib/session";

export default async function Home() {
  if (await getSession()) redirect("/app");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 md:py-16">
      <header className="flex items-center justify-between">
        <span className="font-round text-2xl text-ink">reynovation</span>
        <Link href="/login" className="btn btn-ghost">
          התחברות
        </Link>
      </header>

      <section className="clay grid items-center gap-8 p-8 md:grid-cols-[minmax(0,1fr)_auto] md:p-12">
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl leading-tight md:text-5xl">
            סרטון פרומו לעסק שלכם, <span className="text-accent">בעברית אמיתית</span>
          </h1>
          <p className="max-w-[46ch] text-lg text-ink-2">
            בלי מדריכים באנגלית ובלי אותיות משובשות. מספרים לנו על העסק, בוחרים תסריט וקול, ורואים
            מחיר מדויק לפני כל שלב.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary">
              מתחילים בחינם
            </Link>
            <Link href="/login" className="btn">
              כבר יש לי חשבון
            </Link>
          </div>
        </div>
        <div className="justify-self-center">
          <Mascot size={220} priority />
        </div>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-4">
        <h2 id="how" className="text-2xl">
          איך זה עובד
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, index) => (
            <li key={step.key} className="clay flex flex-col gap-1 p-5">
              <span className="font-round text-3xl text-accent">{index + 1}</span>
              <span className="font-semibold">{step.title}</span>
              <span className="text-sm text-ink-2">{step.hint}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
