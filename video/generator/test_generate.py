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
MENTORIT_BRIEF = HERE / "fixtures" / "mentorit-ad-1.brief.json"
MENTORIT_RESPONSE = HERE / "fixtures" / "mentorit-ad-1.response.json"


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

    def test_multi_word_brand(self):
        cases = {
            "במנטור איט עונים": "במֶנְטוֹר אִיט עונים",
            "ב-mentor it": "במֶנְטוֹר אִיט",
            "Mentor It: המנטור": "מֶנְטוֹר אִיט: המנטור",
            "mentorit.": "מֶנְטוֹר אִיט.",
            "מֶנְטוֹר אִיט": "מֶנְטוֹר אִיט",          # idempotent
            "מחפשים מנטור, ולא": "מחפשים מנטור, ולא",  # the plain word is not the brand
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


class TallScreensAndEndCard(Base):
    """mentorit-ad-1: a scrolling full-page capture and an engine-generated end card."""

    def setUp(self):
        super().setUp()
        self.brief = g.load_brief(MENTORIT_BRIEF)
        self.plan = g.finalize(g.load_json(MENTORIT_RESPONSE), self.lexicon)
        self.library["broll"].pop("cafe", None)  # the library as it was before this plan added the clip

    def test_plan_is_valid_and_costs_one_clip(self):
        self.assertEqual(g.validate_plan(self.plan, self.brief, self.library, self.pricing), [])
        self.assertEqual(g.estimate(self.plan, self.brief, self.pricing)["credits"], 36)

    def test_spec_carries_scroll_region_and_card(self):
        spec = g.build_spec(self.plan, self.brief, self.library)
        scroll = next(b for b in spec["beats"] if b["type"] == "scroll")
        self.assertEqual((scroll["crop"], scroll["cut"]), ([0, 1800], [[896, 1048]]))
        end = spec["beats"][-1]
        self.assertEqual(end["card"]["url"], "mentorit.me")
        self.assertNotIn("asset", end)
        self.assertNotIn(g.END_CARD_KEY, spec["assets"])
        self.assertEqual(spec["assets"]["cafe"], "")
        self.assertEqual(spec["brand"]["headingFont"], "Frank Ruhl Libre")

    def test_engine_accepts_the_spec_once_generated(self):
        sys.path.insert(0, str(g.VIDEO_DIR / "engine"))
        import render
        spec = g.build_spec(self.plan, self.brief, self.library)
        spec["voice"]["file"], spec["assets"]["cafe"] = "https://x/vo.mp3", "https://x/cafe.mp4"
        path = Path(tempfile.mktemp(suffix=".json"))
        path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
        self.assertEqual(render.load_spec(path)["beats"][-1]["card"]["title"], self.brief["endCard"]["title"])
        spec["beats"][4]["cut"] = [[1048, 896]]
        spec["beats"][-1]["card"] = {"title": "x"}
        path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
        with self.assertRaises(render.SpecError) as ctx:
            render.load_spec(path)
        self.assertIn("cut band", str(ctx.exception))
        self.assertIn("card needs ['url']", str(ctx.exception))

    def test_tall_screen_must_scroll(self):
        plan = copy.deepcopy(self.plan)
        plan["beats"][4]["type"] = "screen"
        self.assertTrue(g.validate_plan(plan, self.brief, self.library, self.pricing))

    def test_brief_takes_cta_screen_or_end_card_not_both(self):
        bad = g.load_json(MENTORIT_BRIEF)
        bad["screens"].append({"key": "cta", "kind": "cta", "url": "https://x/cta.png"})
        path = Path(tempfile.mktemp(suffix=".json"))
        path.write_text(json.dumps(bad, ensure_ascii=False), encoding="utf-8")
        with self.assertRaises(g.BriefError) as ctx:
            g.load_brief(path)
        self.assertIn("not both", str(ctx.exception))


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
