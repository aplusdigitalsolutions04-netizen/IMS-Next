"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Pencil, Check, X, Trash2, Loader2, Building2, Search,
  CheckCircle, Globe, ShieldCheck, Ban, Store, Landmark, ShoppingBag, Link2,
  ImageUp,
} from "lucide-react";
import Swal from "sweetalert2";
import api from "@/lib/client/apiClient";
import { useCompany } from "@/lib/client/CompanyContext";
import { platformsService } from "@/lib/services/platformsService";

// Icons for the 4 built-in platforms are kept distinct for recognizability;
// any custom platform added later (Settings > Selling Platforms) gets a
// generic globe icon instead — there's no way to know in advance what icon
// a brand-new marketplace "should" have.
const PLATFORM_ICONS = { GeM: Landmark, Flipkart: ShoppingBag, Amazon: Store, Other: Link2 };
// Matches the colorTheme values selling_platforms rows can have (see
// app/api/admin/platforms/route.js's COLOR_THEMES) — Tailwind class names
// can't be built dynamically from a string at runtime, so each theme needs
// its literal classes listed here.
const THEME_CLASSES = {
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
const DEFAULT_THEME = THEME_CLASSES.violet;

// Deterministic accent color per company name — keeps each card visually distinct.
const ACCENTS = [
  "from-indigo-500 to-violet-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-600",
  "from-rose-500 to-pink-600",
];
const accentFor = (name) => {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return ACCENTS[h % ACCENTS.length];
};

export default function CompanyMasterPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  // null = modal closed; { guid: null } = creating; { guid: "..." } = editing
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", allowedPlatforms: [], isActive: true });
  const [uploadingLogoGuid, setUploadingLogoGuid] = useState(null);
  const nameInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const logoTargetGuid = useRef(null);
  const { setAvailableCompanies, syncActiveCompany } = useCompany();
  const [platforms, setPlatforms] = useState([]);

  useEffect(() => { platformsService.getPlatforms().then(setPlatforms); }, []);

  const platformOptions = useMemo(
    () => platforms.map((p) => ({ value: p.name, icon: PLATFORM_ICONS[p.name] || Globe, ...(THEME_CLASSES[p.colorTheme] || DEFAULT_THEME) })),
    [platforms]
  );
  const platformStyleMap = useMemo(() => new Map(platformOptions.map((p) => [p.value, p])), [platformOptions]);
  // A company can have a platform recorded (allowedPlatforms, or historical
  // order data) that was later deactivated/removed from Platform Master —
  // still render something sensible for it instead of crashing on a lookup miss.
  const platformStyle = (name) => platformStyleMap.get(name) || { icon: Globe, ...DEFAULT_THEME };

  useEffect(() => { fetchCompanies(); }, []);
  useEffect(() => { if (modal && nameInputRef.current) nameInputRef.current.focus(); }, [modal]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await api.get("/companies");
      if (Array.isArray(res.data)) {
        setCompanies(res.data);
        // Keep the topbar switcher / dashboard filter in sync immediately —
        // otherwise a newly created (or reactivated) company only shows up
        // there after the user logs out and back in. Mirrors the shape
        // login returns: only active companies, {guid, name, allowedPlatforms}.
        const active = res.data
          .filter((c) => c.isActive === 1 || c.isActive === true)
          .map((c) => ({ guid: c.guid, name: c.name, allowedPlatforms: c.allowedPlatforms, logoFilename: c.logoFilename }));
        setAvailableCompanies(active);
        syncActiveCompany(active);
        window.sessionStorage.setItem("pt_companies", JSON.stringify(active));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => ({
    total: companies.length,
    active: companies.filter((c) => c.isActive).length,
    inactive: companies.filter((c) => !c.isActive).length,
  }), [companies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name?.toLowerCase().includes(q));
  }, [companies, search]);

  const openCreate = () => {
    setForm({ name: "", allowedPlatforms: [], isActive: true });
    setModal({ guid: null });
  };

  const openEdit = (c) => {
    setForm({
      name: c.name,
      allowedPlatforms: Array.isArray(c.allowedPlatforms) ? c.allowedPlatforms : [],
      isActive: c.isActive === 1 || c.isActive === true,
    });
    setModal({ guid: c.guid });
  };

  const togglePlatform = (p) => {
    setForm((prev) => ({
      ...prev,
      allowedPlatforms: prev.allowedPlatforms.includes(p)
        ? prev.allowedPlatforms.filter((x) => x !== p)
        : [...prev.allowedPlatforms, p],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Swal.fire({ title: "Missing name", text: "Company name is required.", icon: "warning", customClass: { popup: "rounded-2xl", confirmButton: "rounded-xl font-semibold" } });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, allowedPlatforms: form.allowedPlatforms.length > 0 ? form.allowedPlatforms : null };
      if (modal.guid) {
        await api.put(`/companies/${modal.guid}`, payload);
      } else {
        await api.post("/companies", payload);
      }
      setModal(null);
      await fetchCompanies();
      Swal.fire({ title: "Saved!", text: `"${form.name}" ${modal.guid ? "updated" : "created"} successfully.`, icon: "success", timer: 1400, showConfirmButton: false, customClass: { popup: "rounded-2xl" } });
    } catch (err) {
      Swal.fire({ title: "Couldn't save company", text: err.response?.data?.message || err.message, icon: "error", customClass: { popup: "rounded-2xl", confirmButton: "rounded-xl font-semibold" } });
    } finally {
      setSaving(false);
    }
  };

  const openLogoPicker = (company) => {
    logoTargetGuid.current = company.guid;
    if (logoInputRef.current) logoInputRef.current.click();
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    const guid = logoTargetGuid.current;
    e.target.value = "";
    if (!file || !guid) return;
    setUploadingLogoGuid(guid);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/companies/${guid}/logo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      await fetchCompanies();
    } catch (err) {
      Swal.fire({ title: "Couldn't upload logo", text: err.response?.data?.message || err.message, icon: "error", customClass: { popup: "rounded-2xl", confirmButton: "rounded-xl font-semibold" } });
    } finally {
      setUploadingLogoGuid(null);
    }
  };

  const handleDelete = async (company) => {
    const result = await Swal.fire({
      title: `Deactivate "${company.name}"?`,
      text: "Its data stays intact — this just stops it appearing as a login option.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Deactivate",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      customClass: { popup: "rounded-2xl", confirmButton: "rounded-xl font-semibold", cancelButton: "rounded-xl font-semibold" },
    });
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/companies/${company.guid}`);
      await fetchCompanies();
    } catch (err) {
      Swal.fire({ title: "Couldn't deactivate company", text: err.response?.data?.message || err.message, icon: "error", customClass: { popup: "rounded-2xl", confirmButton: "rounded-xl font-semibold" } });
    }
  };

  return (
    <div className="w-full space-y-6">
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleLogoChange}
      />

      {/* ── Hero header ── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center border border-white/15">
              <Building2 size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">Company Master</h1>
              <p className="text-slate-400 text-sm font-medium mt-0.5">
                {stats.total} compan{stats.total === 1 ? "y" : "ies"} · Sister concerns & platform access
              </p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2.5 px-5 py-3 bg-white text-slate-900 rounded-2xl font-bold text-sm shadow-lg hover:bg-indigo-50 transition-all hover:-translate-y-0.5 active:translate-y-0 shrink-0"
          >
            <Plus size={17} className="text-indigo-600" />
            Add Company
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
            <Building2 size={18} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-800 leading-none">{stats.total}</p>
            <p className="text-xs font-semibold text-slate-400 mt-1">Total Companies</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
            <ShieldCheck size={18} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-700 leading-none">{stats.active}</p>
            <p className="text-xs font-semibold text-slate-400 mt-1">Active</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
            <Ban size={18} className="text-slate-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-600 leading-none">{stats.inactive}</p>
            <p className="text-xs font-semibold text-slate-400 mt-1">Inactive</p>
          </div>
        </div>
      </div>

      {/* ── Directory ── */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search companies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all font-medium"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500 font-medium shrink-0">
            <Building2 size={15} />
            <span>{filtered.length} of {companies.length} companies</span>
          </div>
        </div>

        {/* Card grid */}
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 size={32} className="animate-spin text-indigo-500" />
            <p className="font-semibold">Loading companies…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 size={32} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700">
              {search ? "No companies match your search" : "No companies yet"}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {search ? "Try a different search term." : "Click 'Add Company' to create your first company."}
            </p>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((c) => {
              const isActive = c.isActive === 1 || c.isActive === true;
              const accent = accentFor(c.name);
              return (
                <div
                  key={c.guid}
                  className={`bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden group flex flex-col ${!isActive ? "opacity-70" : ""}`}
                >
                  <div className={`h-1 bg-gradient-to-r ${accent}`} />

                  <div className="p-5 flex flex-col flex-1">
                    {/* Top row: status + actions */}
                    <div className="flex items-center justify-between mb-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                        {isActive ? "Active" : "Inactive"}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Edit company"
                        >
                          <Pencil size={14} />
                        </button>
                        {isActive && (
                          <button
                            onClick={() => handleDelete(c)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Deactivate company"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Avatar + name */}
                    <div className="flex flex-col items-center text-center mb-4">
                      <button
                        type="button"
                        onClick={() => openLogoPicker(c)}
                        title="Change company logo"
                        className={`relative w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center text-white text-xl font-black shadow-md mb-3 group/logo ${c.logoFilename ? "bg-white border border-slate-200" : `bg-gradient-to-br ${accent}`}`}
                      >
                        {uploadingLogoGuid === c.guid ? (
                          <Loader2 size={18} className="animate-spin text-slate-400" />
                        ) : c.logoFilename ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/uploads/${c.logoFilename}`} alt={c.name} className="w-full h-full object-contain p-1" />
                        ) : (
                          String(c.name || "?").trim().charAt(0).toUpperCase()
                        )}
                        <span className="absolute inset-0 bg-black/50 opacity-0 group-hover/logo:opacity-100 transition-opacity flex items-center justify-center">
                          <ImageUp size={16} className="text-white" />
                        </span>
                      </button>
                      <h3 className="font-extrabold text-slate-900 text-base leading-tight truncate max-w-full" title={c.name}>
                        {c.name}
                      </h3>
                    </div>

                    <div className="flex-1" />

                    {/* Platforms footer */}
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Selling Platforms</p>
                      {Array.isArray(c.allowedPlatforms) && c.allowedPlatforms.length > 0 ? (
                        <div className="flex gap-1.5 flex-wrap">
                          {c.allowedPlatforms.map((p) => {
                            const st = platformStyle(p);
                            const Icon = st.icon;
                            return (
                              <span key={p} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border ${st.bg} ${st.color} ${st.border}`}>
                                <Icon size={11} /> {p}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Globe size={11} /> All Platforms
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit modal ── */}
      {modal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">

            {/* Modal header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-6 py-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                    <Building2 size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-white leading-tight">
                      {modal.guid ? "Edit Company" : "New Company"}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      {modal.guid ? "Update details & platform access" : "Add a sister concern company"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModal(null)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-5">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Company Name *</label>
                <div className="relative">
                  <Building2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder="e.g. A Plus Digital Solutions"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Selling Platforms</label>
                <p className="text-xs text-slate-400 mb-2.5">Leave all unselected to allow every platform.</p>
                <div className="grid grid-cols-2 gap-2">
                  {platformOptions.map((p) => {
                    const checked = form.allowedPlatforms.includes(p.value);
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => togglePlatform(p.value)}
                        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border-2 text-sm font-bold transition-all text-left ${
                          checked
                            ? `${p.bg} ${p.border} ${p.color} shadow-sm`
                            : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 bg-white"
                        }`}
                      >
                        <Icon size={15} className="shrink-0" />
                        <span className="flex-1">{p.value}</span>
                        {checked && <CheckCircle size={14} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="text-sm font-bold text-slate-800">Active</p>
                  <p className="text-xs text-slate-500 mt-0.5">Inactive companies can't be logged into.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${form.isActive ? "bg-emerald-500 border-emerald-500" : "bg-slate-200 border-slate-200"}`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${form.isActive ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-70 transition-all shadow-lg shadow-slate-900/20"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {modal.guid ? "Save Changes" : "Create Company"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
