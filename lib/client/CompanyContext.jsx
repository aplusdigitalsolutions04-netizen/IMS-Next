"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useAppData } from "./AppDataContext";
import { setSession } from "./auth";
import api from "./apiClient";
import { useToast } from "./ToastContext";

const CompanyContext = createContext(null);

export function CompanyProvider({ children }) {
  const toast = useToast();
  const [activeCompany, setActiveCompany] = useState(null);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  // Read-only lens the Dashboard uses to view aggregated data across every
  // company ("all") or one specific company, independent of which company the
  // session is actually scoped to for write operations (activeCompany).
  const [dashboardFilter, setDashboardFilter] = useState("all");
  const [isSwitchingCompany, setIsSwitchingCompany] = useState(false);
  const { loadCoreData } = useAppData();

  useEffect(() => {
    // Attempt to load from localStorage on mount
    const userStr = typeof window !== "undefined" ? window.sessionStorage.getItem("pt_user") : null;
    const compsStr = typeof window !== "undefined" ? window.sessionStorage.getItem("pt_companies") : null;
    if (userStr && compsStr) {
      try {
        const user = JSON.parse(userStr);
        const comps = JSON.parse(compsStr);
        setAvailableCompanies(comps);
        const active = comps.find((c) => c.guid === user.companyId);
        // On a fresh page load the session is always scoped to one specific
        // company (never "all") — dashboardFilter must match that, otherwise
        // it stays stuck on its "all" default while every other tab is
        // showing the actual active company's data.
        if (active) {
          setActiveCompany(active);
          setDashboardFilter(active.guid);
        }
      } catch (err) {}
    }
  }, []);

  // Called after availableCompanies is refreshed elsewhere (e.g. Company Master
  // updates a logo) so the sidebar picks it up without a logout/login.
  const syncActiveCompany = (companies) => {
    setActiveCompany((prev) => {
      if (!prev) return prev;
      const updated = companies.find((c) => c.guid === prev.guid);
      return updated || prev;
    });
  };

  const switchCompany = async (companyGuid) => {
    setIsSwitchingCompany(true);
    // Keep the loader up for at least this long — even though the actual
    // switch (re-issue token + reload core data) often finishes in under a
    // second, a near-instant flash reads as broken/unfinished to users, so
    // we deliberately hold the overlay for a visible, predictable window.
    const MIN_LOADER_MS = 7000;
    const minWait = new Promise((resolve) => setTimeout(resolve, MIN_LOADER_MS));
    try {
      const res = await api.post("/auth/switch-company", { companyGuid });
      const data = res.data;

      // Update session with new token and user
      setSession({ user: data.user, token: data.token });
      window.sessionStorage.setItem("pt_companies", JSON.stringify(availableCompanies));

      const newActive = availableCompanies.find(c => c.guid === companyGuid);
      if (newActive) setActiveCompany(newActive);

      // Refresh global app data for the new company scope
      await loadCoreData();
      await minWait;

      // Many pages (vendors, categories, stock in/out, contracts, etc.) fetch
      // their own list data once on mount and never re-fetch — company switch
      // doesn't remount them, so their state stays stuck on the old company
      // until something forces a fresh mount. A full reload is the only
      // change that's guaranteed to reach every one of those pages at once,
      // instead of hunting down and patching every fetch-on-mount effect.
      window.location.reload();
      return true;
    } catch (err) {
      console.error("Error switching company:", err);
      toast.error(err.response?.data?.message || err.message);
      setIsSwitchingCompany(false);
      return false;
    }
  };

  return (
    <CompanyContext.Provider value={{ activeCompany, availableCompanies, switchCompany, setAvailableCompanies, syncActiveCompany, dashboardFilter, setDashboardFilter, isSwitchingCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
}
