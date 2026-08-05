"use client";
import { useEffect } from "react";

// Registers the app-shell service worker (public/sw.js) for offline basics
// and install-ability. Silently no-ops if the browser doesn't support it
// (older browsers, some in-app webviews) — PWA install is a progressive
// enhancement, not a requirement to use the app.
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err.message);
    });
  }, []);

  return null;
}
