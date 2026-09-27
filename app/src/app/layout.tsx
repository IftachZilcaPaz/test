import type { Metadata } from "next";
import { Rubik, Varela_Round } from "next/font/google";
import "./globals.css";

const rubik = Rubik({ variable: "--font-rubik", subsets: ["hebrew", "latin"] });
const varela = Varela_Round({ variable: "--font-varela", weight: "400", subsets: ["hebrew", "latin"] });

export const metadata: Metadata = {
  title: "reynovation · סרטוני פרומו בעברית",
  description: "מספרים על העסק בעברית, ומקבלים סרטון פרומו עם קריינות מדויקת — בלי לדעת עריכה.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} ${varela.variable}`}>
      <body>{children}</body>
    </html>
  );
}
