"use client";
import React, { useEffect, useMemo, useState } from "react";
import Swal from 'sweetalert2';
import { useRouter } from "next/navigation";
import {
  Shield, Users as UsersIcon, UserPlus, Edit3, Trash2, Loader2,
  Mail, Phone, Check, Eye, Search, Settings2, Key,
  CheckCircle2, X, ShieldCheck, Building2, Globe,
} from "lucide-react";
import { printerService } from "@/lib/services/api";
import {
  PERMISSIONS_LIST, PERMISSION_GROUPS, EDIT_PERMISSIONS,
  GROUP_COLORS, roleConfigFor,
} from "./constants";
import { RoleBadge, Avatar } from "./parts";

export default function Users({ currentUser }) {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [viewingUser, setViewingUser] = useState(null);
  const [companies, setCompanies] = useState([]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await printerService.getUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      Swal.fire({ title: "Error", text: err.message || "Failed to load users.", icon: "error", confirmButtonColor: "#6366F1", customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-semibold' } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    printerService.getCompanies().then((data) => { if (Array.isArray(data)) setCompanies(data); });
  }, []);

  const companyNameByGuid = useMemo(() => {
    const map = {};
    companies.forEach((c) => { map[c.guid] = c.name; });
    return map;
  }, [companies]);

  // Role stats are built from whatever role names actually appear on users —
  // no fixed list, since roles are entirely admin-defined.
  const stats = useMemo(() => {
    const counts = {};
    users.forEach((u) => { counts[u.role] = (counts[u.role] || 0) + 1; });
    return Object.keys(counts)
      .sort((a, b) => (a === "Admin" ? -1 : b === "Admin" ? 1 : a.localeCompare(b)))
      .map((role) => ({ value: role, label: role, count: counts[role] }));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(u => {
      const matchRole = roleFilter === "All" || u.role === roleFilter;
      const matchSearch = !q || u.username?.toLowerCase().includes(q) || u.fullName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
      return matchRole && matchSearch;
    });
  }, [users, search, roleFilter]);

  const handleDelete = async (user) => {
    const result = await Swal.fire({
      title: "Delete Account?",
      text: `"${user.username}" will be permanently removed.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EF4444",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-semibold', cancelButton: 'rounded-xl font-semibold' }
    });
    if (!result.isConfirmed) return;
    setSubmitting(true);
    try {
      await printerService.deleteUser(user.id);
      await loadUsers();
      Swal.fire({ title: "Deleted!", text: `"${user.username}" has been removed.`, icon: "success", confirmButtonColor: "#6366F1", customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-semibold' } });
    } catch (err) {
      Swal.fire({ title: "Error", text: err.message || "Unable to delete user.", icon: "error", confirmButtonColor: "#6366F1", customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-semibold' } });
    } finally {
      setSubmitting(false);
    }
  };

  const editPermCount = (user) => EDIT_PERMISSIONS.filter(ep => user[ep.key]).length;

  return (
    <div className="w-full space-y-6">

      {/* ── Page Header ── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center border border-white/15">
                <UsersIcon size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">Team Management</h1>
                <p className="text-slate-400 text-sm font-medium mt-0.5">
                  {users.length} member{users.length !== 1 ? "s" : ""} · Roles, permissions & write access
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push("/users/new")}
            className="flex items-center gap-2.5 px-5 py-3 bg-white text-slate-900 rounded-2xl font-bold text-sm shadow-lg hover:bg-indigo-50 transition-all hover:-translate-y-0.5 active:translate-y-0 shrink-0"
          >
            <UserPlus size={17} className="text-indigo-600" />
            Add Team Member
          </button>
        </div>
      </div>

      {/* ── Role Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((item) => {
          const cfg = roleConfigFor(item.value);
          const active = roleFilter === item.value;
          return (
            <button
              key={item.value}
              onClick={() => setRoleFilter(prev => prev === item.value ? "All" : item.value)}
              className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                active ? `${cfg.bg} ${cfg.border} shadow-md ring-2 ring-offset-1` : "bg-white border-slate-200/60 shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black border-2 ${active ? `${cfg.bg} ${cfg.text} ${cfg.border}` : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                  {item.value.charAt(0)}
                </span>
                {active && <Check size={14} className={cfg.text} strokeWidth={3} />}
              </div>
              <p className={`text-2xl font-black ${active ? cfg.text : "text-slate-800"}`}>{item.count}</p>
              <p className={`text-xs font-semibold mt-0.5 ${active ? cfg.text : "text-slate-400"}`}>{item.label}</p>
            </button>
          );
        })}
      </div>

      {/* ── Directory ── */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, username, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all font-medium"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500 font-medium shrink-0">
            <UsersIcon size={15} />
            <span>{filteredUsers.length} of {users.length} members</span>
          </div>
        </div>

        {/* User Grid */}
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 size={32} className="animate-spin text-indigo-500" />
            <p className="font-semibold">Loading directory…</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <UsersIcon size={32} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700">
              {search || roleFilter !== "All" ? "No users match your filter" : "No users yet"}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {search || roleFilter !== "All" ? "Try clearing the search or filter." : "Click 'Add Team Member' to get started."}
            </p>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredUsers.map((user) => {
              const isSelf = String(user.id) === String(currentUser?.id);
              const modCount = user.role === 'Admin' ? PERMISSIONS_LIST.length : (user.permissions?.length || 0);
              const editCount = user.role === 'Admin' ? EDIT_PERMISSIONS.length : editPermCount(user);
              const cfg = roleConfigFor(user.role);

              return (
                <div
                  key={user.id}
                  className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden group flex flex-col"
                >
                  {/* Role color bar */}
                  <div className={`h-1 ${cfg.dot}`} />

                  <div className="p-5 flex flex-col flex-1">

                    {/* Top row: You badge + actions */}
                    <div className="flex items-center justify-between mb-4 min-h-[24px]">
                      {isSelf ? (
                        <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">You</span>
                      ) : <span />}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => router.push(`/users/edit?id=${user.id}`)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Edit user"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          disabled={isSelf || submitting || user.role === "Admin"}
                          onClick={() => handleDelete(user)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          title={user.role === "Admin" ? "Admin accounts cannot be deleted" : "Delete user"}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Avatar — centered */}
                    <div className="flex justify-center mb-3">
                      <Avatar name={user.fullName || user.username} role={user.role} size="lg" />
                    </div>

                    {/* Identity */}
                    <div className="text-center mb-3">
                      <h3 className="font-extrabold text-slate-900 text-sm leading-tight">
                        {user.fullName || user.username}
                      </h3>
                      {user.fullName && (
                        <p className="text-xs text-slate-400 font-medium mt-0.5">@{user.username}</p>
                      )}
                      <div className="flex justify-center mt-2">
                        <RoleBadge
                          role={user.role}
                          label={user.role === "User" && !user.roleId ? "Pending Approval" : user.roleLabel}
                        />
                      </div>
                    </div>

                    {/* Contact */}
                    {(user.email || user.phone) && (
                      <div className="space-y-1.5 mb-3 px-1">
                        {user.email && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
                            <Mail size={11} className="shrink-0 text-slate-400" />
                            <span className="truncate">{user.email}</span>
                          </div>
                        )}
                        {user.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Phone size={11} className="shrink-0 text-slate-400" />
                            <span>{user.phone}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Company access */}
                    <div className="flex justify-center mb-3">
                      {user.allCompaniesAccess ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                          <Globe size={11} /> All Companies
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 text-[11px] font-semibold border border-slate-200 max-w-full"
                          title={(user.companyIds || []).map((id) => companyNameByGuid[id] || id).join(", ")}
                        >
                          <Building2 size={11} className="shrink-0" />
                          <span className="truncate">
                            {(user.companyIds || []).length === 0
                              ? "No company access"
                              : (user.companyIds || []).map((id) => companyNameByGuid[id] || "…").join(", ")}
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="flex-1" />

                    {/* Permission footer */}
                    <div className="pt-3 mt-3 border-t border-slate-100">
                      {user.role === 'Admin' ? (
                        <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                          <Shield size={12} /> Full Access
                        </div>
                      ) : (
                        <button
                          onClick={() => setViewingUser(user)}
                          className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200 transition-all"
                        >
                          <Eye size={12} />
                          <span>{modCount} modules</span>
                          {editCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black">{editCount} edits</span>
                          )}
                        </button>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* ── Permission View Modal ── */}
      {viewingUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]">

            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/60 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar name={viewingUser.fullName || viewingUser.username} role={viewingUser.role} size="lg" />
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900">{viewingUser.username}</h3>
                    {viewingUser.fullName && <p className="text-sm text-slate-500">{viewingUser.fullName}</p>}
                    <div className="mt-1"><RoleBadge role={viewingUser.role} size="default" /></div>
                  </div>
                </div>
                <button onClick={() => setViewingUser(null)} className="p-2 rounded-xl hover:bg-slate-200 text-slate-500 transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 shrink-0">
              <div className="px-6 py-3 text-center">
                <p className="text-2xl font-black text-indigo-600">{viewingUser.permissions?.length || 0}</p>
                <p className="text-xs font-semibold text-slate-400">Module Access</p>
              </div>
              <div className="px-6 py-3 text-center">
                <p className="text-2xl font-black text-amber-600">{editPermCount(viewingUser)}</p>
                <p className="text-xs font-semibold text-slate-400">Write Permissions</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {(viewingUser.permissions?.length || 0) > 0 && (
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Key size={12} /> Feature Access
                  </h4>
                  <div className="space-y-4">
                    {PERMISSION_GROUPS.map(group => {
                      const gc = GROUP_COLORS[group.color];
                      const assigned = group.permissions.filter(id => viewingUser.permissions?.includes(id));
                      if (!assigned.length) return null;
                      return (
                        <div key={group.name}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <group.icon size={12} className={gc.icon} />
                            <span className={`text-[11px] font-bold uppercase tracking-wider ${gc.text}`}>{group.name}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {assigned.map(pId => {
                              const p = PERMISSIONS_LIST.find(perm => perm.id === pId);
                              return (
                                <span key={pId} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${gc.bg} ${gc.text} ${gc.border}`}>
                                  <CheckCircle2 size={11} /> {p?.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {editPermCount(viewingUser) > 0 && (
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Settings2 size={12} /> Write Permissions
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {EDIT_PERMISSIONS.filter(ep => viewingUser[ep.key]).map(ep => (
                      <span key={ep.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-200">
                        <ep.icon size={11} /> {ep.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(viewingUser.permissions?.length || 0) === 0 && editPermCount(viewingUser) === 0 && (
                <div className="py-12 text-center">
                  <Shield size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-500">No permissions assigned.</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
              <button
                onClick={() => { const u = viewingUser; setViewingUser(null); router.push(`/users/edit?id=${u.id}`); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-all"
              >
                <Edit3 size={14} /> Edit Permissions
              </button>
              <button
                onClick={() => setViewingUser(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

