"use client";
// ✅ OrderTracking Component (Comment updated to force Vite HMR cache clear)
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Search, Eye, FileText, Truck, CheckCircle, AlertCircle,
  Clock, X, Box, Receipt, ExternalLink,
  Save, Package, RefreshCw, User, Building,
  Calendar, IndianRupee, Loader2, Check, AlertTriangle,
  Sparkles, Phone, Send, FileCheck, Ban, PauseCircle, CheckSquare,
  List, Archive, Layers, Edit3, Wrench, UploadCloud, RotateCcw,
  Hash, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, XCircle, Palette, Trash2, FileDown
} from "lucide-react";
import ColumnPicker from "@/components/common/ColumnPicker";
import axios from "axios";
import Swal from "sweetalert2";
import NewDispatch from "../newDispatch/NewDispatch";
import { printerService } from "@/lib/services/api";
import AppearanceModal from "@/components/common/AppearanceModal";

import {
  API_BASE_URL, getAuthHeaders, UPDATE_STATUS_OPTIONS, FILTER_OPTIONS,
  normalizeSerial, getBatchKey, getItemSerial,
  isItemReturned, calculateBatchFinancials,
  resolveDisplayStatus, safeFormatDate, isInstallationRequired, isHoldStatus,
  getWarrantyExpiryDate,
} from "./helpers";
import { StatusBadge, StatusTimeline } from "./parts";
import { useToast } from "@/lib/client/ToastContext";
import OrderDetailModal from "./OrderDetailModal";
import ConfirmDraftModal from "./ConfirmDraftModal";
import OrderExportModal from "./OrderExportModal";
import DayFilterSelect from "@/components/common/DayFilterSelect";
import { getDayFilterRange, isWithinDayFilter } from "@/lib/client/dayFilter";
import { ordersService } from "@/lib/services/ordersService";
import { platformsService } from "@/lib/services/platformsService";
import { contractsService } from "@/lib/services/contractsService";

// #, Order ID, and Action stay pinned (always shown) — everything else here
// can be hidden via the Columns picker in the table toolbar.
const TOGGLABLE_COLUMNS = [
  { key: "platform", label: "Platform" },
  { key: "items", label: "Items" },
  { key: "orderDate", label: "Order Date" },
  { key: "lastDelivery", label: "Last Delivery" },
  { key: "warranty", label: "Warranty Till" },
  { key: "gemUpload", label: "Upload on GeM" },
  { key: "contact", label: "Contact No." },
  { key: "orderValue", label: "Order Value" },
  { key: "status", label: "Status / Reason" },
  { key: "billing", label: "Billing / Dispatch" },
];

