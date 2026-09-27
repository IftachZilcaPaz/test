import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { project } from "@/db/schema";
import { STEPS } from "@/lib/brand";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "פרויקט · reynovation" };

export default async function ProjectPage({ params }: PageProps<"/app/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [item] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, user.id)))
    .limit(1);
  if (!item) notFound();

  const current = STEPS.findIndex((step) => step.key === item.status);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app" className="text-sm text-ink-2 hover:text-accent">
        → כל הפרויקטים
      </Link>
      <section className="clay flex flex-col gap-2 p-6 md:p-8">
        <h1 className="text-3xl">{item.name}</h1>
        <p className="text-ink-2">חמישה צעדים מסרטון. כל צעד שעולה כסף יראה לכם מחיר מדויק לפני שתאשרו.</p>
      </section>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="שלבי הפרויקט">
        {STEPS.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "later";
          return (
            <li
              key={step.key}
              aria-current={state === "current" ? "step" : undefined}
              className={`clay flex flex-col gap-1 p-5 ${state === "later" ? "opacity-60" : ""}`}
            >
              <span className="font-round text-3xl text-accent">{index + 1}</span>
              <span className="font-semibold">{step.title}</span>
              <span className="text-sm text-ink-2">{step.hint}</span>
              <span className="mt-2 text-xs font-semibold text-ink-3">
                {state === "current" ? "הצעד הבא — בקרוב" : state === "done" ? "הושלם" : "בהמשך"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
