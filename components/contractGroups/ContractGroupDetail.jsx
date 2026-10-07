"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { ArrowLeft, Loader2, Trash2, RefreshCw, Plus, Settings2, X } from "lucide-react";
import { contractGroupsService } from "@/lib/services/contractGroupsService";
import Pagination from "./Pagination";
import ExcelTools from "./ExcelTools";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) => n(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("en-IN");
};
const errMsg = (err, fallback) => err?.response?.data?.message || fallback;
const CANCELLED = new Set(["Cancelled", "Order Cancelled"]);

// Same formulas as the margin sheet's "DGGI JAIPUR" tab. GST % is per row
// (default 18) because some items are 0% tax.
const calc = (r) => {
  const qty = n(r.orderQty), landing = n(r.landingPrice), delivered = n(r.qtyDelivered), amount = n(r.orderAmount);
  const g = 1 + n(r.gstPct) / 100;
  const totalLanding = qty * landing;
  const short = qty - delivered;
  const perUnit = qty ? amount / qty : 0;
  const sortAmt = perUnit * short;
  const delAmt = perUnit * delivered;
  const sortWT = sortAmt / g;
  const delWT = delAmt / g;
  return { totalLanding, short, perUnit, sortAmt, delAmt, sortWT, delWT, afterLess: sortWT * 0.8 };
};

export const STATUS_COLORS = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
  sky: "bg-sky-100 text-sky-700 border-sky-200",
  violet: "bg-violet-100 text-violet-700 border-violet-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
};

