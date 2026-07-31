"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import Swal from "sweetalert2";
import { useAppData } from "./AppDataContext";
import { setSession } from "./auth";
import api from "./apiClient";

const CompanyContext = createContext(null);

export function CompanyProvider({ children }) {
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
        if (active) setActiveCompany(active);
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

      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: newActive ? `Switched to ${newActive.name}` : "Company switched",
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error("Error switching company:", err);
      alert(err.response?.data?.message || err.message);
    } finally {
      setIsSwitchingCompany(false);
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
