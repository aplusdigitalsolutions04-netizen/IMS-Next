"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, Save, Check, CheckSquare, Square, Search, Eye, Pencil } from "lucide-react";
import Swal from "sweetalert2";
import { printerService } from "@/lib/services/api";
import { PERMISSIONS_LIST, PERMISSION_GROUPS, EDIT_PERMISSIONS, GROUP_COLORS } from "@/components/users/constants";

// Edit Rights has no groups of its own (EDIT_PERMISSIONS is a flat list) —
// bucket it the same way View Access is, reusing PERMISSION_GROUPS' names/
// colors where they line up so the two sections read as one system.
const EDIT_GROUP_COLOR_KEY = {
  "Serials & Pricing": "indigo", Inventory: "sky", Orders: "violet", Operations: "rose",
  "Master Data": "violet", "Admin & Analytics": "emerald", Email: "amber",
};
const EDIT_GROUP_ORDER = ["Serials & Pricing", "Inventory", "Orders", "Operations", "Master Data", "Admin & Analytics", "Email"];
const EDIT_PERMISSION_GROUPS = EDIT_GROUP_ORDER
  .map((name) => ({ name, color: EDIT_GROUP_COLOR_KEY[name], items: EDIT_PERMISSIONS.filter((ep) => ep.group === name) }))
  .filter((g) => g.items.length > 0);

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// One permission as a roomy toggle tile (checkbox + label) instead of a tiny chip.
function Tile({ checked, onClick, label, Icon, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-xs font-semibold transition-all ${
        checked ? `${accent} shadow-sm` : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-white/90 border-transparent text-slate-900" : "border-slate-300 bg-white"}`}>
        {checked && <Check size={10} strokeWidth={3.5} />}
      </span>
      {Icon && <Icon size={12} className="shrink-0 opacity-70" />}
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function SelectAllToggle({ allChecked, onClick, className = "" }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider hover:underline shrink-0 ${className}`}>
      {allChecked ? <CheckSquare size={13} /> : <Square size={13} />}
      {allChecked ? "Clear all" : "Select all"}
    </button>
  );
}

// Full-page replacement for the old "<role> — Permissions" popup in Manage
// Roles. Same View Access / Edit Rights pickers and the same save call, now
// split into two tabs with a search box so it isn't one dense wall of chips.
export default function RolePermissions() {
  const router = useRouter();
  const { id } = useParams();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [permsSelected, setPermsSelected] = useState([]);
  const [editPermsSelected, setEditPermsSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("view");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!id) return;
    printerService.getRoles()
      .then((data) => {
        const found = (Array.isArray(data) ? data : []).find((r) => r.guid === id);
        if (!found) { setNotFound(true); return; }
        setRole(found);
        setPermsSelected(Array.isArray(found.permissions) ? found.permissions : []);
        setEditPermsSelected(Array.isArray(found.editPermissions) ? found.editPermissions : []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const dirty = useMemo(
    () => !!role && (!sameSet(permsSelected, role.permissions || []) || !sameSet(editPermsSelected, role.editPermissions || [])),
    [role, permsSelected, editPermsSelected]
  );

  const goBack = async () => {
    if (dirty) {
      const ok = await Swal.fire({ title: "Discard changes?", text: "You have unsaved permission changes.", icon: "warning", showCancelButton: true, confirmButtonText: "Discard", cancelButtonText: "Keep editing" });
      if (!ok.isConfirmed) return;
    }
    router.push("/roles");
  };

  const togglePerm = (pid) => setPermsSelected((prev) => (prev.includes(pid) ? prev.filter((p) => p !== pid) : [...prev, pid]));
  const toggleEditPerm = (key) => setEditPermsSelected((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  const toggleGroupPerms = (ids) =>
    setPermsSelected((prev) => (ids.every((x) => prev.includes(x)) ? prev.filter((p) => !ids.includes(p)) : [...new Set([...prev, ...ids])]));
  const toggleGroupEditPerms = (keys) =>
    setEditPermsSelected((prev) => (keys.every((x) => prev.includes(x)) ? prev.filter((p) => !keys.includes(p)) : [...new Set([...prev, ...keys])]));

  const handleSave = async () => {
    setSaving(true);
    try {
      await printerService.updateRole(role.guid, { name: role.name, permissions: permsSelected, editPermissions: editPermsSelected });
      await Swal.fire({ icon: "success", title: "Saved", text: `${role.name}'s permissions updated.`, timer: 1500, showConfirmButton: false });
      router.push("/roles");
    } catch (error) {
      console.error("Save permissions failed:", error);
      Swal.fire("Error", error?.response?.data?.message || "Failed to save permissions", "error");
    } finally {
      setSaving(false);
    }
  };

  const q = query.trim().toLowerCase();
  const viewGroups = useMemo(
    () => PERMISSION_GROUPS
      .map((g) => ({ ...g, items: g.permissions.map((pid) => PERMISSIONS_LIST.find((p) => p.id === pid)).filter(Boolean) }))
      .map((g) => ({ ...g, visible: q ? g.items.filter((p) => p.label.toLowerCase().includes(q)) : g.items }))
      .filter((g) => g.visible.length > 0),
    [q]
  );
  const editGroups = useMemo(
    () => EDIT_PERMISSION_GROUPS
      .map((g) => ({ ...g, visible: q ? g.items.filter((ep) => ep.label.toLowerCase().includes(q)) : g.items }))
      .filter((g) => g.visible.length > 0),
    [q]
  );

  if (loading) return <div className="p-16 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={26} /></div>;
  if (notFound || !role) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push("/roles")} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to Roles</button>
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500 text-sm">This role was not found (it may have been deleted).</div>
      </div>
    );
  }

  const gridCls = "grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2";

  return (
    <div className="bg-slate-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center gap-4 shrink-0 sticky top-0 z-10">
        <button onClick={goBack} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft size={16} /> Back to Roles
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center"><KeyRound size={13} className="text-emerald-700" /></div>
          <h1 className="text-sm font-extrabold text-slate-900">{role.name} — Permissions</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {dirty && <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">Unsaved changes</span>}
          <button onClick={handleSave} disabled={saving || !dirty} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md transition-all">
            {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            {saving ? "Saving..." : "Save Permissions"}
          </button>
        </div>
      </div>

      <div className="p-6 w-full max-w-[1500px] mx-auto space-y-5">
        {/* Tabs + search */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-1 bg-white border border-slate-200 p-0.5 rounded-lg shadow-sm">
            {[
              { key: "view", label: "View Access", Icon: Eye, count: `${permsSelected.length} / ${PERMISSIONS_LIST.length}` },
              { key: "edit", label: "Edit Rights", Icon: Pencil, count: `${editPermsSelected.length} / ${EDIT_PERMISSIONS.length}` },
            ].map(({ key, label, Icon, count }) => (
              <button key={key} type="button" onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${tab === key ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}>
                <Icon size={13} /> {label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permission..." className="w-56 pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300" />
            </div>
            {tab === "view" ? (
              <SelectAllToggle allChecked={PERMISSIONS_LIST.every((p) => permsSelected.includes(p.id))} onClick={() => toggleGroupPerms(PERMISSIONS_LIST.map((p) => p.id))} className="text-slate-600" />
            ) : (
              <SelectAllToggle allChecked={EDIT_PERMISSIONS.every((ep) => editPermsSelected.includes(ep.key))} onClick={() => toggleGroupEditPerms(EDIT_PERMISSIONS.map((ep) => ep.key))} className="text-slate-600" />
            )}
          </div>
        </div>

        {tab === "view" ? (
          <div className="space-y-4">
            {viewGroups.length === 0 && <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-sm">No permission matches your search.</div>}
            {viewGroups.map((group) => {
              const gc = GROUP_COLORS[group.color];
              const ids = group.items.map((p) => p.id);
              const selectedCount = ids.filter((x) => permsSelected.includes(x)).length;
              return (
                <section key={group.name} className={`bg-white rounded-2xl border ${gc.border} shadow-sm overflow-hidden`}>
                  <div className={`flex items-center justify-between gap-3 px-4 py-2 ${gc.header}`}>
                    <div className="flex items-center gap-2">
                      <group.icon size={14} className={gc.icon} />
                      <h2 className={`text-xs font-black uppercase tracking-wider ${gc.text}`}>{group.name}</h2>
                      <span className={`text-[11px] font-bold ${gc.text} opacity-70`}>{selectedCount} / {ids.length}</span>
                    </div>
                    <SelectAllToggle allChecked={ids.every((x) => permsSelected.includes(x))} onClick={() => toggleGroupPerms(ids)} className={gc.text} />
                  </div>
                  <div className={`${gridCls} p-3`}>
                    {group.visible.map((p) => (
                      <Tile key={p.id} checked={permsSelected.includes(p.id)} onClick={() => togglePerm(p.id)} label={p.label} Icon={p.icon} accent={gc.checked} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {editGroups.length === 0 && <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-sm">No permission matches your search.</div>}
            {editGroups.map((group) => {
              const gc = GROUP_COLORS[group.color];
              const keys = group.items.map((ep) => ep.key);
              const selectedCount = keys.filter((x) => editPermsSelected.includes(x)).length;
              return (
                <section key={group.name} className={`bg-white rounded-2xl border ${gc.border} shadow-sm overflow-hidden`}>
                  <div className={`flex items-center justify-between gap-3 px-4 py-2 ${gc.header}`}>
                    <div className="flex items-center gap-2.5">
                      <h2 className={`text-xs font-black uppercase tracking-wider ${gc.text}`}>{group.name}</h2>
                      <span className={`text-[11px] font-bold ${gc.text} opacity-70`}>{selectedCount} / {keys.length}</span>
                    </div>
                    <SelectAllToggle allChecked={keys.every((x) => editPermsSelected.includes(x))} onClick={() => toggleGroupEditPerms(keys)} className={gc.text} />
                  </div>
                  <div className={`${gridCls} p-3`}>
                    {group.visible.map((ep) => (
                      <Tile key={ep.key} checked={editPermsSelected.includes(ep.key)} onClick={() => toggleEditPerm(ep.key)} label={ep.label} Icon={ep.icon} accent="bg-amber-500 border-transparent text-white" />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
