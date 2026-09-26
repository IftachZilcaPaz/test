# mentorit-ad-1: תסריט ותוכנית לאישור

**אורך משוער:** ~25.9 שנ' (×1.15) · **48 מילים** · **עלות משוערת:** 36 קרדיטים ✅ בתוך התקציב

## 1. הקריינות (הטקסט שיישלח לקריינית)

> מחפשים מנטור, ולא יודעים במי לבחור? במֶנְטוֹר אִיט עונים על ארבע שאלות קצרות, ומקבלים דוח התאמה אישי. אפשר לראות כל פרופיל עד הסוף: מה תקבלו בפגישה הראשונה, וכמה זה עולה. אונליין או פנים מול פנים. ומנטורים? הצטרפו גם אתם. מֶנְטוֹר אִיט: המנטור הנכון הוא לא עניין של מזל.

### מילים מנוקדות, לבדוק שההגייה נכונה

| מילה | הגייה | למה |
|---|---|---|
| מֶנְטוֹר אִיט | mentor it | brand name; unpointed איט can be read 'ayit' |

## 2. מה רואים ומתי

| # | ~שנ' | מה על המסך | כיתוב | מתחיל במילה |
|---|---|---|---|---|
| 0 | 0.0 | שוט מהספרייה `roof`: Close-up of hands typing on a smartphone on a rooftop at sunset, city skyline and lake behind; screen out of focus | מחפשים מנטור? | – |
| 1 | 3.1 | מסך `home` (home: 'the right mentor is not a matter of luck', find-me-a-mentor button, 86% match example) | המנטור הנכון בלי ניחושים | במנטור |
| 2 | 5.0 | מסך `q_field` (questionnaire step 1/4: which field (health, parenting, relationships, entrepreneurship, finance, career)) | 4 שאלות קצרות | ארבע |
| 3 | 6.4 | מסך `match` (personal match report: 89% match with a mentor and why) | דוח התאמה אישי / ולמה דווקא הוא | ומקבלים |
| 4 | 8.3 | מסך `iftach_full` (גלילה) (full mentor profile (Iftach Paz Zilca): price, about, what you get in the first session, who it fits, availability) | כל הפרופיל עד הסוף | אפשר |
| 5 | 14.4 | שוט חדש `cafe` | אונליין או פנים מול פנים | אונליין |
| 6 | 16.7 | מסך `signup` (sign-up dialog (Google or email)) | מנטורים? הצטרפו גם אתם | ומנטורים |
| 7 | 18.6 | מסך `team` (designed slide: 'the mentor it team' with the two mentors' photos) | – | מנטור |
| 8 | 22.9 | כרטיס סיום אוטומטי: המנטור הנכון הוא לא עניין של מזל · mentorit.me | – | – |

## 3. שוטים ועלות

- מהספרייה (0 קרדיטים): roof
- **חדש `cafe`** (720p, 35 קרדיטים): the library has no people and nothing about a real meeting; this is the face-to-face mentoring moment, the emotional core the screens can't show
  - פרומפט: `Warm cinematic close-up in a sunlit Tel Aviv café: an experienced mentor in her forties leans in and talks with a young man across a small wooden table, notebook and two coffee cups between them, he nods and smiles; slow push-in, shallow depth of field, soft golden afternoon light, natural documentary feel, no text, no logos, no readable screens`
- קריינות: ~1 קרדיט

### מה כל בחירה עולה (יתרה: 69.93 קרדיטים)

| אפשרות | עלות | נשאר |
|---|---|---|
| רק מהספרייה | 1 | 68.93 |
| 1 שוט חדש (720p) ← **התוכנית הזו** | 36 | 33.93 |
| 1 שוט חדש (1080p) | 61 | 8.93 |

## 4. הערות

Unused screens: q_budget, q_mode, q_goal (the four questions are shown by the first one), browse, nitzan (her profile is summarised by the team slide). The team slide shows both real mentors (with consent). The end card is generated from brief.endCard: no CTA screen needed. The scroll beat removes the sticky header captured mid-page (cut 896–1048) and the page footer (crop to 1800).

## לאישור

1. ההגייה של המילים המנוקדות נכונה?
2. התסריט והסדר מאושרים?
3. לאשר עלות של ~36 קרדיטים?

אחרי האישור: מייצרים את הקריינות ואת השוטים החדשים, ממלאים את הקישורים בקובץ ההגדרות (`voice.file` ו-`assets`), ומרנדרים עם `video/engine/render.py`.
