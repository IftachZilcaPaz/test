# Promo video engine: `spec.json` → MP4

A generic, app-agnostic renderer for 9:16 promo videos: real app screens, cinematic b-roll, RTL
captions and a voice-over, with cuts synced to the spoken words. Everything specific to one app
(brand colors, screens, script, captions, clips) lives in a **spec file**. The code never changes
between apps.

The engine only **assembles**. It never generates, so a render costs **0 Higgsfield credits** and
can be repeated freely. Generation (voice-over, new b-roll) happens before the render, through the
Higgsfield tools, and the resulting URLs go into the spec.

| File | Role |
|---|---|
| `render.py` | Orchestrator: validate spec → fetch assets → Whisper → align cues → captions → higgsedit → mux/speed → QA report |
| `align.py` | Script↔transcript character alignment, robust to Whisper misspellings, word splits and niqqud |
| `captions.cjs` | Caption PNGs in headless Chromium (correct RTL/bidi, any Google Font, text inserted as text, never HTML) |
| `test_align.py` | Regression test: reproduces the hand-tuned cuts of `journee-ad-2` exactly |

Verified on 2026-09-25: rendering `specs/journee-ad-2.json` reproduces the hand-made ad with
SSIM 0.9999. `specs/journee-ad-1.json` (template A, ×1.15) renders in 42s.

## Run (inside the Higgsfield sandbox)

```bash
python3 render.py ../specs/<name>.json --plan                 # ~20s: align only, print the cut table
python3 render.py ../specs/<name>.json --out out.mp4          # full render (~40–60s)
python3 render.py ../specs/<name>.json --out out.mp4 --speed 1.0   # override the spec speed
```

The sandbox provides ffmpeg, higgsedit, faster-whisper, Pillow, node and Playwright. To get the
engine there: zip `engine/` + `specs/`, upload it with `media_upload` (type `file`), then
`curl` + `unzip` it in the sandbox. Run renders with `background: true` and poll with `sleep ≤ 50`,
because a tool call times out after 60s. Reserve the output's `media_upload` URL *before* the render,
and PUT the file in the same sandbox command.

Exit codes: `0` OK · `1` rendered, but a checkpoint frame is blank · `2` spec, alignment or tool error.
`work-<name>/report.json` holds the timeline, voice checks and QA results.

## Spec format

```jsonc
{
  "name": "acme-ad-1",                 // used for the work dir and the report
  "speed": 1.15,                       // whole-video tempo (0.5–2.0); 1.15 = "a bit faster", free
  "brand": {                           // all optional; defaults shown
    "background": "#0d0f14",           // behind everything
    "gradient": ["#10204a", "#14171f", "#3d2166"],  // backdrop of `screen` beats (2+ colors)
    "font": "Heebo",                   // any Google Font that covers the script
    "captionColor": "#ffffff", "subColor": "#e6e0ff",
    "dir": "rtl"                       // "ltr" for English and other LTR languages
  },
  "voice": {
    "file": "https://…/vo.mp3",        // generated voice-over (ElevenLabs for Hebrew)
    "script": "…",                     // EXACT text sent to TTS, niqqud included
    "lang": "he",                      // Whisper must detect this language at ≥ 0.8
    "leadIn": 0.3,                     // silence before the voice; cuts land at word + leadIn
    "voiceId": "…"                     // for the record only
  },
  "assets": {                          // key → URL (or local path). png/jpg/webp/mp4/mov/webm
    "hook": "https://…mp4", "chat": "https://…png", "cta": "https://…png"
  },
  "beats": [                           // in order; each beat runs until the next one starts
    { "type": "broll",  "asset": "hook", "caption": "Question?" },           // first beat starts at 0
    { "type": "screen", "asset": "chat", "cue": "word", "caption": "Line 1\nLine 2", "sub": "smaller line" },
    { "type": "slide",  "asset": "…",    "cue": "another" },
    { "type": "end",    "asset": "cta",  "hold": 3.4 }                        // must be last
  ]
}
```

`generate` (optional) is written by [`video/generator`](../generator/README.md). It lists the exact
Higgsfield requests for the voice-over and any new b-roll. The renderer ignores it, and refuses to
run while `voice.file` or a used asset is still empty.

### Beat types: pick one per screen, by what the image is

| Type | Use for | Looks like | Caption |
|---|---|---|---|
| `broll` | Cinematic clip (video) or photo | Full-bleed, slow 1.00→1.05 push-in | Optional, lower third over a scrim |
| `screen` | **Raw** app screenshot (status bar, real UI) | Rounded "device" card on the brand gradient | **Required**, top |
| `slide` | **Designed** 9:16 marketing slide with its own headline | Full-bleed, RTL carousel entry | Usually none (the slide has one) |
| `end` | CTA / end card | Full-bleed, fade in + push-in, held `hold` s | None |

### Timing

- **`cue`** is a word (or phrase) from `voice.script`. It is written **exactly as in the script**:
  a prefixed "וג'רני" is a different word from "ג'רני". Niqqud and punctuation are ignored when
  matching. Cues must follow script order; a repeated word resolves to its next occurrence.
- **`at`** (seconds) overrides the cue for full manual control.
- **`end`** without a cue starts right after the voice ends. `hold` sets its length (default 3.4).
- A beat shorter than 0.5s is an error. It almost always means a wrong cue.
- Run `--plan` first. It prints the cut table in about 20s, before the full render.

## Rules that keep it generic

1. **Nothing app-specific in code.** Colors, fonts, screens, text and clips go in the spec.
   If a new app needs a new look, add a brand field or a beat type. Never add an `if app == …`.
2. **One spec per video, committed** under `video/specs/`. The spec is the source of truth.
   Generated files (`edit.jsx`, captions, work dirs) are disposable.
3. **The engine never generates.** Voice-over and b-roll are produced first, and only their URLs enter
   the spec. Re-rendering is therefore always free.
4. **Real UI only.** Screens are the client's screenshots. AI is for text-free b-roll.
5. **Every render is checked:** the language and confidence of the voice-over, the
   script↔transcript match ratio, a blank-frame check at every beat's midpoint, and audio and video
   lengths that agree.

## Internals and pitfalls (already handled)

- `p.add()` needs absolute paths. Audio can't share a track with visuals, so the voice-over is
  muxed after the render by ffmpeg.
- The audio is padded and trimmed to the exact picture length. An open-ended `apad` with
  `-shortest` never terminates on the speed-up path (found and fixed while building this).
- Web fonts load per script subset. Captions are loaded with their real text before capture,
  and the render fails loudly if the font is missing.
- WebP screens are converted to PNG. Video assets start 0.3s in (`trim`) to skip model warm-up
  frames.
- Layout constants assume 1080×1920.

## Tests

```bash
cd video/engine && python3 -m unittest test_align.py
```
