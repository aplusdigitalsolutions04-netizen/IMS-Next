"use client";
import React, { useEffect, useState } from "react";
import { ListChecks, AlertTriangle, Clock, ChevronRight, CheckCircle2 } from "lucide-react";
import { tasksService } from "@/lib/services/tasksService";

const fmtDeadline = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

// Small "what's on my plate" card for the dashboard — top upcoming/overdue
// tasks assigned to the current user. Full detail and every action (status
// change, assigning, deleting) lives on the Tasks page; this is read-mostly.
// Always shown once loaded (with an "all caught up" state), so it's clear
// the card exists even when nothing is pending.
export default function MyTasksWidget({ onNavigate }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    tasksService.getTasks("mine")
      .then((data) => setTasks(data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 h-[88px] animate-pulse" />;
  }
  if (failed) return null;

  // isDone comes from the Status master's "terminal" flag (not a hardcoded "Done").
  const open = tasks.filter((t) => !t.isDone);
  const overdueCount = open.filter((t) => t.effectiveStatus === "Overdue").length;
  const shown = open.slice(0, 5);

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <ListChecks size={14} className="text-indigo-500" /> My Tasks
          {open.length > 0 && (
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5 normal-case tracking-normal">{open.length} pending</span>
          )}
          {overdueCount > 0 && (
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-100 rounded-full px-2 py-0.5 normal-case tracking-normal">{overdueCount} overdue</span>
          )}
        </h3>
        <button onClick={() => onNavigate("tasks")} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-0.5">
          View all <ChevronRight size={12} />
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-emerald-50 border border-emerald-100 text-xs font-semibold text-emerald-700">
          <CheckCircle2 size={14} className="shrink-0" /> You&apos;re all caught up — no pending tasks.
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((t) => {
            const overdue = t.effectiveStatus === "Overdue";
            return (
              <button
                key={t.guid}
                onClick={() => onNavigate("tasks")}
                className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold border ${overdue ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-slate-50 border-slate-200 text-slate-700"} hover:opacity-80 transition-opacity`}
              >
                <span className="truncate flex items-center gap-1.5">
                  {overdue ? <AlertTriangle size={12} className="shrink-0" /> : <Clock size={12} className="shrink-0 text-slate-400" />}
                  {t.title}
                </span>
                {t.deadline && <span className="shrink-0">{fmtDeadline(t.deadline)}</span>}
              </button>
            );
          })}
          {open.length > shown.length && (
            <button onClick={() => onNavigate("tasks")} className="w-full text-center text-[11px] font-bold text-slate-400 hover:text-indigo-600 pt-1">
              +{open.length - shown.length} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
