"use client";
import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZES = [10, 25, 50, 100];

// Client-side pagination bar shared by the Contract Groups tables.
export default function Pagination({ total, page, pageSize, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = "p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white text-xs font-semibold text-slate-500">
      <div className="flex items-center gap-2">
        <span>Rows per page</span>
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none">
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span>{from}–{to} of {total}</span>
        <div className="flex items-center gap-1">
          <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} title="Previous"><ChevronLeft size={15} /></button>
          <span className="px-2">Page {page} / {pages}</span>
          <button className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} title="Next"><ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}
