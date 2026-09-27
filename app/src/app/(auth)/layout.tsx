import Link from "next/link";
import { redirect } from "next/navigation";
import { Mascot } from "@/components/mascot";
import { getSession } from "@/lib/session";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getSession()) redirect("/app");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex flex-col items-center gap-3" aria-label="חזרה לדף הבית">
        <Mascot size={96} />
        <span className="font-round text-xl">reynovation</span>
      </Link>
      {children}
    </main>
  );
}
