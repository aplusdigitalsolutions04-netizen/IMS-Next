"use client";
import React, { useState } from "react";
import { SlidersHorizontal, ChevronDown, ChevronUp, RotateCcw, Check, Plus, Ban } from "lucide-react";
import { PERMISSIONS_LIST, PERMISSION_GROUPS, EDIT_PERMISSIONS } from "./constants";

export const EMPTY_OVERRIDES = { extra: [], blocked: [], extraEdit: [], blockedEdit: [] };

// "User based" access on top of the role: the role gives the base; here an
// Admin adds EXTRA permissions or BLOCKS specific ones for this one user.
// Final access = role + extra - blocked.
export default function CustomAccess({ role, overrides, onChange }) {
  const o = { ...EMPTY_OVERRIDES, ...(overrides || {}) };
  const count = o.extra.length + o.extraEdit.length + o.blocked.length + o.blockedEdit.length;
  const [open, setOpen] = useState(count > 0);
  const [tab, setTab] = useState("pages");

  const roleView = new Set(role?.permissions || []);
  const roleEdit = new Set(role?.editPermissions || []);

  const flip = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const toggleView = (id) => {
    if (roleView.has(id)) onChange({ ...o, blocked: flip(o.blocked, id) });
    else onChange({ ...o, extra: flip(o.extra, id) });
  };
  const toggleEdit = (id) => {
    if (roleEdit.has(id)) onChange({ ...o, blockedEdit: flip(o.blockedEdit, id) });
    else onChange({ ...o, extraEdit: flip(o.extraEdit, id) });
  };

  // Turn a whole set of permissions ON (everyone can use them: role ones
  // un-blocked, others added as extra) or OFF (role ones blocked, extras
  // removed) for this user in one click.
  const setMany = (ids, on, kind) => {
    const fromRole = kind === "view" ? roleView : roleEdit;
    let extra = [...(kind === "view" ? o.extra : o.extraEdit)];
    let blocked = [...(kind === "view" ? o.blocked : o.blockedEdit)];
    for (const id of ids) {
      if (fromRole.has(id)) {
        blocked = on ? blocked.filter((x) => x !== id) : blocked.includes(id) ? blocked : [...blocked, id];
      } else {
        extra = on ? (extra.includes(id) ? extra : [...extra, id]) : extra.filter((x) => x !== id);
      }
    }
    onChange(kind === "view" ? { ...o, extra, blocked } : { ...o, extraEdit: extra, blockedEdit: blocked });
  };

  // state of one permission for this user
  const stateOf = (fromRole, extraList, blockedList, id) => {
    if (fromRole && blockedList.includes(id)) return "blocked";
    if (!fromRole && extraList.includes(id)) return "extra";
    return fromRole ? "role" : "off";
  };

  const chip = (id, label, st, onClick) => {
    const styles = {
      role: "bg-slate-100 border-slate-200 text-slate-700",
      extra: "bg-emerald-50 border-emerald-300 text-emerald-700",
      blocked: "bg-rose-50 border-rose-300 text-rose-600 line-through",
      off: "bg-white border-slate-200 text-slate-400 hover:border-slate-300",
    };
    return (
      <button key={id} type="button" onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${styles[st]}`} title={st === "role" ? "From role — click to block for this user" : st === "blocked" ? "Blocked for this user — click to restore" : st === "extra" ? "Extra for this user — click to remove" : "Not in role — click to grant to this user"}>
        {st === "role" && <Check size={11} />}
        {st === "extra" && <Plus size={11} />}
        {st === "blocked" && <Ban size={11} />}
        {label}
      </button>
    );
  };

  const viewGroups = PERMISSION_GROUPS.map((g) => ({
    name: g.name,
    items: g.permissions.map((id) => PERMISSIONS_LIST.find((p) => p.id === id)).filter(Boolean),
  })).filter((g) => g.items.length > 0);

  const editGroups = [...new Set(EDIT_PERMISSIONS.map((e) => e.group))].map((name) => ({
    name,
    items: EDIT_PERMISSIONS.filter((e) => e.group === name),
  }));

  const kind = tab === "pages" ? "view" : "edit";
  const allIds = tab === "pages" ? viewGroups.flatMap((g) => g.items.map((p) => p.id)) : editGroups.flatMap((g) => g.items.map((e) => e.key));
  const bulk = "text-[11px] font-bold hover:underline";

  const groupHeader = (name, ids) => (
    <div className="flex items-center justify-between mb-2">
      <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider">{name}</div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setMany(ids, true, kind)} className={`${bulk} text-emerald-600`}>All on</button>
        <button type="button" onClick={() => setMany(ids, false, kind)} className={`${bulk} text-rose-600`}>All off</button>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-8 py-5 text-left">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center"><SlidersHorizontal size={15} className="text-violet-700" /></div>
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              Custom access (this user only)
              {count > 0 && <span className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">+{o.extra.length + o.extraEdit.length} / −{o.blocked.length + o.blockedEdit.length}</span>}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">The role gives the base access. Here you can add extra access, or block something, for just this user.</p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>

      {open && (
        <div className="px-8 pb-6 border-t border-slate-100 pt-5 space-y-5">
          {!role ? (
            <p className="text-sm text-slate-400 italic">Pick a role above first — custom access is applied on top of it.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                  {[["pages", "Pages (view)"], ["actions", "Actions (edit / delete)"]].map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button type="button" onClick={() => setMany(allIds, true, kind)} className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100">Allow all</button>
                  <button type="button" onClick={() => setMany(allIds, false, kind)} className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100">Block all</button>
                  {count > 0 && (
                    <button type="button" onClick={() => onChange({ ...EMPTY_OVERRIDES })} className="flex items-center gap-1 text-violet-700 hover:underline text-xs font-bold"><RotateCcw size={12} /> Reset to role</button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-300" /> From role</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-400" /> Extra</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-400" /> Blocked</span>
              </div>

              {tab === "pages" ? (
                <div className="space-y-4">
                  {viewGroups.map((g) => (
                    <div key={g.name}>
                      {groupHeader(g.name, g.items.map((p) => p.id))}
                      <div className="flex flex-wrap gap-2">
                        {g.items.map((p) => chip(p.id, p.label, stateOf(roleView.has(p.id), o.extra, o.blocked, p.id), () => toggleView(p.id)))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {editGroups.map((g) => (
                    <div key={g.name}>
                      {groupHeader(g.name, g.items.map((e) => e.key))}
                      <div className="flex flex-wrap gap-2">
                        {g.items.map((e) => chip(e.key, e.label, stateOf(roleEdit.has(e.key), o.extraEdit, o.blockedEdit, e.key), () => toggleEdit(e.key)))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
