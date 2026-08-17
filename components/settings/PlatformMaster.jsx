"use client";
import React, { useEffect, useState } from "react";
import { Globe, Plus, Loader2, Trash2, Lock, ToggleLeft, ToggleRight, Pencil, X, Check, Settings2 } from "lucide-react";
import Swal from "sweetalert2";
import { platformsService } from "@/lib/services/platformsService";
import { getStoredUser } from "@/lib/client/auth";

// These fields aren't rows in selling_platform_fields — they're hardcoded
// straight into components/newDispatch/NewDispatch.jsx's per-platform form
// sections (search "GeM-specific fields", "Other platform fields", the
// isECommerce block) because they existed before the dynamic custom-fields
// system did. Listed here read-only purely so "Manage Fields" doesn't look
// empty/misleading for a platform that in fact already collects a dozen
// fields during dispatch — adding one here does nothing; only the fields
// added through the form below (backed by selling_platform_fields) do.
const BUILT_IN_FIELDS = {
  GeM: [
    "Order Type", "Bid No.", "Order Date", "Last Delivery Date", "Shipping Address",
    "Buy To Address", "GST Number", "Contact No.", "Alt Contact", "Buyer Email",
    "Consignee Name", "Consignee Email", "Payment Authority Email", "Installation Required", "Warranty",
  ],
  Other: [
    "Order Date", "Last Delivery Date", "Shipping Address", "Buy To Address", "GST Number",
    "Contact No.", "Alt Contact", "Consignee Name", "Consignee Email", "Payment Authority Email",
    "Installation Required", "Warranty",
  ],
  Amazon: ["Invoice No.", "Invoice Date", "GST Number", "Invoice Upload", "Order Date", "Last Delivery Date"],
  Flipkart: ["Invoice No.", "Invoice Date", "GST Number", "Invoice Upload", "Order Date", "Last Delivery Date"],
};

const COLOR_THEMES = [
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink",
  "rose", "slate",
];

const COLOR_DOT = {
  red: "bg-red-500", orange: "bg-orange-500", amber: "bg-amber-500", yellow: "bg-yellow-500",
  lime: "bg-lime-500", green: "bg-green-500", emerald: "bg-emerald-500", teal: "bg-teal-500",
  cyan: "bg-cyan-500", sky: "bg-sky-500", blue: "bg-blue-500", indigo: "bg-indigo-500",
  violet: "bg-violet-500", purple: "bg-purple-500", fuchsia: "bg-fuchsia-500", pink: "bg-pink-500",
  rose: "bg-rose-500", slate: "bg-slate-500",
};

function ColorSwatchPicker({ value, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          onClick={() => onPick(theme)}
          title={theme}
          className={`w-6 h-6 rounded-full ${COLOR_DOT[theme]} transition-all ${
            value === theme ? "ring-2 ring-offset-2 ring-slate-500" : "hover:scale-110"
          }`}
        />
      ))}
    </div>
  );
}

