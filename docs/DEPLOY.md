# העלאה לאוויר — Netlify + Turso

הקוד רץ בשלושה מקומות בלי שינוי: במחשב (כמו היום), ב־Netlify (המסלול הראשי), וב־Vercel (גיבוי).

## מה משתנה בין המחשב לשרת

| | במחשב | ב־Netlify |
|---|---|---|
| מסד נתונים | קובץ `data/app.db` | Turso (אותו libSQL, אותה סכמה) |
| קבצי מדיה (קריינות, סצנות, סרטונים) | תיקיית `data/media` | Netlify Blobs — מובנה, בלי הגדרה, פרטי לאתר |
| הרכבת סרטון | ברקע, בלי הגבלת זמן | ברקע, עד 60 שניות לפונקציה |

הבחירה בין האחסונים אוטומטית. `MEDIA_STORE=netlify` מכריח אותה אם צריך.

**אם הרכבה נקטעת:** אחרי 3 דקות בלי סיום היא מסומנת "נקטעה — נסו שוב" (בחינם), במקום להסתובב לנצח.

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

## שלב 2 — אתר ב־Netlify

1. app.netlify.com → **Add new project → Import an existing project → GitHub** → הריפו `higgsfieldApp`.
2. **Branch to deploy:** ה־branch שעליו הקוד (היום `claude/higgsfield-business-video-7em9ua`; אחרי מיזוג — `main`).
3. שאר ההגדרות (תיקייה `app`, פקודת build, Node 22) נקראות אוטומטית מ־`netlify.toml`. לא לשנות.
4. לפני Deploy — **Site configuration → Change site name**, למשל `reynovation` → הכתובת תהיה `https://reynovation.netlify.app`.
5. **Site configuration → Environment variables**:

| משתנה | ערך |
|---|---|
| `BETTER_AUTH_SECRET` | חדש, לא זה של המחשב: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | הכתובת הסופית, למשל `https://reynovation.netlify.app` |
| `DATABASE_URL` | מ־Turso (`libsql://...`) |
| `DATABASE_AUTH_TOKEN` | מ־Turso |
| `MEDIA_STORE` | `netlify` |
| `ANTHROPIC_API_KEY` | כמו ב־`.env.local` |
| `ELEVENLABS_API_KEY` | כמו ב־`.env.local` |
| `HF_API_KEY` | כשיהיה; בלעדיו הסצנות במצב דמו |
| `NEXT_PUBLIC_PRICE_MULTIPLIER` | `3` |
| `ALLOW_DEMO_TOPUP` | `true` לבדיקות; `false` לפני לקוחות אמיתיים |

6. **Deploys → Trigger deploy**.

אם הכתובת שונה ממה שב־`BETTER_AUTH_URL` — לעדכן ולעשות deploy מחדש, אחרת ההתחברות תיכשל ב־"Invalid origin".

### בדיקה אחרי העלאה

הרשמה → פרויקט → תסריט → קול → סצנות לדוגמה → הרכבה → הורדה. אם משהו נכשל: **Logs → Functions** ב־Netlify, ולשלוח לי את השורות האדומות.

## שלב 3 — התקנה כאפליקציה בטלפון (PWA)

האתר כבר מוכן להתקנה: manifest בעברית, אייקונים, ודף "אין חיבור" כשהרשת נופלת.

- **אייפון (Safari):** כפתור השיתוף ← "הוספה למסך הבית".
- **אנדרואיד (Chrome):** מופיע "התקנת האפליקציה" לבד, או מתפריט ⋮ ← "התקנת אפליקציה".

האפליקציה נפתחת במסך מלא בלי שורת הכתובת, ישר ל"הפרויקטים שלי".

## בהמשך — אפליקציה בחנויות

ה־PWA הוא הבסיס. כשנרצה להיות ב־App Store / Google Play, עוטפים את אותו אתר (Capacitor) — בלי לשכתב את המסכים. לתכנן מראש: קניית קרדיטים מתוך אפליקציה בחנויות עוברת בתשלום של אפל/גוגל (עמלה 15–30%), וזה משפיע על המכפיל.

## גיבוי — Vercel

אותו קוד עולה גם ל־Vercel: Root Directory `app`, אותם משתנים (בלי `MEDIA_STORE`), ו־Storage → Blob (**Private**) שמוסיף `BLOB_READ_WRITE_TOKEN` לבד. תוכנית Hobby של Vercel לא מיועדת לשימוש מסחרי.
