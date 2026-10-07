"use client";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen, Search, X, Lightbulb, ChevronRight, ChevronLeft, ZoomIn, ShieldCheck, ArrowRight, Image as ImageIcon, ListChecks,
  LayoutDashboard, ShoppingCart, Truck, Package, RotateCcw, PackagePlus, Boxes, ArrowLeftRight, Layers, FileText, Receipt,
  Users, Building2, CheckSquare, Wrench, BarChart3, Mail, Settings2, UserCog, Activity,
} from "lucide-react";
import { GUIDE_GROUPS, GUIDES } from "./guideContent";

const ICONS = {
  LayoutDashboard, ShoppingCart, Truck, Package, RotateCcw, PackagePlus, Boxes, ArrowLeftRight, Layers, FileText, Receipt,
  Users, Building2, CheckSquare, Wrench, BarChart3, Mail, Settings2, UserCog, Activity, ShieldCheck,
};

// Tailwind needs full class names, so each colour is spelled out.
const COLORS = {
  indigo: { chip: "bg-indigo-50 text-indigo-600", bar: "from-indigo-500 to-violet-500", text: "text-indigo-600", ring: "hover:border-indigo-300" },
  violet: { chip: "bg-violet-50 text-violet-600", bar: "from-violet-500 to-fuchsia-500", text: "text-violet-600", ring: "hover:border-violet-300" },
  emerald: { chip: "bg-emerald-50 text-emerald-600", bar: "from-emerald-500 to-teal-500", text: "text-emerald-600", ring: "hover:border-emerald-300" },
  amber: { chip: "bg-amber-50 text-amber-600", bar: "from-amber-500 to-orange-500", text: "text-amber-600", ring: "hover:border-amber-300" },
  sky: { chip: "bg-sky-50 text-sky-600", bar: "from-sky-500 to-blue-500", text: "text-sky-600", ring: "hover:border-sky-300" },
  rose: { chip: "bg-rose-50 text-rose-600", bar: "from-rose-500 to-pink-500", text: "text-rose-600", ring: "hover:border-rose-300" },
  slate: { chip: "bg-slate-100 text-slate-600", bar: "from-slate-500 to-slate-700", text: "text-slate-600", ring: "hover:border-slate-300" },
};

const groupOf = (id) => GUIDE_GROUPS.find((g) => g.id === id) || GUIDE_GROUPS[0];

