"use client";

import { useActionState } from "react";
import { createProject, type CreateProjectState } from "@/app/app/actions";

export function CreateProjectForm() {
  const [state, action, pending] = useActionState<CreateProjectState, FormData>(createProject, {});
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <label className="flex flex-1 flex-col gap-1.5">
        <span className="sr-only">שם הפרויקט</span>
        <input
          name="name"
          required
          maxLength={80}
          placeholder="שם הפרויקט, למשל: בית קפה נחלת בנימין"
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "create-project-error" : undefined}
          className="field"
        />
        {state.error && (
          <span id="create-project-error" role="alert" className="text-sm text-bad">
            {state.error}
          </span>
        )}
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "יוצר…" : "פרויקט חדש"}
      </button>
    </form>
  );
}
