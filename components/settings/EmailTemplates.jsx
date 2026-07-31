"use client";
import React, { useEffect, useState } from "react";
import { FileText, Plus, Pencil, Trash2, X, Loader2, Save, Eye, EyeOff } from "lucide-react";
import Swal from "sweetalert2";
import api from "@/lib/client/apiClient";

const EMPTY_FORM = {
  guid: null,
  companyGuid: "",
  purpose: "general",
  templateName: "",
  emailSubject: "",
  emailBody: "",
  emailCc: "",
  emailBcc: "",
  isActive: true,
};

export default function EmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [purposes, setPurposes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [tplRes, compRes, purpRes] = await Promise.all([
        api.get("/email-templates"),
        api.get("/companies"),
        api.get("/email-purposes"),
      ]);
      setTemplates(tplRes.data?.data || []);
      setCompanies(compRes.data || []);
      setPurposes(purpRes.data?.data || []);
    } catch (err) {
      console.error("Failed to load email templates:", err);
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
    setPreview(false);
    setShowForm(true);
  };

  const openEdit = (tpl) => {
    setForm({
      guid: tpl.guid,
      companyGuid: tpl.companyGuid || "",
      purpose: tpl.purpose,
      templateName: tpl.templateName,
      emailSubject: tpl.emailSubject,
      emailBody: tpl.emailBody,
      emailCc: tpl.emailCc || "",
      emailBcc: tpl.emailBcc || "",
      isActive: !!tpl.isActive,
    });
    setPreview(false);
    setShowForm(true);
  };

  const handleField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, companyGuid: form.companyGuid || null };
      if (form.guid) {
        await api.put(`/email-templates/${form.guid}`, payload);
      } else {
        await api.post("/email-templates", payload);
      }
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Saved", timer: 1500, showConfirmButton: false });
      setShowForm(false);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to save template", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl) => {
    const confirm = await Swal.fire({
      title: `Delete "${tpl.templateName}"?`,
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (!confirm.isConfirmed) return;
    try {
      await api.delete(`/email-templates/${tpl.guid}`);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to delete", "error");
    }
  };

  const purposeLabel = (key) => purposes.find((p) => p.purposeKey === key)?.label || key;

  const SAMPLE_DATA = {
    CUSTOMER_NAME: "Ministry of Finance",
    ORDER_ID: "GEMC-511687780612696",
    PRODUCT_NAME: "HP 4104dw",
    AMOUNT: "45,000",
    COMPANY_NAME: "A Plus Digital Solutions",
  };
  const renderPreview = (text) =>
    Object.entries(SAMPLE_DATA).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(v), text || "");

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
            <FileText className="text-indigo-600" size={24} /> Email Templates
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Subject &amp; body templates per company and purpose, with {"{{PLACEHOLDER}}"} substitution — used automatically when a feature sends that purpose's email.
          </p>
        </div>
        <button
          onClick={openNew}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md shadow-indigo-100 shrink-0"
        >
          <Plus size={16} /> New Template
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-indigo-600" size={26} />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No templates configured yet — features that send email will build their own subject/body unless a template is set here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Name</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Purpose</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Company</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Subject</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Status</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map((tpl) => (
                <tr key={tpl.guid} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-700 whitespace-nowrap">{tpl.templateName}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600">{purposeLabel(tpl.purpose)}</span>
                  </td>
                  <td className="p-3 whitespace-nowrap text-slate-600">{tpl.companyName || <span className="text-slate-400">All companies</span>}</td>
                  <td className="p-3 max-w-[260px] truncate text-slate-500" title={tpl.emailSubject}>{tpl.emailSubject}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${tpl.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {tpl.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(tpl)} className="text-indigo-500 hover:text-indigo-700" title="Edit">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => handleDelete(tpl)} className="text-rose-500 hover:text-rose-700" title="Delete">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <FileText size={18} className="text-indigo-600" /> {form.guid ? "Edit" : "New"} Email Template
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreview((p) => !p)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition"
                >
                  {preview ? <EyeOff size={13} /> : <Eye size={13} />} {preview ? "Edit" : "Preview"}
                </button>
                <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Use any {"{{PLACEHOLDER}}"} in the subject/body — filled in by whatever data the sending feature passes (e.g. {"{{CUSTOMER_NAME}}"}, {"{{ORDER_ID}}"}, {"{{AMOUNT}}"}).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Template Name</label>
                <input
                  value={form.templateName}
                  onChange={(e) => handleField("templateName", e.target.value)}
                  placeholder="e.g. Dispatch Confirmation"
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

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Email Subject</label>
                {preview ? (
                  <div className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-800 min-h-[38px]">
                    {renderPreview(form.emailSubject) || <span className="text-slate-400 italic">No subject set</span>}
                  </div>
                ) : (
                  <input
                    value={form.emailSubject}
                    onChange={(e) => handleField("emailSubject", e.target.value)}
                    placeholder="e.g. Your order {{ORDER_ID}} has been dispatched"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">CC <span className="normal-case font-medium text-slate-400">(optional)</span></label>
                  <input
                    value={form.emailCc}
                    onChange={(e) => handleField("emailCc", e.target.value)}
                    placeholder="cc@example.com, another@example.com"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">BCC <span className="normal-case font-medium text-slate-400">(optional)</span></label>
                  <input
                    value={form.emailBcc}
                    onChange={(e) => handleField("emailBcc", e.target.value)}
                    placeholder="bcc@example.com"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Email Body</label>
                {preview ? (
                  <div className="border border-slate-200 rounded-xl px-3 py-3 text-sm bg-slate-50 text-slate-800 min-h-[220px] whitespace-pre-wrap">
                    {renderPreview(form.emailBody) || <span className="text-slate-400 italic">No body set</span>}
                  </div>
                ) : (
                  <textarea
                    rows={11}
                    value={form.emailBody}
                    onChange={(e) => handleField("emailBody", e.target.value)}
                    placeholder={`Dear {{CUSTOMER_NAME}},\n\nYour order {{ORDER_ID}} for {{PRODUCT_NAME}} has been dispatched.\n\nThanks,\n{{COMPANY_NAME}}`}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100 font-mono resize-y"
                  />
                )}
              </div>


              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => handleField("isActive", e.target.checked)} />
                Active
              </label>
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md transition-all"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                {saving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
