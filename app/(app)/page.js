"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  Printer, Package, Truck, CheckCircle2, AlertTriangle, TrendingUp,
  RotateCcw, AlertOctagon, Search, X, Banknote, Coins,
  XCircle, Sparkles, ArrowUpRight, ArrowDownRight,
  FileText, Receipt, Warehouse, Flame, ArrowDownCircle, ShoppingCart, Loader2
} from "lucide-react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format } from "date-fns";
import { getStoredUser } from "@/lib/client/auth";
import { hasPermission } from "@/lib/client/rbac";
import { useAppData } from "@/lib/client/AppDataContext";
import { useCompany } from "@/lib/client/CompanyContext";
import { inventoryService } from "@/lib/services/inventoryService";
import { printerService } from "@/lib/services/api";
import { legacyApi } from "@/lib/client/http";
import { buildDayFilterQuery } from "@/lib/client/dayFilter";
import { platformsService } from "@/lib/services/platformsService";

// Full port of Frontend4/src/components/dashboard/Dashboard.jsx. models/serials/
// dispatches/returns now come from AppDataContext (app/(app)/layout.jsx) instead
// of AdminLayout props; onNavigate maps tab ids to Next.js routes matching the
// route names AdminLayout used, so this keeps working as each page lands. See
// [[ims-next-migration]].

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

// Fallback used only until the real list loads from the Platform Master
// table (Settings > Selling Platforms) — matches the previous hardcoded
// list so there's no blank/broken dropdown during that first fetch.
const DEFAULT_PLATFORM_OPTIONS = ["Overall", "GeM", "Flipkart", "Amazon", "Other"];

function normalizePlatform(firmName) {
  const val = String(firmName || "").trim().toLowerCase();
  if (val === "gem") return "GeM";
  if (val === "flipkart") return "Flipkart";
  if (val === "amazon") return "Amazon";
  return "Other";
}

const DAY_FILTER_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "last30", label: "Last 30 Days" },
  { key: "last60", label: "Last 60 Days" },
  { key: "last365", label: "Last 1 Year" },
  { key: "custom", label: "Custom" },
];

// Indian financial year: 1 Apr (yr) — 31 Mar (yr+1).
function getCurrentFYStartYear() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function buildFYOptions(count = 6) {
  const currentStart = getCurrentFYStartYear();
  return Array.from({ length: count }, (_, i) => {
    const startYear = currentStart - i;
    return { key: String(startYear), label: `FY ${startYear}-${String(startYear + 1).slice(2)}` };
  });
}

function getFYRange(startYearKey) {
  const startYear = Number(startYearKey);
  const start = new Date(startYear, 3, 1, 0, 0, 0, 0);
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
  return { start, end };
}

function getDayFilterRange(key, customStart, customEnd) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  switch (key) {
    case "yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "last7":
      start.setDate(start.getDate() - 6);
      break;
    case "last30":
      start.setDate(start.getDate() - 29);
      break;
    case "last60":
      start.setDate(start.getDate() - 59);
      break;
    case "last365":
      start.setDate(start.getDate() - 364);
      break;
    case "custom": {
      if (customStart) {
        const s = new Date(customStart);
        if (!Number.isNaN(s.getTime())) {
          s.setHours(0, 0, 0, 0);
          start.setTime(s.getTime());
        }
      }
      if (customEnd) {
        const e = new Date(customEnd);
        if (!Number.isNaN(e.getTime())) {
          e.setHours(23, 59, 59, 999);
          end.setTime(e.getTime());
        }
      }
      break;
    }
    case "today":
    default:
      break;
  }
  return { start, end };
}

