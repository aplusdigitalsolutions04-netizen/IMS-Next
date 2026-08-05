"use client";

import api, { toTrimmedString } from "@/lib/client/apiClient";

export const authService = {
  getProfile: async () => {
    const res = await api.get("/auth/profile");
    return res.data;
  },

  updateProfile: async (data) => {
    const payload = {
      fullName: toTrimmedString(data.fullName),
      email: toTrimmedString(data.email),
      phone: toTrimmedString(data.phone),
    };
    if (data.notificationsEnabled !== undefined) payload.notificationsEnabled = !!data.notificationsEnabled;
    const res = await api.put("/auth/profile", payload);
    return res.data;
  },

  uploadProfilePhoto: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/auth/profile/photo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  removeProfilePhoto: async () => {
    const res = await api.delete("/auth/profile/photo");
    return res.data;
  },

  changePassword: async (data) => {
    const payload = { oldPassword: data.oldPassword, newPassword: data.newPassword };
    const res = await api.put("/auth/change-password", payload);
    return res.data;
  },

  getBootstrapStatus: async () => {
    const res = await api.get("/auth/bootstrap-status");
    return res.data;
  },

  login: async (credentials) => {
    const res = await api.post("/auth/login", credentials);
    return res.data;
  },

  signup: async (credentials) => {
    const res = await api.post("/auth/signup", credentials);
    return res.data;
  },

  getCurrentUser: async () => {
    const res = await api.get("/auth/me");
    return res.data;
  },

  logout: async () => {
    const res = await api.post("/auth/logout");
    return res.data;
  },

  // The Users management page has no pager UI, so this asks for a high
  // limit explicitly — /api/users itself now paginates (page/limit query
  // params, {data, total, page, limit} response) rather than returning
  // every row unbounded by default.
  getUsers: async () => {
    const res = await api.get("/users", { params: { limit: 2000 } });
    return res.data?.data || [];
  },

  getRoles: async () => {
    const res = await api.get("/roles");
    return res.data;
  },

  createRole: async ({ name }) => {
    const res = await api.post("/roles", { name: toTrimmedString(name) });
    return res.data;
  },

  updateRole: async (id, { name, permissions, editPermissions }) => {
    const payload = { name: toTrimmedString(name) };
    if (Array.isArray(permissions)) payload.permissions = permissions;
    if (Array.isArray(editPermissions)) payload.editPermissions = editPermissions;
    const res = await api.put(`/roles/${id}`, payload);
    return res.data;
  },

  deleteRole: async (id) => {
    const res = await api.delete(`/roles/${id}`);
    return res.data;
  },

  createUser: async (data) => {
    const payload = {
      username: toTrimmedString(data.username),
      password: toTrimmedString(data.password),
      roleId: data.roleId,
      fullName: toTrimmedString(data.fullName),
      email: toTrimmedString(data.email),
      phone: toTrimmedString(data.phone),
      companyIds: Array.isArray(data.companyIds) ? data.companyIds : [],
      allCompaniesAccess: !!data.allCompaniesAccess,
    };
    const res = await api.post("/users", payload);
    return res.data;
  },

  updateUser: async (id, data) => {
    const payload = {
      username: toTrimmedString(data.username),
      roleId: data.roleId,
      fullName: toTrimmedString(data.fullName),
      email: toTrimmedString(data.email),
      phone: toTrimmedString(data.phone),
      companyIds: Array.isArray(data.companyIds) ? data.companyIds : [],
      allCompaniesAccess: !!data.allCompaniesAccess,
    };
    if (data.password && data.password.trim() !== "") {
      payload.password = data.password.trim();
    }
    const res = await api.put(`/users/${id}`, payload);
    return res.data;
  },

  deleteUser: async (id) => {
    const res = await api.delete(`/users/${id}`);
    return res.data;
  },

  getActivityLogs: async (page = 1, limit = 10) => {
    const res = await api.get("/admin/activity-logs", { params: { page, limit } });
    return res.data;
  },
};
