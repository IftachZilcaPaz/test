"""Map cue words in a voice-over script to their start times in the ASR (Whisper) transcript.

Whisper output is noisy: it misspells words, splits them (ג'רני → "ג" + "'רני"), and drops niqqud.
Matching cue words directly against it is therefore fragile. Instead the script and the transcript are
aligned at the *character* level with difflib. Each script word then maps to the transcript word that
holds its first matched character, and its time is that word's start time.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher

_NIQQUD = re.compile(r"[֑-ׇ]")          # cantillation + vowel points
_NON_WORD = re.compile(r"[^\w]", re.UNICODE)        # punctuation, geresh, quotes, dashes
_FINALS = str.maketrans("ךםןףץ", "כמנפצ")


def normalize(word: str) -> str:
    """Canonical form used for matching: no niqqud, punctuation, or final letters; lowercase."""
    word = unicodedata.normalize("NFC", word)
    word = _NIQQUD.sub("", word)
    word = _NON_WORD.sub("", word)
    return word.translate(_FINALS).lower()


def tokenize(text: str) -> list[str]:
    """Split a script into normalized words, dropping tokens that normalize to nothing."""
    return [t for t in (normalize(w) for w in text.split()) if t]


@dataclass(frozen=True)
class Word:
    text: str
    start: float


def _flatten(tokens: list[str]) -> tuple[str, list[int]]:
    """Concatenate tokens and remember which token owns each character."""
    chars, owner = [], []
    for i, tok in enumerate(tokens):
        chars.extend(tok)
        owner.extend([i] * len(tok))
    return "".join(chars), owner


class Aligner:
    """Aligns one script against one transcript; resolves cues in script order."""

    def __init__(self, script: str, words: list[Word]):
        if not words:
            raise ValueError("transcript has no words")
        self.script_tokens = tokenize(script)
        if not self.script_tokens:
            raise ValueError("script is empty")
        self.words = [w for w in words if normalize(w.text)]
        self._s_chars, self._s_owner = _flatten(self.script_tokens)
        t_chars, self._t_owner = _flatten([normalize(w.text) for w in self.words])
        matcher = SequenceMatcher(None, self._s_chars, t_chars, autojunk=False)
        self._blocks = [b for b in matcher.get_matching_blocks() if b.size]
        if not self._blocks:
            raise ValueError("script and transcript share no characters (wrong language or file?)")
        self._cursor = 0  # script token index; cues must appear in order

    @property
    def match_ratio(self) -> float:
        """Share of script characters found in the transcript: a cheap sanity score for the take."""
        return sum(b.size for b in self._blocks) / len(self._s_chars)

    def _script_char_of(self, token_index: int) -> int:
        return self._s_owner.index(token_index)

    def _transcript_char_for(self, s_pos: int) -> int:
        """Matched transcript position of script char s_pos, snapping forward past unmatched text."""
        for b in self._blocks:
            if b.a <= s_pos < b.a + b.size:
                return b.b + (s_pos - b.a)
            if b.a > s_pos:
                return b.b
        last = self._blocks[-1]
        return last.b + last.size - 1

    def time_of_token(self, token_index: int) -> float:
        t_pos = self._transcript_char_for(self._script_char_of(token_index))
        return self.words[self._t_owner[t_pos]].start

    def find_cue(self, cue: str) -> int:
        """Script token index of the next occurrence of `cue` (one or more words) after the cursor."""
        needle = tokenize(cue)
        if not needle:
            raise ValueError(f"cue {cue!r} is empty after normalization")
        n = len(needle)
        for i in range(self._cursor, len(self.script_tokens) - n + 1):
            if self.script_tokens[i:i + n] == needle:
                self._cursor = i + n
                return i
        raise ValueError(f"cue {cue!r} not found in the script after word #{self._cursor}")

    def cue_time(self, cue: str) -> float:
        return self.time_of_token(self.find_cue(cue))
