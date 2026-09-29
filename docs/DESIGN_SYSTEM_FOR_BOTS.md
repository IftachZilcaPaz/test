# מערכת העיצוב של reynovation (לבוטים)

המסמך מתאר בדיוק איך בנוי המראה של האפליקציה, כדי לבנות אפליקציה אחרת באותו סגנון.
הערכים לקוחים מהקוד עצמו (`app/src/app/globals.css`, `app/src/app/layout.tsx` והקומפוננטות).
בסוף המסמך יש בלוק הוראות באנגלית מוכן להדבקה לבוט.

---

## 1. הסגנון במשפט אחד

**Claymorphism בלבנדר:**
- רקע: גרדיאנט פסטל, מלבנדר לוורוד.
- כרטיסים: "חימר" רך, עם צל סגול מתפזר, הארה לבנה בפינה, וצל פנימי עדין.
- שדות קלט: "שקעים" לחוצים פנימה.
- כפתורים: גלולות. הכפתור הראשי בגרדיאנט ורוד לסגול.
- פונטים: עגולים וידידותיים.
- כיוון: עברית מימין לשמאל.

## 2. צבעים (בדיוק)

| שם | ערך | שימוש |
|---|---|---|
| `bg1` | `#e6defb` | תחילת גרדיאנט הרקע, צבע ה־theme של הדפדפן |
| `bg2` | `#fce2ee` | סוף גרדיאנט הרקע |
| `card` | `#fffdff` | כרטיס (תחילת הגרדיאנט) |
| `card-2` | `#f6f1ff` | כרטיס (סוף הגרדיאנט) |
| `well` | `#f3eefd` | שדות קלט ואזורים "לחוצים" |
| `ink` | `#2c2548` | טקסט ראשי |
| `ink-2` | `#655e83` | טקסט משני |
| `ink-3` | `#a39cbc` | טקסט שלישוני, placeholder |
| `line` | `#ece6fa` | מסגרות דקות, כפתור שקוף |
| `accent` | `#8b6fe8` | הצבע הראשי (סגול) |
| `accent-2` | `#f49bb7` | צבע משני (ורוד) |
| `tint-1` | `#eae1fd` | רקע תגית סגולה |
| `tint-2` | `#fde2e9` | רקע תגית ורודה |
| `tint-3` | `#fff0d3` | רקע תגית "בתהליך" (צהבהב) |
| `tint-4` | `#dcf1e9` | רקע תגית ירקרקה |
| `bad` / `bad-soft` | `#d04545` / `#fde3e3` | שגיאה (טקסט / רקע) |
| `good` / `good-soft` | `#2f8a6a` / `#dcf1e9` | הצלחה (טקסט / רקע) |

משתני צל:
- `--glow: rgba(122, 92, 200, 0.22)`: הצל הסגול המתפזר.
- `--hi: rgba(255, 255, 255, 0.95)`: ההארה הלבנה.

## 3. פונטים

- **גוף הטקסט:** Rubik (Google Fonts, עברית ולטינית), עם fallback: `system-ui, -apple-system, "Segoe UI", Arial, sans-serif`.
- **כותרות (h1 עד h3):** Varela Round, משקל 400 (עברית ולטינית), עם fallback ל־Rubik. בכותרות `text-wrap: balance`.
- `-webkit-font-smoothing: antialiased`.
- מספרים ומחירים: `tabular-nums`.

## 4. הקוד המלא של הסגנון (Tailwind CSS v4)

זה הקובץ `globals.css` כמו שהוא. בפרויקט עם Tailwind v4 מדביקים אותו כמו שהוא. בלי Tailwind, מתרגמים את `@apply` ל־CSS רגיל.

