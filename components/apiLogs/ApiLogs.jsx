"use client";
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Loader2, Search, ShieldAlert, X } from "lucide-react";
import Swal from "sweetalert2";
import { printerService } from "@/lib/services/api";

const METHODS = ["GET", "POST", "PUT", "DELETE"];
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export default function ApiLogs({ currentUser, hasPermission }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ totalCalls: 0, totalErrors: 0 });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [onlyErrors, setOnlyErrors] = useState(false);
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [detailLog, setDetailLog] = useState(null);

  const isAdmin = hasPermission ?? currentUser?.role === "Admin";

  const activeFilters = () => ({
    onlyErrors: onlyErrors ? "1" : undefined,
    method: method || undefined,
    search: search || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const handleDownload = async () => {
    try {
      setDownloading(true);
      await printerService.downloadApiLogs(activeFilters());
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || error.message || "Failed to download API logs", "error");
    } finally {
      setDownloading(false);
    }
  };

  const fetchLogs = async (targetPage = page, targetLimit = limit) => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const res = await printerService.getApiLogs({ page: targetPage, limit: targetLimit, ...activeFilters() });
      setLogs(res.data || []);
      setTotal(res.total || 0);
      setSummary(res.summary || { totalCalls: 0, totalErrors: 0 });
      setPage(res.page || targetPage);
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || error.message || "Failed to fetch API logs", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyErrors, method, search, startDate, endDate, limit]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  if (!isAdmin) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
        <ShieldAlert size={48} className="mb-4 text-slate-300" />
        <p className="text-lg font-semibold">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-900">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
        <div className="border-b border-slate-100 bg-white px-5 py-5">
          <h1 className="text-2xl font-black tracking-tight text-slate-950">API Request Logs</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Every API call — who called it, when, and what error (if any) it returned.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Calls (filtered)</p>
            <p className="text-2xl font-black text-slate-900">{summary.totalCalls}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Errors (filtered)</p>
            <p className="text-2xl font-black text-rose-600">{summary.totalErrors}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 md:flex-row md:flex-wrap md:items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search path or error message..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setSearch(searchInput.trim()); }}
              onBlur={() => setSearch(searchInput.trim())}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-indigo-400"
          >
            <option value="">All Methods</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-indigo-400"
          />
          <span className="text-sm text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-indigo-400"
          />

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={onlyErrors}
              onChange={(e) => setOnlyErrors(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            />
            Errors only
          </label>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="ml-auto flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Download CSV
          </button>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-500">
            <AlertTriangle size={48} className="mb-4 text-slate-300" />
            <p className="text-lg font-semibold">No API calls found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">S.No.</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">User</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Path</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {logs.map((log, index) => (
                  <tr key={log.id} className={log.isError ? "bg-rose-50/50" : "hover:bg-slate-50"}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-400">
                      {(page - 1) * limit + index + 1}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-600">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-slate-800">
                      {log.username || "Anonymous"}
                      {log.role && <span className="ml-1 text-xs font-medium text-slate-400">({log.role})</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-indigo-600">{log.method}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-sm text-slate-700" title={log.path}>{log.path}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${log.isError ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {log.statusCode}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{log.durationMs}ms</td>
                    <td className="max-w-sm truncate px-4 py-3 text-xs text-rose-600">
                      {log.errorMessage ? (
                        <button onClick={() => setDetailLog(log)} className="truncate underline decoration-dotted hover:text-rose-800" title="Click to view full error reason">
                          {log.errorMessage}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">Page {page} of {totalPages} ({total} total)</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-600 outline-none focus:border-indigo-400"
              >
                {PAGE_SIZE_OPTIONS.map((val) => (
                  <option key={val} value={val}>{val} per page</option>
                ))}
              </select>
            </div>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  disabled={page === 1 || loading}
                  onClick={() => fetchLogs(page - 1)}
                  className="rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages || loading}
                  onClick={() => fetchLogs(page + 1)}
                  className="rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {detailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setDetailLog(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Error Detail</h3>
              <button onClick={() => setDetailLog(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Call</p>
                <p className="text-sm font-semibold text-slate-800">
                  {detailLog.method} {detailLog.path} — <span className="text-rose-600">{detailLog.statusCode}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {detailLog.username || "Anonymous"} ({detailLog.role || "-"}) · {new Date(detailLog.createdAt).toLocaleString()} · {detailLog.durationMs}ms · IP {detailLog.ipAddress || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Reason</p>
                <p className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{detailLog.errorMessage}</p>
              </div>
              {detailLog.errorStack && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Technical Detail (Stack Trace)</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-200 whitespace-pre-wrap">{detailLog.errorStack}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
