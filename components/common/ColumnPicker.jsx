"use client";
import { useState } from "react";
import { Columns3, X } from "lucide-react";

// Generic "which columns should this table show" picker — pass the full
// column list, the currently-visible Set (of column keys), and toggle/
// select-all/clear-all callbacks. Selection lives in the caller's own state
// (not persisted here), same as components/contracts/ContractsList.jsx's
// original inline version this was extracted from.
export default function ColumnPicker({ columns, visibleCols, onToggle, onSelectAll, onClearAll }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        title={`Columns (${visibleCols.size})`}
      >
        <Columns3 size={16} />
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Columns3 size={18} className="text-indigo-600" /> Choose Columns
              </h3>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 shrink-0 text-xs font-bold">
              <button onClick={onSelectAll} className="text-indigo-600 hover:text-indigo-800">Select All</button>
              <span className="text-slate-300">|</span>
              <button onClick={onClearAll} className="text-rose-500 hover:text-rose-700">Clear All</button>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-3 gap-1">
              {columns.map((col) => (
                <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => onToggle(col.key)} className="rounded accent-indigo-600" />
                  {col.label}
                </label>
              ))}
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setOpen(false)}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
