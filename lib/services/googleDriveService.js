"use client";

import api from "@/lib/client/apiClient";

export const googleDriveService = {
  testConnection: async () => {
    const res = await api.get("/admin/google-drive/test");
    return res.data;
  },
  // Can take a while for many files — long timeout, and safe to retry if it
  // does time out (already-migrated files are skipped on the next run).
  migrateLocalFiles: async () => {
    const res = await api.post("/admin/google-drive/migrate", {}, { timeout: 300000 });
    return res.data;
  },
};
