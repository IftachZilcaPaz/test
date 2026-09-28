"use client";

import { useEffect, useRef, useState } from "react";
import { parseLexicon, stripNiqqud } from "@/lib/script/hebrew";

const NIQQUD_MARKS = [
  ["ָ", "קָמָץ"],
  ["ַ", "פַתָח"],
  ["ֵ", "צֵירֵה"],
  ["ֶ", "סֶגוֹל"],
  ["ִ", "חִירִיק"],
  ["ֹ", "חוֹלָם"],
  ["ֻ", "קֻבּוּץ"],
  ["ְ", "שְׁוָא"],
  ["ּ", "דָּגֵשׁ"],
  ["ׁ", "שִׁין"],
  ["ׂ", "שׂין"],
] as const;

const HAS_NIQQUD = /[֑-ׇ]/u;

const TIPS = [
  "כותבים את המילה עם ניקוד, לוחצים 🔊 ושומעים — בחינם. מוסיפים למילון רק כשזה נשמע נכון.",
  "דגש רק ב־בּ, כּ, פּ — ורק כשהמילה צריכה (בְּחִינָם). בשום אות אחרת לא שמים דגש: תַסְרִיט ולא תַּסְרִיט, נַסוּ ולא נַסּוּ. דגש מיותר מזיז את ההטעמה.",
  "נקדו רק את המילה הבעייתית, לא את כל המשפט. וּ (שורוק) היא תנועה — משאירים אותה.",
  "ניקוד לא קובע איפה הטעם. המילה עדיין נשמעת מלעיל (NA-su במקום na-SU)? שמעו כמה גרסאות כאן לפני שמוסיפים.",
  "לפעמים מספיק לנקד רק את ההברה שצריכה להישמע חזק: תסרִיט.",
  "שם באנגלית או מותג? כתבו אותו באותיות עבריות כמו שהוא נשמע: ריינוביישן.",
  "מילה אחת מספיקה: המילון תופס גם את ה׳, ו׳, ל׳ או ב׳ בתחילתה (התסריט, לתסריט).",
];

type Target = "word" | "lexicon";

/**
 * The pronunciation lexicon, made usable without knowing its format: try a pointed
 * spelling, hear it for free in the project's voice, and add it with one click.
 * The raw "word = pointed" list stays editable for anyone who prefers typing it.
 */
