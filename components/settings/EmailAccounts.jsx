"use client";
import React, { useEffect, useState } from "react";
import { Mail, Plus, Pencil, Trash2, X, Loader2, Save, ShieldCheck, Users as UsersIcon } from "lucide-react";
import Swal from "sweetalert2";
import api from "@/lib/client/apiClient";
import RichTextEditor from "./RichTextEditor";
import { getStoredUser } from "@/lib/client/auth";

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
  signature: "",
  sharedWith: [],
};

export default function EmailAccounts() {
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === "Admin";

  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [purposes, setPurposes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      // /companies is Admin-only (the "companyMaster" permission, used for
      // the multi-company scope dropdown below) — a role with just
      // "Email Accounts" access legitimately can't call it. That 403 used
      // to reject this whole Promise.all and blank out accounts/purposes
      // too, even though those two calls succeed fine on their own.
      // allSettled + a per-call fallback keeps the rest of the page
      // working; the company dropdown just stays empty for that role.
      // /users is only fetched for Admin — it's the "Shared With" picker,
      // which only Admin can even use (see the sharedWith save gate on the
      // API side), so a non-admin has no need for it and may well lack the
      // "users" permission that route requires anyway.
      const calls = [
        api.get("/email-accounts"),
        api.get("/companies"),
        api.get("/email-purposes"),
      ];
      if (isAdmin) calls.push(api.get("/users"));
      const [accRes, compRes, purpRes, usersRes] = await Promise.allSettled(calls);
      if (accRes.status === "fulfilled") setAccounts(accRes.value.data?.data || []);
      else console.error("Failed to load email accounts:", accRes.reason);
      if (compRes.status === "fulfilled") setCompanies(compRes.value.data || []);
      else setCompanies([]);
      if (purpRes.status === "fulfilled") setPurposes(purpRes.value.data?.data || []);
      else console.error("Failed to load email purposes:", purpRes.reason);
      if (isAdmin && usersRes?.status === "fulfilled") setUsers(usersRes.value.data?.data || []);
      else if (isAdmin) console.error("Failed to load users:", usersRes?.reason);
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
    setTestResult(null);
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
      signature: acc.signature || "",
      sharedWith: Array.isArray(acc.sharedWith) ? acc.sharedWith.map(String) : [],
    });
    setTestResult(null);
    setShowForm(true);
  };

  const SMTP_FIELDS = ["smtpHost", "smtpPort", "smtpSecure", "smtpUser", "smtpPass"];
  const handleField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // A previous "Connection successful" doesn't mean anything once one of
    // the credentials it was tested with has changed.
    if (SMTP_FIELDS.includes(key)) setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!form.smtpHost?.trim() || !form.smtpUser?.trim()) {
      setTestResult({ ok: false, message: "Fill in SMTP host and username first." });
      return;
    }
    // Editing an existing account leaves the password blank ("keep
    // current") — there's nothing here to actually test against in that
    // case, so ask for it explicitly rather than silently testing a blank
    // password and reporting a misleading failure.
    if (!form.smtpPass?.trim()) {
      setTestResult({ ok: false, message: form.guid ? "Enter the password to test this connection (it's blank because it's unchanged)." : "Enter the SMTP password first." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post("/email-accounts/test-connection", {
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        smtpSecure: form.smtpSecure,
        smtpUser: form.smtpUser,
        smtpPass: form.smtpPass,
      });
      setTestResult({ ok: true, message: res.data?.message || "Connection successful" });
    } catch (err) {
      setTestResult({ ok: false, message: err?.response?.data?.message || err.message || "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
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

              <div>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
                >
                  {testing ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                  {testing ? "Testing..." : "Test Connection"}
                </button>
                {testResult && (
                  <p className={`mt-2 text-xs font-semibold ${testResult.ok ? "text-emerald-700" : "text-red-600"}`}>
                    {testResult.ok ? "✓ " : "✗ "}{testResult.message}
                  </p>
                )}
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

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Signature <span className="normal-case font-medium text-slate-400">(inserted with one click when composing)</span>
                </label>
                <RichTextEditor
                  value={form.signature}
                  onChange={(html) => handleField("signature", html)}
                  placeholder="e.g. Regards, Support Team"
                  minHeight={100}
                />
              </div>

              {isAdmin && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <UsersIcon size={13} /> Shared With <span className="normal-case font-medium text-slate-400">(besides you, who else can read this account&apos;s Inbox/Sent/Compose)</span>
                  </label>
                  {users.filter((u) => u.id !== currentUser?.id).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No other users to share with.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2.5">
                      {users.filter((u) => u.id !== currentUser?.id).map((u) => {
                        const checked = form.sharedWith.includes(String(u.id));
                        return (
                          <label key={u.id} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...form.sharedWith, String(u.id)]
                                  : form.sharedWith.filter((id) => id !== String(u.id));
                                handleField("sharedWith", next);
                              }}
                            />
                            {u.fullName || u.username}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

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

    </div>
  );
}
