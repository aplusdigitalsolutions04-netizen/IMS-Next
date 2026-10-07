"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, ChevronRight, BellRing } from "lucide-react";
import { contractGroupsService } from "@/lib/services/contractGroupsService";

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// Dashboard card for Contract Groups: totals + the groups that have new
// matching contracts/orders waiting. Read-only — adding happens on the group
// page. Renders nothing until at least one group exists.
export default function ContractGroupsWidget() {
  const router = useRouter();
  const [data, setData] = useState(null);

  useEffect(() => {
    contractGroupsService.summary().then(setData).catch(() => {});
  }, []);

  if (!data || data.totals.groups === 0) return null;
  const { totals, groups } = data;
  const withNew = groups.filter((g) => g.newMatches > 0).slice(0, 5);

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <Layers size={14} className="text-indigo-500" /> Contract Groups
        </h3>
        <button onClick={() => router.push("/contracts/groups")} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-0.5">
          View all <ChevronRight size={12} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <div className="bg-slate-50 rounded-lg px-3 py-2"><div className="text-[10px] font-bold text-slate-400 uppercase">Groups</div><div className="text-base font-black text-slate-800">{totals.groups}</div></div>
        <div className="bg-emerald-50 rounded-lg px-3 py-2"><div className="text-[10px] font-bold text-emerald-600 uppercase">Order value</div><div className="text-base font-black text-emerald-700">{fmtINR(totals.totalOrderValue)}</div></div>
        <div className="bg-amber-50 rounded-lg px-3 py-2"><div className="text-[10px] font-bold text-amber-600 uppercase">Pending dispatch</div><div className="text-base font-black text-amber-700">{totals.pendingDispatch}</div></div>
        <div className={`rounded-lg px-3 py-2 ${totals.newMatches > 0 ? "bg-indigo-50" : "bg-slate-50"}`}>
          <div className={`text-[10px] font-bold uppercase ${totals.newMatches > 0 ? "text-indigo-600" : "text-slate-400"}`}>New matches</div>
          <div className={`text-base font-black ${totals.newMatches > 0 ? "text-indigo-700" : "text-slate-800"}`}>{totals.newMatches}</div>
        </div>
      </div>

      {withNew.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><BellRing size={11} /> Waiting to be added</div>
          {withNew.map((g) => (
            <button
              key={g.guid}
              onClick={() => router.push(`/contracts/groups/${g.guid}`)}
              className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold border bg-indigo-50/60 border-indigo-100 text-slate-700 hover:opacity-80 transition-opacity"
            >
              <span className="truncate">{g.name}</span>
              <span className="shrink-0 text-[10px] font-bold text-indigo-700 bg-white border border-indigo-100 rounded-full px-2 py-0.5">
                {g.newMatches} new{g.newOrders > 0 ? ` (${g.newContracts} contract${g.newContracts !== 1 ? "s" : ""}, ${g.newOrders} order${g.newOrders !== 1 ? "s" : ""})` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
