/** A presenter clip lip-synced to a narration take other than the approved one. */
export const isStale = (item: { takeId: string | null }, takeId: string | undefined) => Boolean(item.takeId && item.takeId !== takeId);

export const STALE_MESSAGE = "הקריינות השתנתה אחרי שהקריינית צולמה, אז השפתיים כבר לא מתאימות. צלמו מחדש את הסצנות המסומנות.";
