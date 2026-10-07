"use client";
import React, { useRef, useState } from "react";
import Swal from "sweetalert2";
import { FileDown, FileSpreadsheet, Upload, Loader2 } from "lucide-react";
import api from "@/lib/client/apiClient";

const errMsg = (err, fallback) => err?.response?.data?.message || err?.message || fallback;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Excel Export / Template download / Import for Contract Groups (the list page and one group's page).
//   exportPath / templatePath / importPath are API paths under /api, e.g. "/contract-groups/export".
export default function ExcelTools({ exportPath, templatePath, importPath, onImported, exportQuery = "", compact = false }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState("");

  const download = async (path, label) => {
    setBusy(label);
    try {
      const res = await api.get(path, { responseType: "blob" });
      const cd = res.headers?.["content-disposition"] || "";
      const name = (cd.match(/filename="?([^";]+)"?/i) || [])[1] || `${label}.xlsx`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // a failed blob request hides the JSON error body — read it back
      let msg = errMsg(err, `Could not download ${label}.`);
      try { const t = await err.response.data.text(); msg = JSON.parse(t).message || msg; } catch { /* keep msg */ }
      Swal.fire("Error", msg, "error");
    } finally {
      setBusy("");
    }
  };

  const showResults = (data) => {
    const r = data.results || {};
    const ok = [
      r.created?.length ? `<div>✅ Groups created: <b>${r.created.length}</b> — ${esc(r.created.map((g) => `${g.group} (${g.contracts})`).join(", "))}</div>` : "",
      r.extended?.length ? `<div>➕ Existing groups extended: <b>${r.extended.length}</b> — ${esc(r.extended.map((g) => `${g.group} (+${g.contracts})`).join(", "))}</div>` : "",
      r.updated ? `<div>✅ Rows updated: <b>${r.updated.length}</b></div>` : "",
    ].join("");
    const failed = (r.failed || []).slice(0, 12).map((f) => `<li>Row ${esc(f.row)}${f.item ? ` — ${esc(f.item)}` : ""}: <span style="color:#be123c">${esc(f.reason)}</span></li>`).join("");
    const more = (r.failed || []).length > 12 ? `<div style="margin-top:4px;color:#64748b">…and ${(r.failed || []).length - 12} more</div>` : "";
    Swal.fire({
      icon: (r.failed || []).length && !(r.created?.length || r.extended?.length || r.updated?.length) ? "warning" : "success",
      title: "Import finished",
      width: 640,
      html: `<div style="text-align:left;font-size:13px;line-height:1.6">${ok || "<div>Nothing was changed.</div>"}${
        failed ? `<div style="margin-top:8px"><b>Skipped (${(r.failed || []).length}):</b><ul style="margin:4px 0 0 18px">${failed}</ul>${more}</div>` : ""
      }</div>`,
    });
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("import");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(importPath, fd, { headers: { "Content-Type": "multipart/form-data" } });
      showResults(res.data);
      await onImported?.();
    } catch (err) {
      Swal.fire("Import failed", errMsg(err, "Could not import this file."), "error");
    } finally {
      setBusy("");
    }
  };

  const btn = "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50";
  const icon = (name, Icon) => (busy === name ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={() => download(`${exportPath}${exportQuery}`, "export")} disabled={!!busy} className={`${btn} bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100`} title="Download this data as an Excel file">
        {icon("export", FileDown)} {compact ? "Export" : "Export Excel"}
      </button>
      <button onClick={() => download(templatePath, "template")} disabled={!!busy} className={`${btn} bg-white text-slate-600 border-slate-200 hover:bg-slate-50`} title="Download the Excel template to fill in and import">
        {icon("template", FileSpreadsheet)} Template
      </button>
      <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={`${btn} bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100`} title="Import an Excel file made from the template">
        {icon("import", Upload)} Import
      </button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
    </div>
  );
}
