# reynovation — האפליקציה

סטודיו לסרטוני פרומו בעברית. שלב 0 (שלד): אתר בעברית מימין לשמאל, עיצוב הלילך, הרשמה והתחברות,
ופרויקטים שנשמרים במסד נתונים. התוכנית המלאה: [`../docs/BUILD_PLAN.md`](../docs/BUILD_PLAN.md).

## הרצה במחשב (פעם ראשונה)
```bash
cd app
npm install
npm run setup   # יוצר .env.local עם סוד אקראי ואת מסד הנתונים המקומי (data/app.db)
npm run dev     # http://localhost:3000
```
אחרי זה, בכל פעם: `npm run dev`.

## פקודות
| פקודה | מה היא עושה |
|---|---|
| `npm run dev` | מריץ את האתר במצב פיתוח |
| `npm run build` / `npm start` | בנייה והרצה כמו בשרת אמיתי |
| `npm run typecheck` / `npm run lint` | בדיקות קוד |
| `npm run db:push` | מעדכן את מסד הנתונים אחרי שינוי ב-`src/db/schema.ts` |
| `npm run db:studio` | מסך לצפייה בנתונים |

## מבנה
| נתיב | מה יש שם |
|---|---|
| `src/app/page.tsx` | דף הבית |
| `src/app/(auth)/` | הרשמה והתחברות |
| `src/app/app/` | האזור של הלקוח: פרויקטים ושלבי הסרטון |
| `src/db/schema.ts` | טבלאות: משתמשים וחיבורים (Better Auth) ופרויקטים |
| `src/lib/auth.ts` | הגדרות ההתחברות; `src/lib/session.ts` — בדיקת משתמש בכל עמוד ופעולה |
| `src/app/globals.css` | צבעי הלילך וסגנון הקליי |

## תסריטים (שלב 1)
- בלי `ANTHROPIC_API_KEY` ב-`.env.local` האפליקציה במצב דמו: תסריטים לדוגמה, בחינם.
- עם מפתח: Claude Opus 5 כותב 3 תסריטים. לפני הכתיבה מוצג מחיר מקסימלי (ספירת טוקנים חינמית), ואחריה המחיר המדויק.
- הכללים לכתיבה ב-`src/lib/script/prompt.ts`; חישובי אורך וניקוד ב-`src/lib/script/hebrew.ts`.
- שער הדולר לתצוגה: `NEXT_PUBLIC_USD_TO_ILS` (ברירת מחדל 3.7).

## קול (שלב 2)
- `ELEVENLABS_API_KEY` ב-`.env.local` (הרשאות: Text to Speech, Voices לקריאה).
- 8 קולות בגלריה (`src/lib/voice/voices.ts`). דגימה בעברית לכל קול נוצרת בפעם הראשונה ששומעים אותה ונשמרת (~1 סנט לקול, פעם אחת).
- ההקראה ב-`eleven_v3` עם `language_code: he`, בקריאה אחת שמחזירה גם תזמון לכל תו → תזמון לכל מילה (לכיתובים).
- המחיר מדויק מראש: $0.10 ל-1,000 תווים.
- קבצי השמע נשמרים ב-`data/media` ומוגשים רק לבעל הפרויקט.

## אבטחה
- כל עמוד ופעולה באזור הלקוח בודקים את המשתמש בשרת (`requireUser`), וכל שאילתה מסוננת לפי המשתמש.
- סודות רק ב-`.env.local`, שלא נכנס ל-git. מפתחות API (Claude, ElevenLabs, Higgsfield) ייכנסו לשם בשלבים הבאים, ולעולם לא לדפדפן.

## בפרודקשן
`BETTER_AUTH_URL` = הכתובת האמיתית של האתר, `DATABASE_URL` = מסד libSQL/Turso + `DATABASE_AUTH_TOKEN`.
