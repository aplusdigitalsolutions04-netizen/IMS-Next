// Shared constants and pure helpers for the OrderTracking screen.
import {
  CheckCircle, AlertCircle, Clock, Box, Receipt, Truck,
  CheckSquare, Ban, PauseCircle, RotateCcw,
} from "lucide-react";
import { format } from "date-fns";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export const getAuthHeaders = () => {
  const token = sessionStorage.getItem("pt_auth_token");
  return {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }
  };
};

export const STATUS_CONFIG = {
  Draft: { label: "Draft", bgClass: "bg-slate-100 border-slate-300 text-slate-600", dotClass: "bg-slate-400", icon: Clock, step: 0 },
  Pending: { label: "Pending", bgClass: "bg-slate-100 border-slate-300 text-slate-700", dotClass: "bg-slate-400", icon: Clock, step: 0 },
  "Order Confirmed": { label: "Order Confirmed", bgClass: "bg-blue-50 border-blue-200 text-blue-700", dotClass: "bg-blue-400", icon: CheckCircle, step: 0.5 },
  "Order Not Confirmed": { label: "On Hold", bgClass: "bg-yellow-50 border-yellow-200 text-yellow-700", dotClass: "bg-yellow-500", icon: PauseCircle, step: 0 },
  "Order On Hold": { label: "On Hold", bgClass: "bg-yellow-50 border-yellow-200 text-yellow-700", dotClass: "bg-yellow-500", icon: PauseCircle, step: 0 },
  "Send for Billing": { label: "Send for Billing", bgClass: "bg-indigo-100 border-indigo-300 text-indigo-700", dotClass: "bg-indigo-500", icon: Receipt, step: 1 },
  Billing: { label: "Billing", bgClass: "bg-indigo-100 border-indigo-300 text-indigo-700", dotClass: "bg-indigo-500", icon: Receipt, step: 1 },
  "Ready for Pickup": { label: "Ready for Pickup", bgClass: "bg-amber-100 border-amber-300 text-amber-700", dotClass: "bg-amber-500", icon: Box, step: 2 },
  Dispatched: { label: "Dispatched", bgClass: "bg-purple-100 border-purple-300 text-purple-700", dotClass: "bg-purple-500", icon: Truck, step: 3 },
  "Delivery in Process": { label: "Out for Delivery", bgClass: "bg-orange-100 border-orange-300 text-orange-700", dotClass: "bg-orange-500", icon: Truck, step: 4 },
  "POD Pending": { label: "POD Pending", bgClass: "bg-amber-100 border-amber-300 text-amber-700", dotClass: "bg-amber-500", icon: Box, step: 4 },
  Delivered: { label: "Delivered", bgClass: "bg-emerald-100 border-emerald-300 text-emerald-700", dotClass: "bg-emerald-500", icon: CheckCircle, step: 5 },
  Completed: { label: "Completed", bgClass: "bg-slate-800 border-slate-900 text-white shadow-md shadow-slate-300", dotClass: "bg-white", icon: CheckSquare, step: 6 },
  RTO: { label: "RTO", bgClass: "bg-red-100 border-red-300 text-red-700", dotClass: "bg-red-500", icon: AlertCircle, step: -1 },
  Returned: { label: "Returned", bgClass: "bg-red-100 border-red-300 text-red-700", dotClass: "bg-red-500", icon: AlertCircle, step: -1 },
  "Partially Returned": { label: "Partially Returned", bgClass: "bg-orange-100 border-orange-300 text-orange-800", dotClass: "bg-orange-500", icon: RotateCcw, step: -1 },
  "Order Cancelled": { label: "Cancelled", bgClass: "bg-red-50 border-red-200 text-red-700", dotClass: "bg-red-500", icon: Ban, step: -1 },
};

export const UPDATE_STATUS_OPTIONS = [
  { value: "Draft", label: "Draft" },
  { value: "Order Confirmed", label: "Order Confirmed" },
  { value: "Order On Hold", label: "On Hold" },
  { value: "Send for Billing", label: "Send for Billing" },
  { value: "Order Cancelled", label: "Order Cancelled" },
];

export const FILTER_OPTIONS = [
  { value: "All", label: "All Statuses" },
  { value: "Pending", label: "Pending" },
  { value: "Order Confirmed", label: "Order Confirmed" },
  { value: "Send for Billing", label: "Billing Pending" },
  { value: "Ready for Pickup", label: "Ready for Pickup" },
  { value: "Delivery in Process", label: "Out for Delivery" },
  { value: "POD Pending", label: "POD Pending" },
  { value: "Delivered", label: "Delivered" },
  { value: "Returned", label: "Returned" },
  { value: "Order On Hold", label: "On Hold" },
  { value: "Order Cancelled", label: "Cancelled" },
];

