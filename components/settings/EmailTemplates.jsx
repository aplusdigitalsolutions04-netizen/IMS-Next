"use client";
import React, { useEffect, useRef, useState } from "react";
import { FileText, Plus, Pencil, Trash2, X, Loader2, Save, Eye, EyeOff, Tags, Lock } from "lucide-react";
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

// Mirrors the fixed set app/api/warranty/email-preview/[orderGuid]/route.js
// auto-fills from the order. Anything typed that isn't one of these still
// works — the compose screen prompts the sender to fill it in manually
// (see EmailComposeTab.jsx's pendingVars) — this list is just what's
// auto-filled for you, so it's worth knowing before inventing a new one.
const KNOWN_VARIABLES = [
  { name: "CUSTOMER_NAME", desc: "Buyer/customer name" },
  { name: "CONSIGNEE_NAME", desc: "Consignee name" },
  { name: "ORDER_ID", desc: "Order number" },
  { name: "INVOICE_NUMBER", desc: "Invoice number" },
  { name: "GEM_NUMBER", desc: "GeM/order/bid number" },
  { name: "ADDRESS", desc: "Shipping/billing/buyer address, whichever is set" },
  { name: "SHIPPING_ADDRESS", desc: "Shipping address only" },
  { name: "BILLING_ADDRESS", desc: "Billing address only" },
  { name: "BUYER_ADDRESS", desc: "Buyer address only" },
  { name: "CONTACT_NUMBER", desc: "Customer phone number" },
  { name: "PRODUCT_NAME", desc: "Model/product name" },
  { name: "SERIAL_NUMBER", desc: "One serial number" },
  { name: "SERIAL_NUMBERS", desc: "All serials, comma-separated" },
  { name: "QUANTITY", desc: "Quantity" },
  { name: "AMOUNT", desc: "Selling price" },
  { name: "PURCHASE_DATE", desc: "Order date" },
  { name: "DISPATCH_DATE", desc: "Dispatch date" },
  { name: "WARRANTY_PERIOD", desc: "e.g. 1 Year" },
  { name: "WARRANTY_EXPIRY", desc: "Calculated expiry date" },
  { name: "GST_NUMBER", desc: "Buyer GST number" },
  { name: "COMPANY_NAME", desc: "Your company name" },
  { name: "CERT_NUMBER", desc: "Auto-generated certificate number" },
  // The rest of what the order's own detail view shows.
  { name: "PLATFORM", desc: "Order platform (GeM, Amazon, ...)" },
  { name: "ORDER_STATUS", desc: "Order status" },
  { name: "GEM_ORDER_TYPE", desc: "GeM order type" },
  { name: "BUYER_EMAIL", desc: "Buyer email" },
  { name: "CONSIGNEE_EMAIL", desc: "Consignee email" },
  { name: "PAYMENT_AUTHORITY_EMAIL", desc: "Payment authority email" },
  { name: "ALT_CONTACT_NUMBER", desc: "Alternate contact number" },
  { name: "INVOICE_DATE", desc: "Invoice date" },
  { name: "GSTIN", desc: "Buyer GSTIN" },
  { name: "EWAY_BILL_NUMBER", desc: "E-way bill number" },
  { name: "FREIGHT_CHARGES", desc: "Freight charges" },
  { name: "PACKAGING_COST", desc: "Packaging cost" },
  { name: "COMMISSION", desc: "Commission" },
  { name: "ORDER_REMARKS", desc: "Order-level remarks" },
  { name: "ITEM_REMARKS", desc: "Item-level remarks" },
  { name: "COURIER_PARTNER", desc: "Courier partner" },
  { name: "TRACKING_ID", desc: "Tracking ID" },
  { name: "LOGISTICS_STATUS", desc: "Logistics status" },
  { name: "LOGISTICS_DISPATCH_DATE", desc: "Logistics dispatch date" },
  { name: "LAST_DELIVERY_DATE", desc: "Last delivery date" },
  { name: "WARRANTY_START_DATE", desc: "Warranty start date" },
];

function insertAtCursor(ref, text) {
  const el = ref.current;
  if (!el) return null;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const newVal = el.value.slice(0, start) + text + el.value.slice(end);
  const newPos = start + text.length;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(newPos, newPos);
  });
  return newVal;
}

