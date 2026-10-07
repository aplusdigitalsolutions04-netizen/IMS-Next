"use client";
import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, Check, RotateCcw } from "lucide-react";

// "Which filters do I want in the toolbar" picker. Ticking a filter puts its
// dropdown in the toolbar; un-ticking removes it (the caller also resets that
// filter's value so nothing stays filtered invisibly).
//   filters   [{ key, label, active }]   `active` = the filter currently narrows the list
//   shown     Set of keys currently shown in the toolbar
export default function FilterPicker({ filters, shown, onToggle, onShowAll, onClearValues }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const activeCount = filters.filter((f) => f.active).length;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${open || activeCount ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
        title="Choose which filters to use"
      >
        <SlidersHorizontal size={16} />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">{activeCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-2">
          <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Show these filters</p>
          {filters.map((f) => {
            const on = shown.has(f.key);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onToggle(f.key)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 text-left"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 bg-white"}`}>
                  {on && <Check size={11} strokeWidth={3.5} />}
                </span>
                <span className="flex-1 text-sm font-medium text-slate-700">{f.label}</span>
                {f.active && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">in use</span>}
              </button>
            );
          })}
          <div className="mt-1 pt-2 border-t border-slate-100 flex items-center justify-between px-2 pb-1 text-xs font-bold">
            <button type="button" onClick={onShowAll} className="text-indigo-600 hover:text-indigo-800">Show all</button>
            <button
              type="button"
              onClick={onClearValues}
              disabled={!activeCount}
              className="flex items-center gap-1 text-rose-500 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw size={11} /> Reset filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
