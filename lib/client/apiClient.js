"use client";

import axios from "axios";
import { clearSession, getStoredToken } from "./auth";

// Ported from Frontend4/src/services/apiClient.js. IMS-next serves the API
// and the UI from the same origin (no separate backend domain), so this is
// just "/api" — no cross-origin base URL / cold-start retry config needed
// the way the old split Frontend4+Backend4 deployment required.
export const API_URL = "/api";

export const toNumber = (val, fallback = 0) => {
  if (val === null || val === undefined || val === "") return fallback;
  const num = Number(val);
  return Number.isNaN(num) ? fallback : num;
};

export const toNullableNumber = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
};

export const toTrimmedString = (val, fallback = "") => {
  if (val === null || val === undefined) return fallback;
  return String(val).trim();
};

export const toNullableString = (val) => {
  const str = toTrimmedString(val, "");
  return str ? str : null;
};

export const collapseDuplicateColumnValue = (val) => {
  if (!Array.isArray(val)) return val;
  const meaningfulValues = val.filter(
    (entry) => entry !== null && entry !== undefined && String(entry).trim() !== ""
  );
  if (meaningfulValues.length > 0) return meaningfulValues[meaningfulValues.length - 1];
  return val.length > 0 ? val[val.length - 1] : null;
};

export const toBoolean = (val) => {
  return (
    val === true || val === 1 || val === "1" || val === "true" ||
    val === "TRUE" || val === "Yes" || val === "YES" || val === "yes"
  );
};

export const normalizeDispatchStatus = (status) => {
  const safeStatus = toTrimmedString(status, "");
  if (!safeStatus) return "Pending";
  return safeStatus;
};

export const normalizeLogisticsStatus = (status) => {
  const safeStatus = toTrimmedString(status, "");
  if (!safeStatus) return null;
  if (safeStatus === "Ready for Dispatch") return "Packing in Process";
  return safeStatus;
};

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 45000,
});

const withAuthHeaders = (config = {}) => {
  const nextConfig = { ...config };
  nextConfig.headers = { ...(config.headers || {}) };
  const token = getStoredToken();
  if (token) {
    nextConfig.headers.Authorization = `Bearer ${token}`;
  } else {
    delete nextConfig.headers.Authorization;
  }
  return nextConfig;
};

api.interceptors.request.use(withAuthHeaders);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const rawMessage = error.response?.data?.message || "";
    const companyDeactivated = error.response?.status === 403 && rawMessage.startsWith("COMPANY_DEACTIVATED");

    if (error.response?.status === 401 || companyDeactivated) {
      clearSession();
      // Session is gone (expired/invalid token) or the company it's scoped
      // to was just deactivated — either way, send the user back to login
      // instead of leaving them stuck on a page that just keeps failing
      // every request until they notice and log out manually.
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        if (companyDeactivated) alert("Your active company has been deactivated. Please log in again.");
        window.location.href = "/login";
      }
    }
    console.error("API Error:", error.response?.data || error.message);
    const errorMessage = rawMessage.replace(/^COMPANY_DEACTIVATED:\s*/, "") || error.message || "Something went wrong";
    const enhancedError = new Error(errorMessage);
    enhancedError.response = error.response;
    return Promise.reject(enhancedError);
  }
);

// A number of components call the plain `axios` package directly (their own
// `axios.get/post` with a manually-attached token) instead of going through
// `api`/`legacyApi` above. Since every one of those imports resolves to this
// same axios singleton, registering the same 401 handler here covers them
// too — one place instead of patching every call site individually. Guarded
// so lib/client/http.js's identical registration doesn't double it up,
// regardless of which of the two modules happens to load first.
const globalForAxiosGuard = globalThis;
if (!globalForAxiosGuard.__imsGlobalAxios401Registered) {
  globalForAxiosGuard.__imsGlobalAxios401Registered = true;
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        clearSession();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
      return Promise.reject(error);
    }
  );
}

export default api;
