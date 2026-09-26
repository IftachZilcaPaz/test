# mentor it: two promo videos (2026-09-26)

Rendered by `engine/render.py` from `specs/mentorit-ad-1.json` and `specs/mentorit-ad-2.json`.
Cost: 36.65 credits in total (one 720p café clip, now in `library.json` as `cafe`, plus two voice-overs).

| Video | Audience | Length | Link |
|---|---|---|---|
| ad-1: "ניסוי וטעייה" | people looking for a mentor | 19.7s | https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/767abc80-ef84-4d6e-ba91-da8ac511aa28.mp4 |
| ad-2: "הניסיון שלכם שווה יותר" | mentors | 21.7s | https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/f15ed506-0b29-46ad-9e75-8e5ca6747ba0.mp4 |

**Final (×1.25, 0 credits):**
- ad-1, 18.1s: https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/c0c7cd52-93a9-44d6-b2ed-5ecf4b2058ce.mp4
- ad-2, 20.0s: https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/9f9ca938-3ec3-4268-ac15-e395c7301c6a.mp4

The table above holds the first cut at ×1.15. The specs are now set to `speed: 1.25`.

QA: Whisper detected Hebrew at 0.95 / 0.92; script↔transcript match 92% / 98%; no blank checkpoints.
Voice-overs (Daisy): ad-1 `hf_20260926_073408_4b1ee307…mp3`, ad-2 `hf_20260926_073408_b228b2f7…mp3` (URLs in the specs).

First real use of the `scroll` beat (Iftach's full profile, sticky header cut out) and the
engine-drawn end card. Re-renders (order, captions, speed) are free: edit the spec and re-run.

## Male voice (Grady, `e2a2d2e6-9ed2-59cd-82af-feaa27f8a678`), ×1.25, 1.65 credits for both voice-overs

Specs: `specs/mentorit-ad-1-grady.json`, `specs/mentorit-ad-2-grady.json` (the Daisy specs are untouched).

- ad-1, 19.4s: https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/d2cad56b-811f-4e13-ae35-821291124c07.mp4
- ad-2, 22.2s: https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/ac61f21c-b92f-4ed7-85ad-d3b81de17d21.mp4

QA: Hebrew detected at 0.997 / 0.998; script↔transcript match 94.5% / 96.4%; no blank checkpoints.
Grady reads Hebrew more slowly than Daisy (~2s longer per video at the same ×1.25).

## Male voice (Alexey, `7c2133e5-68ab-511f-9aed-9a67664382b1`), ×1.25, 1.65 credits for both voice-overs

Specs: `specs/mentorit-ad-1-alexey.json`, `specs/mentorit-ad-2-alexey.json`.

- ad-1, 17.3s: https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/f7590538-eb9d-4c24-8f14-4e4992cfaf09.mp4
- ad-2, 18.5s: https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/dfba7249-6671-4aca-b39c-322ada97b802.mp4

QA: Hebrew detected at 0.988 / 0.998; script↔transcript match 93.9% / 97%; no blank checkpoints.

## Name fix: "יפתח פז זילכה" → "יפתח זילכה" (0 credits)

The middle word was cut out of the original pixels (column cut and re-align, no redraw), so the
font and layout stay identical. Edited screens: `team` (15), `match` (21), `iftach_full` (26); every
mentorit spec and brief now points to them. The originals are kept on the CDN.

Alexey versions, re-rendered:
- ad-1: https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/2dba2f2e-c032-4e9b-bfcc-b09d0acb9059.mp4
- ad-2: https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/011ef398-aef5-48d3-a97d-07e262bada59.mp4

Grady versions with the name fix (the chosen voice):
- ad-1, 19.4s: https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/56b748a6-b1f3-4184-8473-6bafd4add71a.mp4
- ad-2, 22.2s: https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/44e916d6-fbe5-41a6-ae39-69a0e8519cc2.mp4
