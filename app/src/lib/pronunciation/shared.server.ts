import "server-only";
import { countDistinct, desc, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { pronunciationVote } from "@/db/schema";
import { BUILT_IN_LEXICON, formatLexicon, parseLexicon, type Lexicon } from "@/lib/script/hebrew";

/**
 * The pronunciation knowledge every project starts from, and grows with use:
 * - the built-in spellings, confirmed by ear by the studio;
 * - spellings learned from customers: each customer who saves a spelling in their lexicon,
 *   or approves a narration read with it, vouches for it once. A spelling becomes shared
 *   when LEARN_AFTER different customers vouched for it (the most vouched one per word).
 * A project's own lexicon always wins over the shared one.
 */
const LEARN_AFTER = 3;

export async function learnedLexicon(): Promise<Lexicon> {
  const rows = await db
    .select({ word: pronunciationVote.word, pointed: pronunciationVote.pointed, users: countDistinct(pronunciationVote.userId) })
    .from(pronunciationVote)
    .groupBy(pronunciationVote.word, pronunciationVote.pointed)
    .having(sql`count(distinct ${pronunciationVote.userId}) >= ${LEARN_AFTER}`)
    .orderBy(desc(countDistinct(pronunciationVote.userId)));
  const learned: Lexicon = {};
  for (const row of rows) learned[row.word] ??= row.pointed;
  return learned;
}

/** The lexicon a narration is read with: shared knowledge, overridden by the project's own entries. */
export async function narrationLexicon(projectLexicon: string): Promise<string> {
  return formatLexicon({ ...(await learnedLexicon()), ...BUILT_IN_LEXICON, ...parseLexicon(projectLexicon) });
}

/** Records that this customer vouches for every spelling in their lexicon. Idempotent. */
export async function vouch(userId: string, projectLexicon: string): Promise<void> {
  const entries = Object.entries(parseLexicon(projectLexicon));
  if (entries.length === 0) return;
  await db
    .insert(pronunciationVote)
    .values(entries.map(([word, pointed]) => ({ word, pointed, userId })))
    .onConflictDoNothing();
}
