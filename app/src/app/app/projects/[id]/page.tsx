import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefForm } from "@/components/brief-form";
import { ScriptStep } from "@/components/script-step";
import { STEPS } from "@/lib/brand";
import { getOwnedProject, listDrafts } from "@/lib/projects.server";
import { requireUser } from "@/lib/session";
import { saveBrief } from "./actions";

export const metadata: Metadata = { title: "פרויקט · reynovation" };

export default async function ProjectPage({ params }: PageProps<"/app/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const item = await getOwnedProject(user.id, id);
  if (!item) notFound();
  const drafts = await listDrafts(item.id);
  const current = STEPS.findIndex((step) => step.key === item.status);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app" className="text-sm text-ink-2 hover:text-accent">
        → כל הפרויקטים
      </Link>

      <section className="clay flex flex-col gap-4 p-6 md:p-8">
        <h1 className="text-3xl">{item.name}</h1>
        <ol className="flex flex-wrap gap-2" aria-label="שלבי הפרויקט">
          {STEPS.map((step, index) => {
            const state = index < current ? "done" : index === current ? "current" : "later";
            return (
              <li
                key={step.key}
                aria-current={state === "current" ? "step" : undefined}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  state === "current" ? "bg-accent text-white" : state === "done" ? "bg-tint-1 text-accent" : "bg-well text-ink-3"
                }`}
              >
                {index + 1}. {step.title}
                {state === "done" ? " ✓" : ""}
              </li>
            );
          })}
        </ol>
      </section>

      <BriefForm
        action={saveBrief.bind(null, item.id)}
        values={{
          business: item.business ?? "",
          about: item.about ?? "",
          audience: item.audience ?? "",
          callToAction: item.callToAction ?? "",
          tone: item.tone,
          seconds: item.seconds,
          lexicon: item.lexicon,
        }}
      />

      <ScriptStep
        projectId={item.id}
        ready={item.status !== "brief"}
        seconds={item.seconds}
        lexicon={item.lexicon}
        drafts={drafts.map((draft) => ({
          id: draft.id,
          options: draft.options,
          chosenIndex: draft.chosenIndex,
          chosenScript: draft.chosenScript,
          costUsd: draft.costUsd,
          demo: draft.demo,
          createdAt: draft.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
