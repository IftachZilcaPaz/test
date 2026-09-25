"""Regression test: the aligner reproduces the hand-tuned cut points of journee-ad-2.

Transcript = the actual faster-whisper (small) word timings of that voice-over, misspellings included.
Run: python3 -m unittest video/engine/test_align.py
"""
import unittest

from align import Aligner, Word, normalize

SCRIPT = (
    "מתכננים טיול? פשוט שולחים הודעה, בוואטסאפ, באינסטגרם, או באתר. משפט אחד, ומקבלים טיסה, מלון "
    "ומסלול מלא. ראיתם סרטון בטיקטוק? שִׁלְחוּ את הלינק, וג'רְנִי מוציא ממנו את כל המקומות. חבר שלח "
    "רשימת המלצות? מדביקים, ומקבלים מסלול. וכל המסמכים של הטיול איתכם, גם בלי קליטה. ג'רְנִי, עוזר "
    "הטיולים החכם שלכם."
)

WHISPER = (
    "מתכננים@0.00 טיול,@0.54 פשוט@1.28 שלחים@1.84 עודה,@2.22 בוואצה,@2.72 באינסטגרם@3.48 או@4.28 "
    "באתר,@4.42 משפט@5.10 אחד@5.84 ומקבלים@6.10 תיסה,@6.70 מלון@7.44 ומסלול@7.80 מלא.@8.36 ראיתם@9.14 "
    "סרטון@9.56 בטיקטוק?@9.94 שלחו@11.08 את@11.40 הלינק@11.52 וג@11.94 'רני@12.36 מוצאים@12.54 "
    "ממנו@12.92 את@13.20 כל@13.34 המקומות.@13.60 חבר@14.66 שלה@15.02 אחרי@15.30 שימת@15.44 "
    "המלצות,@15.76 מדביקים@16.86 ומקבלים@17.48 מסלול.@18.10 וכל@19.10 המשמחים@19.36 שם@19.86 "
    "של@20.04 הטיול@20.20 איתכם,@20.50 גם@21.26 בלי@21.46 קליטה.@21.74 ג@22.66 'רני,@22.82 "
    "עוזר@23.42 הטיולים@23.68 החכם@24.06 שלכם.@24.52"
)

# (cue, hand-tuned beat start in the shipped edit) — beat start = word start + 0.3s lead-in.
EXPECTED = [
    ("פשוט", 1.58), ("באינסטגרם", 3.78), ("או", 4.58), ("ומקבלים", 6.40), ("ראיתם", 9.44),
    ("שלחו", 11.38), ("חבר", 14.96), ("מדביקים", 17.16), ("וכל", 19.40), ("ג'רני", 22.96),
]


def parse(raw: str) -> list[Word]:
    return [Word(t, float(s)) for t, s in (tok.rsplit("@", 1) for tok in raw.split())]


class AlignTest(unittest.TestCase):
    def test_reproduces_hand_tuned_cuts(self):
        al = Aligner(SCRIPT, parse(WHISPER))
        for cue, start in EXPECTED:
            with self.subTest(cue=cue):
                self.assertAlmostEqual(al.cue_time(cue) + 0.3, start, places=2)

    def test_match_ratio_flags_wrong_take(self):
        self.assertGreater(Aligner(SCRIPT, parse(WHISPER)).match_ratio, 0.85)
        wrong = parse("hello@0.0 world@0.5 this@1.0 is@1.5 english@2.0")
        with self.assertRaises(ValueError):
            Aligner(SCRIPT, wrong)

    def test_cues_resolve_in_order(self):
        al = Aligner(SCRIPT, parse(WHISPER))
        # Cues match whole words as written: the prefixed "וג'רני" is a different word from "ג'רני".
        self.assertAlmostEqual(al.cue_time("וג'רני"), 11.94)
        self.assertAlmostEqual(al.cue_time("ג'רני"), 22.66)
        with self.assertRaises(ValueError):
            al.cue_time("פשוט")                             # already passed

    def test_normalize(self):
        self.assertEqual(normalize("שִׁלְחוּ,"), "שלחו")
        self.assertEqual(normalize("ג'רְנִי"), "גרני")
        self.assertEqual(normalize("המקומות."), normalize("המקומות"))
        self.assertEqual(normalize("שלום"), "שלומ")


if __name__ == "__main__":
    unittest.main()
