import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "reynovation · סרטוני פרומו בעברית",
    short_name: "reynovation",
    description: "מספרים על העסק בעברית, ומקבלים סרטון פרומו עם קריינות מדויקת.",
    lang: "he",
    dir: "rtl",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#e6defb",
    theme_color: "#e6defb",
    categories: ["business", "productivity", "photo"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
