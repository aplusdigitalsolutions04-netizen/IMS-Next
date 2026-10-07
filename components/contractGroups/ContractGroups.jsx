"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/lib/client/CompanyContext";
import Swal from "sweetalert2";
import { Layers, Plus, Loader2, Pencil, Check, X, Trash2, Columns3, Sparkles } from "lucide-react";
import { contractGroupsService, MATCH_FIELD_OPTIONS } from "@/lib/services/contractGroupsService";
import Pagination from "./Pagination";
import ExcelTools from "./ExcelTools";

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

function CreateGroupModal({ onClose, onCreated }) {
  const [fields, setFields] = useState(["buyerGstin", "department", "organisation"]);
  const [clusters, setClusters] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [finding, setFinding] = useState(false);
  const [creating, setCreating] = useState(false);

  const toggleField = (k) => {
    setFields((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
    setClusters(null);
    setSelected(new Set());
  };

  const find = async () => {
    setFinding(true);
    try {
      const result = await contractGroupsService.suggest(fields);
      setClusters(result);
      setSelected(new Set());
    } catch (err) {
      Swal.fire("Error", errMsg(err, "Failed to find combinations."), "error");
    } finally {
      setFinding(false);
    }
  };

  const toggleCluster = (i) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const createSelected = async () => {
    setCreating(true);
    let made = 0;
    try {
      for (const i of selected) {
        const cl = clusters[i];
        await contractGroupsService.create({ matchFields: fields, matchValues: cl.matchValues, contractGuids: cl.contracts.map((c) => c.guid) });
        made += 1;
      }
      await Swal.fire("Created", `${made} group${made > 1 ? "s" : ""} created. Give them a name from the list (pencil icon).`, "success");
      onCreated();
    } catch (err) {
      Swal.fire("Error", errMsg(err, "Failed to create group."), "error");
      if (made > 0) onCreated();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Create Groups</h2>
            <p className="text-sm text-slate-500 mt-1">Contracts that share the same value in every chosen field are grouped together.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Match on (combination)</div>
            <div className="flex flex-wrap gap-2">
              {MATCH_FIELD_OPTIONS.map((f) => (
                <label key={f.key} className={`cursor-pointer text-sm font-semibold px-3.5 py-2 rounded-xl border transition-colors ${fields.includes(f.key) ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  <input type="checkbox" className="hidden" checked={fields.includes(f.key)} onChange={() => toggleField(f.key)} /> {f.label}
                </label>
              ))}
            </div>
            <button onClick={find} disabled={finding || fields.length === 0} className="mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2">
              {finding ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />} Find combinations
            </button>
          </div>

          {clusters && (
            clusters.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-8 border border-dashed border-slate-200 rounded-2xl">No combination with 2 or more ungrouped contracts found.</div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{clusters.length} combination{clusters.length > 1 ? "s" : ""} found</div>
                {clusters.map((cl, i) => (
                  <label key={i} className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${selected.has(i) ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <input type="checkbox" className="mt-1 w-4 h-4" checked={selected.has(i)} onChange={() => toggleCluster(i)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800 truncate">{cl.label}</span>
                        <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5 shrink-0">{cl.contracts.length} contracts</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 break-words">
                        {MATCH_FIELD_OPTIONS.filter((f) => cl.sample[f.key]).map((f) => `${f.label}: ${cl.sample[f.key]}`).join("  ·  ")}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={createSelected} disabled={creating || selected.size === 0} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2">
            {creating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Create {selected.size || ""} group{selected.size > 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ContractGroups() {
  const router = useRouter();
  const { availableCompanies } = useCompany();
  const [viewCompany, setViewCompany] = useState(""); // "" = the company you are working in, "all", or a company guid
  const [canViewOthersApi, setCanViewOthersApi] = useState(false);
  // Shown once the server confirms multi-company access, or straight away for anyone with several companies
  // (so a failed/slow first load never hides it).
  const canViewOthers = canViewOthersApi || (availableCompanies || []).length > 1;
  const [groups, setGroups] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingGuid, setEditingGuid] = useState(null);
  const [draft, setDraft] = useState({ name: "", customValues: {} });
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(async () => {
    try {
      const data = await contractGroupsService.list(viewCompany);
      setCanViewOthersApi(!!data.canViewOtherCompanies);
      setGroups(data.groups);
      setColumns(data.columns);
      setError("");
    } catch (err) {
      setError(errMsg(err, "Failed to load groups."));
    } finally {
      setLoading(false);
    }
  }, [viewCompany]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (g) => {
    setEditingGuid(g.guid);
    setDraft({ name: g.name, customValues: { ...g.customValues } });
  };

  const saveEdit = async (g) => {
    const name = draft.name.trim();
    if (!name) return Swal.fire("Name required", "Please give the group a name.", "warning");
    setSaving(true);
    try {
      await contractGroupsService.update(g.guid, { name, customValues: draft.customValues });
      setEditingGuid(null);
      await load();

      // A new/changed name on a group that isn't a Client Master client yet —
      // ask first; the client is only ever created on an explicit "Yes".
      if (!g.clientGuid) {
        const ask = await Swal.fire({
          title: "Add to Client Master?",
          html: `Add <b>${name}</b> as a client in Client Master? Orders that use this client will also show in this group.`,
          icon: "question", showCancelButton: true, confirmButtonText: "Yes, add", cancelButtonText: "No",
        });
        if (ask.isConfirmed) {
          try {
            const res = await contractGroupsService.addClient(g.guid);
            await Swal.fire("Added", `Client added to Client Master.${res.ordersAdded ? ` ${res.ordersAdded} order row(s) of this client were added to the group.` : ""}`, "success");
            await load();
          } catch (err) {
            Swal.fire("Error", errMsg(err, "Failed to add client."), "error");
          }
        }
      }
    } catch (err) {
      Swal.fire("Error", errMsg(err, "Failed to save."), "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async (g) => {
    const ok = await Swal.fire({ title: "Delete group?", text: `"${g.name}" will be removed. Contracts and orders are not affected.`, icon: "warning", showCancelButton: true, confirmButtonText: "Delete" });
    if (!ok.isConfirmed) return;
    try { await contractGroupsService.remove(g.guid); await load(); } catch (err) { Swal.fire("Error", errMsg(err, "Failed to delete."), "error"); }
  };

  const addColumn = async () => {
    const res = await Swal.fire({
      title: "Add column",
      html:
        '<input id="cg-label" class="swal2-input" placeholder="Column name">' +
        '<select id="cg-type" class="swal2-select"><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="dropdown">Dropdown</option></select>' +
        '<input id="cg-options" class="swal2-input" placeholder="Dropdown options, comma separated">',
      showCancelButton: true, confirmButtonText: "Add",
      preConfirm: () => ({
        label: document.getElementById("cg-label").value,
        type: document.getElementById("cg-type").value,
        options: document.getElementById("cg-options").value.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    if (!res.isConfirmed) return;
    try { await contractGroupsService.addColumn(res.value); await load(); } catch (err) { Swal.fire("Error", errMsg(err, "Failed to add column."), "error"); }
  };

  const deleteColumn = async (col) => {
    const ok = await Swal.fire({ title: `Remove "${col.label}" column?`, icon: "warning", showCancelButton: true, confirmButtonText: "Remove" });
    if (!ok.isConfirmed) return;
    try { await contractGroupsService.deleteColumn(col.guid); await load(); } catch (err) { Swal.fire("Error", errMsg(err, "Failed to remove column."), "error"); }
  };

  const maxPage = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.min(page, maxPage);
  const pagedGroups = groups.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const renderCustomInput = (col) => {
    const v = draft.customValues[col.guid] ?? "";
    const set = (val) => setDraft((d) => ({ ...d, customValues: { ...d.customValues, [col.guid]: val } }));
    const cls = "w-full min-w-[110px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-100";
    if (col.type === "dropdown") {
      return (
        <select value={v} onChange={(e) => set(e.target.value)} className={cls}>
          <option value="">—</option>
          {(col.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return <input type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"} value={v} onChange={(e) => set(e.target.value)} className={cls} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl shadow-md shadow-indigo-100 text-white"><Layers size={24} /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Contract Groups</h2>
            <p className="text-slate-500 font-medium text-sm mt-0.5">Group contracts of the same buyer and track margin &amp; commission.</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={addColumn} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2"><Columns3 size={16} /> Add column</button>
          <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md shadow-indigo-100"><Plus size={16} /> Create group</button>
        </div>
      </div>

      {/* Company filter — always on screen. Others' groups can be viewed by anyone with multi-company access. */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Company</span>
        <select
          value={viewCompany}
          disabled={!canViewOthers}
          onChange={(e) => { setViewCompany(e.target.value); setPage(1); setLoading(true); }}
          title={canViewOthers ? "Which company's groups to show" : "You only have access to your own company"}
          className="border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200 min-w-[260px] disabled:opacity-60"
        >
          <option value="">This company (current)</option>
          {canViewOthers && <option value="all">All companies</option>}
          {canViewOthers && (availableCompanies || []).map((c) => <option key={c.guid} value={c.guid}>{c.name}</option>)}
        </select>
        <div className="ml-auto">
          <ExcelTools
            exportPath="/contract-groups/export"
            exportQuery={viewCompany ? `?companyGuid=${encodeURIComponent(viewCompany)}` : ""}
            templatePath="/contract-groups/template"
            importPath="/contract-groups/import"
            onImported={load}
          />
        </div>
        <span className="text-xs text-slate-400 w-full">
          {viewCompany === "all" ? "Showing groups of every company" : viewCompany ? "Showing another company's groups (Create group still uses your current company)" : "Showing the company selected in the top bar"}
        </span>
      </div>

      {error && <div className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
              <th className="p-3 w-12">#</th>
              <th className="p-3 w-20">Edit</th>
              <th className="p-3">Group name</th>
              {canViewOthers && <th className="p-3">Company</th>}
              <th className="p-3 text-center">No. of contracts</th>
              <th className="p-3 text-center">Total order value</th>
              <th className="p-3 text-center">Pending dispatch</th>
              {columns.map((c) => (
                <th key={c.guid} className="p-3">
                  <span className="inline-flex items-center gap-1">{c.label}
                    <button onClick={() => deleteColumn(c)} title="Remove column" className="text-slate-300 hover:text-rose-500"><X size={12} /></button>
                  </span>
                </th>
              ))}
              <th className="p-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7 + columns.length + (canViewOthers ? 1 : 0)} className="p-12 text-center"><Loader2 className="animate-spin text-indigo-600 inline" size={22} /></td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={7 + columns.length + (canViewOthers ? 1 : 0)} className="p-12 text-center text-slate-400 text-sm">No groups yet. Click “Create group” to find contracts of the same buyer.</td></tr>
            ) : pagedGroups.map((g, gi) => {
              const editing = editingGuid === g.guid;
              return (
                <tr
                  key={g.guid}
                  onClick={() => { if (!editing) router.push(`/contracts/groups/${g.guid}`); }}
                  className={`hover:bg-indigo-50/40 ${editing ? "" : "cursor-pointer"}`}
                >
                  <td className="p-3 text-xs font-bold text-slate-400">{(currentPage - 1) * pageSize + gi + 1}</td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <div className="flex gap-1">
                        <button onClick={() => saveEdit(g)} disabled={saving} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Save">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}</button>
                        <button onClick={() => setEditingGuid(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" title="Cancel"><X size={15} /></button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(g)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Edit"><Pencil size={15} /></button>
                    )}
                  </td>
                  <td className="p-3">
                    {editing ? (
                      <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Group name" className="w-full min-w-[200px] bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-100" autoFocus />
                    ) : (
                      <button type="button" className="text-left font-bold text-slate-800 hover:text-indigo-600">
                        {g.name}
                        {g.clientGuid && <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5">Client</span>}
                      </button>
                    )}
                  </td>
                  {canViewOthers && <td className="p-3 text-xs font-semibold text-slate-500 whitespace-nowrap">{g.companyName}</td>}
                  <td className="p-3 text-center font-bold">{g.contractCount}</td>
                  <td className="p-3 text-center font-bold text-emerald-700">{fmtINR(g.totalOrderValue)}</td>
                  <td className="p-3 text-center font-bold text-amber-700">{g.pendingDispatch}</td>
                  {columns.map((c) => (
                    <td key={c.guid} className="p-3 text-xs">{editing ? renderCustomInput(c) : (g.customValues[c.guid] || <span className="text-slate-300">—</span>)}</td>
                  ))}
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end">
                      <button onClick={() => deleteGroup(g)} className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Delete group"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && groups.length > 0 && (
          <Pagination total={groups.length} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        )}
      </div>

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}
