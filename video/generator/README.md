# Brief → script + spec generator (pipeline step 2)

Turns a client brief (business, audience, CTA, voice, budget, and the real screens) into:

- **`video/specs/<name>.json`**: a complete engine spec. `voice.file` and the URLs of any new b-roll
  stay empty, and the exact generation requests are listed under `generate`.
- **`video/briefs/<name>.review.md`**: a Hebrew sheet for the client to approve before any credit is
  spent. It shows the pointed script, the words to check by ear, a beat table with estimated times,
  reused vs. new clips, the cost, and open questions.

Claude writes the creative part: script, beats, captions and b-roll choice. It sees the screens as
images. Code does everything that has to be right:

| Deterministic step | Why it isn't left to the model |
|---|---|
| Brand pronunciation (`lexicon.json` → `brands`) applied to every alias and ו/ה/ב/ל/מ/ש/כ prefix | Confirmed TTS spellings must never drift |
| Niqqud stripped from captions | Captions use normal spelling |
| Cue check: each cue is a real script word, in order | The engine syncs cuts on cues |
| Screen kind → beat type (`screenshot`→`screen`, `slide`→`slide`, `cta`→`end`) | Wrong type = wrong layout |
| Asset keys exist; new clips ≤ budget, and every new clip is used | No surprise credits |
| Word count within ±20% of target (`targetSeconds × speed × words_per_second`) | Length control |
| Cost and length estimate from `pricing.json` | Approval before spending |

When validation fails, the errors go back to Claude for up to 2 repair rounds.

## Run

```bash
cd video/generator
python3 generate.py ../briefs/<name>.brief.json                 # automatic (needs Claude API credentials)
python3 generate.py ../briefs/<name>.brief.json --prompt-only   # no API key: writes <name>.prompt.md
python3 generate.py ../briefs/<name>.brief.json --from-response answer.json   # finish from a pasted answer
```

**Without an API key (`--prompt-only`):** open `<name>.prompt.md` in claude.ai. It contains the
system part, the screens to attach in order, and the JSON schema. Save Claude's JSON answer to a
file and run `--from-response`. It goes through exactly the same validation and outputs.

**Automatic mode** uses `anthropic` (`pip install anthropic`) and credentials from
`ANTHROPIC_API_KEY` or an `ant auth login` profile. Request settings: `claude-opus-5`, adaptive thinking,
effort `high`, JSON-schema structured output, and server-side refusal fallbacks
(`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). One plan takes about 10–20k
tokens.

## Brief format

Copy [`../briefs/_template.brief.json`](../briefs/_template.brief.json). The full example is
[`fixtures/journee-ad-2.brief.json`](fixtures/journee-ad-2.brief.json).

| Field | Required | Notes |
|---|---|---|
| `name` | ✓ | lowercase-with-dashes; becomes the spec and review file name |
| `business` | ✓ | what it does, in a few sentences: the model writes only from this and the screens |
| `cta` | ✓ | what the viewer should do |
| `voice.id` | ✓ | Higgsfield `voice_id` (Journee used Daisy `032386ec-491b-5bdc-81ac-49e9a6a2c89d`) |
| `screens[]` | ✓ | `{key, url, kind, desc?}`. `kind` is `screenshot` (raw UI), `slide` (designed 9:16) or `cta` (exactly one) |
| `audience`, `tone`, `notes` | | free text |
| `language` | | default `he` |
| `targetSeconds` | | final length after speed-up, default 20 |
| `speed` | | default 1.15 |
| `budget` | | `{credits, newBrollMax: 2, resolution: "720p"}` |
| `brand` | | passed through to the spec (colors, font, dir) |

Screens must already be uploaded (Higgsfield CDN URLs), because the model fetches them by URL.

## Shared data (single source of truth)

| File | Content |
|---|---|
| [`../library.json`](../library.json) | reusable b-roll with descriptions and tags. Add every newly generated clip |
| [`../lexicon.json`](../lexicon.json) | confirmed pronunciations: `brands` (auto-applied) and `words` (guidance) |
| [`../pricing.json`](../pricing.json) | credit prices and the measured speech rate (1.85 words/s) |
| [`system_prompt.md`](system_prompt.md) | the model's instructions (editable without code changes) |

## Tests

```bash
cd video/generator && python3 -m unittest test_generate.py
```

Covered: the plan in `fixtures/` (what a model would return for the Journee ad #2 brief) produces a
spec **identical** to the hand-built `specs/journee-ad-2.json`, the brand fix, validation of 8 kinds
of bad plans, costing, the brief checks, the prompt rendering, and both CLI modes. The API request
was also checked against the SDK (`anthropic` 1.8.0): with a placeholder key it passes client-side
checks and reaches the server (401). **A real model answer has not been tested yet**, because no API
key was available.
