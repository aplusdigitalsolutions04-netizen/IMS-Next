"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Shield, UserPlus, Save, Loader2,
  User, Mail, Phone, Lock, XCircle, Building2, CheckCircle, Briefcase,
} from "lucide-react";
import { printerService } from "@/lib/services/api";
import { INITIAL_FORM, roleConfigFor } from "./constants";
import { ADMIN_ROLE_ID } from "@/lib/client/rbac";

export default function UserFormPage({ currentUser, onCurrentUserUpdate, editUser }) {
  const router = useRouter();
  const navigate = (path) => router.push(path);

  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    printerService.getRoles()
      .then((data) => setRoles(Array.isArray(data) ? data : []))
      .catch(() => setRoles([]))
      .finally(() => setRolesLoading(false));
  }, []);

  const [form, setForm] = useState(editUser ? {
    username: editUser.username || "",
    password: "",
    roleId: editUser.role === "Admin" ? ADMIN_ROLE_ID : (editUser.roleId || ""),
    fullName: editUser.fullName || "",
    email: editUser.email || "",
    phone: editUser.phone || "",
    companyIds: Array.isArray(editUser.companyIds) ? editUser.companyIds : [],
    allCompaniesAccess: !!editUser.allCompaniesAccess,
  } : { ...INITIAL_FORM, companyIds: [], allCompaniesAccess: false });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  useEffect(() => {
    printerService.getCompanies()
      .then((data) => { if (Array.isArray(data)) setCompanies(data); })
      .finally(() => setCompaniesLoading(false));
  }, []);

  const toggleCompany = (guid) => {
    setForm((prev) => ({
      ...prev,
      companyIds: prev.companyIds.includes(guid)
        ? prev.companyIds.filter((c) => c !== guid)
        : [...prev.companyIds, guid],
    }));
  };

  const handleSave = async () => {
    if (!form.roleId) {
      setError("Choose a role for this member.");
      return;
    }
    if (!editUser && !form.allCompaniesAccess && form.companyIds.length === 0) {
      setError("Assign at least one company to this user, or they won't be able to log in.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (editUser) {
        const result = await printerService.updateUser(editUser.id, form);
        const savedUser = result?.user;
        if (savedUser && currentUser && String(savedUser.id) === String(currentUser.id)) {
          onCurrentUserUpdate?.(savedUser);
        }
      } else {
        await printerService.createUser(form);
      }
      navigate("/users");
    } catch (err) {
      setError(err.message || "Unable to save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate("/users")}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Team
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center">
            {editUser ? <Save size={13} className="text-indigo-700" /> : <UserPlus size={13} className="text-indigo-700" />}
          </div>
          <h1 className="text-sm font-extrabold text-slate-900">
            {editUser ? `Edit Account — @${editUser.username}` : "Add New Team Member"}
          </h1>
        </div>
      </div>

      {/* ── Form content ── */}
      <div className="flex-1 py-6 px-6 overflow-auto">
        <div className="w-full space-y-5">

          {error && (
            <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm font-medium">
              <XCircle size={18} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Role selector row */}
            <div className="px-8 pt-6 pb-5 border-b border-slate-100">
              <div className="mb-3">
                <h2 className="text-base font-black text-slate-900">Role</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  What this member can see and do comes entirely from the role you pick here — manage what each role can do from the Manage Roles page.
                </p>
              </div>
              {rolesLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 size={14} className="animate-spin" /> Loading roles...
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, roleId: ADMIN_ROLE_ID }))}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      form.roleId === ADMIN_ROLE_ID
                        ? "bg-indigo-100 border-indigo-200 text-indigo-700 shadow-sm"
                        : "border-slate-200 hover:border-slate-300 text-slate-500 hover:bg-slate-50 bg-white"
                    }`}
                  >
                    <Shield size={15} />
                    Administrator
                  </button>
                  {roles.map((r) => {
                    const cfg = roleConfigFor(r.name);
                    const active = form.roleId === r.guid;
                    return (
                      <button
                        key={r.guid}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, roleId: r.guid }))}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                          active ? `${cfg.bg} ${cfg.border} ${cfg.text} shadow-sm` : "border-slate-200 hover:border-slate-300 text-slate-500 hover:bg-slate-50 bg-white"
                        }`}
                      >
                        <Briefcase size={15} />
                        {r.name}
                      </button>
                    );
                  })}
                  {roles.length === 0 && (
                    <p className="text-xs text-slate-400 italic">
                      No roles created yet — go to Manage Roles to create one before adding non-Admin members.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Identity fields — 3-col grid */}
            <div className="px-8 py-6">
              <h2 className="text-sm font-black text-slate-700 mb-4 uppercase tracking-wider">Identity & Credentials</h2>
              <div className="grid grid-cols-3 gap-x-6 gap-y-5">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Username *</label>
                  <div className="relative">
                    <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text" required
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      placeholder="e.g. john_doe"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Full Name</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                    Password {editUser && <span className="normal-case font-medium text-slate-400">— blank = keep current</span>}
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required={!editUser}
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Email</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Phone</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      placeholder="+91 98765..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Company Access */}
            <div className="px-8 py-6 border-t border-slate-100">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-1">Company Access</h2>

              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100 mb-4 mt-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">Full access to all companies</p>
                  <p className="text-xs text-slate-500 mt-0.5">Also covers any company created later — no need to re-assign.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, allCompaniesAccess: !prev.allCompaniesAccess }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${form.allCompaniesAccess ? "bg-indigo-600 border-indigo-600" : "bg-slate-200 border-slate-200"}`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${form.allCompaniesAccess ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>

              {form.allCompaniesAccess ? (
                <p className="text-xs text-slate-400 italic">Individual company selection is skipped — this member can already log into every company.</p>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-4">Which company/companies can this member log into? At least one is required.</p>
                  {companiesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Loader2 size={14} className="animate-spin" /> Loading companies...
                    </div>
                  ) : companies.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No companies found — add one in Company Master first.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {companies.map((c) => {
                        const checked = form.companyIds.includes(c.guid);
                        return (
                          <button
                            key={c.guid}
                            type="button"
                            onClick={() => toggleCompany(c.guid)}
                            disabled={!c.isActive}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                              checked
                                ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                                : !c.isActive
                                  ? "border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed"
                                  : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            {checked ? <CheckCircle size={14} /> : <Building2 size={14} />}
                            {c.name}
                            {!c.isActive && <span className="text-[10px] uppercase font-bold text-slate-400">Inactive</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Navigation buttons ── */}
        <div className="w-full flex items-center justify-between gap-4 pt-6 pb-4">
          <button
            type="button"
            onClick={() => navigate("/users")}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-100 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="flex items-center gap-2 px-7 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-70 transition-all shadow-lg shadow-slate-900/20"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : editUser ? <Save size={16} /> : <UserPlus size={16} />}
            {editUser ? "Save Changes" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
