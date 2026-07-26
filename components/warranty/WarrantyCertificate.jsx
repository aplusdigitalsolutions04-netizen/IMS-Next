"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import {
  FileText, Settings, Save, Search, Eye,
  Trash2, CheckCircle2, Clock, Edit3, ArrowLeft,
  Printer, ShieldCheck, Image, Upload, Code2,
  Loader2, Plus, RefreshCw, X, Copy, ChevronLeft, ChevronRight
} from "lucide-react";

const LIST_PAGE_SIZE = 20;
const getStoredToken = () => typeof window !== "undefined" ? sessionStorage.getItem("pt_auth_token") : null;

const API = process.env.NEXT_PUBLIC_API_URL || "";
const getHeaders = () => ({ Authorization: `Bearer ${getStoredToken()}` });

// Available placeholders for the HTML template
const PLACEHOLDERS = [
  "{{GEM_NUMBER}}", "{{BID_NUMBER}}", "{{CONTRACT_NO}}",
  "{{ORDER_NUMBER}}", "{{INVOICE_NUMBER}}",
  "{{CUSTOMER_NAME}}", "{{CONSIGNEE_NAME}}",
  "{{ADDRESS}}", "{{CONTACT_NUMBER}}",
  "{{MODEL_NAME}}", "{{SERIAL_NUMBER}}", "{{SERIAL_NUMBERS}}", "{{QUANTITY}}",
  "{{PURCHASE_DATE}}", "{{DISPATCH_DATE}}",
  "{{WARRANTY_PERIOD}}", "{{WARRANTY_EXPIRY}}",
  "{{CERT_NUMBER}}", "{{COMPANY_NAME}}",
];

