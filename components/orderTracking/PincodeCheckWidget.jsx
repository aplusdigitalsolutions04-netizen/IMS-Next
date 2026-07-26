"use client";
import React, { useEffect, useState } from "react";
import { Truck, Loader2, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { printerService } from "@/lib/services/api";

// Auto-extracts the 6-digit pincode from the order's shipping/buyer address
// and checks Delhivery serviceability + estimated freight charge for it —
// no manual pincode entry needed.
const extractPincode = (address) => {
  const match = String(address || "").match(/\b\d{6}\b/);
  return match ? match[0] : null;
};

export default function PincodeCheckWidget({ address }) {
  const pincode = extractPincode(address);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const runCheck = async () => {
    if (!pincode) return;
    setLoading(true);
    setError("");
    try {
      const res = await printerService.checkPincode({ pincode, weightGrams: 500, paymentMode: "Prepaid" });
      setResult(res);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to check pincode.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setResult(null);
    setError("");
    if (pincode) runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode]);

  if (!pincode) {
    return (
      <div className="bg-slate-50 rounded p-2 col-span-full">
        <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1"><Truck size={10} /> Delhivery Serviceability</span>
        <p className="text-xs text-slate-400">No 6-digit pincode found in the address.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 rounded p-2 col-span-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1"><Truck size={10} /> Delhivery Serviceability — {pincode}</span>
        <button onClick={runCheck} disabled={loading} className="text-slate-400 hover:text-indigo-600 disabled:opacity-50" title="Re-check">
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        </button>
      </div>

      {loading && <p className="text-xs text-slate-400">Checking...</p>}
      {!loading && error && <p className="text-xs text-red-600">{error}</p>}

      {!loading && !error && result && (
        <div className="flex flex-wrap items-center gap-2">
          {result.serviceable ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
              <CheckCircle size={9} /> Serviceable
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
              <XCircle size={9} /> Not Serviceable
            </span>
          )}
          {result.serviceable && result.chargesError && (
            <span className="text-[10px] text-amber-600">{result.chargesError}</span>
          )}
        </div>
      )}
    </div>
  );
}
