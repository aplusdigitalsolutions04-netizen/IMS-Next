"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LayoutDashboard, User, Loader2, Clock, Search, X } from "lucide-react";
import { getStoredUser, clearSession } from "@/lib/client/auth";
import { hasPermission } from "@/lib/client/rbac";
import { AppDataProvider, useAppData } from "@/lib/client/AppDataContext";
import Sidebar from "@/components/common/Sidebar";
import GlobalSearchModal from "@/components/common/GlobalSearchModal";
import { CompanyProvider, useCompany } from "@/lib/client/CompanyContext";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import NotificationPanel from "@/components/common/NotificationPanel";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const UPLOADS_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");
const getPhotoUrl = (filename) => (filename ? `${UPLOADS_BASE_URL}/uploads/${encodeURIComponent(filename)}` : null);

// Minimal authenticated shell, ported from Frontend4/src/components/AdminLayout.jsx's
// auth-guard + top-level chrome. The full sidebar (35 nav items across
// Masters/Inventory/Order Processing/Returns groups) is being ported
// incrementally as each corresponding page lands — see [[ims-next-migration]].
function AppLayoutInner({ children, currentUser, handleLogout, router, pathname, isAdmin }) {
  const canAccess = (permissionId) => hasPermission(currentUser, permissionId);
  const { loadCoreData, globalSearch, setGlobalSearch } = useAppData();
  const { isSwitchingCompany } = useCompany();
  const [now, setNow] = useState(null);

  useEffect(() => {
    loadCoreData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {isSwitchingCompany && (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
          <p className="text-sm font-semibold text-slate-600">Switching company…</p>
        </div>
      )}
      <div className="hidden md:flex shrink-0">
        <Sidebar currentUser={currentUser} isAdmin={isAdmin} hasPermission={canAccess} />
      </div>

      <main className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="hidden md:flex items-center justify-between gap-3 px-6 py-2 bg-white border-b border-slate-100 shrink-0">
          <div className="relative w-72 group">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl blur opacity-20 group-hover:opacity-30 transition-opacity" />
            <div className="relative bg-white rounded-xl shadow-md border border-slate-200/50 overflow-hidden">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                className="w-full pl-9 pr-9 py-2.5 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
                placeholder="Search Serial or Order ID..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <CompanySwitcher isAdmin={isAdmin} />
          {now && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 px-3 py-1.5 rounded-full shadow-sm">
              <Clock size={13} className="text-indigo-500" />
              {now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              <span className="text-indigo-300">·</span>
              {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <NotificationPanel />
          <ThemeToggle />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl">
            {currentUser.profilePhoto ? (
              <img
                src={getPhotoUrl(currentUser.profilePhoto)}
                alt=""
                className="w-7 h-7 rounded-full object-cover border border-indigo-100"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                <User size={14} className="text-indigo-600" />
              </div>
            )}
            <span className="text-sm font-semibold text-slate-700">{currentUser.fullName || currentUser.username || "User"}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isAdmin ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
              {currentUser.role || "User"}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors"
          >
            Log Out
          </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="max-w-full mx-auto p-4 md:p-6 w-full flex flex-col min-h-full">{children}</div>
        </div>
      </main>
      <GlobalSearchModal showFinancials={currentUser.role === "Admin" || !!currentUser.permissions?.includes("billing")} />
    </div>
  );
}

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState(null);
  const [checked, setChecked] = useState(false);

  // useLayoutEffect (not useEffect) so the sessionStorage check — and the
  // redirect it triggers — runs before the browser paints, instead of after.
  // Combined with rendering null (no spinner) below while unauthenticated,
  // an unauthenticated visitor never sees a loading screen: this component
  // never paints anything before the app router hands off to /login.
  useLayoutEffect(() => {
    const userStr = typeof window !== "undefined" ? window.sessionStorage.getItem("pt_user") : null;
    if (!userStr) {
      router.replace("/login");
      return;
    }
    try {
      setCurrentUser(JSON.parse(userStr));
    } catch {
      clearSession();
      router.replace("/login");
      return;
    }
    setChecked(true);
  }, [router]);

  useEffect(() => {
    const onSessionUpdated = (e) => {
      if (e.detail?.user) setCurrentUser(e.detail.user);
    };
    window.addEventListener("pt-session-updated", onSessionUpdated);
    return () => window.removeEventListener("pt-session-updated", onSessionUpdated);
  }, []);

  const handleLogout = () => {
    clearSession();
    router.replace("/login");
  };

  // No session and no logged-in user: render nothing while the redirect
  // (triggered above) hands off to /login — no spinner, no wait.
  if (!checked || !currentUser) {
    return null;
  }

  const isAdmin = currentUser.role === "Admin";

  return (
    <AppDataProvider currentUser={currentUser}>
      <CompanyProvider>
        <AppLayoutInner
          currentUser={currentUser}
          handleLogout={handleLogout}
          router={router}
          pathname={pathname}
          isAdmin={isAdmin}
        >
          {children}
        </AppLayoutInner>
      </CompanyProvider>
    </AppDataProvider>
  );
}

function CompanySwitcher({ isAdmin }) {
  const { activeCompany, availableCompanies, switchCompany, dashboardFilter, setDashboardFilter, isSwitchingCompany } = useCompany();
  if (!availableCompanies || availableCompanies.length <= 1) return null;

  const handleChange = (value) => {
    if (value === "all") {
      setDashboardFilter("all");
      return;
    }
    setDashboardFilter(value);
    if (value !== activeCompany?.guid) switchCompany(value);
  };

  return (
    <div className="relative">
      <select
        value={isAdmin && dashboardFilter === "all" ? "all" : activeCompany?.guid || ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isSwitchingCompany}
        className="text-sm font-semibold bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-wait"
      >
        {isAdmin && <option value="all">All Companies</option>}
        {availableCompanies.map((c) => (
          <option key={c.guid} value={c.guid}>
            {c.name}
          </option>
        ))}
      </select>
      {isSwitchingCompany && (
        <span
          className="absolute -top-1 -right-1 flex h-3 w-3"
          title="Switching company…"
        >
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500" />
        </span>
      )}
    </div>
  );
}
