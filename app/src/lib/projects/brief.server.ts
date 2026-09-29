import "server-only";
import type { Project } from "@/db/schema";
import { narrationLexicon } from "@/lib/pronunciation/shared.server";
import { briefSchema, type Brief } from "@/lib/script/types";

export function briefFromProject(item: Project) {
  return briefSchema.safeParse({
    business: item.business ?? "",
    about: item.about ?? "",
    audience: item.audience ?? "",
    callToAction: item.callToAction ?? "",
    tone: item.tone,
    seconds: item.seconds,
    lexicon: item.lexicon,
  });
}

/** The brief as Claude receives it: the lexicon includes the shared pronunciations the narrator will use. */
export async function writerBrief(item: Project): Promise<Brief | null> {
  const brief = briefFromProject(item);
  return brief.success ? { ...brief.data, lexicon: await narrationLexicon(brief.data.lexicon) } : null;
}
