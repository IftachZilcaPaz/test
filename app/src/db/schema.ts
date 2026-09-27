import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());

// ── Better Auth core tables (fields mirror @better-auth/core getAuthTables) ──
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// ── reynovation product tables ──
export const PROJECT_STATUSES = ["brief", "script", "voice", "scenes", "render", "done"] as const;
export const SCENE_STATUSES = ["draft", "generating", "ready", "failed"] as const;
export const RENDER_STATUSES = ["rendering", "done", "failed"] as const;
export const WALLET_KINDS = ["gift", "topup", "charge", "refund"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** One promo video in the making. Brief fields are filled on the first screen (stage 1). */
export const project = sqliteTable(
  "project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("brief"),
    business: text("business"),
    about: text("about"),
    audience: text("audience"),
    callToAction: text("call_to_action"),
    tone: text("tone").notNull().default("warm"),
    seconds: integer("seconds").notNull().default(20),
    /** Pronunciation lexicon, one "word = pointed" pair per line. */
    lexicon: text("lexicon").notNull().default(""),
    /** ElevenLabs voice chosen in the voice step. */
    voiceId: text("voice_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("project_user_updated_idx").on(table.userId, table.updatedAt)],
);

export type Project = typeof project.$inferSelect;

/** One "write me 3 scripts" request: the options, what it cost, and which one was approved. */
export const scriptDraft = sqliteTable(
  "script_draft",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    options: text("options", { mode: "json" }).notNull().$type<import("@/lib/script/types").ScriptOption[]>(),
    chosenIndex: integer("chosen_index"),
    /** The approved narration, after the customer's edits. */
    chosenScript: text("chosen_script"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [index("script_draft_project_created_idx").on(table.projectId, table.createdAt)],
);

export type ScriptDraft = typeof scriptDraft.$inferSelect;

/** One narration take: the audio, per-word timings for captions, and what it cost. */
export const voiceTake = sqliteTable(
  "voice_take",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    voiceId: text("voice_id").notNull(),
    /** Exactly what the narrator read (approved script with the lexicon applied). */
    spokenText: text("spoken_text").notNull(),
    audioKey: text("audio_key").notNull(),
    words: text("words", { mode: "json" }).notNull().$type<import("@/lib/voice/voices").TimedWord[]>(),
    durationSeconds: real("duration_seconds").notNull(),
    characters: integer("characters").notNull(),
    costUsd: real("cost_usd").notNull(),
    approved: integer("approved", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [index("voice_take_project_created_idx").on(table.projectId, table.createdAt)],
);

export type VoiceTake = typeof voiceTake.$inferSelect;

/** One b-roll shot of the video; the caption quotes the narration word for word. */
export const scene = sqliteTable(
  "scene",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    caption: text("caption").notNull(),
    /** English visual prompt (video models garble Hebrew, so no on-screen text). */
    prompt: text("prompt").notNull(),
    seconds: integer("seconds").notNull().default(5),
    status: text("status", { enum: SCENE_STATUSES }).notNull().default("draft"),
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    requestId: text("request_id"),
    mediaKey: text("media_key"),
    costUsd: real("cost_usd").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("scene_project_position_idx").on(table.projectId, table.position)],
);

export type Scene = typeof scene.$inferSelect;

/** A finished-video render and the automatic checks it passed. */
export const render = sqliteTable(
  "render",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    status: text("status", { enum: RENDER_STATUSES }).notNull().default("rendering"),
    mediaKey: text("media_key"),
    durationSeconds: real("duration_seconds"),
    checks: text("checks", { mode: "json" }).$type<import("@/lib/video/checks").RenderCheck[]>(),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("render_project_created_idx").on(table.projectId, table.createdAt)],
);

export type Render = typeof render.$inferSelect;

/** Customer wallet ledger in shekels: positive = credit, negative = charge. Balance = sum. */
export const walletEntry = sqliteTable(
  "wallet_entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amountIls: real("amount_ils").notNull(),
    kind: text("kind", { enum: WALLET_KINDS }).notNull(),
    description: text("description").notNull(),
    projectId: text("project_id"),
    /** Idempotency key (e.g. "gift:<user>", "refund:scene:<id>"): each is recorded at most once. */
    reference: text("reference").unique(),
    createdAt: createdAt(),
  },
  (table) => [index("wallet_entry_user_created_idx").on(table.userId, table.createdAt)],
);

export type WalletEntry = typeof walletEntry.$inferSelect;
