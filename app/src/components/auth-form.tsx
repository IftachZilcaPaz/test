"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "login" | "signup";

const COPY = {
  login: { title: "שמחים שחזרתם", submit: "התחברות", switchText: "אין לכם חשבון?", switchHref: "/signup", switchLabel: "הרשמה" },
  signup: { title: "יוצרים חשבון", submit: "יצירת חשבון", switchText: "כבר רשומים?", switchHref: "/login", switchLabel: "התחברות" },
} as const;

// Better Auth error codes → plain Hebrew.
const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "האימייל או הסיסמה לא נכונים.",
  USER_ALREADY_EXISTS: "כבר יש חשבון עם האימייל הזה. נסו להתחבר.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "כבר יש חשבון עם האימייל הזה. נסו להתחבר.",
  PASSWORD_TOO_SHORT: "הסיסמה קצרה מדי. צריך לפחות 8 תווים.",
  INVALID_EMAIL: "כתובת האימייל לא תקינה.",
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const copy = COPY[mode];
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();

    setPending(true);
    setError(null);
    const { error: authError } =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
    setPending(false);

    if (authError) {
      setError((authError.code && ERRORS[authError.code]) ?? "משהו השתבש. נסו שוב בעוד רגע.");
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="clay flex w-full max-w-md flex-col gap-4 p-8" noValidate={false}>
      <h1 className="text-3xl">{copy.title}</h1>
      {mode === "signup" && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
          איך קוראים לכם
          <input name="name" required autoComplete="name" className="field" />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
        אימייל
        <input name="email" type="email" required autoComplete="email" dir="ltr" className="field text-start" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
        סיסמה
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          dir="ltr"
          className="field text-start"
        />
        {mode === "signup" && <span className="text-xs text-ink-3">לפחות 8 תווים</span>}
      </label>
      {error && (
        <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "רגע…" : copy.submit}
      </button>
      <p className="text-sm text-ink-2">
        {copy.switchText}{" "}
        <Link href={copy.switchHref} className="font-semibold text-accent underline-offset-4 hover:underline">
          {copy.switchLabel}
        </Link>
      </p>
    </form>
  );
}
