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
import { currentNarration, getOwnedProject, latestRender, listDrafts, listScenes, listTakes, listUploads } from "@/lib/projects.server";
import { ensureScenes } from "@/lib/scenes/ensure.server";
import { isSceneDemoMode } from "@/lib/scenes/higgsfield.server";
import { isStale } from "@/lib/scenes/stale";
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
  const [drafts, takes, narration, uploads] = await Promise.all([
    listDrafts(item.id),
    listTakes(item.id),
    currentNarration(item.id, item.lexicon),
    listUploads(item.id),
  ]);
  const takeApproved = takes.some((take) => take.approved);
  const approvedTakeId = takes.find((take) => take.approved)?.id;
  // Ownership was verified above; idempotent for projects that reached this step earlier.
  if (takeApproved) await ensureScenes(item.id);
  const [scenes, lastRender] = await Promise.all([listScenes(item.id), latestRender(item.id)]);
  const scriptApproved = drafts.some((draft) => draft.chosenScript);
  const current = STEPS.findIndex((step) => step.key === item.status);
  const chosenDraft = drafts.find((draft) => draft.chosenIndex !== null && draft.chosenScript);
  const chosenLook = chosenDraft ? chosenDraft.options[chosenDraft.chosenIndex!]?.look : undefined;
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
        projectId={item.id}
        style={item.style}
        uploads={uploads.map((entry) => ({ id: entry.id, label: entry.label }))}
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
        realAvailable={!isSceneDemoMode()}
        presenter={item.style === "presenter"}
        look={
          chosenLook
            ? { summary: chosenLook.summary, imageVersion: item.lookImageKey, generating: Boolean(item.lookRequestId) }
            : null
        }
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
          uploadId: entry.uploadId,
          stale: isStale(entry, approvedTakeId),
        }))}
      />

      <RenderStep
        projectId={item.id}
        narrationSeconds={takes.find((take) => take.approved)?.durationSeconds ?? null}
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
