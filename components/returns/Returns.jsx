"use client";
import React, { useState, useEffect, useRef } from "react";
import Swal from 'sweetalert2';

import { printerService } from "@/lib/services/api";
import { useToast } from "@/lib/client/ToastContext";
import { hasPermission } from "@/lib/client/rbac";
import { 
  RotateCcw, History, Trash2, CheckCircle2, AlertTriangle, 
  Search, ScanLine, Box, Calendar, ShoppingCart, Zap, X,
  AlertCircle, Receipt, FileText, ExternalLink, MapPin, Truck, Phone, Edit, Palette
} from "lucide-react"; 
import { format } from "date-fns";
import axios from "axios";
import AppearanceModal from "@/components/common/AppearanceModal";
import ReturnsModals from "./ReturnsModals";
import {
  extractReturnsArray, getReturnSerial, getReturnModelName, getReturnFirmName,
  getReturnCustomerName, getReturnOrderId, getReturnReason, getReturnStatus,
  getReturnLogisticsStatus, getReturnTrackingId, getReturnDispatchDate,
  getReturnInvoiceNumber, getReturnShippingAddress, getReturnTimestamp,
  getReturnDispatchId, getUploadFileUrl, sortReturns, normalizeReturns,
  mergeReturnIntoList, createOptimisticReturn,
} from "@/lib/returnsHelpers";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function Returns({ returns = [], isLoaded = false, onRefresh, isAdmin, isSupervisor, currentUser }) {
  const toast = useToast();
  // "returns" isn't a PROTECTED_EDIT_PERMISSIONS tab — same orphaned-flag bug
  // already fixed elsewhere (allow_edit_returns has no checkbox anywhere in
  // Manage Roles). View access to "returns" alone should be enough.
  const canManage = currentUser?.role === 'Admin' || hasPermission(currentUser, 'returns') || !!currentUser?.allow_edit_returns;
  // Delete is Admin-only by default, delegable via the "Delete Returns"
  // Manage Roles checkbox (allow_delete_returns) — see lib/returnsAuth.js.
  const canDelete = currentUser?.role === 'Admin' || !!currentUser?.allow_delete_returns;
  const [serialInput, setSerialInput] = useState("");
  const [returnsList, setReturnsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  
  const [searchTerm, setSearchTerm] = useState("");
  const [showConditionModal, setShowConditionModal] = useState(false);
  const [pendingSerial, setPendingSerial] = useState("");
  const [pendingSerialDetails, setPendingSerialDetails] = useState(null);
  const [condition, setCondition] = useState("InStock");
  const [reason, setReason] = useState("");
  const [refundStatus, setRefundStatus] = useState("Full");
  const [refundAmount, setRefundAmount] = useState("");
  const [selectedReturnOrder, setSelectedReturnOrder] = useState(null);
  const [selectedDispatchDetails, setSelectedDispatchDetails] = useState(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);
  const [orderDetailsError, setOrderDetailsError] = useState("");
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const [activeTab, setActiveTab] = useState("current"); // "current" or "stationery"

  // Pagination states
  const [currentPageCurrent, setCurrentPageCurrent] = useState(1);
  const [pageSizeCurrent, setPageSizeCurrent] = useState(10);
  
  const [currentPageStationery, setCurrentPageStationery] = useState(1);
  const [pageSizeStationery, setPageSizeStationery] = useState(10);

  const [appearanceModalOpen, setAppearanceModalOpen] = useState(false);
  const [appearanceItem, setAppearanceItem] = useState(null);

  const openAppearanceModal = (e, item) => {
    e.stopPropagation();
    setAppearanceItem(item);
    setAppearanceModalOpen(true);
  };

  // Stationery Return State
  const [stationerySearch, setStationerySearch] = useState("");
  const [searchingOrder, setSearchingOrder] = useState(false);
  const [orderFound, setOrderFound] = useState(null);
  const [stationeryForm, setStationeryForm] = useState({
    isSameItemReceived: true,
    isConditionCorrect: true,
    originalItemSent: "",
    itemReceivedInstead: "",
    isCompensationReceived: false,
    compensationAmount: "",
    remarks: ""
  });
  const [stationeryHistory, setStationeryHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submittingStationery, setSubmittingStationery] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    if (isLoaded) {
      // Intentionally skipped to avoid infinite loops if 'returns' array reference changes
    } else {
      loadData();
    }
    loadStationeryHistory();
    if(inputRef.current) inputRef.current.focus();
  }, [isLoaded]); // Remove returns from dependencies to prevent infinite loop

  // Separate effect to sync returns when provided by parent
  useEffect(() => {
    if (isLoaded) {
      setReturnsList(normalizeReturns(returns));
    }
  }, [returns, isLoaded]);

  const loadStationeryHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await printerService.getStationeryReturnsHistory();
      setStationeryHistory(res.data || []);
    } catch (err) {
      console.error("Failed to load stationery history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSearchOrder = async () => {
    if (!stationerySearch.trim()) return;
    setSearchingOrder(true);
    setOrderFound(null);
    try {
      const res = await printerService.searchOrderForReturn(encodeURIComponent(stationerySearch.trim()));
      setOrderFound(res.data);
      setStationeryForm({
        ...stationeryForm,
        originalItemSent: res.data.items.map(i => `${i.itemName} (${i.variantName})`).join(", ")
      });
    } catch (err) {
      toast.error(err.response?.data?.message || "Order not found");
    } finally {
      setSearchingOrder(false);
    }
  };

  const handleStationerySubmit = async () => {
    if (!orderFound) return;
    
    // Validation
    if (!stationeryForm.isSameItemReceived && !stationeryForm.itemReceivedInstead) {
      return toast.warning("Please specify which item was received instead");
    }

    setSubmittingStationery(true);
    try {
      await printerService.saveStationeryReturn({
        stockOutId: orderFound.stockOutId,
        trackingId: stationerySearch, // Using search query as tracking ID if it's the tracking ID
        ...stationeryForm
      });
      
      toast.success("Stationery return verified and saved");
      
      // Reset
      setOrderFound(null);
      setStationerySearch("");
      setStationeryForm({
        isSameItemReceived: true,
        isConditionCorrect: true,
        originalItemSent: "",
        itemReceivedInstead: "",
        isCompensationReceived: false,
        compensationAmount: "",
        remarks: ""
      });
      loadStationeryHistory();
    } catch {
      toast.error("Failed to save stationery return");
    } finally {
      setSubmittingStationery(false);
    }
  };

  const handleUpdateCompensation = async (item) => {
    const { value: formValues } = await Swal.fire({
      title: 'Update Compensation',
      html: `
        <div class="space-y-4 text-left">
          <div class="flex items-center gap-2 mb-2">
            <input type="checkbox" id="swal-comp-received" ${item.isCompensationReceived ? 'checked' : ''} class="w-4 h-4">
            <label for="swal-comp-received" class="text-sm font-bold">Compensation Received?</label>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Amount (₹)</label>
            <input id="swal-comp-amount" type="number" class="swal2-input" placeholder="Amount" value="${item.compensationAmount || 0}">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Remarks</label>
            <textarea id="swal-comp-remarks" class="swal2-textarea" placeholder="Update remarks...">${item.remarks || ''}</textarea>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Update',
      preConfirm: () => {
        return {
          isCompensationReceived: document.getElementById('swal-comp-received').checked,
          compensationAmount: document.getElementById('swal-comp-amount').value,
          remarks: document.getElementById('swal-comp-remarks').value
        }
      }
    });

    if (formValues) {
      try {
        await printerService.updateStationeryCompensation({
          returnId: item.returnId,
          ...formValues
        });
        toast.success("Compensation details updated successfully");
        loadStationeryHistory();
      } catch {
        toast.error("Failed to update compensation");
      }
    }
  };

  // Refund confirmation from the marketplace/customer very often lands
  // after the item's already been marked returned — this lets that be
  // filled in (or corrected) later instead of being stuck at whatever was
  // entered, or left blank, at return time.
  const handleEditRefund = async (item) => {
    const itemId = item?.id || item?.guid;
    if (!itemId) return;

    const { value: formValues } = await Swal.fire({
      title: 'Update Refund',
      html: `
        <div class="space-y-4 text-left">
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Refund Status</label>
            <select id="swal-refund-status" class="swal2-select" style="margin:0; width:100%; border:1px solid #d9d9d9; border-radius:0.375em; padding:0.75em; font-size:1em; box-sizing:border-box; background-color:#fff;">
              <option value="Full" ${item.refundStatus === 'Full' ? 'selected' : ''}>Full Refund</option>
              <option value="Partial" ${item.refundStatus === 'Partial' ? 'selected' : ''}>Partial Refund</option>
              <option value="None" ${item.refundStatus === 'None' ? 'selected' : ''}>No Refund</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Refund Amount (₹)</label>
            <input id="swal-refund-amount" type="number" min="0" class="swal2-input" placeholder="Amount" value="${item.refundAmount || 0}">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Update',
      didOpen: () => {
        const statusEl = document.getElementById('swal-refund-status');
        const amountEl = document.getElementById('swal-refund-amount');
        const syncDisabled = () => { amountEl.disabled = statusEl.value === 'None'; if (statusEl.value === 'None') amountEl.value = 0; };
        statusEl.addEventListener('change', syncDisabled);
        syncDisabled();
      },
      preConfirm: () => {
        const refundStatus = document.getElementById('swal-refund-status').value;
        const refundAmount = document.getElementById('swal-refund-amount').value;
        if (refundStatus !== 'None' && (!refundAmount || Number(refundAmount) <= 0)) {
          Swal.showValidationMessage('Refund amount is required for Full/Partial refunds');
          return false;
        }
        return { refundStatus, refundAmount: refundStatus === 'None' ? 0 : Number(refundAmount) };
      }
    });

    if (formValues) {
      try {
        await printerService.updateReturnRefund(itemId, formValues);
        toast.success('Refund details updated successfully');
        await loadData();
        if (onRefresh) await onRefresh();
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to update refund details');
      }
    }
  };

  const getConditionMeta = (value) => {
    const normalized = (value || "").toString().trim().toLowerCase();

    if (normalized === "damaged") {
      return {
        label: "Damaged",
        className: "bg-red-50 text-red-700 border-red-100",
        dotClassName: "bg-red-500"
      };
    }

    return {
      label: "In Stock",
      className: "bg-emerald-50 text-emerald-700 border-emerald-100",
      dotClassName: "bg-emerald-500"
    };
  };

  const _loadDataLegacy = async () => {
    try {
      setLoading(true);
      
      // ✅ Ensure we hit the correct endpoint directly via axios 
      // just like the POST request to avoid printerService misconfiguration/caching
      let token = sessionStorage.getItem("pt_auth_token");

      let rData;
      try {
        const response = await axios.get(`${API_BASE_URL}/api/returns`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        rData = response.data;
      } catch (apiErr) {
        console.warn("Direct API fetch failed, falling back to printerService:", apiErr);
        rData = await printerService.getReturns();
      }

      console.log("Raw Returns Data API Response:", rData);
      
      let rArray = [];
      if (Array.isArray(rData)) rArray = rData;
      else if (rData?.data && Array.isArray(rData.data)) rArray = rData.data;
      else if (rData?.data?.data && Array.isArray(rData.data.data)) rArray = rData.data.data;
      else if (rData?.data?.returns && Array.isArray(rData.data.returns)) rArray = rData.data.returns;
      else if (rData?.returns && Array.isArray(rData.returns)) rArray = rData.returns;
      else if (rData?.results && Array.isArray(rData.results)) rArray = rData.results;
      else if (rData?.docs && Array.isArray(rData.docs)) rArray = rData.docs;
      else if (rData?.data?.docs && Array.isArray(rData.data.docs)) rArray = rData.data.docs;

      // Group returns by serial to handle duplicate rows and compute returnCount
      const grouped = {};
      rArray.forEach((item, index) => {
        if (!item) return;
        
        // Robust extraction covering all possible API population structures
        const extractedSerial = item.serialValue || item.serialNumber || item.serial?.value || item.serial?.serialNumber || item.serialGuid?.value || item.serialGuid?.serialNumber || item.serialId?.value || item.serialId?.serialNumber || "N/A";
        
        // Safely extract nested properties in case they are populated inside relations like serialGuid or dispatchGuid
        const extractedModelName = item.modelName || item.model?.name || item.modelGuid?.name || item.serialGuid?.modelGuid?.name || item.serialId?.modelGuid?.name || "N/A";
        const extractedFirmName = item.firmName || item.dispatchGuid?.firmName || item.dispatch?.firmName || item.orderId?.firmName || item.order?.firmName || "N/A";
        const extractedCustomerName = item.customerName || item.dispatchGuid?.customerName || item.dispatch?.customerName || item.orderId?.customerName || item.order?.customerName || "N/A";

        const groupKey = extractedSerial !== "N/A" ? extractedSerial : (item.guid || item.guid || index);

        if (!grouped[groupKey]) {
          grouped[groupKey] = { 
            ...item, 
            displaySerial: extractedSerial,
            modelName: extractedModelName,
            firmName: extractedFirmName,
            customerName: extractedCustomerName,
            returnCount: 1, 
            allReturnDates: item.returnDate ? [item.returnDate] : item.createdAt ? [item.createdAt] : [] 
          };
        } else {
          grouped[groupKey].returnCount += 1;
          if (item.returnDate || item.createdAt) {
            grouped[groupKey].allReturnDates.push(item.returnDate || item.createdAt);
          }
          
          // Keep the latest status and details
          const existingDate = new Date(grouped[groupKey].returnDate || grouped[groupKey].createdAt || 0);
          const newDate = new Date(item.returnDate || item.createdAt || 0);
          if (newDate >= existingDate) {
            grouped[groupKey].condition = item.condition || grouped[groupKey].condition;
            grouped[groupKey].returnDate = item.returnDate || grouped[groupKey].returnDate;
            grouped[groupKey].firmName = extractedFirmName !== "N/A" ? extractedFirmName : grouped[groupKey].firmName;
            grouped[groupKey].customerName = extractedCustomerName !== "N/A" ? extractedCustomerName : grouped[groupKey].customerName;
            grouped[groupKey].reason = item.reason || grouped[groupKey].reason;
            grouped[groupKey].refundStatus = item.refundStatus || grouped[groupKey].refundStatus;
            grouped[groupKey].refundAmount = item.refundAmount !== undefined ? item.refundAmount : grouped[groupKey].refundAmount;
            grouped[groupKey].id = item.guid || item.guid || grouped[groupKey].id;
            grouped[groupKey].serialGuid = item.serialGuid || grouped[groupKey].serialGuid;
            grouped[groupKey].modelName = extractedModelName !== "N/A" ? extractedModelName : grouped[groupKey].modelName;
            grouped[groupKey].displaySerial = extractedSerial !== "N/A" ? extractedSerial : grouped[groupKey].displaySerial;
            grouped[groupKey].createdAt = item.createdAt || grouped[groupKey].createdAt;
          }
        }
      });

      // Sort the return dates inside each group for the tooltip (latest first)
      Object.values(grouped).forEach(g => {
        if (g.allReturnDates) {
          g.allReturnDates.sort((a, b) => new Date(b) - new Date(a));
        }
      });

      const uniqueReturns = Object.values(grouped);
      
      // Sort uniqueReturns by returnDate descending so table is ordered latest first
      uniqueReturns.sort((a, b) => new Date(b.returnDate || b.createdAt || 0) - new Date(a.returnDate || a.createdAt || 0));
      
      console.log("Processed Unique Returns:", uniqueReturns);
      setReturnsList(uniqueReturns);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const rData = await printerService.getReturns();
      setReturnsList(normalizeReturns(rData));
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredReturns = returnsList.filter((item) => {
    // Tab based filtering
    if (activeTab === "current") {
      if (item.modelName === "Stationery") return false;
      if (item.condition === "Damaged") return false;
    } else if (activeTab === "stationery") {
      if (item.modelName !== "Stationery") return false;
    }

    const search = searchTerm.toLowerCase();
    return (
        (item.displaySerial || item.serialValue || "").toString().toLowerCase().includes(search) ||
        (item.modelName || "").toString().toLowerCase().includes(search) ||
        (item.firmName || "").toString().toLowerCase().includes(search) ||
        (item.customerName || "").toString().toLowerCase().includes(search) ||
        (item.dispatchGuid || "").toString().toLowerCase().includes(search) ||
        (item.invoiceNumber || "").toString().toLowerCase().includes(search) ||
        (item.reason || "").toString().toLowerCase().includes(search)
    );
  });

  const initiateReturn = async (value) => {
    const serialVal = value.trim().toUpperCase();
    if (!serialVal) return;

    setLoading(true);
    try {
      const data = await printerService.getReturnLookup(serialVal);

      if (!data.canReturn && !data.isInventoryItem) {
         if (data.currentStatus === "Available" || data.currentStatus === "Damaged") {
           setMessage({ type: "error", text: `⚠️ Item is already ${data.currentStatus}.` });
         } else if (data.existingReturnForLinkedOrder) {
           setMessage({ type: "error", text: "⚠️ This order is already marked as returned." });
         } else if (!data.linkedOrder) {
           setMessage({ type: "error", text: "⚠️ No dispatch record found for this serial to return." });
         } else {
           setMessage({ type: "error", text: `⚠️ Cannot return. Status is ${data.currentStatus}.` });
         }
         setSerialInput("");
         setLoading(false);
         return;
      }

      // ✅ NEW CHECK: Enforce that the item is Delivered before allowing a return (only for serial items or if order exists)
      if (data.linkedOrder) {
        const orderStatus = String(data.linkedOrder?.status || "").trim();
        const logStatus = String(data.linkedOrder?.logisticsStatus || "").trim();
        
        const canReturn =
          logStatus === "Delivered" ||
          logStatus === "RTO" ||
          orderStatus === "Delivered" ||
          orderStatus === "Completed" ||
          orderStatus === "Payment Pending" ||
          orderStatus === "Partially Returned";
        if (!canReturn) {
          setMessage({ 
            type: "error", 
            text: `⚠️ Cannot return. Item must be 'Delivered' or 'RTO' first. (Current Status: ${logStatus || orderStatus || data.currentStatus})` 
          });
          setSerialInput("");
          setLoading(false);
          return;
        }
      }

      setPendingSerial(serialVal);
      setPendingSerialDetails(data);
      
      const result = await Swal.fire({
        title: "Select Item Condition",
        text: `Is the returned item (${serialVal}) in Good condition or Damaged?`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Good Condition",
        cancelButtonText: "Damaged Item",
        confirmButtonColor: "#10B981",
        cancelButtonColor: "#EF4444",
        reverseButtons: true
      });

      if (result.isConfirmed) {
        // Good condition
        setCondition("InStock");
        setReason("");
        setReturnQuantity(1);
        setRefundStatus("Full");
        setRefundAmount(data?.linkedOrder?.sellingPrice || "");
        setShowConditionModal(true);
        setMessage({ type: "", text: "" });
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        // Damaged condition
        const { value: damReason } = await Swal.fire({
          title: "Enter Return Reason",
          input: "textarea",
          inputLabel: "Why is this item being marked as damaged?",
          inputPlaceholder: "Enter damage details or reason for return...",
          showCancelButton: true,
          inputValidator: (value) => {
            if (!value) {
              return "Reason is mandatory!";
            }
          }
        });
        
        if (damReason) {
          setLoading(true);
          try {
            const dispatchGuid = data?.linkedOrder?.id || data?.linkedOrder?.guid;
            const res = await printerService.addReturn({
              serialValue: serialVal,
              condition: "Damaged",
              reason: damReason,
              refundStatus: "None",
              refundAmount: 0,
              dispatchGuid,
              returnedBy: currentUser?.username || "Admin",
              itemVariantId: data?.itemVariantId,
              quantity: data?.isInventoryItem ? 1 : 1,
              isInventoryItem: data?.isInventoryItem
            });
            
            setMessage({ 
              type: "success", 
              text: `✅ Success! ${res.serialValue} marked as Damaged and moved to Damaged Tab.` 
            });
            setSerialInput("");
            await loadData();
            if (onRefresh) await onRefresh();
          } catch (error) {
            setMessage({ 
              type: "error", 
              text: error.response?.data?.message || "❌ Failed to return item." 
            });
          } finally {
            setLoading(false);
          }
        } else {
          setSerialInput("");
        }
      } else {
        setSerialInput("");
      } 
    } catch (err) {
      if (err.response?.status === 404) {
        setMessage({ type: "error", text: `❌ Serial ${serialVal} not found in system!` });
      } else {
        setMessage({ type: "error", text: "❌ Failed to fetch serial details." });
      }
      setSerialInput("");
    } finally {
      setLoading(false);
    }
  };

  const confirmReturn = async () => {
    if (!reason.trim()) {
      setMessage({ type: "error", text: "⚠️ Return reason is mandatory." });
      return;
    }
    if (refundStatus !== "None" && (!refundAmount || Number(refundAmount) <= 0)) {
      setMessage({ type: "error", text: "⚠️ Refund amount is required for Full/Partial refunds." });
      return;
    }
    setShowConditionModal(false);
    if(loading) return; 
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const dispatchGuid = pendingSerialDetails?.linkedOrder?.id || pendingSerialDetails?.linkedOrder?.guid;
      const result = await printerService.addReturn({
        serialValue: pendingSerial,
        condition,
        reason,
        refundStatus,
        refundAmount: refundStatus === "None" ? 0 : Number(refundAmount),
        dispatchGuid,
        returnedBy: currentUser?.username || "Admin",
        itemVariantId: pendingSerialDetails?.itemVariantId,
        quantity: pendingSerialDetails?.isInventoryItem ? returnQuantity : 1,
        isInventoryItem: pendingSerialDetails?.isInventoryItem
      });
      const statusText = result.condition === "Damaged" ? "moved to Damaged Tab" : "restocked";
      
      setMessage({ 
        type: "success", 
        text: `✅ Success! ${result.serialValue} marked as ${result.condition}. ${statusText}.` 
      });
      
      setSerialInput("");
      setPendingSerial("");
      setPendingSerialDetails(null);
      setReason("");
      setRefundStatus("Full");
      setRefundAmount("");
      setReturnsList((currentList) =>
        mergeReturnIntoList(
          currentList,
          createOptimisticReturn({
            result,
            serialValue: pendingSerial,
            serialDetails: pendingSerialDetails,
            selectedCondition: condition,
            returnReason: reason,
            refundStatus,
            refundAmount: refundStatus === "None" ? 0 : Number(refundAmount),
            currentUser
          })
        )
      );
      await loadData();
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      setMessage({ 
        type: "error", 
        text: error.response?.data?.message || "❌ Failed to return item." 
      });
    } finally {
      setLoading(false);
      setTimeout(() => { if(inputRef.current) inputRef.current.focus(); }, 100);
    }
  };

  const handleDelete = async (item) => {
    const itemId = item?.id || item?.guid;

    if (!itemId) {
      toast.error("Could not find item ID to delete.");
      console.error("Item to delete has no id or guid:", item);
      return;
    }

    if (!canDelete) { toast.error("Access Denied: Requires Delete Permission."); return; }

    const result = await Swal.fire({
      title: "Are you sure?",
      text: "Delete this return record? This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EF4444",
      cancelButtonColor: "#6B7280",
      confirmButtonText: "Yes, delete!",
      cancelButtonText: "No, cancel"
    });

    if (result.isConfirmed) {

      setDeletingId(itemId);
      try {
        await printerService.deleteReturn(itemId);
        await loadData();
        if (onRefresh) {
          await onRefresh();
        }
        toast.success("The return record has been deleted successfully.");
      } catch (error) {
        console.error("❌ Delete failed:", error);
        console.error("❌ Error response:", error.response?.data);
        toast.error(`Failed to delete: ${error.response?.data?.message || error.message || "Unknown error"}`);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleChange = (e) => {
    const val = e.target.value.toUpperCase();
    setSerialInput(val);
    
    if (val.length >= 10) { 
        if (!loading) {
           // Wait for enter key
        }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      initiateReturn(serialInput);
    }
  };

  const closeOrderDetails = () => {
    setSelectedReturnOrder(null);
    setSelectedDispatchDetails(null);
    setLoadingOrderDetails(false);
    setOrderDetailsError("");
  };

  const handleOpenUploadFile = async (filename, label = "File") => {
    const fileUrl = getUploadFileUrl(filename);

    if (!fileUrl) {
      setOrderDetailsError(`${label} file not uploaded.`);
      return;
    }

    try {
      setOrderDetailsError("");
      const response = await fetch(fileUrl, { method: "HEAD" });

      if (!response.ok) {
        throw new Error(`${label} file not found`);
      }

      window.open(fileUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error(`Failed to open ${label.toLowerCase()} file:`, error);
      setOrderDetailsError(`${label} file not found on server. Please upload it again.`);
    }
  };

  const handleOpenOrderDetails = async (item) => {
    const dispatchGuid = getReturnDispatchId(item);

    setSelectedReturnOrder(item);
    setSelectedDispatchDetails(null);
    setOrderDetailsError("");
    setLoadingOrderDetails(!!dispatchGuid);

    if (!dispatchGuid) {
      // Open the modal with the return record itself even when linked dispatch/order
      // is not available in the payload.
      return;
    }

    try {
      const dispatchDetails = await printerService.getDispatchById(dispatchGuid);
      if (!dispatchDetails) {
        setOrderDetailsError("Could not fetch order details.");
        return;
      }
      setSelectedDispatchDetails(dispatchDetails);
    } catch (error) {
      console.error("Failed to load order details:", error);
      setOrderDetailsError("Could not load order details.");
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  // Was `selectedDispatchDetails || selectedReturnOrder` — every getReturnXxx
  // helper (lib/returnsHelpers.js) ends its own fallback chain with "N/A",
  // which is truthy, so ReturnsModals.jsx's
  // `getReturnXxx(orderDetails) || getReturnXxx(selectedReturnOrder)` calls
  // could never actually reach the selectedReturnOrder fallback — the first
  // call always resolved to at least "N/A" and short-circuited there. That
  // silently hid fields that only exist on the return record itself (e.g.
  // `reason`, `refundStatus`) whenever the fetched dispatch/order object
  // didn't happen to carry a same-named field (the order API has no
  // "reason" concept at all — only `remarks`, which is a different, often-
  // empty field). Merging instead of `||`-selecting one or the other means
  // every field from both objects is available, with dispatch/order data
  // (more authoritative for order-specific fields) taking priority.
  const orderDetails = selectedDispatchDetails ? { ...selectedReturnOrder, ...selectedDispatchDetails } : selectedReturnOrder;
  const orderDetailsDispatchId = getReturnDispatchId(selectedDispatchDetails) || getReturnDispatchId(selectedReturnOrder);
  const orderDetailsId = getReturnOrderId(orderDetails) || getReturnOrderId(selectedReturnOrder) || orderDetails?.customerName || "N/A";
  const orderInvoiceUrl = getUploadFileUrl(orderDetails?.invoiceFilename || selectedReturnOrder?.invoiceFilename);

  return (
    <div className="space-y-6 relative pb-20">
      
      {/* Header Section */}
      <div className="relative">
        <div className="absolute -top-4 -left-4 w-48 h-48 bg-gradient-to-br from-orange-500/10 to-red-500/10 rounded-full blur-3xl -z-10" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg shadow-md shadow-orange-500/25">
                <RotateCcw size={14} className="text-white" />
              </div>
              <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                Returns Processing
              </span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">Returns Management</h1>
            <p className="text-xs text-slate-500">Manage customer returns and stationery verification</p>
          </div>
          
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => setActiveTab("current")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "current" ? "bg-white text-orange-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Current Return ({returnsList.filter(item => item.condition !== "Damaged" && item.modelName !== "Stationery").length})
            </button>
            <button 
              onClick={() => setActiveTab("stationery")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "stationery" ? "bg-white text-orange-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Stationery Return ({returnsList.filter(item => item.modelName === "Stationery").length})
            </button>
          </div>
        </div>
      </div>

      {activeTab === "current" ? (
        <>

      <div className={`grid grid-cols-1 ${!isSupervisor ? 'lg:grid-cols-3' : ''} gap-6`}>
        
        {/* Scan Section */}
        {!isSupervisor && <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-orange-500 to-red-500 px-5 py-4 flex justify-between items-center text-white">
            <div className="flex items-center gap-2">
              <ScanLine size={18} />
              <h3 className="font-bold text-sm">Process Return</h3>
            </div>
            <div className="flex items-center gap-1.5 bg-white/20 px-2 py-1 rounded-lg text-[10px] font-medium">
              <Zap size={10} /> Auto-Scan Ready
            </div>
          </div>
          
          <div className="p-6 flex-1 flex flex-col justify-center">
            <div className="relative mb-4">
              <ScanLine size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                ref={inputRef} 
                className="w-full border-2 border-slate-200 p-4 pl-12 pr-16 rounded-xl text-lg bg-slate-50 focus:bg-white focus:ring-4 focus:ring-orange-500/20 focus:border-orange-500 outline-none font-mono tracking-widest transition-all shadow-sm" 
                placeholder="Scan Serial Number..." 
                value={serialInput} 
                onChange={handleChange} 
                onKeyDown={handleKeyDown}
                disabled={loading || showConditionModal} 
                autoFocus
              />
              {serialInput && (
                 <button onClick={() => { setSerialInput(""); setMessage({ type:"", text:"" }); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={16} /></button>
              )}
            </div>

            {/* Status Messages */}
            {message.text && (
              <div className={`p-3 rounded-xl text-sm border flex items-center gap-2 animate-in slide-in-from-top duration-200 ${
                message.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {message.text}
              </div>
            )}
            
            {!message.text && (
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400 mt-2">
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-pulse"></span>
                Waiting for scan...
              </div>
            )}
          </div>
        </div>}

        {/* Search History */}
        <div className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full ${isSupervisor ? 'lg:col-span-3' : ''}`}>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600">
              <Search size={14} />
            </div>
            <h3 className="font-bold text-sm text-slate-700">Search History</h3>
          </div>
          
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3.5 text-slate-400" />
            <input 
              className="w-full h-full border border-slate-200 pl-10 pr-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-slate-50 focus:bg-white"
              placeholder="Search by serial, model..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-[10px] text-slate-400">
            <span>Total Returns: <strong>{returnsList.length}</strong></span>
            <span>Filtered: <strong>{filteredReturns.length}</strong></span>
          </div>
        </div>
      </div>

      <ReturnsModals
        {...{
          closeOrderDetails, condition, confirmReturn, getReturnCustomerName,
          getReturnDispatchDate, getReturnFirmName, getReturnInvoiceNumber,
          getReturnLogisticsStatus, getReturnOrderId, getReturnReason,
          getReturnShippingAddress, getReturnStatus, getReturnTrackingId,
          handleOpenUploadFile, loadingOrderDetails, orderDetails,
          orderDetailsDispatchId, orderDetailsError, orderDetailsId, orderInvoiceUrl,
          pendingSerial, pendingSerialDetails, reason, refundAmount, refundStatus,
          returnQuantity, selectedReturnOrder, setMessage, setReason,
          setRefundAmount, setRefundStatus, setReturnQuantity, setSerialInput,
          setShowConditionModal, showConditionModal,
        }}
      />

      {/* History Table for Current Returns */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <History size={16} className="text-slate-400" />
            <h3 className="text-sm font-bold text-slate-700">Recent Returns</h3>
          </div>
          <span className="text-[10px] font-bold bg-white border border-slate-200 px-2 py-1 rounded-lg text-slate-500">
            All Return Items
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-bold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">Serial Number</th>
                <th className="px-5 py-3">Model</th>
                <th className="px-5 py-3">Condition</th>
                <th className="px-5 py-3">Platform</th>
                <th className="px-5 py-3">Order ID</th>
                <th className="px-5 py-3">Refund</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3 text-center">History</th>
                <th className="px-5 py-3 text-right">Date</th>
                <th className="px-5 py-3 text-center">Qty</th>
                <th className="px-5 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan="12" className="p-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                        <Box size={32} className="text-slate-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-500">No returns found</p>
                      <p className="text-xs text-slate-400">Try searching for a different serial</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReturns
                  .slice((currentPageCurrent - 1) * pageSizeCurrent, currentPageCurrent * pageSizeCurrent)
                  .map((item, index) => {
                  const conditionMeta = getConditionMeta(item.condition);
                  const [colorClass, intensity] = (item.rowColor || "").split("|");
                  const itemOrderId = getReturnOrderId(item) || item.customerName || "N/A";
                  const itemPlatform = item.firmName || getReturnFirmName(item) || "N/A";
                  const itemReason = item.reason || getReturnReason(item) || "N/A";
                  
                  return (
                    <tr 
                      key={item.guid || item.guid || index} 
                      style={{ "--row-opacity": intensity ? parseInt(intensity) / 100 : undefined }}
                      className={`hover:bg-slate-50/80 transition-colors ${colorClass || (item.rowColor && !item.rowColor.includes('|') ? item.rowColor : '')}`}
                    >
                      <td className="px-5 py-3.5 text-xs font-bold text-slate-400">
                        {(currentPageCurrent - 1) * pageSizeCurrent + index + 1}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-indigo-50 rounded-md">
                            <ScanLine size={12} className="text-indigo-600" />
                          </div>
                          <div className="flex flex-col">
                            <button 
                              onClick={() => handleOpenOrderDetails(item)}
                              className="text-left group" 
                              title="View order details"
                            >
                              <span className="font-mono font-bold text-indigo-600 text-xs group-hover:text-indigo-800 transition">
                                {item.displaySerial || item.serialValue || item.serialNumber || "N/A"}
                              </span>
                            </button>
                            {item.tags && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {JSON.parse(item.tags).map((tag, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white shadow-sm" style={{ backgroundColor: tag.color || '#6366f1' }}>
                                    {tag.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-slate-700 font-medium">{item.modelName || "N/A"}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${conditionMeta.className}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${conditionMeta.dotClassName}`}></span>
                          {conditionMeta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <ShoppingCart size={12} className="text-slate-400" />
                          {itemPlatform}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {getReturnDispatchId(item) ? (
                          <button onClick={() => handleOpenOrderDetails(item)} className="text-left group" title="View order details">
                            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg group-hover:bg-indigo-100 transition">
                              {itemOrderId}
                              <ExternalLink size={11} />
                            </span>
                          </button>
                        ) : (
                          <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {itemOrderId}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col">
                          <span className={`text-xs font-bold ${item.refundStatus === 'Full' ? 'text-emerald-600' : item.refundStatus === 'Partial' ? 'text-amber-600' : 'text-slate-500'}`}>
                            {item.refundStatus || "N/A"}
                          </span>
                          {item.refundAmount > 0 && (
                            <span className="text-[10px] text-slate-500 font-mono mt-0.5">₹{item.refundAmount}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 max-w-[150px] truncate" title={itemReason}>
                        <span className="text-xs text-slate-600">{itemReason}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {item.returnCount > 1 ? (
                          <div className="group relative inline-flex flex-col items-center justify-center">
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full cursor-help flex items-center gap-1">
                              <History size={10} /> {item.returnCount} Times
                            </span>
                            <div className="hidden group-hover:block absolute bottom-full mb-2 w-max bg-slate-800 text-white text-[10px] p-2.5 rounded-lg shadow-xl z-50 text-left">
                              <p className="font-bold mb-1.5 text-slate-300 border-b border-slate-600 pb-1">Previous Returns:</p>
                              <ul className="space-y-1">
                                {(item.allReturnDates || []).map((d, i) => (
                                  <li key={i} className="flex items-center gap-1.5">
                                    <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
                                    {d ? format(new Date(d), "dd MMM yyyy, hh:mm a") : "Unknown Date"}
                                  </li>
                                ))}
                              </ul>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">1 Time</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5 text-xs text-slate-500">
                          <Calendar size={12} />
                          {item.returnDate || item.createdAt ? format(new Date(item.returnDate || item.createdAt), "dd MMM yyyy") : "-"}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                          {item.quantity || 1}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={(e) => openAppearanceModal(e, item)}
                            className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 rounded-lg transition-all shadow-sm shrink-0"
                            title="Appearance & Tags"
                          >
                            <Palette size={13} />
                          </button>
                          {canManage && (
                            <button
                              onClick={() => handleEditRefund(item)}
                              className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 rounded-lg transition-all shadow-sm shrink-0"
                              title="Edit Refund"
                            >
                              <Edit size={13} />
                            </button>
                          )}
                          {canDelete ? (
                            <button
                              onClick={() => handleDelete(item)}
                              disabled={deletingId === (item.guid || item.guid)}
                              className={`p-2 rounded-lg transition-all ${
                                deletingId === (item.guid || item.guid)
                                  ? "text-slate-300 cursor-not-allowed"
                                  : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                              }`}
                              title="Delete Record"
                            >
                              {deletingId === (item.guid || item.guid) ? (
                                <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">Locked</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredReturns.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium">
                Showing <span className="font-bold text-slate-700">{(currentPageCurrent - 1) * pageSizeCurrent + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPageCurrent * pageSizeCurrent, filteredReturns.length)}</span> of <span className="font-bold text-slate-700">{filteredReturns.length}</span> entries
              </span>
              
              <div className="flex items-center gap-2">
                <select 
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 outline-none focus:border-orange-400 transition-all cursor-pointer"
                  value={pageSizeCurrent}
                  onChange={(e) => {
                    setPageSizeCurrent(Number(e.target.value));
                    setCurrentPageCurrent(1);
                  }}
                >
                  {[5, 10, 25, 50, 100].map(val => (
                    <option key={val} value={val}>{val} per page</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                disabled={currentPageCurrent === 1}
                onClick={() => setCurrentPageCurrent(prev => prev - 1)}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-orange-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, Math.ceil(filteredReturns.length / pageSizeCurrent)) }, (_, i) => {
                   const pageNum = i + 1;
                   return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPageCurrent(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        currentPageCurrent === pageNum ? 'bg-orange-600 text-white shadow-md shadow-orange-100' : 'text-slate-600 hover:bg-white hover:text-orange-600'
                      }`}
                    >
                      {pageNum}
                    </button>
                   );
                })}
              </div>

              <button 
                disabled={currentPageCurrent >= Math.ceil(filteredReturns.length / pageSizeCurrent)}
                onClick={() => setCurrentPageCurrent(prev => prev + 1)}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-orange-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  ) : (
    <div className="space-y-6">
      {/* Stationery Return Search */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="max-w-2xl mx-auto text-center mb-8">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Verify Stationery Return</h2>
          <p className="text-xs text-slate-500">Enter Tracking ID or Order ID to start verification</p>
        </div>
        
        <div className="max-w-xl mx-auto flex gap-3">
          <div className="relative flex-1">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              className="w-full border-2 border-slate-100 p-4 pl-12 rounded-xl text-sm focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 outline-none transition-all shadow-sm"
              placeholder="Tracking ID / Order ID / Bill No..."
              value={stationerySearch}
              onChange={(e) => setStationerySearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchOrder()}
            />
          </div>
          <button 
            onClick={handleSearchOrder}
            disabled={searchingOrder || !stationerySearch.trim()}
            className="bg-slate-800 text-white px-8 rounded-xl font-bold text-sm hover:bg-slate-900 transition-all shadow-lg shadow-slate-200 disabled:opacity-50 flex items-center gap-2"
          >
            {searchingOrder ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={18} />}
            Search
          </button>
        </div>

        {orderFound && (
          <div className="mt-8 border-t border-slate-100 pt-8 animate-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Order Summary */}
              <div className="space-y-6">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Order Details</h4>
                  <div className="grid grid-cols-2 gap-y-4">
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">Order ID</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-700">{orderFound.stockOutId}</p>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase ${orderFound.source === 'legacy' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {orderFound.source}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">Date</p>
                      <p className="text-sm font-bold text-slate-700">{format(new Date(orderFound.issueDate), "dd MMM yyyy")}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-slate-400 font-medium">Platform / Tracking</p>
                      <p className="text-sm font-bold text-slate-700">{orderFound.refNo}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Items Sent</h4>
                  <div className="space-y-3">
                    {orderFound.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-sm font-bold text-slate-700">{item.itemName}</p>
                          <p className="text-[10px] text-slate-500">{item.variantName}</p>
                        </div>
                        <span className="text-xs font-bold bg-white px-2 py-1 rounded-lg border border-slate-200">Qty: {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Verification Form */}
              <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200 space-y-6">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-orange-600" />
                  Verification Checklist
                </h4>

                {/* Question 1 */}
                <div className="space-y-3">
                  <p className="text-sm font-bold text-slate-700">1. Was the same item received?</p>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setStationeryForm({...stationeryForm, isSameItemReceived: true})}
                      className={`flex-1 p-3 rounded-xl border-2 font-bold text-xs transition-all ${stationeryForm.isSameItemReceived ? 'bg-orange-50 border-orange-500 text-orange-600' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                      Yes, Same Item
                    </button>
                    <button 
                      onClick={() => setStationeryForm({...stationeryForm, isSameItemReceived: false})}
                      className={`flex-1 p-3 rounded-xl border-2 font-bold text-xs transition-all ${!stationeryForm.isSameItemReceived ? 'bg-red-50 border-red-500 text-red-600' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                      No, Mismatch
                    </button>
                  </div>
                </div>

                {stationeryForm.isSameItemReceived ? (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-sm font-bold text-slate-700">2. Is the condition/status correct?</p>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setStationeryForm({...stationeryForm, isConditionCorrect: true})}
                        className={`flex-1 p-3 rounded-xl border-2 font-bold text-xs transition-all ${stationeryForm.isConditionCorrect ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'}`}
                      >
                        Correct Condition
                      </button>
                      <button 
                        onClick={() => setStationeryForm({...stationeryForm, isConditionCorrect: false})}
                        className={`flex-1 p-3 rounded-xl border-2 font-bold text-xs transition-all ${!stationeryForm.isConditionCorrect ? 'bg-amber-50 border-amber-500 text-amber-600' : 'bg-white border-slate-200 text-slate-500'}`}
                      >
                        Damaged / Incorrect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Item Sent</label>
                      <p className="text-sm font-medium text-slate-500 bg-slate-100 p-3 rounded-xl">{stationeryForm.originalItemSent}</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Item Received Instead</label>
                      <input 
                        className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                        placeholder="What did you actually receive?"
                        value={stationeryForm.itemReceivedInstead}
                        onChange={(e) => setStationeryForm({...stationeryForm, itemReceivedInstead: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                         <p className="text-sm font-bold text-slate-700 mb-2">Compensation / Replacement Received?</p>
                         <div className="flex gap-4">
                           <button 
                             onClick={() => setStationeryForm({...stationeryForm, isCompensationReceived: true})}
                             className={`flex-1 p-3 rounded-xl border-2 font-bold text-xs transition-all ${stationeryForm.isCompensationReceived ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-slate-200 text-slate-500'}`}
                           >
                             Yes
                           </button>
                           <button 
                             onClick={() => setStationeryForm({...stationeryForm, isCompensationReceived: false})}
                             className={`flex-1 p-3 rounded-xl border-2 font-bold text-xs transition-all ${!stationeryForm.isCompensationReceived ? 'bg-white border-slate-200 text-slate-500' : 'bg-white border-slate-200 text-slate-500'}`}
                           >
                             No
                           </button>
                         </div>
                      </div>
                      {stationeryForm.isCompensationReceived && (
                        <div className="col-span-2 animate-in zoom-in-95 duration-200">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Compensation Amount (₹)</label>
                          <input 
                            type="number"
                            className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                            placeholder="Enter amount"
                            value={stationeryForm.compensationAmount}
                            onChange={(e) => setStationeryForm({...stationeryForm, compensationAmount: e.target.value})}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-4">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Remarks / Details</label>
                  <textarea 
                    className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                    rows={3}
                    placeholder="Any additional notes..."
                    value={stationeryForm.remarks}
                    onChange={(e) => setStationeryForm({...stationeryForm, remarks: e.target.value})}
                  />
                </div>

                <button 
                  onClick={handleStationerySubmit}
                  disabled={submittingStationery}
                  className="w-full bg-orange-600 text-white py-4 rounded-2xl font-bold text-sm hover:bg-orange-700 transition-all shadow-lg shadow-orange-100 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submittingStationery ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 size={18} />}
                  Confirm & Save Return
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stationery Return History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <History size={16} className="text-slate-400" />
            <h3 className="text-sm font-bold text-slate-700">Stationery Return History</h3>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-bold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Tracking / Order</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Items Sent</th>
                <th className="px-5 py-3 text-center">Same?</th>
                <th className="px-5 py-3 text-center">Cond.</th>
                <th className="px-5 py-3">Mismatch / Received Instead</th>
                <th className="px-5 py-3">Compensation</th>
                <th className="px-5 py-3 text-right">Date</th>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loadingHistory ? (
                <tr><td colSpan="10" className="p-8 text-center text-slate-400">Loading history...</td></tr>
              ) : stationeryHistory.length === 0 ? (
                <tr><td colSpan="10" className="p-8 text-center text-slate-400">No stationery returns found</td></tr>
              ) : (
                stationeryHistory
                  .slice((currentPageStationery - 1) * pageSizeStationery, currentPageStationery * pageSizeStationery)
                  .map((item, idx) => {
                    const [colorClass, intensity] = (item.rowColor || "").split("|");
                    return (
                      <tr 
                        key={idx} 
                        style={{ "--row-opacity": intensity ? parseInt(intensity) / 100 : undefined }}
                        className={`hover:bg-slate-50/50 transition-colors ${colorClass || (item.rowColor && !item.rowColor.includes('|') ? item.rowColor : '')}`}
                      >
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700 text-xs">{item.trackingId || item.stockOutId}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{item.stockOutId}</span>
                        {item.tags && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {JSON.parse(item.tags).map((tag, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white shadow-sm" style={{ backgroundColor: tag.color || '#6366f1' }}>
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-slate-700 font-medium">{item.customerName || "-"}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="max-w-[150px] truncate text-[10px] text-slate-500" title={item.originalItemSent}>
                        {item.originalItemSent}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${item.isSameItemReceived ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                        {item.isSameItemReceived ? 'YES' : 'NO'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${item.isConditionCorrect ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                        {item.isConditionCorrect ? 'OK' : 'ERR'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {!item.isSameItemReceived ? (
                        <div className="flex flex-col">
                           <span className="text-[10px] font-bold text-red-600">Received:</span>
                           <span className="text-[10px] text-slate-600 max-w-[150px] truncate" title={item.itemReceivedInstead}>{item.itemReceivedInstead}</span>
                        </div>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-bold ${item.isCompensationReceived ? 'text-blue-600' : 'text-slate-400'}`}>
                          {item.isCompensationReceived ? 'YES' : 'NO'}
                        </span>
                        {item.isCompensationReceived && (
                          <span className="text-[10px] font-mono text-slate-500">₹{item.compensationAmount}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-500 font-medium">{format(new Date(item.createdAt), "dd MMM yyyy")}</span>
                        <span className="text-[9px] text-slate-400">{format(new Date(item.createdAt), "HH:mm")}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[10px] text-slate-500 font-medium">{item.createdBy}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={(e) => openAppearanceModal(e, item)}
                          className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 rounded-lg transition-all shadow-sm shrink-0"
                          title="Appearance & Tags"
                        >
                          <Palette size={13} />
                        </button>
                        <button 
                          onClick={() => handleUpdateCompensation(item)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all border border-transparent hover:border-indigo-100 shadow-sm"
                          title="Update Compensation"
                        >
                          <Edit size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls for Stationery History */}
        {stationeryHistory.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium">
                Showing <span className="font-bold text-slate-700">{(currentPageStationery - 1) * pageSizeStationery + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPageStationery * pageSizeStationery, stationeryHistory.length)}</span> of <span className="font-bold text-slate-700">{stationeryHistory.length}</span> entries
              </span>
              
              <div className="flex items-center gap-2">
                <select 
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 outline-none focus:border-orange-400 transition-all cursor-pointer"
                  value={pageSizeStationery}
                  onChange={(e) => {
                    setPageSizeStationery(Number(e.target.value));
                    setCurrentPageStationery(1);
                  }}
                >
                  {[5, 10, 25, 50, 100].map(val => (
                    <option key={val} value={val}>{val} per page</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                disabled={currentPageStationery === 1}
                onClick={() => setCurrentPageStationery(prev => prev - 1)}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-orange-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, Math.ceil(stationeryHistory.length / pageSizeStationery)) }, (_, i) => {
                   const pageNum = i + 1;
                   return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPageStationery(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        currentPageStationery === pageNum ? 'bg-orange-600 text-white shadow-md shadow-orange-100' : 'text-slate-600 hover:bg-white hover:text-orange-600'
                      }`}
                    >
                      {pageNum}
                    </button>
                   );
                })}
              </div>

              <button 
                disabled={currentPageStationery >= Math.ceil(stationeryHistory.length / pageSizeStationery)}
                onClick={() => setCurrentPageStationery(prev => prev + 1)}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-orange-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )}
      {/* Appearance Modal */}
      <AppearanceModal 
        isOpen={appearanceModalOpen} 
        onClose={() => setAppearanceModalOpen(false)} 
        item={appearanceItem} 
        type="return" 
        onUpdated={loadData} 
      />
    </div>
  );
}

