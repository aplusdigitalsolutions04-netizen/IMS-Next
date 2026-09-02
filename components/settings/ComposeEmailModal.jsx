"use client";
import React, { useEffect, useState } from "react";
import { Mail, X, FileText, Plus, Loader2, Send, AlertCircle, CheckCircle, Trash2, PenLine } from "lucide-react";
import Swal from "sweetalert2";
import api from "@/lib/client/apiClient";
import RichTextEditor, { insertHtmlAtEnd } from "./RichTextEditor";

// A fresh, order-independent email — for Settings > Email Inbox, where
// there's an account (and so an accountGuid + purpose) to send from but no
// order to auto-fill To/subject/body from. Reuses the same {{VAR}} template
// mechanism as Order Tracking's EmailComposeTab, just against the raw
// template text (from /warranty/templates) instead of the order-aware
// /warranty/email-preview/[orderGuid] endpoint — every {{VAR}} the chosen
// template uses is "pending" here since there's no order data to resolve
// any of them automatically.
const VAR_REGEX = /\{\{([A-Z0-9_]+)\}\}/g;

export default function ComposeEmailModal({ account, onClose, onSent }) {
  const [templatePicker, setTemplatePicker] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [pickedTemplateGuid, setPickedTemplateGuid] = useState(null);

  const [draft, setDraft] = useState({ to: "", cc: "", bcc: "", subject: "", body: "" });
  const [pendingVars, setPendingVars] = useState([]);
  const [pendingVarValues, setPendingVarValues] = useState({});
  const [attachments, setAttachments] = useState([]);
  // Images inserted inline via the editor's toolbar — sent as cid
  // attachments (referenced by the <img src="cid:..."> the editor already
  // wrote into draft.body), separate from the "Add File" list below.
  const [inlineImages, setInlineImages] = useState([]);
  const fileRef = React.useRef(null);

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTemplatesLoading(true);
    api.get("/warranty/templates")
      .then((res) => setTemplates(res.data?.data || []))
      .catch((e) => { console.error("Failed to load templates:", e); setTemplates([]); })
      .finally(() => setTemplatesLoading(false));
  }, []);

  const findPendingVars = (subject, body) =>
    [...new Set([...subject.matchAll(VAR_REGEX), ...body.matchAll(VAR_REGEX)].map((m) => m[1]))];

  // Templates are authored as plain text (Settings > Email Templates uses a
  // plain textarea) — the rich editor here treats draft.body as HTML, so a
  // bare "\n" would just be swallowed instead of showing as a line break.
  const plainToHtml = (text) => (text || "").replace(/\n/g, "<br>");

  const pickTemplate = (tpl) => {
    setPickedTemplateGuid(tpl.guid);
    const bodyHtml = plainToHtml(tpl.emailBody || "");
    setDraft({ to: "", cc: tpl.emailCc || "", bcc: tpl.emailBcc || "", subject: tpl.emailSubject || "", body: bodyHtml });
    setPendingVars(findPendingVars(tpl.emailSubject || "", tpl.emailBody || ""));
    setPendingVarValues({});
    setInlineImages([]);
    setTemplatePicker(false);
  };

  const skipTemplate = () => {
    setPickedTemplateGuid(null);
    setDraft({ to: "", cc: "", bcc: "", subject: "", body: "" });
    setPendingVars([]);
    setPendingVarValues({});
    setInlineImages([]);
    setTemplatePicker(false);
  };

  const applyPendingVar = (varName) => {
    const value = (pendingVarValues[varName] || "").trim();
    if (!value) return;
    const token = `{{${varName}}}`;
    setDraft((d) => ({ ...d, subject: d.subject.split(token).join(value), body: d.body.split(token).join(value) }));
    setPendingVars((prev) => prev.filter((v) => v !== varName));
  };

  const insertSignature = () => {
    if (!account.signature) return;
    setDraft((d) => ({ ...d, body: insertHtmlAtEnd(d.body, account.signature) }));
  };

  const discardDraft = async () => {
    if (!draft.to && !draft.subject && !draft.body) { onClose(); return; }
    const confirm = await Swal.fire({
      title: "Discard this draft?",
      text: "Whatever you've written will be lost.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Discard",
      confirmButtonColor: "#e11d48",
    });
    if (!confirm.isConfirmed) return;
    onClose();
  };

  const handleFileAdd = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(",")[1];
        setAttachments((prev) => [...prev, { name: file.name, size: file.size, type: file.type, base64 }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleSend = async () => {
    if (!draft.to.trim()) { setError('"To" email is required'); return; }
    if (!draft.subject.trim()) { setError("Subject is required"); return; }
    if (!draft.body.trim()) { setError("Email body is required"); return; }
    if (pendingVars.length > 0) { setError(`Fill in the highlighted variable${pendingVars.length > 1 ? "s" : ""} below before sending.`); return; }
    setSending(true);
    setError("");
    try {
      await api.post("/warranty/send-email", {
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        bodyHtml: draft.body,
        accountGuid: account.guid,
        purpose: account.purpose,
        attachments: [
          ...attachments.map((a) => ({ filename: a.name, content: a.base64, encoding: "base64", contentType: a.type })),
          ...inlineImages.map((img) => ({ filename: img.filename, content: img.content, encoding: "base64", contentType: img.contentType, cid: img.cid })),
        ],
      });
      setSent(true);
      onSent?.();
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Mail size={18} className="text-indigo-600" /> Compose Email
            <span className="text-xs font-semibold text-slate-400">via {account.accountName}</span>
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3">
          {templatePicker ? (
            <>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <p className="text-sm font-bold text-slate-800">Choose a Template (optional)</p>
                </div>
                <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
                  {templatesLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="animate-spin text-indigo-600" size={22} /></div>
                  ) : templates.length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                      <Mail size={24} className="mx-auto mb-2 opacity-30" />
                      <p className="text-xs font-semibold">No email templates configured yet.</p>
                    </div>
                  ) : (
                    templates.map((tpl) => (
                      <button
                        key={tpl.guid}
                        onClick={() => pickTemplate(tpl)}
                        className={`w-full text-left p-3 rounded-xl border-2 transition-all ${pickedTemplateGuid === tpl.guid ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold text-slate-700">{tpl.templateName}</div>
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full uppercase shrink-0">{tpl.purpose}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">{tpl.emailSubject}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <button
                onClick={skipTemplate}
                className="w-full px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-xl transition"
              >
                Skip — write from scratch
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setTemplatePicker(true)}
                className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600"
              >
                &larr; Change Template
              </button>

              {pendingVars.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-2.5">
                  <p className="text-xs font-bold text-amber-800">
                    This template uses {pendingVars.length} variable{pendingVars.length > 1 ? "s" : ""} — enter a value for each:
                  </p>
                  {pendingVars.map((varName) => (
                    <div key={varName} className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-1.5 rounded-lg">{`{{${varName}}}`}</span>
                      <input
                        type="text"
                        value={pendingVarValues[varName] || ""}
                        onChange={(e) => setPendingVarValues((prev) => ({ ...prev, [varName]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPendingVar(varName); } }}
                        placeholder="Enter value"
                        className="flex-1 border border-amber-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => applyPendingVar(varName)}
                        disabled={!pendingVarValues[varName]?.trim()}
                        className="shrink-0 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition"
                      >
                        Apply
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">To</label>
                <input type="text" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} placeholder="recipient@example.com" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">CC</label>
                  <input type="text" value={draft.cc} onChange={(e) => setDraft((d) => ({ ...d, cc: e.target.value }))} placeholder="cc@example.com" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">BCC</label>
                  <input type="text" value={draft.bcc} onChange={(e) => setDraft((d) => ({ ...d, bcc: e.target.value }))} placeholder="bcc@example.com" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Subject</label>
                <input type="text" value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} placeholder="Email subject" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Body</label>
                  {account.signature && (
                    <button
                      type="button"
                      onClick={insertSignature}
                      className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      <PenLine size={11} /> Insert Signature
                    </button>
                  )}
                </div>
                <RichTextEditor
                  value={draft.body}
                  onChange={(html) => setDraft((d) => ({ ...d, body: html }))}
                  onInsertInlineImage={(img) => setInlineImages((prev) => [...prev, img])}
                  placeholder="Write your email..."
                  minHeight={200}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Attachments</label>
                  <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition">
                    <Plus size={11} /> Add File
                  </button>
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileAdd} />
                </div>
                {attachments.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No attachments</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                        <FileText size={11} className="text-slate-400" />
                        <span className="text-xs text-slate-700 max-w-[160px] truncate">{a.name}</span>
                        <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 ml-1">
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {!templatePicker && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 shrink-0 bg-slate-50">
            <div className="flex items-center gap-3">
              <button
                onClick={discardDraft}
                disabled={sending || sent}
                title="Discard draft"
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-40"
              >
                <Trash2 size={16} />
              </button>
              {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {error}</p>}
              {sent && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={12} /> Email sent successfully!</p>}
            </div>
            <button
              onClick={handleSend}
              disabled={sending || sent || pendingVars.length > 0}
              title={pendingVars.length > 0 ? "Fill in the variables above first" : undefined}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold px-5 py-2 rounded-xl transition"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sending ? "Sending..." : sent ? "Sent!" : "Send Email"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
