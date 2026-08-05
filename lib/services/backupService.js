"use client";

import api from "@/lib/client/apiClient";

export const backupService = {
  // Streams the backup ZIP (database.json + uploads/) straight to a browser
  // download — going through axios (not a plain <a href>) so the
  // Authorization header actually gets attached; a bare link click can't
  // carry a bearer token.
  downloadBackup: async () => {
    const res = await api.get("/admin/backup", { responseType: "blob", timeout: 120000 });
    const disposition = res.headers?.["content-disposition"] || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `ims-backup-${Date.now()}.zip`;

    const url = window.URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // `file` is the raw ZIP File object from an <input type="file"> — sent as
  // the raw request body (not multipart) so the backend can read it straight
  // into a buffer for AdmZip without needing a multipart parser.
  restoreBackup: async (file) => {
    const res = await api.post("/admin/backup/restore", file, {
      headers: { "Content-Type": "application/zip" },
      timeout: 180000,
    });
    return res.data;
  },
};
