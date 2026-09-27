/** Customer-facing prices are shown in shekels; providers bill us in dollars. */
export const USD_TO_ILS = Number(process.env.NEXT_PUBLIC_USD_TO_ILS ?? 3.7);

const ils = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 3 });

export const formatIls = (usdAmount: number) => ils.format(usdAmount * USD_TO_ILS);
export const formatUsd = (usdAmount: number) => usd.format(usdAmount);
