"use client";
import React, { useState } from "react";
import { DatabaseBackup, Download, Upload, Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Swal from "sweetalert2";
import { backupService } from "@/lib/services/backupService";

export default function BackupRestore() {
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pickedFile, setPickedFile] = useState(null);
  const [result, setResult] = useState(null);
  const fileInputRef = React.useRef(null);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await backupService.downloadBackup();
    } catch (err) {
      console.error("Backup download failed:", err);
      Swal.fire("Error", err?.response?.data?.message || "Failed to create backup", "error");
    } finally {
      setDownloading(false);
    }
  };

  const handleFilePick = (e) => {
    setResult(null);
    setPickedFile(e.target.files?.[0] || null);
  };

  const handleRestore = async () => {
    if (!pickedFile) return;

    // This overwrites the entire shared database — every company's data,
    // not just the admin's own — so this needs an unambiguous, deliberate
    // confirmation rather than a single "are you sure" click.
    const confirm1 = await Swal.fire({
      title: "This will overwrite the ENTIRE database",
      html: `Every table in <b>"${pickedFile.name}"</b> will replace what's currently in the database — for <b>all companies</b>, not just yours. Data created after this backup was taken will be permanently lost. This cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "I understand, continue",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });
    if (!confirm1.isConfirmed) return;

    const confirm2 = await Swal.fire({
      title: "Type RESTORE to confirm",
      input: "text",
      inputPlaceholder: "RESTORE",
      showCancelButton: true,
      confirmButtonText: "Restore Database",
      confirmButtonColor: "#dc2626",
      inputValidator: (value) => (value !== "RESTORE" ? 'Type "RESTORE" exactly to proceed' : undefined),
    });
    if (!confirm2.isConfirmed) return;

    setRestoring(true);
    setResult(null);
    try {
      const res = await backupService.restoreBackup(pickedFile);
      setResult(res);
      if (res.failed?.length > 0) {
        Swal.fire("Restore completed with errors", `${res.restored.length} table(s) restored, ${res.failed.length} failed. See details below.`, "warning");
      } else {
        Swal.fire("Restore complete", `${res.restored.length} table(s) restored successfully.`, "success");
      }
    } catch (err) {
      console.error("Restore failed:", err);
      Swal.fire("Error", err?.response?.data?.message || err.message || "Restore failed", "error");
    } finally {
      setRestoring(false);
      setPickedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl shadow-md shadow-indigo-100 text-white">
          <DatabaseBackup size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Backup &amp; Restore</h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            Download a full ZIP snapshot of the database and uploaded files, or restore from a previously downloaded backup.
          </p>
        </div>
      </div>

      {/* Backup */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide mb-1">Create Backup</h3>
            <p className="text-sm text-slate-500 max-w-xl">
              Downloads a single ZIP file containing every table in the database (all companies) plus every uploaded file (contracts, invoices, logos, etc.). Keep it somewhere safe — it's the only way to restore this data later.
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="shrink-0 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all"
          >
            {downloading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            {downloading ? "Creating…" : "Download Backup"}
          </button>
        </div>
      </div>

      {/* Restore */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-black text-red-700 uppercase tracking-wide mb-1">Restore from Backup</h3>
            <p className="text-sm text-red-600 max-w-xl">
              This overwrites the entire database with the contents of the backup file — for every company, not just yours. Anything created since that backup was taken will be permanently lost. Only do this if you're certain.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={handleFilePick}
            className="flex-1 min-w-0 text-sm text-slate-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-white file:text-red-700 file:font-bold file:text-sm file:border file:border-red-200 hover:file:bg-red-100 cursor-pointer transition-colors"
          />
          <button
            onClick={handleRestore}
            disabled={!pickedFile || restoring}
            className="shrink-0 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-red-100 transition-all w-full sm:w-auto justify-center"
          >
            {restoring ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            {restoring ? "Restoring…" : "Restore Database"}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <h4 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Restore Result</h4>
          {typeof result.filesRestored === "number" && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 mb-2">
              <CheckCircle2 size={14} className="shrink-0" /> {result.filesRestored} uploaded file(s) restored
            </div>
          )}
          {result.fileErrors?.length > 0 && (
            <div className="text-sm text-red-600 mb-2">
              Failed to restore {result.fileErrors.length} file(s): {result.fileErrors.join(", ")}
            </div>
          )}
          <div className="space-y-1.5 max-h-64 overflow-y-auto option-scroll pr-1">
            {result.restored?.map((r) => (
              <div key={r.table} className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 size={14} className="shrink-0" /> {r.table} — {r.rows} row(s)
              </div>
            ))}
            {result.failed?.map((f) => (
              <div key={f.table} className="flex items-center gap-2 text-sm text-red-600" title={f.error}>
                <XCircle size={14} className="shrink-0" /> {f.table} — failed: {f.error}
              </div>
            ))}
            {result.skipped?.length > 0 && (
              <div className="text-xs text-slate-400 pt-1.5">
                Skipped (not in current database): {result.skipped.join(", ")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
