"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { DEMO_TOPUP_ILS, demoTopupAllowed, topUp } from "@/lib/wallet.server";

/** Development stand-in for a real payment; disabled with ALLOW_DEMO_TOPUP=false. */
export async function demoTopUp(): Promise<void> {
  const user = await requireUser();
  if (!demoTopupAllowed()) return;
  await topUp(user.id, DEMO_TOPUP_ILS, "טעינה לדוגמה (מצב פיתוח, בלי תשלום)");
  revalidatePath("/app", "layout");
}