// ─── Platform badge helper ────────────────────────────────────────────────────
function PlatformBadge({ platform, gemOrderType }) {
  if (!platform) return null;
  const isGem = platform === "GEM" || (platform || "").toLowerCase().includes("gem");
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
      isGem ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
    }`}>
      {isGem ? `GEM${gemOrderType ? ` · ${gemOrderType}` : ""}` : platform}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WarrantyCertificate({ isAdmin, currentUser }) {
  const [page, setPage]         = useState("list"); // "list" | "view" | "template"
  const [listTab, setListTab]   = useState("generate");
  const canManage = isAdmin || !!currentUser?.allow_edit_warranty;

  // Orders & certs lists
  const [orders, setOrders]             = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearch, setOrderSearch]   = useState("");
  const [savedCerts, setSavedCerts]     = useState([]);
  const [certsLoading, setCertsLoading] = useState(false);

  // Preview scale — scales A4 iframe down to fit container width
  const previewWrapRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(1);
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const calc = () => {
      const available = el.clientWidth - 48; // subtract ~padding
      const a4px = 794; // 210mm at 96dpi
      setPreviewScale(available < a4px ? available / a4px : 1);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Certificate view state
  const [viewOrder, setViewOrder]   = useState(null);
  const [certHtml, setCertHtml]     = useState("");
  const [certGuid, setCertGuid]     = useState(null);
  const [certStatus, setCertStatus] = useState("draft");
  const [certLoading, setCertLoading] = useState(false);
  const [certSaving, setCertSaving]   = useState(false);
  const [editMode, setEditMode]       = useState(false);
  const editableRef = useRef(null);

  // Header image (template master)
  const [headerImgUrl, setHeaderImgUrl]       = useState(null);
  const [headerUploading, setHeaderUploading] = useState(false);
  const headerInputRef = useRef(null);

  // HTML body template (template master)
  const [htmlBody, setHtmlBody]   = useState("");
  const [htmlSaving, setHtmlSaving] = useState(false);
  const [htmlSaved, setHtmlSaved]   = useState(false);
  const [copied, setCopied]         = useState(null); // placeholder that was copied

  // ── Load template settings on mount ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/api/warranty/template`, { headers: getHeaders() });
        if (res.data?.headerImagePath) setHeaderImgUrl(`${API}/uploads/${res.data.headerImagePath}`);
        if (res.data?.htmlBody)        setHtmlBody(res.data.htmlBody);
      } catch (e) {
        console.error("Failed to load warranty template:", e);
      }
    })();
  }, []);

  // ── Header image upload ─────────────────────────────────────────────────────
  const uploadHeaderImg = async (file) => {
    if (!file) return;
    setHeaderUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${API}/api/warranty/template/upload-header`, fd, {
        headers: { ...getHeaders(), "Content-Type": "multipart/form-data" },
      });
      if (res.data?.previewUrl) setHeaderImgUrl(res.data.previewUrl);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Header image saved!", timer: 2000, showConfirmButton: false });
    } catch (e) {
      Swal.fire("Error", e.response?.data?.message || "Upload failed", "error");
    } finally {
      setHeaderUploading(false);
    }
  };

  const removeHeaderImg = async () => {
    try {
      await axios.put(`${API}/api/warranty/template`, { clearHeader: true }, { headers: getHeaders() });
      setHeaderImgUrl(null);
    } catch (_err) { /* ignore */ }
  };

  // ── Save HTML body template ─────────────────────────────────────────────────
  const saveHtmlBody = async () => {
    setHtmlSaving(true);
    try {
      await axios.put(`${API}/api/warranty/template`, { htmlBody }, { headers: getHeaders() });
      setHtmlSaved(true);
      setTimeout(() => setHtmlSaved(false), 2500);
    } catch {
      Swal.fire("Error", "Failed to save template", "error");
    } finally {
      setHtmlSaving(false);
    }
  };

  const copyPlaceholder = (p) => {
    navigator.clipboard.writeText(p).catch(() => {});
    setCopied(p);
    setTimeout(() => setCopied(null), 1500);
  };

  // ── Load orders ─────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    try {
      setOrdersLoading(true);
      const res = await axios.get(`${API}/api/warranty/orders`, { headers: getHeaders() });
      setOrders(res.data || []);
    } catch(e) { console.error(e); }
    finally { setOrdersLoading(false); }
  }, []);

  const loadCerts = useCallback(async () => {
    try {
      setCertsLoading(true);
      const res = await axios.get(`${API}/api/warranty/certificates`, { headers: getHeaders() });
      setSavedCerts(res.data || []);
    } catch (e) {
      console.error("Failed to load saved certificates:", e);
    } finally { setCertsLoading(false); }
  }, []);

  useEffect(() => { loadOrders(); loadCerts(); }, [loadOrders, loadCerts]);

  // ── Filtered orders (GEM only) ──────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    const gemOnly = orders.filter(o =>
      (o.platform || "").toUpperCase() === "GEM" ||
      (o.platform || "").toLowerCase().includes("gem")
    );
    const q = orderSearch.trim().toLowerCase();
    if (!q) return gemOnly;
    return gemOnly.filter(o =>
      String(o.orderNumber || "").toLowerCase().includes(q) ||
      (o.customer || "").toLowerCase().includes(q) ||
      (o.modelName || "").toLowerCase().includes(q) ||
      (o.serialValue || "").toLowerCase().includes(q) ||
      (o.gemOrderType || "").toLowerCase().includes(q)
    );
  }, [orders, orderSearch]);

  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(LIST_PAGE_SIZE);
  useEffect(() => { setOrderPage(1); }, [orderSearch, orderPageSize]);
  const orderTotalPages = Math.max(1, Math.ceil(filteredOrders.length / orderPageSize));
  const paginatedOrders = useMemo(
    () => filteredOrders.slice((orderPage - 1) * orderPageSize, orderPage * orderPageSize),
    [filteredOrders, orderPage, orderPageSize]
  );

  const [certPage, setCertPage] = useState(1);
  const [certPageSize, setCertPageSize] = useState(LIST_PAGE_SIZE);
  useEffect(() => { setCertPage(1); }, [certPageSize]);
  const certTotalPages = Math.max(1, Math.ceil(savedCerts.length / certPageSize));
  const paginatedCerts = useMemo(
    () => savedCerts.slice((certPage - 1) * certPageSize, certPage * certPageSize),
    [savedCerts, certPage, certPageSize]
  );

  // ── Generate certificate ────────────────────────────────────────────────────
  const generateCert = async (order) => {
    const guid = order.orderGuid || order.guid;
    setCertLoading(true);
    setViewOrder(order);
    setCertHtml("");
    setCertGuid(null);
    setCertStatus("draft");
    setEditMode(false);
    setPage("view");
    try {
      const res = await axios.get(`${API}/api/warranty/generate/${guid}`, { headers: getHeaders() });
      setCertHtml(res.data.html || "");
      setCertGuid(res.data.certGuid || null);
      setCertStatus(res.data.certStatus || "draft");
    } catch(e) {
      Swal.fire("Error", e.response?.data?.message || "Failed to generate certificate", "error");
      setPage("list");
    } finally {
      setCertLoading(false);
    }
  };

  // ── Open saved cert ─────────────────────────────────────────────────────────
  const openSavedCert = async (cert) => {
    try {
      setCertLoading(true);
      setPage("view");
      setViewOrder({ guid: cert.orderGuid, orderNumber: cert.orderNumber, customer: cert.customerName });
      setCertHtml("");
      const res = await axios.get(`${API}/api/warranty/certificates/${cert.guid}`, { headers: getHeaders() });
      setCertHtml(res.data.htmlContent || "");
      setCertGuid(res.data.guid);
      setCertStatus(res.data.status || "draft");
      setEditMode(false);
    } catch { Swal.fire("Error", "Failed to load certificate", "error"); setPage("list"); }
    finally { setCertLoading(false); }
  };

  // ── Save certificate ────────────────────────────────────────────────────────
  const saveCert = async (status = "draft") => {
    if (!viewOrder) return;
    const html = editMode && editableRef.current ? editableRef.current.innerHTML : certHtml;
    try {
      setCertSaving(true);
      const res = await axios.post(`${API}/api/warranty/certificates`, {
        orderGuid: viewOrder.guid || viewOrder.orderGuid,
        orderNumber: viewOrder.orderNumber,
        htmlContent: html,
        status,
        certGuid,
      }, { headers: getHeaders() });
      setCertGuid(res.data.guid);
      setCertStatus(status);
      if (editMode) { setCertHtml(html); setEditMode(false); }
      Swal.fire({ toast: true, position: "top-end", icon: "success",
        title: status === "final" ? "Certificate finalized!" : "Draft saved!",
        timer: 2500, showConfirmButton: false });
      loadCerts();
      setListTab("saved");
    } catch { Swal.fire("Error", "Failed to save", "error"); }
    finally { setCertSaving(false); }
  };

  // ── Delete cert ─────────────────────────────────────────────────────────────
  const deleteCert = async (guid, e) => {
    e?.stopPropagation();
    const r = await Swal.fire({ title: "Delete?", text: "This certificate will be deleted permanently.",
      icon: "warning", showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#ef4444" });
    if (!r.isConfirmed) return;
    try {
      await axios.delete(`${API}/api/warranty/certificates/${guid}`, { headers: getHeaders() });
      loadCerts();
      if (certGuid === guid) { setPage("list"); setCertHtml(""); setCertGuid(null); setViewOrder(null); }
    } catch {
      Swal.fire("Error", "Failed to delete certificate", "error");
    }
  };

  // ── A4 HTML wrapper — used for both preview iframe and print window ─────────
  const getA4Html = (content) =>
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Warranty Certificate</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{margin:0;padding:0;background:#fff;}
  .a4-page{width:210mm;min-height:297mm;background:#fff;overflow:hidden;}
  @media screen{body{padding:0;}.a4-page{}}
  @page{size:A4;margin:0;}
  @media print{
    html,body{background:#fff !important;padding:0 !important;margin:0 !important;}
    .a4-page{box-shadow:none !important;margin:0 !important;width:100% !important;min-height:100vh !important;overflow:visible !important;}
  }
  img{display:block;max-width:100%;height:auto;border:0;}
  table{border-collapse:collapse;}
  td,th{padding:4px 8px;}
</style>
</head><body><div class="a4-page">${content}</div></body></html>`;

  // ── Print ───────────────────────────────────────────────────────────────────
  const printCert = () => {
    const content = editMode && editableRef.current ? editableRef.current.innerHTML : certHtml;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      Swal.fire("Blocked", "Please allow popups for this site to print.", "warning");
      return;
    }
    w.document.write(getA4Html(content));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  useEffect(() => {
    if (editMode && editableRef.current) editableRef.current.innerHTML = certHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER: TEMPLATE MASTER PAGE
  // ────────────────────────────────────────────────────────────────────────────
  if (page === "template") {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Top bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-20 shadow-sm">
          <button onClick={() => setPage("list")} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors">
            <ArrowLeft size={16} />Back
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-indigo-600" />
            <h1 className="text-lg font-bold text-slate-800">Warranty Template Master</h1>
          </div>
        </div>

        <div className="p-6 space-y-6 max-w-7xl mx-auto">

          {/* Section 1 — Header Image */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 pt-5 pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Image size={15} className="text-indigo-500" />Certificate Header Image
                <span className="text-xs text-slate-400 font-normal normal-case ml-1">
                  — appears full-width at the top of every generated certificate
                </span>
              </h2>
            </div>
            <div className="p-6">
              {headerImgUrl ? (
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                    <img src={headerImgUrl} alt="Certificate Header"
                      className="w-full h-auto block" style={{ maxHeight: 200, objectFit: "contain" }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => headerInputRef.current?.click()} disabled={headerUploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-all">
                      {headerUploading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Replace Image
                    </button>
                    <button onClick={removeHeaderImg}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-all">
                      <X size={12} />Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div onClick={() => headerInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 px-6 py-10 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                  {headerUploading
                    ? <Loader2 size={28} className="text-indigo-400 animate-spin" />
                    : <div className="p-3 bg-white border border-slate-200 rounded-xl"><Upload size={24} className="text-slate-400" /></div>
                  }
                  <div className="text-center">
                    <p className="font-semibold text-sm text-slate-600">
                      {headerUploading ? "Uploading…" : "Click to upload header image"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">PNG, JPG — company letterhead / logo banner</p>
                  </div>
                </div>
              )}
              <input ref={headerInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files?.[0]) uploadHeaderImg(e.target.files[0]); e.target.value = ""; }} />
            </div>
          </div>

          {/* Section 2 — HTML Body Template */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 pt-5 pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Code2 size={15} className="text-indigo-500" />Certificate Body HTML
                <span className="text-xs text-slate-400 font-normal normal-case ml-1">
                  — paste your HTML content here, use placeholders for dynamic data
                </span>
              </h2>
            </div>
            <div className="p-6 space-y-4">

              {/* Placeholder chips */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Available Placeholders — click to copy
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map(p => (
                    <button key={p} onClick={() => copyPlaceholder(p)}
                      className={`flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-lg border transition-all ${
                        copied === p
                          ? "bg-green-100 text-green-700 border-green-200"
                          : "bg-white text-indigo-700 border-indigo-100 hover:bg-indigo-50 hover:border-indigo-200"
                      }`}>
                      {copied === p ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* HTML textarea */}
              <textarea
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 outline-none bg-slate-50 focus:bg-white transition-all resize-none leading-relaxed"
                rows={22}
                placeholder={"Paste your HTML body here...\n\nExample:\n<p>Ref No: {{GEM_NUMBER}}</p>\n<p>Date: {{DISPATCH_DATE}}</p>\n<p>To: {{CONSIGNEE_NAME}}</p>\n<p>Model: {{MODEL_NAME}}</p>\n<p>Serial: {{SERIAL_NUMBERS}}</p>\n<p>Warranty: {{WARRANTY_PERIOD}}</p>"}
                value={htmlBody}
                onChange={e => setHtmlBody(e.target.value)}
              />

              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-400">
                  The header image above is automatically added to the top — no need to add it here.
                </p>
                <button onClick={saveHtmlBody} disabled={htmlSaving}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-60 ${
                    htmlSaved ? "bg-green-500 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}>
                  {htmlSaving ? <Loader2 size={14} className="animate-spin" /> : htmlSaved ? <CheckCircle2 size={14} /> : <Save size={14} />}
                  {htmlSaving ? "Saving…" : htmlSaved ? "Saved!" : "Save Template"}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER: CERTIFICATE VIEW PAGE
  // ────────────────────────────────────────────────────────────────────────────
  if (page === "view") {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {/* Top bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-20 shadow-sm flex-wrap">
          <button onClick={() => { setPage("list"); setEditMode(false); }}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors flex-shrink-0">
            <ArrowLeft size={16} />Back
          </button>
          <div className="w-px h-5 bg-slate-200 flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={18} className="text-indigo-600 flex-shrink-0" />
            <span className="font-bold text-slate-800 text-sm truncate">Order #{viewOrder?.orderNumber}</span>
            {viewOrder?.customer && <span className="text-slate-400 text-sm truncate">— {viewOrder.customer}</span>}
            {certStatus === "final"
              ? <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold ml-1 flex-shrink-0">FINAL</span>
              : <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold ml-1 flex-shrink-0">DRAFT</span>
            }
          </div>

          {!certLoading && certHtml && (
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {canManage && (
                <>
                  {!editMode ? (
                    <button onClick={() => setEditMode(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-all">
                      <Edit3 size={13} />Edit
                    </button>
                  ) : (
                    <button onClick={() => { const h = editableRef.current?.innerHTML || certHtml; setCertHtml(h); setEditMode(false); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-all">
                      <Eye size={13} />Done Editing
                    </button>
                  )}
                  <button onClick={() => saveCert("draft")} disabled={certSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-all">
                    {certSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Save Draft
                  </button>
                  <button onClick={() => saveCert("final")} disabled={certSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold hover:bg-green-600 transition-all">
                    <CheckCircle2 size={13} />Finalize
                  </button>
                </>
              )}
              <button onClick={printCert}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition-all">
                <Printer size={13} />Print / PDF
              </button>
            </div>
          )}
        </div>

        {/* Certificate area */}
        <div className="flex-1 overflow-auto p-6">
          {certLoading && (
            <div className="flex items-center justify-center h-64 text-slate-400 gap-3">
              <Loader2 className="animate-spin" size={24} />
              <span>Generating certificate…</span>
            </div>
          )}

          {!certLoading && certHtml && (
            <>
              {editMode && (
                <div className="mx-auto" style={{ maxWidth: 820 }}>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mb-3 text-xs text-amber-700 font-medium flex items-center gap-2">
                    <Edit3 size={12} />Edit mode — click anywhere in the certificate to edit. Save Draft when done.
                  </div>
                  <div ref={editableRef} contentEditable suppressContentEditableWarning
                    className="bg-white shadow-xl rounded-xl overflow-hidden"
                    style={{ outline: "2px dashed #f59e0b", minHeight: 600 }} />
                </div>
              )}
              {!editMode && (
                <div ref={previewWrapRef} className="rounded-xl overflow-hidden w-full" style={{ background: "#c8c8c8", padding: "16px" }}>
                  <div style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                    width: "210mm",
                    marginBottom: previewScale < 1 ? `calc((${previewScale} - 1) * 297mm)` : 0
                  }}>
                    <iframe
                      srcDoc={getA4Html(certHtml)}
                      style={{ width: "210mm", border: "none", minHeight: "297mm", display: "block", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}
                      onLoad={e => { try { const h = e.target.contentDocument.documentElement.scrollHeight; e.target.style.height = h + "px"; } catch(_){ /* ignore */ } }}
                      title="Warranty Certificate"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {!certLoading && !certHtml && (
            <div className="flex flex-col items-center justify-center h-56 text-slate-400 gap-3">
              <FileText size={36} className="opacity-20" />
              <p className="text-sm font-medium">No template configured</p>
              <p className="text-xs text-center max-w-xs">
                Go to <strong>Template Master</strong> and add your HTML body content to enable certificate generation.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER: MAIN LIST PAGE
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full bg-slate-50 p-5 flex flex-col">
      <div className="w-full flex-1 flex flex-col min-h-0">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
              <ShieldCheck className="text-indigo-600" size={26} />
              Warranty Certificates
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Generate and manage warranty certificates for orders</p>
          </div>
          {canManage && (
            <button onClick={() => setPage("template")}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-all shadow">
              <Settings size={15} />Template Master
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-200 rounded-xl p-1 mb-5 w-fit shrink-0">
          <button onClick={() => setListTab("generate")}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              listTab === "generate" ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
            }`}>
            <Plus size={15} />Generate Certificate
          </button>
          <button onClick={() => { setListTab("saved"); loadCerts(); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              listTab === "saved" ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
            }`}>
            <Clock size={15} />Saved Certificates
            {savedCerts.length > 0 && (
              <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{savedCerts.length}</span>
            )}
          </button>
        </div>

        {/* ── TAB: Generate Certificate ── */}
        {listTab === "generate" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0">
            <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center gap-3 shrink-0">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <FileText size={14} className="text-blue-600" />GEM Orders
              </h2>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{filteredOrders.length}</span>
              <button onClick={loadOrders} disabled={ordersLoading} className="ml-auto text-slate-400 hover:text-slate-600 transition-colors">
                <RefreshCw size={13} className={ordersLoading ? "animate-spin" : ""} />
              </button>
              <div className="relative w-72">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white transition-all"
                  placeholder="Search order #, customer, model, GEM…"
                  value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)}
                />
                {orderSearch && (
                  <button onClick={() => setOrderSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {ordersLoading && (
              <div className="py-16 text-center text-slate-400 flex items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading orders…</span>
              </div>
            )}
            {!ordersLoading && filteredOrders.length === 0 && (
              <div className="py-16 text-center text-slate-400">
                <FileText size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">{orderSearch ? "No orders match your search" : "No GEM orders found"}</p>
              </div>
            )}
            {!ordersLoading && filteredOrders.length > 0 && (
              <div className="overflow-y-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">S.No.</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Order #</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Model / Serial</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Platform</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((o, index) => (
                      <tr key={o.orderGuid} className="border-t border-slate-50 hover:bg-indigo-50 transition-colors group">
                        <td className="px-4 py-3 text-xs font-semibold text-slate-400">{(orderPage - 1) * orderPageSize + index + 1}</td>
                        <td className="px-4 py-3"><span className="font-bold text-slate-800">#{o.orderNumber}</span></td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <div className="font-medium text-slate-700 truncate text-xs">{o.customer || "—"}</div>
                          {o.consigneeName && <div className="text-[10px] text-slate-400 truncate">{o.consigneeName}</div>}
                        </td>
                        <td className="px-4 py-3 max-w-[160px]">
                          <div className="text-xs text-slate-600 truncate font-medium">{o.modelName || "—"}</div>
                          {o.serialValue && <div className="text-[10px] text-slate-400 font-mono">{o.serialValue}</div>}
                        </td>
                        <td className="px-4 py-3"><PlatformBadge platform={o.platform} gemOrderType={o.gemOrderType} /></td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                          {o.dispatchDate
                            ? new Date(o.dispatchDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                            : o.orderDate
                              ? new Date(o.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                              : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => generateCert(o)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-all opacity-0 group-hover:opacity-100">
                            {canManage ? <Plus size={12} /> : <Eye size={12} />}
                            {canManage ? "Generate" : "Preview"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!ordersLoading && filteredOrders.length > 0 && (
              <PaginationBar
                page={orderPage}
                totalPages={orderTotalPages}
                onChange={setOrderPage}
                pageSize={orderPageSize}
                onPageSizeChange={setOrderPageSize}
              />
            )}
          </div>
        )}

        {/* ── TAB: Saved Certificates ── */}
        {listTab === "saved" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0">
            <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <Clock size={14} className="text-amber-500" />Saved Certificates
              </h2>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{savedCerts.length}</span>
              <button onClick={loadCerts} className="ml-auto text-slate-400 hover:text-slate-600 transition-colors">
                <RefreshCw size={13} className={certsLoading ? "animate-spin" : ""} />
              </button>
            </div>
            {certsLoading && (
              <div className="py-10 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />Loading…
              </div>
            )}
            {!certsLoading && savedCerts.length === 0 && (
              <div className="py-16 text-center text-slate-400">
                <ShieldCheck size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No saved certificates yet</p>
                <p className="text-xs mt-1">Generate a certificate from the Generate tab</p>
              </div>
            )}
            {savedCerts.length > 0 && (
              <div className="overflow-y-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">S.No.</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Order #</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Platform</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Saved On</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">By</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCerts.map((c, index) => (
                      <tr key={c.guid} onClick={() => openSavedCert(c)}
                        className="border-t border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3 text-xs font-semibold text-slate-400">{(certPage - 1) * certPageSize + index + 1}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">#{c.orderNumber}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate text-xs">{c.customerName || "—"}</td>
                        <td className="px-4 py-3"><PlatformBadge platform={c.platform} gemOrderType={c.gemOrderType} /></td>
                        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                          {new Date(c.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                            c.status === "final" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {c.status === "final" ? "✓ Final" : "Draft"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{c.createdBy || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {canManage && (
                            <button onClick={e => deleteCert(c.guid, e)}
                              className="text-slate-300 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!certsLoading && savedCerts.length > 0 && (
              <PaginationBar
                page={certPage}
                totalPages={certTotalPages}
                onChange={setCertPage}
                pageSize={certPageSize}
                onPageSizeChange={setCertPageSize}
              />
            )}
          </div>
        )}

      </div>
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function PaginationBar({ page, totalPages, onChange, pageSize, onPageSizeChange }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 font-medium">Page {page} of {totalPages}</span>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-400 cursor-pointer"
          >
            {PAGE_SIZE_OPTIONS.map((val) => (
              <option key={val} value={val}>{val} per page</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

