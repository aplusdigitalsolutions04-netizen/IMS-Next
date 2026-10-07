"use client";
import React, { useEffect, useState, useCallback } from "react";
import Swal from "sweetalert2";
import {
  ListChecks, Plus, Loader2, Clock, CheckCircle2, AlertTriangle, X, Paperclip,
  Trash2, ExternalLink, User as UserIcon, Upload, Tag as TagIcon, Pencil, Settings2,
} from "lucide-react";
import { tasksService } from "@/lib/services/tasksService";

const PRIORITY_STYLE = {
  Low: "bg-slate-100 text-slate-600 border-slate-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  High: "bg-rose-100 text-rose-700 border-rose-200",
};

// Fallback only — once a status has a color from the master (see Manage
// Statuses), that color drives the badge/dropdown instead of this. Overdue
// isn't a master entry (it's derived), so it always uses its own fixed style.
const STATUS_STYLE = {
  Pending: "bg-slate-100 text-slate-600 border-slate-200",
  "In Progress": "bg-indigo-100 text-indigo-700 border-indigo-200",
  Done: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Overdue: "bg-rose-100 text-rose-700 border-rose-200",
};

const hexToRgba = (hex, alpha) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const EMPTY_FORM = {
  title: "", description: "", remarks: "", priority: "Medium", deadline: "",
  assignedTo: [], relatedType: "", relatedId: "", tags: [],
};

const fmtDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// The deadline column comes back as "YYYY-MM-DD HH:MM:SS" (or a Date object
// from mysql2) — <input type="datetime-local"> needs "YYYY-MM-DDTHH:mm",
// read as plain wall-clock text (not re-parsed through Date/toISOString,
// which would shift it by the browser's UTC offset the same way the API
// route avoids doing on the way in).
const toInputDateTime = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.replace(" ", "T").slice(0, 16);
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function Tasks({ currentUser }) {
  const isAdmin = currentUser?.role === "Admin";
  const canAssign = isAdmin || !!currentUser?.allow_assign_tasks;

  const [scope, setScope] = useState("mine");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignees, setAssignees] = useState([]);
  const [relatedTypes, setRelatedTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [attachFile, setAttachFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [newRelatedType, setNewRelatedType] = useState("");
  const [addingRelatedType, setAddingRelatedType] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editingGuid, setEditingGuid] = useState(null); // null = creating a new task, else editing this one
  const [statuses, setStatuses] = useState([]); // admin-editable master — see Manage Statuses
  const [showStatusManager, setShowStatusManager] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#64748b");
  const [savingStatus, setSavingStatus] = useState(false);
  const activeStatuses = statuses.filter((s) => s.isActive);

  const loadTasks = useCallback(async (s = scope) => {
    setLoading(true);
    try {
      setTasks(await tasksService.getTasks(s));
    } catch (e) {
      console.error(e);
      Swal.fire("Error", e.response?.data?.message || "Failed to load tasks", "error");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { loadTasks(scope); }, [scope, loadTasks]);

  // Keep the open detail modal in sync whenever the list refreshes (e.g.
  // after a status change) instead of showing a stale snapshot.
  useEffect(() => {
    if (!selectedTask) return;
    const fresh = tasks.find((t) => t.guid === selectedTask.guid);
    if (fresh) setSelectedTask(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  useEffect(() => {
    if (!canAssign) return;
    tasksService.getAssignees().then(setAssignees).catch((e) => console.error(e));
    tasksService.getRelatedTypes().then(setRelatedTypes).catch((e) => console.error(e));
  }, [canAssign]);

  const loadStatuses = useCallback(() => {
    tasksService.getStatuses().then(setStatuses).catch((e) => console.error(e));
  }, []);
  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  const openCreate = () => {
    setEditingGuid(null);
    setForm(EMPTY_FORM);
    setAttachFile(null);
    setTagInput("");
    setShowForm(true);
  };

  const openEdit = (task) => {
    setEditingGuid(task.guid);
    setForm({
      title: task.title || "",
      description: task.description || "",
      remarks: task.remarks || "",
      priority: task.priority || "Medium",
      deadline: toInputDateTime(task.deadline),
      assignedTo: (task.assignees || []).map((a) => a.userGuid),
      relatedType: task.relatedType || "",
      relatedId: task.relatedId || "",
      tags: task.tags || [],
      existingAttachment: task.attachmentFilename || null,
    });
    setAttachFile(null);
    setTagInput("");
    setShowForm(true);
  };

  const toggleAssignee = (userGuid) => {
    setForm((prev) => ({
      ...prev,
      assignedTo: prev.assignedTo.includes(userGuid)
        ? prev.assignedTo.filter((a) => a !== userGuid)
        : [...prev.assignedTo, userGuid],
    }));
  };

  const addTagsFromInput = () => {
    const pieces = tagInput.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean);
    if (pieces.length === 0) return;
    setForm((prev) => ({ ...prev, tags: [...new Set([...prev.tags, ...pieces])] }));
    setTagInput("");
  };

  const removeTag = (tag) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  const handleAddRelatedType = async () => {
    const name = newRelatedType.trim();
    if (!name) return;
    setAddingRelatedType(true);
    try {
      const res = await tasksService.addRelatedType(name);
      const value = res.value || name;
      setRelatedTypes((prev) => (prev.some((t) => t.value === value) ? prev : [...prev, { label: value, value }]));
      setForm((prev) => ({ ...prev, relatedType: value }));
      setNewRelatedType("");
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to add type", "error");
    } finally {
      setAddingRelatedType(false);
    }
  };

  const handleAddStatus = async () => {
    const name = newStatusName.trim();
    if (!name) return;
    setSavingStatus(true);
    try {
      await tasksService.addStatus(name, newStatusColor);
      setNewStatusName("");
      setNewStatusColor("#64748b");
      loadStatuses();
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to add status", "error");
    } finally {
      setSavingStatus(false);
    }
  };

  const handleRenameStatus = async (s, name) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === s.label) return;
    try {
      await tasksService.updateStatusOption(s.guid, { name: trimmed });
      loadStatuses();
      loadTasks();
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to rename status", "error");
    }
  };

  const handleStatusFlag = async (s, key, value) => {
    try {
      await tasksService.updateStatusOption(s.guid, { [key]: value });
      loadStatuses();
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to update status", "error");
    }
  };

  const handleDeleteStatus = async (s) => {
    const result = await Swal.fire({
      title: `Delete "${s.label}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#e11d48",
    });
    if (!result.isConfirmed) return;
    try {
      await tasksService.deleteStatusOption(s.guid);
      loadStatuses();
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to delete status", "error");
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      Swal.fire("Required", "Task title is required.", "warning");
      return;
    }
    if (form.assignedTo.length === 0) {
      Swal.fire("Required", "Please choose at least one person for this task.", "warning");
      return;
    }
    setSaving(true);
    try {
      // Keep whatever attachment was already there unless a new file was
      // picked (undefined means "leave attachmentFilename alone" on the
      // update route) — explicit null only when editing removed it.
      let attachmentFilename = attachFile === "removed" ? null : undefined;
      if (attachFile && attachFile !== "removed") {
        setUploading(true);
        const res = await tasksService.uploadAttachment(attachFile);
        attachmentFilename = res.filename;
        setUploading(false);
      }
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        remarks: form.remarks.trim() || null,
        priority: form.priority,
        deadline: form.deadline || null,
        assignedTo: form.assignedTo,
        relatedType: form.relatedType || null,
        relatedId: form.relatedId.trim() || null,
        tags: form.tags,
      };
      if (attachmentFilename !== undefined) payload.attachmentFilename = attachmentFilename;

      if (editingGuid) {
        await tasksService.updateTask(editingGuid, payload);
        Swal.fire({ title: "Task updated", icon: "success", timer: 1200, showConfirmButton: false });
      } else {
        await tasksService.createTask({ ...payload, attachmentFilename: attachmentFilename || null });
        Swal.fire({ title: "Task created", icon: "success", timer: 1200, showConfirmButton: false });
      }
      setShowForm(false);
      loadTasks();
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || `Failed to ${editingGuid ? "update" : "create"} task`, "error");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const updateStatus = async (task, status) => {
    try {
      await tasksService.updateTask(task.guid, { status });
      loadTasks();
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to update task", "error");
    }
  };

  const handleDelete = async (task) => {
    const result = await Swal.fire({
      title: "Delete this task?",
      text: task.title,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#e11d48",
    });
    if (!result.isConfirmed) return;
    try {
      await tasksService.deleteTask(task.guid);
      loadTasks();
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to delete task", "error");
    }
  };

  const openAttachment = (filename) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    window.open(`${baseUrl}/uploads/${filename}`, "_blank", "noopener,noreferrer");
  };

  const isMineTask = (t) => (t.assignees || []).some((a) => a.userGuid === currentUser?.id);
  // allow_edit_tasks / allow_delete_tasks grant that on EVERY task; without
  // it, only the task's own creator (who by definition has allow_assign_tasks)
  // can edit/delete it — mirrors app/api/tasks/[id]/route.js's server checks.
  const canEditTask = (t) => isAdmin || !!currentUser?.allow_edit_tasks || (canAssign && t.assignedBy === currentUser?.id);
  const canDeleteTask = (t) => isAdmin || !!currentUser?.allow_delete_tasks || (canAssign && t.assignedBy === currentUser?.id);

  const statusColor = (value) => statuses.find((s) => s.value === value)?.color || null;

  // Overdue is derived, not a master entry, so it always keeps its own fixed
  // style; every other status is tinted from its Manage Statuses color (so
  // it keeps showing that color after being selected, not just in the list).
  const statusBadgeStyle = (effectiveStatus, rawStatus) => {
    if (effectiveStatus === "Overdue") return { className: STATUS_STYLE.Overdue, style: undefined };
    const color = statusColor(rawStatus);
    if (!color) return { className: STATUS_STYLE[effectiveStatus] || STATUS_STYLE.Pending, style: undefined };
    return { className: "border", style: { color, borderColor: hexToRgba(color, 0.35), backgroundColor: hexToRgba(color, 0.12) } };
  };

  const statusSelectStyle = (value) => {
    const color = statusColor(value);
    return color ? { color, borderColor: hexToRgba(color, 0.5) } : undefined;
  };

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-screen">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl">
            <ListChecks size={28} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Tasks</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Assign and track what needs to get done</p>
          </div>
        </div>
        {canAssign && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStatusManager(true)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2"
              title="Manage the list of task statuses"
            >
              <Settings2 size={16} /> Manage Statuses
            </button>
            <button
              onClick={openCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md shadow-indigo-100"
            >
              <Plus size={16} /> New Task
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-3 bg-slate-100 p-1 rounded-xl w-fit mb-6">
        <button
          onClick={() => setScope("mine")}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${scope === "mine" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
        >
          My Tasks
        </button>
        {canAssign && (
          <>
            <button
              onClick={() => setScope("byMe")}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${scope === "byMe" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
            >
              Assigned by Me
            </button>
            <button
              onClick={() => setScope("all")}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${scope === "all" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
            >
              All Tasks
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-slate-400 font-medium">No tasks here.</div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-10">#</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Task</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned To</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Priority</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Deadline</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Related To</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, idx) => {
                  const overdue = t.effectiveStatus === "Overdue";
                  const mine = isMineTask(t);
                  return (
                    <tr
                      key={t.guid}
                      onClick={() => setSelectedTask(t)}
                      className={`border-b border-slate-100 cursor-pointer transition-colors hover:bg-indigo-50/50 ${overdue ? "bg-rose-50/40" : ""}`}
                    >
                      <td className="py-3 px-4 text-xs font-black text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4 max-w-[280px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 truncate">{t.title}</span>
                          {t.attachmentFilename && <Paperclip size={12} className="text-indigo-500 shrink-0" />}
                        </div>
                        {(t.tags || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {t.tags.map((tag) => (
                              <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-violet-50 text-violet-700 border-violet-200 flex items-center gap-1">
                                <TagIcon size={8} /> {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-slate-600 max-w-[160px]">
                        <span className="flex items-center gap-1 truncate">
                          <UserIcon size={12} className="shrink-0 text-slate-400" />
                          <span className="truncate">{(t.assignees || []).map((a) => a.name).join(", ") || "—"}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
                      </td>
                      <td className={`py-3 px-4 text-xs font-semibold whitespace-nowrap ${overdue ? "text-rose-600 font-bold" : "text-slate-600"}`}>
                        {fmtDate(t.deadline) || "—"}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-indigo-600 whitespace-nowrap">
                        {t.relatedType && t.relatedId ? (
                          <span className="flex items-center gap-1"><ExternalLink size={12} /> {t.relatedType}: {t.relatedId}</span>
                        ) : "—"}
                      </td>
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {!t.isDone && (mine || canAssign) ? (
                          <select
                            value={t.status}
                            onChange={(e) => updateStatus(t, e.target.value)}
                            style={statusSelectStyle(t.status)}
                            className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                          >
                            {activeStatuses.map((s) => <option key={s.value} value={s.value} style={{ color: s.color }}>{s.label}</option>)}
                          </select>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${statusBadgeStyle(t.effectiveStatus, t.status).className}`}
                            style={statusBadgeStyle(t.effectiveStatus, t.status).style}
                          >
                            {overdue ? <AlertTriangle size={10} /> : t.isDone ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                            {t.effectiveStatus}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {(canEditTask(t) || canDeleteTask(t)) && (
                          <div className="flex items-center justify-center gap-1">
                            {canEditTask(t) && (
                            <button onClick={() => openEdit(t)} className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg" title="Edit task">
                              <Pencil size={14} />
                            </button>
                            )}
                            {canDeleteTask(t) && (
                            <button onClick={() => handleDelete(t)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg" title="Delete task">
                              <Trash2 size={15} />
                            </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTask && (() => {
        const t = selectedTask;
        const overdue = t.effectiveStatus === "Overdue";
        const mine = isMineTask(t);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedTask(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-800">{t.title}</h3>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_STYLE[t.priority]}`}>{t.priority} Priority</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${statusBadgeStyle(t.effectiveStatus, t.status).className}`}
                      style={statusBadgeStyle(t.effectiveStatus, t.status).style}
                    >
                      {overdue ? <AlertTriangle size={10} /> : t.isDone ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                      {t.effectiveStatus}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedTask(null)} className="p-1.5 hover:bg-slate-100 rounded-lg shrink-0"><X size={18} /></button>
              </div>

              {(t.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {t.tags.map((tag) => (
                    <span key={tag} className="px-2.5 py-1 rounded-full text-xs font-bold border bg-violet-50 text-violet-700 border-violet-200 flex items-center gap-1">
                      <TagIcon size={11} /> {tag}
                    </span>
                  ))}
                </div>
              )}

              {t.description && (
                <div className="mb-3">
                  <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Description</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.description}</p>
                </div>
              )}
              {t.remarks && (
                <div className="mb-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Remarks</p>
                  <p className="text-sm text-slate-500 whitespace-pre-wrap italic">{t.remarks}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 bg-slate-50 rounded-xl p-4 mb-4">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Assigned To</p>
                  <p className="text-sm font-semibold text-slate-700">{(t.assignees || []).map((a) => a.name).join(", ") || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Assigned By</p>
                  <p className="text-sm font-semibold text-slate-700">{t.assignedByName || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Deadline</p>
                  <p className={`text-sm font-semibold ${overdue ? "text-rose-600" : "text-slate-700"}`}>{fmtDate(t.deadline) || "No deadline"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Created</p>
                  <p className="text-sm font-semibold text-slate-700">{fmtDate(t.createdAt) || "—"}</p>
                </div>
                {t.relatedType && t.relatedId && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Related To</p>
                    <p className="text-sm font-semibold text-indigo-600 flex items-center gap-1"><ExternalLink size={12} /> {t.relatedType}: {t.relatedId}</p>
                  </div>
                )}
                {t.isDone && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Completed</p>
                    <p className="text-sm font-semibold text-emerald-600">{fmtDate(t.completedAt) || "—"}</p>
                  </div>
                )}
              </div>

              {t.attachmentFilename && (
                <button
                  onClick={() => openAttachment(t.attachmentFilename)}
                  className="flex items-center gap-2 text-indigo-600 hover:underline text-sm font-bold mb-4"
                >
                  <Paperclip size={14} /> View Attachment
                </button>
              )}

              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                {!t.isDone && (mine || canAssign) ? (
                  <select
                    value={t.status}
                    onChange={(e) => updateStatus(t, e.target.value)}
                    style={statusSelectStyle(t.status)}
                    className="text-sm font-bold border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                  >
                    {activeStatuses.map((s) => <option key={s.value} value={s.value} style={{ color: s.color }}>{s.label}</option>)}
                  </select>
                ) : <span />}
                <div className="flex items-center gap-2">
                  {canEditTask(t) && (
                    <button
                      onClick={() => { setSelectedTask(null); openEdit(t); }}
                      className="px-4 py-2 rounded-xl text-indigo-600 hover:bg-indigo-50 text-sm font-bold flex items-center gap-1.5"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                  )}
                  {canDeleteTask(t) && (
                    <button
                      onClick={() => { handleDelete(t); setSelectedTask(null); }}
                      className="px-4 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-sm font-bold flex items-center gap-1.5"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                  <button onClick={() => setSelectedTask(null)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl text-sm">Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-800">{editingGuid ? "Edit Task" : "New Task"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>

            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Title *</label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 mb-3 text-sm"
              placeholder="e.g. Follow up on GeM order #12345"
            />

            {/* Two columns side by side so the form's height stays within
                the viewport instead of needing an inner scrollbar. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
              {/* LEFT COLUMN */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Remarks</label>
                  <textarea
                    rows={2}
                    value={form.remarks}
                    onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                    placeholder="Any additional note..."
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tags</label>
                  {form.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {form.tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold">
                          <TagIcon size={10} /> {tag}
                          <button type="button" onClick={() => removeTag(tag)} className="p-0.5 hover:bg-violet-100 rounded-full"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTagsFromInput(); } }}
                      placeholder="e.g. urgent — Enter, or paste comma-separated"
                      className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm min-w-0"
                    />
                    <button type="button" onClick={addTagsFromInput} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 shrink-0">Add</button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Attachment (optional)</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={attachFile instanceof File ? attachFile.name : (attachFile === "removed" ? "" : (form.existingAttachment || ""))}
                      placeholder="No file attached"
                      className="flex-1 bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-500 truncate outline-none min-w-0"
                    />
                    {(attachFile instanceof File || (attachFile !== "removed" && form.existingAttachment)) && (
                      <button
                        type="button"
                        onClick={() => setAttachFile("removed")}
                        className="bg-slate-100 text-slate-600 p-2.5 rounded-xl hover:bg-rose-50 hover:text-rose-600 shrink-0"
                        title="Remove attachment"
                      >
                        <X size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.createElement("input");
                        el.type = "file";
                        el.onchange = (e) => setAttachFile(e.target.files[0] || null);
                        el.click();
                      }}
                      className="bg-slate-800 text-white p-2.5 rounded-xl hover:bg-slate-700 shrink-0"
                    >
                      <Upload size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assign To * (choose one or more)</label>
                  {form.assignedTo.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {form.assignedTo.map((guid) => {
                        const p = assignees.find((a) => a.userid === guid);
                        return (
                          <span key={guid} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
                            {p?.fullName || p?.username || guid}
                            <button type="button" onClick={() => toggleAssignee(guid)} className="p-0.5 hover:bg-indigo-100 rounded-full"><X size={11} /></button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <select
                    value=""
                    onChange={(e) => e.target.value && toggleAssignee(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">+ Add person...</option>
                    {assignees.filter((a) => !form.assignedTo.includes(a.userid)).map((a) => (
                      <option key={a.userid} value={a.userid}>{a.fullName || a.username}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Priority</label>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Deadline</label>
                    <input
                      type="datetime-local"
                      value={form.deadline}
                      onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Related To</label>
                    <select
                      value={form.relatedType}
                      onChange={(e) => setForm({ ...form, relatedType: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="">None</option>
                      {relatedTypes.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <div className="flex gap-2 mt-1.5">
                      <input
                        value={newRelatedType}
                        onChange={(e) => setNewRelatedType(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddRelatedType(); } }}
                        placeholder="+ New type"
                        className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs min-w-0"
                      />
                      <button type="button" onClick={handleAddRelatedType} disabled={addingRelatedType || !newRelatedType.trim()} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 disabled:opacity-50 shrink-0">
                        {addingRelatedType ? "..." : "Add"}
                      </button>
                    </div>
                  </div>
                  {form.relatedType && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reference / ID</label>
                      <input
                        value={form.relatedId}
                        onChange={(e) => setForm({ ...form, relatedId: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                        placeholder="Order ID / Contract No."
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={saving || uploading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md shadow-indigo-200 disabled:opacity-50 flex items-center gap-2"
              >
                {(saving || uploading) && <Loader2 size={14} className="animate-spin" />}
                {uploading ? "Uploading..." : saving ? "Saving..." : editingGuid ? "Save Changes" : "Create Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showStatusManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowStatusManager(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-black text-slate-800">Manage Statuses</h3>
              <button onClick={() => setShowStatusManager(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              &quot;Default&quot; is the status a new task starts at. &quot;Counts as Done&quot; marks the status that completes a task (drives Overdue detection and the completion notification).
            </p>

            <div className="space-y-2 mb-4">
              {statuses.map((s) => (
                <div key={s.guid} className={`flex items-center gap-2 p-2.5 rounded-xl border ${s.isActive ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-60"}`}>
                  <input
                    type="color"
                    value={s.color}
                    onChange={(e) => handleStatusFlag(s, "color", e.target.value)}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer shrink-0 p-0.5"
                    title="Status color"
                  />
                  <input
                    defaultValue={s.label}
                    onBlur={(e) => handleRenameStatus(s, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                    className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold"
                  />
                  <label className="flex items-center gap-1 text-[11px] font-bold text-slate-500 shrink-0" title="New tasks start at this status">
                    <input type="radio" name="default-status" checked={s.isDefault} onChange={() => handleStatusFlag(s, "isDefault", true)} className="accent-indigo-600" />
                    Default
                  </label>
                  <label className="flex items-center gap-1 text-[11px] font-bold text-slate-500 shrink-0" title="Counts as task completed">
                    <input type="radio" name="terminal-status" checked={s.isTerminal} onChange={() => handleStatusFlag(s, "isTerminal", true)} className="accent-emerald-600" />
                    Done
                  </label>
                  <button
                    type="button"
                    onClick={() => handleStatusFlag(s, "isActive", !s.isActive)}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg shrink-0 ${s.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-500"}`}
                  >
                    {s.isActive ? "Active" : "Inactive"}
                  </button>
                  <button onClick={() => handleDeleteStatus(s)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg shrink-0" title="Delete status">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="color"
                value={newStatusColor}
                onChange={(e) => setNewStatusColor(e.target.value)}
                className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer shrink-0 p-0.5"
                title="New status color"
              />
              <input
                value={newStatusName}
                onChange={(e) => setNewStatusName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddStatus(); } }}
                placeholder="+ New status (e.g. On Hold)"
                className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm min-w-0"
              />
              <button type="button" onClick={handleAddStatus} disabled={savingStatus || !newStatusName.trim()} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 disabled:opacity-50 shrink-0">
                {savingStatus ? "..." : "Add"}
              </button>
            </div>

            <div className="flex justify-end mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setShowStatusManager(false)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl text-sm">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
