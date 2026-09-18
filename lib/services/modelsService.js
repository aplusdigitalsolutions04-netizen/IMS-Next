"use client";

import api, { toNumber } from "@/lib/client/apiClient";

// The legacy `models` table has been retired — the Models master UI is gone
// and every product lives in Item Master now. `getModels` still backs the
// unified product pickers (Dispatch, New Order, FBF/FBA), and `updateModel`
// only ever handles Dispatch's inline price edit (both proxy straight to
// app/api/models/route.js and [id]/route.js, which now read/write
// inventoryitemvariant).
export const modelsService = {
  getModels: async (companyGuid) => {
    try {
      const cg = companyGuid ? `&companyGuid=${encodeURIComponent(companyGuid)}` : "";
      const res = await api.get(`/models?_t=${new Date().getTime()}${cg}`);
      return res.data;
    } catch (error) {
      console.warn("Failed to fetch models:", error.message);
      return [];
    }
  },

  // `data.mrp` alone (Dispatch's inline price edit) or the packaging fields
  // alone (Dispatch's "Packaging Cost & Dimensions" editor) — whichever the
  // caller actually set; app/api/models/[id]/route.js only writes what's
  // present (`undefined` is dropped by JSON.stringify before it reaches it).
  updateModel: async (id, data) => {
    const payload = {};
    if (data.mrp !== undefined) payload.mrp = toNumber(data.mrp);
    if (data.packagingCost !== undefined) payload.packagingCost = toNumber(data.packagingCost);
    if (data.packageLength !== undefined) payload.packageLength = data.packageLength;
    if (data.packageWidth !== undefined) payload.packageWidth = data.packageWidth;
    if (data.packageHeight !== undefined) payload.packageHeight = data.packageHeight;
    if (data.packageWeight !== undefined) payload.packageWeight = data.packageWeight;
    const res = await api.put(`/models/${id}`, payload);
    return res.data;
  },

  onUpdateModel: async (id, data) => modelsService.updateModel(id, data),

  exportPackagingExcel: async () => {
    const res = await api.get("/models/export-packaging", { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `packaging_cost_dimensions_${Date.now()}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return true;
  },

  importPackagingExcel: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/models/import-packaging", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
};
