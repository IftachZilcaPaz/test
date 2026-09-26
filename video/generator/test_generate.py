"""Tests for the deterministic half of the generator (no API calls).

Run: cd video/generator && python3 -m unittest test_generate.py
"""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import generate as g

HERE = Path(__file__).parent
BRIEF = HERE / "fixtures" / "journee-ad-2.brief.json"
RESPONSE = HERE / "fixtures" / "journee-ad-2.response.json"


class Base(unittest.TestCase):
    def setUp(self):
        self.brief = g.load_brief(BRIEF)
        self.plan = g.load_json(RESPONSE)
        self.library = g.load_json(g.VIDEO_DIR / "library.json")
        self.lexicon = g.load_json(g.VIDEO_DIR / "lexicon.json")
        self.pricing = g.load_json(g.VIDEO_DIR / "pricing.json")

    def errors(self, plan):
        return g.validate_plan(g.finalize(plan, self.lexicon), self.brief, self.library, self.pricing)


class ReproducesShippedAd(Base):
    def test_spec_matches_hand_built_journee_ad_2(self):
        plan = g.finalize(self.plan, self.lexicon)
        self.assertEqual(g.validate_plan(plan, self.brief, self.library, self.pricing), [])
        spec = g.build_spec(plan, self.brief, self.library)
        shipped = g.load_json(g.VIDEO_DIR / "specs" / "journee-ad-2.json")
        self.assertEqual(spec["voice"]["script"], shipped["voice"]["script"])
        self.assertEqual(spec["beats"], shipped["beats"])
        self.assertEqual(spec["assets"], shipped["assets"])
        self.assertEqual(spec["voice"]["file"], "")  # filled in after generation
        self.assertEqual(spec["generate"]["voice"]["prompt"], shipped["voice"]["script"])

    def test_estimate_reuse_costs_only_the_voice(self):
        est = g.estimate(g.finalize(self.plan, self.lexicon), self.brief, self.pricing)
        self.assertEqual(est["credits"], 1)
        self.assertTrue(est["within_budget"])
        self.assertTrue(20 < est["seconds"] < 30)
        self.assertEqual(len(est["starts"]), len(self.plan["beats"]))
        self.assertEqual(est["starts"], sorted(est["starts"]))


class BudgetOptions(Base):
    def test_shows_cost_and_remaining_balance_per_choice(self):
        plan = g.finalize(self.plan, self.lexicon)
        opts = g.budget_options(plan, self.brief, self.pricing)
        by = {o["label"]: o for o in opts}
        self.assertEqual(by["רק מהספרייה"]["cost"], 1)
        self.assertEqual(by["רק מהספרייה"]["left"], 69)            # brief balance 70
        self.assertTrue(by["רק מהספרייה"]["chosen"])
        self.assertEqual(by["2 שוטים חדשים (720p)"]["cost"], 71)
        self.assertEqual(by["2 שוטים חדשים (720p)"]["left"], -1)   # shown as "missing 1"
        self.assertEqual(by["1 שוט חדש (1080p)"]["cost"], 61)
        self.assertEqual(sum(o["chosen"] for o in opts), 1)


class Brands(Base):
    def test_aliases_prefixes_punctuation(self):
        cases = {
            "ג'רני, עוזר": "ג'רְנִי, עוזר",
            "וג'רני מוציא": "וג'רְנִי מוציא",
            "עם ג'ורני.": "עם ג'רְנִי.",
            "ב-Journee": "בג'רְנִי",           # hyphenated Latin brand → one consistent TTS form
            "Journee!": "ג'רְנִי!",
            "ג'רְנִי": "ג'רְנִי",              # idempotent
            "שולחים הודעה": "שולחים הודעה",   # other words untouched
        }
        for src, want in cases.items():
            with self.subTest(src=src):
                self.assertEqual(g.apply_brands(src, self.lexicon), want)

    def test_captions_never_carry_niqqud(self):
        plan = copy.deepcopy(self.plan)
        plan["beats"][5]["caption"] = "שִׁלְחוּ לינק"
        self.assertEqual(g.finalize(plan, self.lexicon)["beats"][5]["caption"], "שלחו לינק")


