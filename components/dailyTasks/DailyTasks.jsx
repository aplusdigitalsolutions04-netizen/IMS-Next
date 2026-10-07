"use client";
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Swal from "sweetalert2";
import { ClipboardList, Plus, Loader2, Camera, Trash2, Image as ImageIcon, Clock, Settings2, X, Columns3 } from "lucide-react";
import { dailyTasksService } from "@/lib/services/dailyTasksService";
import { tasksService } from "@/lib/services/tasksService";
import { toBlob } from "html-to-image";

const pad = (n) => String(n).padStart(2, "0");
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayYmd = () => toYmd(new Date());

// Quick date-range filters. "Last 7 Days" is today and the 6 days before it;
// "Last 1 Month" runs from the same date last month through today.
const PRESETS = [
  { key: "today", label: "Today", range: () => ({ from: todayYmd(), to: todayYmd() }) },
  { key: "yesterday", label: "Yesterday", range: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { from: toYmd(d), to: toYmd(d) }; } },
  { key: "week", label: "Last 7 Days", range: () => { const d = new Date(); d.setDate(d.getDate() - 6); return { from: toYmd(d), to: todayYmd() }; } },
  { key: "month", label: "Last 1 Month", range: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return { from: toYmd(d), to: todayYmd() }; } },
];