export default function OrderTracking({
  orders = [],
  onRefresh,
  models = [],
  serials = [],
  returns: propReturns = [],
  currentUser = null,
  isAdmin,
  isSupervisor,
  focusOrderId = null,
  onFocusHandled,
  catalogLoaded = false,
  returnsLoaded = false,
  initialDayFilter = "all",
  initialCustomStart = "",
  initialCustomEnd = "",
}) {
  const [activeTab, setActiveTab] = useState("active"); // ✅ Updated: "active" | "hold" | "completed" | "cancelled"
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [isCreating, setIsCreating] = useState(false);
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dayFilter, setDayFilter] = useState(initialDayFilter);
  const [customStart, setCustomStart] = useState(initialCustomStart);
  const [customEnd, setCustomEnd] = useState(initialCustomEnd);
  const [appearanceModalOpen, setAppearanceModalOpen] = useState(false);
  const [appearanceItem, setAppearanceItem] = useState(null);
  const [isRefreshingOrders, setIsRefreshingOrders] = useState(false);

  const openAppearanceModal = (e, item) => {
    e.stopPropagation();
    setAppearanceItem(item);
    setAppearanceModalOpen(true);
  };
  // Confirming a draft happens via View → Update Status → "Order Confirmed"
  // (handleUpdateStatus below sets confirmDraftBatch directly when it
  // detects that transition), not a standalone row button.
  const [confirmDraftBatch, setConfirmDraftBatch] = useState(null);
  const handleConfirmDraft = async (payload) => {
    const orderGuid = confirmDraftBatch.items[0]?._orderId || confirmDraftBatch.items[0]?.orderId || confirmDraftBatch.id;
    await ordersService.confirmDraftOrder(orderGuid, payload);
    // Optimistic update — confirm replaces the draft's order_items rows with
    // new ones server-side, but until onRefresh's fetch lands, localOrders
    // still holds the old rows with status "Draft". Without this, the batch
    // stays stuck under the Draft tab (and missing from Active) until the
    // background refresh happens to complete.
    setLocalOrders((prev) =>
      prev.map((o) => (String(o._orderId) === String(orderGuid) || String(o.id) === String(orderGuid)) ? { ...o, status: "Order Confirmed" } : o)
    );
    setConfirmDraftBatch(null);
    closeModal();
    if (onRefresh) await onRefresh();
    showToast("Order confirmed and moved to active orders.", "success");
  };
  const [statusFilter, setStatusFilter] = useState("All");
  const [platformOptions, setPlatformOptions] = useState([]);
  useEffect(() => {
    platformsService.getPlatforms().then(setPlatformOptions);
  }, []);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [highlightedBatchId, setHighlightedBatchId] = useState(null);
  const rowRefs = useRef({});
  const canCreateOrder = currentUser?.role === 'Admin' || !!currentUser?.allow_create_order;
  const canEditOrder = currentUser?.role === 'Admin' || !!currentUser?.allow_edit_order_processing;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDetailTab, setModalDetailTab] = useState("details"); // "details" | "documents" | "actions"
  const [isEditMode, setIsEditMode] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [billingLoadingId, setBillingLoadingId] = useState(null);
  const [restoringBatchKey, setRestoringBatchKey] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [editFormData, setEditFormData] = useState({});
  const [editItems, setEditItems] = useState([]);
  const [replacingItemId, setReplacingItemId] = useState(null);
  const [replaceWithSerialId, setReplaceWithSerialId] = useState("");
  const [platformFilter, setPlatformFilter] = useState("All"); // ✅ New: Platform filter

  // ── Column visibility ──────────────────────────────────────────────────────
  const [visibleCols, setVisibleCols] = useState(() => new Set(TOGGLABLE_COLUMNS.map((c) => c.key)));
  const toggleCol = (key) =>
    setVisibleCols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const selectAllCols = () => setVisibleCols(new Set(TOGGLABLE_COLUMNS.map((c) => c.key)));
  const clearAllCols = () => setVisibleCols(new Set());

  // ── Bulk "Save as Contract" (multi-select) ────────────────────────────────
  const [savedContractOrderIds, setSavedContractOrderIds] = useState(new Set());
  const [isContractSelectMode, setIsContractSelectMode] = useState(false);
  const [selectedContractBatchKeys, setSelectedContractBatchKeys] = useState([]);
  const [savingContractsBulk, setSavingContractsBulk] = useState(false);

  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [paymentEditForm, setPaymentEditForm] = useState({ paymentDate: "", amount: "", utrId: "" });
  const [contractFile, setContractFile] = useState(null);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  // ── Add a serial to an existing order (edit mode) ────────────────────────────
  const [isAddingSerial, setIsAddingSerial] = useState(false);
  const [newSerialToAdd, setNewSerialToAdd] = useState("");
  const [newItemSellingPrice, setNewItemSellingPrice] = useState("");
  // ── Additional / custom document upload ──────────────────────────────────────
  const [extraDocFile, setExtraDocFile] = useState(null);
  const [extraDocType, setExtraDocType] = useState("Inspection Certificate");
  const [extraDocCustomLabel, setExtraDocCustomLabel] = useState("");
  const [uploadingExtraDoc, setUploadingExtraDoc] = useState(false);
  const extraDocInputRef = React.useRef(null);
  const [localOrders, setLocalOrders] = useState(orders);
  const canEditPayment = isAdmin || !!currentUser?.allow_edit_billing;
  const [localModels, setLocalModels] = useState(Array.isArray(models) ? models : []);
  const [localSerials, setLocalSerials] = useState(Array.isArray(serials) ? serials : []);
  const [loadingDispatchData, setLoadingDispatchData] = useState(false);
  const [returns, setReturns] = useState([]);
  const [globalTags, setGlobalTags] = useState([]);

  useEffect(() => { setLocalOrders(orders); }, [orders]);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const data = await printerService.getGlobalTags();
        setGlobalTags(data.printer || []);
      } catch (err) {
        console.error("Failed to fetch global tags in OrderTracking", err);
      }
    };
    fetchTags();
  }, []);
  useEffect(() => {
    if (catalogLoaded) {
      setLocalModels(Array.isArray(models) ? models : []);
    } else if (Array.isArray(models) && models.length > 0) {
      setLocalModels(models);
    }
  }, [catalogLoaded, models]);

  useEffect(() => {
    if (catalogLoaded) {
      setLocalSerials(Array.isArray(serials) ? serials : []);
    } else if (Array.isArray(serials) && serials.length > 0) {
      setLocalSerials(serials);
    }
  }, [catalogLoaded, serials]);
  useEffect(() => {
    setStatusFilter("All");
    setPlatformFilter("All"); // ✅ Reset platform filter
    setSearchTerm("");
  }, [activeTab]);

  // Guards against re-fetching forever: this effect calls setLocalModels/
  // setLocalSerials, which used to also be in its own dependency array — an
  // empty (but non-null) result from either fetch created a new array
  // reference every time, re-triggering the effect, re-fetching, and
  // looping indefinitely. A ref instead of the state itself ensures this
  // only ever runs once per mount (or once per catalogLoaded flip).
  const dispatchDataFetchAttempted = useRef(false);
  useEffect(() => {
    let mounted = true;
    const loadDispatchData = async () => {
      const hasLocalModels = Array.isArray(localModels) && localModels.length > 0;
      const hasLocalSerials = Array.isArray(localSerials) && localSerials.length > 0;
      if (catalogLoaded || (hasLocalModels && hasLocalSerials) || dispatchDataFetchAttempted.current) return;
      dispatchDataFetchAttempted.current = true;
      try {
        setLoadingDispatchData(true);
        const [modelsRes, serialsRes] = await Promise.all([printerService.getModels(), printerService.getSerials()]);
        if (!mounted) return;
        setLocalModels(Array.isArray(modelsRes) ? modelsRes : Array.isArray(modelsRes?.data) ? modelsRes.data : []);
        setLocalSerials(Array.isArray(serialsRes) ? serialsRes : Array.isArray(serialsRes?.data) ? serialsRes.data : []);
      } catch (error) {
        if (!mounted) return;
        console.error("Failed to load models/serials:", error);
      } finally {
        if (mounted) setLoadingDispatchData(false);
      }
    };
    loadDispatchData();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogLoaded]);

  useEffect(() => {
    let mounted = true;
    const loadReturns = async () => {
      if (returnsLoaded) {
        if (mounted) setReturns(Array.isArray(propReturns) ? propReturns : []);
        return;
      }
      try {
        const data = await printerService.getReturns();
        if (!mounted) return;

        let returnsArray = [];
        if (Array.isArray(data)) returnsArray = data;
        else if (data && Array.isArray(data.data)) returnsArray = data.data;
        else if (data && Array.isArray(data.returns)) returnsArray = data.returns;
        else if (data && Array.isArray(data.results)) returnsArray = data.results;

        setReturns(returnsArray);
      } catch (err) {
        console.warn("Failed to load returns:", err);
        if (mounted) setReturns([]);
      }
    };
    loadReturns();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnsLoaded]); // Remove propReturns to prevent infinite loops

  // Add a separate effect to sync propReturns when it changes and isLoaded is true
  useEffect(() => {
    if (returnsLoaded) {
      setReturns(Array.isArray(propReturns) ? propReturns : []);
    }
  }, [propReturns, returnsLoaded]);

  const toastCtx = useToast();
  const showToast = useCallback((message, type = "info") => toastCtx.show(message, type), [toastCtx]);

  // contracts.contractNumber == orders.orderid is the only link between the
  // two (no FK — see lib/orderToContract.js) — loaded once entering select
  // mode so the checkbox list can exclude orders already saved as a contract.
  const loadSavedContractOrderIds = useCallback(async () => {
    const contracts = await contractsService.getContracts();
    setSavedContractOrderIds(new Set((Array.isArray(contracts) ? contracts : []).map((c) => c.contractNumber).filter(Boolean)));
  }, []);

  const toggleContractSelectMode = () => {
    if (!isContractSelectMode) loadSavedContractOrderIds();
    setIsContractSelectMode((prev) => !prev);
    setSelectedContractBatchKeys([]);
  };

  // One table row ("batch") can bundle items from more than one real order —
  // rows are grouped by firmName+bidNumber (or customerName) via
  // getBatchKey(), which several distinct `orders.guid` rows can share (e.g.
  // repeat dispatches under the same GeM bid). Each { guid, orderid } pair
  // here is one real order the row actually contains.
  const getDistinctOrdersInBatch = (batch) => {
    const map = new Map();
    (batch?.items || []).forEach((item) => {
      const guid = item._orderId || item.orderId;
      if (guid && !map.has(guid)) map.set(guid, { guid, orderid: item.orderid || item.orderId });
    });
    return Array.from(map.values());
  };

  // A row only counts as "already saved" once every real order it contains
  // has a contract — otherwise it's still selectable so the remaining ones
  // can be saved.
  const isBatchFullySaved = (batch) => {
    const orders = getDistinctOrdersInBatch(batch);
    return orders.length > 0 && orders.every((o) => savedContractOrderIds.has(o.orderid));
  };

  // Only GeM orders can be saved as contracts (see lib/orderToContract.js) —
  // Flipkart/Amazon/Other batches shouldn't even be selectable here, since
  // attempting them would just come back as a per-order failure from the
  // bulk save endpoint.
  const isGemBatch = (batch) => String(batch.firmName || "").trim() === "GeM";

  const handleSelectAllContractBatches = (e) => {
    if (e.target.checked) {
      setSelectedContractBatchKeys(
        currentBatches.filter((b) => !isBatchFullySaved(b) && isGemBatch(b)).map((b) => b.batchKey || String(b.id))
      );
    } else {
      setSelectedContractBatchKeys([]);
    }
  };

  const handleSelectOneContractBatch = (batchKey) => {
    setSelectedContractBatchKeys((prev) =>
      prev.includes(batchKey) ? prev.filter((k) => k !== batchKey) : [...prev, batchKey]
    );
  };

  const handleBulkSaveAsContract = async () => {
    const selectedBatchSet = new Set(selectedContractBatchKeys);
    const orderGuids = Array.from(new Set(
      currentBatches
        .filter((b) => selectedBatchSet.has(b.batchKey || String(b.id)))
        .flatMap((b) => getDistinctOrdersInBatch(b).map((o) => o.guid))
    ));
    if (orderGuids.length === 0) return;

    setSavingContractsBulk(true);
    try {
      const result = await contractsService.saveOrdersAsContractBulk(orderGuids);
      showToast(result.message, result.failed?.length > 0 ? "error" : "success");
      await loadSavedContractOrderIds();
      setSelectedContractBatchKeys([]);
      setIsContractSelectMode(false);
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to save selected orders as contracts", "error");
    } finally {
      setSavingContractsBulk(false);
    }
  };

  const getRestoredStatus = useCallback((item) => {
    const currentStatus = String(item?.status || "").trim();
    const logisticsStatus = String(item?.logisticsStatus || "").trim();

    if (currentStatus !== "Order Cancelled") {
      return currentStatus || "Pending";
    }

    if (logisticsStatus === "Delivered") return "Payment Pending";
    if (logisticsStatus) return "Billed";
    return "Pending";
  }, []);

  const groupedBatches = useMemo(() => {
    const groups = {};
    localOrders.forEach((order) => {
      const key = getBatchKey(order);
      if (!groups[key]) {
        groups[key] = {
          batchKey: key,
          id: order.id,
          orderid: order.orderid,
          firmName: order.firmName,
          customerName: order.customerName,
          bidNumber: order.bidNumber,
          shippingAddress: order.shippingAddress,
          buyerAddress: order.buyerAddress,
          dispatchDate: order.dispatchDate,
          status: order.status,
          logisticsStatus: order.logisticsStatus,
          trackingId: order.trackingId,
          contactNumber: order.contactNumber,
          altContactNumber: order.altContactNumber,
          buyerEmail: order.buyerEmail,
          consigneeEmail: order.consigneeEmail,
          paymentAuthorityEmail: order.paymentAuthorityEmail,
          consigneeName: order.consigneeName,
          gstNumber: order.gstNumber,
          orderDate: order.orderDate || order.dispatchDate,
          lastDeliveryDate: order.lastDeliveryDate,
          logisticsDispatchDate: order.logisticsDispatchDate,
          gemOrderType: order.gemOrderType,
          warranty: order.warranty,
          contractFilename: order.contractFilename,
          invoiceNumber: order.invoiceNumber,
          invoiceDate: order.invoiceDate,
          invoiceFilename: order.invoiceFilename,
          ewayBillFilename: order.ewayBillFilename,
          gemBillUploaded: order.gemBillUploaded,
          // Never copied here before — the "Send for Billing" button for a
          // draft order could never switch to "Sent to Billing", even right
          // after a successful send (the API call always succeeded, but
          // batch.draftSentToBilling was always undefined, so it looked like
          // nothing happened and the button stayed clickable forever).
          draftSentToBilling: order.draftSentToBilling,
          podFilename: order.podFilename,
          installationRequired: isInstallationRequired(order.installationRequired) || false,
          paymentReceivedDate: order.paymentReceivedDate,
          paymentReceivedAmount: order.paymentReceivedAmount,
          utrId: order.utrId,
          isDeleted: order.isDeleted,
          dispatchedBy: order.dispatchedBy,
          cancelledBy: order.cancelledBy,
          cancellationReason: order.cancellationReason || order.reason,
          holdReason: order.holdReason || order.reason, // ✅ Added hold reason
          rowColor: order.rowColor, // ✅ NEW: Include row color
          tags: order.tags, // ✅ NEW: Include tags
          documents: order.documents ? [...order.documents] : [],
          dispatches: order.dispatches || [],
          replacements: order.replacements || [],
          items: [],
        };
      } else {
        if (order.documents && order.documents.length > 0) {
          order.documents.forEach(doc => {
            if (!groups[key].documents.some(d => d.filename === doc.filename)) {
              groups[key].documents.push(doc);
            }
          });
        }
      }
      groups[key].items.push(order);
      if (!groups[key].orderDate && order.orderDate) groups[key].orderDate = order.orderDate;
      if (!groups[key].lastDeliveryDate && order.lastDeliveryDate) groups[key].lastDeliveryDate = order.lastDeliveryDate;
      if (isInstallationRequired(order.installationRequired)) groups[key].installationRequired = true;
      if (!groups[key].ewayBillFilename && order.ewayBillFilename) {
        groups[key].ewayBillFilename = order.ewayBillFilename;
      }
      if (!groups[key].gemBillUploaded && order.gemBillUploaded) {
        groups[key].gemBillUploaded = order.gemBillUploaded;
      }
      if (!groups[key].cancellationReason && (order.cancellationReason || order.reason)) {
        groups[key].cancellationReason = order.cancellationReason || order.reason;
      }
      if (!groups[key].holdReason && (order.holdReason || order.reason)) {
        groups[key].holdReason = order.holdReason || order.reason;
      }
    });
    return Object.values(groups).sort((a, b) => new Date(b.dispatchDate || 0) - new Date(a.dispatchDate || 0));
  }, [localOrders]);

  const dayRange = useMemo(() => getDayFilterRange(dayFilter, customStart, customEnd), [dayFilter, customStart, customEnd]);

  const filteredBatches = useMemo(() => {
    return groupedBatches.map(batch => {
      const financials = calculateBatchFinancials(batch.items, returns);

      // Determine aggregate batch state so mixed items (e.g. partial replacements) stay active
      const activeItems = batch.items.filter(i => !isItemReturned(i, returns) && String(i.status).trim() !== "Order Cancelled" && !i.isDeleted);
      const isCancelled = batch.items.every(i => String(i.status).trim() === "Order Cancelled" || i.isDeleted || isItemReturned(i, returns)) && batch.items.some(i => String(i.status).trim() === "Order Cancelled" || i.isDeleted);
      const isHold = activeItems.some(i => isHoldStatus(String(i.status).trim()));
      const isCompleted = activeItems.length > 0 && activeItems.every(i => String(i.status).trim() === "Completed");

      return { ...batch, financials, activeItems, isCancelled, isHold, isCompleted };
    }).filter((batch) => {
      const hasReturns = batch.financials.returnedCount > 0;
      const hasActive = batch.activeItems.length > 0;

      if (!isWithinDayFilter(batch.dispatchDate || batch.orderDate, dayRange)) return false;

      const term = searchTerm.toLowerCase().trim();

      // ✅ SKIP tab filtering if searching (Global Search)
      if (!term) {
        const isDraft = batch.status === "Draft";
        // Draft orders normally live only under their own tab — but "Pending"
        // is meant to be a catch-all for "hasn't moved yet", and a Draft
        // order that hasn't been confirmed is exactly that, so let it
        // through into Active when that's the status being filtered for.
        const showDraftUnderPending = activeTab === "active" && statusFilter === "Pending" && isDraft;
        if (activeTab === "active" && (!hasActive || batch.isCompleted || batch.isCancelled || batch.isHold || (isDraft && !showDraftUnderPending))) return false;
        if (activeTab === "returned" && !hasReturns) return false;
        if (activeTab === "hold" && !batch.isHold) return false;
        if (activeTab === "completed" && !batch.isCompleted) return false;
        if (activeTab === "cancelled" && !batch.isCancelled) return false;
        if (activeTab === "draft" && !isDraft) return false;
      }

      if (term) {
        const matchesSearch =
          (batch.customerName || "").toLowerCase().includes(term) ||
          (batch.firmName || "").toLowerCase().includes(term) ||
          (batch.bidNumber || "").toLowerCase().includes(term) ||
          (batch.contactNumber || "").toLowerCase().includes(term) ||
          (batch.altContactNumber || "").toLowerCase().includes(term) ||
          (batch.buyerEmail || "").toLowerCase().includes(term) ||
          (batch.consigneeEmail || "").toLowerCase().includes(term) ||
          (batch.paymentAuthorityEmail || "").toLowerCase().includes(term) ||
          (batch.consigneeName || "").toLowerCase().includes(term) ||
          (batch.gstNumber || "").toLowerCase().includes(term) ||
          (batch.shippingAddress || "").toLowerCase().includes(term) ||
          (batch.trackingId || "").toLowerCase().includes(term) ||
          String(batch.id).includes(term) ||
          batch.items.some((i) =>
            normalizeSerial(getItemSerial(i)).includes(term.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase()) ||
            (i.warranty || "").toLowerCase().includes(term) ||
            (i.modelName || i.model || "").toLowerCase().includes(term)
          );
        if (!matchesSearch) return false;
      }

      // Status filtering (only for active tab)
      if (activeTab === "active" && statusFilter !== "All") {
        if (statusFilter === "Returned") {
          if (!batch.items.some((i) => isItemReturned(i, returns))) return false;
        } else if (statusFilter === "Order On Hold") {
          if (batch.status !== "Order On Hold" && batch.status !== "Order Not Confirmed") return false;
        } else if (statusFilter === "Pending") {
          if (batch.status !== "Pending" && batch.status !== "Draft") return false;
        } else {
          if (batch.status !== statusFilter && batch.logisticsStatus !== statusFilter) return false;
        }
      }

      // ✅ Platform filtering
      if (platformFilter !== "All") {
        const batchFirm = String(batch.firmName || "Other").trim().toLowerCase();
        const filterVal = platformFilter.toLowerCase();
        if (batchFirm !== filterVal) return false;
      }

      return true;
    }).map(batch => {
      let displayItems = batch.items;
      if (activeTab === "active" || activeTab === "hold") displayItems = batch.items.filter(i => !isItemReturned(i, returns));
      if (activeTab === "returned") displayItems = batch.items.filter(i => isItemReturned(i, returns));
      return { ...batch, displayItems };
    });
  }, [groupedBatches, searchTerm, statusFilter, activeTab, returns, platformFilter, dayRange]);

  const totalPages = Math.max(1, Math.ceil(filteredBatches.length / itemsPerPage));

  const currentBatches = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredBatches.slice(start, start + itemsPerPage);
  }, [filteredBatches, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, activeTab, platformFilter]);

  // ✅ Updated stats to include hold & returned
  const stats = useMemo(() => {
    let active = 0, hold = 0, completed = 0, cancelled = 0, returned = 0, draft = 0;
    groupedBatches.forEach((b) => {
      // ✅ Apply platform filter to stats
      if (platformFilter !== "All") {
        const batchFirm = String(b.firmName || "Other").trim().toLowerCase();
        const filterVal = platformFilter.toLowerCase();
        if (batchFirm !== filterVal) return;
      }

      const f = calculateBatchFinancials(b.items, returns);
      const activeItems = b.items.filter(i => !isItemReturned(i, returns) && String(i.status).trim() !== "Order Cancelled" && !i.isDeleted);
      const isCancelled = b.items.every(i => String(i.status).trim() === "Order Cancelled" || i.isDeleted || isItemReturned(i, returns)) && b.items.some(i => String(i.status).trim() === "Order Cancelled" || i.isDeleted);
      const isHold = activeItems.some(i => isHoldStatus(String(i.status).trim()));
      const isCompleted = activeItems.length > 0 && activeItems.every(i => String(i.status).trim() === "Completed");
      const isDraft = b.status === "Draft";

      if (f.returnedCount > 0) returned++;
      if (isDraft) draft++;
      else if (activeItems.length > 0 && !isCompleted && !isCancelled && !isHold) active++;
      if (isHold) hold++;
      if (isCompleted) completed++;
      if (isCancelled) cancelled++;
    });
    return { total: groupedBatches.length, active, hold, completed, cancelled, returned, draft };
  }, [groupedBatches, returns, platformFilter]); // ✅ Added platformFilter

  const handleViewDocument = useCallback((filename) => {
    if (!filename) {
      showToast("Document not uploaded yet", "error");
      return;
    }
    window.open(`${API_BASE_URL}/uploads/${filename}`, "_blank");
  }, [showToast]);

  // Upload a custom / additional document for an order
  const handleUploadExtraDoc = async () => {
    if (!extraDocFile || !selectedBatch) return;
    const docLabel = extraDocType === "Other" ? extraDocCustomLabel.trim() : extraDocType;
    if (!docLabel) { showToast("Please enter a document name", "error"); return; }

    const targetItemId = selectedBatch.items[0]?.id;
    if (!targetItemId) { showToast("Order item not found", "error"); return; }

    setUploadingExtraDoc(true);
    try {
      const result = await printerService.uploadOrderDocument(targetItemId, extraDocFile, docLabel);
      // Optimistically add to the selectedBatch so it shows immediately
      setSelectedBatch(prev => ({
        ...prev,
        documents: [
          ...(prev.documents || []),
          { dispatchId: targetItemId, docType: docLabel, filename: result.filename || extraDocFile.name }
        ]
      }));
      setExtraDocFile(null);
      setExtraDocCustomLabel("");
      if (extraDocInputRef.current) extraDocInputRef.current.value = "";
      showToast(`"${docLabel}" uploaded ✅`, "success");
      onRefresh?.();
    } catch (err) {
      showToast(err.message || "Upload failed ❌", "error");
    } finally {
      setUploadingExtraDoc(false);
    }
  };

  const handleDeleteExtraDoc = async (filename, docType) => {
    if (!filename) return;
    try {
      await printerService.deleteOrderDocument(filename);
      setSelectedBatch(prev => prev ? ({
        ...prev,
        documents: (prev.documents || []).filter(d => d.filename !== filename)
      }) : prev);
      showToast(`"${docType}" deleted`, "success");
      onRefresh?.();
    } catch (err) {
      showToast(err.message || "Failed to delete document", "error");
    }
  };

  // Replaces one of the standard, single-slot documents (GeM Contract,
  // Invoice, POD, E-Way Bill) directly from the Audit Documents card —
  // unlike custom/"Additional" docs, these are tracked by a single filename
  // column (orders.invoiceFilename etc., updated server-side in
  // app/api/orders/[id]/upload/route.js), so the optimistic update here has
  // to set that field on selectedBatch/localOrders, not just append to
  // `documents`.
  const STANDARD_DOC_FIELD = { gemContract: "contractFilename", invoice: "invoiceFilename", pod: "podFilename", ewayBill: "ewayBillFilename" };
  const handleReplaceStandardDoc = async (docType, newFile) => {
    if (!newFile || !selectedBatch) return;
    const targetItemId = selectedBatch.items[0]?.id;
    if (!targetItemId) { showToast("Order item not found", "error"); return; }
    const field = STANDARD_DOC_FIELD[docType];

    try {
      const result = await printerService.uploadOrderDocument(targetItemId, newFile, docType);
      const filename = result.filename || newFile.name;
      setSelectedBatch((prev) => prev ? { ...prev, [field]: filename } : prev);
      setLocalOrders((prev) => prev.map((o) => (selectedBatch.items.some((bi) => bi.id === o.id) ? { ...o, [field]: filename } : o)));
      showToast(`${docType === "gemContract" ? "GeM Contract" : docType === "pod" ? "POD" : docType === "ewayBill" ? "E-Way Bill" : "Invoice"} replaced ✅`, "success");
      onRefresh?.();
    } catch (err) {
      showToast(err.message || "Failed to replace document", "error");
    }
  };

  const handleReplaceExtraDoc = async (oldFilename, docType, newFile) => {
    if (!newFile || !selectedBatch) return;
    const targetItemId = selectedBatch.items[0]?.id;
    if (!targetItemId) { showToast("Order item not found", "error"); return; }

    try {
      const result = await printerService.uploadOrderDocument(targetItemId, newFile, docType);
      setSelectedBatch(prev => prev ? ({
        ...prev,
        documents: (prev.documents || []).map(d =>
          d.filename === oldFilename ? { ...d, filename: result.filename || newFile.name } : d
        )
      }) : prev);
      showToast(`"${docType}" replaced ✅`, "success");
      onRefresh?.();
    } catch (err) {
      showToast(err.message || "Failed to replace document", "error");
    }
  };

  const handleSaveItemWarrantyDate = async (itemGuid, date) => {
    if (!itemGuid) return;
    try {
      await printerService.updateItemWarrantyStart(itemGuid, date || null);
      setSelectedBatch(prev => prev ? ({
        ...prev,
        items: prev.items.map(i => i.id === itemGuid ? { ...i, itemWarrantyStartDate: date } : i)
      }) : prev);
      onRefresh?.();
    } catch (err) {
      showToast(err.message || "Failed to save warranty date", "error");
      throw err;
    }
  };

  const handleAddSerial = async () => {
    if (!newSerialToAdd || !selectedBatch) return;
    const orderGuid = selectedBatch.items[0]?._orderId || selectedBatch.items[0]?.orderId;
    if (!orderGuid) { showToast("Order not found", "error"); return; }

    const matched = localSerials.find(s => String(s.guid || s.id) === String(newSerialToAdd));
    if (!matched) { showToast("Selected serial not found", "error"); return; }

    setIsUpdating(true);
    try {
      const result = await printerService.addOrderItem(orderGuid, {
        newSerialId: matched.guid || matched.id,
        sellingPrice: newItemSellingPrice ? Number(newItemSellingPrice) : 0,
        addedBy: currentUser?.username || "Unknown"
      });

      const newItem = result?.item || {
        id: result?.dispatchGuid || result?.id,
        guid: result?.dispatchGuid || result?.id,
        serialGuid: matched.guid || matched.id,
        serialId: matched.guid || matched.id,
        serialValue: matched.value || matched.serialNumber,
        modelId: matched.modelGuid || matched.modelId,
        sellingPrice: newItemSellingPrice ? Number(newItemSellingPrice) : 0,
        _orderId: orderGuid,
        status: selectedBatch.items[0]?.status,
        isDeleted: false
      };

      setLocalOrders(prev => [...prev, newItem]);
      setSelectedBatch(prev => {
        if (!prev) return prev;
        const newItems = [...prev.items, newItem];
        const f = calculateBatchFinancials(newItems, returns);
        let newDisplayItems = newItems;
        if (activeTab === "active" || activeTab === "hold") newDisplayItems = newItems.filter(i => !isItemReturned(i, returns));
        return { ...prev, items: newItems, displayItems: newDisplayItems, financials: f };
      });
      setEditItems(prev => [...prev, newItem]);

      setNewSerialToAdd("");
      setNewItemSellingPrice("");
      setIsAddingSerial(false);
      showToast("Serial added to order!", "success");
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast(err.response?.data?.message || err.message || "Failed to add serial", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSendForBilling = async (batch) => {
    setBillingLoadingId(batch.batchKey);
    try {
      const isHoldTab = activeTab === "hold";
      const status = isHoldTab ? "Send for Billing (Hold)" : "Send for Billing";
      const logisticsStatus = null;

      await Promise.all(batch.items.map((item) => axios.put(`${API_BASE_URL}/api/orders/${item.guid || item.id}/status`, { status, logisticsStatus }, getAuthHeaders())));

      setLocalOrders((prev) => prev.map((o) => batch.items.some((bi) => bi.id === o.id) ? { ...o, status, logisticsStatus } : o));
      showToast("Batch sent for billing!", "success");
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Billing update failed", error);
      showToast("Failed to send for billing", "error");
    } finally {
      setBillingLoadingId(null);
    }
  };

  // Opt-in — a still-Draft order only shows up in Billing's Draft tab once
  // someone explicitly sends it there (app/api/orders/draft/[orderId]/send-to-billing).
  const [sendingDraftToBillingId, setSendingDraftToBillingId] = useState(null);
  const handleSendDraftToBilling = async (batch) => {
    const orderGuid = batch.items[0]?._orderId || batch.items[0]?.orderId || batch.id;
    setSendingDraftToBillingId(batch.batchKey);
    try {
      await ordersService.sendDraftToBilling(orderGuid);
      setLocalOrders((prev) => prev.map((o) => batch.items.some((bi) => bi.id === o.id) ? { ...o, draftSentToBilling: 1 } : o));
      showToast("Draft order sent to Billing's Draft tab.", "success");
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Send draft to billing failed", error);
      showToast(error.response?.data?.message || "Failed to send draft for billing", "error");
    } finally {
      setSendingDraftToBillingId(null);
    }
  };

  const _handleSendBackToBilling = async (batch) => {
    setBillingLoadingId(batch.batchKey);
    try {
      const status = "Send for Billing";
      const logisticsStatus = null;

      await Promise.all(batch.items.map((item) => axios.put(`${API_BASE_URL}/api/orders/${item.guid || item.id}/status`, { status, logisticsStatus }, getAuthHeaders())));

      setLocalOrders((prev) => prev.map((o) => batch.items.some((bi) => bi.id === o.id) ? { ...o, status, logisticsStatus } : o));
      showToast("Batch sent back to Billing!", "success");
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Send back to billing failed", error);
      showToast("Failed to send back to billing", "error");
    } finally {
      setBillingLoadingId(null);
    }
  };

  const _handleSendToDispatch = async (batch) => {
    setBillingLoadingId(batch.batchKey);
    try {
      const status = "Billed";
      const logisticsStatus = "Packing in Process";

      await Promise.all(batch.items.map((item) => axios.put(`${API_BASE_URL}/api/orders/${item.guid || item.id}/status`, { status, logisticsStatus }, getAuthHeaders())));

      setLocalOrders((prev) => prev.map((o) => batch.items.some((bi) => bi.id === o.id) ? { ...o, status, logisticsStatus } : o));
      showToast("Order confirmed and sent to Dispatch!", "success");
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Dispatch update failed", error);
      showToast("Failed to send to dispatch", "error");
    } finally {
      setBillingLoadingId(null);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedBatch || !newStatus) {
      showToast("Please select a status", "error");
      return;
    }
    if (selectedBatch.status === "Draft" && newStatus === "Order Confirmed") {
      setConfirmDraftBatch(selectedBatch);
      return;
    }
    if (newStatus === "Order Cancelled" && !cancellationReason.trim()) {
      showToast("Please enter a cancellation reason.", "error");
      return;
    }
    setIsUpdating(true);
    try {
      let finalStatus = newStatus;
      let finalLogisticsStatus = null;

      const payload = {
        status: finalStatus,
        logisticsStatus: finalLogisticsStatus,
        trackingId,
        reason: newStatus === "Order Cancelled" ? cancellationReason : null,
        cancelledBy: newStatus === "Order Cancelled" ? (currentUser?.username || "Unknown") : null
      };
      await Promise.all(selectedBatch.items.map((item) => axios.put(`${API_BASE_URL}/api/orders/${item.guid || item.id}/status`, payload, getAuthHeaders())));
      showToast(
        newStatus === "Order Cancelled"
          ? "Order cancelled successfully!"
          : newStatus === "Order On Hold" || newStatus === "Order Not Confirmed"
            ? "Order moved to hold!"
            : "Batch status updated!",
        "success"
      );
      setLocalOrders((prev) =>
        prev.map((o) => {
          if (!selectedBatch.items.some((bi) => bi.id === o.id)) return o;
          return {
            ...o,
            status: newStatus,
            trackingId,
            logisticsStatus: newStatus === "Completed" ? "Delivered" : o.logisticsStatus,
            cancellationReason: newStatus === "Order Cancelled" ? cancellationReason : o.cancellationReason
          };
        })
      );
      if (onRefresh) onRefresh();
      closeModal();
    } catch (error) {
      console.error("Update failed", error);
      showToast("Failed to update status", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRestoreBatch = useCallback(async (batch, shouldCloseModal = false) => {
    if (!isAdmin) {
      showToast("Only admin can restore cancelled orders.", "error");
      return;
    }

    if (!batch?.items?.length) {
      showToast("No items found to restore.", "error");
      return;
    }

    const restoreIds = batch.items.map((item) => item.guid || item.id).filter(Boolean);
    if (restoreIds.length === 0) {
      showToast("No valid order IDs found to restore.", "error");
      return;
    }

    setRestoringBatchKey(batch.batchKey || String(batch.id || restoreIds[0]));

    try {
      const result = await printerService.restoreDispatch(restoreIds);
      const restoredIdSet = new Set(restoreIds.map((id) => String(id)));

      setLocalOrders((prev) =>
        prev.map((order) => {
          if (!restoredIdSet.has(String(order.id))) return order;

          return {
            ...order,
            isDeleted: false,
            status: getRestoredStatus(order),
            cancellationReason: null,
            cancelReason: null,
            cancelledBy: null
          };
        })
      );

      if (shouldCloseModal) {
        setModalOpen(false);
        setSelectedBatch(null);
        setIsEditMode(false);
      }

      const successCount = result?.results?.success?.length || restoreIds.length;
      const failedCount = result?.results?.failed?.length || 0;

      if (failedCount > 0) {
        showToast(`Restored ${successCount} item(s). Some failed.`, "info");
      } else {
        showToast("Cancelled order restored successfully!", "success");
      }

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error("Restore failed", error);
      showToast("Failed to restore cancelled order.", "error");
    } finally {
      setRestoringBatchKey(null);
    }
  }, [getRestoredStatus, isAdmin, onRefresh, showToast]);

  const handleToggleInstallation = async (required) => {
    if (!selectedBatch) return;
    setIsUpdating(true);
    try {
      const normalizedRequired = !!required;

      await Promise.all(
        selectedBatch.items.map((item) =>
          printerService.updateDispatch(item.guid || item.id, { installationRequired: normalizedRequired })
        )
      );

      setLocalOrders((prev) =>
        prev.map((o) =>
          selectedBatch.items.some((bi) => bi.id === o.id)
            ? { ...o, installationRequired: normalizedRequired }
            : o
        )
      );

      setSelectedBatch((prev) => ({
        ...prev,
        installationRequired: normalizedRequired,
        items: prev.items.map((i) => ({
          ...i,
          installationRequired: normalizedRequired,
        })),
      }));

      showToast(`Installation ${normalizedRequired ? "enabled" : "disabled"} for batch`, "success");
    } catch {
      showToast("Failed to update installation status", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleGemUpload = async (value) => {
    if (!selectedBatch) return;
    setIsUpdating(true);
    try {
      const newValue = value ? "Yes" : "No";

      await Promise.all(
        selectedBatch.items.map((item) =>
          printerService.updateDispatch(item.guid || item.id, { gemBillUploaded: newValue })
        )
      );

      setLocalOrders((prev) =>
        prev.map((o) =>
          selectedBatch.items.some((bi) => bi.id === o.id)
            ? { ...o, gemBillUploaded: newValue }
            : o
        )
      );

      setSelectedBatch((prev) => ({
        ...prev,
        gemBillUploaded: newValue,
        items: prev.items.map((i) => ({ ...i, gemBillUploaded: newValue })),
      }));

      showToast(`Upload on GeM marked as ${newValue}`, "success");
    } catch {
      showToast("Failed to update GeM upload status", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveEdits = async () => {
    // Validate serials and find their IDs before saving
    for (let item of editItems) {
      // serialsService.getSerials() never sets a `.value` field on its
      // mapped objects — only `.serialNumber` — so comparing against
      // `s.value` here always came back undefined and made every typed
      // serial number look "not found", regardless of validity.
      const matchedSerial = localSerials.find(s => normalizeSerial(s.serialNumber) === normalizeSerial(item.serialValue));
      if (!matchedSerial) {
        showToast(`Serial number ${item.serialValue} not found in inventory!`, "error");
        return;
      }
      const currentSerialId = item.serialNumberId || item.serialGuid || item.serialId;
      if (matchedSerial.status !== "Available" && matchedSerial.id !== currentSerialId && matchedSerial.guid !== currentSerialId) {
        showToast(`Serial ${item.serialValue} is currently ${matchedSerial.status} and cannot be assigned!`, "error");
        return;
      }
      item.newSerialId = matchedSerial.id || matchedSerial.guid;
    }

    setIsUpdating(true);
    try {
      let uploadedContractFilename = selectedBatch.contractFilename;
      if (contractFile) {
        setUploadingContract(true);
        try {
          const formData = new FormData();
          formData.append("file", contractFile);
          formData.append("docType", "gemContract");
          const uploadRes = await axios.post(`${API_BASE_URL}/api/orders/${selectedBatch.items[0].id}/upload`, formData, {
            headers: getAuthHeaders().headers
          });
          uploadedContractFilename = uploadRes.data.filename;
        } catch (uploadErr) {
          console.error("Contract upload failed:", uploadErr);
          showToast("Contract upload failed", "error");
        } finally {
          setUploadingContract(false);
        }
      }

      let uploadedInvoiceFilename = selectedBatch.invoiceFilename;
      if (invoiceFile) {
        setUploadingInvoice(true);
        try {
          const result = await printerService.uploadOrderDocument(selectedBatch.items[0].id, invoiceFile, "invoice");
          uploadedInvoiceFilename = result.filename;
        } catch (uploadErr) {
          console.error("Invoice upload failed:", uploadErr);
          showToast("Invoice upload failed", "error");
        } finally {
          setUploadingInvoice(false);
        }
      }

      await Promise.all(
        editItems.map((item) => {
          const payload = {
            customerName: editFormData.customerName,
            shippingAddress: editFormData.shippingAddress,
            buyerAddress: editFormData.buyerAddress,
            contactNumber: editFormData.contactNumber,
            altContactNumber: editFormData.altContactNumber,
            buyerEmail: editFormData.buyerEmail,
            paymentAuthorityEmail: editFormData.paymentAuthorityEmail,
            consigneeEmail: editFormData.consigneeEmail,
            consigneeName: editFormData.consigneeName,
            gstNumber: editFormData.gstNumber,
            orderDate: editFormData.orderDate,
            lastDeliveryDate: editFormData.lastDeliveryDate,
            gemOrderType: editFormData.gemOrderType,
            bidNumber: editFormData.bidNumber,
            invoiceNumber: editFormData.invoiceNumber,
            invoiceDate: editFormData.invoiceDate,
            warranty: editFormData.warranty,
            sellingPrice: Number(item.sellingPrice) || 0,
            contractFilename: uploadedContractFilename,
            invoiceFilename: uploadedInvoiceFilename,
            serialId: item.newSerialId
          };
          return printerService.updateDispatch(item.guid || item.id, payload);
        })
      );

      showToast("Order updated successfully!", "success");
      setIsEditMode(false);
      setContractFile(null);
      setInvoiceFile(null);
      if (onRefresh) onRefresh();
      closeModal();
    } catch (err) {
      console.error("Save failed:", err);
      showToast("Failed to save changes", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSavePaymentEdit = async () => {
    if (!canEditPayment) {
      showToast("Only Admin or Accountant can update payments", "error");
      return;
    }

    if (!paymentEditForm.amount || !paymentEditForm.utrId) {
      showToast("Please fill all payment details", "error");
      return;
    }
    setIsUpdating(true);
    try {
      const count = selectedBatch.items.length;
      const amountPerItem = (Number(paymentEditForm.amount) / count).toFixed(2);

      await Promise.all(selectedBatch.items.map(item =>
        axios.put(`${API_BASE_URL}/api/orders/${item.guid || item.id}/payment`, {
          paymentDate: paymentEditForm.paymentDate,
          amount: amountPerItem,
          utrId: paymentEditForm.utrId,
          status: "Completed"
        }, getAuthHeaders())
      ));

      showToast("Payment details updated successfully!", "success");

      setLocalOrders(prev => prev.map(o => {
        if (selectedBatch.items.some(bi => bi.id === o.id)) {
          return { ...o, paymentReceivedDate: paymentEditForm.paymentDate, paymentReceivedAmount: amountPerItem, utrId: paymentEditForm.utrId };
        }
        return o;
      }));

      if (onRefresh) onRefresh();
      setIsEditingPayment(false);

      setSelectedBatch(prev => ({
        ...prev, paymentReceivedDate: paymentEditForm.paymentDate, paymentReceivedAmount: amountPerItem, utrId: paymentEditForm.utrId,
        items: prev.items.map(i => ({ ...i, paymentReceivedDate: paymentEditForm.paymentDate, paymentReceivedAmount: amountPerItem, utrId: paymentEditForm.utrId }))
      }));
    } catch (error) {
      console.error("Payment update failed", error);
      showToast("Failed to update payment details", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveSerial = async (dispatchGuid, serialValue) => {
    if (!isAdmin && !currentUser?.allow_edit_dispatch) {
      showToast("Access denied: you don't have permission to edit dispatch", "error");
      return;
    }

    const result = await Swal.fire({
      title: "Remove Serial Number?",
      text: `Are you sure you want to remove serial ${serialValue} from this order? This will make the serial available again.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EF4444",
      cancelButtonColor: "#6B7280",
      confirmButtonText: "Yes, remove it!",
      cancelButtonText: "Cancel"
    });

    if (!result.isConfirmed) return;

    if (!dispatchGuid) {
      showToast("Error: item ID missing — please refresh and try again", "error");
      if (onRefresh) onRefresh();
      return;
    }

    setIsUpdating(true);
    try {
      // Use deleteDispatch to mark as cancelled and make serial available
      const apiResult = await printerService.deleteDispatch([dispatchGuid], "Removed from order manually", currentUser?.username || "Admin");

      if (apiResult?.results?.failed?.length > 0) {
        const spMsg = apiResult?.results?.errors?.[dispatchGuid] || 'Unknown error';
        showToast(`Remove failed: ${spMsg}`, "error");
        if (onRefresh) onRefresh();
        return;
      }

      // Update local state to reflect removal immediately
      setLocalOrders(prev => prev.filter(o => o.id !== dispatchGuid));

      setSelectedBatch(prev => {
        if (!prev) return prev;
        const newItems = (prev.items || []).filter(i => i.id !== dispatchGuid);

        // If no items left in batch, close modal
        if (newItems.length === 0) {
          setModalOpen(false);
          return null;
        }

        const f = calculateBatchFinancials(newItems, returns);
        let newDisplayItems = newItems;
        if (activeTab === "active" || activeTab === "hold") newDisplayItems = newItems.filter(i => !isItemReturned(i, returns));
        if (activeTab === "returned") newDisplayItems = newItems.filter(i => isItemReturned(i, returns));
        if (activeTab === "cancelled") newDisplayItems = newItems.filter(i => i.isDeleted);

        return { ...prev, items: newItems, displayItems: newDisplayItems, financials: f };
      });
      setEditItems(prev => prev.filter(i => i.id !== dispatchGuid && i.guid !== dispatchGuid));

      showToast("Serial removed successfully", "success");
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Removal failed", err);
      showToast("Failed to remove serial", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReplaceSerial = async (dispatchGuid, newSerialId, oldSerialValue) => {
    if (!newSerialId) {
      showToast("Please select a new serial number", "error");
      return;
    }
    setIsUpdating(true);
    try {
      const reasonText = `Replaced returned serial: ${oldSerialValue}`;

      const newSerialObj = localSerials.find(s => s.id === newSerialId || s.guid === newSerialId);
      const newSerialValue = newSerialObj ? newSerialObj.value || newSerialObj.serialNumber : "";

      // 1. Call the new backend replacement endpoint to handle history insertion
      await printerService.replaceOrder(dispatchGuid, {
        oldSerialValue,
        newSerialId: newSerialId,
        newSerialValue,
        reason: reasonText
      });

      setLocalOrders(prev => prev.map(o => {
        if (o.id === dispatchGuid) {
          const nextStatus = "Send for Billing";

          return {
            ...o,
            serialGuid: newSerialId,
            serialId: newSerialId,
            serialValue: newSerialValue,
            serialNumber: newSerialValue,
            status: nextStatus,
            logisticsStatus: null,
            reason: reasonText,
            cancellationReason: reasonText,
            cancelReason: reasonText,
            remarks: reasonText,
            isDeleted: false
          };
        }
        return o;
      }));

      setSelectedBatch(prev => {
        if (!prev) return prev;
        const newItems = prev.items.map(i => {
          if (i.id === dispatchGuid) {
            const nextStatus = "Send for Billing";

            return {
              ...i,
              serialGuid: newSerialId,
              serialId: newSerialId,
              serialValue: newSerialValue,
              serialNumber: newSerialValue,
              status: nextStatus,
              logisticsStatus: null,
              reason: reasonText,
              cancellationReason: reasonText,
              cancelReason: reasonText,
              remarks: reasonText,
              isDeleted: false
            };
          }
          return i;
        });

        const f = calculateBatchFinancials(newItems, returns);
        let targetTab = activeTab;
        if (activeTab === "returned" && f.returnedCount === 0) {
          targetTab = "active";
        }

        let newDisplayItems = newItems;
        if (targetTab === "active" || targetTab === "hold") newDisplayItems = newItems.filter(i => !isItemReturned(i, returns));
        if (targetTab === "returned") newDisplayItems = newItems.filter(i => isItemReturned(i, returns));

        return { ...prev, items: newItems, displayItems: newDisplayItems, financials: f };
      });

      if (activeTab === "returned") {
        setActiveTab("active");
      }

      showToast("Serial replaced successfully!", "success");
      setReplacingItemId(null);
      setReplaceWithSerialId("");
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Replacement failed", err);
      showToast("Failed to replace serial", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const openModal = useCallback((batch) => {
    const normalizedItems = (batch.items || []).map((item) => ({
      ...item,
      installationRequired: isInstallationRequired(item.installationRequired) || false,
    }));
    const normalizedDisplayItems = batch.displayItems || normalizedItems;
    const normalizedFinancials = batch.financials || calculateBatchFinancials(normalizedItems, returns);

    setSelectedBatch({
      ...batch,
      installationRequired: isInstallationRequired(batch.installationRequired) || false,
      items: normalizedItems,
      displayItems: normalizedDisplayItems,
      financials: normalizedFinancials,
    });
    setNewStatus(batch.status || "Pending");
    setTrackingId(batch.trackingId || "");
    setCancellationReason("");
    setIsEditMode(false);
    setContractFile(null);
    setEditFormData({
      customerName: batch.customerName || "",
      shippingAddress: batch.shippingAddress || "",
      buyerAddress: batch.buyerAddress || "",
      contactNumber: batch.contactNumber || "",
      altContactNumber: batch.altContactNumber || "",
      buyerEmail: batch.buyerEmail || "",
      paymentAuthorityEmail: batch.paymentAuthorityEmail || "",
      consigneeEmail: batch.consigneeEmail || "",
      consigneeName: batch.consigneeName || "",
      gstNumber: batch.gstNumber || "",
      orderDate: batch.orderDate ? new Date(batch.orderDate).toISOString().split('T')[0] : "",
      lastDeliveryDate: batch.lastDeliveryDate ? new Date(batch.lastDeliveryDate).toISOString().split('T')[0] : "",
      gemOrderType: batch.gemOrderType || "",
      bidNumber: batch.bidNumber || "",
      invoiceNumber: batch.invoiceNumber || "",
      invoiceDate: batch.invoiceDate ? new Date(batch.invoiceDate).toISOString().split('T')[0] : "",
      warranty: batch.warranty || ""
    });
    setEditItems(JSON.parse(JSON.stringify(normalizedItems)));
    setIsEditingPayment(false);
    setModalOpen(true);
    setReplacingItemId(null);
    setReplaceWithSerialId("");
  }, [returns]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSelectedBatch(null);
    setIsEditMode(false);
    setModalDetailTab("details");
  }, []);

  useEffect(() => {
    if (!focusOrderId) return;

    const normalizedFocusId = String(focusOrderId).trim().toLowerCase();

    const targetBatch = groupedBatches.find((batch) => {
      const batchIdMatch = String(batch.id).trim().toLowerCase() === normalizedFocusId;
      const batchCustomerName = String(batch.customerName || '').trim().toLowerCase();
      const batchCustomerMatch = batchCustomerName === normalizedFocusId;
      const itemMatch = batch.items.some((item) =>
        String(item.dispatchGuid || item.id || '').trim().toLowerCase() === normalizedFocusId
      );
      return batchIdMatch || batchCustomerMatch || itemMatch;
    });

    if (!targetBatch) {
      if (typeof onFocusHandled === 'function') {
        onFocusHandled();
      }
      return;
    }

    const financials = calculateBatchFinancials(targetBatch.items, returns);
    if (financials.returnedCount > 0) {
      setActiveTab("returned");
    } else if (isHoldStatus(targetBatch.status)) {
      setActiveTab("hold");
    } else if (targetBatch.status === "Completed") {
      setActiveTab("completed");
    } else if (targetBatch.status === "Order Cancelled") {
      setActiveTab("cancelled");
    } else {
      setActiveTab("active");
    }

    setHighlightedBatchId(targetBatch.batchKey || String(targetBatch.id));
    setModalOpen(false);
    setSelectedBatch(null);
    if (typeof onFocusHandled === "function") {
      onFocusHandled();
    }
  }, [focusOrderId, groupedBatches, returns, onFocusHandled]);

  useEffect(() => {
    if (!highlightedBatchId) return;
    const row = rowRefs.current[highlightedBatchId];
    if (row && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedBatchId, activeTab, currentBatches.length]);

  useEffect(() => {
    if (!highlightedBatchId) return;
    const timeout = window.setTimeout(() => {
      setHighlightedBatchId(null);
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [highlightedBatchId]);

  if (isCreating) {
    if (loadingDispatchData) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex items-center gap-3">
            <Loader2 size={22} className="animate-spin text-indigo-600" />
            <span className="text-slate-700 font-semibold">Loading models and serials...</span>
          </div>
        </div>
      );
    }
    return (
      <NewDispatch
        models={localModels}
        serials={localSerials}
        currentUser={currentUser}
        onRefresh={() => {
          if (onRefresh) onRefresh();
          setIsCreating(false);
        }}
        onBack={() => setIsCreating(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24">
      <AppearanceModal
        isOpen={appearanceModalOpen}
        onClose={() => setAppearanceModalOpen(false)}
        item={appearanceItem}
        type="dispatch"
        onUpdated={onRefresh}
      />
      {/* HEADER */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Truck className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">Order Processing</h1>
              <p className="text-sm text-slate-500">Track, manage and dispatch orders</p>
            </div>
          </div>

          {/* ✅ Updated Tabs - Now with 5 tabs including Returned & Hold */}
          <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner flex-wrap">
            <button
              onClick={() => setActiveTab("draft")}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${activeTab === "draft"
                  ? "bg-white text-slate-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
                }`}
            >
              <FileText size={15} /> Draft
              <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full text-xs">
                {stats.draft}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("active")}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${activeTab === "active"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
                }`}
            >
              <List size={15} /> Active
              <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full text-xs">
                {stats.active}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("returned")}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${activeTab === "returned"
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
                }`}
            >
              <RotateCcw size={15} /> Returned
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${stats.returned > 0 ? "bg-orange-100 text-orange-700 animate-pulse" : "bg-orange-100 text-orange-700"
                }`}>
                {stats.returned}
              </span>
            </button>

            {/* ✅ New Hold Tab */}
            <button
              onClick={() => setActiveTab("hold")}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${activeTab === "hold"
                  ? "bg-white text-yellow-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
                }`}
            >
              <PauseCircle size={15} /> On Hold
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${stats.hold > 0
                  ? "bg-yellow-100 text-yellow-700 animate-pulse"
                  : "bg-yellow-100 text-yellow-700"
                }`}>
                {stats.hold}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("completed")}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${activeTab === "completed"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
                }`}
            >
              <Archive size={15} /> Completed
              <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full text-xs">
                {stats.completed}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("cancelled")}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${activeTab === "cancelled"
                  ? "bg-white text-red-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
                }`}
            >
              <XCircle size={15} /> Cancelled
              <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full text-xs">
                {stats.cancelled}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white outline-none"
              placeholder={`Search ${activeTab === "hold" ? "on hold" : activeTab} orders...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Only show status filter for active tab */}
          {activeTab === "active" && (
            <select
              className="border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium min-w-[150px]"
              value={statusFilter}
              onChange={(e) => {
                const value = e.target.value;
                // "On Hold" and "Returned" orders are excluded from the
                // Active tab's own data entirely (they live under their own
                // tabs) — picking them here while staying on Active always
                // showed zero results, so jump to the tab that actually has
                // them instead of just setting a filter that can never match.
                if (value === "Order On Hold") {
                  setActiveTab("hold");
                  setStatusFilter("All");
                  return;
                }
                if (value === "Returned") {
                  setActiveTab("returned");
                  setStatusFilter("All");
                  return;
                }
                setStatusFilter(value);
              }}
            >
              {FILTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          )}

          <DayFilterSelect
            value={dayFilter}
            onChange={setDayFilter}
            customStart={customStart}
            onCustomStartChange={setCustomStart}
            customEnd={customEnd}
            onCustomEndChange={setCustomEnd}
          />

          {/* ✅ New Platform Filter */}
          <select
            className="border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium min-w-[140px]"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
          >
            <option value="All">All Platforms</option>
            {platformOptions.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>

          {canCreateOrder && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center justify-center p-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-200 flex-shrink-0 transition-all hover:-translate-y-0.5 active:translate-y-0"
              title="Create Order"
            >
              <Sparkles size={16} />
            </button>
          )}

          {onRefresh && (
            <button
              onClick={async () => {
                if (isRefreshingOrders) return;
                setIsRefreshingOrders(true);
                try {
                  await onRefresh();
                  showToast("Orders refreshed.", "success");
                } catch (err) {
                  // onRefresh (AppDataContext's refreshData) already swallows
                  // its own fetch failures internally and just logs them —
                  // this catch is only for anything unexpected escaping that,
                  // so a broken refresh is never silent again.
                  console.error("Refresh failed:", err);
                  showToast(err?.message || "Failed to refresh orders", "error");
                } finally {
                  setIsRefreshingOrders(false);
                }
              }}
              disabled={isRefreshingOrders}
              className="flex items-center justify-center p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 flex-shrink-0 disabled:opacity-60"
              title="Refresh orders"
            >
              <RefreshCw size={16} className={isRefreshingOrders ? "animate-spin" : ""} />
            </button>
          )}

          <button
            onClick={() => setShowExportPicker(true)}
            className="flex items-center justify-center p-2.5 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 flex-shrink-0"
            title="Export orders to Excel"
          >
            <FileDown size={16} />
          </button>

          <ColumnPicker
            columns={TOGGLABLE_COLUMNS}
            visibleCols={visibleCols}
            onToggle={toggleCol}
            onSelectAll={selectAllCols}
            onClearAll={clearAllCols}
          />

          {canEditOrder && (
            <button
              onClick={toggleContractSelectMode}
              className={`flex items-center justify-center p-2.5 rounded-xl flex-shrink-0 ${
                isContractSelectMode ? "bg-slate-800 text-white" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              }`}
              title={isContractSelectMode ? "Cancel selection" : "Select orders to save as Contracts"}
            >
              {isContractSelectMode ? <X size={16} /> : <CheckSquare size={16} />}
            </button>
          )}
        </div>
      </div>

      {showExportPicker && (
        <OrderExportModal
          dayRange={dayRange}
          onClose={() => setShowExportPicker(false)}
        />
      )}

      {/* TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className={`border-b border-slate-200 px-4 py-3 flex items-center gap-2 ${activeTab === "completed"
            ? "bg-emerald-50/50"
            : activeTab === "cancelled"
              ? "bg-red-50/50"
              : activeTab === "returned"
                ? "bg-orange-50/50"
                : activeTab === "hold"
                  ? "bg-yellow-50/50"
                  : "bg-slate-50"
          }`}>
          <span className={`text-xs font-bold uppercase ${activeTab === "completed"
              ? "text-emerald-700"
              : activeTab === "cancelled"
                ? "text-red-700"
                : activeTab === "returned"
                  ? "text-orange-700"
                  : activeTab === "hold"
                    ? "text-yellow-700"
                    : activeTab === "draft"
                      ? "text-slate-600"
                      : "text-slate-500"
            }`}>
            {activeTab === "active"
              ? "Ongoing Orders"
              : activeTab === "returned"
                ? "Returned Items"
                : activeTab === "hold"
                  ? "Orders On Hold"
                  : activeTab === "completed"
                    ? "Completed Order History"
                    : activeTab === "draft"
                      ? "Draft Orders"
                      : "Cancelled Orders"}
          </span>
          <span className="text-xs font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
            {filteredBatches.length}
          </span>
          {/* ✅ Show alert for hold tab */}
          {activeTab === "hold" && stats.hold > 0 && (
            <span className="text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full ml-2 flex items-center gap-1">
              <AlertCircle size={10} /> Requires Attention
            </span>
          )}
        </div>

        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {isContractSelectMode && (
                  <th className="w-10 p-3 text-center">
                    <input
                      type="checkbox"
                      onChange={handleSelectAllContractBatches}
                      checked={
                        currentBatches.some((b) => !isBatchFullySaved(b) && isGemBatch(b)) &&
                        currentBatches.filter((b) => !isBatchFullySaved(b) && isGemBatch(b)).every((b) => selectedContractBatchKeys.includes(b.batchKey || String(b.id)))
                      }
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                )}
                <th className="p-4 w-10 text-center text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap">#</th>
                <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap">Order ID</th>
                {visibleCols.has("platform") && <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap">Platform</th>}
                {visibleCols.has("items") && <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap text-center">Items</th>}
                {visibleCols.has("orderDate") && <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap text-center">Order Date</th>}
                {visibleCols.has("lastDelivery") && <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap text-center">Last Delivery</th>}
                {visibleCols.has("warranty") && <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap text-center">Warranty Till</th>}
                {visibleCols.has("gemUpload") && <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap text-center">Upload on GeM</th>}
                {visibleCols.has("contact") && <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap">Contact No.</th>}
                {visibleCols.has("orderValue") && <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap text-center">Order Value</th>}
                {visibleCols.has("status") && (
                  <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap">
                    {activeTab === "cancelled" ? "Reason" : activeTab === "hold" ? "Hold Status" : "Live Status"}
                  </th>
                )}
                {visibleCols.has("billing") && activeTab === "active" && <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap text-center">Billing / Dispatch</th>}
                {visibleCols.has("billing") && activeTab === "draft" && <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap text-center">Billing</th>}
                <th className="p-4 text-xs uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap text-center">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {currentBatches.length > 0 ? (
                currentBatches.map((batch, index) => {
                  const showBillingBtn = batch.status === "Order Confirmed";
                  const isBillingLoading = billingLoadingId === batch.batchKey;
                  const financials = batch.financials;

                  let representativeItem = batch.activeItems.find(i => String(i.status).trim() !== "Completed") || batch.activeItems[0] || batch.items[0];
                  let rawStatus = representativeItem.status;
                  let displayStatus = resolveDisplayStatus(rawStatus);
                  const processingPhases = ["Pending", "Order Confirmed", "Order Not Confirmed", "Send for Billing", "Billing", "Order Cancelled", "Order On Hold", "Returned", "Completed", "Draft"];
                  if (!processingPhases.includes(rawStatus) && !processingPhases.includes(displayStatus) && representativeItem.logisticsStatus) {
                    displayStatus = representativeItem.logisticsStatus;
                  }

                  if (financials.returnedCount > 0 && batch.activeItems.length === 0) {
                    displayStatus = "Returned";
                  } else if (financials.returnedCount > 0 && activeTab === "returned") {
                    displayStatus = "Partially Returned";
                  }

                  const isBulk = batch.displayItems.length > 1;
                  const orderDateFormatted = safeFormatDate(batch.orderDate);
                  const lastDeliveryFormatted = safeFormatDate(batch.lastDeliveryDate);
                  const warrantyExpiryDate = getWarrantyExpiryDate(batch.warranty, batch.dispatchDate || batch.orderDate);
                  const warrantyExpiryFormatted = safeFormatDate(warrantyExpiryDate);
                  const isWarrantyExpired = warrantyExpiryDate && warrantyExpiryDate.getTime() < Date.now();

                  // GeM bill upload pending + Last Delivery within 3 days → highlight row red
                  const isGemUploadDone = batch.gemBillUploaded === "Yes";
                  let gemUploadOverdue = false;
                  if (batch.firmName === "GeM" && !isGemUploadDone && batch.lastDeliveryDate && !batch.isCancelled) {
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const lastDel = new Date(batch.lastDeliveryDate); lastDel.setHours(0, 0, 0, 0);
                    const daysLeft = Math.round((lastDel - today) / (1000 * 60 * 60 * 24));
                    gemUploadOverdue = daysLeft >= 0 && daysLeft <= 3;
                  }
                  const hasReturns = financials.returnedCount > 0;
                  const isCancelled = batch.isCancelled;
                  const isOnHold = batch.isHold;
                  const isRestoreEligible = activeTab === "cancelled" && isCancelled;
                  const isRestoringBatch = restoringBatchKey === (batch.batchKey || String(batch.id));

                  const hasActiveReturns = financials.returnedCount > 0;
                  const hasReplacements = financials.replacedCount > 0;

                  const [colorClass, intensity, colorLabel] = (batch.rowColor || "").split("|");

                  // Parse tags to apply color to row
                  let validTags = [];
                  try {
                    const tags = batch.tags ? JSON.parse(batch.tags) : [];
                    validTags = tags.filter(t => globalTags.some(gt => gt.tagName === t.tagName));
                  } catch (e) { validTags = []; }

                  let tagBgColor = undefined;
                  if (validTags.length > 0) {
                    const [colorHex, tagInt] = validTags[0].tagColor.split("|");
                    const opacityPercent = validTags[0].intensity || parseInt(tagInt) || 15;
                    const opacityHex = Math.round(opacityPercent * 2.55).toString(16).padStart(2, '0');
                    tagBgColor = `${colorHex}${opacityHex}`;
                  }

                  const batchKey = batch.batchKey || String(batch.id);
                  const isHighlighted = highlightedBatchId === batchKey;
                  return (
                    <tr
                      ref={(el) => { if (el) rowRefs.current[batchKey] = el; }}
                      key={batchKey}
                      style={{
                        "--row-opacity": intensity ? parseInt(intensity) / 100 : undefined,
                        backgroundColor: tagBgColor
                      }}
                      className={`group transition-all hover:shadow-md ${!tagBgColor ? (colorClass || (batch.rowColor && !batch.rowColor.includes('|') ? batch.rowColor : 'hover:bg-slate-50')) : ''} ${gemUploadOverdue && !tagBgColor ? "bg-red-100/70" :
                          hasActiveReturns && !tagBgColor ? "bg-red-50/30" :
                          hasReplacements && !tagBgColor ? "bg-indigo-50/20" :
                            isCancelled && !tagBgColor ? "bg-red-50/20" :
                              isOnHold && !tagBgColor ? "bg-yellow-50/30" : ""
                        } ${isHighlighted ? 'ring-2 ring-indigo-400 bg-indigo-50/80' : ''}`}
                    >
                      {isContractSelectMode && (
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {isBatchFullySaved(batch) ? (
                            <span title="Already saved as a contract"><CheckCircle size={15} className="text-emerald-500 inline" /></span>
                          ) : !isGemBatch(batch) ? (
                            <input
                              type="checkbox"
                              disabled
                              title="Only GeM orders can be saved as contracts"
                              className="w-4 h-4 rounded border-slate-300 opacity-40 cursor-not-allowed"
                            />
                          ) : (
                            <input
                              type="checkbox"
                              checked={selectedContractBatchKeys.includes(batchKey)}
                              onChange={() => handleSelectOneContractBatch(batchKey)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          )}
                        </td>
                      )}
                      <td className="p-4 text-center text-slate-400 font-medium text-sm">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      <td className="p-4">
                        <div className="min-w-0">
                          {(batch.firmName === "GeM" || batch.firmName === "Other") && batch.contractFilename ? (
                            <button
                              onClick={() => handleViewDocument(batch.contractFilename)}
                              className={`font-semibold hover:underline text-sm truncate max-w-[180px] flex items-center gap-1 ${isCancelled ? "text-red-600 hover:text-red-800" :
                                  isOnHold ? "text-yellow-700 hover:text-yellow-800" :
                                    "text-indigo-600 hover:text-indigo-800"
                                }`}
                              title="View Contract"
                            >
                              {batch.orderid || batch.customerName || `Order #${batch.id}`}
                              <ExternalLink size={10} className="mb-0.5 flex-shrink-0" />
                            </button>
                          ) : (
                            <div className={`font-semibold text-sm truncate max-w-[180px] ${isCancelled ? "text-red-700" :
                                isOnHold ? "text-yellow-700" :
                                  "text-slate-800"
                              }`}>
                              {batch.orderid || batch.customerName || `Order #${batch.id}`}
                            </div>
                          )}
                          <div className="text-xs text-slate-500 truncate max-w-[180px] flex items-center gap-1">
                            {batch.firmName || "N/A"}
                            {batch.bidNumber && <span className="text-slate-400">• {batch.bidNumber}</span>}
                            {colorLabel && (
                              <span className="ml-1 px-1.5 py-0.5 bg-white/80 text-[10px] font-bold text-slate-700 rounded border border-slate-200 shadow-sm">
                                {colorLabel}
                              </span>
                            )}
                          </div>

                        </div>
                      </td>

                      {visibleCols.has("platform") && (
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${batch.firmName === "GeM" ? "bg-orange-100 text-orange-700" :
                            batch.firmName === "Amazon" ? "bg-yellow-100 text-yellow-700" :
                              batch.firmName === "Flipkart" ? "bg-blue-100 text-blue-700" :
                                "bg-slate-100 text-slate-700"
                          }`}>
                          {batch.firmName === "GeM" && <Building size={10} />}
                          {batch.firmName || "Other"}
                        </span>
                      </td>
                      )}

                      {visibleCols.has("items") && (
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${isBulk
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                            : "bg-slate-50 text-slate-600 border border-slate-100"
                          }`}>
                          <Layers size={11} />
                          {batch.displayItems.length} {batch.displayItems.length === 1 ? "Item" : "Items"}
                        </span>
                        {activeTab === "active" && financials.returnedCount > 0 && (
                          <div className="text-[10px] text-red-600 mt-1 font-bold flex items-center justify-center gap-0.5">
                            <RotateCcw size={8} />
                            {financials.returnedCount} returned
                          </div>
                        )}
                        {financials.replacedCount > 0 && (
                          <div className="text-[10px] text-indigo-600 mt-1 font-bold flex items-center justify-center gap-0.5">
                            <RefreshCw size={8} />
                            {financials.replacedCount} replaced
                          </div>
                        )}
                      </td>
                      )}

                      {visibleCols.has("orderDate") && (
                      <td className="p-4 text-center text-xs text-slate-600 font-mono">
                        {orderDateFormatted || <span className="text-slate-300">—</span>}
                      </td>
                      )}

                      {visibleCols.has("lastDelivery") && (
                      <td className="p-4 text-center text-xs text-slate-600 font-mono">
                        {lastDeliveryFormatted || <span className="text-slate-300">—</span>}
                      </td>
                      )}

                      {visibleCols.has("warranty") && (
                      <td className="p-4 text-center text-xs">
                        {warrantyExpiryFormatted ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-mono text-slate-600">{warrantyExpiryFormatted}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                              isWarrantyExpired ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {isWarrantyExpired ? "EXPIRED" : "ACTIVE"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      )}

                      {visibleCols.has("gemUpload") && (
                      <td className="p-4 text-center">
                        {batch.firmName === "GeM" ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${isGemUploadDone
                              ? "bg-emerald-100 text-emerald-700"
                              : gemUploadOverdue
                                ? "bg-red-600 text-white animate-pulse"
                                : "bg-slate-100 text-slate-500"
                            }`}>
                            {isGemUploadDone ? "Yes" : "No"}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      )}

                      {visibleCols.has("contact") && (
                      <td className="p-4">
                        {batch.contactNumber ? (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Phone size={12} className="text-slate-400" />
                            <span>{batch.contactNumber}</span>
                          </div>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      )}

                      {visibleCols.has("orderValue") && (
                      <td className="p-4 text-center">
                        <div className={`text-xs font-bold ${isCancelled ? "text-red-400 line-through" :
                            hasReturns ? "text-amber-600" :
                              isOnHold ? "text-yellow-600" :
                                "text-emerald-600"
                          }`}>
                          ₹{financials.netValue.toLocaleString()}
                        </div>
                        {financials.returnedValue > 0 && !isCancelled && (
                          <div className="text-[10px] text-red-500 line-through">₹{financials.totalValue.toLocaleString()}</div>
                        )}
                      </td>
                      )}

                      {/* ✅ Show status/reason based on tab */}
                      {visibleCols.has("status") && (
                      <td className="p-4">
                        {activeTab === "cancelled" ? (
                          <div className="max-w-[150px]">
                            <span className="text-xs text-red-600 line-clamp-2">
                              {batch.cancellationReason || batch.items[0]?.cancellationReason || batch.items[0]?.reason || "No reason provided"}
                            </span>
                          </div>
                        ) : activeTab === "hold" ? (
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={displayStatus} size="small" />
                            {representativeItem.logisticsStatus && (
                              <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-0.5 self-start">
                                <Truck size={8} /> {representativeItem.logisticsStatus}
                              </span>
                            )}
                            {(batch.holdReason || batch.items[0]?.reason) && (
                              <span className="text-[10px] text-yellow-600 line-clamp-1 max-w-[120px]">
                                {batch.holdReason || batch.items[0]?.reason}
                              </span>
                            )}
                          </div>
                        ) : activeTab === "draft" ? (
                          <div className="flex flex-col gap-1 items-start">
                            <StatusBadge status={displayStatus} size="small" />
                            {batch.invoiceFilename ? (
                              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-0.5">
                                <CheckCircle size={8} /> Bill Uploaded
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-0.5">
                                Bill Pending
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 items-start">
                            {representativeItem.logisticsStatus ? (
                              <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-0.5">
                                <Truck size={8} /> {representativeItem.logisticsStatus}
                              </span>
                            ) : (
                              <StatusBadge status={displayStatus} size="small" />
                            )}
                            {financials.replacedCount > 0 && (
                              <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 flex items-center gap-0.5">
                                <RefreshCw size={8} /> Replaced
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      )}

                      {visibleCols.has("billing") && activeTab === "active" && (
                        <td className="p-4 text-center">
                          {showBillingBtn ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSendForBilling(batch); }}
                              disabled={isBillingLoading}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-xs shadow-sm transition-all hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              {isBillingLoading && billingLoadingId === batch.batchKey ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                              {isBillingLoading && billingLoadingId === batch.batchKey ? "Sending..." : "Send for Billing"}
                            </button>
                          ) : batch.status === "Order Not Confirmed" || batch.status === "Order On Hold" ? (
                            <span className="text-xs text-yellow-600 font-medium flex items-center justify-center gap-1">
                              <PauseCircle size={14} className="text-yellow-500" />On Hold
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1">
                              <CheckCircle size={14} className="text-slate-300" />Sent
                            </span>
                          )}
                        </td>
                      )}

                      {visibleCols.has("billing") && activeTab === "draft" && (
                        <td className="p-4 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            {batch.draftSentToBilling ? (
                              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                <CheckCircle size={11} className="text-slate-300" /> Sent to Billing
                              </span>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSendDraftToBilling(batch); }}
                                disabled={sendingDraftToBillingId === batch.batchKey}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 font-bold text-xs transition-all disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
                              >
                                {sendingDraftToBillingId === batch.batchKey ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                {sendingDraftToBillingId === batch.batchKey ? "Sending..." : "Send for Billing"}
                              </button>
                            )}
                          </div>
                        </td>
                      )}

                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isRestoreEligible && (
                            <button
                              onClick={() => handleRestoreBatch(batch)}
                              disabled={!isAdmin || isRestoringBatch}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-semibold text-[11px] transition-colors ${isAdmin
                                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
                                } disabled:opacity-60 disabled:cursor-not-allowed`}
                              title={isAdmin ? "Restore cancelled order" : "Admin only"}
                            >
                              {isRestoringBatch ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                              <span className="hidden sm:inline">{isRestoringBatch ? "Restoring" : "Restore"}</span>
                            </button>
                          )}

                          <button
                            onClick={(e) => openAppearanceModal(e, batch)}
                            className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                            title="Appearance & Tags"
                          >
                            <Palette size={14} />
                          </button>

                          <button
                            onClick={() => openModal(batch)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-semibold text-[11px] transition-colors ${activeTab === "cancelled"
                                ? "bg-red-50 text-red-600 hover:bg-red-100"
                                : activeTab === "hold"
                                  ? "bg-yellow-50 text-yellow-600 hover:bg-yellow-100"
                                  : activeTab === "completed"
                                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                    : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                              }`}
                          >
                            <Eye size={12} />
                            <span className="hidden sm:inline">View</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="13" className="p-12 text-center">
                    <Package size={48} className={`mx-auto mb-3 ${activeTab === "completed" ? "text-emerald-200" :
                        activeTab === "cancelled" ? "text-red-200" :
                          activeTab === "returned" ? "text-orange-200" :
                            activeTab === "hold" ? "text-yellow-200" :
                              "text-slate-200"
                      }`} />
                    <p className="text-slate-500 font-medium">
                      {activeTab === "completed"
                        ? "No completed orders found"
                        : activeTab === "returned"
                          ? "No returned orders"
                          : activeTab === "cancelled"
                            ? "No cancelled orders found"
                            : activeTab === "hold"
                              ? "No orders on hold"
                              : activeTab === "draft"
                                ? "No draft orders yet"
                                : "No active orders found"}
                    </p>
                    <p className="text-sm text-slate-400">
                      {activeTab === "hold"
                        ? "Great! All orders are progressing normally"
                        : activeTab === "draft"
                          ? "Create one from a Contract to get started"
                          : "Try different search criteria"}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={`flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-slate-200 gap-3 ${activeTab === "cancelled" ? "bg-red-50/30" :
            activeTab === "completed" ? "bg-emerald-50/30" :
              activeTab === "returned" ? "bg-orange-50/30" :
                activeTab === "hold" ? "bg-yellow-50/30" :
                  "bg-slate-50"
          }`}>
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, filteredBatches.length)}</strong> of <strong>{filteredBatches.length}</strong> entries</span>
            <select
              className="border border-slate-200 rounded-lg p-1 text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-50 border border-transparent hover:border-slate-200"><ChevronLeft size={16} /></button>

            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                  return (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${currentPage === pageNum ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 hover:bg-white hover:border-slate-200 border border-transparent"}`}
                    >
                      {pageNum}
                    </button>
                  );
                } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                  return <span key={i} className="text-slate-400 text-xs">...</span>;
                }
                return null;
              })}
            </div>

            <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-50 border border-transparent hover:border-slate-200"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {isContractSelectMode && selectedContractBatchKeys.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-4 z-50">
          <span className="font-bold text-xs bg-slate-800 px-3 py-1 rounded-full border border-slate-700">{selectedContractBatchKeys.length} Selected</span>
          <button
            onClick={handleBulkSaveAsContract}
            disabled={savingContractsBulk}
            className="flex items-center gap-1.5 text-xs hover:text-indigo-400 transition font-medium disabled:opacity-50"
          >
            {savingContractsBulk ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            {savingContractsBulk ? "Saving..." : "Save as Contracts"}
          </button>
          <button onClick={() => { setSelectedContractBatchKeys([]); setIsContractSelectMode(false); }} className="text-slate-500 hover:text-white transition"><X size={16} /></button>
        </div>
      )}

      {/* ==================== MODAL ==================== */}
      {modalOpen && selectedBatch && (
        <OrderDetailModal
          {...{
            activeTab, canEditOrder, canEditPayment, cancellationReason, closeModal,
            currentUser, editFormData, editItems, extraDocCustomLabel, extraDocFile,
            extraDocInputRef, extraDocType, handleDeleteExtraDoc, handleRemoveSerial,
            handleReplaceExtraDoc, handleReplaceStandardDoc, handleReplaceSerial,
            handleRestoreBatch, handleSaveEdits, handleSavePaymentEdit, handleSaveItemWarrantyDate,
            handleToggleInstallation, handleToggleGemUpload, handleUpdateStatus, handleUploadExtraDoc,
            handleViewDocument, isAdmin, isEditMode, isEditingPayment, isSupervisor, showToast,
            isUpdating, localSerials, localModels, modalDetailTab, newStatus, paymentEditForm,
            replaceWithSerialId, replacingItemId, restoringBatchKey, returns,
            selectedBatch, setCancellationReason, setContractFile, setInvoiceFile, setEditFormData,
            setEditItems, setExtraDocCustomLabel, setExtraDocFile, setExtraDocType,
            setIsEditMode, setIsEditingPayment, setModalDetailTab, setNewStatus,
            setPaymentEditForm, setReplaceWithSerialId, setReplacingItemId,
            setTrackingId, trackingId, uploadingContract, uploadingInvoice, uploadingExtraDoc,
            isAddingSerial, setIsAddingSerial, newSerialToAdd, setNewSerialToAdd,
            newItemSellingPrice, setNewItemSellingPrice, handleAddSerial,
          }}
        />
      )}
      <AppearanceModal
        isOpen={appearanceModalOpen}
        onClose={() => setAppearanceModalOpen(false)}
        item={appearanceItem}
        type="order"
        onUpdated={onRefresh}
      />
      {confirmDraftBatch && (
        <ConfirmDraftModal
          batch={confirmDraftBatch}
          models={localModels}
          serials={localSerials}
          onClose={() => setConfirmDraftBatch(null)}
          onConfirm={handleConfirmDraft}
        />
      )}
    </div>
  );
}

