"use client";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { format } from "date-fns";
import {
  Trash2, X, CheckSquare, Search, AlertCircle,
  RotateCcw, CheckCircle, XCircle, Truck,
  ChevronLeft, ChevronRight, ChevronDown,
  Box, Clock, Phone, UploadCloud, FileText,
  Receipt, MapPin, Info, Banknote, Package,
  Edit2, Save, ExternalLink, User
} from "lucide-react";
import { printerService } from "@/lib/services/api";
import api from "@/lib/client/apiClient";
import AppearanceModal from "@/components/common/AppearanceModal";
import { Palette } from "lucide-react";
import MasterDropdown from "@/components/common/MasterDropdown";
import DayFilterSelect from "@/components/common/DayFilterSelect";
import { getDayFilterRange, isWithinDayFilter } from "@/lib/client/dayFilter";
import { getDeadlineUrgency, DeadlineBadge, StatCard } from "./parts";
import { platformsService } from "@/lib/services/platformsService";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const UPLOADS_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");



const TAB_THEMES = {
  active: {
    container: "border-slate-200",
    head: "bg-slate-50 text-slate-500",
    divider: "divide-slate-100",
    selectedRow: "bg-amber-50",
    hoverRow: "hover:bg-amber-50/30"
  },
  in_transit: {
    container: "border-blue-100",
    head: "bg-blue-50/50 text-slate-500 border-blue-100",
    divider: "divide-blue-50",
    selectedRow: "bg-blue-50",
    hoverRow: "hover:bg-blue-50/50"
  },
  pod_pending: {
    container: "border-amber-100",
    head: "bg-amber-50/50 text-slate-500 border-amber-100",
    divider: "divide-amber-50",
    selectedRow: "bg-amber-50",
    hoverRow: "hover:bg-amber-50/50"
  },
  delivered: {
    container: "border-emerald-100",
    head: "bg-emerald-50/50 text-slate-500 border-emerald-100",
    divider: "divide-emerald-50",
    selectedRow: "bg-emerald-50",
    hoverRow: "hover:bg-emerald-50/50"
  },
  rto: {
    container: "border-rose-100",
    head: "bg-rose-50/50 text-slate-500 border-rose-100",
    divider: "divide-rose-50",
    selectedRow: "bg-rose-50",
    hoverRow: "hover:bg-rose-50/50"
  },
  cancelled: {
    container: "border-red-100",
    head: "bg-red-50/50 text-slate-500 border-red-100",
    divider: "divide-red-50",
    selectedRow: "bg-red-50",
    hoverRow: "hover:bg-red-50/50"
  }
};

