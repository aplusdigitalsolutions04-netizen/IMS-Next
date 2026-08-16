"use client";
import React, { useEffect, useState } from "react";
import { Truck, Plus, Loader2, Trash2, ToggleLeft, ToggleRight, Pencil, X, Check } from "lucide-react";
import Swal from "sweetalert2";
import { deliveryPartnersService } from "@/lib/services/deliveryPartnersService";

export default function DeliveryPartnerMaster() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setPartners(await deliveryPartnersService.getAll());
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load delivery partners", "error");
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
      await deliveryPartnersService.add(trimmed);
      setNewName("");
      await load();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to add delivery partner", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (partner) => {
    setBusyId(partner.guid);
    try {
      await deliveryPartnersService.setActive(partner.guid, !partner.isActive);
      await load();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to update delivery partner", "error");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (partner) => {
    setEditingId(partner.guid);
    setEditValue(partner.name);
  };

  const saveEdit = async (partner) => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === partner.name) { setEditingId(null); return; }
    setBusyId(partner.guid);
    try {
      await deliveryPartnersService.rename(partner.guid, trimmed);
      setEditingId(null);
      await load();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to rename delivery partner", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (partner) => {
    const confirm = await Swal.fire({
      title: `Delete "${partner.name}"?`,
      text: "This can't be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
    });
    if (!confirm.isConfirmed) return;
    setBusyId(partner.guid);
    try {
      await deliveryPartnersService.remove(partner.guid);
      await load();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to delete delivery partner", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl shadow-md shadow-indigo-100 text-white">
          <Truck size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Delivery Partners</h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            Manage the couriers that show up in the "Courier Partner" dropdown across Dispatch — no code change needed to add a new one.
          </p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Add a new delivery partner</label>
        <div className="flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="e.g. Bluedart, Ecom Express..."
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
      ) : partners.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">No delivery partners added yet.</div>
      ) : (
        <div className="space-y-2">
          {partners.map((p) => (
            <div key={p.guid} className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border ${p.isActive ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
              {editingId === p.guid ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(p)}
                    className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  <button onClick={() => saveEdit(p)} className="text-emerald-600 hover:text-emerald-800 p-1"><Check size={16} /></button>
                  <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} /></button>
                </div>
              ) : (
                <span className="flex-1 text-sm font-bold text-slate-700">{p.name}</span>
              )}

              {!p.isActive && <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded-full">Inactive</span>}

              <div className="flex items-center gap-1 shrink-0">
                {editingId !== p.guid && (
                  <button onClick={() => startEdit(p)} disabled={busyId === p.guid} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Rename">
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleToggleActive(p)}
                  disabled={busyId === p.guid}
                  className={`p-2 rounded-lg transition-colors ${p.isActive ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}
                  title={p.isActive ? "Deactivate" : "Activate"}
                >
                  {p.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                </button>
                <button onClick={() => handleDelete(p)} disabled={busyId === p.guid} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
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
