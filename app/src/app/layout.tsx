import type { Metadata, Viewport } from "next";
import { Rubik, Varela_Round } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const rubik = Rubik({ variable: "--font-rubik", subsets: ["hebrew", "latin"] });
const varela = Varela_Round({ variable: "--font-varela", weight: "400", subsets: ["hebrew", "latin"] });

export const metadata: Metadata = {
  title: "reynovation · סרטוני פרומו בעברית",
  description: "מספרים על העסק בעברית, ומקבלים סרטון פרומו עם קריינות מדויקת, בלי לדעת עריכה.",
  applicationName: "reynovation",
  appleWebApp: { capable: true, title: "reynovation", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#e6defb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} ${varela.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
