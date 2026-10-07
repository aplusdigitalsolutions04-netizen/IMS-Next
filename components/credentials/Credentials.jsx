"use client";
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Swal from "sweetalert2";
import {
  KeyRound, Plus, Loader2, Eye, EyeOff, Copy, Pencil, Trash2, History, X, ExternalLink,
  Search, Wand2, Lock, RotateCcw,
} from "lucide-react";
import { credentialsService } from "@/lib/services/credentialsService";

const REVEAL_MS = 15000;
const EMPTY_FORM = { title: "", username: "", password: "", url: "", category: "", notes: "", customFields: [] };

const fmtDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const generatePassword = (len = 16) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
};

const toast = (title, icon = "success") =>
  Swal.fire({ title, icon, timer: 1200, showConfirmButton: false, toast: true, position: "top-end" });

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export default function Credentials() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [canViewPasswords, setCanViewPasswords] = useState(false);
  const [canViewAllCompanies, setCanViewAllCompanies] = useState(false);
  const [viewAll, setViewAll] = useState(false); // Admin: every company's credentials, grouped by company
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [selected, setSelected] = useState(null); // detail modal
  const [showForm, setShowForm] = useState(false);
  const [editingGuid, setEditingGuid] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [showCatManager, setShowCatManager] = useState(false);
  const [catManagerInput, setCatManagerInput] = useState("");
  const [historyFor, setHistoryFor] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);

  // key -> decrypted value, cleared automatically after REVEAL_MS
  const [revealed, setRevealed] = useState({});
  const timers = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await credentialsService.list(viewAll ? "all" : "company");
      setItems(res.data || []);
      setCanManage(!!res.canManage);
      setCanViewPasswords(!!res.canViewPasswords);
      setCanViewAllCompanies(!!res.canViewAllCompanies);
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to load credentials", "error");
    } finally {
      setLoading(false);
    }
  }, [viewAll]);

  useEffect(() => {
    load();
    credentialsService.categories().then(setCategories).catch(() => {});
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, [load]);

  // Keep the open detail modal in sync after a reload
  useEffect(() => {
    if (!selected) return;
    const fresh = items.find((i) => i.guid === selected.guid);
    if (fresh) setSelected(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const hideSecret = (key) => {
    setRevealed((prev) => { const n = { ...prev }; delete n[key]; return n; });
    clearTimeout(timers.current[key]);
  };

  const revealSecret = async (guid, target) => {
    const key = `${guid}:${target}`;
    if (revealed[key] !== undefined) { hideSecret(key); return; }
    try {
      const value = await credentialsService.reveal(guid, target, "view");
      setRevealed((prev) => ({ ...prev, [key]: value }));
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => hideSecret(key), REVEAL_MS);
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Could not reveal", "error");
    }
  };

  const copySecret = async (guid, target) => {
    try {
      const value = await credentialsService.reveal(guid, target, "copy");
      if (await copyText(value)) toast("Copied");
      else Swal.fire("Copy failed", "Your browser blocked clipboard access.", "warning");
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Could not copy", "error");
    }
  };

  const copyPlain = async (text) => {
    if (await copyText(text)) toast("Copied");
  };

  const openCreate = () => {
    setEditingGuid(null);
    setForm(EMPTY_FORM);
    setShowFormPassword(false);
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditingGuid(c.guid);
    setForm({
      title: c.title || "", username: c.username || "", password: "", url: c.url || "",
      category: c.category || "", notes: c.notes || "",
      // secret values are never sent to the browser — a blank value on an
      // existing secret field means "keep as is"
      customFields: (c.customFields || []).map((f) => ({ id: f.id, label: f.label, secret: f.secret, value: f.secret ? "" : (f.value || ""), hasValue: f.hasValue })),
    });
    setShowFormPassword(false);
    setSelected(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Swal.fire("Required", "Title is required.", "warning");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(), username: form.username.trim(), url: form.url.trim(),
        category: form.category || null, notes: form.notes.trim() || null,
        customFields: form.customFields.map((f) => ({ id: f.id, label: f.label, secret: f.secret, value: f.value })),
      };
      if (form.password) payload.password = form.password;
      if (editingGuid) {
        const res = await credentialsService.update(editingGuid, payload);
        toast(res.passwordChanged ? "Saved — password changed" : "Saved");
      } else {
        await credentialsService.create(payload);
        toast("Credential added");
      }
      setShowForm(false);
      load();
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c) => {
    const r = await Swal.fire({ title: `Delete "${c.title}"?`, text: "It will be removed from this list.", icon: "warning", showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#e11d48" });
    if (!r.isConfirmed) return;
    try {
      await credentialsService.remove(c.guid);
      setSelected(null);
      load();
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to delete", "error");
    }
  };

  const openHistory = async (c) => {
    setHistoryFor(c);
    setHistoryRows([]);
    try {
      setHistoryRows(await credentialsService.history(c.guid));
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to load history", "error");
    }
  };

  const handleRestore = async (h) => {
    const r = await Swal.fire({ title: "Restore this password?", text: "The current password is kept in history.", icon: "question", showCancelButton: true, confirmButtonText: "Restore" });
    if (!r.isConfirmed) return;
    try {
      await credentialsService.restore(historyFor.guid, h.guid);
      toast("Password restored");
      setHistoryFor(null);
      load();
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to restore", "error");
    }
  };

  const handleAddCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    try {
      const res = await credentialsService.addCategory(name);
      const value = res.value || name;
      setCategories((prev) => (prev.some((c) => c.value === value) ? prev : [...prev, { label: value, value }]));
      setForm((prev) => ({ ...prev, category: value }));
      setNewCategory("");
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to add category", "error");
    }
  };

  // Same category list the Add/Edit form uses — this lets it be extended from
  // the page itself, without opening the form first.
  const handleAddCategoryFromPage = async () => {
    const name = catManagerInput.trim();
    if (!name) return;
    try {
      const res = await credentialsService.addCategory(name);
      const value = res.value || name;
      setCategories((prev) => (prev.some((c) => c.value === value) ? prev : [...prev, { label: value, value }]));
      setCatManagerInput("");
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to add category", "error");
    }
  };

  const handleRenameCategory = async (cat, nextName) => {
    const next = nextName.trim();
    if (!next || next === cat.label) return;
    try {
      const res = await credentialsService.renameCategory(cat.value, next);
      const value = res.value || next;
      setCategories((prev) => prev.map((c) => (c.value === cat.value ? { label: value, value } : c)));
      if (categoryFilter === cat.value) setCategoryFilter(value);
      load(); // credentials using it now carry the new name
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to rename category", "error");
      load();
    }
  };

  const handleDeleteCategory = async (cat) => {
    const r = await Swal.fire({ title: `Delete "${cat.label}"?`, icon: "warning", showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#e11d48" });
    if (!r.isConfirmed) return;
    try {
      await credentialsService.deleteCategory(cat.value);
      setCategories((prev) => prev.filter((c) => c.value !== cat.value));
      if (categoryFilter === cat.value) setCategoryFilter("All");
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to delete category", "error");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) =>
      (categoryFilter === "All" || i.category === categoryFilter) &&
      (!q || [i.title, i.username, i.url, i.category].some((v) => String(v || "").toLowerCase().includes(q)))
    );
  }, [items, search, categoryFilter]);

  const PasswordCell = ({ c, compact = false }) => {
    if (!c.hasPassword) return <span className="text-slate-400 text-xs">—</span>;
    const key = `${c.guid}:password`;
    const shown = revealed[key];
    return (
      <span className="inline-flex items-center gap-1">
        <span className={`font-mono text-xs ${shown !== undefined ? "text-slate-800 font-bold" : "text-slate-400"}`}>
          {shown !== undefined ? shown : "••••••••"}
        </span>
        {canViewPasswords && (
          <>
            <button onClick={(e) => { e.stopPropagation(); revealSecret(c.guid, "password"); }} className="p-1 text-slate-500 hover:bg-slate-100 rounded" title={shown !== undefined ? "Hide" : "Show for 15 seconds"}>
              {shown !== undefined ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); copySecret(c.guid, "password"); }} className="p-1 text-slate-500 hover:bg-slate-100 rounded" title="Copy password">
              <Copy size={14} />
            </button>
          </>
        )}
        {!compact && !canViewPasswords && <Lock size={12} className="text-slate-300" title="No permission to view passwords" />}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-screen">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl"><KeyRound size={28} className="text-indigo-600" /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Credentials</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Logins, passwords and keys — passwords are stored encrypted</p>
          </div>
        </div>
        {canManage && (
          <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md shadow-indigo-100">
            <Plus size={16} /> Add Credential
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, username, URL..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-200">
          <option value="All">All Categories</option>
          {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {canManage && (
          <button onClick={() => setShowCatManager(true)} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5" title="Add or delete categories">
            <Plus size={13} /> Categories
          </button>
        )}
        {canViewAllCompanies && (
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setViewAll(false)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${!viewAll ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`}>This Company</button>
            <button onClick={() => setViewAll(true)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${viewAll ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`}>All Companies</button>
          </div>
        )}
        <span className="text-xs font-bold text-slate-400">{filtered.length} of {items.length}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 font-medium">{items.length === 0 ? "No credentials saved yet." : "No matches."}</div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["#", "Title", "Username / Email", "Password", "Category", "Last Password Change", "Actions"].map((h) => (
                    <th key={h} className={`py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider ${h === "#" ? "w-10" : ""} ${h === "Actions" ? "text-center" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => (
                  <React.Fragment key={c.guid}>
                  {viewAll && (idx === 0 || filtered[idx - 1].companyGuid !== c.companyGuid) && (
                    <tr className="bg-indigo-50/70 border-b border-indigo-100">
                      <td colSpan={7} className="py-2 px-4 text-xs font-black text-indigo-700 uppercase tracking-wider">
                        {c.companyName || "No company"} <span className="text-indigo-400 font-bold">({filtered.filter((x) => x.companyGuid === c.companyGuid).length})</span>
                      </td>
                    </tr>
                  )}
                  <tr onClick={() => setSelected(c)} className="border-b border-slate-100 cursor-pointer hover:bg-indigo-50/50 transition-colors">
                    <td className="py-3 px-4 text-xs font-black text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-800 text-sm">{c.title}</p>
                      {c.url && <p className="text-[11px] text-indigo-500 truncate max-w-[220px]">{c.url}</p>}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600" onClick={(e) => e.stopPropagation()}>
                      {c.username ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="truncate max-w-[200px]">{c.username}</span>
                          <button onClick={() => copyPlain(c.username)} className="p-1 text-slate-400 hover:bg-slate-100 rounded" title="Copy"><Copy size={12} /></button>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}><PasswordCell c={c} /></td>
                    <td className="py-3 px-4">
                      {c.category && <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-indigo-50 text-indigo-700 border-indigo-200">{c.category}</span>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {c.passwordChangedAt ? <>{fmtDate(c.passwordChangedAt)}<br /><span className="text-slate-400">by {c.passwordChangedByName || "—"}</span></> : "—"}
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openHistory(c)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg" title="Password history"><History size={15} /></button>
                        {canManage && <button onClick={() => openEdit(c)} className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg" title="Edit"><Pencil size={14} /></button>}
                        {canManage && <button onClick={() => handleDelete(c)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg" title="Delete"><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Detail modal ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">{selected.title}</h3>
                {viewAll && selected.companyName && <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider mt-0.5">{selected.companyName}</p>}
                {selected.category && <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-indigo-50 text-indigo-700 border-indigo-200">{selected.category}</span>}
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 rounded-xl p-4 mb-4">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Username / Email</p>
                <p className="text-sm font-semibold text-slate-700 break-all">{selected.username || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Password</p>
                <PasswordCell c={selected} />
              </div>
              <div className="col-span-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">URL</p>
                {selected.url ? (
                  <a href={/^https?:\/\//i.test(selected.url) ? selected.url : `https://${selected.url}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1 break-all">
                    {selected.url} <ExternalLink size={12} />
                  </a>
                ) : <p className="text-sm text-slate-500">—</p>}
              </div>
              {(selected.customFields || []).map((f) => {
                const key = `${selected.guid}:field:${f.id}`;
                const shown = revealed[key];
                return (
                  <div key={f.id}>
                    <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">{f.label}{f.secret && <Lock size={10} className="inline ml-1 text-slate-300" />}</p>
                    {f.secret ? (
                      f.hasValue ? (
                        <span className="inline-flex items-center gap-1">
                          <span className={`font-mono text-xs ${shown !== undefined ? "text-slate-800 font-bold" : "text-slate-400"}`}>{shown !== undefined ? shown : "••••••••"}</span>
                          {canViewPasswords && (
                            <>
                              <button onClick={() => revealSecret(selected.guid, `field:${f.id}`)} className="p-1 text-slate-500 hover:bg-slate-100 rounded" title="Show for 15 seconds">{shown !== undefined ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                              <button onClick={() => copySecret(selected.guid, `field:${f.id}`)} className="p-1 text-slate-500 hover:bg-slate-100 rounded" title="Copy"><Copy size={14} /></button>
                            </>
                          )}
                        </span>
                      ) : <span className="text-slate-400 text-xs">—</span>
                    ) : (
                      <p className="text-sm font-semibold text-slate-700 break-all">{f.value || "—"}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {selected.notes && (
              <div className="mb-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Notes</p>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{selected.notes}</p>
              </div>
            )}

            <p className="text-[11px] text-slate-400 mb-4">
              Added by {selected.createdByName || "—"} · Last password change: {selected.passwordChangedAt ? `${fmtDate(selected.passwordChangedAt)} by ${selected.passwordChangedByName || "—"}` : "—"}
            </p>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button onClick={() => { const c = selected; setSelected(null); openHistory(c); }} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-bold flex items-center gap-1.5"><History size={14} /> History</button>
              {canManage && <button onClick={() => openEdit(selected)} className="px-4 py-2 rounded-xl text-indigo-600 hover:bg-indigo-50 text-sm font-bold flex items-center gap-1.5"><Pencil size={14} /> Edit</button>}
              {canManage && <button onClick={() => handleDelete(selected)} className="px-4 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-sm font-bold flex items-center gap-1.5"><Trash2 size={14} /> Delete</button>}
              <button onClick={() => setSelected(null)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-800">{editingGuid ? "Edit Credential" : "Add Credential"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Title *</label>
                  <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. GeM Portal" className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Username / Email</label>
                  <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password {editingGuid && <span className="normal-case font-medium text-slate-400">(leave blank to keep the current one)</span>}</label>
                  <div className="flex gap-2">
                    <input
                      type={showFormPassword ? "text" : "password"} value={form.password} autoComplete="new-password"
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono min-w-0"
                      placeholder={editingGuid ? "••••••••" : ""}
                    />
                    <button type="button" onClick={() => setShowFormPassword((v) => !v)} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 shrink-0" title="Show / hide">{showFormPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                    <button type="button" onClick={() => { setForm({ ...form, password: generatePassword() }); setShowFormPassword(true); }} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 shrink-0" title="Generate a strong password"><Wand2 size={16} /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">URL</label>
                  <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm">
                    <option value="">None</option>
                    {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <div className="flex gap-2 mt-1.5">
                    <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); } }} placeholder="+ New category" className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs min-w-0" />
                    <button type="button" onClick={handleAddCategory} disabled={!newCategory.trim()} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 disabled:opacity-50 shrink-0">Add</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm resize-none" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Custom Fields</label>
                    <button type="button" onClick={() => setForm({ ...form, customFields: [...form.customFields, { label: "", value: "", secret: false }] })} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"><Plus size={12} /> Add field</button>
                  </div>
                  <div className="space-y-1.5">
                    {form.customFields.length === 0 && <p className="text-[11px] text-slate-400">e.g. PIN, Customer ID, Security answer</p>}
                    {form.customFields.map((f, i) => (
                      <div key={f.id || i} className="flex items-center gap-1.5">
                        <input value={f.label} onChange={(e) => setForm({ ...form, customFields: form.customFields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Label" className="w-1/3 border border-slate-300 rounded-lg px-2 py-1.5 text-xs min-w-0" />
                        <input
                          type={f.secret ? "password" : "text"} autoComplete="new-password" value={f.value}
                          onChange={(e) => setForm({ ...form, customFields: form.customFields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                          placeholder={f.secret && f.hasValue ? "•••• (blank = keep)" : "Value"}
                          className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs min-w-0"
                        />
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 shrink-0" title="Encrypt this value and hide it in the list">
                          <input type="checkbox" checked={f.secret} onChange={(e) => setForm({ ...form, customFields: form.customFields.map((x, j) => (j === i ? { ...x, secret: e.target.checked } : x)) })} className="accent-indigo-600" /> Secret
                        </label>
                        <button type="button" onClick={() => setForm({ ...form, customFields: form.customFields.filter((_, j) => j !== i) })} className="p-1 text-rose-500 hover:bg-rose-50 rounded shrink-0"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md shadow-indigo-200 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? "Saving..." : editingGuid ? "Save Changes" : "Add Credential"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage categories modal ── */}
      {showCatManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCatManager(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-black text-slate-800">Categories</h3>
              <button onClick={() => setShowCatManager(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Click a name to rename it (credentials using it move to the new name). A category that credentials still use can&apos;t be deleted.</p>
            <div className="space-y-1.5 mb-4">
              {categories.map((c) => (
                <div key={c.value} className="flex items-center justify-between gap-2 border border-slate-200 rounded-xl px-3 py-2">
                  <input
                    defaultValue={c.label}
                    onBlur={(e) => handleRenameCategory(c, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                    className="flex-1 min-w-0 text-sm font-semibold text-slate-700 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-300 focus:bg-white rounded-lg px-2 py-1 outline-none"
                    title="Click to rename"
                  />
                  <button onClick={() => handleDeleteCategory(c)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg" title="Delete category"><Trash2 size={14} /></button>
                </div>
              ))}
              {categories.length === 0 && <p className="text-center text-sm text-slate-400 py-3">No categories.</p>}
            </div>
            <div className="flex gap-2">
              <input value={catManagerInput} onChange={(e) => setCatManagerInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCategoryFromPage(); } }} placeholder="+ New category" className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm min-w-0" />
              <button onClick={handleAddCategoryFromPage} disabled={!catManagerInput.trim()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 shrink-0">Add</button>
            </div>
            <div className="flex justify-end mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setShowCatManager(false)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl text-sm">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Password history modal ── */}
      {historyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHistoryFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-black text-slate-800">Password History</h3>
              <button onClick={() => setHistoryFor(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">{historyFor.title} — the last 10 previous passwords are kept.</p>
            <div className="bg-slate-50 rounded-xl p-3 mb-3 text-xs text-slate-600">
              <span className="font-bold">Current password:</span> changed {historyFor.passwordChangedAt ? `${fmtDate(historyFor.passwordChangedAt)} by ${historyFor.passwordChangedByName || "—"}` : "— (never changed since it was added)"}
            </div>
            {historyRows.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-6">No previous passwords.</p>
            ) : (
              <div className="space-y-2">
                {historyRows.map((h) => {
                  const key = `${historyFor.guid}:history:${h.guid}`;
                  const shown = revealed[key];
                  return (
                    <div key={h.guid} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700">Replaced on {fmtDate(h.changedAt)}</p>
                        <p className="text-[11px] text-slate-400">by {h.changedByName || "—"}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`font-mono text-xs ${shown !== undefined ? "text-slate-800 font-bold" : "text-slate-400"}`}>{shown !== undefined ? shown : "••••••••"}</span>
                        {canViewPasswords && (
                          <>
                            <button onClick={() => revealSecret(historyFor.guid, `history:${h.guid}`)} className="p-1 text-slate-500 hover:bg-slate-100 rounded" title="Show for 15 seconds">{shown !== undefined ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                            <button onClick={() => copySecret(historyFor.guid, `history:${h.guid}`)} className="p-1 text-slate-500 hover:bg-slate-100 rounded" title="Copy"><Copy size={14} /></button>
                          </>
                        )}
                        {canManage && canViewPasswords && (
                          <button onClick={() => handleRestore(h)} className="ml-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100 flex items-center gap-1"><RotateCcw size={11} /> Restore</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setHistoryFor(null)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
