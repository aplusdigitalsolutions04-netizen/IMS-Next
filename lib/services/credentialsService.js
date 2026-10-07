"use client";

import api from "@/lib/client/apiClient";

export const credentialsService = {
  async list(scope = "company") {
    const res = await api.get(scope === "all" ? "/credentials?scope=all" : "/credentials");
    return res.data;
  },
  async create(payload) {
    const res = await api.post("/credentials", payload);
    return res.data;
  },
  async update(guid, payload) {
    const res = await api.put(`/credentials/${guid}`, payload);
    return res.data;
  },
  async remove(guid) {
    const res = await api.delete(`/credentials/${guid}`);
    return res.data;
  },
  // target: "password" | "field:<id>" | "history:<guid>", purpose: "view" | "copy"
  async reveal(guid, target = "password", purpose = "view") {
    const res = await api.post(`/credentials/${guid}/reveal`, { target, purpose });
    return res.data?.value ?? "";
  },
  async history(guid) {
    const res = await api.get(`/credentials/${guid}/history`);
    return res.data?.data || [];
  },
  async restore(guid, historyGuid) {
    const res = await api.post(`/credentials/${guid}/history`, { historyGuid });
    return res.data;
  },
  async categories() {
    const res = await api.get("/credentials/categories");
    return res.data?.data || [];
  },
  async renameCategory(name, newName) {
    const res = await api.put("/credentials/categories", { name, newName });
    return res.data;
  },
  async deleteCategory(name) {
    const res = await api.delete("/credentials/categories", { data: { name } });
    return res.data;
  },
  async addCategory(name) {
    const res = await api.post("/credentials/categories", { name });
    return res.data;
  },
};
