"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { printerService } from '@/lib/services/api';
import { History, Filter, X, Loader2, Search, Calendar, Shield, Activity, ArrowRight, User, MapPin } from 'lucide-react';
import { format } from 'date-fns';

export default function UserActivity() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ user: '', role: '', date: '' });

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // FIX 2: Wrapped in useCallback to prevent re-renders, and simplified the parameters 
  // to directly use the current state values to prevent race conditions.
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await printerService.getActivityLogs(currentPage, pageSize);
      // If backend returns {data, total}
      if (response && response.data) {
        setLogs(response.data);
        setTotalRecords(response.total || 0);
      } else {
        setLogs(Array.isArray(response) ? response : []);
        setTotalRecords(Array.isArray(response) ? response.length : 0);
      }
    } catch (error) {
      console.error("Failed to fetch activity logs", error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize]);

  // FIX 2: Merged the two useEffects into one single dependency array. 
  // Now it fetches exactly once on mount, and exactly once when page or limit changes.
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const userMatch = !filters.user || log.username.toLowerCase().includes(filters.user.toLowerCase());
      const roleMatch = !filters.role || log.role === filters.role;
      const dateMatch = !filters.date || format(new Date(log.changedAt), 'yyyy-MM-dd') === filters.date;
      return userMatch && roleMatch && dateMatch;
    });
  }, [logs, filters]);

  const uniqueRoles = useMemo(() => [...new Set(logs.map(log => log.role))], [logs]);

  // UI Helper for Role Badges
  const getRoleStyle = (role) => {
    const r = (role || "").toLowerCase();
    if (r === 'admin') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (r === 'supervisor') return 'bg-sky-100 text-sky-700 border-sky-200';
    if (r === 'accountant') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (r === 'operator') return 'bg-violet-100 text-violet-700 border-violet-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  // FIX 1: Upgraded renderDetails UI to intelligently hide "empty" old values
  const renderDetails = (details) => {
    try {
      const parsed = JSON.parse(details);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return <span className="text-slate-400 italic text-xs font-medium">No specifics available</span>;
      }
      return (
        <div className="space-y-1.5">
          {parsed.map((change, index) => {
            // Check if values actually exist and are not literally the string "empty" or "null"
            const oldVal = change.oldValue;
            const newVal = change.newValue;

            const hasOldValue = oldVal !== undefined && oldVal !== null && oldVal !== 'empty' && String(oldVal).trim() !== '';
            const hasNewValue = newVal !== undefined && newVal !== null && newVal !== 'empty' && String(newVal).trim() !== '';

            return (
              <div key={index} className="flex items-center flex-wrap gap-2 text-[11px]">
                <span className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded shrink-0 border border-slate-200">
                  {change.field}
                </span>
                <div className="flex items-center gap-1.5 bg-slate-50/50 px-2 py-1 rounded-lg border border-slate-100">

                  {/* Only show old value and arrow IF old value legitimately exists */}
                  {hasOldValue && (
                    <>
                      <span className="text-rose-600 line-through font-mono max-w-[120px] truncate" title={oldVal}>
                        {oldVal}
                      </span>
                      <ArrowRight size={12} className="text-slate-400 shrink-0" />
                    </>
                  )}

                  <span className="text-emerald-600 font-mono font-medium max-w-[120px] truncate" title={newVal}>
                    {hasNewValue ? newVal : (hasOldValue ? 'Removed' : 'Updated')}
                  </span>

                </div>
              </div>
            );
          })}
        </div>
      );
    } catch {
      return <span className="text-slate-500 text-xs">{details}</span>;
    }
  };

  return (
    <div className="w-full space-y-6">

      {/* Premium Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 md:p-8 text-white shadow-lg shadow-slate-200">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
            <Activity size={28} className="text-indigo-300" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-1">
              User Activity Logs
            </h1>
            <p className="text-sm md:text-base text-slate-300 font-medium">
              Monitor system changes and track user actions.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">

        {/* Filters Section */}
        <div className="p-5 md:p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col md:flex-row items-center gap-4">

            <div className="flex items-center gap-2 text-slate-500 shrink-0 mb-2 md:mb-0">
              <Filter size={18} />
              <span className="text-sm font-bold tracking-wide uppercase">Filters:</span>
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
              {/* Username Filter */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by username..."
                  value={filters.user}
                  onChange={e => setFilters({ ...filters, user: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                />
              </div>

              {/* Role Filter */}
              <div className="relative">
                <Shield size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                <select
                  value={filters.role}
                  onChange={e => setFilters({ ...filters, role: e.target.value })}
                  className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                >
                  <option value="">All Roles</option>
                  {uniqueRoles.map(role => <option key={role} value={role}>{role}</option>)}
                </select>
              </div>

              {/* Date Filter */}
              <div className="relative">
                <Calendar size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" />
                <input
                  type="date"
                  value={filters.date}
                  onChange={e => setFilters({ ...filters, date: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm text-slate-600"
                />
              </div>
            </div>

            {/* Clear Filters Button */}
            {(filters.user || filters.role || filters.date) && (
              <button
                onClick={() => setFilters({ user: '', role: '', date: '' })}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all"
              >
                <X size={14} strokeWidth={3} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Table Section */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-black tracking-wider text-slate-400 uppercase border-b border-slate-200">
                <th className="px-6 py-4">S.No.</th>
                <th className="px-6 py-4">User Details</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Action Taken</th>
                <th className="px-6 py-4">Specific Changes</th>
                <th className="px-6 py-4">IP / Location</th>
                <th className="px-6 py-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <Loader2 size={32} className="animate-spin text-indigo-500" />
                      <p className="text-sm font-semibold">Loading activity logs...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                        <History size={24} className="text-slate-300" />
                      </div>
                      <p className="text-sm font-bold text-slate-500">No matching logs found.</p>
                      <p className="text-xs">Try adjusting or clearing your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, index) => (
                  <tr key={log.id || index} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4 align-top text-slate-400 font-semibold">
                      {(currentPage - 1) * pageSize + index + 1}
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200 shrink-0">
                          <User size={14} />
                        </div>
                        <span className="font-extrabold text-slate-800 text-sm">{log.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-sm ${getRoleStyle(log.role)}`}>
                        {log.role || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <span className="text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg inline-block">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-top min-w-[300px]">
                      {renderDetails(log.details)}
                    </td>
                    <td className="px-6 py-4 align-top whitespace-nowrap">
                      <div className="text-xs font-mono text-slate-600">{log.ipAddress || '—'}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin size={10} />
                        {log.location || 'Unknown'}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-right whitespace-nowrap">
                      <div className="text-xs font-bold text-slate-700">
                        {format(new Date(log.changedAt), 'dd MMM yyyy')}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
                        {format(new Date(log.changedAt), 'hh:mm a')}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Section */}
        {totalRecords > 0 && (
          <div className="bg-slate-50/80 border-t border-slate-100 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium">
                Showing <span className="font-bold text-slate-700">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPage * pageSize, totalRecords)}</span> of <span className="font-bold text-slate-700">{totalRecords}</span> entries
              </span>

              <div className="flex items-center gap-2">
                <select
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 outline-none focus:border-indigo-400 transition-all cursor-pointer shadow-sm"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1); // Changing this state alongside pageSize will perfectly trigger the unified useEffect
                  }}
                >
                  {[10, 25, 50, 100].map(val => (
                    <option key={val} value={val}>{val} per page</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-slate-200 disabled:hover:text-slate-500 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>

              <div className="flex items-center gap-1">
                {(() => {
                  const totalPages = Math.ceil(totalRecords / pageSize);
                  const windowSize = Math.min(5, totalPages);
                  // Slides the 5-button window so it's centered on the
                  // current page instead of always starting at 1.
                  let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
                  const end = Math.min(totalPages, start + windowSize - 1);
                  start = Math.max(1, end - windowSize + 1);
                  return Array.from({ length: windowSize }, (_, i) => start + i);
                })().map((pageNum) => {
                  const isActive = currentPage === pageNum;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-all shadow-sm ${isActive
                          ? 'bg-slate-900 text-white border border-slate-900'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                        }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                disabled={currentPage >= Math.ceil(totalRecords / pageSize)}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-slate-200 disabled:hover:text-slate-500 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}