```css
@import "tailwindcss";

@theme {
  --color-bg1: #e6defb;
  --color-bg2: #fce2ee;
  --color-card: #fffdff;
  --color-card-2: #f6f1ff;
  --color-well: #f3eefd;
  --color-ink: #2c2548;
  --color-ink-2: #655e83;
  --color-ink-3: #a39cbc;
  --color-line: #ece6fa;
  --color-accent: #8b6fe8;
  --color-accent-2: #f49bb7;
  --color-tint-1: #eae1fd;
  --color-tint-2: #fde2e9;
  --color-tint-3: #fff0d3;
  --color-tint-4: #dcf1e9;
  --color-bad: #d04545;
  --color-bad-soft: #fde3e3;
  --color-good: #2f8a6a;
  --color-good-soft: #dcf1e9;

  --font-body: var(--font-rubik), system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
  --font-round: var(--font-varela), var(--font-rubik), system-ui, sans-serif;

  --radius-clay: 2rem;
}

:root {
  --glow: rgba(122, 92, 200, 0.22);
  --hi: rgba(255, 255, 255, 0.95);
}

/* No rubber-band overscroll on iOS: the app should feel installed, not like a web page. */
html {
  background: var(--color-bg2);
  overscroll-behavior-y: none;
}

body {
  overscroll-behavior-y: none;
  min-height: 100dvh;
  background: linear-gradient(135deg, var(--color-bg1) 0%, var(--color-bg2) 100%) fixed;
  color: var(--color-ink);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: var(--font-round);
  font-weight: 400;
  text-wrap: balance;
}

:focus-visible {
  outline: 2.5px solid var(--color-accent);
  outline-offset: 3px;
  border-radius: 10px;
}

@layer components {
  /* Raised clay card */
  .clay {
    background: linear-gradient(150deg, var(--color-card) 0%, var(--color-card-2) 100%);
    border-radius: var(--radius-clay);
    box-shadow:
      14px 18px 36px -8px var(--glow),
      -6px -6px 18px var(--hi),
      inset 2px 2px 3px var(--hi),
      inset -4px -6px 12px color-mix(in srgb, var(--color-accent) 10%, transparent);
  }

  /* Pressed-in area */
  .well {
    background: var(--color-well);
    box-shadow:
      inset 3px 4px 8px color-mix(in srgb, var(--color-accent) 13%, transparent),
      inset -3px -3px 8px var(--hi);
  }

  /* Text input / textarea / select */
  .field {
    @apply w-full rounded-[20px] border-0 px-4 py-3 text-ink placeholder:text-ink-3;
    background: var(--color-well);
    box-shadow:
      inset 3px 4px 8px color-mix(in srgb, var(--color-accent) 13%, transparent),
      inset -3px -3px 8px var(--hi);
  }

  /* Pill button (secondary look by default) */
  .btn {
    @apply inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-6 py-3 font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-60;
    background: linear-gradient(150deg, var(--color-card), var(--color-card-2));
    box-shadow:
      6px 9px 18px -8px var(--glow),
      inset 2px 2px 3px var(--hi);
  }
  .btn:not(:disabled):hover { transform: translateY(-2px); }
  .btn:not(:disabled):active { transform: translateY(1px) scale(0.99); }

  /* Main action: pink to violet */
  .btn-primary {
    @apply text-white;
    background: linear-gradient(100deg, var(--color-accent-2) 0%, var(--color-accent) 100%);
    box-shadow:
      0 14px 26px -12px var(--color-accent),
      inset 0 2px 4px rgba(255, 255, 255, 0.4),
      inset 0 -3px 6px rgba(0, 0, 0, 0.08);
  }

  /* Quiet action: outline only */
  .btn-ghost {
    @apply text-ink-2;
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--color-line);
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

טעינת הפונטים ב־Next.js (`layout.tsx`):

```tsx
import { Rubik, Varela_Round } from "next/font/google";
const rubik = Rubik({ variable: "--font-rubik", subsets: ["hebrew", "latin"] });
const varela = Varela_Round({ variable: "--font-varela", weight: "400", subsets: ["hebrew", "latin"] });