export default function EmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [purposes, setPurposes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPurposes, setShowPurposes] = useState(false);
  const [preview, setPreview] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [customVarName, setCustomVarName] = useState("");

  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const lastFocus = useRef("body"); // 'subject' | 'body'

  const load = async () => {
    setLoading(true);
    try {
      // /companies is Admin-only (used for the Company scope dropdown below)
      // — a role with just Email Templates access legitimately can't call
      // it. allSettled + a per-call fallback keeps templates/purposes
      // loading even when that one 403s, instead of failing the whole page.
      // /email-accounts needs the "emailAccounts" permission too — a role
      // with just Email Templates access may not have it, same reasoning
      // as /companies above.
      const [tplRes, compRes, purpRes, acctRes] = await Promise.allSettled([
        api.get("/email-templates"),
        api.get("/companies"),
        api.get("/email-purposes"),
        api.get("/email-accounts"),
      ]);
      if (tplRes.status === "fulfilled") setTemplates(tplRes.value.data?.data || []);
      else console.error("Failed to load email templates:", tplRes.reason);
      if (compRes.status === "fulfilled") setCompanies(compRes.value.data || []);
      else setCompanies([]);
      if (purpRes.status === "fulfilled") setPurposes(purpRes.value.data?.data || []);
      else console.error("Failed to load email purposes:", purpRes.reason);
      if (acctRes.status === "fulfilled") setAccounts(acctRes.value.data?.data || []);
      else setAccounts([]);
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

  const insertVariable = (name) => {
    const token = `{{${name}}}`;
    const targetKey = lastFocus.current === "subject" ? "emailSubject" : "emailBody";
    const targetRef = lastFocus.current === "subject" ? subjectRef : bodyRef;
    const newVal = insertAtCursor(targetRef, token);
    if (newVal !== null) handleField(targetKey, newVal);
  };

  const insertCustomVariable = () => {
    // Same {{A-Z0-9_}} shape the compose screen looks for (see
    // email-preview route's unresolvedVariables regex) — normalize so a
    // sloppily-typed name still gets picked up as a fillable variable
    // there instead of silently not matching.
    const name = customVarName.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!name) return;
    insertVariable(name);
    setCustomVarName("");
  };

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

  // Mirrors lib/mailer.js's resolveEmailAccount priority order — this
  // template's own purpose/company don't pick a webmail directly, they
  // just narrow down which Email Account gets used to actually send it.
  // Surfacing that match here (instead of it only being visible once an
  // email actually goes out) also catches the case where more than one
  // account shares a purpose — the sender only ever sees one of them, and
  // that ambiguity used to be invisible until now.
  const resolveAccountsFor = (purpose, companyGuid) => {
    const active = accounts.filter((a) => a.isActive);
    const exact = active.filter((a) => (a.companyGuid || "") === (companyGuid || "") && a.purpose === purpose);
    if (exact.length) return exact;
    const companyGeneral = active.filter((a) => (a.companyGuid || "") === (companyGuid || "") && a.purpose === "general");
    if (companyGeneral.length) return companyGeneral;
    const globalMatch = active.filter((a) => !a.companyGuid && a.purpose === purpose);
    if (globalMatch.length) return globalMatch;
    const globalGeneral = active.filter((a) => !a.companyGuid && a.purpose === "general");
    return globalGeneral;
  };

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
          <Plus size={16} /> New Template
        </button>
        </div>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden max-h-[90vh] flex flex-col">
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
              {!preview && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    Click to insert into Subject/Body at your cursor — auto-filled from the order when sent
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {KNOWN_VARIABLES.map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        title={v.desc}
                        onClick={() => insertVariable(v.name)}
                        className="text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-1 rounded-lg transition-colors"
                      >
                        {`{{${v.name}}}`}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide shrink-0">New variable</span>
                    <input
                      value={customVarName}
                      onChange={(e) => setCustomVarName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertCustomVariable(); } }}
                      placeholder="e.g. Alternate Contact"
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    <button
                      type="button"
                      onClick={insertCustomVariable}
                      disabled={!customVarName.trim()}
                      className="shrink-0 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition"
                    >
                      Insert
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Not on the list above and not sent by the feature automatically — whoever sends this template gets asked to fill it in by hand.
                  </p>
                </div>
              )}

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

              {(() => {
                const matches = resolveAccountsFor(form.purpose, form.companyGuid);
                if (matches.length === 0) {
                  return (
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      No connected webmail matches this Purpose/Company — this template can&apos;t actually send until one does. Add or adjust one under Email Accounts.
                    </div>
                  );
                }
                if (matches.length > 1) {
                  return (
                    <div className="flex items-start gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <span>
                        Multiple webmails match — the send will pick just one of these unpredictably: {matches.map((a) => a.accountName).join(", ")}.
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    Sends from <span className="font-bold text-slate-700">{matches[0].accountName}</span> ({matches[0].fromEmail})
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Email Subject</label>
                {preview ? (
                  <div className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-800 min-h-[38px]">
                    {renderPreview(form.emailSubject) || <span className="text-slate-400 italic">No subject set</span>}
                  </div>
                ) : (
                  <input
                    ref={subjectRef}
                    value={form.emailSubject}
                    onChange={(e) => handleField("emailSubject", e.target.value)}
                    onFocus={() => { lastFocus.current = "subject"; }}
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
                    ref={bodyRef}
                    rows={11}
                    value={form.emailBody}
                    onChange={(e) => handleField("emailBody", e.target.value)}
                    onFocus={() => { lastFocus.current = "body"; }}
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
