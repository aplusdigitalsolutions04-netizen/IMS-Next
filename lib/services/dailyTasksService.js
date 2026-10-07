"use client";

import api from "@/lib/client/apiClient";

export const dailyTasksService = {
  async list({ from, to, userId } = {}) {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (userId) q.set("userId", userId);
    const res = await api.get(`/daily-tasks?${q.toString()}`);
    return res.data;
  },
  async create(payload) {
    const res = await api.post("/daily-tasks", payload);
    return res.data?.data;
  },
  async update(guid, payload) {
    const res = await api.put(`/daily-tasks/${guid}`, payload);
    return res.data;
  },
  async remove(guid) {
    const res = await api.delete(`/daily-tasks/${guid}`);
    return res.data;
  },
  async addColumn(payload) {
    const res = await api.post("/daily-tasks/columns", payload);
    return res.data;
  },
  async updateColumn(guid, payload) {
    const res = await api.put(`/daily-tasks/columns/${guid}`, payload);
    return res.data;
  },
  async deleteColumn(guid) {
    const res = await api.delete(`/daily-tasks/columns/${guid}`);
    return res.data;
  },
  async uploadScreenshot(guid, blob) {
    const fd = new FormData();
    fd.append("file", blob, "screenshot.png");
    const res = await api.post(`/daily-tasks/${guid}/screenshot`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    return res.data?.data;
  },
};
