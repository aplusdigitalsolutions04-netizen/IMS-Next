"use client";
import React, { useState } from "react";
import Swal from 'sweetalert2';

import { 
  AlertTriangle, Wrench, Trash2, Search, X, ShieldAlert, Edit2,
  Calendar, ShoppingCart, User, AlertOctagon, Save, IndianRupee,
  Receipt, Truck, FileText, ExternalLink
} from "lucide-react"; 
import { format } from "date-fns";
import DayFilterSelect from "@/components/common/DayFilterSelect";
import { getDayFilterRange, isWithinDayFilter } from "@/lib/client/dayFilter";
import axios from "axios";
import { printerService } from "@/lib/services/api";
import { useToast } from "@/lib/client/ToastContext";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const UPLOADS_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");

const getUploadFileUrl = (filename) => {
  const safeFilename = String(filename || "").trim();
  if (!safeFilename) return null;
  return `${UPLOADS_BASE_URL}/uploads/${encodeURIComponent(safeFilename)}`;
};

const getAuthHeaders = () => {
  try {
    const token = sessionStorage.getItem("pt_auth_token");
    return { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
  } catch {
    return {};
  }
};

export default function Damaged({ returns = [], onRefresh, currentUser, initialDayFilter = "all", initialCustomStart = "", initialCustomEnd = "" }) {
  const toast = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [dayFilter, setDayFilter] = useState(initialDayFilter);
  const [customStart, setCustomStart] = useState(initialCustomStart);
  const [customEnd, setCustomEnd] = useState(initialCustomEnd);
  const dayRange = getDayFilterRange(dayFilter, customStart, customEnd);
  const [deleting, setDeleting] = useState(null); // ✅ Track deleting state
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ condition: "Damaged", repairCost: "" });
  const [isSaving, setIsSaving] = useState(false);

  const [selectedReturnOrder, setSelectedReturnOrder] = useState(null);
  const [selectedDispatchDetails, setSelectedDispatchDetails] = useState(null);
  const [orderDetailsError, setOrderDetailsError] = useState("");
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);

  const canManage = currentUser?.role === 'Admin' || !!currentUser?.allow_edit_damaged;

  const getReturnDispatchId = (item) => {
    const rawValue =
      item?.dispatchGuid?.id ||
      item?.dispatchGuid?.guid ||
      item?.dispatch?.id ||
      item?.dispatch?.guid ||
      item?.dispatchGuid ||
      item?.orderId?.id ||
      item?.orderId?.guid ||
      item?.order?.id ||
      item?.order?.guid ||
      null;

    return rawValue || null;
  };

  const handleOpenOrderDetails = async (item) => {
    const dispatchGuid = getReturnDispatchId(item);

    if (!dispatchGuid) {
      toast.error("Linked order not found for this return.");
      return;
    }

    setSelectedReturnOrder(item);
    setSelectedDispatchDetails(null);
    setOrderDetailsError("");
    setLoadingOrderDetails(true);

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

  const closeOrderDetails = () => {
    setSelectedReturnOrder(null);
    setSelectedDispatchDetails(null);
    setOrderDetailsError("");
  };

  const orderDetails = selectedDispatchDetails || selectedReturnOrder;

  const damagedItems = returns.filter((r) => {
    const search = searchTerm.toLowerCase();
    if (r.condition !== "Damaged") return false;
    
    // Exclude stationery items
    const modelName = r.serialGuid?.modelGuid?.name || r.modelName || "";
    if (modelName === "Stationery") return false;
    if (!isWithinDayFilter(r.returnDate || r.createdAt, dayRange)) return false;

    return (
      (r.serialValue || "").toString().toLowerCase().includes(search) ||
      modelName.toString().toLowerCase().includes(search) ||
      (r.firmName || "").toString().toLowerCase().includes(search) ||
      (r.customerName || "").toString().toLowerCase().includes(search)
    );
  });

  // ✅ Fixed Delete Handler
  const handleDelete = async (item) => {
    // ✅ Use guid OR id (handle both cases)
    const itemId = item.guid || item.id;
    

    if (!itemId) {
      toast.error("Could not find item ID. Check console for details.");
      console.error("Item has no guid or id:", item);
      return;
    }

    if (!canManage) {
      toast.error("Access Denied.");
      return;
    }

    const result = await Swal.fire({
      title: "Are you sure?",
      text: "Are you sure you want to delete this damaged record? This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EF4444",
      cancelButtonColor: "#6B7280",
      confirmButtonText: "Yes, delete!",
      cancelButtonText: "No, cancel"
    });

    if (result.isConfirmed) {

      try {
        setDeleting(itemId); // ✅ Show loading state
        
        console.log("🗑️ Deleting return with ID:", itemId);
        
        const response = await printerService.deleteReturn(itemId);
        
        console.log("✅ Delete response:", response);
        
        if (onRefresh) {
          await onRefresh(); // ✅ Await refresh
        }
        toast.success("The damaged record has been deleted successfully.");
      } catch (error) {
        console.error("❌ Delete failed:", error);
        console.error("❌ Error response:", error.response?.data);
        console.error("❌ Error status:", error.response?.status);

        toast.error(
          `Failed to delete record: ${
            error.response?.data?.message || error.message || "Unknown error"
          }`
        );
      } finally {
        setDeleting(null); // ✅ Reset loading state
      }
    }
  };

  // ✅ Save Edit Handler
  const handleSaveEdit = async () => {
    const itemId = editingItem?.guid || editingItem?.id;
    if (!itemId) {
      toast.error("Cannot save: item ID is missing. Please refresh and try again.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = { condition: editForm.condition, repairCost: Number(editForm.repairCost) || 0 };

      await axios.put(`${API_BASE_URL}/api/returns/${itemId}`, payload, getAuthHeaders());

      if (onRefresh) await onRefresh();
      setEditingItem(null);
    } catch (err) {
      toast.error("Failed to update: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 relative pb-20">
      
      {/* Header Section */}
      <div className="relative">
        <div className="absolute -top-4 -left-4 w-48 h-48 bg-gradient-to-br from-red-500/10 to-rose-500/10 rounded-full blur-3xl -z-10" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-gradient-to-br from-red-500 to-rose-600 rounded-lg shadow-md shadow-red-500/25">
                <AlertOctagon size={14} className="text-white" />
              </div>
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                Attention Required
              </span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">Damaged Inventory</h1>
            <p className="text-xs text-slate-500">Items returned as defective or damaged</p>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-80 group">
              <div className="absolute inset-0 bg-red-500 rounded-xl blur opacity-0 group-hover:opacity-10 transition-opacity" />
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full border border-slate-200 pl-10 pr-8 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all shadow-sm"
                  placeholder="Search damaged items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <DayFilterSelect
              value={dayFilter}
              onChange={setDayFilter}
              customStart={customStart}
              onCustomStartChange={setCustomStart}
              customEnd={customEnd}
              onCustomEndChange={setCustomEnd}
            />
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-100 p-5 rounded-2xl flex items-center justify-between shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 w-32 h-32 bg-white/40 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="flex items-center gap-4 relative">
          <div className="p-3 bg-white rounded-xl shadow-sm border border-red-100">
            <ShieldAlert size={24} className="text-red-500" />
          </div>
          <div>
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Total Damaged Units</p>
            <h3 className="text-2xl font-extrabold text-red-700">{damagedItems.length}</h3>
          </div>
        </div>
        
        <div className="relative text-right hidden sm:block">
          <p className="text-[10px] text-red-400 font-medium">Action Needed</p>
          <p className="text-xs text-red-600 font-bold">Repair or Dispose</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-bold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">S.No.</th>
                <th className="px-5 py-3">Serial No</th>
                <th className="px-5 py-3">Model</th>
                <th className="px-5 py-3">Order Details</th>
                <th className="px-5 py-3 text-center">Qty</th>
                <th className="px-5 py-3 text-right">Return Date</th>
                <th className="px-5 py-3 text-right">Repair Cost</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {damagedItems.map((item, index) => {
                // ✅ Resolve ID safely
                const itemId = item.guid || item.id || index;
                const isDeleting = deleting === itemId;

                return (
                  <tr 
                    key={itemId} 
                    className={`hover:bg-red-50/30 transition-colors group ${
                      isDeleting ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    {/* S.No. */}
                    <td className="px-5 py-4 text-slate-400 font-semibold">{index + 1}</td>

                    {/* Serial */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                        <button 
                          onClick={() => handleOpenOrderDetails(item)}
                          className="text-left group" 
                          title="View order details"
                        >
                          <span className="font-mono font-bold text-indigo-600 text-xs bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200 group-hover:text-indigo-800 transition">
                            {item.serialValue || item.serialNumber}
                          </span>
                        </button>
                      </div>
                    </td>

                    {/* Model */}
                    <td className="px-5 py-4">
                      <span className="text-xs font-semibold text-slate-600">
                        {item.serialGuid?.modelGuid?.name || item.modelName || "Unknown"}
                      </span>
                    </td>

                    {/* Order Details */}
                    <td className="px-5 py-4">
                      {getReturnDispatchId(item) ? (
                        <button onClick={() => handleOpenOrderDetails(item)} className="text-left group" title="View order details">
                          <div className="flex items-center gap-1.5 text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 group-hover:bg-indigo-100 transition">
                            <User size={10} />
                            <span className="font-mono">{item.customerName || "N/A"}</span>
                            <ExternalLink size={10} />
                          </div>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <User size={10} />
                          <span className="font-mono">{item.customerName || "N/A"}</span>
                        </div>
                      )}
                    </td>

                    {/* Qty */}
                    <td className="px-5 py-4 text-center">
                      <span className="font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg text-xs">
                        {item.quantity || 1}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 text-xs text-slate-500">
                        <Calendar size={12} />
                        {item.returnDate ? format(new Date(item.returnDate), "dd MMM yyyy") : "-"}
                      </div>
                    </td>

                    {/* Repair Cost */}
                    <td className="px-5 py-4 text-right font-bold text-slate-700">
                      {item.repairCost > 0 ? `₹${item.repairCost.toLocaleString()}` : "-"}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-red-100 shadow-sm">
                        <Wrench size={12} /> Needs Repair
                      </span>
                    </td>
                    
                    {/* ✅ Fixed Action - Pass entire item object */}
                    <td className="px-5 py-4 text-center">
                  {canManage ? (
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            onClick={() => {
                              setEditingItem(item);
                              setEditForm({ condition: item.condition || "Damaged", repairCost: item.repairCost || "" });
                            }}
                            disabled={isDeleting}
                            className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all opacity-60 group-hover:opacity-100"
                            title="Edit Record"
                          >
                            <Edit2 size={16} />
                          </button>
                    {canManage && <button 
                          onClick={() => handleDelete(item)}
                          disabled={isDeleting}
                          className={`p-2 rounded-xl transition-all opacity-60 group-hover:opacity-100 ${
                            isDeleting 
                              ? "text-slate-300 cursor-not-allowed" 
                              : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                          }`}
                          title="Delete Record"
                        >
                          {isDeleting ? (
                            <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                    </button>}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 italic">Locked</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {damagedItems.length === 0 && (
                <tr>
                  <td colSpan="9" className="p-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-2">
                        <AlertTriangle size={32} className="text-emerald-400" />
                      </div>
                      <p className="text-sm font-bold text-emerald-600">No Damaged Items Found</p>
                      <p className="text-xs text-slate-400">
                        {searchTerm ? "Try a different search term" : "Your inventory is in good health! ✅"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Repair Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Edit2 size={18} className="text-indigo-600" /> Repair Details
              </h3>
              <button onClick={() => setEditingItem(null)} className="p-1 hover:bg-slate-100 rounded-full"><X size={16}/></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Condition</label>
                <select 
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  value={editForm.condition}
                  onChange={(e) => setEditForm({...editForm, condition: e.target.value})}
                >
                  <option value="Damaged">Damaged (Needs Repair)</option>
                  <option value="Repaired">Repaired (Move to Active Stock)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Repair Cost (₹)</label>
                <div className="relative">
                  <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" className="w-full border border-slate-200 pl-8 pr-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" value={editForm.repairCost} onChange={(e) => setEditForm({...editForm, repairCost: e.target.value})} />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => setEditingItem(null)} className="flex-1 py-2.5 bg-slate-100 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleSaveEdit} disabled={isSaving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2">
                {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedReturnOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-5 flex items-start justify-between text-white">
              <div>
                <h3 className="text-xl font-extrabold flex items-center gap-2">
                  <Receipt size={20} /> Order Details
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="bg-white/10 px-2 py-1 rounded-lg font-semibold">
                    {orderDetails?.customerName || selectedReturnOrder.customerName || "N/A"}
                  </span>
                  {getReturnDispatchId(selectedReturnOrder) && (
                    <span className="bg-white/10 px-2 py-1 rounded-lg font-mono">
                      Ref #{getReturnDispatchId(selectedReturnOrder)}
                    </span>
                  )}
                  <span className="bg-white/10 px-2 py-1 rounded-lg">
                    Return Serial: {selectedReturnOrder.displaySerial || selectedReturnOrder.serialValue || "N/A"}
                  </span>
                </div>
              </div>
              <button
                onClick={closeOrderDetails}
                className="p-2 hover:bg-white/10 rounded-full transition"
              >
                <X size={20} className="text-slate-200" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingOrderDetails && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
                  Loading order details...
                </div>
              )}

              {orderDetailsError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {orderDetailsError}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                    <Truck size={15} /> Order Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Platform</p>
                      <p className="font-semibold text-slate-700 mt-1">{orderDetails?.firmName || selectedReturnOrder.firmName || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Order Status</p>
                      <p className="font-semibold text-slate-700 mt-1">{orderDetails?.status || orderDetails?.orderStatus || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Logistics Status</p>
                      <p className="font-semibold text-slate-700 mt-1">{orderDetails?.logisticsStatus || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Dispatch Date</p>
                      <p className="font-semibold text-slate-700 mt-1">
                        {orderDetails?.dispatchDate ? format(new Date(orderDetails.dispatchDate), "dd MMM yyyy") : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Invoice No.</p>
                      <p className="font-semibold text-slate-700 mt-1">{orderDetails?.invoiceNumber || selectedReturnOrder.invoiceNumber || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Warranty</p>
                      <p className="font-semibold text-slate-700 mt-1">{orderDetails?.warranty || "N/A"}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                    <User size={15} /> Customer Info
                  </h4>
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Customer Name</p>
                      <p className="font-semibold text-slate-700 mt-1">{orderDetails?.customerName || selectedReturnOrder.customerName || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Consignee Name</p>
                      <p className="font-semibold text-slate-700 mt-1">{orderDetails?.consigneeName || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Contact Number</p>
                      <p className="font-semibold text-slate-700 mt-1">{orderDetails?.gemContact || "N/A"}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                    <Receipt size={15} /> Product Details
                  </h4>
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Product Variant</p>
                      <p className="font-semibold text-slate-700 mt-1">{orderDetails?.itemVariantId?.name || "N/A"}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Quantity</p>
                        <p className="font-semibold text-slate-700 mt-1">{orderDetails?.quantity || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Selling Price</p>
                        <p className="font-semibold text-slate-700 mt-1">₹{orderDetails?.sellingPrice?.toLocaleString() || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                    <FileText size={15} /> Invoice
                  </h4>
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Invoice Number</p>
                      <p className="font-semibold text-slate-700 mt-1">{orderDetails?.invoiceNumber || selectedReturnOrder.invoiceNumber || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Invoice File</p>
                      {getUploadFileUrl(orderDetails?.invoiceFilename) ? (
                        <button
                          type="button"
                          onClick={() => window.open(getUploadFileUrl(orderDetails?.invoiceFilename), "_blank", "noopener,noreferrer")}
                          className="mt-2 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100"
                        >
                          <FileText size={14} /> View Invoice
                          <ExternalLink size={12} />
                        </button>
                      ) : (
                        <p className="text-slate-500 mt-1">N/A</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex justify-end">
              <button
                onClick={closeOrderDetails}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-900 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
