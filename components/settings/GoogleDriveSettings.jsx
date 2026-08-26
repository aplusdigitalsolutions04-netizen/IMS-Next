"use client";
import React, { useEffect, useState } from "react";
import { HardDrive, Loader2, CheckCircle2, XCircle, PlugZap, UploadCloud, AlertTriangle, FolderTree, LogIn } from "lucide-react";
import { googleDriveService } from "@/lib/services/googleDriveService";
import { companyService } from "@/lib/services/companyService";
import { getStoredToken } from "@/lib/client/auth";

export default function GoogleDriveSettings() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null); // { connected, folderName?, message? }
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);

  const [companies, setCompanies] = useState([]);
  const [reorgCompanyGuid, setReorgCompanyGuid] = useState("");
  const [reorganizing, setReorganizing] = useState(false);
  const [reorgResult, setReorgResult] = useState(null);

  useEffect(() => {
    companyService.getCompanies().then((data) => {
      const list = Array.isArray(data) ? data : data?.data || [];
      setCompanies(list);
      if (list.length === 1) setReorgCompanyGuid(list[0].guid);
    });
  }, []);

  // /api/google-drive/authorize needs to be a real browser navigation (it
  // redirects to Google's consent screen), so it can't carry the app's usual
  // Authorization header the way axios calls do — the session token is
  // appended as ?token= instead, which the route folds into that header
  // itself before checking permissions.
  const handleConnect = () => {
    const token = getStoredToken();
    window.location.href = `/api/google-drive/authorize${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await googleDriveService.testConnection();
      setResult(res);
    } catch (err) {
      setResult({ connected: false, message: err?.response?.data?.message || err.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrateResult(null);
    try {
      const res = await googleDriveService.migrateLocalFiles();
      setMigrateResult(res);
    } catch (err) {
      setMigrateResult({ error: err?.response?.data?.message || err.message || "Migration failed" });
    } finally {
      setMigrating(false);
    }
  };

  const handleReorganize = async () => {
    if (!reorgCompanyGuid) return;
    setReorganizing(true);
    setReorgResult(null);
    try {
      const res = await googleDriveService.reorganizeIntoCompanyFolders(reorgCompanyGuid);
      setReorgResult(res);
    } catch (err) {
      setReorgResult({ error: err?.response?.data?.message || err.message || "Reorganize failed" });
    } finally {
      setReorganizing(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl shadow-md shadow-indigo-100 text-white">
          <HardDrive size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Google Drive</h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            All uploaded documents (invoices, e-way bills, POD, contracts, logos, etc.) are stored in Google Drive. Test the connection here anytime to confirm it&apos;s still working.
          </p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide mb-1">Connection Status</h3>
            <p className="text-sm text-slate-500 max-w-xl">
              Checks that the authorized Google account is still reachable and the configured Drive folder still exists.
            </p>
          </div>
          <button
            onClick={handleTest}
            disabled={testing}
            className="shrink-0 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all"
          >
            {testing ? <Loader2 className="animate-spin" size={18} /> : <PlugZap size={18} />}
            {testing ? "Testing…" : "Test Connection"}
          </button>
        </div>

        {result && (
          <div
            className={`mt-5 rounded-2xl p-4 flex items-start gap-3 ${
              result.connected ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
            }`}
          >
            {result.connected ? (
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={20} />
            ) : (
              <XCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
            )}
            <div>
              <p className={`text-sm font-bold ${result.connected ? "text-emerald-700" : "text-red-700"}`}>
                {result.connected ? "Connected" : "Not connected"}
              </p>
              <p className={`text-sm mt-0.5 ${result.connected ? "text-emerald-600" : "text-red-600"}`}>
                {result.connected
                  ? `Uploads are saving to the "${result.folderName}" Drive folder.`
                  : result.message || "Could not reach Google Drive."}
              </p>
              {!result.connected && (
                <button
                  onClick={handleConnect}
                  className="mt-3 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors"
                >
                  <LogIn size={15} /> Connect Google Account
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mt-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide mb-1">Migrate Existing Files</h3>
            <p className="text-sm text-slate-500 max-w-xl">
              Uploads whatever&apos;s still sitting in the server&apos;s local <code className="bg-slate-200 px-1 py-0.5 rounded">uploads/</code> folder (e.g. files placed there before Drive was connected, or via FTP) into the matching Drive folder. Safe to run more than once — already-migrated files are skipped.
            </p>
          </div>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="shrink-0 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all"
          >
            {migrating ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
            {migrating ? "Migrating…" : "Migrate Existing Files"}
          </button>
        </div>

        {migrateResult && (
          <div
            className={`mt-5 rounded-2xl p-4 flex items-start gap-3 ${
              migrateResult.error ? "bg-red-50 border border-red-200" : "bg-emerald-50 border border-emerald-200"
            }`}
          >
            {migrateResult.error ? (
              <XCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
            ) : (
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={20} />
            )}
            <div className="text-sm">
              {migrateResult.error ? (
                <p className="text-red-600 font-medium">{migrateResult.error}</p>
              ) : (
                <>
                  <p className="text-emerald-700 font-bold">
                    Migrated {migrateResult.migrated} file(s){migrateResult.alreadyMigrated ? `, ${migrateResult.alreadyMigrated} already done` : ""}.
                  </p>
                  <p className="text-emerald-600 mt-0.5">
                    Database references {migrateResult.referencedInDb} filenames in total — {migrateResult.foundLocally} of those were found in the local uploads/ folder.
                  </p>
                  {migrateResult.failed?.length > 0 && (
                    <div className="mt-2 flex items-start gap-2 text-amber-700">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>{migrateResult.failed.length} file(s) failed: {migrateResult.failed.map((f) => f.filename).join(", ")}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mt-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide mb-1">Reorganize Into Company Folders</h3>
            <p className="text-sm text-slate-500 max-w-xl">
              Moves files sitting in the old flat Contracts/Invoices/POD/Challan/E-Way Bills/Additional Documents folders into a folder named after the selected company, with those same subfolders underneath it. Files keep working exactly as before — only where they sit in Drive changes. Safe to run more than once.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <select
              value={reorgCompanyGuid}
              onChange={(e) => setReorgCompanyGuid(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">Select company…</option>
              {companies.map((c) => (
                <option key={c.guid} value={c.guid}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={handleReorganize}
              disabled={reorganizing || !reorgCompanyGuid}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all"
            >
              {reorganizing ? <Loader2 className="animate-spin" size={18} /> : <FolderTree size={18} />}
              {reorganizing ? "Moving…" : "Reorganize"}
            </button>
          </div>
        </div>

        {reorgResult && (
          <div
            className={`mt-5 rounded-2xl p-4 flex items-start gap-3 ${
              reorgResult.error ? "bg-red-50 border border-red-200" : "bg-emerald-50 border border-emerald-200"
            }`}
          >
            {reorgResult.error ? (
              <XCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
            ) : (
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={20} />
            )}
            <div className="text-sm">
              {reorgResult.error ? (
                <p className="text-red-600 font-medium">{reorgResult.error}</p>
              ) : (
                <>
                  <p className="text-emerald-700 font-bold">Moved into "{reorgResult.companyName}":</p>
                  <ul className="mt-1 space-y-0.5">
                    {reorgResult.results?.map((r) => (
                      <li key={r.folder} className="text-emerald-600">
                        {r.folder}: {r.moved} file(s) moved{r.note ? ` (${r.note})` : ""}
                        {r.failed?.length > 0 && (
                          <span className="text-amber-700"> · {r.failed.length} failed</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