export const viewport = { themeColor: "#e6defb", width: "device-width", initialScale: 1, viewportFit: "cover" };

// <html lang="he" dir="rtl" className={`${rubik.variable} ${varela.variable}`}>
```

## 5. מבנה המסך

- **מעטפת האפליקציה** (מחשב): רשת של שתי עמודות, `max-w-6xl`, `gap-6`, `px-4 py-6`, `lg:grid-cols-[260px_minmax(0,1fr)]`.
  - **עמודת צד** (ימין, כי RTL): כרטיס `clay p-6`, דביק (`lg:sticky lg:top-6`). בתוכו: קמע בגודל 112 פיקסלים, שם המותג בפונט העגול `text-xl`, "שלום, [שם]", שבב ארנק (`well rounded-3xl px-4 py-3` עם הסכום ב־`tabular-nums`), וכפתור התנתקות.
  - **תוכן:** `min-w-0`, רצף כרטיסים עם `gap-6`.
- **בטלפון:** עמודה אחת, ריווח צד 16 פיקסלים (`px-4`), בלי גלילה אופקית.
- **כרטיס מקטע:** `clay flex flex-col gap-3 p-6 md:p-8`, כותרת `text-2xl` בפונט העגול, ומתחתיה הסבר קצר ב־`text-ink-2`.
- **פס שלבים:** גלולות `rounded-full px-4 py-1.5 text-sm font-semibold`, בשלושה מצבים:
  - נוכחי: `bg-accent text-white`
  - הושלם: `bg-tint-1 text-accent`, עם "✓"
  - עתידי: `bg-well text-ink-3`

## 6. רכיבים חוזרים

| רכיב | איך |
|---|---|
| תגית סטטוס | `rounded-full px-3 py-1 text-xs font-semibold`. מוכן: `bg-good-soft text-good`. בתהליך: `bg-tint-3 text-ink`. ממתין: `bg-well text-ink-2`. נכשל: `bg-bad-soft text-bad` |
| הודעת שגיאה | `role="alert"`, `rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad` |
| הודעת התקדמות | `role="status"`, `animate-pulse rounded-2xl bg-tint-3 px-4 py-3 font-semibold` |
| בחירה מבין כמה (רדיו) | ה־input מוסתר (`sr-only peer`), ו־`span` בעיצוב `well rounded-2xl px-4 py-2` עם `peer-checked:bg-accent peer-checked:text-white` |
| כרטיס בחירה גדול | `rounded-2xl bg-card px-4 py-3`, ונבחר: `peer-checked:ring-4 ring-accent` |
| אישור מחיר | חלון (`<dialog>` בתוך `clay`) עם כותרת, משפט אחד מה יקרה, המחיר בהדגשה, שורת יתרה בארנק, "אישור" ראשי ו"ביטול" שקוף |
| טעינה של אזור | מלבן `clay` או `well` עם `animate-pulse` וטקסט קצר של מה קורה |
| מדיה אנכית | `aspect-[9/16] rounded-3xl overflow-hidden bg-well` |

## 7. טקסטים בממשק

- עברית, פנייה ברבים ("לחצו", "תשמעו"), משפטים קצרים.
- כפתור = פועל ברור ("צרו לי סרטון", "נשמע טוב, ממשיכים").
- **בלי מקף ארוך** (— או –) בשום טקסט. במקומו: פסיק, נקודה, נקודתיים או סוגריים.
- מחירים ומספרים בשקלים, עם `tabular-nums`.
- קטע באנגלית או מספרים בתוך טקסט עברי עוטפים ב־`<bdi dir="ltr">` (למשל `720×1280`, רשימת מספרים "1, 4, 6"), כדי שהסדר לא יתהפך.
- לפני כל פעולה שעולה כסף: מחיר ואישור.

## 8. נגישות ותנועה

- `:focus-visible` בצבע accent (בקוד למעלה).
- מעבר עכבר על כפתור מרים אותו 2 פיקסלים. לחיצה מורידה אותו פיקסל ומכווצת מעט.
- `prefers-reduced-motion` מבטל אנימציות.
- הודעות: `role="alert"` לשגיאה, `role="status"` להתקדמות.

## 9. קמע (אופציונלי)

דמות תלת־ממדית בסגנון חימר, שמופיעה בעמודת הצד ובמסך הכניסה. זו ההנחיה שבה נוצר הקמע, למודל תמונות:

```
Adorable 3D clay-style mascot for a creative [your domain] brand, Pixar-like stylized
[character description], cheerful open smile, pastel lavender and cream outfit,
friendly pose. Around it float soft 3D shapes (a pink play-button bubble, a mint speech
bubble, small golden sparkles). Soft pastel lavender gradient background, gentle studio
lighting, claymorphism, smooth matte clay texture, high detail, centered, no text,
no letters, no logos
```

---

## בלוק הוראות להדבקה

```
Build the UI in the "lavender claymorphism" style below. Hebrew, right-to-left:
<html lang="he" dir="rtl">.

