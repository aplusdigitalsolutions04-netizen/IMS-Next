"use client";
import React, { useEffect, useState } from "react";
import { Mail, Plus, Pencil, Trash2, X, Loader2, Save, ShieldCheck, Tags, Lock } from "lucide-react";
import Swal from "sweetalert2";
import api from "@/lib/client/apiClient";

const EMPTY_FORM = {
  guid: null,
  companyGuid: "",
  purpose: "general",
  accountName: "",
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  fromName: "",
  fromEmail: "",
  isActive: true,
  imapEnabled: false,
  imapHost: "",
  imapPort: 993,
  imapSecure: true,
};

export default function EmailAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [purposes, setPurposes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPurposes, setShowPurposes] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [accRes, compRes, purpRes] = await Promise.all([
        api.get("/email-accounts"),
        api.get("/companies"),
        api.get("/email-purposes"),
      ]);
      setAccounts(accRes.data?.data || []);
      setCompanies(compRes.data || []);
      setPurposes(purpRes.data?.data || []);
    } catch (err) {
      console.error("Failed to load email accounts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    const defaultPurpose = purposes.find((p) => p.purposeKey === "general" && p.isActive) || purposes.find((p) => p.isActive);
    setForm({ ...EMPTY_FORM, purpose: defaultPurpose?.purposeKey || "general" });
    setShowForm(true);
  };

  const openEdit = (acc) => {
    setForm({
      guid: acc.guid,
      companyGuid: acc.companyGuid || "",
      purpose: acc.purpose,
      accountName: acc.accountName,
      smtpHost: acc.smtpHost,
      smtpPort: acc.smtpPort,
      smtpSecure: !!acc.smtpSecure,
      smtpUser: acc.smtpUser,
      smtpPass: "",
      fromName: acc.fromName || "",
      fromEmail: acc.fromEmail,
      isActive: !!acc.isActive,
      imapEnabled: !!acc.imapEnabled,
      imapHost: acc.imapHost || "",
      imapPort: acc.imapPort || 993,
      imapSecure: acc.imapSecure === undefined ? true : !!acc.imapSecure,
    });
    setShowForm(true);
  };

  const handleField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, companyGuid: form.companyGuid || null };
      if (form.guid) {
        await api.put(`/email-accounts/${form.guid}`, payload);
      } else {
        await api.post("/email-accounts", payload);
      }
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Saved", timer: 1500, showConfirmButton: false });
      setShowForm(false);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to save email account", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (acc) => {
    const confirm = await Swal.fire({
      title: `Delete "${acc.accountName}"?`,
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (!confirm.isConfirmed) return;
    try {
      await api.delete(`/email-accounts/${acc.guid}`);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to delete", "error");
    }
  };

  const purposeLabel = (key) => purposes.find((p) => p.purposeKey === key)?.label || key;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
            <Mail className="text-indigo-600" size={24} /> Email Accounts
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure SMTP accounts per company and purpose. Falls back to the default SMTP account when nothing matches.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowPurposes(true)}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2"
          >
            <Tags size={16} /> Manage Purposes
          </button>
          <button
            onClick={openNew}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md shadow-indigo-100"
          >
            <Plus size={16} /> New Account
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-indigo-600" size={26} />
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No email accounts configured yet — the app currently falls back to the single SMTP_* account in .env.local.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Name</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Purpose</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Company</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">From Email</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">SMTP Host</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Status</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((acc) => (
                <tr key={acc.guid} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-700 whitespace-nowrap">{acc.accountName}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600">{purposeLabel(acc.purpose)}</span>
                  </td>
                  <td className="p-3 whitespace-nowrap text-slate-600">{acc.companyName || <span className="text-slate-400">All companies</span>}</td>
                  <td className="p-3 whitespace-nowrap text-slate-600">{acc.fromEmail}</td>
                  <td className="p-3 whitespace-nowrap text-slate-500">{acc.smtpHost}:{acc.smtpPort}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${acc.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {acc.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(acc)} className="text-indigo-500 hover:text-indigo-700" title="Edit">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => handleDelete(acc)} className="text-rose-500 hover:text-rose-700" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <ShieldCheck size={18} className="text-indigo-600" /> {form.guid ? "Edit" : "New"} Email Account
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Account Name</label>
                <input
                  value={form.accountName}
                  onChange={(e) => handleField("accountName", e.target.value)}
                  placeholder="e.g. Dispatch Notifications"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Purpose</label>
                  <select
                    value={form.purpose}
                    onChange={(e) => handleField("purpose", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {purposes.filter((p) => p.isActive).map((p) => (
                      <option key={p.purposeKey} value={p.purposeKey}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Company</label>
                  <select
                    value={form.companyGuid}
                    onChange={(e) => handleField("companyGuid", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">All Companies (default)</option>
                    {companies.map((c) => (
                      <option key={c.guid} value={c.guid}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">SMTP Host</label>
                  <input
                    value={form.smtpHost}
                    onChange={(e) => handleField("smtpHost", e.target.value)}
                    placeholder="mail.yourdomain.com"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Port</label>
                  <input
                    type="number"
                    value={form.smtpPort}
                    onChange={(e) => handleField("smtpPort", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={form.smtpSecure} onChange={(e) => handleField("smtpSecure", e.target.checked)} />
                    Secure (SSL)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">SMTP Username</label>
                  <input
                    value={form.smtpUser}
                    onChange={(e) => handleField("smtpUser", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                    SMTP Password {form.guid && <span className="normal-case font-medium text-slate-400">(leave blank to keep current)</span>}
                  </label>
                  <input
                    type="password"
                    value={form.smtpPass}
                    onChange={(e) => handleField("smtpPass", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">From Name</label>
                  <input
                    value={form.fromName}
                    onChange={(e) => handleField("fromName", e.target.value)}
                    placeholder="A Plus Digital Solutions"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">From Email</label>
                  <input
                    value={form.fromEmail}
                    onChange={(e) => handleField("fromEmail", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => handleField("isActive", e.target.checked)} />
                Active
              </label>

              <div className="border-t border-slate-100 pt-4">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer mb-3">
                  <input type="checkbox" checked={form.imapEnabled} onChange={(e) => handleField("imapEnabled", e.target.checked)} />
                  Read replies from this inbox (IMAP)
                </label>
                {form.imapEnabled && (
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">IMAP Host</label>
                      <input
                        value={form.imapHost}
                        onChange={(e) => handleField("imapHost", e.target.value)}
                        placeholder="mail.yourdomain.com"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Port</label>
                      <input
                        type="number"
                        value={form.imapPort}
                        onChange={(e) => handleField("imapPort", e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="flex items-end pb-1.5">
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={form.imapSecure} onChange={(e) => handleField("imapSecure", e.target.checked)} />
                        Secure (SSL)
                      </label>
                    </div>
                    <p className="col-span-2 text-[11px] text-slate-400">Uses the same SMTP username/password above to log in.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md transition-all"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                {saving ? "Saving..." : "Save Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPurposes && (
        <ManagePurposesModal purposes={purposes} onClose={() => setShowPurposes(false)} onChanged={load} />
      )}
    </div>
  );
}

function ManagePurposesModal({ purposes, onClose, onChanged }) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await api.post("/email-purposes", { purposeKey: label.trim(), label: label.trim() });
      setLabel("");
      await onChanged();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to add purpose", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p) => {
    try {
      await api.put(`/email-purposes/${p.guid}`, { label: p.label, isActive: !p.isActive });
      await onChanged();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to update purpose", "error");
    }
  };

  const handleDelete = async (p) => {
    const confirm = await Swal.fire({
      title: `Delete "${p.label}"?`,
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (!confirm.isConfirmed) return;
    try {
      await api.delete(`/email-purposes/${p.guid}`);
      await onChanged();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to delete purpose", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Tags size={18} className="text-indigo-600" /> Manage Purposes
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3">
          <div className="flex gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Installation, Returns, OTP"
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !label.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />} Add
            </button>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {purposes.map((p) => (
              <div key={p.guid} className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700">{p.label}</span>
                  {p.isSystem && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-white border border-slate-200 rounded-full px-1.5 py-0.5">
                      <Lock size={9} /> system
                    </span>
                  )}
                  {!p.isActive && (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!p.isSystem && (
                    <button onClick={() => toggleActive(p)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                      {p.isActive ? "Deactivate" : "Activate"}
                    </button>
                  )}
                  {!p.isSystem && (
                    <button onClick={() => handleDelete(p)} className="text-rose-500 hover:text-rose-700">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