function toDateInputValue(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function getUploadFileUrl(filename) {
  const safeFilename = String(filename || "").trim();
  if (!safeFilename) return null;
  return `${UPLOADS_BASE_URL}/uploads/${encodeURIComponent(safeFilename)}`;
}

function getEffectiveDispatchStatus(item) {
  const logStatus = String(item?.logisticsStatus || "").trim();
  if (logStatus) return logStatus;
  const status = String(item?.status || "").trim();
  if (status === "Billed") return "Packing in Process";
  return status;
}

// Helper to generate consistent batch keys just like Order Tracking
const getBatchKey = (item) => {
    const firm = String(item.firmName || "").trim();
    const customer = String(item.customerName || item.customer || "").trim();
    const bid = String(item.bidNumber || "").trim();
    if (bid) return `${firm}__${bid}`;
    if (customer) return `${firm}__${customer}`;
    return `single__${item.guid}`;
};

export default function Dispatch({
  models = [],
  serials = [],
  dispatches = [],
  currentUser = null,
  onUpdate,
  onDelete,
  onRestore,
  onUpdateModel,
  onRefresh,
  isAdmin,
  isSupervisor,
  isAccountant,
  initialDayFilter = "all",
  initialCustomStart = "",
  initialCustomEnd = "",
}) {
  const [activeTabView, setActiveTabView] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  // const [selectedBatch, setSelectedBatch] = useState(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [platformOptions, setPlatformOptions] = useState([]);
  useEffect(() => {
    platformsService.getPlatforms()
      .then(setPlatformOptions)
      .catch((err) => console.error("Failed to load platforms:", err));
  }, []);
  const [dayFilter, setDayFilter] = useState(initialDayFilter);
  const [customStart, setCustomStart] = useState(initialCustomStart);
  const [customEnd, setCustomEnd] = useState(initialCustomEnd);
  const dayRange = useMemo(() => getDayFilterRange(dayFilter, customStart, customEnd), [dayFilter, customStart, customEnd]);
  const [viewOrder, setViewOrder] = useState(null);
  const [showPackagingModal, setShowPackagingModal] = useState(false);
  const [editingModelId, setEditingModelId] = useState(null);
  const [tempCost, setTempCost] = useState("");
  const [tempLength, setTempLength] = useState("");
  const [tempWidth, setTempWidth] = useState("");
  const [tempHeight, setTempHeight] = useState("");
  const [tempWeight, setTempWeight] = useState("");
  const [localModels, setLocalModels] = useState(models);
  const [logisticsBatch, setLogisticsBatch] = useState(null);
  const [isSavingLogistics, setIsSavingLogistics] = useState(false);
  const [isSendingBackToBilling, setIsSendingBackToBilling] = useState(false);
  const [isCreatingShipment, setIsCreatingShipment] = useState(false);
  const [isTrackingShipment, setIsTrackingShipment] = useState(false);
  const [shipmentTrackInfo, setShipmentTrackInfo] = useState(null);
  const [pickupForm, setPickupForm] = useState({ pickupDate: "", pickupTime: "", packageCount: "1" });
  const [isRequestingPickup, setIsRequestingPickup] = useState(false);
  const [pickupResult, setPickupResult] = useState(null);
  const [logisticsForm, setLogisticsForm] = useState({
    dispatchDate: "",
    courierPartner: "",
    trackingId: "",
    freightCharges: "",
    logisticsStatus: "Packing in Process",
    podFile: null,
    existingPodName: "",
    includePackaging: "no",
    packagingCost: "",
    shipmentMode: "B2C",
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState([]);
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [itemsToRestore, setItemsToRestore] = useState([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [appearanceModalOpen, setAppearanceModalOpen] = useState(false);
  const [appearanceItem, setAppearanceItem] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewTitle, setPreviewTitle] = useState("Document Preview");

  const canManage = currentUser?.role === 'Admin' || !!currentUser?.allow_edit_dispatch;

  useEffect(() => {
    setLocalModels(models);
  }, [models]);

  const openAppearanceModal = (e, item) => {
    e.stopPropagation();
    setAppearanceItem(item);
    setAppearanceModalOpen(true);
  };

  const isDeliveredLogisticsLocked = Array.isArray(logisticsBatch)
    && logisticsBatch.length > 0
    && logisticsBatch.every(
      (item) => String(item?.logisticsStatus || "").trim() === "Delivered"
    );

  const getDetails = useCallback((id, item = null) => {
    if (item && item.serialValue) {
      return {
        serial: item.serialValue,
        model: item.modelName || "-",
        company: item.companyName || "-",
        modelGuid: item.modelId || item.modelGuid || null
      };
    }
    if (!id) return { serial: "N/A", model: "-", company: "-", modelGuid: null };
    const lookupId = String(id);
    const s = serials.find((x) => String(x.guid || x.id) === lookupId);
    const m = s ? localModels.find((x) => String(x.guid || x.id) === String(s.modelGuid || s.modelId)) : null;
    return {
      serial: s?.value || s?.serialNumber || s?.serial || "N/A",
      model: m?.name || "-",
      company: m?.company || m?.companyName || "-",
      modelGuid: m?.guid || m?.id
    };
  }, [serials, localModels]);

  const processedData = useMemo(() => {
    if (!dispatches || !Array.isArray(dispatches)) {
      return { active: [], delivered: [], rto: [], cancelled: [], in_transit: [] };
    }
    
    const active = [];
    const delivered = [];
    const rto = [];
    const cancelled = [];
    const in_transit = [];
    const pod_pending = [];

    dispatches.forEach((d) => {
      if (d.status === "Draft") return;

      const isOnHold = d.status === "Order On Hold" || d.status === "Order Not Confirmed";
      if (isOnHold) return;

      const isCancelled = d.isDeleted || d.status === "Order Cancelled";
      const logisticsStatus = getEffectiveDispatchStatus(d);
      const hiddenStatuses = [
        "Order Confirmed",
        "Pending",
        "Send for Billing",
      ];

      if (isCancelled) {
        cancelled.push(d);
      } else if (logisticsStatus === "Delivered" || logisticsStatus === "Completed") {
        delivered.push(d);
      } else if (logisticsStatus === "RTO") {
        rto.push(d);
      } else if (logisticsStatus === "POD Pending") {
        pod_pending.push(d);
      } else if (logisticsStatus === "In Transit") {
        in_transit.push(d);
      } else {
        const hasLogistics = d.logisticsStatus && d.logisticsStatus.trim() !== "";
        if (!hiddenStatuses.includes(d.status) || hasLogistics) {
          active.push(d);
        }
      }
    });

    return { active, delivered, rto, cancelled, in_transit, pod_pending };
  }, [dispatches]);

  const activeDispatches = processedData.active;
  const deliveredDispatches = processedData.delivered;
  const rtoDispatches = processedData.rto;
  const cancelledDispatches = processedData.cancelled;
  const inTransitDispatches = processedData.in_transit;
  const podPendingDispatches = processedData.pod_pending;

  const dashboardStats = useMemo(() => {
    let totalDispatch = 0;
    let readyCount = 0;
    let inTransitCount = 0;
    let deliveredCount = 0;
    let rtoCount = 0;
    let podPendingCount = 0;
    let totalRevenue = 0;
    let totalFreight = 0;
    let totalPackagingCost = 0;
    const statsSourceDispatches = [
      ...activeDispatches,
      ...inTransitDispatches,
      ...deliveredDispatches,
      ...rtoDispatches,
      ...podPendingDispatches
    ];

    const groupedStats = {};
    statsSourceDispatches.forEach((d) => {
      const key = getBatchKey(d);
      if (!groupedStats[key]) groupedStats[key] = [];
      groupedStats[key].push(d);
    });

    const activeSet = new Set(activeDispatches);
    const inTransitSet = new Set(inTransitDispatches);

    Object.values(groupedStats).forEach((group) => {
      const d = group[0];
      if (activeSet.has(d) || inTransitSet.has(d)) totalDispatch++;
      if (d.logisticsStatus === "Ready for Pickup") readyCount++;
      if (d.logisticsStatus === "In Transit") inTransitCount++;
      if (d.logisticsStatus === "Delivered") deliveredCount++;
      if (d.logisticsStatus === "RTO") rtoCount++;
      if (d.logisticsStatus === "POD Pending") podPendingCount++;
      group.forEach(item => {
        totalRevenue += (Number(item.sellingPrice) || 0);
      });
      totalFreight += (Number(d.freightCharges) || 0);
      totalPackagingCost += (Number(d.packagingCost) || 0);
    });

    return { totalDispatch, readyCount, inTransitCount, deliveredCount, rtoCount, podPendingCount, totalRevenue, totalFreight, totalPackagingCost };
  }, [activeDispatches, inTransitDispatches, deliveredDispatches, rtoDispatches, podPendingDispatches]);

  const allGroupedDispatches = useMemo(() => {
    const groups = {};
    // When searching, look across every tab (Active/In Transit/POD Pending/
    // Delivered/RTO/Cancelled) instead of only the currently selected one, so
    // an order shows up no matter which tab it actually belongs to.
    const sourceDispatches = searchTerm.trim()
      ? [...activeDispatches, ...inTransitDispatches, ...podPendingDispatches, ...deliveredDispatches, ...rtoDispatches, ...cancelledDispatches]
      : activeTabView === "delivered"
        ? deliveredDispatches
        : activeTabView === "rto"
          ? rtoDispatches
          : activeTabView === "cancelled"
            ? cancelledDispatches
            : activeTabView === "in_transit"
              ? inTransitDispatches
              : activeTabView === "pod_pending"
                ? podPendingDispatches
                : activeDispatches;

    const filtered = sourceDispatches.filter((d) => {
      const { serial } = getDetails(d.serialNumberId || d.serialNumberGuid || d.serialGuid || d.serialId, d);
      const term = searchTerm.toLowerCase();
      const matchesSearch = (
        (d.firmName || "").toLowerCase().includes(term) ||
        (d.customerName || d.customer || "").toLowerCase().includes(term) ||
        (serial || "").toLowerCase().includes(term) ||
        (d.trackingId || "").toLowerCase().includes(term) ||
        (d.modelName || "").toLowerCase().includes(term)
      );
      const matchesPlatform = platformFilter === "All" || (d.firmName || "Other") === platformFilter;
      const matchesDay = isWithinDayFilter(d.dispatchDate || d.createdAt, dayRange);
      return matchesSearch && matchesPlatform && matchesDay;
    });

    filtered.forEach((d) => {
      const key = getBatchKey(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });

    return Object.values(groups).sort(
      (a, b) => new Date(b[0].dispatchDate || b[0].createdAt || 0) - new Date(a[0].dispatchDate || a[0].createdAt || 0)
    );
  }, [activeDispatches, deliveredDispatches, rtoDispatches, cancelledDispatches, inTransitDispatches, podPendingDispatches, activeTabView, searchTerm, platformFilter, getDetails, dayRange]);

  const totalPages = Math.max(1, Math.ceil(allGroupedDispatches.length / itemsPerPage));

  const currentDispatches = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return allGroupedDispatches.slice(start, start + itemsPerPage);
  }, [allGroupedDispatches, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIndices([]);
  }, [activeTabView, searchTerm]);

  const handleTabChange = (tab) => {
    setActiveTabView(tab);
    setIsSelectionMode(false);
    setSearchTerm("");
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIndices([]);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedIndices(currentDispatches.map((_, index) => index));
    else setSelectedIndices([]);
  };

  const handleSelectOne = (index) => {
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const getSelectedItems = () => {
    return selectedIndices.flatMap((index) => currentDispatches[index]?.map((item) => item.guid) || []);
  };

  const handleViewOrder = (e, group) => {
    e.stopPropagation();
    setViewOrder(group);
  };

  const handleBulkDeleteClick = () => {
    if (!canManage) { alert("🚫 Access Denied."); return; }
    const allIds = getSelectedItems();
    if (allIds.length === 0) return;
    setItemsToDelete(allIds);
    setDeleteReason("");
    setShowDeleteModal(true);
  };

  const handleSingleDeleteClick = (group) => {
    if (!canManage) { alert("🚫 Access Denied."); return; }
    const ids = group.map((item) => item.guid).filter(Boolean);
    if (ids.length === 0) return;
    setItemsToDelete(ids);
    setDeleteReason("");
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteReason.trim()) { alert("⚠️ Please enter a reason for cancellation!"); return; }
    if (!onDelete) return;
    if (!itemsToDelete.length) return;
    setIsDeleting(true);
    try {
      await onDelete(itemsToDelete, deleteReason, currentUser?.username || "Admin");
      setShowDeleteModal(false);
      setSelectedIndices([]);
      setIsSelectionMode(false);
      setItemsToDelete([]);
      setDeleteReason("");
    } catch (error) {
      alert("Failed to delete: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkRestoreClick = () => {
    if (!canManage) { alert("🚫 Access Denied."); return; }
    const allIds = getSelectedItems();
    if (allIds.length === 0) return;
    setItemsToRestore(allIds);
    setShowRestoreModal(true);
  };

  const handleSingleRestoreClick = (group) => {
    if (!canManage) { alert("🚫 Access Denied."); return; }
    const ids = group.map((item) => item.guid).filter(Boolean);
    setItemsToRestore(ids);
    setShowRestoreModal(true);
  };

  const confirmRestore = async () => {
    setIsRestoring(true);
    try {
      if (onRestore) await onRestore(itemsToRestore);
      setShowRestoreModal(false);
      setSelectedIndices([]);
      setIsSelectionMode(false);
    } catch (error) {
      alert("Failed to restore: " + error.message);
    } finally {
      setIsRestoring(false);
    }
  };

  const startEditingModel = (model) => {
    setEditingModelId(model.guid);
    setTempCost(model.packagingCost || "");
    setTempLength(model.packageLength || "");
    setTempWidth(model.packageWidth || "");
    setTempHeight(model.packageHeight || "");
    setTempWeight(model.packageWeight || "");
  };

  const saveModelCost = async (modelGuid) => {
    const apiFunction = onUpdateModel || printerService.onUpdateModel || printerService.updateModel;
    const existingModel = localModels.find(m => (m.guid || m.id) === modelGuid);
    if (apiFunction && existingModel) {
      try {
        const newCost = Number(tempCost);
        const newLength = tempLength === "" ? null : Number(tempLength);
        const newWidth = tempWidth === "" ? null : Number(tempWidth);
        const newHeight = tempHeight === "" ? null : Number(tempHeight);
        const newWeight = tempWeight === "" ? null : Number(tempWeight);
        await apiFunction(modelGuid, {
          ...existingModel,
          packagingCost: newCost,
          packageLength: newLength,
          packageWidth: newWidth,
          packageHeight: newHeight,
          packageWeight: newWeight,
        });
        setLocalModels(prev => prev.map(m => (m.guid || m.id) === modelGuid
          ? { ...m, packagingCost: newCost, packageLength: newLength, packageWidth: newWidth, packageHeight: newHeight, packageWeight: newWeight }
          : m));
        setEditingModelId(null);
      } catch (error) {
        alert("Failed to update model cost: " + error.message);
      }
    }
  };

  const downloadGatepass = async (orderGuid, orderId) => {
    try {
      const res = await api.get(`/gatepass/${orderGuid}`);
      const newWin = window.open('', '_blank');
      if (newWin) {
        newWin.document.open();
        newWin.document.write(res.data);
        newWin.document.close();
      } else {
        alert("Please allow popups to view the gate pass.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to generate gate pass");
    }
  };

  const handleLogisticsClick = (group) => {
    setLogisticsBatch(group);
    setShipmentTrackInfo(null); // clear any tracking result left over from a previously-viewed order
    const firstItem = group[0] || {};
    const savedCost = firstItem.packagingCost ? Number(firstItem.packagingCost) : 0;
    setLogisticsForm({
      dispatchDate: toDateInputValue(firstItem.dispatchDate || firstItem.logisticsDispatchDate),
      courierPartner: firstItem.courierPartner ?? "",
      trackingId: firstItem.trackingId ?? "",
      freightCharges: firstItem.freightCharges ?? "",
      logisticsStatus: firstItem.logisticsStatus ?? "Packing in Process",
      includePackaging: savedCost > 0 ? "yes" : "no",
      packagingCost: savedCost > 0 ? savedCost : "",
      dpodFile: null,
      sendBackRemark: "",
      removeInvoice: false,
      removeEwayBill: false,
      shipmentMode: "B2C",
    });
  };

  const handlePackagingToggle = (e) => {
    if (isDeliveredLogisticsLocked) return;
    const value = e.target.value;
    if (value === "yes") {
      if (logisticsBatch && logisticsBatch.length > 0) {
        const totalBatchCost = logisticsBatch.reduce((sum, item) => {
          const lookupId = String(item.serialNumberId || item.serialNumberGuid || item.serialGuid || item.serialId);
          const s = serials.find((x) => String(x.guid || x.id) === lookupId);
          if (!s) return sum;
          const matchedModel = localModels.find(m => String(m.guid || m.id) === String(s.modelGuid || s.modelId));
          return sum + (matchedModel ? Number(matchedModel.packagingCost || 0) : 0);
        }, 0);
        setLogisticsForm(prev => ({
          ...prev,
          includePackaging: "yes",
          packagingCost: totalBatchCost > 0 ? totalBatchCost : ""
        }));
      } else {
        setLogisticsForm(prev => ({ ...prev, includePackaging: "yes", packagingCost: "" }));
      }
    } else {
      setLogisticsForm(prev => ({ ...prev, includePackaging: "no", packagingCost: "" }));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setLogisticsForm(prev => ({ ...prev, dpodFile: e.target.files[0] }));
    }
  };

  // DB's DELIVERY_PARTNER dropdown option for Delhivery is stored as option_value="delivery"
  // (missing the "h"), so match both spellings to stay correct whichever way it's saved.
  const isDelhiveryCourier = ["delhivery", "delivery"].includes(String(logisticsForm.courierPartner || "").trim().toLowerCase());
  const isPorterCourier = String(logisticsForm.courierPartner || "").trim().toLowerCase() === "porter";

  const handleCreateDelhiveryShipment = async () => {
    const rep = Array.isArray(logisticsBatch) ? logisticsBatch[0] : null;
    if (!rep) { alert("No order selected."); return; }
    // consigneeName is a genuinely optional field on orders (shown elsewhere
    // as `consigneeName || "N/A"`) — customerName is the one that's always
    // populated, so use that as the primary name and consigneeName only as
    // an override when present. Same for shippingAddress vs address.
    const shipName = rep.consigneeName || rep.customerName || rep.customer;
    const shipAddress = rep.shippingAddress || rep.address;
    if (!shipName || !shipAddress || !rep.contactNumber) {
      alert("Order is missing customer name, shipping address, or contact number — cannot create shipment.");
      return;
    }

    // Orders don't store a dedicated pincode field — try to pull a 6-digit
    // Indian pincode out of the free-text shipping address, and if that
    // fails, ask for it directly rather than silently sending a blank pin
    // (Delhivery rejects shipments with no/invalid pincode).
    const pincodeMatch = String(shipAddress || "").match(/\b\d{6}\b/);
    let consigneePincode = pincodeMatch ? pincodeMatch[0] : "";
    if (!consigneePincode) {
      const entered = window.prompt("Could not detect a pincode in the shipping address. Please enter the 6-digit delivery pincode:");
      if (!entered?.trim() || !/^\d{6}$/.test(entered.trim())) {
        alert("A valid 6-digit pincode is required to create a Delhivery shipment.");
        return;
      }
      consigneePincode = entered.trim();
    }

    setIsCreatingShipment(true);
    try {
      const payload = {
        orderId: rep.orderid || rep.id,
        consigneeName: shipName,
        consigneeAddress: shipAddress,
        consigneePincode,
        consigneePhone: rep.contactNumber,
        paymentMode: "Prepaid",
        quantity: logisticsBatch.length,
        productDescription: rep.modelName || "Printer",
      };
      const result = logisticsForm.shipmentMode === "B2B"
        ? await printerService.createB2BShipment(payload)
        : await printerService.createShipment(payload);
      setLogisticsForm((prev) => ({ ...prev, trackingId: result.waybill }));
      alert(`✅ Delhivery ${logisticsForm.shipmentMode} shipment created! Waybill: ${result.waybill}`);
    } catch (error) {
      alert("Failed to create Delhivery shipment: " + (error.response?.data?.message || error.message));
    } finally {
      setIsCreatingShipment(false);
    }
  };

  const handleRequestDelhiveryPickup = async () => {
    if (!pickupForm.pickupDate || !pickupForm.pickupTime) {
      alert("Please choose a pickup date and time.");
      return;
    }
    setIsRequestingPickup(true);
    setPickupResult(null);
    try {
      const result = await printerService.requestPickup({
        pickupDate: pickupForm.pickupDate,
        pickupTime: pickupForm.pickupTime,
        packageCount: Number(pickupForm.packageCount) || 1,
      });
      setPickupResult({ ok: true, message: result.message || "Pickup requested successfully." });
    } catch (error) {
      setPickupResult({ ok: false, message: error.response?.data?.message || error.message });
    } finally {
      setIsRequestingPickup(false);
    }
  };

  const handleTrackDelhiveryShipment = async () => {
    if (!logisticsForm.trackingId?.trim()) { alert("Enter a tracking ID first."); return; }
    setIsTrackingShipment(true);
    setShipmentTrackInfo(null);
    try {
      const info = await printerService.trackShipment(logisticsForm.trackingId.trim());
      setShipmentTrackInfo(info);
    } catch (error) {
      alert("Failed to fetch tracking info: " + (error.response?.data?.message || error.message));
    } finally {
      setIsTrackingShipment(false);
    }
  };

  const handleSaveLogistics = async (e) => {
    e.preventDefault();
    if (isSavingLogistics) return;
    setIsSavingLogistics(true);
    const finalLogisticsStatus = logisticsForm.logisticsStatus;

    const commonUpdateData = isDeliveredLogisticsLocked
      ? { logisticsStatus: finalLogisticsStatus }
      : {
          dispatchDate: logisticsForm.dispatchDate || null,
          courierPartner: logisticsForm.courierPartner || null,
          logisticsDispatchDate: logisticsForm.dispatchDate || null,
          trackingId: logisticsForm.trackingId || null,
          freightCharges: logisticsForm.freightCharges ? Number(logisticsForm.freightCharges) : 0,
          logisticsStatus: finalLogisticsStatus,
          packagingCost: logisticsForm.includePackaging === "yes" ? Number(logisticsForm.packagingCost) : 0
        };

    try {
      if (!logisticsBatch || logisticsBatch.length === 0) return;

      if (finalLogisticsStatus === "Delivered") {
        const missingPOD = logisticsBatch.some(item => !item.podFilename);
        if (missingPOD && !logisticsForm.dpodFile) {
          alert("Please upload the Delivery Proof (POD) before marking as Delivered.");
          return;
        }
      }

      const bulkPayload = logisticsBatch.map((item) => {
        let nextStatus = item.status;
        if (finalLogisticsStatus === "Delivered" && item.status !== "Completed" && item.status !== "Order Cancelled") {
          nextStatus = "Payment Pending";
        }
        return { id: item.guid || item.id, status: nextStatus, ...commonUpdateData };
      });
      if (bulkPayload.length > 1) {
        if (onUpdate) await onUpdate(null, bulkPayload);
      } else {
        if (onUpdate) await onUpdate(bulkPayload[0].id, bulkPayload[0]);
      }

      // Upload Delivery Proof (POD) if a file is attached
      if (logisticsForm.dpodFile) {
        for (const item of bulkPayload) {
          try {
            await printerService.uploadOrderDocument(item.id, logisticsForm.dpodFile, "pod");
          } catch (uploadErr) {
            console.error("Failed to upload POD for", item.id, uploadErr);
          }
        }
        if (onRefresh) onRefresh();
      }

      setLogisticsBatch(null);
    } catch (err) {
      console.error(err);
      alert("Failed to update logistics.");
    } finally {
      setIsSavingLogistics(false);
    }
  };

  const handleSendBackToBilling = async () => {
    if (!logisticsBatch || logisticsBatch.length === 0) return;
    if (!logisticsForm.sendBackRemark?.trim()) {
      alert("Please enter a reason for sending back to billing.");
      return;
    }
    if (isSendingBackToBilling) return;
    setIsSendingBackToBilling(true);

    try {
      const remarks = `Sent back from Dispatch: ${logisticsForm.sendBackRemark.trim()}`;

      const items = logisticsBatch.map((item) => ({
        id: item._orderId || item.orderId || item.guid || item.id,
        cancelReason: remarks
      }));

      await printerService.sendBackToBilling({
        items,
        removeInvoice: false, // Moved to Billing
        removeEwayBill: false // Moved to Billing
      });

      setLogisticsBatch(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      alert("Failed to send back to billing: " + (err.response?.data?.message || err.message));
    } finally {
      setIsSendingBackToBilling(false);
    }
  };

  const checkIsReturned = (item) => {
    if (item.isDeleted && item.cancelReason) return true;
    const lookupId = String(item.serialNumberId || item.serialNumberGuid || item.serialGuid || item.serialId);
    const s = serials.find((x) => String(x.guid || x.id) === lookupId);
    if (s && s.status !== 'Dispatched') return true;
    return false;
  };

  const getRowUrgencyClasses = (group) => {
    const item = group[0];
    if (!item) return "";
    const isCancelled = item.isDeleted || item.status === "Order Cancelled";
    if (isCancelled) return "";
    const finalizedStatuses = ["Delivered", "Completed", "RTO"];
    const currentStatus = getEffectiveDispatchStatus(item);
    if (finalizedStatuses.includes(currentStatus)) return "";
    const deadlineDate = item.lastDeliveryDate;
    if (!deadlineDate) return "";
    const urgency = getDeadlineUrgency(deadlineDate, currentStatus);
    switch (urgency.level) {
      case "overdue": return "bg-red-50 border-l-4 border-l-red-500";
      case "today": return "bg-red-50/70 border-l-4 border-l-red-400";
      case "critical": return "bg-orange-50/70 border-l-4 border-l-orange-400";
      case "warning": return "bg-amber-50/50 border-l-4 border-l-amber-400";
      default: return "";
    }
  };

  const currentTabTheme = TAB_THEMES[activeTabView] || TAB_THEMES.active;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-md shadow-amber-500/25 text-white">
              <Truck size={18} />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Dispatch Dashboard</h1>
          </div>
          <p className="text-sm text-slate-500 font-medium">Manage shipments & track order status</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard icon={Box} label="Dispatch" value={dashboardStats.totalDispatch} color="bg-indigo-50 text-indigo-600" />
        <StatCard icon={Clock} label="Ready for Pickup" value={dashboardStats.readyCount} color="bg-amber-50 text-amber-600" />
        <StatCard icon={Truck} label="In Transit" value={dashboardStats.inTransitCount} color="bg-blue-50 text-blue-600" />
        <StatCard icon={FileText} label="POD Pending" value={dashboardStats.podPendingCount} color="bg-amber-50 text-amber-700" />
        <StatCard icon={CheckCircle} label="Delivered" value={dashboardStats.deliveredCount} color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={RotateCcw} label="RTO" value={dashboardStats.rtoCount} color="bg-red-50 text-red-600" />
        {isAdmin && (
            <StatCard className="col-span-2 md:col-span-2" icon={Banknote} label=" Charges" value={`₹${dashboardStats.totalFreight.toLocaleString("en-IN")}`} color="bg-purple-50 text-purple-600" subText=" Freight Cost" />
        )}
        {(isAdmin || isAccountant || isSupervisor) && (
            <StatCard className="col-span-2 md:col-span-2" icon={Package} label="Cost" value={`₹${dashboardStats.totalPackagingCost.toLocaleString("en-IN")}`} color="bg-pink-50 text-pink-600" subText=" Packaging Cost" />
        )}
        {isAdmin && (
            <div className="col-span-full flex justify-end mt-1">
              <button onClick={() => setShowPackagingModal(true)} className="flex items-center gap-2 bg-pink-50 text-pink-700 px-4 py-2 rounded-xl text-xs font-bold border border-pink-100 hover:bg-pink-100 transition shadow-sm"><Package size={14} />Packaging Cost & Dimensions</button>
            </div>
        )}
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-100">
                  <FileText size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">{previewTitle}</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Verification Mode</p>
                </div>
              </div>
              <button onClick={() => setShowPreview(false)} className="p-2.5 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-all"><X size={24} /></button>
            </div>
            <div className="flex-1 bg-slate-100 overflow-auto p-4 flex justify-center items-center">
              {previewUrl.toLowerCase().endsWith('.pdf') ? (
                <iframe src={`${previewUrl}#toolbar=0`} className="w-full h-full rounded-2xl border-0 shadow-xl bg-white" title="PDF Preview" />
              ) : (
                <img src={previewUrl} alt="Document Preview" className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" onError={(e) => { e.target.src = "https://placehold.co/600x400?text=Preview+Not+Available"; }} />
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50/50">
              <button onClick={() => setShowPreview(false)} className="bg-slate-800 text-white px-10 py-3 rounded-2xl font-black text-sm hover:bg-slate-900 transition-all shadow-lg shadow-slate-200 active:scale-95">Close Preview</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pt-4 border-t border-slate-100">
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl">
          <button onClick={() => handleTabChange("active")} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTabView === "active" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><CheckCircle size={14} /> Active</button>
          <button onClick={() => handleTabChange("in_transit")} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTabView === "in_transit" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><Truck size={14} /> In Transit</button>
          <button onClick={() => handleTabChange("pod_pending")} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTabView === "pod_pending" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><FileText size={14} /> POD Pending{podPendingDispatches.length > 0 ? ` (${podPendingDispatches.length})` : ""}</button>
          <button onClick={() => handleTabChange("delivered")} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTabView === "delivered" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><CheckCircle size={14} /> Delivered</button>
          <button onClick={() => handleTabChange("rto")} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTabView === "rto" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><RotateCcw size={14} /> RTO</button>
          <button onClick={() => handleTabChange("cancelled")} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTabView === "cancelled" ? "bg-white text-red-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><XCircle size={14} /> Cancelled</button>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
          <div className="relative flex-1 md:w-64 group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="w-full border border-slate-200 pl-9 pr-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all shadow-sm" placeholder="Search orders..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
            {searchTerm && <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
          </div>
          <div className="relative">
            <select
              value={platformFilter}
              onChange={(e) => { setPlatformFilter(e.target.value); setCurrentPage(1); }}
              className="appearance-none border border-slate-200 bg-white pl-3 pr-8 py-2.5 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm cursor-pointer"
            >
              <option value="All">All Platforms</option>
              {platformOptions.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <DayFilterSelect
            value={dayFilter}
            onChange={(v) => { setDayFilter(v); setCurrentPage(1); }}
            customStart={customStart}
            onCustomStartChange={setCustomStart}
            customEnd={customEnd}
            onCustomEndChange={setCustomEnd}
          />
          <button onClick={toggleSelectionMode} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${isSelectionMode ? "bg-slate-800 text-white shadow-lg" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm"}`}>{isSelectionMode ? <X size={14} /> : <CheckSquare size={14} />}{isSelectionMode ? "Cancel" : "Select"}</button>
        </div>
      </div>

      <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${currentTabTheme.container}`}>
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-sm">
            <thead className={`text-[10px] uppercase font-bold tracking-wider border-b ${currentTabTheme.head}`}>
              <tr>
                {isSelectionMode && <th className="w-10 p-3 text-center"><input type="checkbox" onChange={handleSelectAll} checked={currentDispatches.length > 0 && selectedIndices.length === currentDispatches.length} className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" /></th>}
                <th className="w-10 p-3 text-center">#</th>
                <th className="p-3 text-left">Order ID</th>
                <th className="p-3 text-left">Platform</th>
                <th className="p-3 text-left">Model</th>
                <th className="p-3 text-center">Order Value</th>
                <th className="p-3 text-center">Dispatch Date</th>
                <th className="p-3 text-center">Last Delivery</th>
                <th className="p-3 text-left">Contact No.</th>
                <th className="p-3 text-left">Status</th>
                {!isSelectionMode && <th className="w-24 p-3 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className={`divide-y ${currentTabTheme.divider}`}>
              {currentDispatches.length === 0 ? (
                <tr><td colSpan="100" className="p-12 text-center text-sm font-medium text-slate-400">No records found.</td></tr>
              ) : (
                currentDispatches.map((group, index) => {
                  const item = group[0];
                  const isMultiple = group.length > 1;
                  const dbModelName = item.modelName;
                  const lookupId = item.serialNumberId || item.serialNumberGuid || item.serialGuid || item.serialId;
                  const { model: calculatedModel } = getDetails(lookupId, item);
                  const displayModel = dbModelName || calculatedModel || "-";
                  const isSelected = selectedIndices.includes(index);
                  // const hasReturnedItems = group.some((groupItem) => checkIsReturned(groupItem));
                  const isCancelled = item.isDeleted || item.status === "Order Cancelled";
                  const totalSellPrice = group.reduce((sum, i) => {
                    const returned = checkIsReturned(i);
                    if (returned) return sum;
                    return sum + (Number(i.sellingPrice) || 0);
                  }, 0);
                  const statusColors = {
                    Delivered: "bg-green-100 text-green-700 border-green-200",
                    Completed: "bg-green-100 text-green-700 border-green-200",
                    RTO: "bg-red-100 text-red-700 border-red-200",
                    "Delivery in Process": "bg-blue-100 text-blue-700 border-blue-200",
                    "Ready for Pickup": "bg-amber-100 text-amber-700 border-amber-200",
                    "Packing in Process": "bg-cyan-100 text-cyan-700 border-cyan-200",
                    "Send for Billing": "bg-indigo-100 text-indigo-700 border-indigo-200",
                    Billed: "bg-emerald-100 text-emerald-700 border-emerald-200",
                    "Order Cancelled": "bg-red-100 text-red-700 border-red-200"
                  };
                  let displayStatus = getEffectiveDispatchStatus(item) || "Packing in Process";
                  if (item.status === "Order Cancelled") displayStatus = "Cancelled";
                  if (displayStatus === "Ready for Dispatch") displayStatus = "Packing in Process";
                  const statusStyle = statusColors[displayStatus] || statusColors[item.status] || "bg-slate-100 text-slate-600";
                  const rowUrgencyClass = getRowUrgencyClasses(group);
                  const deadlineDate = item.lastDeliveryDate;
                  const urgencyInfo = getDeadlineUrgency(deadlineDate, getEffectiveDispatchStatus(item));
                  const selectedRowClass = isCancelled ? TAB_THEMES.cancelled.selectedRow : currentTabTheme.selectedRow;
                  const hoverRowClass = isCancelled ? TAB_THEMES.cancelled.hoverRow : currentTabTheme.hoverRow;
                  const [colorClass, intensity] = (item.rowColor || "").split("|");
                  return (
                    <tr key={index} style={{ "--row-opacity": intensity ? parseInt(intensity) / 100 : undefined }} className={`transition-all ${rowUrgencyClass} ${isSelected ? selectedRowClass : !rowUrgencyClass ? hoverRowClass : (urgencyInfo.level === "overdue" || urgencyInfo.level === "today" ? "hover:bg-red-100/70" : urgencyInfo.level === "critical" ? "hover:bg-orange-100/50" : "hover:bg-amber-100/50")} ${colorClass || (item.rowColor && !item.rowColor.includes('|') ? item.rowColor : '')}`} onClick={() => isSelectionMode && handleSelectOne(index)}>
                      {isSelectionMode && <td className="p-3 text-center"><input type="checkbox" checked={isSelected} onChange={() => handleSelectOne(index)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" /></td>}
                      <td className="p-3 text-center text-slate-400 font-medium">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                      <td className="p-3">
                        <button onClick={(e) => handleViewOrder(e, group)} className={`text-xs font-mono font-bold text-left hover:underline ${isCancelled ? "text-slate-400 line-through" : "text-indigo-600"}`}>{item.customerName || item.customer || "-"}</button>
                      </td>
                      <td className="p-3"><span className={`text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md ${isCancelled ? "line-through text-slate-400 bg-slate-100" : ""}`}>{item.firmName}</span></td>
                      <td className="p-3"><span className="text-xs text-slate-600 font-medium">{isMultiple ? `Multiple (${group.length})` : displayModel}</span></td>
                      <td className="p-3 text-center"><span className={`text-xs font-bold ${isCancelled ? "text-slate-400 line-through" : "text-emerald-600"}`}>₹{totalSellPrice.toLocaleString("en-IN")}</span></td>
                      <td className="p-3 text-center"><span className="text-[11px] text-slate-500 font-mono">{item.dispatchDate ? format(new Date(item.dispatchDate), "dd MMM yyyy") : "-"}</span></td>
                      <td className="p-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[11px] font-mono ${urgencyInfo.level === "overdue" ? "text-red-600 font-bold" : urgencyInfo.level === "today" ? "text-red-600 font-bold" : urgencyInfo.level === "critical" ? "text-orange-600 font-bold" : urgencyInfo.level === "warning" ? "text-amber-600 font-semibold" : "text-slate-500"}`}>{deadlineDate ? format(new Date(deadlineDate), "dd MMM yyyy") : "-"}</span>
                          <DeadlineBadge lastDeliveryDate={deadlineDate} status={getEffectiveDispatchStatus(item)} />
                        </div>
                      </td>
                      <td className="p-3">{item.contactNumber ? <div className="flex items-center gap-1 text-slate-600 text-xs"><Phone size={10} className="text-slate-400" /> {item.contactNumber}</div> : <span className="text-xs text-slate-400">-</span>}</td>
                      <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded border w-fit whitespace-nowrap ${statusStyle}`}>{displayStatus}</span></td>
                      {!isSelectionMode && (
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={(e) => openAppearanceModal(e, item)} className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 rounded-lg transition-all shadow-sm" title="Appearance & Tags"><Palette size={13} /></button>
                            {isCancelled ? (canManage ? <button onClick={(e) => { e.stopPropagation(); handleSingleRestoreClick(group); }} className="flex items-center gap-1 px-2 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition text-[10px] font-bold mx-auto"><RotateCcw size={12} /> Restore</button> : <span className="text-[9px] text-slate-400">Admin</span>) : (
                              <>
                                {canManage && <button onClick={(e) => { e.stopPropagation(); handleLogisticsClick(group); }} title="Update Logistics" className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition"><Truck size={14} /></button>}
                                <button onClick={(e) => { e.stopPropagation(); handleSingleDeleteClick(group); }} title="Soft Delete" className={`p-1.5 rounded-lg transition ${canManage ? "text-slate-400 hover:text-red-500 hover:bg-red-50" : "text-slate-200 cursor-not-allowed"}`} disabled={!canManage}><Trash2 size={14} /></button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50 gap-3">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, allGroupedDispatches.length)}</strong> of <strong>{allGroupedDispatches.length}</strong> entries</span>
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

      {selectedIndices.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-4 z-50">
          <span className="font-bold text-xs bg-slate-800 px-3 py-1 rounded-full border border-slate-700">{selectedIndices.length} Selected</span>
          {activeTabView !== "cancelled" ? <button onClick={handleBulkDeleteClick} className="flex items-center gap-1.5 text-xs hover:text-red-400 transition font-medium"><Trash2 size={14} /> Cancel</button> : <button onClick={handleBulkRestoreClick} className="flex items-center gap-1.5 text-xs hover:text-emerald-400 transition font-medium"><RotateCcw size={14} /> Restore</button>}
          <button onClick={() => { setSelectedIndices([]); setIsSelectionMode(false); }} className="text-slate-500 hover:text-white transition"><X size={16} /></button>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-lg font-bold text-slate-800 mb-2 text-center flex items-center justify-center gap-2"><AlertCircle className="text-red-500" /> Confirm Cancel</h3>
            <textarea className="w-full border p-3 rounded-xl text-sm mb-4 focus:ring-2 focus:ring-red-500 outline-none" rows="2" placeholder="Reason is required..." value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} autoFocus />
            <div className="flex gap-2"><button onClick={() => setShowDeleteModal(false)} className="flex-1 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-600">Keep</button><button onClick={confirmDelete} disabled={isDeleting} className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition flex items-center justify-center gap-2">{isDeleting ? "Cancelling..." : "Cancel Items"}</button></div>
          </div>
        </div>
      )}

      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-lg font-bold text-slate-800 mb-2 text-center">Confirm Restore</h3>
            <div className="flex gap-2"><button onClick={() => setShowRestoreModal(false)} className="flex-1 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-600">Cancel</button><button onClick={confirmRestore} disabled={isRestoring} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">{isRestoring ? "Restoring..." : "Restore"}</button></div>
          </div>
        </div>
      )}

      {showPackagingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4 shrink-0"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Package className="text-pink-500" size={20} /> Packaging Cost & Dimensions</h3><button onClick={() => setShowPackagingModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={18} /></button></div>
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold sticky top-0">
                  <tr>
                    <th className="px-4 py-3">Model Name</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-3 py-3 text-right">L (cm)</th>
                    <th className="px-3 py-3 text-right">W (cm)</th>
                    <th className="px-3 py-3 text-right">H (cm)</th>
                    <th className="px-3 py-3 text-right">Weight (kg)</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localModels.map((model) => {
                    const isEditing = editingModelId === model.guid;
                    return (
                      <tr key={model.guid} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-700">{model.name}</td>
                        <td className="px-4 py-3 text-right font-mono">{isEditing ? <input type="number" className="w-20 border border-indigo-300 rounded px-2 py-1 text-right text-xs focus:ring-2 focus:ring-indigo-500 outline-none" value={tempCost} onChange={(e) => setTempCost(e.target.value)} autoFocus /> : <span className={model.packagingCost > 0 ? "text-pink-600 font-bold" : "text-slate-400"}>₹{Number(model.packagingCost || 0).toLocaleString()}</span>}</td>
                        <td className="px-3 py-3 text-right font-mono">{isEditing ? <input type="number" min="0" step="0.1" className="w-16 border border-indigo-300 rounded px-2 py-1 text-right text-xs focus:ring-2 focus:ring-indigo-500 outline-none" value={tempLength} onChange={(e) => setTempLength(e.target.value)} placeholder="L" /> : <span className={model.packageLength ? "text-slate-700" : "text-slate-300"}>{model.packageLength || "-"}</span>}</td>
                        <td className="px-3 py-3 text-right font-mono">{isEditing ? <input type="number" min="0" step="0.1" className="w-16 border border-indigo-300 rounded px-2 py-1 text-right text-xs focus:ring-2 focus:ring-indigo-500 outline-none" value={tempWidth} onChange={(e) => setTempWidth(e.target.value)} placeholder="W" /> : <span className={model.packageWidth ? "text-slate-700" : "text-slate-300"}>{model.packageWidth || "-"}</span>}</td>
                        <td className="px-3 py-3 text-right font-mono">{isEditing ? <input type="number" min="0" step="0.1" className="w-16 border border-indigo-300 rounded px-2 py-1 text-right text-xs focus:ring-2 focus:ring-indigo-500 outline-none" value={tempHeight} onChange={(e) => setTempHeight(e.target.value)} placeholder="H" /> : <span className={model.packageHeight ? "text-slate-700" : "text-slate-300"}>{model.packageHeight || "-"}</span>}</td>
                        <td className="px-3 py-3 text-right font-mono">{isEditing ? <input type="number" min="0" step="0.1" className="w-16 border border-indigo-300 rounded px-2 py-1 text-right text-xs focus:ring-2 focus:ring-indigo-500 outline-none" value={tempWeight} onChange={(e) => setTempWeight(e.target.value)} placeholder="Wt" /> : <span className={model.packageWeight ? "text-slate-700" : "text-slate-300"}>{model.packageWeight || "-"}</span>}</td>
                        <td className="px-4 py-3 text-right">{isEditing ? <button onClick={() => saveModelCost(model.guid)} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Save size={14} /></button> : <button onClick={() => startEditingModel(model)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Edit2 size={14} /></button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end shrink-0"><button onClick={() => setShowPackagingModal(false)} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold shadow-md">Done</button></div>
          </div>
        </div>
      )}

      {logisticsBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Truck className="text-indigo-600" size={20} /> Update Logistics</h3>
              <button onClick={() => setLogisticsBatch(null)} className="p-2 hover:bg-slate-200 rounded-full transition"><X size={20} className="text-slate-500" /></button>
            </div>
            <form onSubmit={handleSaveLogistics} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Dispatch Date</label>
                  <input type="date" className="w-full border p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={logisticsForm.dispatchDate} onChange={(e) => setLogisticsForm({...logisticsForm, dispatchDate: e.target.value})} disabled={isDeliveredLogisticsLocked} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Courier Partner</label>
                  <MasterDropdown
                    code="DELIVERY_PARTNER"
                    placeholder="Select Partner"
                    value={logisticsForm.courierPartner}
                    onChange={(e) => setLogisticsForm({...logisticsForm, courierPartner: e.target.value})}
                    className="w-full border p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    disabled={isDeliveredLogisticsLocked}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Freight Charges (₹)</label>
                  <input type="number" className="w-full border p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" value={logisticsForm.freightCharges} onChange={(e) => setLogisticsForm({...logisticsForm, freightCharges: e.target.value})} disabled={isDeliveredLogisticsLocked} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Logistics Status</label>
                  <MasterDropdown
                    code="LOGISTICS_STAT"
                    placeholder="Select Status"
                    value={logisticsForm.logisticsStatus}
                    onChange={(e) => setLogisticsForm({...logisticsForm, logisticsStatus: e.target.value})}
                    className="w-full border p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  />
                </div>
              </div>
              {isDelhiveryCourier && !logisticsForm.trackingId && !isDeliveredLogisticsLocked && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Shipment Type</label>
                  <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden">
                    {["B2C", "B2B"].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setLogisticsForm({ ...logisticsForm, shipmentMode: mode })}
                        className={`px-4 py-1.5 text-xs font-bold transition ${
                          logisticsForm.shipmentMode === mode ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {mode === "B2C" ? "B2C (Express)" : "B2B (LTL Freight)"}
                      </button>
                    ))}
                  </div>
                  {logisticsForm.shipmentMode === "B2B" && (
                    <p className="text-[11px] text-amber-600 mt-1">B2B shipment creation isn&apos;t connected yet — needs Delhivery&apos;s B2B waybill API details.</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Tracking ID {isPorterCourier && <span className="text-slate-400 normal-case font-medium">(Optional)</span>}
                </label>
                <div className="flex gap-2">
                  <input type="text" className="w-full border p-2.5 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" placeholder={isPorterCourier ? "Optional for Porter" : "Enter tracking number"} value={logisticsForm.trackingId} onChange={(e) => setLogisticsForm({...logisticsForm, trackingId: e.target.value})} disabled={isDeliveredLogisticsLocked} />
                  {isDelhiveryCourier && (
                    <button
                      type="button"
                      onClick={logisticsForm.trackingId ? handleTrackDelhiveryShipment : handleCreateDelhiveryShipment}
                      disabled={isCreatingShipment || isTrackingShipment || isDeliveredLogisticsLocked}
                      className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                    >
                      {isCreatingShipment ? "Creating..." : isTrackingShipment ? "Tracking..." : logisticsForm.trackingId ? "Track" : `Create ${logisticsForm.shipmentMode} Shipment`}
                    </button>
                  )}
                </div>
                {shipmentTrackInfo && (
                  <div className="mt-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs">
                    <p className="font-bold text-indigo-700">{shipmentTrackInfo.status || "Unknown status"}</p>
                    {shipmentTrackInfo.statusLocation && <p className="text-slate-500">{shipmentTrackInfo.statusLocation}</p>}
                    {shipmentTrackInfo.statusDateTime && <p className="text-slate-400">{shipmentTrackInfo.statusDateTime}</p>}
                  </div>
                )}
              </div>

              {isDelhiveryCourier && logisticsForm.trackingId && !isDeliveredLogisticsLocked && (
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <label className="block text-xs font-bold text-amber-700 mb-2 uppercase tracking-wide flex items-center gap-2">
                    <Truck size={14} /> Request Delhivery Pickup
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="date"
                      className="border p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                      value={pickupForm.pickupDate}
                      onChange={(e) => setPickupForm({ ...pickupForm, pickupDate: e.target.value })}
                    />
                    <input
                      type="time"
                      className="border p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                      value={pickupForm.pickupTime}
                      onChange={(e) => setPickupForm({ ...pickupForm, pickupTime: e.target.value })}
                    />
                    <input
                      type="number"
                      min="1"
                      className="border p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                      placeholder="Packages"
                      value={pickupForm.packageCount}
                      onChange={(e) => setPickupForm({ ...pickupForm, packageCount: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRequestDelhiveryPickup}
                    disabled={isRequestingPickup}
                    className="mt-2 w-full px-3 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {isRequestingPickup ? "Requesting..." : "Request Pickup"}
                  </button>
                  {pickupResult && (
                    <p className={`mt-2 text-xs font-semibold ${pickupResult.ok ? "text-emerald-700" : "text-red-600"}`}>{pickupResult.message}</p>
                  )}
                </div>
              )}

              {logisticsForm.logisticsStatus === "Delivered" && (
                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
                  <label className="block text-xs font-bold text-orange-700 mb-2 uppercase tracking-wide flex items-center gap-2">
                    <UploadCloud size={14} /> Delivery Proof (POD)
                  </label>
                  {logisticsBatch?.some(item => item.podFilename) && !logisticsForm.dpodFile && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 mb-2 flex items-center gap-1.5">
                      <CheckCircle size={12} /> POD already uploaded — choose a file below only to replace it.
                    </p>
                  )}
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-slate-500
                      file:mr-4 file:py-2.5 file:px-4
                      file:rounded-xl file:border-0
                      file:text-sm file:font-semibold
                      file:bg-orange-100 file:text-orange-700
                      hover:file:bg-orange-200 transition cursor-pointer"
                  />
                  <p className="text-xs text-orange-600 mt-2">Required before marking any order as Delivered.</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div className="p-4 bg-pink-50 rounded-2xl border border-pink-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-pink-700 flex items-center gap-2"><Package size={14} /> Include Packaging Cost?</label>
                    <select className="text-xs border-pink-200 rounded-lg p-1 outline-none bg-white text-pink-700 font-bold" value={logisticsForm.includePackaging} onChange={handlePackagingToggle} disabled={isDeliveredLogisticsLocked}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  {logisticsForm.includePackaging === "yes" && (
                    <input type="number" className="w-full border border-pink-200 p-2 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 outline-none" placeholder="Enter packaging cost" value={logisticsForm.packagingCost} onChange={(e) => setLogisticsForm({...logisticsForm, packagingCost: e.target.value})} disabled={isDeliveredLogisticsLocked} />
                  )}
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <label className="text-xs font-bold text-amber-700 flex items-center gap-2 mb-2"><RotateCcw size={14} /> Send Back to Billing</label>
                  <p className="text-[10px] text-amber-600 mb-2">If information is incorrect, add a reason and send this back to Billing.</p>
                  <input
                    type="text"
                    className="w-full border border-amber-200 p-2 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none mb-3 bg-white"
                    placeholder="Reason for sending back (Required)"
                    value={logisticsForm.sendBackRemark}
                    onChange={(e) => setLogisticsForm({...logisticsForm, sendBackRemark: e.target.value})}
                    disabled={isDeliveredLogisticsLocked}
                  />

                  <button
                    type="button"
                    onClick={handleSendBackToBilling}
                    disabled={!logisticsForm.sendBackRemark?.trim() || isDeliveredLogisticsLocked || isSendingBackToBilling}
                    className="w-full py-2 bg-white border border-amber-300 text-amber-700 font-bold rounded-xl hover:bg-amber-100 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingBackToBilling ? "Sending..." : "Send Back"}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setLogisticsBatch(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" disabled={isSavingLogistics} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed">{isSavingLogistics ? "Saving..." : "Save Update"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                  <Receipt className="text-indigo-600" size={20} /> Order Details
                </h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 font-medium">
                  <span className="font-mono bg-white border px-2 py-0.5 rounded-lg shadow-sm text-slate-700">
                    {viewOrder[0].customerName || viewOrder[0].customer}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>Order: {viewOrder[0].orderDate ? format(new Date(viewOrder[0].orderDate), "dd MMM yyyy") : "-"}</span>
                  <span className="text-slate-300">•</span>
                  <span>Dispatch: {viewOrder[0].dispatchDate ? format(new Date(viewOrder[0].dispatchDate), "dd MMM yyyy") : "-"}</span>
                </div>
              </div>
              <button 
                onClick={() => setViewOrder(null)} 
                className="p-2 hover:bg-slate-200 rounded-xl transition-all text-slate-400 hover:text-slate-600 shadow-sm hover:shadow"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-white">
              {/* Product List Section */}
              <section>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2 border-l-4 border-indigo-500 pl-3">
                  <Box size={16} /> Product List ({viewOrder.length})
                </h3>
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 w-10">#</th>
                        <th className="px-6 py-4">Model</th>
                        <th className="px-6 py-4">Serial</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewOrder.map((item, i) => {
                        const { serial, model } = getDetails(item.serialNumberId || item.serialNumberGuid || item.serialGuid || item.serialId, item);
                        return (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 text-slate-400 font-medium">{i + 1}</td>
                            <td className="px-6 py-4 font-bold text-slate-700">{model}</td>
                            <td className="px-6 py-4 font-mono font-bold text-indigo-600">{serial}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                getEffectiveDispatchStatus(item) === "Delivered" || getEffectiveDispatchStatus(item) === "Completed" ? "bg-green-50 text-green-700 border-green-200" :
                                getEffectiveDispatchStatus(item) === "Packing in Process" ? "bg-cyan-50 text-cyan-700 border-cyan-200" :
                                getEffectiveDispatchStatus(item) === "Ready for Pickup" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                getEffectiveDispatchStatus(item) === "Delivery in Process" || getEffectiveDispatchStatus(item) === "In Transit" || getEffectiveDispatchStatus(item) === "Pickup Scheduled" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                getEffectiveDispatchStatus(item) === "RTO" || getEffectiveDispatchStatus(item) === "Returned" || getEffectiveDispatchStatus(item) === "Order Cancelled" ? "bg-red-50 text-red-700 border-red-200" :
                                "bg-slate-50 text-slate-700 border-slate-200"
                              }`}>
                                {getEffectiveDispatchStatus(item)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-black text-slate-700">₹{Number(item.sellingPrice).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Logistics Info Section */}
                <section className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 shadow-inner">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Truck size={16} className="text-indigo-600" /> Logistics Info
                  </h3>
                  <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Partner</p>
                      <p className="font-bold text-slate-800 text-sm">{viewOrder[0].courierPartner || "Not assigned"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Tracking ID</p>
                      <p className="font-mono font-bold text-slate-800 text-sm">{viewOrder[0].trackingId || "Pending"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Freight</p>
                      <p className="font-black text-emerald-600 text-sm">₹{Number(viewOrder[0].freightCharges || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Packaging</p>
                      <p className="font-black text-pink-600 text-sm">₹{Number(viewOrder[0].packagingCost || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </section>

                {/* Shipping Details Section */}
                <section className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 shadow-inner">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <MapPin size={16} className="text-indigo-600" /> Shipping Details
                  </h3>
                  <div className="space-y-4">
                    {(() => {
                      const isECommerce = ["amazon", "flipkart"].includes(String(viewOrder[0].firmName || "").trim().toLowerCase());
                      return (
                        <>
                          {isECommerce && (
                            <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Invoice Number</p>
                                <p className="font-bold text-slate-800 text-sm">{viewOrder[0].invoiceNumber || "-"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Invoice Date</p>
                                <p className="font-bold text-slate-800 text-sm">{viewOrder[0].invoiceDate ? format(new Date(viewOrder[0].invoiceDate), "dd MMM yyyy") : "-"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">GST Number</p>
                                <p className="font-mono font-bold text-slate-800 text-sm">{viewOrder[0].gstNumber || "-"}</p>
                              </div>
                            </div>
                          )}
                          {!isECommerce && (
                            <>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Consignee Name</p>
                                <p className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                  <User size={12} className="text-slate-400" /> {viewOrder[0].consigneeName || "N/A"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Contact</p>
                                <p className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                  <Phone size={12} className="text-slate-400" /> {viewOrder[0].contactNumber || "N/A"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Address</p>
                                <p className="font-medium text-slate-600 text-sm leading-relaxed">{viewOrder[0].shippingAddress || "No address provided"}</p>
                              </div>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </section>
              </div>

              {/* Document Previews Section */}
              <section className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl shadow-slate-200">
                <h3 className="text-xs font-black text-white/60 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <FileText size={16} /> Audit Documents
                </h3>
                  {(() => {
                    const isECommerce = ["amazon", "flipkart"].includes(String(viewOrder[0].firmName || "").trim().toLowerCase());
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Invoice Document */}
                        <div className="bg-white/5 rounded-2xl p-5 border border-white/10 hover:bg-white/10 transition-colors group">
                          <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-3">
                            {isECommerce ? "Original Invoice (From Order)" : "Invoice"}
                          </p>
                          {viewOrder[0].invoiceFilename ? (
                            <div className="flex flex-col gap-3">
                              <button
                                onClick={() => {
                                  setPreviewUrl(getUploadFileUrl(viewOrder[0].invoiceFilename));
                                  setPreviewTitle(isECommerce ? "Original Invoice" : "Order Invoice");
                                  setShowPreview(true);
                                }}
                                className="w-full inline-flex items-center justify-center gap-2 text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
                              >
                                <FileText size={14} /> View Document
                              </button>
                              <span className="text-[10px] text-emerald-400 flex items-center justify-center gap-1 font-bold">
                                <CheckCircle size={10} /> Document Verified
                              </span>
                            </div>
                          ) : (
                            <p className="text-white/30 text-xs font-bold italic py-2 text-center bg-white/5 rounded-lg border border-white/5">Not uploaded</p>
                          )}
                        </div>

                        {/* E-Way Bill / Accountant Document */}
                        <div className="bg-white/5 rounded-2xl p-5 border border-white/10 hover:bg-white/10 transition-colors group">
                          <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-3">
                            {isECommerce ? "Accountant Upload (Doc/Challan)" : "E-Way Bill"}
                          </p>
                          {viewOrder[0].ewayBillFilename ? (
                            <div className="flex flex-col gap-3">
                              <button
                                onClick={() => {
                                  setPreviewUrl(getUploadFileUrl(viewOrder[0].ewayBillFilename));
                                  setPreviewTitle(isECommerce ? "Accountant Document" : "E-Way Bill");
                                  setShowPreview(true);
                                }}
                                className="w-full inline-flex items-center justify-center gap-2 text-xs font-black bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-amber-900/20 active:scale-95"
                              >
                                <FileText size={14} /> View Document
                              </button>
                              <span className="text-[10px] text-emerald-400 flex items-center justify-center gap-1 font-bold">
                                <CheckCircle size={10} /> Document Verified
                              </span>
                            </div>
                          ) : (
                            <p className="text-white/30 text-xs font-bold italic py-2 text-center bg-white/5 rounded-lg border border-white/5">Not uploaded</p>
                          )}
                        </div>

                        {String(viewOrder[0].firmName || "").trim().toLowerCase() === "gem" && (
                          <div className="bg-white/5 rounded-2xl p-5 border border-white/10 hover:bg-white/10 transition-colors group">
                            <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-3">
                              Delivery Proof (POD)
                            </p>
                            {viewOrder[0].podFilename ? (
                              <div className="flex flex-col gap-3">
                                <button
                                  onClick={() => {
                                    setPreviewUrl(getUploadFileUrl(viewOrder[0].podFilename));
                                    setPreviewTitle("Delivery Proof (POD)");
                                    setShowPreview(true);
                                  }}
                                  className="w-full inline-flex items-center justify-center gap-2 text-xs font-black bg-orange-600 hover:bg-orange-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-orange-900/20 active:scale-95"
                                >
                                  <FileText size={14} /> View POD
                                </button>
                                <span className="text-[10px] text-emerald-400 flex items-center justify-center gap-1 font-bold">
                                  <CheckCircle size={10} /> Document Verified
                                </span>
                              </div>
                            ) : (
                              <p className="text-white/30 text-xs font-bold italic py-2 text-center bg-white/5 rounded-lg border border-white/5">Not uploaded</p>
                            )}
                          </div>
                        )}

                        {/* Gate Pass */}
                        <div className="bg-white/5 rounded-2xl p-5 border border-white/10 hover:bg-white/10 transition-colors group">
                          <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-3">Gate Pass</p>
                          <button
                            onClick={() => downloadGatepass(viewOrder[0]._orderId, viewOrder[0].orderid || viewOrder[0].customerName)}
                            className="w-full inline-flex items-center justify-center gap-2 text-xs font-black bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-900/20 active:scale-95"
                          >
                            <FileText size={14} /> Download Gate Pass
                          </button>
                        </div>
                      </div>
                    );
                  })()}
              </section>

              {/* Installation Section */}
              {(viewOrder[0].installationRequired === 1 || viewOrder[0].installationRequired === true) && (
                <section className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100">
                  <h3 className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Info size={16} className="text-indigo-600" /> Installation Info
                  </h3>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] text-indigo-400 uppercase font-black tracking-widest mb-1">Technician</p>
                      <div className="flex items-center gap-2">
                        <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600"><User size={14} /></div>
                        <p className="font-bold text-indigo-900 text-sm">{viewOrder[0].technicianName || "Pending Assignment"}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-indigo-400 uppercase font-black tracking-widest mb-1">Current Status</p>
                      <p className="font-black text-indigo-900 text-sm uppercase">{viewOrder[0].installationStatus || "Waiting"}</p>
                    </div>
                  </div>
                </section>
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setViewOrder(null)} 
                className="px-8 py-3 bg-slate-800 text-white font-black text-sm rounded-2xl hover:bg-slate-900 transition-all shadow-xl shadow-slate-200 active:scale-95"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
      <AppearanceModal 
        isOpen={appearanceModalOpen} 
        onClose={() => setAppearanceModalOpen(false)} 
        item={appearanceItem} 
        type="dispatch" 
        onUpdated={onRefresh} 
      />
    </div>
  );
}


