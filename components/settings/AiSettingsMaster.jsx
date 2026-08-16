"use client";
import React, { useEffect, useState } from "react";
import { Sparkles, Loader2, KeyRound, Save, BarChart3, Filter, Eye, EyeOff } from "lucide-react";
import Swal from "sweetalert2";
import { aiSettingsService } from "@/lib/services/aiSettingsService";

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "parse-order", label: "Order AI Parse" },
  { value: "parse-file", label: "Order File AI Parse" },
  { value: "contracts-parse", label: "Contract AI Parse" },
];

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
    </div>
  );
}

export default function AiSettingsMaster() {
  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const [usage, setUsage] = useState({ data: [], total: 0, summary: {}, bySource: [] });
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      setSettings(await aiSettingsService.getSettings());
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load AI settings", "error");
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadUsage = async () => {
    setLoadingUsage(true);
    try {
      const params = { page, limit };
      if (sourceFilter) params.source = sourceFilter;
      if (startDate && endDate) { params.startDate = startDate; params.endDate = endDate; }
      setUsage(await aiSettingsService.getUsage(params));
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load AI usage", "error");
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => { loadUsage(); }, [page, sourceFilter, startDate, endDate]);

  const handleSaveKey = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await aiSettingsService.saveKey(trimmed);
      setKeyInput("");
      setShowKey(false);
      await loadSettings();
      Swal.fire("Saved", "OpenAI API key updated.", "success");
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to save API key", "error");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((usage.total || 0) / limit));

  return (
    <div className="space-y-6">
      {/* API Key card */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl shadow-md shadow-indigo-100 text-white">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">AI Settings</h2>
            <p className="text-slate-500 font-medium text-sm mt-0.5">
              OpenAI API key used by every AI feature — Order AI Parse, Order File AI Parse, and Contract AI Parse.
            </p>
          </div>
        </div>

        {loadingSettings ? (
          <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={24} /></div>
        ) : (
          <>
            <div className={`flex items-center gap-3 mb-5 p-4 rounded-2xl border ${settings?.configured ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <KeyRound size={18} className={settings?.configured ? "text-emerald-600" : "text-amber-600"} />
              <div className="text-sm">
                {settings?.configured ? (
                  <>
                    <p className="font-bold text-emerald-800">Configured — {settings.maskedKey}</p>
                    <p className="text-emerald-600 text-xs mt-0.5">
                      Source: {settings.source === "database" ? "Saved here" : "Server .env fallback"}
                      {settings.updatedBy && settings.source === "database" && ` · Last updated by ${settings.updatedBy}`}
                      {settings.updatedAt && settings.source === "database" && ` on ${new Date(settings.updatedAt).toLocaleString()}`}
                    </p>
                  </>
                ) : (
                  <p className="font-bold text-amber-800">No OpenAI API key configured yet — AI features will not work.</p>
                )}
              </div>
            </div>

            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">
              {settings?.configured ? "Replace API key" : "Add API key"}
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type={showKey ? "text" : "password"}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
                  placeholder="sk-..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                />
                <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                onClick={handleSaveKey}
                disabled={saving || !keyInput.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save
              </button>
            </div>
          </>
        )}
      </div>

      {/* Usage log */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600"><BarChart3 size={18} /></div>
          <h3 className="text-lg font-black text-slate-800">Token Usage</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Calls" value={usage.summary?.totalCalls ?? 0} />
          <StatCard label="Prompt Tokens" value={usage.summary?.totalPromptTokens ?? 0} />
          <StatCard label="Completion Tokens" value={usage.summary?.totalCompletionTokens ?? 0} />
          <StatCard label="Total Tokens" value={usage.summary?.totalTokens ?? 0} />
        </div>

        {usage.bySource?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {usage.bySource.map((s) => (
              <span key={s.source} className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full">
                {s.sourceLabel}: {s.calls} calls · {s.tokens} tokens
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase pb-2.5">
            <Filter size={12} /> Filter
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">Source</label>
            <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100">
              {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">From</label>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">To</label>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
          </div>
        </div>

        {loadingUsage ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={24} /></div>
        ) : usage.data.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">No AI usage recorded yet.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Where (Source)</th>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4 text-right">Prompt</th>
                    <th className="py-2 pr-4 text-right">Completion</th>
                    <th className="py-2 pr-4 text-right">Total Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.data.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="py-2.5 pr-4"><span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full">{row.sourceLabel}</span></td>
                      <td className="py-2.5 pr-4 text-slate-600">{row.username || "—"}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-slate-600">{row.promptTokens}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-slate-600">{row.completionTokens}</td>
                      <td className="py-2.5 pr-4 text-right font-mono font-bold text-slate-800">{row.totalTokens}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
              <span className="text-xs text-slate-400">Page {page} of {totalPages} · {usage.total} total calls</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Prev</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
