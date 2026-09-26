#!/usr/bin/env python3
"""Client brief → pointed voice-over script, full render spec, cost estimate and a review sheet.

Step 2 of the video pipeline (step 1 is the engine in video/engine). Claude writes the creative
plan: script, beats, captions and b-roll choices, from the brief and the real screens. Everything
around it is deterministic: brand pronunciations, cue and asset validation, costing and the spec.

    python3 generate.py brief.json                      # calls the Claude API (needs credentials)
    python3 generate.py brief.json --prompt-only        # writes a prompt to paste into Claude yourself
    python3 generate.py brief.json --from-response r.json   # finish from a pasted JSON answer

Outputs: video/specs/<name>.json (the engine spec; voice.file and new b-roll URLs stay empty
until they are generated) and video/briefs/<name>.review.md (for the client to approve).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

VIDEO_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(VIDEO_DIR / "engine"))
from align import CueCursor, normalize, tokenize  # noqa: E402

MODEL = "claude-opus-5"
SCREEN_KINDS = {"screenshot": "screen", "tall": "scroll", "slide": "slide", "cta": "end"}
END_CARD_KEY = "endcard"   # asset key of the engine-generated end card (brief.endCard)
SCROLL_FIELDS = ("crop", "cut")  # passed from a tall screen to its scroll beat
HEBREW_PREFIXES = "והבלמשכ"
NIQQUD = re.compile(r"[֑-ׇ]")
MAX_REPAIRS = 2

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "script": {"type": "string"},
        "flagged_words": {"type": "array", "items": {
            "type": "object",
            "properties": {"word": {"type": "string"}, "reading": {"type": "string"},
                           "reason": {"type": "string"}},
            "required": ["word", "reading", "reason"], "additionalProperties": False}},
        "beats": {"type": "array", "items": {
            "type": "object",
            "properties": {"type": {"type": "string", "enum": ["broll", "screen", "scroll", "slide", "end"]},
                           "asset": {"type": "string"}, "cue": {"type": "string"},
                           "caption": {"type": "string"}, "sub": {"type": "string"}},
            "required": ["type", "asset", "cue", "caption", "sub"], "additionalProperties": False}},
        "new_broll": {"type": "array", "items": {
            "type": "object",
            "properties": {"key": {"type": "string"}, "prompt": {"type": "string"},
                           "why": {"type": "string"}},
            "required": ["key", "prompt", "why"], "additionalProperties": False}},
        "notes": {"type": "string"},
    },
    "required": ["script", "flagged_words", "beats", "new_broll", "notes"],
    "additionalProperties": False,
}


class BriefError(ValueError):
    pass


class GenerationError(RuntimeError):
    pass


# ---------------------------------------------------------------- inputs


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_brief(path: Path) -> dict:
    b = load_json(path)
    errors = [f"missing '{k}'" for k in ("name", "business", "cta", "screens", "voice") if not b.get(k)]
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", b.get("name", "")):
        errors.append("name must be lowercase letters, digits and dashes (it becomes a file name)")
    keys = set()
    for i, s in enumerate(b.get("screens", [])):
        if not s.get("key") or not s.get("url"):
            errors.append(f"screen #{i}: 'key' and 'url' are required")
        if s.get("kind") not in SCREEN_KINDS:
            errors.append(f"screen #{i}: kind must be one of {sorted(SCREEN_KINDS)}")
        if s.get("key") in keys:
            errors.append(f"screen #{i}: duplicate key '{s.get('key')}'")
        keys.add(s.get("key"))
    ctas = sum(s.get("kind") == "cta" for s in b.get("screens", []))
    if b.get("endCard"):
        if ctas:
            errors.append("give either a 'cta' screen or 'endCard', not both")
        if missing := [k for k in ("title", "url") if not b["endCard"].get(k)]:
            errors.append(f"endCard needs {missing}")
    elif ctas != 1:
        errors.append("exactly one screen must have kind 'cta', or add 'endCard' to generate one")
    if END_CARD_KEY in keys:
        errors.append(f"screen key '{END_CARD_KEY}' is reserved for the generated end card")
    if not (b.get("voice") or {}).get("id"):
        errors.append("voice.id is required (a Higgsfield voice_id)")
    if errors:
        raise BriefError("invalid brief:\n  - " + "\n  - ".join(errors))
    b.setdefault("language", "he")
    b.setdefault("targetSeconds", 20)
    b.setdefault("speed", 1.15)
    budget = b.setdefault("budget", {})
    budget.setdefault("newBrollMax", 2)
    budget.setdefault("resolution", "720p")
    budget.setdefault("credits", None)
    return b


def word_target(brief: dict, pricing: dict) -> int:
    """Spoken words for the target length: rendered length × speed-up × measured speech rate."""
    return round(brief["targetSeconds"] * brief["speed"] * pricing["words_per_second"])


# ---------------------------------------------------------------- prompt


def language_rules(brief: dict, lexicon: dict) -> tuple[str, str]:
    if brief["language"] != "he":
        return (brief["language"], "Write `script` in this language. Spell brand names the way they "
                "should be pronounced if the TTS might misread them, and flag those spellings.")
    words = "\n".join(f"- {w['plain']} → `{w['tts']}` when it means {w['when']}" for w in lexicon["words"])
    brands = "\n".join(f"- {x['brand']} → always `{x['tts']}` in the script" for x in lexicon["brands"])
    rules = (
        "The script is read by ElevenLabs TTS, which guesses Hebrew vowels. Add niqqud **only** to "
        "words with more than one plausible reading (imperative vs. past tense, noun vs. verb, construct "
        "forms) and to brand/foreign names, which you spell phonetically. Leave every other word unpointed: "
        "full niqqud adds nothing and invites mistakes. Use the client's register (usually plural "
        "second person: אתם).\n\nConfirmed fixes. Use them whenever the meaning matches:\n"
        f"{words}\n{brands}")
    return "Hebrew (he)", rules


def build_system_prompt(brief: dict, library: dict, lexicon: dict, pricing: dict) -> str:
    lang, rules = language_rules(brief, lexicon)
    lib = "\n".join(f"- {k}: {v['desc']} [{', '.join(v['tags'])}]" for k, v in library["broll"].items())
    template = (Path(__file__).parent / "system_prompt.md").read_text(encoding="utf-8")
    return (template.replace("{{WORD_TARGET}}", str(word_target(brief, pricing)))
            .replace("{{MAX_NEW_BROLL}}", str(brief["budget"]["newBrollMax"]))
            .replace("{{LIBRARY}}", lib).replace("{{LANGUAGE}}", lang).replace("{{LANGUAGE_RULES}}", rules))


def brief_text(brief: dict) -> str:
    public = {k: brief[k] for k in ("business", "audience", "cta", "tone", "notes") if brief.get(k)}
    public["target_seconds"] = brief["targetSeconds"]
    return "Client brief:\n" + json.dumps(public, ensure_ascii=False, indent=2)


def screen_label(s: dict) -> str:
    return f"Screen key={s['key']} kind={s['kind']}" + (f": {s['desc']}" if s.get("desc") else "")


def end_card_label(brief: dict) -> str:
    return (f"No CTA screen: the engine generates the end card (asset key '{END_CARD_KEY}') from: "
            + json.dumps(brief["endCard"], ensure_ascii=False))


def build_user_content(brief: dict, images: bool) -> list[dict]:
    content: list[dict] = [{"type": "text", "text": brief_text(brief)}]
    for s in brief["screens"]:
        content.append({"type": "text", "text": screen_label(s)})
        if images:
            content.append({"type": "image", "source": {"type": "url", "url": s["url"]}})
    if brief.get("endCard"):
        content.append({"type": "text", "text": end_card_label(brief)})
    content.append({"type": "text", "text": "Return the production plan JSON."})
    return content


# ---------------------------------------------------------------- Claude


def call_claude(system: str, content: list[dict], validate) -> dict:
    """One structured-output request plus up to MAX_REPAIRS validation-feedback rounds."""
    import anthropic  # only this mode needs the SDK

    client = anthropic.Anthropic()
    messages: list[dict] = [{"role": "user", "content": content}]
    errors: list[str] = []
    for _ in range(MAX_REPAIRS + 1):
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=system,
            messages=messages,
            thinking={"type": "adaptive"},
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": PLAN_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            extra_body={"fallbacks": "default"},
        )
        if response.stop_reason == "refusal":
            raise GenerationError(f"model declined the request: {response.stop_details}")
        if response.stop_reason == "max_tokens":
            raise GenerationError("response hit max_tokens before the plan was complete")
        plan = json.loads(next(b.text for b in response.content if b.type == "text"))
        errors = validate(plan)
        if not errors:
            return plan
        messages += [
            {"role": "assistant", "content": response.content},
            {"role": "user", "content": "The plan failed validation. Fix every problem and return the "
                                        "complete corrected JSON:\n- " + "\n- ".join(errors)},
        ]
    raise GenerationError("plan still invalid after repairs:\n  - " + "\n  - ".join(errors))


# ---------------------------------------------------------------- deterministic post-processing


def _apply_phrase_brands(script: str, lexicon: dict) -> str:
    """Multi-word aliases ("mentor it"), optionally prefixed (ב/ב-), matched case-insensitively."""
    for b in lexicon["brands"]:
        for alias in sorted((a for a in b["aliases"] + [b["tts"]] if " " in a.strip()), key=len, reverse=True):
            words = r"\s+".join(map(re.escape, alias.split()))
            pattern = rf"(?<![\w\u0591-\u05C7])([{HEBREW_PREFIXES}]{{0,2}})-?{words}(?![\w\u0591-\u05C7])"
            script = re.sub(pattern, lambda m: m.group(1) + b["tts"], script, flags=re.IGNORECASE)
    return script


def apply_brands(script: str, lexicon: dict) -> str:
    """Rewrite every brand alias (optionally prefixed by ו/ה/ב/ל/מ/ש/כ) to its confirmed TTS spelling."""
    script = _apply_phrase_brands(script, lexicon)
    targets = {}
    for b in lexicon["brands"]:
        for alias in b["aliases"] + [b["tts"]]:
            if " " not in alias.strip():
                targets[normalize(alias)] = b["tts"]

    def fix(token: str) -> str:
        m = re.match(r"^(\W*)(.*?)(\W*)$", token)
        lead, core, trail = m.groups()
        for i in range(0, min(2, len(core)) + 1):
            prefix = core[:i]
            if prefix and any(ch not in HEBREW_PREFIXES for ch in prefix):
                break
            if normalize(core[i:]) in targets:
                return f"{lead}{prefix}{targets[normalize(core[i:])]}{trail}"
        return token

    return " ".join(fix(t) for t in script.split())


def strip_niqqud(text: str) -> str:
    return NIQQUD.sub("", text)


def validate_plan(plan: dict, brief: dict, library: dict, pricing: dict) -> list[str]:
    errors: list[str] = []
    screens = {s["key"]: s for s in brief["screens"]}
    new_keys = [n["key"] for n in plan["new_broll"]]
    beats = plan["beats"]
    if len(beats) < 3:
        return ["need at least 3 beats"]

    for i, b in enumerate(beats):
        where = f"beat #{i} ({b['type']} '{b['asset']}')"
        if b["asset"] == END_CARD_KEY and brief.get("endCard"):
            if b["type"] != "end":
                errors.append(f"{where}: the generated end card must use type 'end'")
        elif b["asset"] in screens:
            expected = SCREEN_KINDS[screens[b["asset"]]["kind"]]
            if b["type"] != expected:
                errors.append(f"{where}: screen kind '{screens[b['asset']]['kind']}' must use type '{expected}'")
        elif b["asset"] in library["broll"] or b["asset"] in new_keys:
            if b["type"] != "broll":
                errors.append(f"{where}: b-roll clips must use type 'broll'")
        else:
            errors.append(f"{where}: unknown asset; use a screen key, a library key or a new_broll key")
        if b["type"] in ("screen", "scroll") and not b["caption"].strip():
            errors.append(f"{where}: {b['type']} beats need a caption")
    if beats[-1]["type"] != "end":
        errors.append("the last beat must be the 'end' beat (the cta screen or the generated end card)")
    if any(b["type"] == "end" for b in beats[:-1]):
        errors.append("only the last beat may be type 'end'")
    used = [b["asset"] for b in beats if b["asset"] in screens]
    for key in {k for k in used if used.count(k) > 1}:
        errors.append(f"screen '{key}' is used more than once")

    cursor = CueCursor(tokenize(plan["script"]))
    for i, b in enumerate(beats[1:-1], start=1):
        if not b["cue"].strip():
            errors.append(f"beat #{i}: missing cue (first word of the line it illustrates, as in the script)")
            continue
        try:
            cursor.find(b["cue"])
        except ValueError as e:
            errors.append(f"beat #{i}: {e}")

    words, target = len(tokenize(plan["script"])), word_target(brief, pricing)
    if not 0.8 * target <= words <= 1.2 * target:
        errors.append(f"script has {words} words; target is {target} (±20%)")
    if len(new_keys) > brief["budget"]["newBrollMax"]:
        errors.append(f"{len(new_keys)} new b-roll clips; the budget allows {brief['budget']['newBrollMax']}")
    for n in plan["new_broll"]:
        if n["key"] in library["broll"] or n["key"] in screens:
            errors.append(f"new b-roll key '{n['key']}' collides with an existing key")
        if n["key"] not in {b["asset"] for b in beats}:
            errors.append(f"new b-roll '{n['key']}' is never used; drop it (it would cost credits)")
    return errors


def finalize(plan: dict, lexicon: dict) -> dict:
    """Deterministic fixes the model must not be trusted with."""
    plan = json.loads(json.dumps(plan))
    plan["script"] = apply_brands(plan["script"], lexicon)
    for b in plan["beats"]:
        b["caption"], b["sub"] = strip_niqqud(b["caption"]), strip_niqqud(b["sub"])
        if b["cue"]:
            b["cue"] = apply_brands(b["cue"], lexicon)
    return plan


def estimate(plan: dict, brief: dict, pricing: dict) -> dict:
    wps, speed = pricing["words_per_second"], brief["speed"]
    tokens = tokenize(plan["script"])
    cursor = CueCursor(tokens)
    starts = [0.0]
    for b in plan["beats"][1:-1]:
        starts.append(round(cursor.find(b["cue"]) / wps / speed + 0.3 / speed, 1))
    voice_seconds = len(tokens) / wps
    total = round((voice_seconds + 0.4 + 3.4) / speed, 1)
    starts.append(round((voice_seconds + 0.4) / speed, 1))
    res = brief["budget"]["resolution"]
    broll = len(plan["new_broll"]) * pricing["broll_5s"][res]
    cost = broll + pricing["voiceover_take"]
    budget = brief["budget"]["credits"]
    return {"words": len(tokens), "seconds": total, "starts": starts, "broll_credits": broll,
            "clip_credits": pricing["broll_5s"][res],
            "voice_credits": pricing["voiceover_take"], "credits": cost, "resolution": res,
            "within_budget": None if budget is None else cost <= budget}


def budget_options(plan: dict, brief: dict, pricing: dict) -> list[dict]:
    """What each production choice costs and what it leaves of the balance (budget.credits)."""
    balance, voice, chosen = brief["budget"]["credits"], pricing["voiceover_take"], len(plan["new_broll"])
    options = []
    for res in sorted(pricing["broll_5s"], key=pricing["broll_5s"].get):
        for n in range(brief["budget"]["newBrollMax"] + 1):
            if n == 0 and options:
                continue  # "library only" is the same at every resolution
            cost = voice + n * pricing["broll_5s"][res]
            options.append({"label": "רק מהספרייה" if n == 0 else f"{n} שוט{'ים' if n > 1 else ''} חדש{'ים' if n > 1 else ''} ({res})",
                            "cost": cost, "left": None if balance is None else round(balance - cost, 2),
                            "chosen": n == chosen and (n == 0 or res == brief["budget"]["resolution"])})
    return options


def build_spec(plan: dict, brief: dict, library: dict) -> dict:
    screens = {s["key"]: s for s in brief["screens"]}
    used = [b["asset"] for b in plan["beats"] if b["asset"] != END_CARD_KEY]
    assets = {}
    for key in dict.fromkeys(used):
        assets[key] = screens[key]["url"] if key in screens else library["broll"].get(key, {}).get("url", "")
    beats = []
    for i, b in enumerate(plan["beats"]):
        if b["asset"] == END_CARD_KEY:
            beat = {"type": "end", "card": brief["endCard"]}
        else:
            beat = {"type": b["type"], "asset": b["asset"]}
        if b["type"] == "scroll":
            beat.update({k: screens[b["asset"]][k] for k in SCROLL_FIELDS if k in screens[b["asset"]]})
        if 0 < i < len(plan["beats"]) - 1:
            beat["cue"] = b["cue"]
        if b["caption"]:
            beat["caption"] = b["caption"]
        if b["sub"]:
            beat["sub"] = b["sub"]
        if b["type"] == "end":
            beat["hold"] = 3.4
        beats.append(beat)
    spec = {
        "name": brief["name"],
        "speed": brief["speed"],
        "voice": {"file": "", "voiceId": brief["voice"]["id"], "lang": brief["language"],
                  "leadIn": 0.3, "script": plan["script"]},
        "assets": assets,
        "beats": beats,
        "generate": {
            "voice": {"model": "text2speech_v2", "variant": "elevenlabs", "voice_type": "preset",
                      "voice_id": brief["voice"]["id"], "prompt": plan["script"]},
            "broll": {n["key"]: {"model": "seedance_2_5", "aspect_ratio": "9:16", "duration": 5,
                                 "resolution": brief["budget"]["resolution"], "generate_audio": False,
                                 "prompt": n["prompt"]} for n in plan["new_broll"]},
        },
    }
    if brief.get("brand"):
        spec["brand"] = brief["brand"]
    return spec


# ---------------------------------------------------------------- review sheet


def review_sheet(plan: dict, brief: dict, est: dict, library: dict, options: list[dict]) -> str:
    screens = {s["key"]: s for s in brief["screens"]}
    budget = brief["budget"]["credits"]
    verdict = "" if budget is None else (" ✅ בתוך התקציב" if est["within_budget"] else f" ⚠️ מעל התקציב ({budget})")
    lines = [
        f"# {brief['name']}: תסריט ותוכנית לאישור", "",
        f"**אורך משוער:** ~{est['seconds']} שנ' (×{brief['speed']}) · **{est['words']} מילים** · "
        f"**עלות משוערת:** {est['credits']} קרדיטים{verdict}", "",
        "## 1. הקריינות (הטקסט שיישלח לקריינית)", "", f"> {plan['script']}", "",
    ]
    if plan["flagged_words"]:
        lines += ["### מילים מנוקדות, לבדוק שההגייה נכונה", "", "| מילה | הגייה | למה |", "|---|---|---|"]
        lines += [f"| {w['word']} | {w['reading']} | {w['reason']} |" for w in plan["flagged_words"]]
        lines.append("")
    lines += ["## 2. מה רואים ומתי", "", "| # | ~שנ' | מה על המסך | כיתוב | מתחיל במילה |", "|---|---|---|---|---|"]
    for i, (b, t) in enumerate(zip(plan["beats"], est["starts"])):
        if b["asset"] == END_CARD_KEY:
            card = brief["endCard"]
            what = f"כרטיס סיום אוטומטי: {card['title'].replace(chr(10), ' ')} · {card['url']}"
        elif b["asset"] in screens:
            what = (f"מסך `{b['asset']}`" + (" (גלילה)" if b["type"] == "scroll" else "")
                    + (f" ({screens[b['asset']]['desc']})" if screens[b['asset']].get("desc") else ""))
        elif b["asset"] in library["broll"]:
            what = f"שוט מהספרייה `{b['asset']}`: {library['broll'][b['asset']]['desc']}"
        else:
            what = f"שוט חדש `{b['asset']}`"
        cap = " / ".join(filter(None, [b["caption"].replace("\n", " "), b["sub"]])) or "–"
        lines.append(f"| {i} | {t} | {what} | {cap} | {b['cue'] or '–'} |")
    lines += ["", "## 3. שוטים ועלות", ""]
    reused = sorted({b["asset"] for b in plan["beats"] if b["asset"] in library["broll"]})
    lines.append(f"- מהספרייה (0 קרדיטים): {', '.join(reused) or 'אין'}")
    for n in plan["new_broll"]:
        lines.append(f"- **חדש `{n['key']}`** ({est['resolution']}, "
                     f"{est['clip_credits']} קרדיטים): {n['why']}\n"
                     f"  - פרומפט: `{n['prompt']}`")
    lines.append(f"- קריינות: ~{est['voice_credits']} קרדיט")
    balance = brief["budget"]["credits"]
    lines += ["", f"### מה כל בחירה עולה" + (f" (יתרה: {balance} קרדיטים)" if balance is not None else ""), "",
              "| אפשרות | עלות | נשאר |", "|---|---|---|"]
    for o in options:
        left = "–" if o["left"] is None else (f"{o['left']}" if o["left"] >= 0 else f"⚠️ חסרים {-o['left']}")
        mark = " ← **התוכנית הזו**" if o["chosen"] else ""
        lines.append(f"| {o['label']}{mark} | {o['cost']} | {left} |")
    if plan["notes"]:
        lines += ["", "## 4. הערות", "", plan["notes"]]
    lines += ["", "## לאישור", "",
              "1. ההגייה של המילים המנוקדות נכונה?",
              "2. התסריט והסדר מאושרים?",
              f"3. לאשר עלות של ~{est['credits']} קרדיטים?", "",
              "אחרי האישור: מייצרים את הקריינות ואת השוטים החדשים, ממלאים את הקישורים בקובץ ההגדרות "
              "(`voice.file` ו-`assets`), ומרנדרים עם `video/engine/render.py`."]
    return "\n".join(lines) + "\n"


def prompt_sheet(system: str, brief: dict) -> str:
    screens = "\n".join(f"- {screen_label(s)}: {s['url']}" for s in brief["screens"])
    if brief.get("endCard"):
        screens += f"\n\n{end_card_label(brief)}"
    return (f"# Prompt: {brief['name']}\n\nPaste the SYSTEM part as the system prompt (or at the top of the "
            f"message), attach the screen images in this order, then paste the USER part. Save the JSON "
            f"answer to a file and run:\n`python3 generate.py <brief> --from-response <answer.json>`\n\n"
            f"## Screens to attach (in order)\n{screens}\n\n## SYSTEM\n\n{system}\n\n## USER\n\n"
            f"{brief_text(brief)}\n\nThe attached images are the screens listed above, in order.\n"
            f"Return only a JSON object matching this schema:\n\n```json\n"
            f"{json.dumps(PLAN_SCHEMA, indent=2)}\n```\n")


# ---------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("brief", type=Path)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--prompt-only", action="store_true", help="write a paste-ready prompt and stop")
    mode.add_argument("--from-response", type=Path, help="JSON plan returned by Claude (pasted)")
    ap.add_argument("--no-images", action="store_true", help="send screen descriptions only, not images")
    ap.add_argument("--specs-dir", type=Path, default=VIDEO_DIR / "specs")
    ap.add_argument("--review-dir", type=Path, default=VIDEO_DIR / "briefs")
    args = ap.parse_args()

    brief = load_brief(args.brief)
    library, lexicon = load_json(VIDEO_DIR / "library.json"), load_json(VIDEO_DIR / "lexicon.json")
    pricing = load_json(VIDEO_DIR / "pricing.json")
    system = build_system_prompt(brief, library, lexicon, pricing)
    args.review_dir.mkdir(parents=True, exist_ok=True)

    if args.prompt_only:
        out = args.review_dir / f"{brief['name']}.prompt.md"
        out.write_text(prompt_sheet(system, brief), encoding="utf-8")
        print(f"prompt → {out}")
        return 0

    def check(plan: dict) -> list[str]:
        return validate_plan(finalize(plan, lexicon), brief, library, pricing)

    if args.from_response:
        plan = load_json(args.from_response)
        errors = check(plan)
        if errors:
            raise GenerationError("pasted plan is invalid. Ask Claude to fix:\n  - " + "\n  - ".join(errors))
    else:
        plan = call_claude(system, build_user_content(brief, images=not args.no_images), check)

    plan = finalize(plan, lexicon)
    est = estimate(plan, brief, pricing)
    spec_path = args.specs_dir / f"{brief['name']}.json"
    spec_path.write_text(json.dumps(build_spec(plan, brief, library), ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    review_path = args.review_dir / f"{brief['name']}.review.md"
    review_path.write_text(review_sheet(plan, brief, est, library, budget_options(plan, brief, pricing)),
                           encoding="utf-8")
    print(f"spec → {spec_path}\nreview → {review_path}\n"
          f"~{est['seconds']}s, {est['words']} words, ~{est['credits']} credits "
          f"({len(plan['new_broll'])} new clip(s) at {est['resolution']})")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (BriefError, GenerationError, ValueError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(2)
