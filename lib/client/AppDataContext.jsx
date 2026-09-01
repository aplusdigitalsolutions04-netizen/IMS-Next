"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { printerService } from "@/lib/services/api";
import { hasPermission } from "@/lib/client/rbac";

// Fallback used until the real value loads (and if the request ever fails)
// — matches the value every call site used to have hardcoded, so behavior
// is unchanged for anyone who hasn't opened Settings > Business Rules yet.
const DEFAULT_SETTINGS = { eway_bill_threshold: 50000 };

// Mirrors the core-data slice of Frontend4/src/components/AdminLayout.jsx's
// loadCoreData/loadOrdersData/loadInstallationData — kept in a context so any
// page under app/(app) can read models/serials/dispatches/returns without
// re-fetching. See [[ims-next-migration]].
const AppDataContext = createContext(null);

const getReturnsArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.returns)) return payload.returns;
  if (payload && Array.isArray(payload.results)) return payload.results;
  return [];
};

// Core-data fetches that only make sense (and are only authorized) if the
// current role has the matching permission — a role missing e.g. "returns"
// would otherwise 403 on every single page load, forever, since this
// provider wraps the whole app and never unmounts between navigations.
//
// `permission` can be a single ID or an array — dispatches needs either of
// two: components/billing/Billing.jsx renders entirely from this same
// `dispatches` array (it has no data source of its own), but the Billing
// *page* only requires the "billing" permission to open (see
// components/common/Sidebar.jsx). A role with "billing" checked but not
// "dispatch" could open Billing and see it permanently empty — indistinguishable
// from "no orders yet" — because this fetch never ran for them.
const CORE_KEYS = [
  { key: "models", permission: "print_models", fetch: () => printerService.getModels(), transform: (v) => (Array.isArray(v) ? v : []) },
  { key: "serials", permission: "print_serials", fetch: () => printerService.getSerials(), transform: (v) => (Array.isArray(v) ? v : []) },
  { key: "dispatches", permission: ["dispatch", "billing"], fetch: () => printerService.getDispatches(true), transform: (v) => (Array.isArray(v) ? v : []) },
  // Damaged (permission "damage") and Order Processing's own Returned tab/
  // financials (permission "orders") both consume this same shared array —
  // same Billing/dispatch-style mismatch: without this, a role with just
  // "damage" or "orders" (no "returns") sees those permanently empty.
  { key: "returns", permission: ["returns", "damage", "orders"], fetch: () => printerService.getReturns(), transform: getReturnsArray },
];

const hasAnyPermission = (user, permission) =>
  Array.isArray(permission) ? permission.some((p) => hasPermission(user, p)) : hasPermission(user, permission);

