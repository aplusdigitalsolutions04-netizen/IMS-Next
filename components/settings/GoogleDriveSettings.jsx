"use client";
import React, { useState } from "react";
import { HardDrive, Loader2, CheckCircle2, XCircle, PlugZap } from "lucide-react";
import { googleDriveService } from "@/lib/services/googleDriveService";

export default function GoogleDriveSettings() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null); // { connected, folderName?, message? }

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
                <p className="text-xs text-red-500 mt-2">
                  If the account was never authorized, visit <code className="bg-red-100 px-1 py-0.5 rounded">/api/google-drive/authorize</code> once to connect it.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