export default function DashboardPage() {
  const router = useRouter();
  const { models: ownModels, serials: ownSerials, dispatches: ownDispatches, returns: ownReturns } = useAppData();
  // dashboardFilter is driven by the topbar Company Switcher's "All Companies"
  // option next to the date/time pill — selecting a specific company there
  // also switches the session (see CompanySwitcher in layout.jsx), so this
  // filter and the active session company stay in sync.
  const { dashboardFilter, activeCompany } = useCompany();
  const currentUser = typeof window !== "undefined" ? getStoredUser() : null;
  const userRole = currentUser?.role || "User";
  const isAdmin = userRole === "Admin";

  const canSeeAllCompanies = userRole === "Admin";
  const [filteredData, setFilteredData] = useState(null);
  const [filterLoading, setFilterLoading] = useState(false);
  const [allPlatformOptions, setAllPlatformOptions] = useState(DEFAULT_PLATFORM_OPTIONS);

  useEffect(() => {
    platformsService.getPlatforms().then((rows) => {
      if (Array.isArray(rows) && rows.length) setAllPlatformOptions(["Overall", ...rows.map((p) => p.name)]);
    });
  }, []);

  useEffect(() => {
    if (!canSeeAllCompanies || dashboardFilter !== "all") {
      setFilteredData(null);
      return;
    }
    let cancelled = false;
    setFilterLoading(true);
    Promise.all([
      printerService.getModels("all"),
      printerService.getSerials("all"),
      printerService.getDispatches(true, "all"),
      printerService.getReturns("all"),
    ]).then(([m, s, d, r]) => {
      if (cancelled) return;
      setFilteredData({
        models: Array.isArray(m) ? m : [],
        serials: Array.isArray(s) ? s : [],
        dispatches: Array.isArray(d) ? d : [],
        returns: Array.isArray(r) ? r : [],
      });
    }).finally(() => { if (!cancelled) setFilterLoading(false); });
    return () => { cancelled = true; };
  }, [dashboardFilter, canSeeAllCompanies]);

  const models = filteredData ? filteredData.models : ownModels;
  const serials = filteredData ? filteredData.serials : ownSerials;
  const dispatches = filteredData ? filteredData.dispatches : ownDispatches;
  const returns = filteredData ? filteredData.returns : ownReturns;

  const onNavigate = (tab) => {
    const path = `/${tab === "dashboard" ? "" : tab}`;
    const query = buildDayFilterQuery(dayFilter, customStart, customEnd);
    router.push(query ? `${path}?${query}` : path);
  };

  const [categoryFilter, setCategoryFilter] = useState("All");
  const [categoryMasterList, setCategoryMasterList] = useState([]);
  const [platformFilter, setPlatformFilter] = useState("Overall");
  const [dayFilter, setDayFilter] = useState("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showStockModal, setShowStockModal] = useState(false);
  const [stationeryStockValue, setStationeryStockValue] = useState(0);
  const [loadingStationery, setLoadingStationery] = useState(true);
  const [todayStockIn, setTodayStockIn] = useState(0);
  const [fyFilter, setFyFilter] = useState(String(getCurrentFYStartYear()));
  const [stockAvailableSummary, setStockAvailableSummary] = useState(null);
  const [selectedSalesMonth, setSelectedSalesMonth] = useState(null); // {year, monthIndex, label} — drill-down for the Sales chart

  const fyOptions = buildFYOptions();
  const { start: fyStart, end: fyEnd } = getFYRange(fyFilter);
  const fyLabel = fyOptions.find((o) => o.key === fyFilter)?.label || "";

  const { start: periodStart, end: periodEnd } = getDayFilterRange(dayFilter, customStart, customEnd);
  const periodLabel = DAY_FILTER_OPTIONS.find((o) => o.key === dayFilter)?.label || "Today";

  useEffect(() => {
    if (allowedPlatforms && !PLATFORM_OPTIONS.includes(platformFilter)) setPlatformFilter("Overall");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.guid]);

  useEffect(() => {
    const fetchStationeryValue = async () => {
      if (!hasPermission(currentUser, "stat_current_stock")) {
        setLoadingStationery(false);
        return;
      }
      try {
        const response = await inventoryService.getCurrentStock({ limit: 1 });
        setStationeryStockValue(Number(response.totalValue) || 0);
      } catch (error) {
        console.error("Failed to fetch stationery stock value:", error);
      } finally {
        setLoadingStationery(false);
      }
    };
    fetchStationeryValue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch whenever the active company changes — this list is scoped
  // server-side to the session's companyGuid, so switching companies must
  // refetch it or a previous company's categories linger in the filter.
  useEffect(() => {
    if (!hasPermission(currentUser, "stat_category")) return;
    legacyApi
      .get("/Inventory/GetCategoryList", { params: { page: 1, limit: 1000 } })
      .then((res) => setCategoryMasterList(res.data?.data || []))
      .catch((error) => console.error("Failed to load categories:", error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.guid]);

  useEffect(() => {
    if (!hasPermission(currentUser, "stat_stock_in")) return;
    if (dayFilter === "custom" && (!customStart || !customEnd)) return;
    const startStr = periodStart.toLocaleDateString("en-CA");
    const endStr = periodEnd.toLocaleDateString("en-CA");
    inventoryService
      .getStockInList(1, startStr, endStr, 1, 1)
      .then((res) => setTodayStockIn(res?.total || 0))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayFilter, customStart, customEnd]);

  // Serialized + non-serialized available stock, for any role that can see
  // the dashboard's "Stock Available" card — not just roles with the
  // "Serials" permission (see app/api/dashboard/stock-summary/route.js).
  useEffect(() => {
    printerService
      .getStockSummary({ fyStart: fyStart.toISOString(), fyEnd: fyEnd.toISOString() })
      .then((res) => setStockAvailableSummary(res))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fyFilter, activeCompany?.guid]);

  /* ================= CALCULATIONS ================= */
  const LOW_STOCK_THRESHOLD = 3;

  const activeDispatches = dispatches.filter(
    (d) => !d.isDeleted && (platformFilter === "Overall" || normalizePlatform(d.firmName) === platformFilter)
  );

  const printerStockValue = serials
    .filter((s) => s.status === "Available")
    .reduce((sum, item) => sum + (Number(item.landingPrice) || 0), 0);

  const totalInventoryValue = printerStockValue + stationeryStockValue;

  const modelCategories = Array.from(new Set(categoryMasterList.map((c) => c.categoryName).filter(Boolean)));

  const allowedPlatforms = activeCompany?.allowedPlatforms;
  const PLATFORM_OPTIONS = allowedPlatforms
    ? ["Overall", ...allPlatformOptions.slice(1).filter((p) => allowedPlatforms.includes(p))]
    : allPlatformOptions;

  const categoryFilteredModels =
    categoryFilter === "All" ? models : models.filter((m) => m.mainCategory === categoryFilter || m.category === categoryFilter);

  const allModelsStock = categoryFilteredModels.map((m) => {
    const stockCount = serials.filter((s) => s.modelId === m.id && s.status === "Available").length;
    return { name: m.name, stock: stockCount };
  });

  const chartData = [...allModelsStock].sort((a, b) => b.stock - a.stock).slice(0, 10);

  const lowStockModels = allModelsStock.filter((m) => m.stock < LOW_STOCK_THRESHOLD);

  // Available stock grouped by category — driven by the same top Category filter
  // (no separate dropdown): "All" shows every category, a specific pick narrows
  // categoryFilteredModels down to just that one.
  const categoryStockMap = {};
  categoryFilteredModels.forEach((m) => {
    const cat = m.mainCategory || m.category || "Uncategorized";
    const stockCount = serials.filter((s) => s.modelId === m.id && s.status === "Available").length;
    categoryStockMap[cat] = (categoryStockMap[cat] || 0) + stockCount;
  });
  const categoryStockData = Object.entries(categoryStockMap)
    .map(([name, stock]) => ({ name, stock }))
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 10);

  // Role-name-free: driven by the user's actual permission list (resolved
  // from their assigned role in the DB), not a hardcoded role name.
  // "reports" permission = Supervisor/Accountant-tier visibility;
  // "billing" permission = financial-amount visibility (Accountant-tier).
  // showOpsCards used to be "anyone who ISN'T billing-scoped" — meant to hide
  // ops widgets from a pure-Accountant role, but that also hid them for any
  // role that legitimately has BOTH billing and real order/dispatch/stock
  // access (e.g. an "orders" role that also got Billing ticked), leaving
  // that user with only the one unconditional Orders card and nothing else.
  // Now it's driven by whether the role has any actual ops-side permission,
  // independent of billing — a pure-billing role (no ops permissions) still
  // gets the finance-only view, but billing no longer silently suppresses
  // ops cards for anyone who also has real ops access.
  const OPS_PERMISSION_IDS = ["orders", "dispatch", "stat_stock_in", "returns", "damage", "stat_current_stock"];
  const hasReportsAccess = isAdmin || !!currentUser?.permissions?.includes("reports");
  const hasBillingAccess = isAdmin || !!currentUser?.permissions?.includes("billing");
  const showReports = hasReportsAccess;
  const showFinancials = hasBillingAccess;
  const showOpsCards = isAdmin || OPS_PERMISSION_IDS.some((p) => currentUser?.permissions?.includes(p));
  const showFinanceCards = hasReportsAccess;

  const inPeriod = (dateVal) => {
    const d = new Date(dateVal);
    return !Number.isNaN(d.getTime()) && d >= periodStart && d <= periodEnd;
  };

  // Category filter is a Models-domain concept (mainCategory/category on the
  // models table) — resolve a dispatch/return's model via its linked serial
  // so the same "AC"/"Printer"/etc. filter that drives Stock Distribution
  // also scopes these cards. Stock In isn't linked to Models at all (it's the
  // separate stationery/Item Master domain), so category doesn't apply there.
  const modelCategoryMatches = (serialId) => {
    if (categoryFilter === "All") return true;
    const s = serials.find((x) => (x.guid || x.id) === serialId);
    if (!s) return false;
    const m = models.find((x) => (x.guid || x.id) === (s.modelId || s.modelGuid || s.itemVariantId));
    if (!m) return false;
    return m.mainCategory === categoryFilter || m.category === categoryFilter;
  };

  // "Orders in period" — orderDate (falling back to createdAt) so a brand
  // new order counts here even before it's been physically dispatched. This
  // also backs "best-selling models"/orderValue below, which are meant to
  // track what was ordered, not what's shipped yet.
  const periodDispatches = activeDispatches.filter(
    (d) => inPeriod(d.orderDate || d.createdAt) && modelCategoryMatches(d.serialGuid || d.serialNumberId)
  );

  // Mirrors components/dispatch/Dispatch.jsx's own "Active" tab cutoff
  // (processedData's hiddenStatuses) — an order still sitting in Pending/
  // Order Confirmed/Send for Billing hasn't reached the Dispatch tab yet,
  // so it shouldn't count as "dispatched" here either even though
  // dispatchDate got stamped the moment it was first recorded.
  const NOT_YET_IN_DISPATCH_TAB = ["Draft", "Order On Hold", "Order Not Confirmed", "Order Cancelled", "Pending", "Order Confirmed", "Send for Billing"];

  // "Dispatched in period" — strictly dispatchDate, no createdAt fallback,
  // and only orders that have actually reached the Dispatch tab. Previously
  // this reused periodDispatches (which falls back to createdAt for
  // anything not yet dispatched, with no status check at all), so
  // "Dispatched Today" always matched "Orders Today" even when everything
  // was still sitting in Billing.
  const periodActuallyDispatched = activeDispatches.filter(
    (d) => d.dispatchDate && inPeriod(d.dispatchDate) && modelCategoryMatches(d.serialGuid || d.serialNumberId)
      && !NOT_YET_IN_DISPATCH_TAB.includes(d.status)
  );

  const periodReturns = returns.filter((r) => {
    if (!inPeriod(r.returnDate || r.createdAt)) return false;
    if (platformFilter !== "Overall" && normalizePlatform(r.firmName) !== platformFilter) return false;
    if (!modelCategoryMatches(r.serialGuid || r.serialNumberGuid)) return false;
    return true;
  });

  const todayDispatches = periodActuallyDispatched.length;
  const todayReturns = periodReturns.length;
  const periodDamagedCount = periodReturns.filter((r) => r.condition === "Damaged").length;

  const orderKeys = new Set(periodDispatches.map((d) => d.customerName || d.customer || d.bidNumber || d.id));
  const orderCount = orderKeys.size;
  const orderValue = periodDispatches.reduce((sum, d) => sum + (Number(d.sellingPrice) || 0), 0);

  // Financial-year-scoped totals (1 Apr–31 Mar) — matches Billing.jsx's status logic
  // for "Send for Billing"/"Payment Pending" so these cards agree with the Billing page.
  const inFY = (dateVal) => {
    const d = new Date(dateVal);
    return !Number.isNaN(d.getTime()) && d >= fyStart && d <= fyEnd;
  };

  // Falls back to the serials-only count (what's already loaded client-side)
  // until the dedicated summary fetch above resolves, or if it fails.
  const totalStockAvailable = stockAvailableSummary?.total ?? serials.filter((s) => s.status === "Available" && inFY(s.createdAt)).length;

  const fyActiveDispatches = dispatches.filter((d) => !d.isDeleted && inFY(d.dispatchDate || d.createdAt));

  const duePaymentDispatches = fyActiveDispatches.filter(
    (d) => d.status === "Payment Pending" || (d.logisticsStatus === "Delivered" && d.status !== "Completed")
  );
  const totalDuePayments = duePaymentDispatches.reduce((sum, d) => sum + (Number(d.sellingPrice) || 0), 0);

  const pendingBillCount = fyActiveDispatches.filter(
    (d) => d.status === "Send for Billing" || d.status === "Send for Billing (Hold)"
  ).length;

  const fyOrderKeys = new Set(fyActiveDispatches.map((d) => d.customerName || d.customer || d.bidNumber || d.id));
  const totalOrderCount = fyOrderKeys.size;

  // Top 10 best-selling models — respects every active dashboard filter (Category,
  // Platform, Day) via periodDispatches, which already applies all three.
  const modelDispatchCount = {};
  periodDispatches.forEach((d) => {
    const serial = serials.find((s) => (s.guid || s.id) === (d.serialGuid || d.serialNumberId));
    const model = serial ? models.find((m) => (m.guid || m.id) === serial.modelGuid) : null;
    const name = model?.name || d.modelName || null;
    if (name) modelDispatchCount[name] = (modelDispatchCount[name] || 0) + 1;
  });
  const topModels = Object.entries(modelDispatchCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
  const topModelsMax = topModels[0]?.count || 1;

  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const label = d.toLocaleString("en-IN", { month: "short" }) + " '" + String(d.getFullYear()).slice(2);
    const count = activeDispatches.filter((x) => {
      const xd = new Date(x.dispatchDate || x.createdAt);
      return xd.getMonth() === d.getMonth() && xd.getFullYear() === d.getFullYear();
    }).length;
    return { month: label, count };
  });

  // Sales (revenue) bar graph — one bar per month of the selected Financial Year,
  // respecting the same Category filter used by Stock Distribution. Each bar
  // also carries its year/monthIndex so clicking it can drill into day-wise
  // sales for that specific month (see salesByDay + selectedSalesMonth below).
  const salesByMonth = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(fyStart.getFullYear(), fyStart.getMonth() + i, 1);
    const label = d.toLocaleString("en-IN", { month: "short" }) + " '" + String(d.getFullYear()).slice(2);
    const total = activeDispatches
      .filter((x) => {
        const xd = new Date(x.dispatchDate || x.createdAt);
        return (
          xd.getMonth() === d.getMonth() &&
          xd.getFullYear() === d.getFullYear() &&
          modelCategoryMatches(x.serialGuid || x.serialNumberId)
        );
      })
      .reduce((sum, x) => sum + (Number(x.sellingPrice) || 0), 0);
    return { month: label, sales: total, year: d.getFullYear(), monthIndex: d.getMonth() };
  });

  // Day-wise breakdown for whichever month bar was clicked (null = no
  // drill-down active, monthly view shows as usual).
  const salesByDay = selectedSalesMonth
    ? Array.from({ length: new Date(selectedSalesMonth.year, selectedSalesMonth.monthIndex + 1, 0).getDate() }, (_, i) => {
        const day = i + 1;
        const total = activeDispatches
          .filter((x) => {
            const xd = new Date(x.dispatchDate || x.createdAt);
            return (
              xd.getFullYear() === selectedSalesMonth.year &&
              xd.getMonth() === selectedSalesMonth.monthIndex &&
              xd.getDate() === day &&
              modelCategoryMatches(x.serialGuid || x.serialNumberId)
            );
          })
          .reduce((sum, x) => sum + (Number(x.sellingPrice) || 0), 0);
        return { day: String(day), sales: total };
      })
    : [];

  const godownMap = {};
  serials
    .filter((s) => s.status === "Available")
    .forEach((s) => {
      const name = s.godownName || "Unassigned";
      godownMap[name] = (godownMap[name] || 0) + 1;
    });
  const godownData = Object.entries(godownMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  const godownTotal = godownData.reduce((s, x) => s + x.count, 0) || 1;
  const GODOWN_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-lg px-3 py-2 rounded-lg shadow-lg border border-slate-100">
          <p className="text-xs font-bold text-slate-800">{label}</p>
          <p className="text-sm font-bold text-indigo-600">{payload[0].value} units</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-5 relative">
      <div className="relative">
        <div className="absolute -top-4 -left-4 w-48 h-48 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl -z-10" />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <h1 className="text-lg font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            Inventory Dashboard
            {filterLoading && <Loader2 size={14} className="animate-spin text-indigo-400" />}
          </h1>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer w-fit"
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer w-fit"
            >
              {DAY_FILTER_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            {dayFilter === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="text-xs font-medium text-slate-600 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="text-xs font-medium text-slate-600 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            )}
            <select
              value={fyFilter}
              onChange={(e) => setFyFilter(e.target.value)}
              className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer w-fit"
            >
              {fyOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            {modelCategories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
              >
                <option value="All">All Categories</option>
                {modelCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div
          onClick={() => onNavigate("orderTracking")}
          className="group relative bg-white rounded-xl px-3 py-2.5 border border-slate-200/60 shadow-sm hover:shadow-md hover:shadow-indigo-500/10 transition-all cursor-pointer overflow-hidden flex items-center gap-3"
        >
          <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-sm shadow-indigo-500/30 shrink-0">
            <Receipt size={14} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Orders · {periodLabel}</p>
            <h3 className="text-lg font-extrabold text-slate-800 leading-tight">{orderCount}</h3>
            {showFinancials && <p className="text-[10px] font-bold text-indigo-600">₹{orderValue.toLocaleString("en-IN")}</p>}
          </div>
          <ArrowUpRight size={13} className="text-slate-300 group-hover:text-indigo-500 shrink-0 transition-all" />
        </div>

        {showOpsCards && (
          <div
            onClick={() => onNavigate("dispatch")}
            className="group relative bg-white rounded-xl px-3 py-2.5 border border-slate-200/60 shadow-sm hover:shadow-md hover:shadow-amber-500/10 transition-all cursor-pointer overflow-hidden flex items-center gap-3"
          >
            <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg shadow-sm shadow-amber-500/30 shrink-0">
              <Truck size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Dispatched · {periodLabel}</p>
              <h3 className="text-lg font-extrabold text-slate-800 leading-tight">{todayDispatches}</h3>
            </div>
            <ArrowUpRight size={13} className="text-slate-300 group-hover:text-amber-500 shrink-0 transition-all" />
          </div>
        )}

        {showOpsCards && (
          <div
            onClick={() => onNavigate("returns")}
            className="group relative bg-white rounded-xl px-3 py-2.5 border border-slate-200/60 shadow-sm hover:shadow-md hover:shadow-orange-500/10 transition-all cursor-pointer overflow-hidden flex items-center gap-3"
          >
            <div className="p-1.5 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg shadow-sm shadow-orange-500/30 shrink-0">
              <RotateCcw size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Returns · {periodLabel}</p>
              <h3 className="text-lg font-extrabold text-slate-800 leading-tight">{todayReturns}</h3>
            </div>
            <ArrowUpRight size={13} className="text-slate-300 group-hover:text-orange-500 shrink-0 transition-all" />
          </div>
        )}

        {showOpsCards && (
          <div
            onClick={() => onNavigate("stockIn")}
            className="group relative bg-white rounded-xl px-3 py-2.5 border border-slate-200/60 shadow-sm hover:shadow-md hover:shadow-emerald-500/10 transition-all cursor-pointer overflow-hidden flex items-center gap-3"
          >
            <div className="p-1.5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-sm shadow-emerald-500/30 shrink-0">
              <ArrowDownCircle size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Stock In · {periodLabel}</p>
              <h3 className="text-lg font-extrabold text-slate-800 leading-tight">{todayStockIn}</h3>
            </div>
            <ArrowUpRight size={13} className="text-slate-300 group-hover:text-emerald-500 shrink-0 transition-all" />
          </div>
        )}

        {showOpsCards && (
          <div
            onClick={() => onNavigate("damaged")}
            className="group relative bg-gradient-to-br from-red-50 to-rose-50 rounded-xl px-3 py-2.5 border border-red-100 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden flex items-center gap-3"
          >
            <div className="p-1.5 bg-gradient-to-br from-red-500 to-rose-600 rounded-lg shadow-sm shadow-red-500/30 shrink-0">
              <AlertOctagon size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Damaged · {periodLabel}</p>
              <h3 className="text-lg font-extrabold text-red-600 leading-tight">{periodDamagedCount}</h3>
            </div>
            <ArrowUpRight size={13} className="text-red-200 group-hover:text-red-500 shrink-0 transition-all" />
          </div>
        )}
      </div>

      {(showOpsCards || showFinanceCards) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(showOpsCards || showFinanceCards) && (
            <div
              onClick={() => onNavigate("currentStock")}
              className="group relative bg-white rounded-xl px-3 py-2.5 border border-slate-200/60 shadow-sm hover:shadow-md hover:shadow-teal-500/10 transition-all cursor-pointer overflow-hidden flex items-center gap-3"
            >
              <div className="p-1.5 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg shadow-sm shadow-teal-500/30 shrink-0">
                <Package size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Stock Available · Current</p>
                <h3 className="text-lg font-extrabold text-slate-800 leading-tight">{totalStockAvailable}</h3>
              </div>
              <ArrowUpRight size={13} className="text-slate-300 group-hover:text-teal-500 shrink-0 transition-all" />
            </div>
          )}

          {showFinanceCards && (
            <div
              onClick={() => onNavigate("billing")}
              className="group relative bg-white rounded-xl px-3 py-2.5 border border-slate-200/60 shadow-sm hover:shadow-md hover:shadow-rose-500/10 transition-all cursor-pointer overflow-hidden flex items-center gap-3"
            >
              <div className="p-1.5 bg-gradient-to-br from-rose-500 to-pink-600 rounded-lg shadow-sm shadow-rose-500/30 shrink-0">
                <Banknote size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Due Payments · {fyLabel}</p>
                <h3 className="text-lg font-extrabold text-slate-800 leading-tight">
                  {showFinancials ? `₹${totalDuePayments.toLocaleString("en-IN")}` : duePaymentDispatches.length}
                </h3>
              </div>
              <ArrowUpRight size={13} className="text-slate-300 group-hover:text-rose-500 shrink-0 transition-all" />
            </div>
          )}

          {showFinanceCards && (
            <div
              onClick={() => onNavigate("billing")}
              className="group relative bg-white rounded-xl px-3 py-2.5 border border-slate-200/60 shadow-sm hover:shadow-md hover:shadow-yellow-500/10 transition-all cursor-pointer overflow-hidden flex items-center gap-3"
            >
              <div className="p-1.5 bg-gradient-to-br from-yellow-500 to-amber-600 rounded-lg shadow-sm shadow-yellow-500/30 shrink-0">
                <FileText size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Pending Bill · {fyLabel}</p>
                <h3 className="text-lg font-extrabold text-slate-800 leading-tight">{pendingBillCount}</h3>
              </div>
              <ArrowUpRight size={13} className="text-slate-300 group-hover:text-yellow-500 shrink-0 transition-all" />
            </div>
          )}

          {showFinanceCards && (
            <div
              onClick={() => onNavigate("orderTracking")}
              className="group relative bg-white rounded-xl px-3 py-2.5 border border-slate-200/60 shadow-sm hover:shadow-md hover:shadow-violet-500/10 transition-all cursor-pointer overflow-hidden flex items-center gap-3"
            >
              <div className="p-1.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg shadow-sm shadow-violet-500/30 shrink-0">
                <ShoppingCart size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Total Order · {fyLabel}</p>
                <h3 className="text-lg font-extrabold text-slate-800 leading-tight">{totalOrderCount}</h3>
              </div>
              <ArrowUpRight size={13} className="text-slate-300 group-hover:text-violet-500 shrink-0 transition-all" />
            </div>
          )}
        </div>
      )}

      {(showOpsCards || showFinanceCards) && (
      <div className={`grid grid-cols-1 ${showOpsCards && showFinanceCards ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""} gap-4`}>
        {showOpsCards && (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${lowStockModels.length > 0 ? "bg-gradient-to-br from-red-500 to-orange-500" : "bg-gradient-to-br from-emerald-500 to-green-600"}`}>
                <AlertTriangle size={14} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Stock Health</h3>
                <p className="text-[10px] text-slate-400">Low stock alerts</p>
              </div>
            </div>
          </div>

          <div className="p-3 overflow-y-auto max-h-80 custom-scrollbar">
            {lowStockModels.length > 0 ? (
              <div className="space-y-2">
                <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white px-3 py-2 rounded-lg flex items-center gap-2 shadow-md shadow-red-500/25">
                  <AlertTriangle size={14} />
                  <div>
                    <p className="font-bold text-xs">{lowStockModels.length} Model(s) Low</p>
                    <p className="text-[10px] text-white/80">Stock &lt; {LOW_STOCK_THRESHOLD}</p>
                  </div>
                </div>

                {lowStockModels.map((model, index) => (
                  <div key={index} className="flex justify-between items-center p-2.5 bg-gradient-to-r from-slate-50 to-red-50 rounded-lg border border-red-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-500">
                        <Package size={14} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 truncate max-w-[80px]">{model.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ArrowDownRight size={12} className="text-red-500" />
                      <span className="text-sm font-extrabold text-red-600 bg-red-100 px-2 py-0.5 rounded-md">{model.stock}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-4">
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-100 to-green-100 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </div>
                <h4 className="text-sm font-bold text-emerald-700">All Healthy!</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Sufficient stock levels</p>
                <div className="mt-2 px-2 py-1 bg-emerald-50 rounded-full">
                  <span className="text-[9px] font-semibold text-emerald-600">Min: {LOW_STOCK_THRESHOLD} units</span>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {showFinanceCards && (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg">
                <Coins size={14} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Sales</h3>
                <p className="text-[10px] text-slate-400">
                  {selectedSalesMonth
                    ? `Day-wise sales · ${selectedSalesMonth.label}`
                    : `Revenue by month · ${fyLabel}${categoryFilter !== "All" ? ` · ${categoryFilter}` : ""}`}
                </p>
              </div>
            </div>
            {selectedSalesMonth ? (
              <button
                onClick={() => setSelectedSalesMonth(null)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition-colors"
              >
                ← Back to months
              </button>
            ) : (
              modelCategories.length > 0 && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  {modelCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )
            )}
          </div>
          <div className="p-4" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              {selectedSalesMonth ? (
                <BarChart data={salesByDay} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "Sales"]}
                    labelFormatter={(day) => `Day ${day}`}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Bar dataKey="sales" fill="#10b981" radius={[6, 6, 0, 0]} barSize={18} />
                </BarChart>
              ) : (
                <BarChart data={salesByMonth} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "Sales"]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Bar
                    dataKey="sales"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                    barSize={24}
                    cursor="pointer"
                    onClick={(data) => setSelectedSalesMonth({ year: data.year, monthIndex: data.monthIndex, label: data.month })}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
        )}
      </div>
      )}

      {showOpsCards && (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg">
              <Warehouse size={14} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Godown Stock</h3>
              <p className="text-[10px] text-slate-400">Available units by location</p>
            </div>
          </div>
          <div className="p-4">
            {godownData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-400 text-xs">No available stock</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={godownData}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={65}
                        paddingAngle={2}
                      >
                        {godownData.map((entry, index) => (
                          <Cell key={`godown-cell-${index}`} fill={GODOWN_COLORS[index % GODOWN_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} units (${Math.round((value / godownTotal) * 100)}%)`, name]}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5">
                  {godownData.map((g, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: GODOWN_COLORS[i % GODOWN_COLORS.length] }} />
                      <span className="flex-1 min-w-0 font-semibold text-slate-700 truncate">{g.name}</span>
                      <span className="font-extrabold text-slate-600">
                        {g.count} <span className="text-slate-400 font-normal">({Math.round((g.count / godownTotal) * 100)}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between text-[10px] font-bold text-slate-400">
              <span>Total Available</span>
              <span>{godownTotal} units</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg">
              <Package size={14} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Top 10 Stock by Category</h3>
              <p className="text-[10px] text-slate-400">{categoryFilter === "All" ? "All Categories" : categoryFilter}</p>
            </div>
          </div>
          <div className="p-4" style={{ height: 240 }}>
            {categoryStockData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">No available stock</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryStockData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b", fontWeight: 500 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    formatter={(value) => [`${value} units`, "Available Stock"]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Bar dataKey="stock" fill="#0ea5e9" radius={[6, 6, 0, 0]} barSize={35} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
      )}

      {showStockModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">Stock Valuation</h3>
                  <p className="text-emerald-100 text-xs font-medium opacity-80">Inventory Assets Breakdown</p>
                </div>
                <button onClick={() => setShowStockModal(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 text-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Assets Value</p>
                <p className="text-3xl font-black text-slate-800">₹{totalInventoryValue.toLocaleString("en-IN")}</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="group bg-white p-4 rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-md transition-all flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <Printer size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-700">Printer Stock</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Serialized Items</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-indigo-600">₹{printerStockValue.toLocaleString("en-IN")}</p>
                    <p className="text-[10px] font-bold text-slate-400">{((printerStockValue / (totalInventoryValue || 1)) * 100).toFixed(1)}% of total</p>
                  </div>
                </div>

                <div className="group bg-white p-4 rounded-2xl border border-slate-200 hover:border-emerald-200 hover:shadow-md transition-all flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-700">Stationery Stock</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Non-Serialized Items</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-emerald-600">{loadingStationery ? "Loading..." : `₹${stationeryStockValue.toLocaleString("en-IN")}`}</p>
                    <p className="text-[10px] font-bold text-slate-400">{((stationeryStockValue / (totalInventoryValue || 1)) * 100).toFixed(1)}% of total</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-blue-600">
                <Sparkles size={16} className="shrink-0" />
                <p className="text-[10px] font-medium leading-relaxed">
                  Printer stock includes all serialized units in "Available" status. Stationery includes all consumables and other items managed by quantity.
                </p>
              </div>
            </div>

            <div className="p-6 pt-0">
              <button
                onClick={() => setShowStockModal(false)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-[0.98]"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #c7d2fe, #a5b4fc);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
