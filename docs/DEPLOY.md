# העלאה לאוויר — Vercel + Turso + Vercel Blob

## למה Vercel ולא Netlify

| | Vercel | Netlify |
|---|---|---|
| Next.js 16 (`after()`, `proxy`, server actions) | היצרנית של Next.js, תמיכה מלאה מהיום הראשון | דרך מתאם, מתעדכן אחרי |
| הרכבת סרטון (ffmpeg, 10–60 שניות) | עד 300 שניות לפונקציה גם בחינם (Fluid compute) | 10 שניות כברירת מחדל, 26 לכל היותר; מעבר לזה צריך לשכתב ל־Background Functions |
| אחסון קבצים | Vercel Blob, חיבור בלחיצה | Netlify Blobs |

ההרכבה רצה ב־`after()` מתוך server action, ולכן היא צריכה פונקציה שחיה כמה עשרות שניות. ב־Vercel זה עובד כמו שהקוד כתוב.

> **שימו לב:** תוכנית Hobby (החינמית) של Vercel מיועדת לשימוש אישי ולא מסחרי. לבדיקות היא מספיקה; כשמתחילים לגבות כסף מלקוחות צריך Pro (‏20$ לחודש).

## מה משתנה בין המחשב לשרת

| | במחשב | בשרת |
|---|---|---|
| מסד נתונים | קובץ `data/app.db` | Turso (אותו libSQL, אותה סכמה) |
| קבצי מדיה (קריינות, סצנות, סרטונים) | תיקיית `data/media` | Vercel Blob פרטי — נקרא רק דרך נתיבי ה־API שבודקים בעלות |
| הבחירה | אוטומטית: אם יש `BLOB_READ_WRITE_TOKEN` — Blob, אחרת תיקייה מקומית | |

## שלב 1 — מסד נתונים ב־Turso (פעם אחת)

```bash
brew install tursodatabase/tap/turso
turso auth signup                 # או: turso auth login
turso db create reynovation
turso db show reynovation --url   # → libsql://reynovation-<user>.turso.io
turso db tokens create reynovation
```

יצירת הטבלאות במסד החדש (מתוך `app/`):

```bash
DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="..." npx drizzle-kit push
```

## שלב 2 — פרויקט ב־Vercel

1. vercel.com → **Add New… → Project** → לבחור את הריפו `higgsfieldApp`.
2. **Root Directory: `app`** (חשוב — האפליקציה בתת־תיקייה). Framework: Next.js.
3. לפני Deploy, ב־**Environment Variables**:

| משתנה | ערך |
|---|---|
| `BETTER_AUTH_SECRET` | חדש, לא זה של המחשב: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | הכתובת הסופית, למשל `https://reynovation.vercel.app` |
| `DATABASE_URL` | מ־Turso (`libsql://...`) |
| `DATABASE_AUTH_TOKEN` | מ־Turso |
| `ANTHROPIC_API_KEY` | כמו ב־`.env.local` |
| `ELEVENLABS_API_KEY` | כמו ב־`.env.local` |
| `HF_API_KEY` | כשיהיה; בלעדיו הסצנות במצב דמו |
| `NEXT_PUBLIC_PRICE_MULTIPLIER` | `3` |
| `ALLOW_DEMO_TOPUP` | `true` לבדיקות; `false` לפני לקוחות אמיתיים |

4. Deploy.
5. בפרויקט → **Storage → Create → Blob** → לבחור **Private** → Connect לפרויקט. זה מוסיף את `BLOB_READ_WRITE_TOKEN` לבד.
6. **Deployments → Redeploy** (כדי שהטוקן ייכנס לתוקף).

אם הכתובת שקיבלתם שונה ממה שהזנתם ב־`BETTER_AUTH_URL` — לעדכן את המשתנה ולעשות Redeploy, אחרת ההתחברות תיכשל ב־"Invalid origin".

### איזה branch עולה

Vercel מעלה לאוויר את ה־branch הראשי (`main`). כל branch אחר מקבל כתובת Preview משלו. כדי שהקוד הנוכחי יהיה ה"אמיתי": למזג את `claude/higgsfield-business-video-7em9ua` ל־`main`, או לשנות ב־Settings → Git את ה־Production Branch.

## שלב 3 — התקנה כאפליקציה בטלפון (PWA)

האתר כבר מוכן להתקנה: manifest בעברית, אייקונים, ודף "אין חיבור" כשהרשת נופלת.

- **אייפון (Safari):** כפתור השיתוף ← "הוספה למסך הבית".
- **אנדרואיד (Chrome):** מופיע "התקנת האפליקציה" לבד, או מתפריט ⋮ ← "התקנת אפליקציה".

האפליקציה נפתחת במסך מלא בלי שורת הכתובת, ישר ל"הפרויקטים שלי".

## בהמשך — אפליקציה בחנויות

ה־PWA הוא הבסיס. כשנרצה להיות ב־App Store / Google Play, עוטפים את אותו אתר (Capacitor), מוסיפים התראות ורכישות מתוך האפליקציה — בלי לשכתב את המסכים.
