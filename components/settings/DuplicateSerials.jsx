"use client";
import React, { useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Trash2, CheckCircle2, Search } from "lucide-react";
import api from "@/lib/client/apiClient";
import { useToast } from "@/lib/client/ToastContext";

// One-off diagnostic tool: inventorystockinserial has no DB-level unique
// constraint on serialNumber, so the same physical serial can end up saved
// twice (see app/api/admin/duplicate-serials/route.js) — that's what makes
// Current Stock's counts drift above the real physical count. This scans for
// exact duplicates and lets an Admin remove the extra copy of each, one at a
// time (never bulk — a Dispatched copy is refused server-side so a real sold
// unit is never the one removed by mistake).
export default function DuplicateSerials() {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [removingGuid, setRemovingGuid] = useState(null);

  const scan = async () => {
    setScanning(true);
    try {
      const res = await api.get("/admin/duplicate-serials");
      setResult(res.data);
      if (res.data.duplicateSerialCount === 0) toast.success("No duplicate serial numbers found.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to scan for duplicates");
    } finally {
      setScanning(false);
    }
  };

  const removeEntry = async (guid, serialNumber) => {
    setRemovingGuid(guid);
    try {
      await api.delete("/admin/duplicate-serials", { data: { guid } });
      toast.success(`Removed duplicate ${serialNumber}`);
      await scan();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to remove duplicate");
    } finally {
      setRemovingGuid(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-gradient-to-br from-rose-500 to-orange-600 p-3.5 rounded-2xl shadow-md shadow-rose-100 text-white">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Duplicate Serial Numbers</h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            Finds serial numbers saved more than once — the usual reason Current Stock&apos;s count runs higher than what&apos;s physically on the shelf.
          </p>
        </div>
      </div>

      <button
        onClick={scan}
        disabled={scanning}
        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all"
      >
        {scanning ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
        {scanning ? "Scanning…" : "Scan for Duplicates"}
      </button>

      {result && (
        <div className="mt-6">
          {result.duplicateSerialCount === 0 ? (
            <div className="rounded-2xl p-4 flex items-center gap-3 bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="text-emerald-600 shrink-0" size={20} />
              <p className="text-sm font-bold text-emerald-700">No duplicates found — every serial number has exactly one record.</p>
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-rose-600 mb-3">
                {result.duplicateSerialCount} serial number{result.duplicateSerialCount === 1 ? "" : "s"} duplicated — {result.extraRowCount} extra row{result.extraRowCount === 1 ? "" : "s"} inflating your stock count.
              </p>
              <div className="space-y-4">
                {result.groups.map((g) => (
                  <div key={g.serialNumber} className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 font-bold text-sm text-slate-700">{g.serialNumber}</div>
                    <div className="divide-y divide-slate-100">
                      {g.entries.map((e) => (
                        <div key={e.guid} className="flex items-center justify-between px-4 py-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-700 truncate">{e.itemName} — {e.variantName}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Status: <span className="font-semibold">{e.serialStatus}</span> · Added {new Date(e.createdAt).toLocaleString("en-IN")}
                            </p>
                          </div>
                          <button
                            onClick={() => removeEntry(e.guid, g.serialNumber)}
                            disabled={removingGuid === e.guid}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-xs disabled:opacity-50"
                          >
                            {removingGuid === e.guid ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            Remove this copy
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
