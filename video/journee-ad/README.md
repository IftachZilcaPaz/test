# Journee — Hebrew promo video (9:16)

A 22.5s vertical ad (1080×1920, 30fps, H.264 + AAC) for Reels/TikTok/Shorts.

**Final render:** https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/1d9ddeef-706b-40ee-b536-38434a2fc97e.mp4
(Higgsfield media `1d9ddeef-706b-40ee-b536-38434a2fc97e`)

## Structure

| Time (s)   | Visual                                   | Caption                                 |
| ---------- | ---------------------------------------- | --------------------------------------- |
| 0.0–1.7    | B-roll: rooftop at sunset, phone in hand | מתכננים טיול?                           |
| 1.7–4.6    | App: AI chat screen                      | כותבים משפט אחד: לאן ומתי               |
| 4.6–7.3    | B-roll: aerial shot of the Colosseum     | מסלול מלא, יום אחרי יום                  |
| 7.3–10.9   | App: Rome trip card (hotel, booking)     | טיסות ומלונות אמיתיים / במחירים מהשוק    |
| 10.9–13.3  | App: day-by-day itinerary                | שומרים · עורכים · משתפים                 |
| 13.3–16.5  | App: home screen                         | הכול בעברית / באתר ובוואטסאפ             |
| 16.5–19.0  | B-roll: plane window at sunrise          | בואו נתכנן את הטיול הבא                  |
| 19.0–22.5  | End card: fly-ai.space CTA screen        | (in the screen itself)                  |

## Voice-over

ElevenLabs via Higgsfield `text2speech_v2` (variant `elevenlabs`), preset voice **Daisy**
(`032386ec-491b-5bdc-81ac-49e9a6a2c89d`). Checked with faster-whisper: detected as Hebrew with
0.98 probability, and the transcript matches the script. Seed Audio was also tested and came out
as gibberish in Hebrew, so it is not used.

> מתכננים טיול? כתבו משפט אחד: לאן, ומתי. ג'ורני בונה לכם מסלול מלא, יום אחרי יום, עם טיסות
> ומלונות אמיתיים, ומחירים מהשוק. שומרים, עורכים, ומשתפים. הכול בעברית, באתר ובוואטסאפ.
> בואו נתכנן את הטיול הבא, בחינם.

"Journee" is written phonetically (ג'ורני) so the TTS pronounces it correctly.

## Generated assets (Higgsfield)

| Asset      | Model                       | Job ID                                 |
| ---------- | --------------------------- | -------------------------------------- |
| roof.mp4   | seedance_2_5, 1080p, 5s     | `5770920e-d796-469b-b517-f9ad9ffa733f` |
| rome.mp4   | seedance_2_5, 1080p, 5s     | `5c0c2d56-f3e7-4916-bb21-ca297dc660ef` |
| plane.mp4  | seedance_2_5, 1080p, 5s     | `cd30ab2c-fed2-489e-96b3-27fd9c31fb04` |
| vo.mp3     | text2speech_v2 / elevenlabs | `b3c74d55-3652-4389-acbd-61021803da79` |

Screens `s1..s5` are the original app screenshots (the UI is never AI-generated, so the Hebrew
UI text stays exact).

## Rebuild

Hebrew captions are rendered as PNGs in Chromium (`captions.cjs`) instead of the editor's
text engine, so RTL shaping is correct. Then (in the Higgsfield sandbox):

```bash
G=$(npm root -g) node captions.cjs
higgsedit build edit.jsx
higgsedit render proj --out renders/silent.mp4
ffmpeg -i proj/renders/silent.mp4 -i assets/vo.mp3 \
  -filter_complex "[1:a]adelay=300|300,loudnorm=I=-14:TP=-1.5:LRA=9,apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest \
  -movflags +faststart journee_ad_he_v1.mp4
```
