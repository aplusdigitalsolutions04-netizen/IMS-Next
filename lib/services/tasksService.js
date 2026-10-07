"use client";

import api from "@/lib/client/apiClient";

export const tasksService = {
  async getTasks(scope = "mine") {
    const res = await api.get(`/tasks?scope=${scope}`);
    return res.data?.data || [];
  },

  async getAssignees() {
    const res = await api.get("/tasks/assignees");
    return res.data?.data || [];
  },

  async getRelatedTypes() {
    const res = await api.get("/tasks/related-types");
    return res.data?.data || [];
  },

  async addRelatedType(name) {
    const res = await api.post("/tasks/related-types", { name });
    return res.data;
  },

  async getStatuses() {
    const res = await api.get("/tasks/statuses");
    return res.data?.data || [];
  },

  async addStatus(name, color) {
    const res = await api.post("/tasks/statuses", { name, color });
    return res.data;
  },

  async updateStatusOption(guid, payload) {
    const res = await api.put(`/tasks/statuses/${guid}`, payload);
    return res.data;
  },

  async deleteStatusOption(guid) {
    const res = await api.delete(`/tasks/statuses/${guid}`);
    return res.data;
  },

  async createTask(payload) {
    const res = await api.post("/tasks", payload);
    return res.data;
  },

  async updateTask(guid, payload) {
    const res = await api.put(`/tasks/${guid}`, payload);
    return res.data;
  },

  async deleteTask(guid) {
    const res = await api.delete(`/tasks/${guid}`);
    return res.data;
  },

  async uploadAttachment(file) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/tasks/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
    return res.data;
  },
};
