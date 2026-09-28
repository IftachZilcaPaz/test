import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { project, render } from "@/db/schema";
import { deleteMedia, getMedia, hasMedia, putMedia } from "@/lib/storage.server";
import { renderChecks } from "./checks";
import { assembleParts, planRender, renderPart, type RenderInput } from "./render.server";

/**
 * Server-only: callers must have verified project ownership first.
 *
 * A render advances a little on every poll of the page, so no request runs past the
 * host's limit: each step encodes a few parts and stores them, and the step that finds
 * every part ready joins them into the video. A step that dies midway (killed at the
 * time limit) is simply retried by the next poll; a render that keeps dying without
 * progress is reported as failed instead of retrying forever.
 */
type JobState = { input: RenderInput; script: string; leaseUntil: number; stalls: number };

// Stop starting new work once a step has run this long; the host cuts requests at ~30 s.
const STEP_BUDGET_MS = 9_000;
// How long a step owns the job; a step killed by the host frees it after this.
const LEASE_MS = 35_000;
// Consecutive steps that made no progress before the render is given up.
const MAX_STALLS = 3;

const FAILED = "ההרכבה נכשלה. נסו שוב, זה בחינם.";

const keyOf = (projectId: string, jobId: string, name: string) => `projects/${projectId}/renders/${jobId}/${name}`;

async function readState(key: string): Promise<JobState | null> {
  const bytes = await getMedia(key);
  return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as JobState) : null;
}

const writeState = (key: string, state: JobState) => putMedia(key, new TextEncoder().encode(JSON.stringify(state)));

export async function createRenderJob(projectId: string, jobId: string, input: RenderInput, script: string): Promise<void> {
  await writeState(keyOf(projectId, jobId, "state.json"), { input, script, leaseUntil: 0, stalls: 0 });
}

async function fail(jobId: string, reason: unknown) {
  console.error("[render] failed", { jobId, reason: reason instanceof Error ? reason.message : reason });
  await db.update(render).set({ status: "failed", error: FAILED }).where(eq(render.id, jobId));
}

export type RenderProgress = { done: number; total: number };

/** Moves one render forward by at most one step's worth of work. Safe to call repeatedly. */
export async function advanceRender(projectId: string, jobId: string): Promise<RenderProgress> {
  const stateKey = keyOf(projectId, jobId, "state.json");
  const state = await readState(stateKey);
  if (!state) {
    await fail(jobId, "no job state (started before step rendering, or lost)");
    return { done: 0, total: 0 };
  }
  const plan = planRender(state.input);
  const partKey = (index: number) => keyOf(projectId, jobId, `part-${index}.mp4`);
  const ready = async () => (await Promise.all(plan.parts.map((part) => hasMedia(partKey(part.index))))).filter(Boolean).length;

  // Another step is working on it (a second tab, or a slow previous poll).
  if (state.leaseUntil > Date.now()) return { done: await ready(), total: plan.parts.length };
  if (state.stalls >= MAX_STALLS) {
    await fail(jobId, `no progress after ${MAX_STALLS} steps`);
    return { done: await ready(), total: plan.parts.length };
  }
  await writeState(stateKey, { ...state, leaseUntil: Date.now() + LEASE_MS, stalls: state.stalls + 1 });

  const started = Date.now();
  let progressed = false;
  try {
    let done = 0;
    for (const part of plan.parts) {
      if (await hasMedia(partKey(part.index))) {
        done++;
        continue;
      }
      if (Date.now() - started > STEP_BUDGET_MS) break;
      await putMedia(partKey(part.index), await renderPart(state.input, plan, part));
      progressed = true;
      done++;
    }
    // Keeps the row's updatedAt current while the render moves.
    await db.update(render).set({ error: null }).where(eq(render.id, jobId));

    if (done === plan.parts.length && Date.now() - started <= STEP_BUDGET_MS) {
      const parts = await Promise.all(plan.parts.map(async (part) => (await getMedia(partKey(part.index)))!));
      const video = await assembleParts(state.input, plan, parts);
      const mediaKey = `projects/${projectId}/renders/${jobId}.mp4`;
      await putMedia(mediaKey, video);
      const checks = renderChecks(plan.timeline, state.input.scenes.map((scene) => scene.caption), state.script);
      await db.update(render).set({ status: "done", mediaKey, durationSeconds: plan.timeline.total, checks }).where(eq(render.id, jobId));
      await db.update(project).set({ status: "done" }).where(eq(project.id, projectId));
      await Promise.all([stateKey, ...plan.parts.map((part) => partKey(part.index))].map((key) => deleteMedia(key).catch(() => undefined)));
      return { done, total: plan.parts.length };
    }
    await writeState(stateKey, { ...state, leaseUntil: 0, stalls: progressed ? 0 : state.stalls + 1 });
    return { done, total: plan.parts.length };
  } catch (error) {
    await fail(jobId, error);
    return { done: 0, total: plan.parts.length };
  }
}
