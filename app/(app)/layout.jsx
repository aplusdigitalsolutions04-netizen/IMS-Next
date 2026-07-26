"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LayoutDashboard, User, Loader2, Clock, Search, X } from "lucide-react";
import { getStoredUser, clearSession } from "@/lib/client/auth";
import { AppDataProvider, useAppData } from "@/lib/client/AppDataContext";
import Sidebar from "@/components/common/Sidebar";
import GlobalSearchModal from "@/components/common/GlobalSearchModal";
import { CompanyProvider, useCompany } from "@/lib/client/CompanyContext";
import { ThemeToggle } from "@/components/common/ThemeToggle";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const UPLOADS_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");
const getPhotoUrl = (filename) => (filename ? `${UPLOADS_BASE_URL}/uploads/${encodeURIComponent(filename)}` : null);

// Minimal authenticated shell, ported from Frontend4/src/components/AdminLayout.jsx's
// auth-guard + top-level chrome. The full sidebar (35 nav items across
// Masters/Inventory/Order Processing/Returns groups) is being ported
// incrementally as each corresponding page lands — see [[ims-next-migration]].
function AppLayoutInner({ children, currentUser, handleLogout, router, pathname, isAdmin }) {
  const { loadCoreData, globalSearch, setGlobalSearch } = useAppData();
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
    <div className="flex h-screen bg-slate-50">
      <div className="hidden md:flex shrink-0">
        <Sidebar currentUser={currentUser} isAdmin={isAdmin} />
      </div>

      <main className="flex-1 flex flex-col min-h-0">
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
            <CompanySwitcher />
          {now && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 px-3 py-1.5 rounded-full shadow-sm">
              <Clock size={13} className="text-indigo-500" />
              {now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              <span className="text-indigo-300">·</span>
              {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
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
        <div className="flex-1 overflow-auto min-h-0">
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

  useEffect(() => {
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

  if (!checked || !currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  const isAdmin = currentUser.role === "Admin";

  return (
    <AppDataProvider>
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

function CompanySwitcher() {
  const { activeCompany, availableCompanies, switchCompany } = useCompany();
  if (!availableCompanies || availableCompanies.length <= 1) return null;

  return (
    <select
      value={activeCompany?.guid || ""}
      onChange={(e) => switchCompany(e.target.value)}
      className="text-sm font-semibold bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      {availableCompanies.map((c) => (
        <option key={c.guid} value={c.guid}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
