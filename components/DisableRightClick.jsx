"use client";
import { useEffect } from "react";
import { getStoredUser } from "@/lib/client/auth";

// Blocks the right-click context menu app-wide, except for Admin. The role
// is re-read from sessionStorage on every right-click (not just once on
// mount) so this stays correct across login/logout without needing a full
// page reload — RootLayout (and this component with it) never remounts on
// client-side navigation, so a mount-only check would keep using whatever
// role was active the first time the app loaded.
export default function DisableRightClick() {
  useEffect(() => {
    // Only on the live/production build — right-click (Inspect Element etc.)
    // stays available in local dev so nobody loses that while working on the app.
    if (process.env.NODE_ENV !== "production") return;

    const handleContextMenu = (e) => {
      const user = getStoredUser();
      if (user?.role === "Admin") return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  return null;
}
