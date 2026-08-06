"use client";

import api from "@/lib/client/apiClient";

function downloadBlob(res, filename) {
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export const exportService = {
  searchItems: async (query, type = "all") => {
    const params = new URLSearchParams();
    params.append("q", query);
    params.append("type", type);
    const res = await api.get(`/search?${params.toString()}`);
    return res.data;
  },

  exportData: async (type, format = "csv", filters = {}) => {
    const params = new URLSearchParams();
    params.append("format", format);
    Object.keys(filters).forEach((key) => { if (filters[key]) params.append(key, filters[key]); });
    const res = await api.get(`/export/${type}?${params.toString()}`, { responseType: "blob" });
    downloadBlob(res, `${type}_${Date.now()}.${format}`);
    return true;
  },

  exportInstallations: async (format = "csv", filters = {}) => {
    const params = new URLSearchParams();
    params.append("format", format);
    if (filters.status) params.append("status", filters.status);
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    const res = await api.get(`/export/installations?${params.toString()}`, { responseType: "blob" });
    downloadBlob(res, `installations_${Date.now()}.${format}`);
    return true;
  },

  exportReturns: async (format = "csv", filters = {}) => {
    const params = new URLSearchParams();
    params.append("format", format);
    if (filters.condition) params.append("condition", filters.condition);
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    const res = await api.get(`/export/returns?${params.toString()}`, { responseType: "blob" });
    downloadBlob(res, `returns_${Date.now()}.${format}`);
    return true;
  },

  exportDispatches: async (format = "csv", filters = {}) => {
    const params = new URLSearchParams();
    params.append("format", format);
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    if (filters.status) params.append("status", filters.status);
    const res = await api.get(`/export/dispatches?${params.toString()}`, { responseType: "blob" });
    downloadBlob(res, `dispatches_${Date.now()}.${format}`);
    return true;
  },

  // `columns` (array of column keys) is optional — omitting it exports every
  // available column; passing a subset is the "custom" download.
  exportOrders: async ({ startDate, endDate, columns } = {}) => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (Array.isArray(columns) && columns.length) params.append("columns", columns.join(","));
    const res = await api.get(`/orders/export?${params.toString()}`, { responseType: "blob" });
    downloadBlob(res, `orders_export_${Date.now()}.xlsx`);
    return true;
  },
};
