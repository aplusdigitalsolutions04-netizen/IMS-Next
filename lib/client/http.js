"use client";

import axios from "axios";
import { clearSession, getStoredToken } from "./auth";

// Shared axios instance for the legacy `/Inventory/*` endpoints (no `/api`
// prefix). IMS-next serves these from the same origin, so baseURL is just "".
export const legacyApi = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  timeout: 45000,
});

legacyApi.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const isCompanyDeactivated = (error) =>
  error.response?.status === 403 && String(error.response?.data?.message || "").startsWith("COMPANY_DEACTIVATED");

legacyApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 || isCompanyDeactivated(error)) {
      clearSession();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        if (isCompanyDeactivated(error)) alert("Your active company has been deactivated. Please log in again.");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// Several components call the plain `axios` package directly (their own
// `axios.get/post` with a manually-attached token) instead of going through
// `legacyApi`/`api`. Since every one of those imports resolves to this same
// axios singleton, registering the same 401 handler on it here (guarded so
// apiClient.js's identical registration doesn't double it up) covers them
// too, regardless of which of the two modules happens to load first.
const globalForAxiosGuard = globalThis;
if (!globalForAxiosGuard.__imsGlobalAxios401Registered) {
  globalForAxiosGuard.__imsGlobalAxios401Registered = true;
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401 || isCompanyDeactivated(error)) {
        clearSession();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          if (isCompanyDeactivated(error)) alert("Your active company has been deactivated. Please log in again.");
          window.location.href = "/login";
        }
      }
      return Promise.reject(error);
    }
  );
}
