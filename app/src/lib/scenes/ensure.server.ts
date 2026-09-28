import "server-only";
import { db } from "@/db/client";
import { scene } from "@/db/schema";
import { approvedMaterial, getProjectStyle, listScenes, listUploads, usesUploads } from "@/lib/projects.server";
import { captionQuotes } from "@/lib/script/hebrew";
import { buildTimeline, clipSecondsFor } from "@/lib/video/timeline";
import { isSceneDemoMode } from "./higgsfield.server";

const MAX_SCENES = 8;

/** Server-only: callers must have verified project ownership first. */
/** Creates the scene list once, from the approved script's suggestions and the narration timings. */
export async function ensureScenes(projectId: string): Promise<void> {
  if ((await listScenes(projectId)).length > 0) return;
  const { draft, option, take } = await approvedMaterial(projectId);
  if (!draft?.chosenScript || !take) return;

  let suggestions = (option?.scenes ?? []).filter((item) => captionQuotes(item.caption, draft.chosenScript!));
  if (suggestions.length === 0) {
    // The customer rewrote the script: fall back to thirds of the narration.
    const words = draft.chosenScript.split(/\s+/u);
    const third = Math.ceil(words.length / 3);
    suggestions = [0, 1, 2].map((part) => ({
      caption: words.slice(part * third, part * third + Math.min(5, third)).join(" "),
      visual: "Warm cinematic b-roll of real people enjoying the service, natural light",
    }));
  }
  suggestions = suggestions.slice(0, MAX_SCENES);
  const timeline = buildTimeline(take.words, suggestions.map((item) => item.caption));
  // A beat the script tied to one of the customer's screenshots shows it as-is: ready, and free.
  const uploads = usesUploads(await getProjectStyle(projectId)) ? await listUploads(projectId) : [];
  await db.insert(scene).values(
    suggestions.map((item, position) => {
      const shown = item.screen ? uploads[item.screen - 1] : undefined;
      return {
        projectId,
        position,
        caption: item.caption,
        prompt: shown ? `Screenshot: ${shown.label || "customer image"}` : item.visual,
        seconds: clipSecondsFor((timeline.scenes[position]?.end ?? 5) - (timeline.scenes[position]?.start ?? 0)),
        demo: shown ? false : isSceneDemoMode(),
        ...(shown ? { uploadId: shown.id, mediaKey: shown.mediaKey, status: "ready" as const } : {}),
      };
    }),
  );
}
