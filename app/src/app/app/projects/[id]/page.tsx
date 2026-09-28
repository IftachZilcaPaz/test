import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefForm } from "@/components/brief-form";
import { ScriptStep } from "@/components/script-step";
import { RenderStep } from "@/components/render-step";
import { SceneStep } from "@/components/scene-step";
import { VoiceStep } from "@/components/voice-step";
import { STEPS } from "@/lib/brand";
import { isVoiceId, VOICES } from "@/lib/voice/voices";
import { currentNarration, getOwnedProject, latestRender, listDrafts, listScenes, listTakes } from "@/lib/projects.server";
import { ensureScenes } from "@/lib/scenes/ensure.server";
import { requireUser } from "@/lib/session";
import { saveBrief } from "./actions";

export const metadata: Metadata = { title: "פרויקט · reynovation" };

// Rendering runs in after() inside this page's server actions; give it room on serverless hosts.
export const maxDuration = 300;

export default async function ProjectPage({ params }: PageProps<"/app/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const item = await getOwnedProject(user.id, id);
  if (!item) notFound();
  const [drafts, takes, narration] = await Promise.all([
    listDrafts(item.id),
    listTakes(item.id),
    currentNarration(item.id, item.lexicon),
  ]);
  const takeApproved = takes.some((take) => take.approved);
  // Ownership was verified above; idempotent for projects that reached this step earlier.
  if (takeApproved) await ensureScenes(item.id);
  const [scenes, lastRender] = await Promise.all([listScenes(item.id), latestRender(item.id)]);
  const scriptApproved = drafts.some((draft) => draft.chosenScript);
  const current = STEPS.findIndex((step) => step.key === item.status);
  const voice = VOICES.find((entry) => item.voiceId && isVoiceId(item.voiceId) && entry.id === item.voiceId) ?? VOICES[0];

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
        voice={{ id: voice.id, name: voice.name }}
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
        narrated={takes.length > 0}
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

      <VoiceStep
        projectId={item.id}
        ready={scriptApproved}
        selectedVoiceId={item.voiceId}
        takes={takes.map((take) => ({
          id: take.id,
          voiceId: take.voiceId,
          durationSeconds: take.durationSeconds,
          words: take.words,
          costUsd: take.costUsd,
          approved: take.approved,
          stale: take.spokenText !== narration,
        }))}
      />

      <SceneStep
        projectId={item.id}
        ready={takeApproved}
        approved={item.status === "render" || item.status === "done"}
        scenes={scenes.map((entry) => ({
          id: entry.id,
          position: entry.position,
          caption: entry.caption,
          prompt: entry.prompt,
          seconds: entry.seconds,
          status: entry.status,
          demo: entry.demo,
          costUsd: entry.costUsd,
          error: entry.error,
        }))}
      />

      <RenderStep
        projectId={item.id}
        ready={item.status === "render" || item.status === "done"}
        latest={
          lastRender && {
            id: lastRender.id,
            status: lastRender.status,
            durationSeconds: lastRender.durationSeconds,
            checks: lastRender.checks,
            error: lastRender.error,
          }
        }
      />
    </div>
  );
}
