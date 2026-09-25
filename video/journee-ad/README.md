# Journee — Hebrew promo video (9:16)

A 22.5s vertical ad (1080×1920, 30fps, H.264 + AAC) for Reels/TikTok/Shorts.

**Renders** (identical picture; only the voice-over differs, video stream MD5 `876a356c5a51223626703eb7c5b1518a`):

| Version | VO fix                                          | Link |
| ------- | ----------------------------------------------- | ---- |
| v2      | "כיתבו" / "ג'רני" (full spelling)               | https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/7f43897e-f49f-47ad-bc1b-baa83ddf9a32.mp4 |
| v2b     | "כִּתְבוּ" / "ג'רְנִי" (with niqqud)            | https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/d0582f7a-bc79-42d5-a4de-a2959af567e1.mp4 |
| v1      | original ("כתבו" read as "katvu", "ג'ורני")     | https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/1d9ddeef-706b-40ee-b536-38434a2fc97e.mp4 |

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

> מתכננים טיול? כיתבו משפט אחד: לאן, ומתי. ג'רני בונה לכם מסלול מלא, יום אחרי יום, עם טיסות
> ומלונות אמיתיים, ומחירים מהשוק. שומרים, עורכים, ומשתפים. הכול בעברית, באתר ובוואטסאפ.
> בואו נתכנן את הטיול הבא, בחינם.

"Journee" is written phonetically as ג'רני, and "כיתבו" in full spelling (or with niqqud in v2b), so
the TTS reads them correctly. The v2 takes stay within ~0.4s of the v1 word timings, so the audio
was swapped in without re-rendering (`-c:v copy`), and the cuts stay in sync.

## Generated assets (Higgsfield)

| Asset      | Model                       | Job ID                                 |
| ---------- | --------------------------- | -------------------------------------- |
| roof.mp4   | seedance_2_5, 1080p, 5s     | `5770920e-d796-469b-b517-f9ad9ffa733f` |
| rome.mp4   | seedance_2_5, 1080p, 5s     | `5c0c2d56-f3e7-4916-bb21-ca297dc660ef` |
| plane.mp4  | seedance_2_5, 1080p, 5s     | `cd30ab2c-fed2-489e-96b3-27fd9c31fb04` |
| vo.mp3 (v2)  | text2speech_v2 / elevenlabs | `36d027a0-65ea-460a-bb9b-8a0227782d24` |
| vo.mp3 (v2b) | text2speech_v2 / elevenlabs | `a1de3df5-8451-4efe-b9dd-af74ed9aa63b` |
| vo.mp3 (v1)  | text2speech_v2 / elevenlabs | `b3c74d55-3652-4389-acbd-61021803da79` |

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

## Reuse

The full recipe, including the Hebrew pronunciation (niqqud) rules and lexicon, is the project
skill [`.claude/skills/hebrew-promo-video`](../../.claude/skills/hebrew-promo-video/SKILL.md).