export function PronunciationLab({
  initialLexicon,
  voiceId,
  voiceName,
  error,
}: {
  initialLexicon: string;
  voiceId: string;
  voiceName: string;
  error?: string;
}) {
  const [lexicon, setLexicon] = useState(initialLexicon);
  const [word, setWord] = useState("");
  const [status, setStatus] = useState<{ tone: "info" | "bad"; text: string } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const wordRef = useRef<HTMLInputElement>(null);
  const lexiconRef = useRef<HTMLTextAreaElement>(null);
  const target = useRef<Target>("word");
  const audio = useRef<HTMLAudioElement | null>(null);
  const caret = useRef<{ target: Target; at: number } | null>(null);

  useEffect(() => () => audio.current?.pause(), []);

  // Put the caret back after a niqqud mark was inserted into a controlled field.
  useEffect(() => {
    const pending = caret.current;
    if (!pending) return;
    caret.current = null;
    const field = pending.target === "word" ? wordRef.current : lexiconRef.current;
    field?.focus();
    field?.setSelectionRange(pending.at, pending.at);
  });

  const entries = Object.entries(parseLexicon(lexicon));

  const insertMark = (mark: string) => {
    const which = target.current;
    const field = which === "word" ? wordRef.current : lexiconRef.current;
    if (!field) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const next = field.value.slice(0, start) + mark + field.value.slice(end);
    caret.current = { target: which, at: start + mark.length };
    if (which === "word") setWord(next);
    else setLexicon(next);
  };

  // Playback starts inside the click (a streaming <audio>), or iOS blocks it.
  const listen = (text: string) => {
    const phrase = text.trim();
    if (!phrase) return;
    audio.current?.pause();
    const src = `/api/pronounce?voice=${encodeURIComponent(voiceId)}&text=${encodeURIComponent(phrase)}`;
    const player = new Audio(src);
    audio.current = player;
    setStatus(null);
    setPlaying(phrase);
    player.onended = () => setPlaying(null);
    player.onerror = async () => {
      setPlaying(null);
      const reply = await fetch(src).catch(() => null);
      setStatus({ tone: "bad", text: reply && !reply.ok ? await reply.text() : "לא הצלחנו להשמיע כרגע. נסו שוב." });
    };
    player.play().catch(() => setPlaying(null));
  };

  const add = () => {
    const pointed = word.trim();
    const plain = stripNiqqud(pointed);
    if (!plain || !HAS_NIQQUD.test(pointed)) {
      setStatus({ tone: "bad", text: "הוסיפו ניקוד למילה לפני שמוסיפים אותה למילון." });
      return;
    }
    const rest = lexicon
      .split("\n")
      .filter((line) => line.trim() && stripNiqqud(line.split("=")[0]?.trim() ?? "") !== plain);
    setLexicon([...rest, `${plain} = ${pointed}`].join("\n"));
    setWord("");
    setStatus({ tone: "info", text: `נוסף למילון: ${plain} ← ${pointed}. לחצו „שמירה” למטה כדי שהקריין ישתמש בזה.` });
  };

  const remove = (plain: string) =>
    setLexicon(
      lexicon
        .split("\n")
        .filter((line) => stripNiqqud(line.split("=")[0]?.trim() ?? "") !== plain)
        .join("\n"),
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">
        שם העסק, מונח מקצועי או מילה שהקריין עלול לבטא לא נכון? בודקים כאן איך היא נשמעת בקול של <b>{voiceName}</b> —
        בחינם, לפני שמשלמים על הקראה.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium text-ink-2">
          מילה עם ניקוד
          <input
            ref={wordRef}
            value={word}
            onChange={(event) => setWord(event.target.value)}
            onFocus={() => (target.current = "word")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                listen(word);
              }
            }}
            placeholder="למשל: תַסְרִיט"
            maxLength={40}
            className="field text-lg"
          />
        </label>
        <button type="button" className="btn" disabled={!word.trim() || playing !== null} onClick={() => listen(word)}>
          {playing === word.trim() ? "משמיע…" : "🔊 שמעו"}
        </button>
        <button type="button" className="btn btn-primary" disabled={!word.trim()} onClick={add}>
          הוספה למילון
        </button>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="הוספת סימן ניקוד">
        {NIQQUD_MARKS.map(([mark, name]) => (
          <button
            key={name}
            type="button"
            // Keep focus (and the caret) in the field being edited.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertMark(mark)}
            className="btn btn-ghost px-3 py-1.5 text-sm"
          >
            {name}
          </button>
        ))}
      </div>

      {status && (
        <p role={status.tone === "bad" ? "alert" : "status"} className={`rounded-2xl px-3 py-2 text-sm ${status.tone === "bad" ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>
          {status.text}
        </p>
      )}

      {entries.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="המילים במילון">
          {entries.map(([plain, pointed]) => (
            <li key={plain} className="flex flex-wrap items-center gap-2 rounded-2xl bg-card px-3 py-2">
              <span className="text-ink-2">{plain}</span>
              <span className="text-ink-3" aria-hidden>
                ←
              </span>
              <span className="text-lg font-semibold">{pointed}</span>
              <span className="ms-auto flex gap-1">
                <button type="button" className="btn btn-ghost px-3 py-1 text-sm" disabled={playing !== null} onClick={() => listen(pointed)}>
                  {playing === pointed ? "משמיע…" : "🔊"}
                </button>
                <button type="button" className="btn btn-ghost px-3 py-1 text-sm" onClick={() => remove(plain)} aria-label={`הסרת ${plain} מהמילון`}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-2">טיפים לניקוד שהקריין מבין</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 ps-5 text-ink-2">
          {TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </details>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-2">עריכה ידנית של המילון</summary>
        <p className="mt-2 text-ink-3">שורה לכל מילה: המילה בלי ניקוד = המילה המנוקדת.</p>
        <textarea
          ref={lexiconRef}
          name="lexicon"
          value={lexicon}
          onChange={(event) => setLexicon(event.target.value)}
          onFocus={() => (target.current = "lexicon")}
          rows={3}
          className="field mt-2 leading-7"
        />
      </details>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
