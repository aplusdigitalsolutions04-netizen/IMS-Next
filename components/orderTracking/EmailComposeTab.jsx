"use client";
import React from "react";
import { Mail, RefreshCw, Eye, AlertCircle, CheckCircle, Send, Plus, X, FileText, Loader2 } from "lucide-react";
import api from "@/lib/client/apiClient";

// Extracted out of OrderDetailModal.jsx — was ~800 lines inlined into that
// file's "Email" tab (state, handlers, and the choose-template/compose/
// preview JSX all in one place). Fully self-contained: only needs the
// order's guid, resolves the template list, the connected-account send, and
// composing/attaching/sending on its own. Loads its own draft on mount
// instead of the parent driving it via tab-click, since it's only ever
// rendered while the Email tab is active.
export default function EmailComposeTab({ orderGuid }) {
  const [emailDraft, setEmailDraft] = React.useState(null);
  const [emailSending, setEmailSending] = React.useState(false);
  const [emailSent, setEmailSent] = React.useState(false);
  const [emailError, setEmailError] = React.useState("");
  const [emailPreview, setEmailPreview] = React.useState(false);
  const [emailAttachments, setEmailAttachments] = React.useState([]);
  const emailFileRef = React.useRef(null);
  // "Choose Template" step — always shown before compose. Whichever template
  // the user picks (from any purpose, not just warranty) decides both the
  // content AND, via its purpose, which connected email account the send
  // auto-resolves to — no separate account picker needed.
  const [templatePicker, setTemplatePicker] = React.useState(null); // { templates } | null
  const [pickedTemplateGuid, setPickedTemplateGuid] = React.useState(null);
  const [pickedTemplatePurpose, setPickedTemplatePurpose] = React.useState(null);
  // Any {{VAR}} the template used that isn't one of the fixed order fields
  // (see app/api/warranty/email-preview/[orderGuid]/route.js) — the server
  // leaves those literally in the subject/body and tells us their names via
  // unresolvedVariables. This is also how a template author adds a brand
  // new variable: just type {{ANYTHING}} in the template, no separate
  // place to register it — it shows up here to fill in at send time.
  const [pendingVars, setPendingVars] = React.useState([]);
  const [pendingVarValues, setPendingVarValues] = React.useState({});

  // `blank` = "Skip" was picked in the template step — recipient still
  // comes from the order (that's just useful default data, not a
  // template), but subject/body come back empty instead of prefilled from
  // the default warranty_template, so it reads like a normal blank compose
  // window rather than forcing a template's wording on the sender.
  const loadEmailDraft = async (templateGuid, { blank = false } = {}) => {
    setEmailDraft({ to: "", cc: "", bcc: "", subject: "", body: "", loading: true });
    setPendingVars([]);
    setPendingVarValues({});
    setEmailSent(false);
    setEmailError("");
    setEmailPreview(false);
    setEmailAttachments([]);
    try {
      const qs = templateGuid ? `?templateGuid=${encodeURIComponent(templateGuid)}` : "";
      const res = await api.get(`/warranty/email-preview/${orderGuid}${qs}`);
      if (blank) {
        setEmailDraft({ to: res.data?.to || "", cc: "", bcc: "", subject: "", body: "", loading: false });
        setPendingVars([]);
      } else {
        setEmailDraft({ ...res.data, loading: false });
        setPendingVars(res.data?.unresolvedVariables || []);
      }
      setEmailError("");
    } catch (e) {
      setEmailDraft((d) => ({ ...d, loading: false }));
      setEmailError(e?.response?.data?.message || "Could not load email template. Check backend.");
    }
  };

  const loadTemplateOptions = async () => {
    try {
      const tplRes = await api.get("/warranty/templates");
      setTemplatePicker({ templates: tplRes.data?.data || [] });
    } catch (e) {
      console.error("Failed to load email templates:", e);
      setTemplatePicker({ templates: [] });
    }
  };

  React.useEffect(() => {
    if (!orderGuid) return;
    setPickedTemplateGuid(null);
    setPickedTemplatePurpose(null);
    // Always land on "choose a template" first — no silent default.
    loadTemplateOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderGuid]);

  const pickTemplate = (tpl) => {
    setPickedTemplateGuid(tpl.guid);
    setPickedTemplatePurpose(tpl.purpose);
  };

  const confirmTemplate = async () => {
    setTemplatePicker(null);
    await loadEmailDraft(pickedTemplateGuid);
  };

  // "Skip" — template pick isn't mandatory, write a normal email instead.
  // Falls back to purpose "general" for send-account resolution, same as
  // any other non-template send.
  const skipTemplate = async () => {
    setPickedTemplateGuid(null);
    setPickedTemplatePurpose("general");
    setTemplatePicker(null);
    await loadEmailDraft(null, { blank: true });
  };

  const reopenTemplatePicker = async () => {
    await loadTemplateOptions();
  };

  const handleEmailFileAdd = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(",")[1];
        setEmailAttachments((prev) => [...prev, { name: file.name, size: file.size, type: file.type, base64 }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const applyPendingVar = (varName) => {
    const value = (pendingVarValues[varName] || "").trim();
    if (!value) return;
    const token = `{{${varName}}}`;
    setEmailDraft((d) => ({
      ...d,
      subject: d.subject.split(token).join(value),
      body: d.body.split(token).join(value),
    }));
    setPendingVars((prev) => prev.filter((v) => v !== varName));
  };

  const handleSendEmail = async () => {
    if (!emailDraft?.to?.trim()) { setEmailError('"To" email is required'); return; }
    if (!emailDraft?.subject?.trim()) { setEmailError('Subject is required'); return; }
    if (!emailDraft?.body?.trim()) { setEmailError('Email body is required'); return; }
    if (pendingVars.length > 0) { setEmailError(`Fill in the highlighted variable${pendingVars.length > 1 ? "s" : ""} below before sending.`); return; }
    setEmailSending(true);
    setEmailError("");
    try {
      await api.post("/warranty/send-email", {
        to: emailDraft.to,
        cc: emailDraft.cc,
        bcc: emailDraft.bcc,
        subject: emailDraft.subject,
        body: emailDraft.body,
        purpose: pickedTemplatePurpose,
        attachments: emailAttachments.map((a) => ({
          filename: a.name,
          content: a.base64,
          encoding: "base64",
          contentType: a.type,
        })),
      });
      setEmailSent(true);
      // Used to just null out emailDraft here, which left the tab
      // completely blank afterward — templatePicker was already null (set
      // in confirmTemplate) and "Change Template" only exists inside the
      // now-gone compose view, so there was no way back to it without
      // leaving and reopening the order. Reload the template picker instead
      // so the tab always has something usable on screen, sent or not.
      setTimeout(() => {
        setEmailDraft(null);
        loadTemplateOptions();
      }, 2000);
    } catch (e) {
      setEmailError(e?.response?.data?.message || "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="space-y-3">
      {templatePicker && (
        <div className="space-y-3">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <p className="text-sm font-bold text-slate-800">Choose Template</p>
              <p className="text-[11px] text-slate-400">The template you pick also decides which connected email account this sends from</p>
            </div>
            <div className="p-3 space-y-2 max-h-[320px] overflow-y-auto">
              {templatePicker.templates.length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <Mail size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-semibold">No email templates configured yet.</p>
                  <p className="text-[11px] mt-1">Add one under Settings &gt; Email Templates first.</p>
                </div>
              ) : (
                templatePicker.templates.map((tpl) => (
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

          <div className="flex gap-2">
            <button
              onClick={confirmTemplate}
              disabled={!pickedTemplateGuid}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold py-2.5 rounded-xl transition"
            >
              Continue to Compose
            </button>
            <button
              onClick={skipTemplate}
              className="px-4 text-sm font-bold text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-xl transition"
            >
              Skip — write from scratch
            </button>
          </div>
        </div>
      )}

      {!templatePicker && emailDraft?.loading && (
        <div className="flex items-center justify-center gap-2 text-slate-500 text-sm p-10">
          <Loader2 size={18} className="animate-spin text-indigo-500" /> Loading template...
        </div>
      )}

      {!templatePicker && emailDraft && !emailDraft.loading && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <p className="text-xs font-bold text-slate-600">Compose</p>
            <div className="flex items-center gap-2">
              <button
                onClick={reopenTemplatePicker}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition"
              >
                <RefreshCw size={12} /> Change Template
              </button>
              <button
                onClick={() => setEmailPreview((p) => !p)}
                className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition ${emailPreview ? "bg-indigo-50 border-indigo-300 text-indigo-600" : "border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"}`}
              >
                <Eye size={12} /> {emailPreview ? "Edit" : "Preview"}
              </button>
            </div>
          </div>

          {pendingVars.length > 0 && (
            <div className="p-4 bg-amber-50 border-b border-amber-100 space-y-2.5">
              <p className="text-xs font-bold text-amber-800">
                This template uses {pendingVars.length} variable{pendingVars.length > 1 ? "s" : ""} we can&apos;t fill in from the order — enter a value for each:
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

          {emailPreview ? (
            <div className="p-4">
              <div className="mb-3 space-y-1 text-xs text-slate-500 border border-slate-200 rounded-xl p-3 bg-slate-50">
                <div><span className="font-bold text-slate-700 w-14 inline-block">To:</span> {emailDraft.to || <em className="text-slate-400">—</em>}</div>
                {emailDraft.cc && <div><span className="font-bold text-slate-700 w-14 inline-block">CC:</span> {emailDraft.cc}</div>}
                {emailDraft.bcc && <div><span className="font-bold text-slate-700 w-14 inline-block">BCC:</span> {emailDraft.bcc}</div>}
                <div><span className="font-bold text-slate-700 w-14 inline-block">Sub:</span> {emailDraft.subject || <em className="text-slate-400">—</em>}</div>
              </div>
              <div className="border border-slate-200 rounded-xl p-4 bg-white text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans min-h-[160px]">
                {emailDraft.body || <span className="text-slate-400 italic">No body content</span>}
              </div>
              {emailAttachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {emailAttachments.map((a, i) => (
                    <span key={i} className="flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full border border-slate-200">
                      <FileText size={11} /> {a.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">To</label>
                <input type="text" value={emailDraft.to} onChange={(e) => setEmailDraft((d) => ({ ...d, to: e.target.value }))} placeholder="recipient@example.com" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">CC</label>
                  <input type="text" value={emailDraft.cc} onChange={(e) => setEmailDraft((d) => ({ ...d, cc: e.target.value }))} placeholder="cc@example.com" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">BCC</label>
                  <input type="text" value={emailDraft.bcc} onChange={(e) => setEmailDraft((d) => ({ ...d, bcc: e.target.value }))} placeholder="bcc@example.com" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Subject</label>
                <input type="text" value={emailDraft.subject} onChange={(e) => setEmailDraft((d) => ({ ...d, subject: e.target.value }))} placeholder="Email subject" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Body</label>
                <textarea rows={8} value={emailDraft.body} onChange={(e) => setEmailDraft((d) => ({ ...d, body: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none resize-y font-mono" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Attachments</label>
                  <button onClick={() => emailFileRef.current?.click()} className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition">
                    <Plus size={11} /> Add File
                  </button>
                  <input ref={emailFileRef} type="file" multiple className="hidden" onChange={handleEmailFileAdd} />
                </div>
                {emailAttachments.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No attachments</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {emailAttachments.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                        <FileText size={11} className="text-slate-400" />
                        <span className="text-xs text-slate-700 max-w-[160px] truncate">{a.name}</span>
                        <span className="text-[10px] text-slate-400">({(a.size / 1024).toFixed(0)}KB)</span>
                        <button onClick={() => setEmailAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 ml-1">
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div>
              {emailError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {emailError}</p>}
              {emailSent && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={12} /> Email sent successfully!</p>}
            </div>
            <button
              onClick={handleSendEmail}
              disabled={emailSending || emailSent || pendingVars.length > 0}
              title={pendingVars.length > 0 ? "Fill in the variables above first" : undefined}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold px-5 py-2 rounded-xl transition"
            >
              {emailSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {emailSending ? "Sending..." : emailSent ? "Sent!" : "Send Email"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