export function AppDataProvider({ children, currentUser }) {
  const [models, setModels] = useState([]);
  const [serials, setSerials] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [returns, setReturns] = useState([]);
  const [orders, setOrders] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [installationStats, setInstallationStats] = useState(null);
  const [dataStatus, setDataStatus] = useState({
    models: false,
    serials: false,
    dispatches: false,
    returns: false,
    orders: false,
    installations: false,
    installationStats: false,
  });
  const [coreLoading, setCoreLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const markDataLoaded = useCallback((nextStatus) => {
    setDataStatus((prev) => ({ ...prev, ...nextStatus }));
  }, []);

  const coreSetters = { models: setModels, serials: setSerials, dispatches: setDispatches, returns: setReturns };

  const loadCoreData = useCallback(async () => {
    const allowed = CORE_KEYS.filter((c) => hasAnyPermission(currentUser, c.permission));
    const results = await Promise.allSettled(allowed.map((c) => c.fetch()));

    let hasFailure = false;
    const loadedKeys = {};

    allowed.forEach((c, i) => {
      if (results[i].status === "fulfilled") {
        coreSetters[c.key](c.transform(results[i].value));
        loadedKeys[c.key] = true;
      } else {
        hasFailure = true;
        console.error(`Failed to load ${c.key}:`, results[i].reason);
      }
    });

    // Nothing to fetch for permissions the role doesn't have — mark them
    // "loaded" (with whatever empty default state already holds) rather
    // than leaving dataStatus stuck at false forever.
    CORE_KEYS.filter((c) => !hasAnyPermission(currentUser, c.permission)).forEach((c) => {
      loadedKeys[c.key] = true;
    });

    markDataLoaded(loadedKeys);
    setCoreLoading(false);
    return !hasFailure;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markDataLoaded, currentUser]);

  const loadOrdersData = useCallback(async () => {
    if (!hasPermission(currentUser, "orders")) {
      markDataLoaded({ orders: true });
      return true;
    }
    try {
      const data = await printerService.getOrders();
      setOrders(Array.isArray(data) ? data : []);
      markDataLoaded({ orders: true });
      return true;
    } catch (error) {
      console.error("Failed to load orders:", error);
      return false;
    }
  }, [markDataLoaded, currentUser]);

  const loadInstallationData = useCallback(async () => {
    if (!hasPermission(currentUser, "installation")) {
      markDataLoaded({ installations: true, installationStats: true });
      return true;
    }
    const results = await Promise.allSettled([
      printerService.getInstallations(),
      printerService.getInstallationStats(),
    ]);

    let hasFailure = false;
    const loadedKeys = {};

    if (results[0].status === "fulfilled") {
      setInstallations(Array.isArray(results[0].value) ? results[0].value : []);
      loadedKeys.installations = true;
    } else {
      hasFailure = true;
      console.error("Failed to load installations:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
      setInstallationStats(results[1].value || null);
      loadedKeys.installationStats = true;
    } else {
      hasFailure = true;
      console.error("Failed to load installation stats:", results[1].reason);
    }

    markDataLoaded(loadedKeys);
    return !hasFailure;
  }, [markDataLoaded, currentUser]);

  const refreshData = useCallback(
    async ({ includeOrders = dataStatus.orders, includeInstallations = dataStatus.installations || dataStatus.installationStats } = {}) => {
      const tasks = [loadCoreData()];
      if (includeOrders) tasks.push(loadOrdersData());
      if (includeInstallations) tasks.push(loadInstallationData());
      await Promise.all(tasks);
    },
    [dataStatus.orders, dataStatus.installations, dataStatus.installationStats, loadCoreData, loadOrdersData, loadInstallationData]
  );

  // Real-time-ish sync — polling instead of a persistent SSE connection.
  // A permanently-open EventSource per browser tab used to keep every tab in
  // sync live, but on Passenger-based shared hosting (limited worker
  // processes/threads per app) every open tab pins one of those few workers
  // forever — new requests from any user then queue behind them and hang.
  // Polling avoids holding a connection open, at the cost of a shorter delay
  // (POLL_INTERVAL) before other tabs see a change instead of instant push.
  const realtimeSubscribers = useRef(new Map()); // Map<entity, Set<callback>>
  const dataStatusRef = useRef(dataStatus);
  dataStatusRef.current = dataStatus;

  const subscribeRealtime = useCallback((entity, callback) => {
    if (!realtimeSubscribers.current.has(entity)) realtimeSubscribers.current.set(entity, new Set());
    realtimeSubscribers.current.get(entity).add(callback);
    return () => {
      const set = realtimeSubscribers.current.get(entity);
      if (set) set.delete(callback);
    };
  }, []);

  const POLL_INTERVAL = 4000;
  // Minimum gap enforced between two ticks — guards against the burst that
  // "visibilitychange" would otherwise cause: opening/closing a native
  // <input type="file"> picker (e.g. Stock In's invoice upload) toggles tab
  // visibility in most desktop browsers, so onVisible below fires right on
  // top of whatever request the user's own action just triggered. On
  // Passenger's limited worker pool a resulting burst of concurrent
  // requests risks one of them transiently 401ing — and the response
  // interceptor treats any single 401 as "session over" and force-logs-out,
  // even though it was just this passive background refresh.
  const lastTickRef = useRef(0);

  const pollTick = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    lastTickRef.current = Date.now();
    await loadCoreData();
    if (dataStatusRef.current.orders) await loadOrdersData();
    if (dataStatusRef.current.installations || dataStatusRef.current.installationStats) await loadInstallationData();

    realtimeSubscribers.current.forEach((set) => set.forEach((cb) => cb()));
  }, [loadCoreData, loadOrdersData, loadInstallationData]);

  useEffect(() => {
    const interval = setInterval(pollTick, POLL_INTERVAL);
    const onVisible = () => {
      if (document.hidden) return;
      if (Date.now() - lastTickRef.current < POLL_INTERVAL / 2) return;
      pollTick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollTick]);

  useEffect(() => {
    const query = globalSearch;
    if (!query.trim()) {
      setSearchResult(null);
      setShowSearchModal(false);
      return;
    }

    const lowerQuery = query.toLowerCase();
    let foundSerial = serials.find((s) => (s.serialNumber || "").toLowerCase() === lowerQuery);

    if (!foundSerial) {
      const foundDispatch = dispatches.find((d) => d.customerName && d.customerName.toLowerCase() === lowerQuery);
      if (foundDispatch) {
        foundSerial = serials.find((s) => (s.guid || s.id) === (foundDispatch.serialGuid || foundDispatch.serialNumberId));
      }
    }

    if (!foundSerial) {
      const foundDispatch = dispatches.find((d) => d.warranty && d.warranty.toLowerCase().includes(lowerQuery));
      if (foundDispatch) {
        foundSerial = serials.find((s) => (s.guid || s.id) === (foundDispatch.serialGuid || foundDispatch.serialNumberId));
      }
    }

    if (foundSerial) {
      // serialsService attaches `modelId` (not `modelGuid`) to each serial —
      // matching on the wrong field name here always missed, so model/company
      // silently fell back to "Unknown" in the search result below.
      const model = models.find((m) => (m.guid || m.id) === foundSerial.modelId) || foundSerial.model;

      const dispatchInfo = dispatches
        .filter((d) => (d.serialGuid || d.serialNumberId) === (foundSerial.guid || foundSerial.id) && !d.isDeleted)
        .sort((a, b) => new Date(b.dispatchDate) - new Date(a.dispatchDate))[0];

      const cancelledDispatchInfo = dispatches
        .filter((d) => (d.serialGuid || d.serialNumberId) === (foundSerial.guid || foundSerial.id) && d.isDeleted)
        .sort((a, b) => new Date(b.cancelledAt) - new Date(a.cancelledAt))[0];

      const returnInfo = returns
        .filter((r) => r.serialGuid === foundSerial.id)
        .sort((a, b) => new Date(b.returnDate) - new Date(a.returnDate))[0];

      setSearchResult({
        serial: foundSerial.serialNumber,
        model: model?.name || "Unknown",
        status: foundSerial.status,
        company: model?.company || "Unknown",
        dispatch: dispatchInfo,
        cancelledDispatch: cancelledDispatchInfo,
        returnRecord: returnInfo,
        fbfFbaSellOut: null,
        landingPrice: foundSerial.landingPrice,
      });
      setShowSearchModal(true);

      // 'Sold' with no dispatchInfo means it was sold out from FBF/FBA, not
      // via a normal order (see sell-out/route.js) — fetch the matching
      // transaction on demand (not preloaded — see CORE_KEYS above, this used
      // to eagerly load every sell-out on every page load and slowed down
      // the initial app load for everyone) for the Order ID / Reference
      // entered at sell-out time, so the result isn't just a bare "Sold".
      if (foundSerial.status === "Sold" && !dispatchInfo) {
        printerService.getFbfFbaSellOutForSerial(foundSerial.serialNumber)
          .then((sellOut) => {
            if (!sellOut) return;
            // Only patch if this result is still what's showing — the user
            // may have typed a different search since this call went out.
            setSearchResult((prev) => (prev && prev.serial === foundSerial.serialNumber ? { ...prev, fbfFbaSellOut: sellOut } : prev));
          })
          .catch((err) => console.error("Failed to load FBF/FBA sell-out details:", err));
      }
    } else {
      setSearchResult(null);
      setShowSearchModal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearch]);

  const clearGlobalSearch = useCallback(() => {
    setGlobalSearch("");
    setShowSearchModal(false);
  }, []);

  const value = {
    models,
    serials,
    dispatches,
    returns,
    orders,
    installations,
    installationStats,
    dataStatus,
    coreLoading,
    globalSearch,
    setGlobalSearch,
    clearGlobalSearch,
    searchResult,
    showSearchModal,
    setShowSearchModal,
    loadCoreData,
    loadOrdersData,
    loadInstallationData,
    refreshData,
    subscribeRealtime,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
