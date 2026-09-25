---
name: hebrew-promo-video
description: Build a vertical (9:16) promo/ad video for any app or business with Higgsfield from its screenshots or designed slides, with cinematic AI b-roll, RTL captions and a correctly pronounced Hebrew voice-over, rendered by the spec-driven engine in video/engine. Use whenever the user asks for a promo/business video, Reel, TikTok ad, app video, Hebrew voice-over / narration, a faster or re-cut version of an existing ad, or complains about Hebrew TTS pronunciation.
---

# Promo video from app screens (Hebrew-first, any app)

Every video is one **spec file** (`video/specs/<name>.json`) rendered by the generic engine
(`video/engine/`, spec format in its README). You write the spec and generate only the missing
assets. The engine does captions, edit, sync, mix, speed and QA for 0 credits. Human-facing
guide, cost tables and the asset library: `video/PLAYBOOK.md`. Examples: `video/specs/journee-ad-*.json`.

## Rules

1. **Nothing app-specific in code.** Brand, screens, script, captions and clips live in the spec.
   If a new app needs a new look, extend the engine generically (a brand field or a beat type),
   never with a special case for that app.
2. **Never AI-generate UI.** Screens are the client's real screenshots or slides. AI video is only
   for b-roll with **no text in frame**. Video models garble Hebrew text.
3. **Hebrew voice-over = ElevenLabs only** (`text2speech_v2`, `variant: "elevenlabs"`).
   `seed_audio` produces gibberish in Hebrew. `inworld_text_to_speech` is game-pipeline-only.
4. **Approve before spending.** Show the user the pointed script and the credit estimate. Generate
   only after they confirm. Run `get_cost: true` on paid calls you're unsure of.
5. **Cheapest path first:** reuse library clips (0) → 720p (35) → 1080p (60) only on request. At most 2
   new clips per ad, 5s each, `count: 1`.
6. **Fixes are free:** re-cut, re-caption and speed (`"speed"` in the spec) mean a re-render. A
   mispronounced word means one VO take plus an audio-only swap.
7. **Report honestly.** List the automated checks you ran (engine report, Whisper, ffprobe), and state
   that nobody has watched or listened to the video yet.

## Pronunciation pass (ניקוד)

ElevenLabs guesses vowels from unpointed Hebrew and gets ambiguous words wrong (כתבו → *katvu*).
Before any VO generation:

1. Flag every word with more than one plausible reading: imperative vs. past (כתבו, שלחו, קבלו),
   noun vs. verb (ספר, דבר), construct forms, and **every brand or foreign name**.
2. Add niqqud **only** to the flagged words. Write brand names phonetically, with niqqud where the
   vowel matters.
3. The user confirms the readings. Whisper can't check vowels.
4. Captions use normal unpointed spelling and the brand's own spelling. Niqqud goes only into
   `voice.script`.

### Lexicon (confirmed by the user; add a row with every correction)

| Intended | Write for TTS | Wrong reading seen |
|---|---|---|
| kitvu (imperative "write") | `כִּתְבוּ` | כתבו → *katvu* |
| shilchu (imperative "send") | `שִׁלְחוּ` | (pre-emptive) |
| takhnen (imperative "plan") | `תַּכְנֵן` | (pre-emptive) |

Brand names (per client):

| Brand | Write for TTS | Wrong reading seen |
|---|---|---|
| Journee | `ג'רְנִי` | ג'ורני → *jorni* |

## Pipeline

1. **Intake.** In Claude Code, chat attachments are local files, so use `media_upload` (`files[]`),
   `curl --data-binary` PUT, then `media_confirm`. Skip duplicate files (compare md5). Classify each
   image: **raw screenshot → `screen`**, **designed 9:16 slide → `slide`**, **CTA → `end`**.
2. **Script.** 45–55 words for about 20s before speed-up. Use 6–10 beats: hook question → how it works →
   what you get → proof points → where it's available → brand line. Run the pronunciation pass,
   show the script with a credit estimate, and wait for approval.
3. **Generate only what's missing, in parallel.** VO: `generate_audio_batch` with ElevenLabs and the
   user's voice (ask, or suggest two from `list_voices`). B-roll: check the library in
   `video/PLAYBOOK.md` §7 first. For new clips, use `generate_video_batch` with `seedance_2_5`,
   `9:16`, `720p`, `duration: 5`, `generate_audio: false`. Prompt: the app's domain moment +
   "cinematic, premium commercial, shallow depth of field, slow camera move, no text, no readable
   screens", with the palette matched to the brand.
4. **Write the spec** (`video/specs/<name>.json`). The script goes in exactly as sent to TTS. Every
   beat after the first gets a `cue`: the first word of the line it illustrates, written exactly
   as in the script.
5. **Render in the sandbox.** Zip `video/engine` and `video/specs`, upload with `media_upload`
   (type `file`), then `curl` + `unzip` in `sandbox_exec`. Run `render.py spec --plan`, check the cut
   table, then run the full render with `background: true`. Reserve the output upload first and put
   the `curl -f -X PUT` in the same command. Poll with `sleep ≤ 50`. `media_confirm` the result.
6. **Deliver** the CDN link, the engine report (voice language/confidence, match ratio, blank
   frames, duration) and the credit spend. Commit the spec and a README entry under
   `video/<name>/` or the spec file itself.

The local container can't reach Higgsfield's CDN, so all media work happens in `sandbox_exec`.

## Revisions

- **Cuts, captions, order, speed or brand:** edit the spec and re-render (0 credits).
- **A mispronounced word:** fix it per the pronunciation pass and generate one new VO take (A/B only
  if unsure). If Whisper word timings drift ≤ 0.5s from the old take, swap the audio only
  (mux with `-c:v copy`) and prove the picture is unchanged: `ffmpeg -i X -map 0:v -c copy -f md5 -`
  must match on the old and new files. Otherwise put the new file in `voice.file` and re-render.
  Add the word to the lexicon.

## Kick-off prompt (paste with the screenshots)

> תבנה סרטון לפי הסקיל hebrew-promo-video.
> עסק: <שם + משפט אחד>. קהל: <למי>. CTA: <אתר / וואטסאפ>. מותג: <צבעים / "לפי המסכים">.
> קול: <voice_id / "תציע">. אורך: ~20 שנ'. קצב: ×1.15. שוטים: <מהספרייה / חדשים, עד 2, 720p>.
> תקציב: <קרדיטים>. לפני הקריינות: תסריט מנוקד + הערכת עלות לאישור.
