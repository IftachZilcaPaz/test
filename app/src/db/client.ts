import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * One libSQL client per server process. Locally DATABASE_URL points at a SQLite
 * file (file:./data/app.db); in production it points at a hosted libSQL/Turso
 * database with DATABASE_AUTH_TOKEN, so the schema is identical everywhere.
 */
const globalForDb = globalThis as typeof globalThis & {
  __libsql?: ReturnType<typeof createClient>;
};

const client =
  globalForDb.__libsql ??
  createClient({
    url: process.env.DATABASE_URL ?? "file:./data/app.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__libsql = client;

export const db = drizzle(client, { schema });
