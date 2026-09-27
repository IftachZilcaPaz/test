import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { CreateProjectForm } from "@/components/create-project-form";
import { db } from "@/db/client";
import { project } from "@/db/schema";
import { STEPS } from "@/lib/brand";
import { requireUser } from "@/lib/session";
import { deleteProject } from "./actions";

export const metadata: Metadata = { title: "הפרויקטים שלי · reynovation" };

const STEP_TITLE = Object.fromEntries(STEPS.map((step) => [step.key, step.title])) as Record<string, string>;
const dateFormat = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" });

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await db
    .select()
    .from(project)
    .where(eq(project.userId, user.id))
    .orderBy(desc(project.updatedAt));

  return (
    <div className="flex flex-col gap-6">
      <section className="clay flex flex-col gap-4 p-6 md:p-8">
        <div>
          <h1 className="text-3xl">הפרויקטים שלי</h1>
          <p className="text-ink-2">כל פרויקט הוא סרטון אחד. מתחילים משם — אפשר לשנות אחר כך.</p>
        </div>
        <CreateProjectForm />
      </section>

      {projects.length === 0 ? (
        <section className="clay flex flex-col items-center gap-2 p-10 text-center">
          <h2 className="text-2xl">עוד אין פרויקטים</h2>
          <p className="max-w-[40ch] text-ink-2">
            כתבו למעלה שם לפרויקט הראשון — למשל שם העסק — ונתחיל לספר עליו.
          </p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {projects.map((item) => (
            <li key={item.id} className="clay flex flex-col gap-3 p-6">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/app/projects/${item.id}`}
                  className="min-w-0 font-round text-xl hover:text-accent"
                  title={item.name}
                >
                  <span className="block truncate">{item.name}</span>
                </Link>
                <span className="shrink-0 rounded-full bg-tint-1 px-3 py-1 text-xs font-semibold text-accent">
                  {STEP_TITLE[item.status] ?? item.status}
                </span>
              </div>
              <p className="text-sm text-ink-3">עודכן {dateFormat.format(item.updatedAt)}</p>
              <div className="flex gap-2">
                <Link href={`/app/projects/${item.id}`} className="btn">
                  המשך
                </Link>
                <form action={deleteProject}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="btn btn-ghost" aria-label={`מחיקת ${item.name}`}>
                    מחיקה
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
