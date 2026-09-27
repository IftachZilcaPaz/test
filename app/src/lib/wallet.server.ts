import "server-only";
import { desc, eq, sum } from "drizzle-orm";
import { db } from "@/db/client";
import { walletEntry } from "@/db/schema";
import { formatShekels } from "./pricing";

export const WELCOME_GIFT_ILS = 10;
export const DEMO_TOPUP_ILS = 50;
/** Demo top-ups exist until a real payment provider is connected (go-live stage). */
export const demoTopupAllowed = () => process.env.ALLOW_DEMO_TOPUP !== "false";

export class InsufficientFunds extends Error {
  constructor(price: number, available: number) {
    super(`אין מספיק יתרה: הפעולה עולה ${formatShekels(price)} ובארנק ${formatShekels(available)}. טענו את הארנק ונסו שוב.`);
  }
}

const round = (value: number) => Math.round(value * 100) / 100;

type Entry = Omit<typeof walletEntry.$inferInsert, "id" | "createdAt">;
/** Entries with a reference are idempotent: a repeat insert is ignored. */
const record = (entry: Entry) => db.insert(walletEntry).values(entry).onConflictDoNothing({ target: walletEntry.reference });

/** Balance in shekels; grants the one-time welcome gift on first use. */
export async function balance(userId: string): Promise<number> {
  await record({ userId, amountIls: WELCOME_GIFT_ILS, kind: "gift", description: "מתנת הצטרפות", reference: `gift:${userId}` });
  const [row] = await db.select({ total: sum(walletEntry.amountIls) }).from(walletEntry).where(eq(walletEntry.userId, userId));
  return round(Number(row?.total ?? 0));
}

export async function history(userId: string, limit = 50) {
  await balance(userId);
  return db.select().from(walletEntry).where(eq(walletEntry.userId, userId)).orderBy(desc(walletEntry.createdAt)).limit(limit);
}

/** Throws InsufficientFunds when the balance can't cover `price`. Call before spending on providers. */
export async function assertCanPay(userId: string, price: number): Promise<void> {
  if (price <= 0) return;
  const available = await balance(userId);
  if (available + 1e-9 < price) throw new InsufficientFunds(price, available);
}

export async function charge(userId: string, price: number, description: string, projectId: string, reference?: string) {
  if (price <= 0) return;
  await record({ userId, amountIls: -round(price), kind: "charge", description, projectId, reference });
}

export async function refund(userId: string, price: number, description: string, projectId: string, reference: string) {
  if (price <= 0) return;
  await record({ userId, amountIls: round(price), kind: "refund", description, projectId, reference });
}

export async function topUp(userId: string, amount: number, description: string) {
  await record({ userId, amountIls: round(amount), kind: "topup", description });
}
