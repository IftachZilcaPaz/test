"use client";

import { useActionState, useState } from "react";
import type { BriefState } from "@/app/app/projects/[id]/actions";
import { PronunciationLab } from "@/components/pronunciation-lab";
import { UploadsManager, type UploadView } from "@/components/uploads-manager";
import type { VideoStyle } from "@/db/schema";
import { DURATIONS, TONES, wordTarget } from "@/lib/script/hebrew";

export type BriefValues = {
  business: string;
  about: string;
  audience: string;
  callToAction: string;
  tone: string;
  seconds: number;
  lexicon: string;
};

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
      {label}
      {children}
      {error ? (
        <span role="alert" className="text-sm font-normal text-bad">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs font-normal text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

export function BriefForm({
  action,
  values,
  voice,
  projectId,
  style: savedStyle,
  uploads,
}: {
  action: (state: BriefState, formData: FormData) => Promise<BriefState>;
  values: BriefValues;
  projectId: string;
  style: VideoStyle;
  uploads: UploadView[];
  /** The voice pronunciation checks are read in: the project's chosen voice, or the default. */
  voice: { id: string; name: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [style, setStyle] = useState(savedStyle);
  const errors = state.errors ?? {};
  // After a failed save show what was typed; after a successful one the server props are fresh.
  const echo = state.values;
  const v = {
    business: echo?.business ?? values.business,
    about: echo?.about ?? values.about,
    audience: echo?.audience ?? values.audience,
    callToAction: echo?.callToAction ?? values.callToAction,
    tone: echo?.tone ?? values.tone,
    seconds: Number(echo?.seconds ?? values.seconds),
    lexicon: echo?.lexicon ?? values.lexicon,
  };

  return (
    <form id="brief" action={formAction} className="clay flex scroll-mt-6 flex-col gap-5 p-6 md:p-8">
      <div>
        <h2 className="text-2xl">1 · העסק שלי</h2>
        <p className="text-ink-2">בעברית פשוטה, כמו שהייתם מספרים לחבר. מזה נכתוב את התסריט.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="שם העסק" error={errors.business}>
          <input name="business" defaultValue={v.business} required maxLength={80} className="field" />
        </Field>
        <Field label="למי הסרטון מיועד" error={errors.audience} hint="למשל: הורים לילדים קטנים בתל אביב">
          <input name="audience" defaultValue={v.audience} maxLength={300} className="field" />
        </Field>
        <div className="md:col-span-2">
          <Field label="מה העסק עושה" error={errors.about} hint="מה מקבלים, מה מיוחד בכם, ואיזו בעיה אתם פותרים">
            <textarea name="about" defaultValue={v.about} required rows={3} maxLength={1200} className="field min-h-24 leading-7" />
          </Field>
        </div>
        <Field label="מה הצופה צריך לעשות בסוף" error={errors.callToAction} hint="למשל: להוריד את האפליקציה, לקבוע שיחה">
          <input name="callToAction" defaultValue={v.callToAction} maxLength={200} className="field" />
        </Field>
        <Field label="טון" error={errors.tone}>
          <select name="tone" defaultValue={v.tone} className="field">
            {TONES.map((tone) => (
              <option key={tone.value} value={tone.value}>
                {tone.title}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-ink-2">אורך הסרטון</legend>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((seconds) => (
              <label key={seconds} className="cursor-pointer">
                <input type="radio" name="seconds" value={seconds} defaultChecked={v.seconds === seconds} className="peer sr-only" />
                <span className="btn btn-ghost peer-checked:bg-tint-1 peer-checked:text-accent peer-focus-visible:outline-2">
                  {seconds} שניות · {wordTarget(seconds)} מילים
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset className="well flex flex-col gap-3 rounded-3xl p-4">
        <legend className="sr-only">סגנון הסרטון</legend>
        <span className="font-semibold text-ink">סגנון הסרטון</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["character", "סצנות עם דמות אחת", "אותו אדם ואותו מקום לאורך כל הסרטון, כמו סרט קצר"],
              ["screens", "סצנות + התמונות שלכם", "הדמות, ובין לבין צילומי המסך או התמונות מהעסק שלכם"],
              ["presenter", "קריינית מול המצלמה", "אישה אחת אומרת את הקריינות שלכם כמו סרטון של יוצרת תוכן, ואפשר לשלב את התמונות שלכם"],
            ] as const
          ).map(([value, title, hint]) => (
            <label key={value} className="cursor-pointer">
              <input type="radio" name="style" value={value} checked={style === value} onChange={() => setStyle(value)} className="peer sr-only" />
              <span className="flex h-full flex-col gap-1 rounded-2xl bg-card px-4 py-3 text-sm ring-accent peer-checked:ring-4 peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                <span className="font-semibold">{title}</span>
                <span className="text-ink-2">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {style === "presenter" && (
          <p className="text-sm text-ink-3">צילומי מסך או תמונות — לא חובה. אם תעלו, הסרטון יקפוץ אליהם בזמן שהקריינית מדברת עליהם.</p>
        )}
        {style !== "character" && <UploadsManager projectId={projectId} uploads={uploads} />}
      </fieldset>

      <details open className="well rounded-3xl p-4">
        <summary className="cursor-pointer font-semibold text-ink">איך הקריין יגיד מילים מיוחדות (המילון שלכם)</summary>
        <div className="mt-3">
          <PronunciationLab initialLexicon={v.lexicon} voiceId={voice.id} voiceName={voice.name} error={errors.lexicon} />
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "שומר…" : "שמירה"}
        </button>
        {state.ok && !pending && (
          <span role="status" className="text-sm font-semibold text-good">
            נשמר ✓
          </span>
        )}
      </div>
    </form>
  );
}
