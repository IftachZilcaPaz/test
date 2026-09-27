import { USD_TO_ILS } from "./money";

/**
 * What the customer pays: our provider cost × markup, in shekels, rounded up to
 * 10 agorot. One place to change the business model.
 */
export const PRICE_MULTIPLIER = Number(process.env.NEXT_PUBLIC_PRICE_MULTIPLIER ?? 3);

export function customerPriceIls(providerUsd: number): number {
  if (providerUsd <= 0) return 0;
  return Math.max(0.1, Math.ceil(providerUsd * USD_TO_ILS * PRICE_MULTIPLIER * 10) / 10);
}

const shekels = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatShekels = (ils: number) => shekels.format(ils);
export const formatCustomerPrice = (providerUsd: number) => formatShekels(customerPriceIls(providerUsd));
