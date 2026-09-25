---
name: hebrew-promo-video
description: Build a vertical (9:16) promo/ad video for any app or business with Higgsfield from its screenshots or designed slides, with cinematic AI b-roll, RTL captions and a correctly pronounced Hebrew voice-over, rendered by the spec-driven engine in video/engine. Use whenever the user asks for a promo/business video, Reel, TikTok ad, app video, Hebrew voice-over / narration, a faster or re-cut version of an existing ad, or complains about Hebrew TTS pronunciation.
---

# Promo video from app screens (Hebrew-first, any app)

Pipeline: **brief → `video/generator` → review sheet + spec → approval → generate the missing
assets → `video/engine` renders**. Every video is one spec file (`video/specs/<name>.json`). The
engine does captions, edit, sync, mix, speed and QA for 0 credits. Shared data, the single source
of truth: `video/library.json` (reusable b-roll), `video/lexicon.json` (confirmed pronunciations),
`video/pricing.json` (credits and speech rate). Human guide: `video/PLAYBOOK.md`.

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

Confirmed pronunciations live in `video/lexicon.json`. `brands` are applied to scripts
automatically by the generator. `words` are context-dependent guidance (כתבו is also a valid past
tense). Every correction the user makes goes into that file in the same change.

## Pipeline

1. **Intake.** In Claude Code, chat attachments are local files, so use `media_upload` (`files[]`),
   `curl --data-binary` PUT, then `media_confirm`. Skip duplicate files (compare md5). Classify each
   image: **raw screenshot → `screenshot`**, **designed 9:16 slide → `slide`**, **end card → `cta`**.
2. **Brief.** Write `video/briefs/<name>.brief.json` from `_template.brief.json` and what the user
   told you. Ask only for what's missing: CTA, voice, budget.
3. **Plan.** Run `video/generator/generate.py` on the brief. With Claude API credentials it runs
   on its own. Without them, you are the model: run `--prompt-only`, write the plan JSON yourself
   following `<name>.prompt.md` exactly (same system rules, same schema, looking at the screens you
   uploaded), save it, and run `--from-response`. Either way the deterministic checks run. Show
   the user `video/briefs/<name>.review.md`: pointed words, beats, cost. Wait for approval.
4. **Generate only what the spec's `generate` section lists, in parallel:** the VO via
   `generate_audio_batch` with those exact params, and new b-roll via `generate_video_batch`. Put
   the URLs into `voice.file` and `assets`. Add each new clip to `video/library.json`.
5. **Render in the sandbox.** Zip `video/engine` and `video/specs`, upload with `media_upload`
   (type `file`), then `curl` + `unzip` in `sandbox_exec`. Run `render.py spec --plan`, check the cut
   table, then run the full render with `background: true`. Reserve the output upload first and put
   the `curl -f -X PUT` in the same command. Poll with `sleep ≤ 50`. `media_confirm` the result.
6. **Deliver** the CDN link, the engine report (voice language/confidence, match ratio, blank
   frames, duration) and the actual credit spend. Commit the brief, the spec and the review.

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