export default function UserGuide() {
  const router = useRouter();
  const params = useSearchParams();
  const moduleId = params.get("m");
  const current = GUIDES.find((g) => g.id === moduleId) || null;
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(null);

  const open = (id) => {
    router.push(id ? `/userGuide?m=${id}` : "/userGuide");
    if (typeof window !== "undefined") document.getElementById("guide-top")?.scrollIntoView({ block: "start" });
  };

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return GUIDES;
    return GUIDES.filter((g) =>
      [g.title, g.summary, groupOf(g.group).label, ...g.steps.flatMap((s) => [s.t, s.d]), ...g.tips].join(" ").toLowerCase().includes(q)
    );
  }, [q]);

  return (
    <div id="guide-top" className="w-full">
      {!current ? (
        <Landing query={query} setQuery={setQuery} matches={matches} open={open} />
      ) : (
        <Detail guide={current} open={open} setZoom={setZoom} />
      )}

      {zoom && (
        <div className="fixed inset-0 z-[100] bg-slate-900/85 flex flex-col items-center justify-center p-4 gap-3" onClick={() => setZoom(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white text-slate-700 shadow" onClick={() => setZoom(null)} aria-label="Close"><X size={18} /></button>
          <img src={`/guide/${zoom.src}.jpg`} alt={zoom.caption} className="max-w-full max-h-[85vh] rounded-lg shadow-2xl bg-white" onClick={(e) => e.stopPropagation()} />
          <p className="text-sm text-white/90">{zoom.caption}</p>
        </div>
      )}
    </div>
  );
}

function Landing({ query, setQuery, matches, open }) {
  const grouped = GUIDE_GROUPS.map((gr) => ({ gr, items: matches.filter((m) => m.group === gr.id) })).filter((x) => x.items.length > 0);
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 px-6 py-8 md:px-10 md:py-10 text-white shadow-lg">
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/10" />
        <div className="absolute right-24 -bottom-16 w-48 h-48 rounded-full bg-white/10" />
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider bg-white/15 rounded-full px-3 py-1 mb-3"><BookOpen size={13} /> User Guide</div>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">How can we help you today?</h1>
          <p className="text-sm md:text-base text-indigo-100 mt-2">Step-by-step guides with screenshots for every part of the Inventory Management system.</p>
          <div className="relative mt-5">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search guides, e.g. stock in, roles, dispatch..."
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-white text-slate-800 text-sm outline-none shadow-md focus:ring-4 focus:ring-white/30"
            />
          </div>
        </div>
      </div>

      {grouped.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">No guides found for “{query}”.</div>
      )}

      {grouped.map(({ gr, items }) => {
        const c = COLORS[gr.color];
        return (
          <section key={gr.id}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
              <span className={`inline-block w-6 h-1 rounded-full bg-gradient-to-r ${c.bar}`} /> {gr.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((g) => {
                const Icon = ICONS[g.icon] || BookOpen;
                return (
                  <button
                    key={g.id}
                    onClick={() => open(g.id)}
                    className={`group text-left bg-white rounded-2xl border border-slate-200 ${c.ring} shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col`}
                  >
                    <div className="relative h-32 bg-slate-100 overflow-hidden border-b border-slate-100">
                      <img src={`/guide/${g.images[0].src}.jpg`} alt="" loading="lazy" className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" />
                      <div className={`absolute top-3 left-3 p-2 rounded-xl shadow-sm bg-white ${c.text}`}><Icon size={18} /></div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="text-base font-bold text-slate-800">{g.title}</h3>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{g.summary}</p>
                      <div className="mt-auto pt-3 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-3">
                          <span className="flex items-center gap-1"><ListChecks size={12} /> {g.steps.length} steps</span>
                          <span className="flex items-center gap-1"><ImageIcon size={12} /> {g.images.length}</span>
                        </span>
                        <span className={`flex items-center gap-1 font-semibold ${c.text} opacity-0 group-hover:opacity-100 transition-opacity`}>Read <ArrowRight size={13} /></span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Detail({ guide, open, setZoom }) {
  const gr = groupOf(guide.group);
  const c = COLORS[gr.color];
  const Icon = ICONS[guide.icon] || BookOpen;
  const index = GUIDES.findIndex((g) => g.id === guide.id);
  const prev = GUIDES[index - 1];
  const next = GUIDES[index + 1];
  const siblings = GUIDES.filter((g) => g.group === guide.group);

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
        <Link href="/userGuide" className="hover:text-indigo-600 font-medium">User Guide</Link>
        <ChevronRight size={12} />
        <span>{gr.label}</span>
        <ChevronRight size={12} />
        <span className="text-slate-800 font-semibold">{guide.title}</span>
      </nav>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className={`h-1.5 bg-gradient-to-r ${c.bar}`} />
        <div className="p-5 md:p-6 flex items-start gap-4">
          <div className={`p-3 rounded-2xl ${c.chip} shrink-0`}><Icon size={26} /></div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-800">{guide.title}</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">{guide.summary}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <section className="space-y-4">
            {guide.images.map((im) => (
              <figure key={im.src} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button type="button" onClick={() => setZoom(im)} className="group relative block w-full cursor-zoom-in text-left">
                  <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"><ZoomIn size={12} /> Click to enlarge</span>
                  </div>
                  <img src={`/guide/${im.src}.jpg`} alt={im.caption} className="w-full h-auto block" loading="lazy" />
                </button>
                <figcaption className="px-4 py-2.5 text-xs text-slate-500 border-t border-slate-100">{im.caption}</figcaption>
              </figure>
            ))}
            <p className="text-[11px] text-slate-400">Business data in screenshots is blurred for privacy.</p>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6">
            <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2"><ListChecks size={17} className={c.text} /> Step by step</h2>
            <ol className="relative">
              {guide.steps.map((s, n) => (
                <li key={n} className="relative flex gap-4 pb-6 last:pb-0">
                  {n < guide.steps.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" />}
                  <span className={`relative w-8 h-8 rounded-full bg-gradient-to-br ${c.bar} text-white text-sm font-bold flex items-center justify-center shrink-0 shadow-sm`}>{n + 1}</span>
                  <div className="pt-0.5 min-w-0">
                    <h3 className="text-sm font-bold text-slate-800">{s.t}</h3>
                    <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex items-center justify-between gap-3">
            {prev ? (
              <button onClick={() => open(prev.id)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 shadow-sm">
                <ChevronLeft size={15} /> <span className="text-left"><span className="block text-[10px] uppercase tracking-wider text-slate-400">Previous</span>{prev.title}</span>
              </button>
            ) : <span />}
            {next && (
              <button onClick={() => open(next.id)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-sm">
                <span className="text-right"><span className="block text-[10px] uppercase tracking-wider text-indigo-200">Next</span>{next.title}</span> <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-0">
          {guide.permission && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5"><ShieldCheck size={14} /> Access</h3>
              <p className="text-sm text-slate-600">{guide.permission}</p>
            </div>
          )}
          {guide.tips.length > 0 && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-2 flex items-center gap-1.5"><Lightbulb size={14} /> Tips</h3>
              <ul className="space-y-2">
                {guide.tips.map((t, n) => <li key={n} className="text-sm text-amber-900 leading-relaxed">{t}</li>)}
              </ul>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-2 pt-2 pb-1">In {gr.label}</h3>
            {siblings.map((g) => (
              <button
                key={g.id}
                onClick={() => open(g.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${g.id === guide.id ? `${c.chip} font-semibold` : "text-slate-600 hover:bg-slate-50"}`}
              >
                {g.title}
              </button>
            ))}
            <button onClick={() => open(null)} className="w-full text-left px-3 py-2 mt-1 rounded-lg text-sm text-indigo-600 font-semibold hover:bg-indigo-50 border-t border-slate-100">
              ← All guides
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
