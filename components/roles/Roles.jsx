"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Briefcase, Plus, Loader2, Shield, Pencil, Trash2, X, Save, Users as UsersIcon, ChevronDown, ChevronRight, KeyRound, Check, CheckSquare, Square } from "lucide-react";
import Swal from "sweetalert2";
import { printerService } from "@/lib/services/api";
import { PERMISSIONS_LIST, PERMISSION_GROUPS, EDIT_PERMISSIONS, GROUP_COLORS } from "@/components/users/constants";
import { RoleBadge, Avatar } from "@/components/users/parts";
import { ADMIN_ROLE_ID } from "@/lib/client/rbac";

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

// Small text toggle shown in every group header — selects everything in
// that group if anything's still unchecked, otherwise clears the whole
// group. Avoids needing two separate buttons per group.
function SelectAllToggle({ allChecked, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider hover:underline shrink-0 ${className}`}
    >
      {allChecked ? <CheckSquare size={11} /> : <Square size={11} />}
      {allChecked ? "Clear All" : "Select All"}
    </button>
  );
}

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [editName, setEditName] = useState("");
  const [updating, setUpdating] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [reassigningUserId, setReassigningUserId] = useState(null);

  // Admin decides exactly what each role can do — a checkbox editor per role,
  // driving both view (`permissions`) and edit (`editPermissions`) access.
  // No role name is predefined: a role's name is just a label the admin
  // picked; its real capabilities are whatever's checked here.
  const [permsRole, setPermsRole] = useState(null);
  const [permsSelected, setPermsSelected] = useState([]);
  const [editPermsSelected, setEditPermsSelected] = useState([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [roleData, userData] = await Promise.all([
        printerService.getRoles(),
        printerService.getUsers(),
      ]);
      setRoles(Array.isArray(roleData) ? roleData : []);
      setUsers(Array.isArray(userData) ? userData : []);
    } catch (error) {
      console.error("Failed to load roles/users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Every user belongs to exactly one bucket: the Admin bucket, or the
  // guid of the role they're assigned (roleId is the source of truth, not
  // the display name — a rename never moves anyone between buckets).
  const usersByBucket = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      const key = u.role === "Admin" ? ADMIN_ROLE_ID : u.roleId;
      if (!map[key]) map[key] = [];
      map[key].push(u);
    });
    return map;
  }, [users]);

  const toggleExpanded = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleCreate = async () => {
    if (!name.trim()) {
      Swal.fire("Name required", "Please enter a role name.", "warning");
      return;
    }
    setSaving(true);
    try {
      await printerService.createRole({ name });
      Swal.fire("Created", "Role created — now set its permissions from the list below.", "success");
      setName("");
      await loadAll();
    } catch (error) {
      console.error("Create role failed:", error);
      Swal.fire("Error", error?.response?.data?.message || "Failed to create role", "error");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (role) => {
    setEditingRole(role);
    setEditName(role.name);
  };

  const handleUpdate = async () => {
    if (!editName.trim()) {
      Swal.fire("Name required", "Please enter a role name.", "warning");
      return;
    }
    setUpdating(true);
    try {
      await printerService.updateRole(editingRole.guid, { name: editName });
      Swal.fire("Updated", "Role updated successfully.", "success");
      setEditingRole(null);
      await loadAll();
    } catch (error) {
      console.error("Update role failed:", error);
      Swal.fire("Error", error?.response?.data?.message || "Failed to update role", "error");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (role) => {
    const memberCount = (usersByBucket[role.guid] || []).length;
    const confirm = await Swal.fire({
      title: `Delete role "${role.name}"?`,
      text: memberCount > 0
        ? `${memberCount} user${memberCount !== 1 ? "s" : ""} still have this role — reassign them first.`
        : "This cannot be undone.",
      icon: "warning",
      showCancelButton: memberCount === 0,
      showConfirmButton: memberCount === 0,
      confirmButtonText: "Delete",
    });
    if (memberCount > 0 || !confirm.isConfirmed) return;
    try {
      await printerService.deleteRole(role.guid);
      await loadAll();
    } catch (error) {
      console.error("Delete role failed:", error);
      Swal.fire("Error", error?.response?.data?.message || "Failed to delete role", "error");
    }
  };

  const openPermsEditor = (role) => {
    setPermsRole(role);
    setPermsSelected(Array.isArray(role.permissions) ? role.permissions : []);
    setEditPermsSelected(Array.isArray(role.editPermissions) ? role.editPermissions : []);
  };
  const closePermsEditor = () => setPermsRole(null);

  const togglePerm = (id) => setPermsSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  const toggleEditPerm = (key) => setEditPermsSelected((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  // Group-level select all/clear — if everything in the group is already
  // checked, clicking clears the group; otherwise it fills in whatever's
  // still missing (never toggles an already-checked item off by accident).
  const toggleGroupPerms = (ids) =>
    setPermsSelected((prev) => {
      const allChecked = ids.every((id) => prev.includes(id));
      return allChecked ? prev.filter((p) => !ids.includes(p)) : [...new Set([...prev, ...ids])];
    });
  const toggleGroupEditPerms = (keys) =>
    setEditPermsSelected((prev) => {
      const allChecked = keys.every((k) => prev.includes(k));
      return allChecked ? prev.filter((p) => !keys.includes(p)) : [...new Set([...prev, ...keys])];
    });

  const handleSavePerms = async () => {
    setSavingPerms(true);
    try {
      await printerService.updateRole(permsRole.guid, {
        name: permsRole.name,
        permissions: permsSelected,
        editPermissions: editPermsSelected,
      });
      Swal.fire("Saved", `${permsRole.name}'s permissions updated.`, "success");
      closePermsEditor();
      await loadAll();
    } catch (error) {
      console.error("Save permissions failed:", error);
      Swal.fire("Error", error?.response?.data?.message || "Failed to save permissions", "error");
    } finally {
      setSavingPerms(false);
    }
  };

  // Admin decides who's in which role, right from this page — moves a user
  // into a different role by its guid (or back to Admin).
  const handleReassign = async (user, roleId) => {
    const currentKey = user.role === "Admin" ? ADMIN_ROLE_ID : user.roleId;
    if (roleId === currentKey) return;

    setReassigningUserId(user.id);
    try {
      await printerService.updateUser(user.id, { ...user, roleId });
      await loadAll();
    } catch (error) {
      console.error("Reassign role failed:", error);
      Swal.fire("Error", error?.response?.data?.message || "Failed to change user's role", "error");
    } finally {
      setReassigningUserId(null);
    }
  };

  const allBuckets = [
    { key: ADMIN_ROLE_ID, label: "Admin", isAdmin: true, role: { guid: ADMIN_ROLE_ID, name: "Admin", permissions: PERMISSIONS_LIST.map((p) => p.id), editPermissions: EDIT_PERMISSIONS.map((e) => e.key) } },
    ...roles.map((r) => ({ key: r.guid, label: r.name, isAdmin: false, role: r })),
  ];

  const reassignOptions = [
    { value: ADMIN_ROLE_ID, label: "Admin" },
    ...roles.map((r) => ({ value: r.guid, label: r.name })),
  ];

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 mb-6">
        <Briefcase className="text-indigo-600" size={28} />
        Manage Roles
      </h2>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8 max-w-2xl">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide mb-4">Create New Role</h3>
        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Role Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Manager"
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <p className="text-xs text-slate-400 mb-4">
          The new role starts with no permissions. After creating it, click &ldquo;Permissions&rdquo; below to decide exactly what it can do.
        </p>
        <button
          onClick={handleCreate}
          disabled={saving}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md transition-all"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          {saving ? "Creating..." : "Create Role"}
        </button>
      </div>

      <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
        <UsersIcon size={16} className="text-indigo-500" /> All Roles & Users
      </h3>
      {loading ? (
        <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-indigo-600" size={20} /></div>
      ) : (
        <div className="space-y-3">
          {allBuckets.map((bucket) => {
            const bucketUsers = usersByBucket[bucket.key] || [];
            const isOpen = !!expanded[bucket.key];
            return (
              <div key={bucket.key} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <button onClick={() => toggleExpanded(bucket.key)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    {isOpen ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                    {bucket.isAdmin ? <Shield size={14} className="text-slate-500 shrink-0" /> : <Briefcase size={14} className="text-indigo-500 shrink-0" />}
                    <span className="font-bold text-slate-700 text-sm">{bucket.label}</span>
                    {!bucket.isAdmin && (
                      <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                        {(bucket.role.permissions || []).length} permissions · {(bucket.role.editPermissions || []).length} edit rights
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-black text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                      {bucketUsers.length} user{bucketUsers.length !== 1 ? "s" : ""}
                    </span>
                    {!bucket.isAdmin && (
                      <>
                        <button onClick={() => openPermsEditor(bucket.role)} className="text-emerald-600 hover:text-emerald-800 p-1" title="Edit permissions">
                          <KeyRound size={15} />
                        </button>
                        <button onClick={() => startEdit(bucket.role)} className="text-indigo-500 hover:text-indigo-700 p-1" title="Rename role">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => handleDelete(bucket.role)} className="text-rose-500 hover:text-rose-700 p-1" title="Delete role">
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="divide-y divide-slate-100">
                    {bucketUsers.length === 0 ? (
                      <p className="p-4 text-sm text-slate-400">No users in this role.</p>
                    ) : (
                      bucketUsers.map((u) => (
                        <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar name={u.fullName || u.username} role={u.role} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">{u.fullName || u.username}</p>
                              <p className="text-xs text-slate-400 truncate">@{u.username}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <RoleBadge role={u.role} />
                            {u.role !== "Admin" && (
                              <select
                                value={u.roleId || ""}
                                onChange={(e) => handleReassign(u, e.target.value)}
                                disabled={reassigningUserId === u.id}
                                className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer disabled:opacity-50"
                                title="Change this user's role"
                              >
                                {reassignOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            )}
                            {reassigningUserId === u.id && <Loader2 size={14} className="animate-spin text-indigo-500" />}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingRole && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Pencil size={18} className="text-indigo-600" /> Rename Role
              </h3>
              <button onClick={() => setEditingRole(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Role Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md transition-all"
              >
                {updating ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {updating ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {permsRole && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <KeyRound size={18} className="text-emerald-600" /> {permsRole.name} — Permissions
              </h3>
              <button onClick={closePermsEditor} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-6 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">View Access</h4>
                  <SelectAllToggle
                    allChecked={PERMISSIONS_LIST.every((p) => permsSelected.includes(p.id))}
                    onClick={() => toggleGroupPerms(PERMISSIONS_LIST.map((p) => p.id))}
                    className="text-slate-500"
                  />
                </div>
                <div className="space-y-3">
                  {PERMISSION_GROUPS.map((group) => {
                    const gc = GROUP_COLORS[group.color];
                    const groupItems = group.permissions.map((id) => PERMISSIONS_LIST.find((p) => p.id === id)).filter(Boolean);
                    const groupIds = groupItems.map((p) => p.id);
                    return (
                      <div key={group.name} className={`rounded-xl border ${gc.border} overflow-hidden`}>
                        <div className={`flex items-center justify-between gap-2 px-3 py-2 ${gc.header}`}>
                          <div className="flex items-center gap-1.5">
                            <group.icon size={12} className={gc.icon} />
                            <span className={`text-[11px] font-bold uppercase tracking-wider ${gc.text}`}>{group.name}</span>
                          </div>
                          <SelectAllToggle
                            allChecked={groupIds.every((id) => permsSelected.includes(id))}
                            onClick={() => toggleGroupPerms(groupIds)}
                            className={gc.text}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5 p-2.5 bg-white">
                          {groupItems.map((p) => {
                            const checked = permsSelected.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => togglePerm(p.id)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  checked
                                    ? gc.checked + " border-transparent shadow-sm"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                }`}
                              >
                                {checked && <Check size={12} strokeWidth={3} />}
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Edit Rights</h4>
                  <SelectAllToggle
                    allChecked={EDIT_PERMISSIONS.every((ep) => editPermsSelected.includes(ep.key))}
                    onClick={() => toggleGroupEditPerms(EDIT_PERMISSIONS.map((ep) => ep.key))}
                    className="text-slate-500"
                  />
                </div>
                <div className="space-y-3">
                  {EDIT_PERMISSION_GROUPS.map((group) => {
                    const gc = GROUP_COLORS[group.color];
                    const groupKeys = group.items.map((ep) => ep.key);
                    return (
                      <div key={group.name} className={`rounded-xl border ${gc.border} overflow-hidden`}>
                        <div className={`flex items-center justify-between gap-2 px-3 py-2 ${gc.header}`}>
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${gc.text}`}>{group.name}</span>
                          <SelectAllToggle
                            allChecked={groupKeys.every((k) => editPermsSelected.includes(k))}
                            onClick={() => toggleGroupEditPerms(groupKeys)}
                            className={gc.text}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5 p-2.5 bg-white">
                          {group.items.map((ep) => {
                            const checked = editPermsSelected.includes(ep.key);
                            return (
                              <button
                                key={ep.key}
                                type="button"
                                onClick={() => toggleEditPerm(ep.key)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  checked
                                    ? "bg-amber-500 text-white border-transparent shadow-sm"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                }`}
                              >
                                {checked && <Check size={12} strokeWidth={3} className="-ml-0.5" />}
                                <ep.icon size={12} />
                                {ep.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={handleSavePerms}
                disabled={savingPerms}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md transition-all"
              >
                {savingPerms ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {savingPerms ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
