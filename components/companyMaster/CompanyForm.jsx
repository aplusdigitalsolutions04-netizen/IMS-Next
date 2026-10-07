"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Check, CheckCircle, Globe, Loader2, X } from "lucide-react";
import Swal from "sweetalert2";
import api from "@/lib/client/apiClient";
import { platformsService } from "@/lib/services/platformsService";
import { PLATFORM_ICONS, THEME_CLASSES, DEFAULT_THEME } from "./platformTheme";

const EMPTY = { name: "", gstNumber: "", additionalGstNumbers: [], allowedPlatforms: [], isActive: true, dueBillEnabled: false };

const splitGst = (raw) =>
  String(raw || "")
    .split(/[,;\n]+/)
    // A trailing "(B)"/"(R)"/"(G)"-style branch note is never part of the GSTIN
    // itself — keeping it is what breaks the contract-match check.
    .map((piece) => piece.replace(/\([^)]*\)/g, "").trim().toUpperCase())
    .filter(Boolean);

// Full-page replacement for the old Create / Edit Company popup. `companyGuid`
// is null for "New Company". Same fields, same save calls; the list page
// refreshes the company switcher when you land back on it.
const Toggle = ({ on, onClick, color }) => (
  <button type="button" onClick={onClick} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${on ? `${color}` : "bg-slate-200 border-slate-200"}`}>
    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0"}`} />
  </button>
);
export default function CompanyForm({ companyGuid = null }) {
  const router = useRouter();
  const isEdit = !!companyGuid;
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newExtraGst, setNewExtraGst] = useState("");
  const [platforms, setPlatforms] = useState([]);
  const nameRef = useRef(null);

  useEffect(() => { platformsService.getPlatforms().then(setPlatforms).catch(() => setPlatforms([])); }, []);

  useEffect(() => {
    if (!isEdit) return;
    api.get("/companies")
      .then((res) => {
        const c = (Array.isArray(res.data) ? res.data : []).find((x) => x.guid === companyGuid);
        if (!c) { setNotFound(true); return; }
        setForm({
          name: c.name,
          gstNumber: c.gstNumber || "",
          additionalGstNumbers: Array.isArray(c.additionalGstNumbers) ? c.additionalGstNumbers : [],
          allowedPlatforms: Array.isArray(c.allowedPlatforms) ? c.allowedPlatforms : [],
          isActive: c.isActive === 1 || c.isActive === true,
          dueBillEnabled: c.dueBillEnabled === 1 || c.dueBillEnabled === true,
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [isEdit, companyGuid]);

  useEffect(() => { if (!loading && nameRef.current) nameRef.current.focus(); }, [loading]);

  const platformOptions = useMemo(
    () => platforms.map((p) => ({ value: p.name, icon: PLATFORM_ICONS[p.name] || Globe, ...(THEME_CLASSES[p.colorTheme] || DEFAULT_THEME) })),
    [platforms]
  );
  const strayPlatforms = form.allowedPlatforms.filter((p) => !platformOptions.some((opt) => opt.value === p));

  const addExtraGst = () => {
    const pieces = splitGst(newExtraGst);
    if (!pieces.length) return;
    setForm((prev) => {
      const existing = new Set([...prev.additionalGstNumbers, prev.gstNumber.trim().toUpperCase()]);
      const toAdd = [...new Set(pieces)].filter((p) => !existing.has(p));
      return toAdd.length ? { ...prev, additionalGstNumbers: [...prev.additionalGstNumbers, ...toAdd] } : prev;
    });
    setNewExtraGst("");
  };
  const removeExtraGst = (gst) => setForm((prev) => ({ ...prev, additionalGstNumbers: prev.additionalGstNumbers.filter((g) => g !== gst) }));
  const togglePlatform = (p) =>
    setForm((prev) => ({ ...prev, allowedPlatforms: prev.allowedPlatforms.includes(p) ? prev.allowedPlatforms.filter((x) => x !== p) : [...prev.allowedPlatforms, p] }));

  const goBack = () => router.push("/companyMaster");

  const handleSave = async () => {
    if (!form.name.trim()) {
      Swal.fire({ title: "Missing name", text: "Company name is required.", icon: "warning", customClass: { popup: "rounded-2xl", confirmButton: "rounded-xl font-semibold" } });
      return;
    }
    setSaving(true);
    try {
      // GSTINs typed into the box but never added with Add/Enter would
      // otherwise be silently dropped on Save — fold them in.
      const knownGst = new Set([...form.additionalGstNumbers, form.gstNumber.trim().toUpperCase()]);
      const additionalGstNumbers = [...form.additionalGstNumbers, ...[...new Set(splitGst(newExtraGst))].filter((g) => !knownGst.has(g))];
      const payload = { ...form, additionalGstNumbers, allowedPlatforms: form.allowedPlatforms.length > 0 ? form.allowedPlatforms : null };
      if (isEdit) await api.put(`/companies/${companyGuid}`, payload);
      else await api.post("/companies", payload);
      await Swal.fire({ title: "Saved!", text: `"${form.name}" ${isEdit ? "updated" : "created"} successfully.`, icon: "success", timer: 1400, showConfirmButton: false, customClass: { popup: "rounded-2xl" } });
      goBack();
    } catch (err) {
      Swal.fire({ title: "Couldn't save company", text: err.response?.data?.message || err.message, icon: "error", customClass: { popup: "rounded-2xl", confirmButton: "rounded-xl font-semibold" } });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-16 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={26} /></div>;
  if (notFound) {
    return (
      <div className="space-y-4">
        <button onClick={goBack} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to Companies</button>
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500 text-sm">This company was not found.</div>
      </div>
    );
  }

  const label = "text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block";
  const input = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all";

  return (
    <div className="bg-slate-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center gap-4 shrink-0 sticky top-0 z-10">
        <button onClick={goBack} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft size={16} /> Back to Companies
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center"><Building2 size={13} className="text-indigo-700" /></div>
          <div>
            <h1 className="text-sm font-extrabold text-slate-900 leading-tight">{isEdit ? `Edit Company — ${form.name || ""}` : "New Company"}</h1>
            <p className="text-[11px] text-slate-500 font-medium leading-tight">{isEdit ? "Update details & platform access" : "Add a sister concern company"}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={goBack} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-70 transition-all shadow-lg shadow-slate-900/20">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {isEdit ? "Save Changes" : "Create Company"}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Left: identity + GST */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-black text-slate-900">Company details</h2>

          <div>
            <label className={label}>Company Name *</label>
            <div className="relative">
              <Building2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input ref={nameRef} type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} className={`${input} pl-10`} placeholder="e.g. A Plus Digital Solutions" />
            </div>
          </div>

          <div>
            <label className={label}>GST Number</label>
            <p className="text-xs text-slate-400 mb-1.5">Used to auto-check that an uploaded contract&apos;s seller GST matches this company.</p>
            <input type="text" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })} onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} className={input} placeholder="e.g. 27ABCDE1234F1Z5" />
          </div>

          <div>
            <label className={label}>Additional GST Numbers</label>
            <p className="text-xs text-slate-400 mb-2">For companies registered under more than one GSTIN (e.g. separate state registrations) — an uploaded contract naming any of these also counts as a match.</p>
            {form.additionalGstNumbers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.additionalGstNumbers.map((gst) => (
                  <span key={gst} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold">
                    {gst}
                    <button type="button" onClick={() => removeExtraGst(gst)} className="p-0.5 hover:bg-indigo-100 rounded"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={newExtraGst} onChange={(e) => setNewExtraGst(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtraGst(); } }} className={`${input} flex-1`} placeholder="e.g. 07ABCDE1234F1Z5 — paste several separated by commas" />
              <button type="button" onClick={addExtraGst} disabled={!newExtraGst.trim()} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-bold transition-all shrink-0">Add</button>
            </div>
          </div>
        </div>

        {/* Right: platforms + switches */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-black text-slate-900 mb-1">Selling Platforms</h2>
            <p className="text-xs text-slate-400 mb-3">Leave all unselected to allow every platform.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {platformOptions.map((p) => {
                const checked = form.allowedPlatforms.includes(p.value);
                const Icon = p.icon;
                return (
                  <button key={p.value} type="button" onClick={() => togglePlatform(p.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all text-left ${checked ? `${p.bg} ${p.border} ${p.color} shadow-sm` : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 bg-white"}`}>
                    <Icon size={13} className="shrink-0" />
                    <span className="flex-1 truncate">{p.value}</span>
                    {checked && <CheckCircle size={13} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
            {strayPlatforms.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-amber-600 font-semibold mb-1.5">Not in Selling Platforms — click to remove:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {strayPlatforms.map((p) => (
                    <button key={p} type="button" onClick={() => togglePlatform(p)} className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-700 text-xs font-bold transition-all text-left hover:bg-amber-100">
                      <Globe size={13} className="shrink-0" />
                      <span className="flex-1 truncate">{p}</span>
                      <X size={13} className="shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
            <h2 className="text-base font-black text-slate-900">Settings</h2>
            <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-sm font-bold text-slate-800">Active</p>
                <p className="text-xs text-slate-500 mt-0.5">Inactive companies can&apos;t be logged into.</p>
              </div>
              <Toggle on={form.isActive} color="bg-emerald-500 border-emerald-500" onClick={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))} />
            </div>
            <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-sm font-bold text-slate-800">Due Purchase Bill (Stock In)</p>
                <p className="text-xs text-slate-500 mt-0.5">Allow stock in before the bill arrives; bill details added later.</p>
              </div>
              <Toggle on={form.dueBillEnabled} color="bg-amber-500 border-amber-500" onClick={() => setForm((prev) => ({ ...prev, dueBillEnabled: !prev.dueBillEnabled }))} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