export default function PlatformMaster() {
  const currentUser = getStoredUser();
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_THEMES[0]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [colorPickerId, setColorPickerId] = useState(null);
  const [managingFieldsFor, setManagingFieldsFor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setPlatforms(await platformsService.getAllPlatforms());
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to load platforms", "error");
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
      await platformsService.addPlatform(trimmed, newColor);
      setNewName("");
      setNewColor(COLOR_THEMES[0]);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to add platform", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (platform) => {
    setBusyId(platform.guid);
    try {
      await platformsService.setPlatformActive(platform.guid, !platform.isActive);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to update platform", "error");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (platform) => {
    setEditingId(platform.guid);
    setEditValue(platform.name);
  };

  const saveEdit = async (platform) => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === platform.name) { setEditingId(null); return; }
    setBusyId(platform.guid);
    try {
      await platformsService.renamePlatform(platform.guid, trimmed);
      setEditingId(null);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to rename platform", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handlePickColor = async (platform, colorTheme) => {
    if (colorTheme === platform.colorTheme) { setColorPickerId(null); return; }
    setBusyId(platform.guid);
    try {
      await platformsService.setPlatformColor(platform.guid, colorTheme);
      setColorPickerId(null);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to update color", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (platform) => {
    const confirm = await Swal.fire({
      title: `Delete "${platform.name}"?`,
      text: platform.isSystem
        ? "This is a built-in platform — GeM-specific dispatch/warranty logic elsewhere in the app assumes it exists by this exact name. Deleting it won't crash anything, but it will disappear from every platform dropdown going forward. This can't be undone."
        : "This can't be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
    });
    if (!confirm.isConfirmed) return;
    setBusyId(platform.guid);
    try {
      await platformsService.deletePlatform(platform.guid);
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to delete platform", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl shadow-md shadow-indigo-100 text-white">
          <Globe size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Selling Platforms</h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            Manage which marketplaces show up across Order Processing, Dispatch, and Company Master — no code change needed to add a new one.
          </p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Add a new platform</label>
        <div className="flex gap-3 mb-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="e.g. Meesho, JioMart..."
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
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Color</label>
        <ColorSwatchPicker value={newColor} onPick={setNewColor} />
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={28} /></div>
      ) : (
        <div className="space-y-2">
          {platforms.map((p) => (
            <div key={p.guid} className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border ${p.isActive ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
              <button
                type="button"
                onClick={() => setColorPickerId(colorPickerId === p.guid ? null : p.guid)}
                disabled={busyId === p.guid}
                title="Change color"
                className={`w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-transparent hover:ring-slate-300 transition-all ${COLOR_DOT[p.colorTheme] || "bg-slate-400"}`}
              />
              {colorPickerId === p.guid && (
                <div className="absolute z-10 top-full left-4 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
                  <ColorSwatchPicker value={p.colorTheme} onPick={(theme) => handlePickColor(p, theme)} />
                </div>
              )}

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
                <span className="flex-1 text-sm font-bold text-slate-700 flex items-center gap-2">
                  {p.name}
                  {p.isSystem === 1 && <Lock size={11} className="text-slate-300" title="Built-in — name can't be changed" />}
                </span>
              )}

              {!p.isActive && <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded-full">Inactive</span>}

              <div className="flex items-center gap-1 shrink-0">
                {editingId !== p.guid && !p.isSystem && (
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
                {(currentUser?.role?.toLowerCase() === 'admin' || currentUser?.allow_manage_platform_fields) && (
                  <button
                    onClick={() => setManagingFieldsFor(p)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Manage Fields"
                  >
                    <Settings2 size={14} />
                  </button>
                )}
                {(!p.isSystem || currentUser?.role?.toLowerCase() === "admin" || currentUser?.allow_delete_platformMaster) && (
                  <button onClick={() => handleDelete(p)} disabled={busyId === p.guid} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={p.isSystem ? "Delete (built-in)" : "Delete"}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {managingFieldsFor && (
        <ManageFieldsModal platform={managingFieldsFor} onClose={() => setManagingFieldsFor(null)} />
      )}
    </div>
  );
}
function ManageFieldsModal({ platform, onClose }) {
  const [fields, setFields] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [newFieldName, setNewFieldName] = React.useState("");
  const [newFieldType, setNewFieldType] = React.useState("text");
  const [newIsRequired, setNewIsRequired] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);

  const loadFields = async () => {
    setLoading(true);
    try {
      const data = await platformsService.getPlatformFields(platform.guid);
      setFields(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { loadFields(); }, []);

  const handleAddField = async (e) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;
    setBusyId("add");
    try {
      await platformsService.addPlatformField(platform.guid, {
        fieldName: newFieldName.trim(),
        fieldType: newFieldType,
        isRequired: newIsRequired,
        sortOrder: fields.length
      });
      setNewFieldName("");
      setNewIsRequired(false);
      setNewFieldType("text");
      await loadFields();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to add field", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteField = async (fieldGuid) => {
    if (!confirm("Delete this field?")) return;
    setBusyId(fieldGuid);
    try {
      await platformsService.deletePlatformField(platform.guid, fieldGuid);
      await loadFields();
    } catch (err) {
      Swal.fire("Error", "Failed to delete field", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Manage Fields: {platform.name}</h2>
            <p className="text-sm text-slate-500 mt-1">Define custom fields that will appear during New Dispatch.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {BUILT_IN_FIELDS[platform.name] && (
            <div className="mb-8">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Lock size={11} className="text-slate-300" /> Built-in Fields
              </label>
              <p className="text-xs text-slate-400 mb-3">
                Already collected during New Dispatch for {platform.name} — these are part of the app itself, not editable here.
              </p>
              <div className="flex flex-wrap gap-2">
                {BUILT_IN_FIELDS[platform.name].map((label) => (
                  <span key={label} className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Custom Fields</label>
          <form onSubmit={handleAddField} className="flex gap-3 mb-8 items-end">
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Field Name</label>
              <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="e.g. AWB Number" required className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300" />
            </div>
            <div className="w-32">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Type</label>
              <select value={newFieldType} onChange={e => setNewFieldType(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
              </select>
            </div>
            <div className="flex items-center gap-2 mb-3 px-2">
              <input type="checkbox" id="req" checked={newIsRequired} onChange={e => setNewIsRequired(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
              <label htmlFor="req" className="text-sm font-medium text-slate-700">Required</label>
            </div>
            <button type="submit" disabled={busyId === "add" || !newFieldName.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all">
              {busyId === "add" ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Add
            </button>
          </form>

          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={24} /></div>
          ) : fields.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">No custom fields defined for {platform.name}.</div>
          ) : (
            <div className="space-y-2">
              {fields.map(f => (
                <div key={f.guid} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white">
                  <div>
                    <div className="font-bold text-slate-700 flex items-center gap-2">
                      {f.fieldName}
                      {f.isRequired === 1 && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full uppercase tracking-wide">Required</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 uppercase tracking-wide">{f.fieldType} Input</div>
                  </div>
                  <button type="button" onClick={() => handleDeleteField(f.guid)} disabled={busyId === f.guid} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    {busyId === f.guid ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
