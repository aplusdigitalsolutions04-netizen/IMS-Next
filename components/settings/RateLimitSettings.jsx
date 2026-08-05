"use client";
import React, { useEffect, useState, useCallback } from "react";
import { ShieldHalf, Loader2, Save, RotateCcw, RefreshCw } from "lucide-react";
import Swal from "sweetalert2";
import { rateLimitService } from "@/lib/services/rateLimitService";

const msToLabel = (ms) => {
  if (ms % 3600000 === 0) return `${ms / 3600000} hour(s)`;
  if (ms % 60000 === 0) return `${ms / 60000} minute(s)`;
  return `${Math.round(ms / 1000)} second(s)`;
};

export default function RateLimitSettings() {
  const [rules, setRules] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({}); // guid -> { windowMs, maxRequests }
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await rateLimitService.getStatus();
      setRules(res.rules || []);
      setBuckets(res.buckets || []);
      setDrafts((prev) => {
        const next = { ...prev };
        (res.rules || []).forEach((r) => {
          if (!next[r.guid]) next[r.guid] = { windowMs: r.windowMs, maxRequests: r.maxRequests };
        });
        return next;
      });
    } catch (err) {
      console.error("Failed to load rate limit status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Live-ish view of current attempt counts — polling, not SSE, since this
    // is a low-traffic admin-only page and doesn't need sub-second freshness.
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const handleDraftChange = (guid, field, value) => {
    setDrafts((prev) => ({ ...prev, [guid]: { ...prev[guid], [field]: value } }));
  };

  const handleSave = async (rule) => {
    const draft = drafts[rule.guid];
    setSavingId(rule.guid);
    try {
      await rateLimitService.updateRule(rule.guid, {
        windowMs: Number(draft.windowMs),
        maxRequests: Number(draft.maxRequests),
      });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Rule updated", timer: 1500, showConfirmButton: false });
      await load();
    } catch (err) {
      console.error("Failed to update rule:", err);
      Swal.fire("Error", err?.response?.data?.message || "Failed to update rule", "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleResetBucket = async (bucket) => {
    try {
      await rateLimitService.resetCounter(bucket.ruleKey, bucket.ip);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: `Reset ${bucket.ip}`, timer: 1500, showConfirmButton: false });
      await load();
    } catch (err) {
      console.error("Failed to reset counter:", err);
      Swal.fire("Error", "Failed to reset counter", "error");
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-16 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={28} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl shadow-md shadow-indigo-100 text-white">
          <ShieldHalf size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">API Rate Limiting</h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            Every API request is capped per IP address. Adjust the limits below, or reset a specific IP that's currently blocked.
          </p>
        </div>
      </div>

      {/* Rules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {rules.map((rule) => {
          const draft = drafts[rule.guid] || { windowMs: rule.windowMs, maxRequests: rule.maxRequests };
          const dirty = draft.windowMs != rule.windowMs || draft.maxRequests != rule.maxRequests;
          return (
            <div key={rule.guid} className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <h3 className="text-sm font-black text-slate-700 mb-1">{rule.label}</h3>
              <p className="text-xs text-slate-400 font-medium mb-4">
                Currently: {rule.maxRequests} requests / {msToLabel(rule.windowMs)}
                {rule.updatedBy && <span> — last changed by {rule.updatedBy}</span>}
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Max Requests</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.maxRequests}
                    onChange={(e) => handleDraftChange(rule.guid, "maxRequests", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Window (seconds)</label>
                  <input
                    type="number"
                    min={1}
                    value={Math.round(draft.windowMs / 1000)}
                    onChange={(e) => handleDraftChange(rule.guid, "windowMs", Number(e.target.value) * 1000)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>
              <button
                onClick={() => handleSave(rule)}
                disabled={!dirty || savingId === rule.guid}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                {savingId === rule.guid ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />}
                Save
              </button>
            </div>
          );
        })}
      </div>

      {/* Live buckets */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide">Currently Tracked (live)</h3>
        <button onClick={load} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      <div className="border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2.5 font-bold text-slate-500 uppercase">IP Address</th>
              <th className="px-4 py-2.5 font-bold text-slate-500 uppercase">Rule</th>
              <th className="px-4 py-2.5 font-bold text-slate-500 uppercase">Tried Username(s)</th>
              <th className="px-4 py-2.5 font-bold text-slate-500 uppercase text-center">Count</th>
              <th className="px-4 py-2.5 font-bold text-slate-500 uppercase">Resets</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {buckets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No active request tracking right now.</td>
              </tr>
            ) : (
              buckets.map((b) => {
                const rule = rules.find((r) => r.ruleKey === b.ruleKey);
                const isOverLimit = rule && b.count > rule.maxRequests;
                return (
                  <tr key={`${b.ruleKey}-${b.ip}`} className={isOverLimit ? "bg-red-50" : "hover:bg-slate-50"}>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{b.ip}</td>
                    <td className="px-4 py-2.5 text-slate-600 capitalize">{b.ruleKey}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {b.usernames?.length > 0 ? (
                        <span className="font-mono">{b.usernames.join(", ")}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-center font-bold ${isOverLimit ? "text-red-600" : "text-slate-700"}`}>
                      {b.count}{rule ? ` / ${rule.maxRequests}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(b.resetAt).toLocaleTimeString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleResetBucket(b)}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 ml-auto"
                        title="Reset this IP's counter"
                      >
                        <RotateCcw size={11} /> Reset
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