class Validation(Base):
    def test_rejects_bad_plans(self):
        cases = {
            "wrong type for screen kind": lambda p: p["beats"][1].update(type="screen", caption="x"),
            "unknown asset": lambda p: p["beats"][1].update(asset="nope"),
            "cue out of order": lambda p: p["beats"].insert(2, dict(p["beats"][9])),
            "missing cue": lambda p: p["beats"][2].update(cue=""),
            "end not last": lambda p: p["beats"].append(dict(p["beats"][1])),
            "unused new clip": lambda p: p["new_broll"].append({"key": "x", "prompt": "p", "why": "w"}),
            "too many new clips": lambda p: p["new_broll"].extend(
                {"key": f"n{i}", "prompt": "p", "why": "w"} for i in range(3)),
            "script too short": lambda p: p.update(script="מתכננים טיול? " + p["script"][:40]),
        }
        for name, mutate in cases.items():
            with self.subTest(name):
                plan = copy.deepcopy(self.plan)
                mutate(plan)
                self.assertTrue(self.errors(plan), name)

    def test_new_clip_is_costed_and_left_for_generation(self):
        plan = copy.deepcopy(self.plan)
        plan["beats"][7]["asset"] = "bangkok"
        plan["new_broll"] = [{"key": "bangkok", "prompt": "Bangkok street food at night, no text, no logos, "
                              "no readable screens", "why": "matches the Thailand list"}]
        self.assertEqual(self.errors(plan), [])
        plan = g.finalize(plan, self.lexicon)
        self.assertEqual(g.estimate(plan, self.brief, self.pricing)["credits"], 36)
        spec = g.build_spec(plan, self.brief, self.library)
        self.assertEqual(spec["assets"]["bangkok"], "")
        self.assertEqual(spec["generate"]["broll"]["bangkok"]["resolution"], "720p")


class BriefAndPrompt(Base):
    def test_brief_validation(self):
        bad = g.load_json(BRIEF)
        bad["screens"] = [s for s in bad["screens"] if s["kind"] != "cta"]
        bad["name"] = "Bad Name"
        path = Path(tempfile.mktemp(suffix=".json"))
        path.write_text(json.dumps(bad, ensure_ascii=False), encoding="utf-8")
        with self.assertRaises(g.BriefError) as ctx:
            g.load_brief(path)
        self.assertIn("cta", str(ctx.exception))
        self.assertIn("name", str(ctx.exception))

    def test_system_prompt_is_fully_rendered(self):
        system = g.build_system_prompt(self.brief, self.library, self.lexicon, self.pricing)
        self.assertNotIn("{{", system)
        for needle in ("roof:", "thai:", "כִּתְבוּ", "ג'רְנִי", str(g.word_target(self.brief, self.pricing))):
            self.assertIn(needle, system)

    def test_user_content_sends_screens_as_images(self):
        content = g.build_user_content(self.brief, images=True)
        self.assertEqual(sum(c["type"] == "image" for c in content), len(self.brief["screens"]))
        self.assertFalse(any(c["type"] == "image" for c in g.build_user_content(self.brief, images=False)))


class Cli(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(HERE / "generate.py"), *map(str, args)],
                              capture_output=True, text=True)

    def test_from_response_writes_spec_and_review(self):
        with tempfile.TemporaryDirectory() as d:
            r = self.run_cli(BRIEF, "--from-response", RESPONSE, "--specs-dir", d, "--review-dir", d)
            self.assertEqual(r.returncode, 0, r.stderr)
            review = (Path(d) / "journee-ad-2.review.md").read_text(encoding="utf-8")
            self.assertIn("וג'רְנִי מוציא", review)
            self.assertIn("לאישור", review)
            self.assertTrue((Path(d) / "journee-ad-2.json").exists())

    def test_prompt_only(self):
        with tempfile.TemporaryDirectory() as d:
            r = self.run_cli(BRIEF, "--prompt-only", "--review-dir", d)
            self.assertEqual(r.returncode, 0, r.stderr)
            text = (Path(d) / "journee-ad-2.prompt.md").read_text(encoding="utf-8")
            self.assertIn("## SYSTEM", text)
            self.assertIn('"flagged_words"', text)


if __name__ == "__main__":
    unittest.main()
