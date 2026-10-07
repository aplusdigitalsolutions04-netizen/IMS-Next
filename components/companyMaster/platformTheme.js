import { Landmark, ShoppingBag, Store, Link2 } from "lucide-react";

// Icons for the 4 built-in platforms are kept distinct for recognizability;
// any custom platform added later (Settings > Selling Platforms) gets a
// generic globe icon instead — there's no way to know in advance what icon
// a brand-new marketplace "should" have.
export const PLATFORM_ICONS = { GeM: Landmark, Flipkart: ShoppingBag, Amazon: Store, Other: Link2 };
// Matches the colorTheme values selling_platforms rows can have (see
// app/api/admin/platforms/route.js's COLOR_THEMES) — Tailwind class names
// can't be built dynamically from a string at runtime, so each theme needs
// its literal classes listed here.
export const THEME_CLASSES = {
  red: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  orange: { color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
  amber: { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  yellow: { color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200" },
  lime: { color: "text-lime-600", bg: "bg-lime-50", border: "border-lime-200" },
  green: { color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
  emerald: { color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  teal: { color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200" },
  cyan: { color: "text-cyan-600", bg: "bg-cyan-50", border: "border-cyan-200" },
  sky: { color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-200" },
  blue: { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  indigo: { color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" },
  violet: { color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
  purple: { color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  fuchsia: { color: "text-fuchsia-600", bg: "bg-fuchsia-50", border: "border-fuchsia-200" },
  pink: { color: "text-pink-600", bg: "bg-pink-50", border: "border-pink-200" },
  rose: { color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" },
  slate: { color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" },
};
export const DEFAULT_THEME = THEME_CLASSES.violet;
