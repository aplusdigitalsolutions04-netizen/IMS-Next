"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { printerService } from "@/lib/services/api";
import api, { API_URL } from "@/lib/client/apiClient";
import { getStoredToken } from "@/lib/client/auth";
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

  // Real-time sync — a single app-wide SSE connection (opened once here,
  // since AppDataProvider wraps every page and isn't remounted on
  // navigation) that keeps every open tab in sync whenever any user in the
  // same company adds/edits/deletes models, serials, dispatches, returns,
  // orders, etc. Other features (e.g. Contracts) that don't live in this
  // context can still piggyback on the same connection via subscribeRealtime.
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

  useEffect(() => {
    let evtSource = null;
    let retryTimer = null;
    let retryDelay = 5000;
    let stopped = false;

    const CORE_ENTITIES = new Set(["models", "serials", "dispatches", "returns"]);

    function connect() {
      const token = getStoredToken();
      if (!token || stopped) return;

      evtSource = new EventSource(`${API_URL}/realtime/stream?token=${token}`);

      evtSource.onmessage = (event) => {
        if (!event.data) return; // heartbeat
        retryDelay = 5000;
        try {
          const data = JSON.parse(event.data);
          if (data.type !== "DATA_CHANGED") return;

          if (CORE_ENTITIES.has(data.entity)) {
            loadCoreData();
          } else if (data.entity === "orders" && dataStatusRef.current.orders) {
            loadOrdersData();
          } else if (data.entity === "installations" && (dataStatusRef.current.installations || dataStatusRef.current.installationStats)) {
            loadInstallationData();
          }

          const set = realtimeSubscribers.current.get(data.entity);
          if (set) set.forEach((cb) => cb());
        } catch {
          // ignore malformed event
        }
      };

      evtSource.onerror = () => {
        evtSource?.close();
        evtSource = null;
        if (stopped) return;
        retryDelay = Math.min(retryDelay * 2, 60000);
        retryTimer = setTimeout(connect, retryDelay);
      };
    }

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      evtSource?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        landingPrice: foundSerial.landingPrice,
      });
      setShowSearchModal(true);
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
