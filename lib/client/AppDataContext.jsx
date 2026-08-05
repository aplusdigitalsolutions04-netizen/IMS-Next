"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { printerService } from "@/lib/services/api";
import api, { API_URL } from "@/lib/client/apiClient";
import { getStoredToken } from "@/lib/client/auth";

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

export function AppDataProvider({ children }) {
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

  const loadCoreData = useCallback(async () => {
    const results = await Promise.allSettled([
      printerService.getModels(),
      printerService.getSerials(),
      printerService.getDispatches(true),
      printerService.getReturns(),
    ]);

    let hasFailure = false;
    const loadedKeys = {};

    if (results[0].status === "fulfilled") {
      setModels(Array.isArray(results[0].value) ? results[0].value : []);
      loadedKeys.models = true;
    } else {
      hasFailure = true;
      console.error("Failed to load models:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
      setSerials(Array.isArray(results[1].value) ? results[1].value : []);
      loadedKeys.serials = true;
    } else {
      hasFailure = true;
      console.error("Failed to load serials:", results[1].reason);
    }

    if (results[2].status === "fulfilled") {
      setDispatches(Array.isArray(results[2].value) ? results[2].value : []);
      loadedKeys.dispatches = true;
    } else {
      hasFailure = true;
      console.error("Failed to load dispatches:", results[2].reason);
    }

    if (results[3].status === "fulfilled") {
      setReturns(getReturnsArray(results[3].value));
      loadedKeys.returns = true;
    } else {
      hasFailure = true;
      console.error("Failed to load returns:", results[3].reason);
    }

    markDataLoaded(loadedKeys);
    setCoreLoading(false);
    return !hasFailure;
  }, [markDataLoaded]);

  const loadOrdersData = useCallback(async () => {
    try {
      const data = await printerService.getOrders();
      setOrders(Array.isArray(data) ? data : []);
      markDataLoaded({ orders: true });
      return true;
    } catch (error) {
      console.error("Failed to load orders:", error);
      return false;
    }
  }, [markDataLoaded]);

  const loadInstallationData = useCallback(async () => {
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
  }, [markDataLoaded]);

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
