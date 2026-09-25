---
name: hebrew-promo-video
description: Build a vertical (9:16) Hebrew promo/ad video for a business or app with Higgsfield from app screenshots: cinematic AI b-roll, the real UI screens, Hebrew captions, and a correctly pronounced Hebrew ElevenLabs voice-over. Use whenever the user asks for a Hebrew business video, promo, Reel, TikTok ad, or Hebrew voice-over / narration, or complains about Hebrew TTS pronunciation. Reference implementation lives in video/journee-ad/.
---

# Hebrew promo video with Higgsfield

This skill reproduces `video/journee-ad/`: a ~22s 1080×1920 ad in which cinematic b-roll
alternates with the product's real screens, over Hebrew captions and a Hebrew voice-over, and
ends on the product's own CTA screen. Follow the steps in order. Every rule here comes from a
failure hit on that project.

## Hard rules

1. **Never AI-generate the UI.** App screens are the user's real screenshots. Video models garble
   Hebrew UI text. AI video is only for b-roll with **no text in frame**.
2. **Hebrew voice-over = ElevenLabs only:** `generate_audio` with `model: "text2speech_v2"`,
   `variant: "elevenlabs"`. `seed_audio` produced gibberish for Hebrew. Do not use it. The
   `inworld_text_to_speech` Hebrew voices are game-pipeline-only. Do not use them either.
3. **Every Hebrew VO script passes the pronunciation pass (below) before generation.**
4. **Hebrew on-screen text is rendered in Chromium, not in higgsedit's text engine**, so RTL
   shaping/bidi is guaranteed.
5. **Fixing audio never touches the picture.** Swap the audio with `-c:v copy` and prove that the
   video stream MD5 is unchanged (see "Revisions").
6. Run `get_cost: true` before paid generations. Tell the user the credit spend. Stop and ask
   before any step that would take the balance near zero.

## Pronunciation pass (ניקוד)

ElevenLabs guesses vowels from unpointed Hebrew and gets ambiguous words wrong
(e.g. read "כתבו" as *katvu* instead of *kitvu*). Before any VO generation:

1. **Go through the script word by word.** Flag every word with more than one plausible reading.
   Typical cases: imperatives vs. past tense (כתבו/כִּתְבוּ, שלחו/שִׁלְחוּ), and nouns vs. verbs
   (ספר, דבר). Also flag construct forms, and every foreign/brand name.
2. **Add niqqud only to the flagged words.** Leave the rest of the script unpointed. Pointing
   every word adds nothing and gives more room for mistakes.
3. **Write brand and foreign names phonetically, with niqqud on the vowel that matters.**
   Use the lexicon spelling when the name is already in it.
4. **Show the user the pointed script. Ask them to confirm the readings before spending credits.**
   Note: the user is the authority on pronunciation. Whisper transcripts cannot verify vowels,
   because they print the unpointed spelling either way.
5. **Keep the brand name out of the caption PNGs.** Captions use normal unpointed Hebrew (and
   the brand's own spelling). Niqqud is for the TTS input only.

### Lexicon (from real user corrections; extend it with every new fix)

| Intended | Write for TTS | Wrong reading seen | Notes |
|---|---|---|---|
| kitvu (imperative "write") | `כִּתְבוּ` | כתבו → *katvu* | Full spelling כיתבו also used (Journee v2) |
| Journee (brand) | `ג'רְנִי` | ג'ורני → *jorni* | The user asked for pointed forms going forward |

When the user corrects a pronunciation, add a row here in the same change.

## Pipeline

### 1. Intake: screenshots → Higgsfield media

In Claude Code the chat attachments are local files, and `media_upload_widget` can't reach them.
Use `media_upload` with a `files[]` batch. PUT each file with `curl --data-binary @file` from the
local shell, then `media_confirm` (type `image`). Pick the screens that tell the story: the
input (chat), the result (trip or product card), the depth (itinerary), the reach (home), and
the CTA/end card.

### 2. Script (~19s spoken, 6–8 beats)

Structure: hook question → how it works (one sentence) → what you get → proof points →
where it's available → CTA. About 50 words for ~19s at ElevenLabs' default pace. Then run the
pronunciation pass.

### 3. Voice-over

```
generate_audio_batch  model: text2speech_v2  variant: elevenlabs
                      voice_type: preset  voice_id: <user's pick; Journee used Daisy 032386ec-491b-5bdc-81ac-49e9a6a2c89d>
```

The user may name a voice. If not, ask, or use `list_voices` and suggest two. Verify in
`sandbox_exec` with faster-whisper:

```python
from faster_whisper import WhisperModel
m = WhisperModel("small", device="cpu", compute_type="int8")
segs, info = m.transcribe("vo.mp3", word_timestamps=True)   # 1st pass: language=None
# pass: info.language == "he" and probability >= 0.9; words roughly match the script
# 2nd pass with language="he": print word@start times — these drive the cut points
```

When a word is still doubtful, generate an A/B pair in one batch (full spelling vs. niqqud)
and let the user choose by ear.

### 4. B-roll (Seedance)

```
generate_video_batch  model: seedance_2_5  aspect_ratio: 9:16  resolution: 1080p
                      duration: 5  generate_audio: false        # ~60 credits each; 720p ~35
```

Three shots: (a) hook: a person's hands with a phone in an aspirational setting, screen
**out of focus / no readable text**; (b) the hero destination or product-in-use moment;
(c) the payoff mood shot. Prompt style: "cinematic, premium travel-tech commercial, golden
hour, shallow depth of field, slow push-in, no text". Match the palette to the app's (Journee:
deep blue, violet, gold).

