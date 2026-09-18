"use client";
import React, { useEffect, useState } from "react";
import { RotateCcw, ShieldAlert, Search, Loader2, Trash2, ShoppingCart, FileText, Package, Hash, X, ChevronLeft, ChevronRight } from "lucide-react";
import Swal from "sweetalert2";
import { deletedItemsService } from "@/lib/services/deletedItemsService";

const TABS = [
  { key: "orders", label: "Orders", icon: ShoppingCart },
  { key: "contracts", label: "Contracts", icon: FileText },
  { key: "items", label: "Item Master", icon: Package },
  { key: "serials", label: "Serial Numbers", icon: Hash },
];

const PAGE_SIZE = 10;

const formatDate = (val) => {
  if (!val) return "-";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Restore always asks why — this is the record for it, shown right next to
// the row's own delete reason so an Admin can see both sides of the story.
function RestoreModal({ target, onClose, onConfirm, submitting }) {
  const [remarks, setRemarks] = useState("");
  if (!target) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><RotateCcw size={18} /> Restore Record</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            <span className="font-bold text-slate-800">&ldquo;{target.label}&rdquo;</span> will become visible again everywhere it normally shows up.
          </p>
          {target.deleteRemarks && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-xs">
              <p className="font-bold text-rose-600 uppercase tracking-wide mb-1">Originally deleted because</p>
              <p className="text-rose-800">{target.deleteRemarks}</p>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Why are you restoring this? <span className="text-rose-500">*</span></label>
            <textarea
              autoFocus
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="e.g. Deleted by mistake, needed again for..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={() => onConfirm(remarks.trim())}
            disabled={submitting || !remarks.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            {submitting ? "Restoring..." : "Restore"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DeletedItems({ currentUser, hasPermission }) {
  const isAdmin = hasPermission ?? currentUser?.role === "Admin";
  const [activeTab, setActiveTab] = useState("orders");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [restoreTarget, setRestoreTarget] = useState(null); // { type, id, label, deleteRemarks }
  const [restoring, setRestoring] = useState(false);

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const data = await deletedItemsService.getDeletedItems(activeTab, search);
      setRows(data);
      setPage(1);
    } catch (err) {
      Swal.fire("Error", err.response?.data?.message || "Failed to load deleted items", "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(load, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openRestore = (type, id, label, deleteRemarks) => setRestoreTarget({ type, id, label, deleteRemarks });
  const closeRestore = () => { if (!restoring) setRestoreTarget(null); };

  const handleConfirmRestore = async (remarks) => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await deletedItemsService.restore(restoreTarget.type, restoreTarget.id, remarks);
      const label = restoreTarget.label;
      setRestoreTarget(null);
      await load();
      Swal.fire("Restored", `"${label}" has been restored.`, "success");
    } catch (err) {
      Swal.fire("Error", err.response?.data?.message || "Failed to restore", "error");
    } finally {
      setRestoring(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
        <ShieldAlert size={48} className="mb-4 text-slate-300" />
        <p className="text-lg font-semibold">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="bg-gradient-to-br from-rose-500 to-red-600 p-3.5 rounded-2xl shadow-md shadow-rose-100 text-white">
          <Trash2 size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Deleted Items</h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            See who deleted what (and why) and restore it — Admin only.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-slate-100 pb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setSearch(""); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              activeTab === t.key ? "bg-rose-600 text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-100"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-3 text-xs font-black text-slate-500 uppercase w-10">#</th>
              {activeTab === "orders" && (
                <>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Order ID</th>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Customer</th>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Platform</th>
                </>
              )}
              {activeTab === "contracts" && (
                <>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Contract Number</th>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Bid Number</th>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Organisation</th>
                </>
              )}
              {activeTab === "items" && (
                <>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Type</th>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Name</th>
                </>
              )}
              {activeTab === "serials" && (
                <>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Serial No.</th>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Item</th>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase">Variant</th>
                </>
              )}
              <th className="p-3 text-xs font-black text-slate-500 uppercase">Reason</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase">Deleted By</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase">Deleted At</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-rose-600" size={24} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-slate-400">Nothing deleted here.</td></tr>
            ) : (
              pagedRows.map((r, idx) => {
                const type = activeTab === "items" ? (r.entityType === "Item" ? "item" : "variant") : activeTab;
                const id = r.guid || r.id;
                const label = r.orderId || r.contractNumber || r.name || r.serialNumber || "this record";
                return (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-400">{(safePage - 1) * PAGE_SIZE + idx + 1}</td>
                    {activeTab === "orders" && (
                      <>
                        <td className="p-3 font-bold text-slate-700">{r.orderId}</td>
                        <td className="p-3 text-slate-600">{r.customerName || "-"}</td>
                        <td className="p-3 text-slate-600">{r.platform || "-"}</td>
                      </>
                    )}
                    {activeTab === "contracts" && (
                      <>
                        <td className="p-3 font-bold text-slate-700">{r.contractNumber}</td>
                        <td className="p-3 text-slate-600">{r.bidNumber || "-"}</td>
                        <td className="p-3 text-slate-600 max-w-[200px] truncate" title={r.organisation}>{r.organisation || "-"}</td>
                      </>
                    )}
                    {activeTab === "items" && (
                      <>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.entityType === "Item" ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
                            {r.entityType}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-700">{r.name}</td>
                      </>
                    )}
                    {activeTab === "serials" && (
                      <>
                        <td className="p-3 font-mono font-bold text-slate-800">{r.serialNumber}</td>
                        <td className="p-3 text-slate-600">{r.itemName || "-"}</td>
                        <td className="p-3 text-slate-600">{r.variantName || "-"}</td>
                      </>
                    )}
                    <td className="p-3 text-slate-500 max-w-[220px] truncate" title={r.deleteRemarks}>{r.deleteRemarks || "-"}</td>
                    <td className="p-3 text-slate-600">{r.deletedBy || "-"}</td>
                    <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(r.deletedAt)}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => openRestore(type, id, label, r.deleteRemarks)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <RotateCcw size={13} />
                        Restore
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
          <span>Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)} of {rows.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-200">
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 font-bold text-slate-600">Page {safePage} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-200">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <RestoreModal target={restoreTarget} onClose={closeRestore} onConfirm={handleConfirmRestore} submitting={restoring} />
    </div>
  );
}
