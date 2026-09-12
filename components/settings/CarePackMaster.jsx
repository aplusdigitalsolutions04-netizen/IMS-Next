"use client";
import React, { useEffect, useState } from "react";
import { ShieldCheck, Plus, Loader2, Trash2, ToggleLeft, ToggleRight, Pencil, X, Check } from "lucide-react";
import Swal from "sweetalert2";
import { carePackService } from "@/lib/services/carePackService";

export default function CarePackMaster() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      setOptions(await carePackService.getAll());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await carePackService.add(trimmed);
      setNewName("");
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || err.message || "Failed to add Care Pack option", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (option) => {
    setBusyId(option.guid);
    try {
      await carePackService.setActive(option.guid, !option.isActive);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || err.message || "Failed to update Care Pack option", "error");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (option) => {
    setEditingId(option.guid);
    setEditValue(option.name);
  };

  const saveEdit = async (option) => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === option.name) { setEditingId(null); return; }
    setBusyId(option.guid);
    try {
      await carePackService.rename(option.guid, trimmed);
      setEditingId(null);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || err.message || "Failed to rename Care Pack option", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (option) => {
    const confirm = await Swal.fire({
      title: `Delete "${option.name}"?`,
      text: "This can't be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
    });
    if (!confirm.isConfirmed) return;
    setBusyId(option.guid);
    try {
      await carePackService.remove(option.guid);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || err.message || "Failed to delete Care Pack option", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl shadow-md shadow-indigo-100 text-white">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Care Pack</h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            Manage the Care Pack duration options that show up while adding serial numbers during Stock-In — no code change needed to add a new one.
          </p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Add a new Care Pack option</label>
        <div className="flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="e.g. 6 Year"
            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all"
          >
            {adding ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Add
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={28} /></div>
      ) : options.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">No Care Pack options added yet.</div>
      ) : (
        <div className="space-y-2">
          {options.map((o) => (
            <div key={o.guid} className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border ${o.isActive ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
              {editingId === o.guid ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(o)}
                    className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  <button onClick={() => saveEdit(o)} className="text-emerald-600 hover:text-emerald-800 p-1"><Check size={16} /></button>
                  <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} /></button>
                </div>
              ) : (
                <span className="flex-1 text-sm font-bold text-slate-700">{o.name}</span>
              )}

              {!o.isActive && <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded-full">Inactive</span>}

              <div className="flex items-center gap-1 shrink-0">
                {editingId !== o.guid && (
                  <button onClick={() => startEdit(o)} disabled={busyId === o.guid} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Rename">
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleToggleActive(o)}
                  disabled={busyId === o.guid}
                  className={`p-2 rounded-lg transition-colors ${o.isActive ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}
                  title={o.isActive ? "Deactivate" : "Activate"}
                >
                  {o.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                </button>
                <button onClick={() => handleDelete(o)} disabled={busyId === o.guid} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