### 5. Captions (Chromium)

Render one transparent 1000×300 PNG per beat with Playwright in the sandbox. Use
`require(\`${npm root -g}/playwright\`)`: there is no Python playwright. Use
`<html dir=rtl>` and Google Font **Heebo** 800 (secondary line 500), 84px white with a soft
text-shadow. Heebo's Hebrew glyphs are a separate unicode-range subset. Load it explicitly with
`document.fonts.load("800 84px Heebo", "<Hebrew sample>")`, then assert `document.fonts.check(...)` with the
same Hebrew sample before capturing. Without the sample the check can pass or fail at random (this happened on ad #2). The template is
`video/journee-ad/captions.cjs`. Captions are short (≤ 5 words per line, ≤ 2 lines) and mirror
the VO beat. They don't need to be verbatim.

### 6. Edit (higgsedit, native)

Start from `video/journee-ad/edit.jsx`:

- 1080×1920 @30fps, background `#0d0f14`.
- **B-roll beat:** full-bleed `<media>` (muted, `trimStart` 0.3, scale 1.00→1.05), a bottom black
  scrim, and the caption at y=1400.
- **Screen beat (raw app screenshot):** a brand gradient backdrop, and the screenshot in a rounded "device" card
  (x150 y450 780×1387, radius 54, deep shadow, scale 0.92→1.0). The caption sits at y=120.
- **Screen beat (designed 9:16 marketing slide):** full-bleed, no extra caption (the slide carries its
  own headline). Carousel entry: offsetX −160→0 in 0.35s ("house") + fade 0.2s, scale 1.04→1.0 over the beat.
  Short beats (0.8s) are fine for a rhythmic list ("WhatsApp, Instagram, or the website"). See `video/journee-ad-2/`.
- **End card:** the real CTA screenshot full-bleed with a slow push-in, held ~3.5s.
- **Cut points:** each beat starts at its first word's Whisper timestamp + 0.3s (the VO
  lead-in).

Gotchas:
- `p.add()` needs **absolute** paths. Relative paths resolve inside the project dir.
- Convert WebP screenshots to PNG with ImageMagick first.
- Audio and visual clips can't share a track, and `p.cut` has no track option. Put b-roll in
  `p.compose` as `<media>` and mux the VO afterwards with ffmpeg.
- The sandbox is ephemeral. Chain the whole build into consecutive calls, or one call.

### 7. Mix, upload, deliver

```bash
ffmpeg -i silent.mp4 -i vo.mp3 \
  -filter_complex "[1:a]adelay=300|300,loudnorm=I=-14:TP=-1.5:LRA=9,apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart out.mp4
```

Reserve the output with `media_upload` **before** the producing sandbox call. Put the
`curl -f -X PUT --upload-file` in that same call, then `media_confirm` (type `video`). The local
Claude Code container can't reach Higgsfield's CDN (proxy 403), so all media work, inspection
included, happens in `sandbox_exec`. Deliver the CDN link. Say plainly which checks you ran:
automated checks (ffprobe, frame luminance, Whisper). Say too that you did not watch or listen
to the video yourself.

## Revisions (e.g. a mispronounced word)

1. Fix the word per the pronunciation pass. Regenerate only the VO, as an A/B pair if unsure.
2. Compare the new takes' Whisper word timings with the old ones. Drift of ≤ 0.5s per cut is
   fine. If a take drifts more, re-time `edit.jsx` instead.
3. Download the current delivered MP4 and swap the audio only: the mux command above with the
   delivered MP4 as input 0.
4. Prove the picture is untouched. The MD5 values must match:
   `ffmpeg -i old.mp4 -map 0:v -c copy -f md5 -` vs. the same command on the new file.
5. Add the new pronunciation to the lexicon. Record the new version in the project README.

## Budget reference (Plus plan, Sept 2026)

3 b-roll clips at 1080p ≈ 180 credits. Each VO take costs a few credits. Lip-synced presenter
(Seedance `omni_reference` with image + audio reference) ≈ 35 credits per 5s at 720p. It needs
a presenter photo, and it's optional: a VO over b-roll and screens needs no lip-sync.

## Kick-off prompt (paste with the screenshots)

> תבנה לי סרטון עסקי ב-Higgsfield לפי הסקיל hebrew-promo-video.
> עסק: <שם + משפט אחד על מה הוא עושה>. קהל: <למי>. CTA: <אתר / וואטסאפ>.
> קול: <voice_id או "תציע">. אורך: ~20 שניות, 9:16.
> לפני יצירת הקריינות תראה לי את התסריט המנוקד לאישור.