export function normalizeSerial(val) {
  if (!val) return "";
  return String(val).replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function getBatchKey(order) {
  const firm = (order.firmName || "").trim();
  const customer = (order.customerName || order.customer || "").trim();
  const bid = (order.bidNumber || "").trim();
  if (bid) return `${firm}__${bid}`;
  if (customer) return `${firm}__${customer}`;
  return `single__${order.id}`;
}

export function getReturnSerial(returnRecord) {
  return returnRecord.serialValue
    || returnRecord.serialVal
    || returnRecord.serial_value
    || returnRecord.serialNumber
    || returnRecord.serial_number
    || returnRecord.serial_no
    || returnRecord.serialNo
    || returnRecord.serial
    || "";
}

export function getItemSerial(item) {
  return item.serialValue
    || item.serialVal
    || item.serial_value
    || item.serialNumber
    || item.serial_number
    || item.serial_no
    || item.serialNo
    || item.serial
    || "";
}

export function getReturnRecordForItem(item, returns = []) {
  if (!item || returns.length === 0) return null;

  const itemId = item.id || item.guid;

  // Tier 1: exact match by dispatchGuid — most reliable, always prefer this
  const exactMatch = returns.find((r) =>
    r.dispatchGuid && itemId && r.dispatchGuid === itemId
  );
  if (exactMatch) return exactMatch;

  // Tier 2: serial-based fallback for returns that have no dispatchGuid recorded.
  // CRITICAL: only match if this order was dispatched BEFORE the return happened.
  // If this order's dispatchDate is AFTER the returnDate, the serial was re-dispatched
  // into a brand-new order — do NOT flag that new order as returned.
  return returns.find((r) => {
    if (!r.serialNumberId || !item.serialNumberId) return false;
    if (r.serialNumberId !== item.serialNumberId) return false;
    if (r.dispatchGuid) return false; // already handled by Tier 1 (no match there = not this item)

    // If both dates exist, block match when the order is newer than the return
    if (r.returnDate && item.dispatchDate) {
      const returnedAt = new Date(r.returnDate).getTime();
      const dispatchedAt = new Date(item.dispatchDate).getTime();
      if (dispatchedAt > returnedAt) return false; // new order after return → not returned
    }

    return true;
  }) || null;
}

export function isItemReturned(item, returns = []) {
  const itemStatus = String(item.status || "").trim().toLowerCase();
  const logStatus = String(item.logisticsStatus || "").trim().toLowerCase();

  if (itemStatus === "returned" || itemStatus === "rto") return true;
  if (logStatus === "rto" || logStatus === "returned") return true;

  if (isItemReplaced(item)) return false;
  return !!getReturnRecordForItem(item, returns);
}

export function getReplacedSerialHistory() {
  try {
    return JSON.parse(localStorage.getItem("replaced_serials") || "{}");
  } catch {
    return {};
  }
}

export function isItemReplaced(item) {
  const history = getReplacedSerialHistory();
  if (history[item.guid]) return true;

  const reason = item.reason || item.cancellationReason || item.cancelReason || item.remarks || "";
  return reason.includes("Replaced returned serial:");
}

export function getOldSerial(item) {
  if (item.replacements && item.replacements.length > 0) return item.replacements[item.replacements.length - 1].oldSerialValue;

  const reason = item.reason || item.cancellationReason || item.cancelReason || item.remarks || "";
  if (reason.includes("Replaced returned serial:")) {
    return reason.split("Replaced returned serial: ")[1]?.trim();
  }
  return null;
}

export function calculateBatchFinancials(items, returns = []) {
  let totalValue = 0;
  let returnedValue = 0;
  let returnedCount = 0;
  let activeCount = 0;
  let replacedCount = 0;

  items.forEach((item) => {
    // sellingPrice is a per-unit price. Confirmed/serialized order_items get
    // one row per unit (quantity defaults to 1, so this is a no-op there),
    // but a Draft order's item is still a single row covering its whole
    // `quantity` — multiplying was missing, so a draft with e.g. qty 11
    // showed only the per-unit price as if it were the line's total.
    const price = Number(item.sellingPrice || 0) * (Number(item.quantity) || 1);
    totalValue += price;

    if (isItemReturned(item, returns)) {
      returnedValue += price;
      returnedCount++;
    } else {
      activeCount++;
      if (isItemReplaced(item)) replacedCount++;
    }
  });

  return {
    totalValue,
    returnedValue,
    netValue: totalValue - returnedValue,
    returnedCount,
    replacedCount,
    activeCount,
    totalCount: items.length
  };
}

export function isHoldStatus(status) {
  return status === "Order On Hold" || status === "Order Not Confirmed";
}

export function resolveDisplayStatus(status) {
  if (status === "Order Not Confirmed") return "Order On Hold";
  return status;
}

// Same rule the Warranty Certificate uses (lib/warrantyTemplate.js) — warranty
// period ("1 Year", "6 Months", etc.) counted from the dispatch/order date.
// Returns null if there's no period or no base date to count from.
export function getWarrantyExpiryDate(warrantyPeriod, baseDateValue) {
  if (!warrantyPeriod || !baseDateValue) return null;
  const num = parseInt(warrantyPeriod, 10);
  if (!num) return null;
  try {
    const base = new Date(baseDateValue);
    if (isNaN(base.getTime())) return null;
    const expiry = new Date(base);
    if (/month/i.test(warrantyPeriod)) expiry.setMonth(expiry.getMonth() + num);
    else expiry.setFullYear(expiry.getFullYear() + num);
    return expiry;
  } catch {
    return null;
  }
}

export function safeFormatDate(dateValue, formatStr = "dd MMM yyyy") {
  if (!dateValue) return null;
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return null;
    return format(date, formatStr);
  } catch {
    return null;
  }
}

// Returns YYYY-MM-DD in LOCAL timezone — use this for <input type="date"> values
// instead of .toISOString().split('T')[0] which returns UTC date and shifts by one day in IST
export function toLocalDateStr(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function isInstallationRequired(value) {
  if (value === true || value === 1 || value === "1" || value === "true" || value === "Yes" || value === "yes") {
    return true;
  }
  return false;
}

