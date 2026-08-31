"use client";

import api from "@/lib/client/apiClient";

export const dashboardService = {
  getStockSummary: async ({ fyStart, fyEnd } = {}) => {
    try {
      const params = new URLSearchParams({ _t: new Date().getTime() });
      if (fyStart) params.set("fyStart", fyStart);
      if (fyEnd) params.set("fyEnd", fyEnd);
      const res = await api.get(`/dashboard/stock-summary?${params.toString()}`);
      return res.data;
    } catch (error) {
      console.warn("Failed to fetch stock summary:", error.message);
      return null;
    }
  },

  getDashboardStats: async () => {
    try {
      const res = await api.get(`/dashboard/stats?_t=${new Date().getTime()}`);
      return res.data;
    } catch (error) {
      console.warn("Failed to fetch dashboard stats:", error.message);
      return null;
    }
  },
};