const fmtDateTime = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const fmtDay = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return isNaN(d.getTime()) ? ymd : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const hexToRgba = (hex, alpha) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// One table cell for an admin-added column. `onCommit` fires with the new
// value (blur for text/number, change for date/dropdown). Read-only when the
// row isn't the viewer's own.
function CustomCell({ col, value, editable, onCommit }) {
  const v = value ?? "";
  const cls = "w-full text-xs text-slate-700 border border-transparent hover:border-slate-200 focus:border-indigo-300 focus:bg-white rounded-lg px-1.5 py-1 outline-none bg-transparent";
  if (!editable) return <span className="text-xs text-slate-600">{v === "" ? "—" : col.type === "date" ? fmtDay(v) : v}</span>;
  if (col.type === "dropdown") {
    return (
      <select value={v} onChange={(e) => onCommit(e.target.value)} className={cls}>
        <option value="">—</option>
        {(col.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.type === "date") return <input type="date" value={v} onChange={(e) => onCommit(e.target.value)} className={cls} />;
  return (
    <input
      key={v} type={col.type === "number" ? "number" : "text"} defaultValue={v}
      onBlur={(e) => { if (e.target.value !== v) onCommit(e.target.value); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
      className={cls}
    />
  );
}

let draftCounter = 0;
const newDraft = (taskDate) => ({ key: `draft-${++draftCounter}`, taskDate, task: "", status: null, customValues: {} });

export default function DailyTasks({ currentUser }) {
  const isAdmin = currentUser?.role === "Admin";
  const [from, setFrom] = useState(todayYmd());
  const [to, setTo] = useState(todayYmd());
  const [userId, setUserId] = useState("all");
  const [items, setItems] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [viewAll, setViewAll] = useState(false);
  const [myId, setMyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [capturingId, setCapturingId] = useState(null);
  const focusKey = useRef(null);
  const pageRef = useRef(null);
  const [snapshot, setSnapshot] = useState(false); // true only while a screenshot is being drawn
  const [columns, setColumns] = useState([]); // extra table columns an admin added
  const [canManageSetup, setCanManageSetup] = useState(false);
  const [canManageStatuses, setCanManageStatuses] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [showStatuses, setShowStatuses] = useState(false);
  const [allStatuses, setAllStatuses] = useState([]); // incl. inactive, for the manager
  const [newCol, setNewCol] = useState({ label: "", type: "text", options: "" });
  const [newStatus, setNewStatus] = useState({ name: "", color: "#64748b" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dailyTasksService.list({ from, to, userId: viewAll ? userId : undefined });
      setItems(res.data || []);
      setStatuses(res.statuses || []);
      setColumns(res.columns || []);
      setCanManageSetup(!!res.canManageSetup);
      setCanManageStatuses(!!res.canManageStatuses);
      setUsers(res.users || []);
      setViewAll(!!res.viewAll);
      setMyId(res.currentUserId);
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to load daily tasks", "error");
    } finally {
      setLoading(false);
    }
  }, [from, to, userId, viewAll]);

  useEffect(() => { load(); }, [load]);

  const defaultStatus = useMemo(() => (statuses.find((s) => s.isDefault) || statuses[0])?.value || "", [statuses]);
  const terminal = useMemo(() => new Set(statuses.filter((s) => s.isTerminal).map((s) => s.value)), [statuses]);
  const colorOf = (value) => statuses.find((s) => s.value === value)?.color || null;
  const canEditRow = (row) => row.userGuid === myId || isAdmin;

  const selectStyle = (value) => {
    const c = colorOf(value);
    return c ? { color: c, borderColor: hexToRgba(c, 0.5), backgroundColor: hexToRgba(c, 0.1) } : undefined;
  };

  // ── rows ──
  const addDraft = () => {
    const d = newDraft(todayYmd());
    focusKey.current = d.key;
    setDrafts((prev) => [...prev, d]);
  };

  const setDraftField = (key, patch) => setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const committing = useRef(new Set()); // Enter + the blur that follows must not save the same row twice
  const commitDraft = async (draft, addNext = false) => {
    const task = draft.task.trim();
    if (!task || committing.current.has(draft.key)) return;
    committing.current.add(draft.key);
    try {
      const row = await dailyTasksService.create({ task, taskDate: draft.taskDate, status: draft.status || defaultStatus, customValues: draft.customValues });
      setDrafts((prev) => prev.filter((d) => d.key !== draft.key));
      // A row you just added must never seem to vanish: if it falls outside the
      // date range (or, for Admin, the user filter) currently being viewed,
      // widen the view to include it instead of hiding it.
      const inRange = row.taskDate >= from && row.taskDate <= to;
      const inUser = !viewAll || userId === "all" || userId === row.userGuid;
      if (inRange && inUser) {
        setItems((prev) => [...prev, { ...row, userName: currentUser?.fullName || currentUser?.username }]);
      } else {
        if (!inRange) { setFrom(row.taskDate < from ? row.taskDate : from); setTo(row.taskDate > to ? row.taskDate : to); }
        if (!inUser) setUserId("all");
      }
      if (addNext) addDraft();
    } catch (e) {
      committing.current.delete(draft.key);
      Swal.fire("Error", e.response?.data?.message || "Failed to add task", "error");
    }
  };

  const patchRow = async (row, patch) => {
    const before = items;
    setItems((prev) => prev.map((r) => (r.guid === row.guid
      ? { ...r, ...patch, ...(patch.customValues ? { customValues: { ...r.customValues, ...patch.customValues } } : {}) }
      : r)));
    try {
      await dailyTasksService.update(row.guid, patch);
    } catch (e) {
      setItems(before);
      Swal.fire("Error", e.response?.data?.message || "Failed to save", "error");
    }
  };

  const deleteRow = async (row) => {
    const r = await Swal.fire({ title: "Delete this task?", text: row.task, icon: "warning", showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#e11d48" });
    if (!r.isConfirmed) return;
    try {
      await dailyTasksService.remove(row.guid);
      setItems((prev) => prev.filter((x) => x.guid !== row.guid));
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to delete", "error");
    }
  };

  // ── screenshot: renders the Daily Tasks PAGE (title, filters and the table with
  // this user's rows for the period being viewed) to an image — not the browser
  // window, sidebar or other tabs, and no screen-share prompt. The server then
  // stamps the user's name + date/time on it. While it's being drawn the
  // table switches to a read-only view (plain text instead of input boxes,
  // no Screenshot/Del columns) so the picture is clean. ──
  const takeScreenshot = async (row) => {
    setCapturingId(row.guid);
    setSnapshot(true);
    try {
      // wait for React to paint the read-only version
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 150)); // let layout settle at its final size
      const node = pageRef.current;
      if (!node) throw new Error("Nothing to capture");
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
        // leave out unsaved draft rows and every other user's rows/group header
        filter: (n) => {
          const d = n.dataset;
          if (d?.draft) return false;
          if (d?.userGuid && d.userGuid !== row.userGuid) return false;
          return true;
        },
      });
      if (!blob) throw new Error("Could not capture the table");
      const updated = await dailyTasksService.uploadScreenshot(row.guid, blob);
      setItems((prev) => prev.map((r) => (r.guid === row.guid ? { ...r, ...updated } : r)));
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || e.message || "Screenshot failed", "error");
    } finally {
      setSnapshot(false);
      setCapturingId(null);
    }
  };

  // ── manage statuses (same shared list Tasks uses) ──
  const refreshStatuses = async () => {
    setAllStatuses(await tasksService.getStatuses());
    load();
  };
  const openStatuses = async () => {
    try {
      setAllStatuses(await tasksService.getStatuses());
      setShowStatuses(true);
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Could not load statuses", "error");
    }
  };
  const statusCall = async (fn) => {
    try { await fn(); await refreshStatuses(); }
    catch (e) { Swal.fire("Error", e.response?.data?.message || "Failed", "error"); refreshStatuses().catch(() => {}); }
  };
  const addStatus = () => {
    const name = newStatus.name.trim();
    if (!name) return;
    statusCall(async () => { await tasksService.addStatus(name, newStatus.color); setNewStatus({ name: "", color: "#64748b" }); });
  };
  const deleteStatus = async (s) => {
    const r = await Swal.fire({ title: `Delete "${s.label}"?`, icon: "warning", showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#e11d48" });
    if (r.isConfirmed) statusCall(() => tasksService.deleteStatusOption(s.guid));
  };

  // ── manage columns ──
  const columnCall = async (fn) => {
    try { await fn(); await load(); }
    catch (e) { Swal.fire("Error", e.response?.data?.message || "Failed", "error"); load(); }
  };
  const addColumn = () => {
    const label = newCol.label.trim();
    if (!label) return;
    columnCall(async () => {
      await dailyTasksService.addColumn({ label, type: newCol.type, options: newCol.type === "dropdown" ? newCol.options.split(",") : undefined });
      setNewCol({ label: "", type: "text", options: "" });
    });
  };
  const deleteColumn = async (col) => {
    const r = await Swal.fire({ title: `Delete column "${col.label}"?`, text: "The values entered in it are removed from every row too.", icon: "warning", showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#e11d48" });
    if (r.isConfirmed) columnCall(() => dailyTasksService.deleteColumn(col.guid));
  };

  const openScreenshot = (file) => window.open(`${process.env.NEXT_PUBLIC_API_URL || ""}/uploads/${file}`, "_blank", "noopener,noreferrer");

  // Admin view groups the rows user by user
  const groups = useMemo(() => {
    if (!viewAll) return null;
    const map = new Map();
    for (const r of items) {
      if (!map.has(r.userGuid)) map.set(r.userGuid, { userName: r.userName || "—", rows: [] });
      map.get(r.userGuid).rows.push(r);
    }
    return Array.from(map.values());
  }, [items, viewAll]);

  const cols = (viewAll ? 7 : 6) + columns.length;
  let counter = 0;

  const renderRow = (row) => {
    counter += 1;
    const canEdit = canEditRow(row);
    const editable = canEdit && !snapshot; // a screenshot is rendered read-only (plain text, no input boxes)
    const edited = row.updatedAt && row.createdAt && new Date(row.updatedAt) - new Date(row.createdAt) > 60000;
    return (
      <tr key={row.guid} data-user-guid={row.userGuid} className="border-b border-slate-100 align-top">
        <td className="py-2.5 px-3 text-xs font-black text-slate-400">{counter}</td>
        {viewAll && <td className="py-2.5 px-3 text-xs font-bold text-slate-700 whitespace-nowrap">{row.userName || "—"}</td>}
        <td className="py-2.5 px-3">
          {editable ? (
            <input type="date" value={row.taskDate} onChange={(e) => e.target.value && patchRow(row, { taskDate: e.target.value })} className="text-xs font-semibold border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded-lg px-1.5 py-1 outline-none bg-transparent" />
          ) : <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">{fmtDay(row.taskDate)}</span>}
        </td>
        <td className="py-2.5 px-3 min-w-[260px]">
          {editable ? (
            <textarea
              rows={1} defaultValue={row.task}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== row.task) patchRow(row, { task: v }); else e.target.value = row.task; }}
              className="w-full text-sm text-slate-800 border border-transparent hover:border-slate-200 focus:border-indigo-300 focus:bg-white rounded-lg px-2 py-1 outline-none resize-y bg-transparent"
            />
          ) : <p className="text-sm text-slate-800 whitespace-pre-wrap px-2 py-1">{row.task}</p>}
        </td>
        <td className="py-2.5 px-3">
          {editable ? (
            <select value={row.status} onChange={(e) => patchRow(row, { status: e.target.value })} style={selectStyle(row.status)} className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200">
              {!statuses.some((s) => s.value === row.status) && <option value={row.status}>{row.status}</option>}
              {statuses.map((s) => <option key={s.value} value={s.value} style={{ color: s.color }}>{s.label}</option>)}
            </select>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={colorOf(row.status) ? { color: colorOf(row.status), borderColor: hexToRgba(colorOf(row.status), 0.35), backgroundColor: hexToRgba(colorOf(row.status), 0.12) } : undefined}>{row.status}</span>
          )}
        </td>
        {columns.map((col) => (
          <td key={col.guid} className="py-2.5 px-3 min-w-[110px]">
            <CustomCell col={col} value={row.customValues?.[col.guid]} editable={editable} onCommit={(val) => patchRow(row, { customValues: { [col.guid]: val } })} />
          </td>
        ))}
        <td className="py-2.5 px-3 text-[11px] text-slate-500 whitespace-nowrap">
          <span className="flex items-center gap-1"><Clock size={11} className="text-slate-300" /> {fmtDateTime(row.createdAt) || "—"}</span>
          {edited && <span className="text-slate-400">edited {fmtDateTime(row.updatedAt)}</span>}
        </td>
        {!snapshot && <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5">
            {row.screenshotFilename && (
              <button onClick={() => openScreenshot(row.screenshotFilename)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline" title={`Taken ${fmtDateTime(row.screenshotAt) || ""}`}>
                <ImageIcon size={13} /> View
              </button>
            )}
            {canEdit && (
              <button onClick={() => takeScreenshot(row)} disabled={capturingId === row.guid} className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 disabled:opacity-50" title={row.screenshotFilename ? "Retake screenshot" : "Take screenshot"}>
                {capturingId === row.guid ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              </button>
            )}
            {row.screenshotAt && <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtDateTime(row.screenshotAt)}</span>}
          </div>
        </td>}
        {!snapshot && <td className="py-2.5 px-3 text-center">
          {canEdit && <button onClick={() => deleteRow(row)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg" title="Delete"><Trash2 size={14} /></button>}
        </td>}
      </tr>
    );
  };

  return (
    // ref on the whole page card (header + filters + table) — that is what a screenshot
    // captures; min-h-screen is dropped while drawing so there's no blank space below the table
    <div ref={pageRef} className={`bg-white rounded-2xl p-8 shadow-sm border border-slate-100 ${snapshot ? "" : "min-h-screen"}`}>
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl"><ClipboardList size={28} className="text-indigo-600" /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Daily Tasks</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              {viewAll ? "Every user's daily tasks — who added what, when, and its status" : "Add what you're working on today"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManageSetup && (
            <button onClick={() => setShowColumns(true)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2" title="Add or edit extra table columns">
              <Columns3 size={16} /> Columns
            </button>
          )}
          {canManageStatuses && (
            <button onClick={openStatuses} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2" title="Add or edit statuses">
              <Settings2 size={16} /> Statuses
            </button>
          )}
          <button onClick={addDraft} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md shadow-indigo-100">
            <Plus size={16} /> Add Row
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">From
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-700 normal-case" />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">To
          <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-700 normal-case" />
        </label>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {PRESETS.map((p) => {
            const r = p.range();
            const active = from === r.from && to === r.to;
            return (
              <button key={p.key} onClick={() => { setFrom(r.from); setTo(r.to); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${active ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}>
                {p.label}
              </button>
            );
          })}
        </div>
        {viewAll && (
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-200">
            <option value="all">All Users</option>
            {users.map((u) => <option key={u.userid} value={u.userid}>{u.name}</option>)}
          </select>
        )}
        <span className="text-xs font-bold text-slate-400">{items.length} task{items.length === 1 ? "" : "s"}</span>
      </div>

      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
        {/* no scroll container while a screenshot is drawn, or its scrollbars end up in the picture */}
        <div className={snapshot ? "" : "overflow-x-auto"}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-10">#</th>
                {viewAll && <th className="py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>}
                <th className="py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Task</th>
                <th className="py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                {columns.map((col) => <th key={col.guid} className="py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{col.label}</th>)}
                <th className="py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Added At</th>
                {!snapshot && <th className="py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Screenshot</th>}
                {!snapshot && <th className="py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-14">Del</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={cols + 1} className="py-12 text-center"><Loader2 className="animate-spin text-indigo-500 inline" size={24} /></td></tr>
              ) : (
                <>
                  {groups ? groups.map((g, gi) => (
                    <React.Fragment key={gi}>
                      <tr data-user-guid={g.rows[0]?.userGuid} className="bg-indigo-50/70 border-b border-indigo-100">
                        <td colSpan={cols + 1 - (snapshot ? 2 : 0)} className="py-2 px-3 text-xs font-black text-indigo-700 uppercase tracking-wider">
                          {g.userName}
                          <span className="ml-2 text-indigo-400 font-bold normal-case tracking-normal">
                            {g.rows.length} task{g.rows.length === 1 ? "" : "s"} · {g.rows.filter((r) => terminal.has(r.status)).length} done
                          </span>
                        </td>
                      </tr>
                      {g.rows.map(renderRow)}
                    </React.Fragment>
                  )) : items.map(renderRow)}

                  {drafts.map((d) => (
                    // Saves once focus leaves the whole row (not when moving between its own
                    // fields, e.g. from the task box to a custom column), so nothing typed in
                    // the row is lost.
                    <tr key={d.key} data-draft="1" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) commitDraft(d); }} className="border-b border-slate-100 bg-emerald-50/30 align-top">
                      <td className="py-2.5 px-3 text-xs font-black text-emerald-500">+</td>
                      {viewAll && <td className="py-2.5 px-3 text-xs font-bold text-slate-500 whitespace-nowrap">{currentUser?.fullName || currentUser?.username}</td>}
                      <td className="py-2.5 px-3">
                        <input type="date" value={d.taskDate} onChange={(e) => e.target.value && setDraftField(d.key, { taskDate: e.target.value })} className="text-xs font-semibold border border-slate-200 rounded-lg px-1.5 py-1 outline-none bg-white" />
                      </td>
                      <td className="py-2.5 px-3">
                        <textarea
                          autoFocus={focusKey.current === d.key} rows={1} value={d.task} placeholder="Type your task, then press Enter"
                          onChange={(e) => setDraftField(d.key, { task: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitDraft(d, true); } }}
                          className="w-full text-sm text-slate-800 border border-slate-200 focus:border-indigo-300 rounded-lg px-2 py-1 outline-none resize-y bg-white"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <select value={d.status || defaultStatus} onChange={(e) => setDraftField(d.key, { status: e.target.value })} style={selectStyle(d.status || defaultStatus)} className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 outline-none">
                          {statuses.map((s) => <option key={s.value} value={s.value} style={{ color: s.color }}>{s.label}</option>)}
                        </select>
                      </td>
                      {columns.map((col) => (
                        <td key={col.guid} className="py-2.5 px-3 min-w-[110px]">
                          <CustomCell col={col} value={d.customValues?.[col.guid]} editable onCommit={(val) => setDraftField(d.key, { customValues: { ...d.customValues, [col.guid]: val } })} />
                        </td>
                      ))}
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">on save</td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">save the task first</td>
                      <td className="py-2.5 px-3 text-center">
                        <button onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" title="Discard"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}

                  {items.length === 0 && drafts.length === 0 && (
                    <tr><td colSpan={cols + 1} className="py-12 text-center text-slate-400 font-medium">No tasks for this period. Click “Add Row” to start.</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Manage columns ── */}
      {showColumns && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowColumns(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-black text-slate-800">Table Columns</h3>
              <button onClick={() => setShowColumns(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Extra columns appear in everyone&apos;s Daily Tasks table for this company. Task, Status, Date and Screenshot are always there.</p>

            <div className="space-y-2 mb-4">
              {columns.length === 0 && <p className="text-center text-sm text-slate-400 py-3">No extra columns yet.</p>}
              {columns.map((col) => (
                <div key={col.guid} className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2">
                  <input
                    defaultValue={col.label}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== col.label) columnCall(() => dailyTasksService.updateColumn(col.guid, { label: v })); else e.target.value = col.label; }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                    className="w-40 text-sm font-semibold text-slate-700 border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded-lg px-2 py-1 outline-none"
                    title="Click to rename"
                  />
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 shrink-0">{col.type}</span>
                  {col.type === "dropdown" ? (
                    <input
                      defaultValue={(col.options || []).join(", ")}
                      onBlur={(e) => { const opts = e.target.value.split(","); if (opts.join(",") !== (col.options || []).join(",")) columnCall(() => dailyTasksService.updateColumn(col.guid, { options: opts })); }}
                      placeholder="Options, comma separated"
                      className="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                  ) : <span className="flex-1" />}
                  <button onClick={() => deleteColumn(col)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg shrink-0" title="Delete column"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Add a column</p>
              <div className="flex flex-wrap gap-2">
                <input value={newCol.label} onChange={(e) => setNewCol({ ...newCol, label: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColumn(); } }} placeholder="Column name (e.g. Client)" className="flex-1 min-w-[160px] border border-slate-300 rounded-xl px-3 py-2 text-sm" />
                <select value={newCol.type} onChange={(e) => setNewCol({ ...newCol, type: e.target.value })} className="border border-slate-300 rounded-xl px-3 py-2 text-sm">
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="dropdown">Dropdown</option>
                </select>
                {newCol.type === "dropdown" && (
                  <input value={newCol.options} onChange={(e) => setNewCol({ ...newCol, options: e.target.value })} placeholder="Options, comma separated" className="flex-1 min-w-[160px] border border-slate-300 rounded-xl px-3 py-2 text-sm" />
                )}
                <button onClick={addColumn} disabled={!newCol.label.trim()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">Add</button>
              </div>
            </div>
            <div className="flex justify-end mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setShowColumns(false)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl text-sm">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage statuses (the same list the Tasks page uses) ── */}
      {showStatuses && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowStatuses(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-black text-slate-800">Statuses</h3>
              <button onClick={() => setShowStatuses(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Shared with the Tasks page. &quot;Default&quot; is what a new row starts at; &quot;Done&quot; marks a finished status.</p>
            <div className="space-y-2 mb-4">
              {allStatuses.map((s) => (
                <div key={s.guid} className={`flex items-center gap-2 p-2.5 rounded-xl border ${s.isActive ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-60"}`}>
                  <input type="color" value={s.color} onChange={(e) => statusCall(() => tasksService.updateStatusOption(s.guid, { color: e.target.value }))} className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer shrink-0 p-0.5" title="Color" />
                  <input
                    defaultValue={s.label}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.label) statusCall(() => tasksService.updateStatusOption(s.guid, { name: v })); else e.target.value = s.label; }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                    className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold"
                  />
                  <label className="flex items-center gap-1 text-[11px] font-bold text-slate-500 shrink-0"><input type="radio" name="dt-default" checked={s.isDefault} onChange={() => statusCall(() => tasksService.updateStatusOption(s.guid, { isDefault: true }))} className="accent-indigo-600" />Default</label>
                  <label className="flex items-center gap-1 text-[11px] font-bold text-slate-500 shrink-0"><input type="radio" name="dt-done" checked={s.isTerminal} onChange={() => statusCall(() => tasksService.updateStatusOption(s.guid, { isTerminal: true }))} className="accent-emerald-600" />Done</label>
                  <button onClick={() => statusCall(() => tasksService.updateStatusOption(s.guid, { isActive: !s.isActive }))} className={`text-[11px] font-bold px-2 py-1 rounded-lg shrink-0 ${s.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{s.isActive ? "Active" : "Inactive"}</button>
                  <button onClick={() => deleteStatus(s)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg shrink-0" title="Delete"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="color" value={newStatus.color} onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })} className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer shrink-0 p-0.5" title="New status color" />
              <input value={newStatus.name} onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStatus(); } }} placeholder="+ New status (e.g. On Hold)" className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm min-w-0" />
              <button onClick={addStatus} disabled={!newStatus.name.trim()} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 disabled:opacity-50 shrink-0">Add</button>
            </div>
            <div className="flex justify-end mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setShowStatuses(false)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl text-sm">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
