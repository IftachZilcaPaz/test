"use client";

import { useEffect } from "react";

/** Registers the PWA service worker in production builds only (dev caching gets in the way). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Installability is a progressive enhancement; the app works without it.
    });
  }, []);
  return null;
}
