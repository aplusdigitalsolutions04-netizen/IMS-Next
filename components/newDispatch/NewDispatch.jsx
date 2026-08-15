"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { printerService } from "@/lib/services/api";
import { inventoryService } from "@/lib/services/inventoryService";
import {
  ArrowLeft, Package, Truck, ScanLine, Hash,
  Trash2, CheckCircle, AlertCircle, Sparkles,
  IndianRupee, ShoppingCart, Layers, Calculator,
  Calendar, FileText, MapPin, Phone, Mail, User, UploadCloud,
  Wrench, Activity, CheckSquare, X, Eye, EyeOff,
  TrendingUp, TrendingDown, Clock, CreditCard,
  Plus, Minus, Database, Building2, ListChecks,
  Zap, Shield, Box, CircleDot
} from "lucide-react";
import MasterDropdown from "@/components/common/MasterDropdown";
import SearchableSelect from "../common/SearchableSelect";
import SidePanel from "./SidePanel";
import { useCompany } from "@/lib/client/CompanyContext";
import { platformsService } from "@/lib/services/platformsService";


const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

const getAuthHeaders = () => {
  const token = sessionStorage.getItem("pt_auth_token");
  return {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }
  };
};

export default function NewDispatch({
  models = [],
  serials = [],
  currentUser,
  onRefresh,
  onBack,
}) {
  const [activeTab, setActiveTab] = useState("single");
  const [itemType, setItemType] = useState("serialized"); // "serialized" | "nonSerialized"
  const [nonSerializedItemVariantId, setNonSerializedItemVariantId] = useState("");
  const [nonSerializedQty, setNonSerializedQty] = useState(1);
  const [itemMasterVariants, setItemMasterVariants] = useState([]);
  const [loadingItemMaster, setLoadingItemMaster] = useState(false);
  const [batchList, setBatchList] = useState([]);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  // processSerial closes over activeTab/batchList/form.quantity/serials/models
  // from render scope — the debounced setTimeout below schedules a call to it
  // ahead of time, so without this ref it would run against whatever those
  // values were *when scheduled*, not when the timer actually fires (e.g. if
  // the user switches Single/Bulk tabs within the debounce window). Kept in
  // sync every render so the timeout always invokes the latest closure.
  const processSerialRef = useRef(null);

  const [autoSubmitDelay] = useState(300);
  const [modelPrices, setModelPrices] = useState({});
  
  const canManage = currentUser?.role === 'Admin' || !!currentUser?.allow_edit_dispatch;

  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // Tracks the async duplicate-Order-ID check separately from `error` —
  // `error` gets wiped at the top of handleSubmit, so a fast submit right
  // after typing a duplicate ID (before the blur check's response lands, or
  // before the user even notices the warning) could previously slip through
  // with no check having actually blocked it. 'idle' | 'checking' | 'ok' | 'duplicate'.
  const [orderIdCheckStatus, setOrderIdCheckStatus] = useState("idle");

  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedItemName, setSelectedItemName] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedPanelSerials, setSelectedPanelSerials] = useState([]);
  const [serialReturnWarning, setSerialReturnWarning] = useState("");

  const [lastDateManuallySet, setLastDateManuallySet] = useState(false);

  const getInitialDate = (daysToAdd = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [form, setForm] = useState({
    serialInput: "",
    serialId: "",
    modelName: "",
    companyName: "",
    platform: "",
    platformFields: {},
    orderId: "",
    sellingPrice: "",
    landingPrice: 0,
    mrp: 0,
    modelGuid: null,
    quantity: 1,
    status: "Order Confirmed",
    installationRequired: "No",
    gemOrderType: "Direct Order",
    gemOrderDate: getInitialDate(0),
    gemLastDate: getInitialDate(15),
    gemBidNo: "",
    gemContractFile: null,
    gemAddress: "",
    gemBuyerAddress: "",
    sameAsShippingAddress: false,
    gemGst: "",
    gemContact: "",
    gemAltContact: "",
    gemBuyerEmail: "",
    gemConsigneeEmail: "",
    paymentAuthorityEmail: "",
    consigneeName: "",
    warranty: "",
    invoiceNo: "",
    invoiceDate: "",
    invoiceGst: "",
    invoiceFile: null
  });

  // Helper function to add days to a date string
  const addDaysToDate = (dateString, days) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Handle Order Date change with auto-fill logic
  const handleOrderDateChange = (newOrderDate) => {
    const autoLastDate = addDaysToDate(newOrderDate, 15);
    if (!lastDateManuallySet) {
      setForm(prev => ({
        ...prev,
        gemOrderDate: newOrderDate,
        gemLastDate: autoLastDate
      }));
    } else {
      setForm(prev => ({
        ...prev,
        gemOrderDate: newOrderDate
      }));
    }
  };

  // Handle Last Date manual change
  const handleLastDateChange = (newLastDate) => {
    setLastDateManuallySet(true);
    setForm(prev => ({
      ...prev,
      gemLastDate: newLastDate
    }));
  };

  // Check for duplicate Order ID immediately
  const handleOrderIdBlur = async () => {
    if (!form.orderId || String(form.orderId).trim() === "" || String(form.orderId).toLowerCase() === "n/a") {
      setOrderIdCheckStatus("idle");
      return;
    }
    const checkedValue = String(form.orderId).trim();
    try {
      setIsProcessing(true);
      setOrderIdCheckStatus("checking");
      const res = await axios.get(`${API_BASE_URL}/api/dispatches/check/${encodeURIComponent(checkedValue)}`, getAuthHeaders());
      // If the field changed again while this request was in flight, this
      // result is for a stale value — don't let it set the status for
      // whatever's in the field now.
      if (String(form.orderId).trim() !== checkedValue) return;
      if (res.data.exists) {
        setOrderIdCheckStatus("duplicate");
        Swal.fire({
          title: "Duplicate Order ID",
          text: `Order ID "${form.orderId}" already exists in the system!`,
          icon: "error",
          confirmButtonColor: "#ef4444"
        });
        setError(`Order ID "${form.orderId}" already exists. Cannot create a duplicate.`);
      } else {
        setOrderIdCheckStatus("ok");
        if (error && error.includes("already exists")) setError("");
      }
    } catch (err) {
      console.error("Failed to check Order ID", err);
      // A failed check is treated as "unknown", not "ok" — handleSubmit
      // re-runs the check itself before proceeding, so this doesn't block
      // submission, it just doesn't pre-clear the warning either.
      setOrderIdCheckStatus("idle");
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset manual flag when platform changes
  useEffect(() => {
    setLastDateManuallySet(false);
    // Auto-set E-Commerce platform fields if missing
    // so it always sends a valid default for platforms that don't show the picker
    if (form.platform === "Amazon" || form.platform === "Flipkart") {
      setForm(f => ({ ...f, status: "Order Confirmed", platformFields: {} }));
    } else {
      setForm(f => ({ ...f, platformFields: {} }));
    }
  }, [form.platform]);

  const { activeCompany } = useCompany();
  const allowed = activeCompany?.allowedPlatforms;

  // Emoji per platform is purely decorative for the picker buttons below —
  // the 4 built-ins keep their distinct icon, any custom platform added via
  // Settings > Selling Platforms falls back to a generic storefront icon.
  const PLATFORM_ICONS = { Amazon: "🛒", Flipkart: "📦", GeM: "🏛️", Other: "🔗" };
  const [allPlatformRows, setAllPlatformRows] = useState([]);
  useEffect(() => {
    platformsService.getPlatforms()
      .then(setAllPlatformRows)
      .catch((err) => console.error("Failed to load platforms:", err));
  }, []);
  const allPlatforms = allPlatformRows.map((p) => ({ value: p.name, icon: PLATFORM_ICONS[p.name] || "🛒", fields: p.fields || [] }));

  const platforms = allowed ? allPlatforms.filter(p => allowed.includes(p.value)) : allPlatforms;

  const getCompanyName = (model) => {
    if (!model) return "Unknown";
    return model.company || model.companyName || model.firm || "Unknown";
  };

  const getSerialValue = (serial) => {
    if (!serial) return "";
    return serial.value || serial.serialNumber || serial.serial_no || serial.serial || "";
  };

  const normalize = (val) => {
    return String(val || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9-]/g, "");
  };

  // Item Master models carry an `itemName` (e.g. "Printer", "SSD") grouping
  // multiple variants under one company — old-style Models rows don't have
  // that concept, so each one is treated as its own single-variant "item"
  // (grouped under its own name) for this same Company -> Item -> Model flow.
  const getItemName = (model) => {
    if (!model) return "Unknown";
    return model.itemName || model.name || "Unknown";
  };

  const companyOptions = useMemo(() => {
    const unique = [...new Set(models.map((m) => getCompanyName(m)).filter(Boolean))];
    return unique.sort((a, b) => a.localeCompare(b));
  }, [models]);

  const modelsByCompany = useMemo(() => {
    if (!selectedCompany) return [];
    return models.filter((m) => getCompanyName(m) === selectedCompany);
  }, [models, selectedCompany]);

  const itemNameOptions = useMemo(() => {
    const unique = [...new Set(modelsByCompany.map((m) => getItemName(m)).filter(Boolean))];
    return unique.sort((a, b) => a.localeCompare(b));
  }, [modelsByCompany]);

  const filteredModelsByCompany = useMemo(() => {
    if (!selectedCompany || !selectedItemName) return [];
    return modelsByCompany.filter((m) => getItemName(m) === selectedItemName);
  }, [modelsByCompany, selectedCompany, selectedItemName]);

  // Non-serialized order flow — items picked from Item Master (inventoryitemvariant),
  // the same catalog Stationery stock-out uses, not the printer Models catalog.
  useEffect(() => {
    if (itemType !== "nonSerialized" || itemMasterVariants.length > 0) return;
    setLoadingItemMaster(true);
    inventoryService.getCurrentStock({ limit: 1000 })
      .then((res) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        // Only genuinely non-serialized items belong in this picker — items
        // marked "Ask Serial No. = Yes" (isTrackable) need a serial pinned
        // and are handled by the Serialized flow instead.
        setItemMasterVariants(rows.filter((v) => !v.isTrackable));
      })
      .catch((err) => console.error("Failed to load Item Master:", err.message))
      .finally(() => setLoadingItemMaster(false));
  }, [itemType, itemMasterVariants.length]);

  const selectedItemMasterVariant = useMemo(
    () => itemMasterVariants.find((v) => String(v.itemVariantId) === String(nonSerializedItemVariantId)),
    [itemMasterVariants, nonSerializedItemVariantId]
  );

  useEffect(() => {
    if (!selectedCompany) {
      setSelectedItemName("");
      setSelectedModelId("");
      setSelectedPanelSerials([]);
      return;
    }
    if (selectedItemName && !itemNameOptions.includes(selectedItemName)) {
      setSelectedItemName("");
      setSelectedModelId("");
      setSelectedPanelSerials([]);
    }
  }, [selectedCompany, selectedItemName, itemNameOptions]);

  useEffect(() => {
    if (!selectedItemName) {
      setSelectedModelId("");
      setSelectedPanelSerials([]);
      return;
    }
    if (selectedModelId) {
      const exists = filteredModelsByCompany.some((m) => String(m.id) === String(selectedModelId));
      if (!exists) {
        setSelectedModelId("");
        setSelectedPanelSerials([]);
      }
    }
  }, [selectedItemName, selectedModelId, filteredModelsByCompany]);

  useEffect(() => {
    if (!selectedCompany || !selectedModelId) {
      setSelectedPanelSerials([]);
      return;
    }

    const selectedSerialIdsInBatch = batchList.map((item) => String(item.serialId));
    const singleSelectedSerialId = form.serialId ? String(form.serialId) : null;

    const availableSerials = serials.filter((s) => {
      const serialStatus = String(s.status || "").trim().toLowerCase();
      // Item Master models are keyed by itemVariantId (since duplicate old
      // `models` rows are no longer returned) — but a serial's modelGuid may
      // still hold the old models.guid (set via the migration link) rather
      // than the itemVariantId itself, so match against either.
      const modelMatch = String(s.modelGuid) === String(selectedModelId) || String(s.itemVariantId) === String(selectedModelId);
      const isAvailable = serialStatus === "available";
      const alreadyUsedInMultiple = selectedSerialIdsInBatch.includes(String(s.id));
      const alreadyUsedInSingle = singleSelectedSerialId === String(s.id);
      return modelMatch && isAvailable && !alreadyUsedInMultiple && !alreadyUsedInSingle;
    });

    setSelectedPanelSerials(availableSerials);
  }, [selectedCompany, selectedModelId, serials, batchList, form.serialId]);

  const processSerial = (serialValue) => {
    if (!serialValue || String(serialValue).trim() === "") return;

    const trimmedValue = String(serialValue).trim();
    setIsProcessing(true);
    setSerialReturnWarning("");

    if (activeTab === "multiple") {
      const targetQty = parseInt(form.quantity, 10) || 1;
      if (batchList.length >= targetQty) {
        setError(`Target limit reached! You have already scanned ${targetQty} items.`);
        setIsProcessing(false);
        return;
      }
    }

    const foundSerial = serials.find((s) => {
      const serialVal = getSerialValue(s);
      return normalize(serialVal) === normalize(trimmedValue);
    });

    if (!foundSerial) {
      setError(`Serial "${trimmedValue}" not found in inventory.`);
      setIsProcessing(false);
      return;
    }

    const dbStatus = String(foundSerial.status || "").trim().toLowerCase();
    if (dbStatus !== "available") {
      setError(`Serial "${trimmedValue}" is "${foundSerial.status}" (must be Available).`);
      setIsProcessing(false);
      return;
    }

    const serialId = foundSerial.id;
    const serialDisplayValue = getSerialValue(foundSerial);

    if (
      activeTab === "multiple" &&
      batchList.find((b) => String(b.serialId) === String(serialId))
    ) {
      setError("This serial is already added.");
      setIsProcessing(false);
      return;
    }

    // /api/serials never actually returns a `modelGuid` field (only
    // `modelId`/`itemVariantId`), so foundSerial.modelGuid is always
    // undefined here — same gap already worked around a few lines up (see
    // the availableSerials filter above) by also matching itemVariantId.
    // Without this fallback every single serial scanned here failed with
    // "Model not found", regardless of which one it was.
    const model = models.find((m) => String(m.id) === String(foundSerial.modelGuid) || String(m.id) === String(foundSerial.itemVariantId));

    if (!model) {
      setError(`Model not found for serial ${serialDisplayValue}`);
      setIsProcessing(false);
      return;
    }

    const companyName = getCompanyName(model);
    const warningMessage = Number(foundSerial.returnCount || 0) > 0
      ? `This serial was previously returned${foundSerial.latestReturnReason ? ` (Reason: ${foundSerial.latestReturnReason})` : ""}.`
      : "";
    setSerialReturnWarning(warningMessage);

    if (activeTab === "multiple") {
      if (modelPrices[foundSerial.modelGuid] === undefined) {
        setModelPrices((prev) => ({
          ...prev,
          [foundSerial.modelGuid]: model?.mrp || ""
        }));
      }

      setBatchList((prev) => [
        ...prev,
        {
          serialId,
          serialValue: serialDisplayValue,
          modelGuid: foundSerial.modelGuid,
          modelName: model.name,
          companyName,
          landingPrice: foundSerial.landingPrice || 0,
          mrp: model?.mrp || 0,
          individualPrice: null,
          returnCount: Number(foundSerial.returnCount || 0),
          latestReturnReason: foundSerial.latestReturnReason || ""
        }
      ]);

      setSuccessMsg(`✓ Added: ${serialDisplayValue}`);
      setForm((prev) => ({ ...prev, serialInput: "" }));
      setTimeout(() => setSuccessMsg(""), 2000);

      if (inputRef.current) inputRef.current.focus();
    } else {
      setForm((prev) => ({
        ...prev,
        serialId,
        modelGuid: foundSerial.modelGuid,
        modelName: model.name,
        companyName,
        landingPrice: foundSerial.landingPrice || 0,
        mrp: model?.mrp || 0,
        serialInput: serialDisplayValue,
        sellingPrice: prev.sellingPrice || (model?.mrp ? String(model.mrp) : ""),
        quantity: 1
      }));

      setSuccessMsg(`✓ Serial found: ${serialDisplayValue}`);
      setTimeout(() => setSuccessMsg(""), 2000);
    }

    setIsProcessing(false);
    setError("");
  };

  useEffect(() => {
    processSerialRef.current = processSerial;
  });

  const handleSerialChange = (value) => {
    setForm((prev) => ({ ...prev, serialInput: value }));
    setError("");

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value || String(value).trim() === "") {
      if (activeTab === "single") {
        setForm((prev) => ({
          ...prev,
          serialId: "",
          modelName: "",
          companyName: "",
          landingPrice: 0,
          mrp: 0,
          modelGuid: null,
          quantity: 1
        }));
        setSerialReturnWarning("");
      }
      return;
    }

    if (autoSubmitDelay > 0) {
      debounceRef.current = setTimeout(() => {
        processSerialRef.current?.(value);
      }, autoSubmitDelay);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      processSerial(form.serialInput);
    }
  };

  const removeFromBatch = (serialId) => {
    setBatchList((prev) => prev.filter((item) => item.serialId !== serialId));
  };

  const updateModelPrice = (modelGuid, price) => {
    setModelPrices((prev) => ({ ...prev, [modelGuid]: price }));
  };


  const handleFileChange = (e) => {
    const file = e.target.files[0] || null;
    setForm((prev) => ({ ...prev, gemContractFile: file }));
  };

  const handleInvoiceFileChange = (e) => {
    setForm((prev) => ({ ...prev, invoiceFile: e.target.files[0] || null }));
  };

  const multipleQuantity = Number(form.quantity) || 0;
  
  const profit =
    form.sellingPrice && form.landingPrice
      ? Number(form.sellingPrice) - form.landingPrice
      : null;

  const progressPercentage =
    activeTab === "multiple" && form.quantity > 0
      ? Math.min((batchList.length / parseInt(form.quantity, 10)) * 100, 100)
      : 0;

  const incrementQuantity = () => {
    if (activeTab !== "multiple") return;
    setForm((prev) => ({
      ...prev,
      quantity: String((Number(prev.quantity) || 0) + 1)
    }));
  };

  const decrementQuantity = () => {
    if (activeTab !== "multiple") return;
    setForm((prev) => {
      const nextQty = Math.max(Number(prev.quantity || 0) - 1, batchList.length, 1);
      return {
        ...prev,
        quantity: String(nextQty)
      };
    });
  };

  const batchSummary = useMemo(() => {
    const summary = {};
    batchList.forEach((item) => {
      if (!summary[item.modelGuid]) {
        summary[item.modelGuid] = {
          modelGuid: item.modelGuid,
          modelName: item.modelName,
          companyName: item.companyName,
          mrp: item.mrp,
          count: 0,
        };
      }
      summary[item.modelGuid].count++;
    });
    return Object.values(summary);
  }, [batchList]);

  const batchTotalValue = useMemo(() => {
    return batchList.reduce((sum, item) => {
      const modelPrice = modelPrices[item.modelGuid];
      const price =
        modelPrice !== undefined && modelPrice !== ""
          ? Number(modelPrice)
          : item.individualPrice !== null
          ? Number(item.individualPrice)
          : Number(form.sellingPrice);
      return sum + (price || 0);
    }, 0);
  }, [batchList, modelPrices, form.sellingPrice]);

  // Derive the live status from the dispatch status
  const deriveLiveStatus = (dispatchStatus) => {
    if (dispatchStatus === "Order Not Confirmed") {
      return "Order On Hold";
    }
    return dispatchStatus;
  };

  // ✅ Check if current platform should show Order Status picker
  const showOrderStatus = form.platform === "GeM" || form.platform === "Other";
  const isECommerce = form.platform === "Amazon" || form.platform === "Flipkart";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (!form.platform || !form.orderId) {
        setError("Please select Platform and enter Order ID.");
        return;
      }

      // `error` was just cleared above, and the blur-triggered duplicate
      // check is async — a fast submit right after typing/tabbing out could
      // previously reach here before that check ever resolved (or without
      // it having fired at all, e.g. Enter-to-submit). Re-check synchronously
      // here so submission is always gated on a real, current answer instead
      // of trusting a check that may still be in flight or may never have run.
      if (orderIdCheckStatus === "duplicate") {
        setError(`Order ID "${form.orderId}" already exists. Cannot create a duplicate.`);
        return;
      }
      if (orderIdCheckStatus !== "ok") {
        try {
          const res = await axios.get(`${API_BASE_URL}/api/dispatches/check/${encodeURIComponent(String(form.orderId).trim())}`, getAuthHeaders());
          if (res.data.exists) {
            setOrderIdCheckStatus("duplicate");
            setError(`Order ID "${form.orderId}" already exists. Cannot create a duplicate.`);
            return;
          }
          setOrderIdCheckStatus("ok");
        } catch (checkErr) {
          console.error("Failed to verify Order ID before submit", checkErr);
          // Network hiccup on the check itself shouldn't block a legitimate
          // submission — the backend's own uniqueness handling is still the
          // final authority either way.
        }
      }

      let contractFilename = null;
      const contractFileToUpload = form.gemContractFile || null;

      let additionalDetails = {};

      const isECommerce = form.platform === "Amazon" || form.platform === "Flipkart";
      const invoiceFileToUpload = isECommerce ? form.invoiceFile : null;
      let invoiceFilename = null;

      // ✅ For Amazon/Flipkart, route orders through Billing first
      const actualStatus = showOrderStatus
        ? deriveLiveStatus(form.status)
        : isECommerce 
          ? "Send for Billing" 
          : "Order Confirmed";

      if (form.platform === "GeM") {
        if (!form.gemOrderDate || !form.gemLastDate || !form.gemContact) {
          setError("Please fill in all required GeM fields.");
          return;
        }

        additionalDetails = {
          status: actualStatus,
          installationRequired: form.installationRequired === "Yes",
          orderType: form.gemOrderType,
          bidNumber:
            form.gemOrderType === "Bid" || form.gemOrderType === "PBP"
              ? form.gemBidNo
              : null,
          orderDate: form.gemOrderDate,
          lastDeliveryDate: form.gemLastDate,
          contractFile: contractFilename,
          shippingAddress: form.gemAddress,
          invoiceNumber: form.invoiceNo || null,
          invoiceDate: form.invoiceDate || null,
          invoiceFilename: contractFilename || null,
          gstNumber: form.gemGst,
          contactNumber: form.gemContact,
          altContactNumber: form.gemAltContact,
          buyerEmail: form.gemBuyerEmail,
          consigneeEmail: form.gemConsigneeEmail,
          paymentAuthorityEmail: form.paymentAuthorityEmail,
          consigneeName: form.consigneeName,
          warranty: form.warranty
        };
      } else if (form.platform === "Other") {
        if (!form.gemOrderDate || !form.gemAddress || !form.gemContact) {
          setError("Please fill Order Date, Address and Contact No.");
          return;
        }

        additionalDetails = {
          status: actualStatus,
          installationRequired: form.installationRequired === "Yes",
          orderDate: form.gemOrderDate,
          lastDeliveryDate: form.gemLastDate || null,
          contractFile: contractFilename,
          shippingAddress: form.gemAddress,
          invoiceNumber: form.invoiceNo || null,
          invoiceDate: form.invoiceDate || null,
          invoiceFilename: contractFilename || null,
          gstNumber: form.gemGst,
          contactNumber: form.gemContact,
          altContactNumber: form.gemAltContact,
          buyerEmail: form.gemBuyerEmail,
          consigneeEmail: form.gemConsigneeEmail,
          paymentAuthorityEmail: form.paymentAuthorityEmail,
          consigneeName: form.consigneeName,
          warranty: form.warranty
        };
      } else {
        // Amazon / Flipkart
        additionalDetails = {
          status: actualStatus,
          installationRequired: form.installationRequired === "Yes",
          orderDate: form.gemOrderDate || null,
          lastDeliveryDate: form.gemLastDate || null,
          invoiceNumber: form.invoiceNo || null,
          invoiceDate: form.invoiceDate || null,
          invoiceFilename: invoiceFilename || null,
          gstNumber: form.invoiceGst || null
        };
      }

      const buildPayload = (serialId, price) => ({
        serialId,
        firmName: form.platform,
        customer: form.orderId,
        address:
          form.platform === "GeM" || form.platform === "Other"
            ? form.gemAddress || "N/A"
            : "N/A",
        buyerAddress:
          form.platform === "GeM" || form.platform === "Other"
            ? (form.sameAsShippingAddress ? form.gemAddress : form.gemBuyerAddress)
            : "N/A",
        user: currentUser?.username || "Unknown",
        sellingPrice: price,
        platformFields: form.platformFields,
        ...additionalDetails
      });

      let createdDispatch = null;

      if (itemType === "nonSerialized") {
        if (!nonSerializedItemVariantId) {
          setError("Please select an item from Item Master.");
          return;
        }
        if (!nonSerializedQty || Number(nonSerializedQty) <= 0) {
          setError("Please enter a valid quantity.");
          return;
        }
        if (!form.sellingPrice || Number(form.sellingPrice) <= 0) {
          setError("Please enter a valid selling price.");
          return;
        }

        setIsSubmitting(true);
        createdDispatch = await printerService.addDispatch({
          ...buildPayload(null, Number(form.sellingPrice)),
          itemVariantId: nonSerializedItemVariantId,
          quantity: Number(nonSerializedQty),
          nonSerialized: true,
        });
      } else if (activeTab === "single") {
        if (!form.serialId) {
          setError("Please scan or enter a valid serial number.");
          return;
        }

        if (!form.sellingPrice || Number(form.sellingPrice) <= 0) {
          setError("Please enter a valid selling price.");
          return;
        }

        setIsSubmitting(true);
        createdDispatch = await printerService.addDispatch(
          buildPayload(form.serialId, Number(form.sellingPrice))
        );
      } else {
        if (batchList.length === 0) {
          setError("Please add at least one item to the batch.");
          return;
        }

        if (batchList.length !== parseInt(form.quantity, 10)) {
          setError(
            `Please scan all ${form.quantity} items before submitting (Currently scanned: ${batchList.length}).`
          );
          return;
        }

        const invalidItems = batchList.filter((item) => {
          const modelPrice = modelPrices[item.modelGuid];
          const finalPrice =
            modelPrice !== undefined && modelPrice !== ""
              ? Number(modelPrice)
              : item.individualPrice !== null
              ? Number(item.individualPrice)
              : Number(form.sellingPrice);
          return !finalPrice || finalPrice <= 0;
        });

        if (invalidItems.length > 0) {
          setError("Please set a valid unit price for all items.");
          return;
        }

        setIsSubmitting(true);

        const itemsPayload = batchList.map((item) => {
          const modelPrice = modelPrices[item.modelGuid];
          const finalPrice =
            modelPrice !== undefined && modelPrice !== ""
              ? Number(modelPrice)
              : item.individualPrice !== null
              ? Number(item.individualPrice)
              : Number(form.sellingPrice);
          return buildPayload(item.serialId, finalPrice);
        });

        await printerService.addBulkDispatch(itemsPayload);
      }

      if (contractFileToUpload || invoiceFileToUpload) {
        try {
          let uploadTargetId = null;

          if (activeTab === "single") {
            uploadTargetId = createdDispatch?.dispatchGuid || createdDispatch?.id || createdDispatch?.guid;
          } else {
            const dispatches = await printerService.getDispatches();
            const orderKey = String(form.orderId || "").trim().toLowerCase();
            const platformKey = String(form.platform || "").trim().toLowerCase();
            const found = dispatches.find((d) => {
              const orderIdValue = String(d.customerName || d.customer || d.orderid || "").trim().toLowerCase();
              const platformValue = String(d.firmName || d.platform || "").trim().toLowerCase();
              return orderIdValue === orderKey && platformValue === platformKey;
            });
            uploadTargetId = found?.guid || found?.id;
          }

          if (!uploadTargetId) {
            console.warn("Unable to locate dispatch item for document upload after create.");
          } else {
            if (contractFileToUpload) {
              const contractResponse = await printerService.uploadOrderDocument(
                uploadTargetId,
                contractFileToUpload,
                "gemContract"
              );
              contractFilename = contractResponse.filename;
            }

            if (invoiceFileToUpload) {
              const invoiceResponse = await printerService.uploadOrderDocument(
                uploadTargetId,
                invoiceFileToUpload,
                "invoice"
              );
              invoiceFilename = invoiceResponse.filename;
            }
          }
        } catch (uploadError) {
          console.error("Document upload failed", uploadError);
          setError("Failed to upload invoice or contract file. Please try again.");
          return;
        }
      }

      await onRefresh();
      onBack();
    } catch (err) {
      console.error("Dispatch save failed:", err);
      setError(err.message || "Failed to save shipment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSelectedPlatformConfig = () => {
    return platforms.find(p => p.value === form.platform);
  };

  // Calculate days difference for display
  const daysDifference = useMemo(() => {
    if (!form.gemOrderDate || !form.gemLastDate) return null;
    const orderDate = new Date(form.gemOrderDate);
    const lastDate = new Date(form.gemLastDate);
    if (isNaN(orderDate.getTime()) || isNaN(lastDate.getTime())) return null;
    const diffTime = lastDate.getTime() - orderDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [form.gemOrderDate, form.gemLastDate]);



  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1380px] mx-auto px-4 py-5">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">

          {/* ═══ LEFT PANEL ═══ */}
          <div className="space-y-4">

            {/* ── Page Header ── */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={onBack}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 text-sm font-medium transition-colors"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <span className="text-slate-300 select-none">|</span>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Truck size={14} className="text-indigo-600" />
                  </div>
                  <h1 className="text-base font-bold text-slate-800">New Order</h1>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                {activeTab === "multiple" && batchList.length > 0 && (
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                    {batchList.length} items
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-white border border-slate-200 px-2.5 py-1.5 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  {currentUser?.username}
                </span>
              </div>
            </div>

            {/* ── Main Form Card ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Tab Switcher */}
              <div className="p-3 border-b border-slate-100 bg-slate-50/70">
                <div className="flex gap-2">
                  {[
                    { id: "single", label: "Single Item", icon: Package },
                    { id: "multiple", label: "Bulk Shipment", icon: Layers }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setError("");
                        setBatchList([]);
                        setLastDateManuallySet(false);
                        setForm((prev) => ({
                          ...prev,
                          serialInput: "",
                          serialId: "",
                          modelName: "",
                          companyName: "",
                          landingPrice: 0,
                          mrp: 0,
                          modelGuid: null,
                          quantity: tab.id === "single" ? 1 : "",
                          sellingPrice: ""
                        }));
                      }}
                      className={`flex-1 py-2 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                        activeTab === tab.id
                          ? "bg-white text-indigo-700 shadow-sm border border-indigo-100"
                          : "text-slate-500 hover:text-slate-700 hover:bg-white/70"
                      }`}
                    >
                      <tab.icon size={15} className={activeTab === tab.id ? "text-indigo-500" : "text-slate-400"} />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-6">

                {/* ── Section 1: Order Info ── */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <ShoppingCart size={12} />
                    Order Info
                  </p>

                  {/* Platform */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Platform <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-4 gap-2">
                      {platforms.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, platform: p.value }))}
                          className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all text-sm font-medium ${
                            form.platform === p.value
                              ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <span className="text-xl">{p.icon}</span>
                          <span className="text-xs font-semibold">{p.value}</span>
                          {form.platform === p.value && (
                            <CheckCircle size={12} className="text-indigo-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Item Type — Serialized vs Non-Serialized (GeM / Other) */}
                  {(form.platform === "GeM" || form.platform === "Other") && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Item Type</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setItemType("serialized")}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                            itemType === "serialized"
                              ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <ScanLine size={14} /> Serialized
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemType("nonSerialized")}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                            itemType === "nonSerialized"
                              ? "border-amber-400 bg-amber-50 text-amber-700 shadow-sm"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <Box size={14} /> Non-Serialized
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Order ID */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Order ID <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2">
                        {form.platform && getSelectedPlatformConfig() ? (
                          <span className="text-base">{getSelectedPlatformConfig().icon}</span>
                        ) : (
                          <Hash size={15} className="text-slate-400" />
                        )}
                      </div>
                      <input
                        type="text"
                        className="w-full border border-slate-300 bg-white pl-10 pr-10 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 outline-none transition-all"
                        placeholder={
                          form.platform === "Amazon"
                            ? "e.g. 402-1234567-8901234"
                            : form.platform === "Flipkart"
                            ? "e.g. OD123456789012345"
                            : form.platform === "GeM"
                            ? "e.g. GEMC-511687-12345678"
                            : "Enter order ID..."
                        }
                        value={form.orderId}
                        onChange={(e) => {
                          setForm({ ...form, orderId: e.target.value });
                          setOrderIdCheckStatus("idle");
                          if (error && error.includes("already exists")) setError("");
                        }}
                        onBlur={handleOrderIdBlur}
                        required
                      />
                      {form.orderId && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <CheckCircle size={15} className="text-emerald-500" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contract Upload — plain file attach, no AI extraction here */}
                  {showOrderStatus && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <UploadCloud size={10} className="text-slate-400" /> Contract File
                      </label>
                      <div className="relative">
                        <input
                          type="file"
                          onChange={handleFileChange}
                          className="w-full border border-dashed border-slate-300 p-3 rounded-xl text-sm bg-white hover:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 outline-none transition-all file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-100 file:text-emerald-700 hover:file:bg-emerald-200"
                        />
                      </div>
                    </div>
                  )}

                  {/* Order Status (GeM & Other) */}
                  {showOrderStatus && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Order Status <span className="text-red-500">*</span></label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: "Order Confirmed", label: "Confirmed", sub: "Ready for processing", Icon: CheckCircle, active: "border-emerald-400 bg-emerald-50", activeText: "text-emerald-700", icon: "text-emerald-600" },
                          { value: "Order Not Confirmed", label: "Not Confirmed", sub: 'Shows as "On Hold"', Icon: Clock, active: "border-amber-400 bg-amber-50", activeText: "text-amber-700", icon: "text-amber-600" }
                        ].map((s) => (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, status: s.value }))}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                              form.status === s.value ? s.active + " shadow-sm" : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <s.Icon size={17} className={form.status === s.value ? s.icon : "text-slate-400"} />
                            <div>
                              <p className={`text-sm font-semibold ${form.status === s.value ? s.activeText : "text-slate-700"}`}>{s.label}</p>
                              <p className="text-xs text-slate-400">{s.sub}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Section 2: Platform Details ── */}
                {form.platform && (
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <FileText size={12} />
                      {form.platform} Details
                    </p>

                    {/* Amazon / Flipkart — Invoice */}
                  {isECommerce && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-600">Invoice No.</label>
                          <input
                            type="text"
                            className="w-full border border-slate-300 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 outline-none transition-all"
                            placeholder="Invoice number"
                            value={form.invoiceNo}
                            onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-600">Invoice Date</label>
                          <input
                            type="date"
                            className="w-full border border-slate-300 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 outline-none transition-all"
                            value={form.invoiceDate}
                            onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-600">GST Number</label>
                          <input
                            type="text"
                            className="w-full border border-slate-300 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 outline-none transition-all"
                            placeholder="GST number (optional)"
                            value={form.invoiceGst}
                            onChange={(e) => setForm({ ...form, invoiceGst: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-600">Invoice Upload</label>
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            onChange={handleInvoiceFileChange}
                            className="w-full border border-dashed border-slate-300 p-2.5 rounded-xl text-sm bg-white hover:border-indigo-400 outline-none transition-all file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700"
                          />
                          {form.invoiceFile && (
                            <p className="text-xs text-slate-500">Selected: {form.invoiceFile.name}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* GeM-specific fields */}
                  {form.platform === "GeM" && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                      <div className="text-xs font-semibold text-slate-500">GeM Order Details</div>

                     

                      {/* Order Type & Bid No */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <FileText size={10} className="text-slate-400" /> Order Type
                          </label>
                          <MasterDropdown 
                            code="GEM_ORDER_TYPE" 
                            placeholder="Select Order Type" 
                            value={form.gemOrderType} 
                            onChange={(e) => setForm({ ...form, gemOrderType: e.target.value })} 
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                          />
                        </div>

                        {(form.gemOrderType === "Bid" || form.gemOrderType === "PBP") && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Bid No.</label>
                            <input
                              type="text"
                              className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                              placeholder="Enter bid number"
                              value={form.gemBidNo}
                              onChange={(e) => setForm({ ...form, gemBidNo: e.target.value })}
                            />
                          </div>
                        )}
                      </div>

                      {/* Dates with auto-fill */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Calendar size={10} className="text-slate-400" /> Order Date <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                            value={form.gemOrderDate}
                            onChange={(e) => handleOrderDateChange(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Clock size={10} className="text-slate-400" /> Last Delivery Date <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            className={`w-full border p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all ${
                              !lastDateManuallySet && form.gemLastDate
                                ? 'border-emerald-300 bg-emerald-50/30'
                                : 'border-slate-300/80'
                            }`}
                            value={form.gemLastDate}
                            onChange={(e) => handleLastDateChange(e.target.value)}
                            min={form.gemOrderDate || undefined}
                            required
                          />
                          {/* Days indicator */}
                          {daysDifference !== null && form.gemOrderDate && form.gemLastDate && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                daysDifference < 0
                                  ? 'bg-red-100 text-red-700 border border-red-200'
                                  : daysDifference <= 7
                                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}>
                                <Clock size={9} />
                                {daysDifference} day{daysDifference !== 1 ? 's' : ''} 
                                {daysDifference < 0 ? ' overdue' : ' window'}
                              </span>
                              {!lastDateManuallySet && (
                                <span className="text-[9px] text-slate-400 italic">auto-filled +15 days</span>
                              )}
                              {lastDateManuallySet && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLastDateManuallySet(false);
                                    const autoDate = addDaysToDate(form.gemOrderDate, 15);
                                    setForm(prev => ({ ...prev, gemLastDate: autoDate }));
                                  }}
                                  className="text-[9px] text-indigo-500 hover:text-indigo-700 font-bold underline underline-offset-2 transition-colors"
                                >
                                  Reset to +15 days
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Addresses */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <MapPin size={10} className="text-slate-400" /> Shipping Address <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all resize-none"
                            rows={2}
                            placeholder="Enter shipping address"
                            value={form.gemAddress}
                            onChange={(e) => setForm({ ...form, gemAddress: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                              <MapPin size={10} className="text-slate-400" /> Buy To Address
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-slate-500 hover:text-emerald-600 transition-colors">
                              <input
                                type="checkbox"
                                className="accent-emerald-500 rounded"
                                checked={form.sameAsShippingAddress}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setForm({
                                    ...form,
                                    sameAsShippingAddress: checked,
                                    gemBuyerAddress: checked ? form.gemAddress : form.gemBuyerAddress
                                  });
                                }}
                              />
                              Same as Shipping
                            </label>
                          </div>
                          <textarea
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all resize-none disabled:bg-slate-50 disabled:text-slate-500"
                            rows={2}
                            placeholder="Enter buyer address"
                            value={form.sameAsShippingAddress ? form.gemAddress : form.gemBuyerAddress}
                            onChange={(e) => {
                              if (!form.sameAsShippingAddress) {
                                setForm({ ...form, gemBuyerAddress: e.target.value });
                              }
                            }}
                            disabled={form.sameAsShippingAddress}
                          />
                        </div>
                      </div>

                      {/* Row: GST | Contact No. */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <FileText size={10} className="text-slate-400" /> GST Number
                          </label>
                          <input
                            type="text"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all uppercase"
                            placeholder="e.g. 22AAAAA0000A1Z5"
                            value={form.gemGst}
                            onChange={(e) => setForm({ ...form, gemGst: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Phone size={10} className="text-slate-400" /> Contact No. <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                            placeholder="e.g. 9876543210, 9123456789"
                            value={form.gemContact}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^\d, ]/g, "");
                              setForm({ ...form, gemContact: val });
                            }}
                            required
                          />
                        </div>
                      </div>

                      {/* Row: Alt Contact | Buyer Email */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Phone size={10} className="text-slate-400" /> Alt Contact
                          </label>
                          <input
                            type="text"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                            placeholder="Alternate contact"
                            value={form.gemAltContact}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              setForm({ ...form, gemAltContact: val });
                            }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Mail size={10} className="text-slate-400" /> Buyer Email
                          </label>
                          <input
                            type="email"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                            placeholder="buyer@example.com"
                            value={form.gemBuyerEmail}
                            onChange={(e) => setForm({ ...form, gemBuyerEmail: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Row: Consignee Name | Consignee Email */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <User size={10} className="text-slate-400" /> Consignee Name
                          </label>
                          <input
                            type="text"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                            placeholder="Consignee Name"
                            value={form.consigneeName}
                            onChange={(e) => setForm({ ...form, consigneeName: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Mail size={10} className="text-slate-400" /> Consignee Email
                          </label>
                          <input
                            type="email"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                            placeholder="consignee@example.com"
                            value={form.gemConsigneeEmail}
                            onChange={(e) => setForm({ ...form, gemConsigneeEmail: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Row: Payment Authority | Installation */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Mail size={10} className="text-slate-400" /> Payment Authority Email
                          </label>
                          <input
                            type="email"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                            placeholder="payment@example.com"
                            value={form.paymentAuthorityEmail}
                            onChange={(e) => setForm({ ...form, paymentAuthorityEmail: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Wrench size={10} className="text-slate-400" /> Installation Required
                          </label>
                          <MasterDropdown
                            code="INSTALLATION_REQ"
                            placeholder="Select"
                            value={form.installationRequired}
                            onChange={(e) => setForm({ ...form, installationRequired: e.target.value })}
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* Row: Warranty (full width) */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                          <Package size={10} className="text-slate-400" /> Warranty
                        </label>
                        <MasterDropdown
                          code="WARRANTY"
                          placeholder="Select Warranty"
                          value={form.warranty || ""}
                          onChange={(e) => setForm({ ...form, warranty: e.target.value })}
                          className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 outline-none transition-all"
                        />
                      </div>

                    </div>
                  )}

                  {/* Other platform fields */}
                  {form.platform === "Other" && (
                    <div className="bg-gradient-to-br from-violet-50/60 to-purple-50/40 border border-violet-200/60 rounded-xl p-4 space-y-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🔗</span>
                        <span className="text-xs font-extrabold text-violet-800 uppercase tracking-widest">Other Platform Details</span>
                      </div>

                      {/* Other platform Order Date with auto-fill */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Calendar size={10} className="text-slate-400" /> Order Date <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all"
                            value={form.gemOrderDate}
                            onChange={(e) => handleOrderDateChange(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Clock size={10} className="text-slate-400" /> Last Delivery Date
                          </label>
                          <input
                            type="date"
                            className={`w-full border p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all ${
                              !lastDateManuallySet && form.gemLastDate
                                ? 'border-violet-300 bg-violet-50/30'
                                : 'border-slate-300/80'
                            }`}
                            value={form.gemLastDate}
                            onChange={(e) => handleLastDateChange(e.target.value)}
                            min={form.gemOrderDate || undefined}
                          />
                          {daysDifference !== null && form.gemOrderDate && form.gemLastDate && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                daysDifference < 0
                                  ? 'bg-red-100 text-red-700 border border-red-200'
                                  : daysDifference <= 7
                                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}>
                                <Clock size={9} />
                                {daysDifference} day{daysDifference !== 1 ? 's' : ''} 
                                {daysDifference < 0 ? ' overdue' : ' window'}
                              </span>
                              {!lastDateManuallySet && (
                                <span className="text-[9px] text-slate-400 italic">auto-filled +15 days</span>
                              )}
                              {lastDateManuallySet && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLastDateManuallySet(false);
                                    const autoDate = addDaysToDate(form.gemOrderDate, 15);
                                    setForm(prev => ({ ...prev, gemLastDate: autoDate }));
                                  }}
                                  className="text-[9px] text-indigo-500 hover:text-indigo-700 font-bold underline underline-offset-2 transition-colors"
                                >
                                  Reset to +15 days
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <MapPin size={10} className="text-slate-400" /> Shipping Address <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all resize-none"
                            rows={2}
                            placeholder="Enter shipping address"
                            value={form.gemAddress}
                            onChange={(e) => setForm({ ...form, gemAddress: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                              <MapPin size={10} className="text-slate-400" /> Buy To Address
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-slate-500 hover:text-violet-600 transition-colors">
                              <input
                                type="checkbox"
                                className="accent-violet-500 rounded"
                                checked={form.sameAsShippingAddress}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setForm({
                                    ...form,
                                    sameAsShippingAddress: checked,
                                    gemBuyerAddress: checked ? form.gemAddress : form.gemBuyerAddress
                                  });
                                }}
                              />
                              Same as Shipping
                            </label>
                          </div>
                          <textarea
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all resize-none disabled:bg-slate-50 disabled:text-slate-500"
                            rows={2}
                            placeholder="Enter buyer address"
                            value={form.sameAsShippingAddress ? form.gemAddress : form.gemBuyerAddress}
                            onChange={(e) => {
                              if (!form.sameAsShippingAddress) {
                                setForm({ ...form, gemBuyerAddress: e.target.value });
                              }
                            }}
                            disabled={form.sameAsShippingAddress}
                          />
                        </div>
                      </div>

                      {/* Row: GST | Contact No. */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <FileText size={10} className="text-slate-400" /> GST Number
                          </label>
                          <input
                            type="text"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all uppercase"
                            placeholder="e.g. 22AAAAA0000A1Z5"
                            value={form.gemGst}
                            onChange={(e) => setForm({ ...form, gemGst: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Phone size={10} className="text-slate-400" /> Contact No. <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all"
                            placeholder="e.g. 9876543210, 9123456789"
                            value={form.gemContact}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^\d, ]/g, "");
                              setForm({ ...form, gemContact: val });
                            }}
                            required
                          />
                        </div>
                      </div>

                      {/* Row: Alt Contact | Installation */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Phone size={10} className="text-slate-400" /> Alt Contact
                          </label>
                          <input
                            type="text"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all"
                            placeholder="Alternate contact"
                            value={form.gemAltContact}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              setForm({ ...form, gemAltContact: val });
                            }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Wrench size={10} className="text-slate-400" /> Installation Required
                          </label>
                          <MasterDropdown
                            code="INSTALLATION_REQ"
                            placeholder="Select"
                            value={form.installationRequired}
                            onChange={(e) => setForm({ ...form, installationRequired: e.target.value })}
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* Row: Consignee Name | Consignee Email */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <User size={10} className="text-slate-400" /> Consignee Name
                          </label>
                          <input
                            type="text"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all"
                            placeholder="Consignee Name"
                            value={form.consigneeName}
                            onChange={(e) => setForm({ ...form, consigneeName: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Mail size={10} className="text-slate-400" /> Consignee Email
                          </label>
                          <input
                            type="email"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all"
                            placeholder="consignee@example.com"
                            value={form.gemConsigneeEmail}
                            onChange={(e) => setForm({ ...form, gemConsigneeEmail: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Row: Payment Authority Email */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                          <Mail size={10} className="text-slate-400" /> Payment Authority Email
                        </label>
                        <input
                          type="email"
                          className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all"
                          placeholder="payment@example.com"
                          value={form.paymentAuthorityEmail}
                          onChange={(e) => setForm({ ...form, paymentAuthorityEmail: e.target.value })}
                        />
                      </div>

                      {/* Row: Warranty (full width) */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                          <Package size={10} className="text-slate-400" /> Warranty
                        </label>
                        <MasterDropdown
                          code="WARRANTY"
                          placeholder="Select Warranty"
                          value={form.warranty || ""}
                          onChange={(e) => setForm({ ...form, warranty: e.target.value })}
                          className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400 outline-none transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* Amazon/Flipkart — Date fields (NO Order Status here) */}
                  {(form.platform === "Amazon" || form.platform === "Flipkart") && (
                    <div className={`bg-gradient-to-br ${
                      form.platform === "Amazon" 
                        ? "from-amber-50/60 to-orange-50/40 border-amber-200/60" 
                        : "from-blue-50/60 to-sky-50/40 border-blue-200/60"
                    } border rounded-xl p-4 space-y-4`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{form.platform === "Amazon" ? "🛒" : "📦"}</span>
                        <span className={`text-xs font-extrabold uppercase tracking-widest ${
                          form.platform === "Amazon" ? "text-amber-800" : "text-blue-800"
                        }`}>{form.platform} Order Details</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Calendar size={10} className="text-slate-400" /> Order Date
                          </label>
                          <input
                            type="date"
                            className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 outline-none transition-all"
                            value={form.gemOrderDate}
                            onChange={(e) => handleOrderDateChange(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Clock size={10} className="text-slate-400" /> Last Delivery Date
                          </label>
                          <input
                            type="date"
                            className={`w-full border p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 outline-none transition-all ${
                              !lastDateManuallySet && form.gemLastDate
                                ? 'border-emerald-300 bg-emerald-50/30'
                                : 'border-slate-300/80'
                            }`}
                            value={form.gemLastDate}
                            onChange={(e) => handleLastDateChange(e.target.value)}
                            min={form.gemOrderDate || undefined}
                          />
                          {daysDifference !== null && form.gemOrderDate && form.gemLastDate && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                daysDifference < 0
                                  ? 'bg-red-100 text-red-700 border border-red-200'
                                  : daysDifference <= 7
                                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}>
                                <Clock size={9} />
                                {daysDifference} day{daysDifference !== 1 ? 's' : ''} 
                                {daysDifference < 0 ? ' overdue' : ' window'}
                              </span>
                              {!lastDateManuallySet && (
                                <span className="text-[9px] text-slate-400 italic">auto-filled +15 days</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dynamic Platform Fields */}
                  {form.platform && getSelectedPlatformConfig()?.fields?.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 mt-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">⚙️</span>
                        <span className="text-xs font-extrabold text-slate-600 uppercase tracking-widest">Additional {form.platform} Details</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {getSelectedPlatformConfig().fields.map(f => (
                          <div key={f.guid} className="space-y-1.5">
                            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                              {f.fieldName} {f.isRequired === 1 && <span className="text-red-500">*</span>}
                            </label>
                            <input
                              type={f.fieldType}
                              required={f.isRequired === 1}
                              className="w-full border border-slate-300/80 p-2.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 outline-none transition-all"
                              value={form.platformFields?.[f.guid] || ""}
                              onChange={e => setForm(prev => ({
                                ...prev,
                                platformFields: { ...prev.platformFields, [f.guid]: e.target.value }
                              }))}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ═══ PRICING & QUANTITY SECTION ═══ */}
                  {itemType === "serialized" && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
                        <IndianRupee size={16} className="text-white" />
                      </div>
                      <h3 className="text-sm font-extrabold text-emerald-900 tracking-wide">Pricing & Quantity</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Unit Selling Price */}
                      {activeTab === "single" && (
                        <div className="space-y-3">
                          <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-widest flex items-center gap-1">
                            Unit Selling Price <span className="text-red-500">*</span>
                          </label>
                          <div className="relative group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 font-extrabold text-xl">₹</span>
                            <input 
                              type="number"
                              className={`w-full h-14 pl-10 bg-white border border-emerald-200 rounded-xl text-2xl font-extrabold text-slate-700 placeholder-slate-300 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all ${
                                form.mrp > 0 ? "pr-32" : "pr-4"
                              }`}
                              placeholder="0.00"
                              value={form.sellingPrice}
                              onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                              required
                            />
                            {form.mrp > 0 && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                <button
                                  type="button"
                                  onClick={() => setForm({ ...form, sellingPrice: String(form.mrp) })}
                                  className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-lg border border-emerald-200 hover:bg-emerald-200 transition-colors"
                                >
                                  MRP ₹{form.mrp.toLocaleString("en-IN")}
                                </button>
                              </div>
                            )}
                          </div>
                          {profit !== null && form.landingPrice > 0 && (
                            <div className="flex items-center justify-between p-2 bg-white/50 border border-emerald-100 rounded-lg">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Landing: ₹{form.landingPrice}</span>
                              <span className={`text-[10px] font-bold uppercase flex items-center gap-1 ${profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {profit >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {profit >= 0 ? "Profit" : "Loss"}: ₹{Math.abs(profit)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Quantity */}
                      <div className={activeTab === "multiple" ? "md:col-span-2 space-y-3" : "space-y-3"}>
                        <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-widest flex items-center gap-2">
                          <Layers size={12} className={activeTab === "single" ? "text-slate-400" : "text-indigo-500"} />
                          Quantity
                        </label>
                        {activeTab === "single" ? (
                          <div className="space-y-2">
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl w-fit p-1">
                              <div className="w-12 h-10 flex items-center justify-center text-slate-300">
                                <Minus size={20} />
                              </div>
                              <div className="w-16 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-100 shadow-sm">
                                <span className="text-xl font-extrabold text-slate-400">1</span>
                              </div>
                              <div className="w-12 h-10 flex items-center justify-center text-slate-300">
                                <Plus size={20} />
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                              <CircleDot size={12} /> Fixed at 1 for single item
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center bg-white border border-indigo-200 rounded-xl w-fit p-1 shadow-sm">
                              <button 
                                type="button"
                                onClick={decrementQuantity} 
                                className="w-12 h-10 flex items-center justify-center text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                              >
                                <Minus size={20} />
                              </button>
                              <input 
                                type="number"
                                min="1"
                                value={form.quantity}
                                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                                className="w-20 h-10 text-center text-xl font-extrabold text-indigo-700 outline-none border-x border-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button 
                                type="button"
                                onClick={incrementQuantity} 
                                className="w-12 h-10 flex items-center justify-center text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                              >
                                <Plus size={20} />
                              </button>
                            </div>
                            <p className="text-[11px] text-indigo-600 font-medium flex items-center gap-1.5">
                              <Zap size={12} className="fill-current" /> Editable for bulk shipments
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              )}

                {/* ═══ Non-Serialized Item Section ═══ */}
                {itemType === "nonSerialized" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="p-1.5 bg-amber-100 rounded-lg">
                        <Box size={13} className="text-amber-600" />
                      </div>
                      <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">Non-Serialized Item</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Item (Item Master) <span className="text-red-500">*</span></label>
                        <select
                          className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 outline-none"
                          value={nonSerializedItemVariantId}
                          onChange={(e) => setNonSerializedItemVariantId(e.target.value)}
                          disabled={loadingItemMaster}
                        >
                          <option value="">{loadingItemMaster ? "Loading items..." : "Select item"}</option>
                          {itemMasterVariants.map((v) => (
                            <option key={v.itemVariantId} value={v.itemVariantId}>
                              {v.itemName} — {v.variantName} (Stock: {v.availablePCS ?? 0})
                            </option>
                          ))}
                        </select>
                        {!loadingItemMaster && itemMasterVariants.length === 0 && (
                          <p className="text-xs text-amber-600">No items found in Item Master — add one under Item Master first.</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Quantity <span className="text-red-500">*</span></label>
                        <input
                          type="number"
                          min="1"
                          max={selectedItemMasterVariant?.availablePCS ?? undefined}
                          className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 outline-none"
                          value={nonSerializedQty}
                          onChange={(e) => setNonSerializedQty(e.target.value)}
                        />
                        {selectedItemMasterVariant && (
                          <p className="text-xs text-slate-400">Available stock: {selectedItemMasterVariant.availablePCS ?? 0}</p>
                        )}
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-sm font-medium text-slate-700">Unit Selling Price <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-600 font-bold text-lg">₹</span>
                          <input
                            type="number"
                            className="w-full border border-slate-200 pl-9 p-3 rounded-xl text-sm focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 outline-none"
                            placeholder="0.00"
                            value={form.sellingPrice}
                            onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ Section 2: Scan Inventory ═══ */}
                <div className={`relative space-y-3 ${itemType === "nonSerialized" ? "opacity-50 pointer-events-none select-none" : ""}`}>
                  {itemType === "nonSerialized" && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 rounded-2xl">
                      <span className="flex items-center gap-1.5 bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                        <Box size={12} /> Not used for Non-Serialized items
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-purple-100 rounded-lg">
                        <ScanLine size={13} className="text-purple-600" />
                      </div>
                      <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">Scan Inventory</h3>
                    </div>

                    {activeTab === "multiple" && multipleQuantity > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="w-36 h-2.5 bg-slate-200/80 rounded-full overflow-hidden shadow-inner">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                              progressPercentage === 100
                                ? "bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-sm shadow-emerald-500/30"
                                : "bg-gradient-to-r from-indigo-400 to-purple-500 shadow-sm shadow-indigo-500/30"
                            }`}
                            style={{ width: `${progressPercentage}%` }}
                          ></div>
                        </div>
                        <span className={`text-xs font-extrabold px-3 py-1.5 rounded-full shadow-sm ${
                          progressPercentage === 100
                            ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 border border-indigo-200'
                        }`}>
                          {batchList.length} / {form.quantity}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Scanner Input */}
                  <div className="relative">
                    <div className={`absolute inset-0 rounded-2xl transition-all duration-500 ${
                      isProcessing ? "bg-indigo-400/20 blur-xl scale-105" : "bg-transparent blur-none scale-100"
                    }`}></div>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 z-10">
                        <div className={`p-2.5 rounded-xl text-white shadow-lg transition-all duration-300 ${
                          isProcessing
                            ? "bg-gradient-to-br from-purple-500 to-pink-600 shadow-purple-500/30 animate-pulse"
                            : "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/30 group-focus-within:shadow-xl group-focus-within:shadow-indigo-500/40 group-focus-within:scale-110"
                        }`}>
                          <ScanLine size={20} />
                        </div>
                      </div>
                      <input
                        ref={inputRef}
                        className={`w-full border-2 bg-white p-5 pl-20 pr-14 rounded-2xl text-lg focus:ring-4 outline-none transition-all duration-300 font-mono tracking-wider shadow-lg hover:shadow-xl ${
                          activeTab === "multiple" && batchList.length >= (Number(form.quantity) || 1)
                            ? "border-emerald-300 bg-emerald-50/80 text-emerald-700 cursor-not-allowed"
                            : "border-slate-200 focus:ring-indigo-400/20 focus:border-indigo-400 text-slate-700 hover:border-slate-300"
                        }`}
                        placeholder={
                          activeTab === "multiple" && batchList.length >= (Number(form.quantity) || 1)
                            ? "✓ Target reached! Ready to submit"
                            : "Click here & scan barcode..."
                        }
                        value={form.serialInput}
                        onChange={(e) => handleSerialChange(e.target.value.toUpperCase())}
                        onKeyDown={handleKeyDown}
                        disabled={activeTab === "multiple" && batchList.length >= (Number(form.quantity) || 1)}
                        autoFocus
                      />
                      {isProcessing && (
                        <div className="absolute right-5 top-1/2 -translate-y-1/2">
                          <div className="w-7 h-7 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  {error && (
                    <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200/80 text-red-700 p-4 rounded-2xl flex items-start gap-3 shadow-sm animate-in slide-in-from-top-2">
                      <div className="p-1 bg-red-100 rounded-lg flex-shrink-0 mt-0.5">
                        <AlertCircle size={16} className="text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-extrabold text-xs uppercase tracking-wider text-red-800">Error</p>
                        <p className="text-sm mt-0.5 text-red-600">{error}</p>
                      </div>
                      <button type="button" onClick={() => setError("")} className="p-1.5 hover:bg-red-100 rounded-lg transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {successMsg && (
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 text-emerald-700 p-4 rounded-2xl flex items-center gap-3 shadow-sm animate-in slide-in-from-top-2">
                      <div className="p-1 bg-emerald-100 rounded-lg flex-shrink-0">
                        <CheckCircle size={16} className="text-emerald-600" />
                      </div>
                      <p className="font-bold text-sm">{successMsg}</p>
                    </div>
                  )}

                  {serialReturnWarning && (
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 text-amber-800 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
                      <div className="p-1 bg-amber-100 rounded-lg flex-shrink-0 mt-0.5">
                        <AlertCircle size={16} className="text-amber-600" />
                      </div>
                      <div>
                        <p className="font-extrabold text-[10px] uppercase tracking-widest text-amber-700 mb-1">Previous Return Warning</p>
                        <p className="font-semibold text-sm">{serialReturnWarning}</p>
                      </div>
                    </div>
                  )}

                  {/* Scanned Item Preview (Single) */}
                  {activeTab === "single" && form.serialId && (
                    <div className="bg-gradient-to-r from-slate-50/80 to-indigo-50/50 border border-slate-200/80 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className="absolute inset-0 bg-emerald-400 rounded-2xl blur-md opacity-20"></div>
                            <div className="relative p-3 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-2xl border border-emerald-200/50">
                              <CheckCircle size={24} className="text-emerald-600" />
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-1">Scanned Item</p>
                            <p className="font-mono text-xl font-extrabold text-slate-800 tracking-wider">{form.serialInput}</p>
                            <div className="flex items-center gap-2 mt-2.5">
                              <span className="text-[10px] font-bold bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-600 shadow-sm">
                                {form.companyName}
                              </span>
                              <span className="text-[10px] font-bold bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg text-indigo-700">
                                {form.modelName}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((prev) => ({
                              ...prev,
                              serialId: "",
                              serialInput: "",
                              modelName: "",
                              companyName: "",
                              landingPrice: 0,
                              mrp: 0,
                              modelGuid: null
                            }));
                            setSerialReturnWarning("");
                          }}
                          className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Batch Items List (Multiple) */}
                  {activeTab === "multiple" && batchList.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
                          Scanned Items
                        </span>
                        <button
                          type="button"
                          onClick={() => setBatchList([])}
                          className="text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Trash2 size={10} /> Clear All
                        </button>
                      </div>
                      <div className="border border-slate-200/80 rounded-2xl bg-slate-50/50 max-h-60 overflow-y-auto shadow-inner">
                        <div className="divide-y divide-slate-200/60">
                          {batchList.map((item, index) => (
                            <div key={item.serialId} className="flex items-center justify-between p-3 hover:bg-white transition-colors">
                              <div className="flex items-center gap-3">
                                <span className="w-7 h-7 flex items-center justify-center bg-indigo-100 text-indigo-700 text-[10px] font-extrabold rounded-lg">
                                  {index + 1}
                                </span>
                                <div>
                                  <p className="font-mono text-xs font-bold text-slate-800">{item.serialValue}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                      {item.companyName}
                                    </span>
                                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                      {item.modelName}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFromBatch(item.serialId)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ═══ Section 3: Batch Pricing ═══ */}
                {itemType === "serialized" && activeTab === "multiple" && batchList.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="p-1.5 bg-amber-100 rounded-lg">
                        <Calculator size={13} className="text-amber-600" />
                      </div>
                      <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">Pricing Summary</h3>
                    </div>

                    <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200/80">
                          <tr className="text-[10px] text-slate-500 uppercase font-extrabold tracking-widest">
                            <th className="px-6 py-4 text-left">Model</th>
                            <th className="px-4 py-4 text-center w-20">Qty</th>
                            <th className="px-4 py-4 text-left">Unit Price <span className="text-red-500">*</span></th>
                            <th className="px-6 py-4 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/80">
                          {batchSummary.map((group) => {
                            const price = modelPrices[group.modelGuid] || "";
                            const rowTotal = Number(price) * group.count;
                            return (
                              <tr key={group.modelGuid} className="hover:bg-slate-50/50 transition-colors duration-150">
                                <td className="px-6 py-4">
                                  <p className="font-extrabold text-slate-800 text-sm">{group.modelName}</p>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                      {group.companyName}
                                    </span>
                                    {group.mrp > 0 && (
                                      <span className="text-[9px] text-slate-400">
                                        MRP: ₹{group.mrp.toLocaleString("en-IN")}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-center w-20">
                                  <span className="inline-flex items-center justify-center w-9 h-9 bg-indigo-100 text-indigo-700 font-extrabold rounded-xl text-base">
                                    {group.count}
                                  </span>
                                </td>
                                <td className="px-4 py-4">
                                  <div className="relative max-w-[140px]">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                                    <input
                                      type="number"
                                      className={`w-full border-2 p-2.5 pl-7 pr-3 rounded-xl text-sm font-bold focus:ring-2 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                        price
                                          ? "border-emerald-200 bg-emerald-50/80 focus:ring-emerald-400/20 focus:border-emerald-400 text-emerald-800"
                                          : "border-red-200 bg-red-50/80 focus:ring-red-400/20 focus:border-red-400 text-red-800"
                                      }`}
                                      placeholder="0"
                                      value={price}
                                      onChange={(e) => updateModelPrice(group.modelGuid, e.target.value)}
                                    />
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span className="font-extrabold text-slate-800 text-lg">
                                    ₹{rowTotal.toLocaleString("en-IN")}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                            <td colSpan="3" className="px-6 py-4 text-right">
                              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                                Total Amount
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-2xl font-extrabold text-emerald-400">
                                ₹{batchTotalValue.toLocaleString("en-IN")}
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* ═══ Submit Button ═══ */}
                <div className="pt-6 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      !canManage ||
                      (itemType === "nonSerialized"
                        ? (!nonSerializedItemVariantId || !nonSerializedQty || Number(nonSerializedQty) <= 0 || !form.sellingPrice)
                        : (activeTab === "single" && !form.serialId) ||
                          (activeTab === "multiple" && batchList.length === 0))
                    }
                    className={`w-full py-4.5 rounded-2xl text-base font-extrabold flex items-center justify-center gap-3 transition-all duration-300 ${
                      isSubmitting ||
                      !canManage ||
                      (itemType === "nonSerialized"
                        ? (!nonSerializedItemVariantId || !nonSerializedQty || Number(nonSerializedQty) <= 0 || !form.sellingPrice)
                        : (activeTab === "single" && !form.serialId) ||
                          (activeTab === "multiple" && batchList.length === 0))
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                        : "bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:via-indigo-700 hover:to-purple-700 shadow-xl shadow-indigo-500/25 hover:shadow-2xl hover:shadow-indigo-500/35 hover:-translate-y-0.5 active:translate-y-0 active:shadow-lg"
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Processing Order...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={20} className="animate-pulse" />
                        <span>
                          {itemType === "nonSerialized"
                            ? `Confirm Order ${form.sellingPrice ? `• ₹${(Number(form.sellingPrice) * Number(nonSerializedQty || 1)).toLocaleString("en-IN")}` : ""}`
                            : activeTab === "single"
                              ? `Confirm Shipment ${form.sellingPrice ? `• ₹${Number(form.sellingPrice).toLocaleString("en-IN")}` : ""}`
                              : `Confirm Bulk Order • ₹${batchTotalValue.toLocaleString("en-IN")}`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ═══ RIGHT STATIC PANEL ═══ */}
          <div className={`relative ${itemType === "nonSerialized" ? "opacity-50 pointer-events-none select-none" : ""}`}>
            {itemType === "nonSerialized" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 rounded-2xl">
                <span className="flex items-center gap-1.5 bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                  <Box size={12} /> Not used for Non-Serialized items
                </span>
              </div>
            )}
            <SidePanel
              {...{
                activeTab, batchList, companyOptions, filteredModelsByCompany,
                getCompanyName, getSerialValue, models, processSerial, selectedCompany,
                selectedModelId, selectedPanelSerials, setForm, setSelectedCompany,
                setSelectedModelId, itemNameOptions, selectedItemName, setSelectedItemName,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