Colors (use exactly): bg1 #e6defb, bg2 #fce2ee, card #fffdff, card-2 #f6f1ff,
well #f3eefd, ink #2c2548, ink-2 #655e83, ink-3 #a39cbc, line #ece6fa,
accent #8b6fe8, accent-2 #f49bb7, tint-1 #eae1fd, tint-2 #fde2e9, tint-3 #fff0d3,
tint-4 #dcf1e9, bad #d04545, bad-soft #fde3e3, good #2f8a6a, good-soft #dcf1e9.
Shadow vars: --glow rgba(122,92,200,0.22), --hi rgba(255,255,255,0.95).

Page: body background linear-gradient(135deg, bg1, bg2) fixed; min-height 100dvh;
html background bg2 and overscroll-behavior-y none.

Fonts: body Rubik (hebrew+latin); headings h1-h3 Varela Round weight 400 with
text-wrap balance. Prices and numbers use tabular-nums.

Components (copy these exactly):
- .clay (raised card): gradient 150deg card to card-2, radius 2rem, box-shadow
  14px 18px 36px -8px glow, -6px -6px 18px hi, inset 2px 2px 3px hi,
  inset -4px -6px 12px (accent at 10%).
- .well (pressed area) and .field (inputs, radius 20px, padding 12px 16px, no border):
  background well; box-shadow inset 3px 4px 8px (accent at 13%), inset -3px -3px 8px hi.
- .btn: pill (rounded-full), padding 12px 24px, font-semibold, gradient card to card-2,
  shadow 6px 9px 18px -8px glow + inset 2px 2px 3px hi; hover translateY(-2px);
  active translateY(1px) scale(.99); disabled opacity .6.
- .btn-primary: white text, gradient 100deg accent-2 to accent, shadow
  0 14px 26px -12px accent + inset highlights.
- .btn-ghost: transparent, ink-2 text, inset 0 0 0 2px line.
- focus-visible: 2.5px solid accent outline, offset 3px, radius 10px.
- Respect prefers-reduced-motion.

Layout: desktop two columns (max-width 72rem, 260px side column with the logo,
greeting and a wallet chip in a .well), content as a stack of .clay sections
(padding 24px, 32px from md, gap 24px). Mobile: one column, 16px side padding,
no horizontal scroll.

Patterns: status chips (rounded-full, text-xs, semibold; ready good-soft/good,
working tint-3/ink, waiting well/ink-2, failed bad-soft/bad); errors role=alert in
bad-soft; progress role=status with a pulse in tint-3; radio choices as hidden
inputs with styled .well spans that turn accent/white when checked; vertical media
aspect 9/16 with rounded-3xl.

Copy: short Hebrew, plural address, verb buttons. Never use a long dash (— or –).
Wrap LTR snippets and number lists in <bdi dir="ltr">. Show a price and ask for
confirmation before any action that costs money.
```