// Master list behind the Commission Status dropdown: add / rename / recolor / remove.
function CommissionStatusManager({ statuses, onClose, onChanged }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("slate");
  const [busy, setBusy] = useState(false);
  const active = statuses.filter((x) => x.isActive);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await onChanged(); } catch (err) { Swal.fire("Error", errMsg(err, "Failed."), "error"); } finally { setBusy(false); }
  };
  const add = () => run(async () => { await contractGroupsService.addStatus({ label, color }); setLabel(""); });
  const rename = (st) => run(async () => {
    const res = await Swal.fire({ title: "Rename status", input: "text", inputValue: st.label, showCancelButton: true, confirmButtonText: "Save" });
    if (res.isConfirmed && String(res.value || "").trim()) await contractGroupsService.updateStatus({ guid: st.guid, label: res.value });
  });
  const remove = (st) => run(async () => {
    const ok = await Swal.fire({ title: `Remove "${st.label}"?`, text: "Rows already using it keep showing it.", icon: "warning", showCancelButton: true, confirmButtonText: "Remove" });
    if (ok.isConfirmed) await contractGroupsService.deleteStatus(st.guid);
  });

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Commission Status master</h3>
            <p className="text-xs text-slate-500 mt-0.5">Options of the Commission Status dropdown.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {active.length === 0 && <div className="text-sm text-slate-400 text-center py-4">No statuses yet.</div>}
            {active.map((st) => (
              <div key={st.guid} className="flex items-center gap-2">
                <span className={`flex-1 text-xs font-bold px-3 py-1.5 rounded-full border ${STATUS_COLORS[st.color] || STATUS_COLORS.slate}`}>{st.label}</span>
                <select value={st.color} disabled={busy} onChange={(e) => run(() => contractGroupsService.updateStatus({ guid: st.guid, color: e.target.value }))} className="border border-slate-200 rounded-lg px-1.5 py-1 text-xs bg-white">
                  {Object.keys(STATUS_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => rename(st)} disabled={busy} className="text-xs font-bold text-indigo-600 hover:underline">Rename</button>
                <button onClick={() => remove(st)} disabled={busy} className="p-1 text-slate-300 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && label.trim() && add()} placeholder="New status (e.g. Partially Paid)" className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
            <select value={color} onChange={(e) => setColor(e.target.value)} className="border border-slate-200 rounded-xl px-2 text-xs bg-white">
              {Object.keys(STATUS_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={add} disabled={busy || !label.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 rounded-xl text-sm font-bold">Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100 rounded px-1.5 py-1 text-xs outline-none";

export default function ContractGroupDetail() {
  const router = useRouter();
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [rows, setRows] = useState([]);
  const [suggestions, setSuggestions] = useState({ contracts: [], orders: [], otherCompanies: [] });
  const [pickOther, setPickOther] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickContracts, setPickContracts] = useState(new Set());
  const [pickOrders, setPickOrders] = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [statuses, setStatuses] = useState([]);
  const [showStatusMgr, setShowStatusMgr] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(async () => {
    try {
      const data = await contractGroupsService.get(id);
      setGroup(data.group);
      setRows(data.rows);
      setSuggestions(data.suggestions);
      setStatuses(data.commissionStatuses || []);
      setPickContracts(new Set());
      setPickOrders(new Set());
      setPickOther(new Set());
      setError("");
    } catch (err) {
      setError(errMsg(err, "Failed to load group."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const setField = (rowGuid, key, value) => setRows((prev) => prev.map((r) => (r.guid === rowGuid ? { ...r, [key]: value } : r)));

  // Inline edit: saved on blur, only this group's own copy of the row changes.
  const saveField = async (row, key) => {
    try {
      await contractGroupsService.updateRow(id, row.guid, { [key]: row[key] });
    } catch (err) {
      Swal.fire("Error", errMsg(err, "Failed to save."), "error");
      load();
    }
  };

  const removeRow = async (row) => {
    const ok = await Swal.fire({
      title: "Remove from group?",
      text: `${row.contractNumber} will be removed from this group (the original contract/order is not changed).`,
      icon: "warning", showCancelButton: true, confirmButtonText: "Remove",
    });
    if (!ok.isConfirmed) return;
    try { await contractGroupsService.removeRow(id, row.guid); await load(); } catch (err) { Swal.fire("Error", errMsg(err, "Failed to remove."), "error"); }
  };

  const refreshRow = async (row) => {
    const ok = await Swal.fire({
      title: "Refresh from contract?",
      text: "Date, firm, item, qty, landing price, delivered qty and order amount of this row will be re-read from the source. Your other edits (GST %, comm label) stay.",
      icon: "question", showCancelButton: true, confirmButtonText: "Refresh",
    });
    if (!ok.isConfirmed) return;
    try { await contractGroupsService.refreshRow(id, row.guid); await load(); } catch (err) { Swal.fire("Error", errMsg(err, "Failed to refresh."), "error"); }
  };

  const addSelected = async () => {
    setAdding(true);
    try {
      await contractGroupsService.addSources(id, { contractGuids: [...pickContracts], orderGuids: [...pickOrders] });
      await load();
    } catch (err) {
      Swal.fire("Error", errMsg(err, "Failed to add."), "error");
    } finally {
      setAdding(false);
    }
  };

  const addOtherSelected = async () => {
    setAdding(true);
    try {
      const res = await contractGroupsService.addSources(id, { contractGuids: [...pickOther], orderGuids: [] });
      if (res?.skipped) Swal.fire("Added", res.message, "info");
      await load();
    } catch (err) {
      Swal.fire("Error", errMsg(err, "Failed to add."), "error");
    } finally {
      setAdding(false);
    }
  };

  const togglePick = (setter, guid) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(guid) ? next.delete(guid) : next.add(guid);
      return next;
    });

  const totals = useMemo(() => {
    const t = { qty: 0, totalLanding: 0, short: 0, delivered: 0, amount: 0, sortAmt: 0, delAmt: 0, sortWT: 0, delWT: 0, afterLess: 0, commission: 0 };
    for (const r of rows) {
      if (CANCELLED.has(r.sourceStatus)) continue;
      const c = calc(r);
      t.qty += n(r.orderQty); t.delivered += n(r.qtyDelivered); t.amount += n(r.orderAmount);
      t.totalLanding += c.totalLanding; t.short += c.short; t.sortAmt += c.sortAmt; t.delAmt += c.delAmt;
      t.sortWT += c.sortWT; t.delWT += c.delWT; t.afterLess += c.afterLess; t.commission += n(r.commission);
    }
    return t;
  }, [rows]);

  const maxPage = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, maxPage);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const numCell = (r, key, w = "w-20") => (
    <div className={`${w} shrink-0`}>
      <input type="number" step="any" value={r[key]} onChange={(e) => setField(r.guid, key, e.target.value)} onBlur={() => saveField(r, key)} className={`${inputCls} text-center`} />
    </div>
  );
  const textCell = (r, key, w) => (
    <div className={`${w} shrink-0`}>
      <input value={r[key]} title={String(r[key] ?? "")} onChange={(e) => setField(r.guid, key, e.target.value)} onBlur={() => saveField(r, key)} className={inputCls} />
    </div>
  );

  if (loading) return <div className="p-16 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={26} /></div>;
  if (error) return (
    <div className="space-y-4">
      <button onClick={() => router.push("/contracts/groups")} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-indigo-600"><ArrowLeft size={16} /> All Groups</button>
      <div className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</div>
    </div>
  );

  const suggestionCount = suggestions.contracts.length + suggestions.orders.length;
  const th = "p-2.5 text-[10px] font-black text-slate-500 uppercase tracking-wide whitespace-nowrap";

  return (
    <div className="space-y-6">
      <button onClick={() => router.push("/contracts/groups")} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">
        <ArrowLeft size={16} /> All Groups
      </button>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-wrap items-center gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight truncate">{group.name}</h2>
          <p className="text-sm text-slate-400 font-medium mt-0.5">
            {new Set(rows.map((r) => r.sourceGuid)).size} contract/order{rows.length ? "s" : ""} · {rows.length} row{rows.length !== 1 ? "s" : ""}
            {group.companyName && <span className="ml-2 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-1.5 py-0.5">{group.companyName}</span>}
            {group.clientGuid && <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5">Client Master</span>}
          </p>
        </div>
        <ExcelTools
          compact
          exportPath={`/contract-groups/${id}/export`}
          templatePath={`/contract-groups/${id}/template`}
          importPath={`/contract-groups/${id}/import`}
          onImported={load}
        />
        <button onClick={() => setShowStatusMgr(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5"><Settings2 size={14} /> Commission statuses</button>
        <div className="flex gap-3">
          <div className="bg-emerald-50 rounded-xl px-5 py-3 text-center"><div className="text-[10px] font-bold text-emerald-600 uppercase">Order value</div><div className="text-lg font-black text-emerald-700">₹{fmt(totals.amount)}</div></div>
          <div className="bg-amber-50 rounded-xl px-5 py-3 text-center"><div className="text-[10px] font-bold text-amber-600 uppercase">Pending qty</div><div className="text-lg font-black text-amber-700">{totals.short}</div></div>
          <div className="bg-indigo-50 rounded-xl px-5 py-3 text-center"><div className="text-[10px] font-bold text-indigo-600 uppercase">Commission</div><div className="text-lg font-black text-indigo-700">₹{fmt(totals.commission)}</div></div>
        </div>
      </div>

      {suggestionCount > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-black text-amber-800">{suggestionCount} new matching item{suggestionCount > 1 ? "s" : ""} not in this group</div>
            <button onClick={addSelected} disabled={adding || (pickContracts.size + pickOrders.size === 0)} className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5">
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add selected ({pickContracts.size + pickOrders.size})
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.contracts.map((c) => (
              <label key={c.guid} className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border cursor-pointer bg-white ${pickContracts.has(c.guid) ? "border-amber-400" : "border-slate-200"}`}>
                <input type="checkbox" checked={pickContracts.has(c.guid)} onChange={() => togglePick(setPickContracts, c.guid)} />
                Contract {c.contractNumber} <span className="text-slate-400 font-normal">· {c.companyName}</span>
              </label>
            ))}
            {suggestions.orders.map((o) => (
              <label key={o.guid} className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border cursor-pointer bg-white ${pickOrders.has(o.guid) ? "border-amber-400" : "border-slate-200"}`}>
                <input type="checkbox" checked={pickOrders.has(o.guid)} onChange={() => togglePick(setPickOrders, o.guid)} />
                Order {o.orderid} <span className="text-slate-400 font-normal">· {o.companyName} · {fmtDate(o.orderDate)}</span>
                {o.matchedBy === "name" && <span title="Matched by name only — verify" className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-1.5 py-0.5">name match</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {(() => {
        const all = suggestions.otherCompanies || [];
        const available = all.filter((c) => !c.inGroup);
        const grouped = all.filter((c) => c.inGroup);
        if (all.length === 0) return null;
        const byCompany = grouped.reduce((acc, c) => { acc[c.companyName] = (acc[c.companyName] || 0) + 1; return acc; }, {});
        return (
          <div className="space-y-3">
            {available.length > 0 && (
              <div className="bg-sky-50/60 border border-sky-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-black text-sky-900">
                      Same combination in other companies — {available.length} contract{available.length > 1 ? "s" : ""} not grouped yet
                    </div>
                    <p className="text-xs text-sky-700/80 mt-0.5">
                      This group only holds this company&apos;s contracts. Tick any of these to combine them here as well.
                    </p>
                  </div>
                  <button
                    onClick={addOtherSelected}
                    disabled={adding || pickOther.size === 0}
                    className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5"
                  >
                    {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add selected ({pickOther.size})
                  </button>
                </div>
                <div className="bg-white border border-sky-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-sky-50 text-[10px] font-black text-sky-800 uppercase tracking-wide">
                        <th className="p-2.5 w-8"></th><th className="p-2.5">Company</th><th className="p-2.5">Contract No</th><th className="p-2.5">Date</th><th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {available.map((c) => (
                        <tr key={c.guid}>
                          <td className="p-2.5"><input type="checkbox" checked={pickOther.has(c.guid)} onChange={() => togglePick(setPickOther, c.guid)} /></td>
                          <td className="p-2.5 font-bold text-slate-700">{c.companyName}</td>
                          <td className="p-2.5 font-semibold">{c.contractNumber}</td>
                          <td className="p-2.5">{fmtDate(c.generatedDate)}</td>
                          <td className="p-2.5">{c.status || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {grouped.length > 0 && (
              <details className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs text-slate-500">
                <summary className="cursor-pointer font-semibold text-slate-600">
                  Other companies already have {grouped.length} matching contract{grouped.length > 1 ? "s" : ""} in their own groups
                  <span className="font-normal text-slate-400"> — {Object.entries(byCompany).map(([n, k]) => `${n} (${k})`).join(", ")}</span>
                </summary>
                <p className="mt-2 text-[11px] text-slate-400">Switch to that company (top bar) to open its group.</p>
              </details>
            )}
          </div>
        );
      })()}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className={th}>#</th><th className={th}>Date</th><th className={th}>Firm</th><th className={th}>Contract No</th><th className={th}>Item</th>
              <th className={`${th} text-center`}>Order Qty</th><th className={`${th} text-center`}>Landing Price</th><th className={`${th} text-center`}>Total Landing Amount</th>
              <th className={`${th} text-center`}>Qty Short</th><th className={`${th} text-center`}>Qty Delivered</th><th className={`${th} text-center`}>Order Amount</th>
              <th className={`${th} text-center`}>Per Unit Price</th><th className={`${th} text-center`}>Sort Qty Amount</th><th className={`${th} text-center`}>Delivered Qty Amount</th>
              <th className={`${th} text-center`}>Sort Amount W/T</th><th className={`${th} text-center`}>Delivered Amount W/T</th>
              <th className={`${th} text-center`}>Sort Amount (After 10% Less)</th><th className={th}>Comm on Delivered (20/10%)</th>
              <th className={`${th} text-center`}>Commission</th><th className={th}>Commission Status</th><th className={`${th} text-center`}>GST %</th><th className={th}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={22} className="p-10 text-center text-slate-400 text-sm">This group has no rows.</td></tr>
            ) : pagedRows.map((r, ri) => {
              const c = calc(r);
              const cancelled = CANCELLED.has(r.sourceStatus);
              const ro = "p-2.5 text-xs text-center whitespace-nowrap tabular-nums";
              return (
                <tr key={r.guid} className={`hover:bg-slate-50/60 ${cancelled ? "opacity-50" : ""}`}>
                  <td className="p-2.5 text-xs font-bold text-slate-400">{(currentPage - 1) * pageSize + ri + 1}</td>
                  <td className="p-1"><input type="date" value={r.rowDate} onChange={(e) => setField(r.guid, "rowDate", e.target.value)} onBlur={() => saveField(r, "rowDate")} className={`${inputCls} w-32`} /></td>
                  <td className="p-1">{textCell(r, "firm", "w-64")}</td>
                  <td className="p-1">
                    {textCell(r, "contractNumber", "w-52")}
                    {r.sourceStatus && <div className={`px-1.5 text-[9px] font-bold ${cancelled ? "text-rose-600" : "text-slate-400"}`}>{r.sourceStatus}{r.sourceType === "order" ? " · order" : ""}</div>}
                  </td>
                  <td className="p-1">{textCell(r, "item", "w-80")}</td>
                  <td className="p-1">{numCell(r, "orderQty", "w-20")}</td>
                  <td className="p-1">{numCell(r, "landingPrice", "w-24")}</td>
                  <td className={ro}>{fmt(c.totalLanding)}</td>
                  <td className={`${ro} font-bold ${c.short > 0 ? "text-amber-700" : ""}`}>{c.short}</td>
                  <td className="p-1">{numCell(r, "qtyDelivered", "w-20")}</td>
                  <td className="p-1">{numCell(r, "orderAmount", "w-24")}</td>
                  <td className={ro}>{fmt(c.perUnit)}</td>
                  <td className={ro}>{fmt(c.sortAmt)}</td>
                  <td className={ro}>{fmt(c.delAmt)}</td>
                  <td className={ro}>{fmt(c.sortWT)}</td>
                  <td className={ro}>{fmt(c.delWT)}</td>
                  <td className={ro}>{fmt(c.afterLess)}</td>
                  <td className="p-1">{textCell(r, "commLabel", "w-28")}</td>
                  <td className="p-1">{numCell(r, "commission", "w-24")}</td>
                  <td className="p-1 text-center">
                    {(() => {
                      const cur = statuses.find((x) => x.guid === r.commStatusGuid);
                      const options = statuses.filter((x) => x.isActive || x.guid === r.commStatusGuid);
                      return (
                        <select
                          value={r.commStatusGuid}
                          onChange={(e) => {
                            const v = e.target.value;
                            setField(r.guid, "commStatusGuid", v);
                            contractGroupsService.updateRow(id, r.guid, { commStatusGuid: v }).catch((err) => { Swal.fire("Error", errMsg(err, "Failed to save."), "error"); load(); });
                          }}
                          className={`w-28 text-[11px] font-bold rounded-full border px-2 py-1 outline-none ${cur ? STATUS_COLORS[cur.color] || STATUS_COLORS.slate : "bg-white text-slate-400 border-slate-200"}`}
                        >
                          <option value="">-</option>
                          {options.map((x) => <option key={x.guid} value={x.guid}>{x.label}</option>)}
                        </select>
                      );
                    })()}
                  </td>
                  <td className="p-1">{numCell(r, "gstPct", "w-14")}</td>
                  <td className="p-1.5 whitespace-nowrap">
                    <button onClick={() => refreshRow(r)} className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Refresh from contract"><RefreshCw size={14} /></button>
                    <button onClick={() => removeRow(r)} className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Remove from group"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 text-xs font-black text-slate-700">
                <td className="p-2.5" colSpan={5}>Total (excluding cancelled)</td>
                <td className="p-2.5 text-center">{totals.qty}</td><td></td>
                <td className="p-2.5 text-center">{fmt(totals.totalLanding)}</td>
                <td className="p-2.5 text-center">{totals.short}</td><td className="p-2.5 text-center">{totals.delivered}</td>
                <td className="p-2.5 text-center">{fmt(totals.amount)}</td><td></td>
                <td className="p-2.5 text-center">{fmt(totals.sortAmt)}</td><td className="p-2.5 text-center">{fmt(totals.delAmt)}</td>
                <td className="p-2.5 text-center">{fmt(totals.sortWT)}</td><td className="p-2.5 text-center">{fmt(totals.delWT)}</td>
                <td className="p-2.5 text-center">{fmt(totals.afterLess)}</td><td></td>
                <td className="p-2.5 text-center text-emerald-700">{fmt(totals.commission)}</td><td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
        {rows.length > 0 && (
          <Pagination total={rows.length} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        )}
      </div>
      {showStatusMgr && <CommissionStatusManager statuses={statuses} onClose={() => setShowStatusMgr(false)} onChanged={load} />}
    </div>
  );
}
