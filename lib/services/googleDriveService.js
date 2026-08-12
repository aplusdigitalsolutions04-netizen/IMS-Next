"use client";

import api from "@/lib/client/apiClient";

export const googleDriveService = {
  testConnection: async () => {
    const res = await api.get("/admin/google-drive/test");
    return res.data;
  },
};
