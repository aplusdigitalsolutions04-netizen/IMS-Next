"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Swal from "sweetalert2";
import axios from "axios";
import { Plus, Loader2, ListTree, ArrowLeft, ArrowRightLeft, Trash2, Barcode, Hash, X, Edit2, Search, Settings2, PackagePlus } from "lucide-react";
import CategorySpecificationModal from "../categoryMaster/CategorySpecificationModal";
import MasterDropdown from "@/components/common/MasterDropdown";
import { getStoredUser } from "@/lib/client/auth";
import { promptDeleteRemarks } from "@/lib/client/promptRemarks";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

const ItemVariant = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawItemId = searchParams.get("itemId");
  const itemName = searchParams.get("itemName") || "Unknown Item";
  
  const [itemVariantId, setItemVariantId] = useState("");
  const [variantCode, setVariantCode] = useState("");
  const [mrp, setMrp] = useState("");
  const [variants, setVariants] = useState([]);
  const [categoryName, setCategoryName] = useState(searchParams.get("categoryName") || "");
  const [categoryId, setCategoryId] = useState("");

  // Spec fields shown on the form are whatever the category defines under
  // Category Master → Specifications (dropdown or free-text), not hardcoded.
  const [specDefs, setSpecDefs] = useState([]);
  const [specValues, setSpecValues] = useState({});
  const [loadingSpecDefs, setLoadingSpecDefs] = useState(false);
  const [showSpecModal, setShowSpecModal] = useState(false);
  // A variant carried over from a Transfer Variant move can hold spec values
  // whose specificationId isn't one of this item's own category fields (see
  // GetItemVariantList/route.js) — specDefs above only covers add/edit for
  // THIS category, so these need their own editable list, named off their
  // own specification (not this category's), to actually fix/clear them.
  const [foreignSpecDetails, setForeignSpecDetails] = useState([]);

  const getHeaders = () => {
    const token = sessionStorage.getItem("pt_auth_token");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchSpecDefs = useCallback(async () => {
    if (!categoryId) return;
    setLoadingSpecDefs(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/Inventory/GetCategorySpecificationList`, {
        params: { categoryId },
        headers: getHeaders(),
      });
      setSpecDefs(res.data?.data || []);
    } catch (error) {
      console.error("Failed to load category specifications", error);
      setSpecDefs([]);
    } finally {
      setLoadingSpecDefs(false);
    }
  }, [categoryId]);

  useEffect(() => {
    fetchSpecDefs();
  }, [fetchSpecDefs]);

  const resetSpecs = () => {
    setSpecValues({});
    setForeignSpecDetails([]);
  };
  
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);

  // Add Serial No. / Add Stock buttons below are each gated by their own
  // Manage Roles edit-flag (see components/users/constants.js), separate
  // from general Item Master access.
  const storedUser = getStoredUser();
  const canAddSerial = !!storedUser?.allow_add_serial;
  const canAddStock = !!storedUser?.allow_add_nonserialized_stock;
  const canTransferVariant = !!storedUser?.allow_transfer_variant;

  const [expandedVariantId, setExpandedVariantId] = useState("");
  const [godowns, setGodowns] = useState([]);

  // Like the Serial No. page (/itemVariant/serials), but for non-trackable variants —
  // lets plain quantity be booked directly against a variant (outside the
  // full Stock In workflow), recorded as its own price batch just like a
  // regular Stock-In line (see lib/nonSerializedBatchHelpers.js). Existing
  // batches aren't listed here — this is a quick add-only form; the batch
  // breakdown (rate/received/remaining) is viewed via Current Stock instead.
  const [batchModalVariant, setBatchModalVariant] = useState(null); // { itemVariantId, variantCode }
  const [newBatchQty, setNewBatchQty] = useState("");
  const [newBatchRate, setNewBatchRate] = useState("");
  const [newBatchGodownGuid, setNewBatchGodownGuid] = useState("");
  const [newBatchVendorId, setNewBatchVendorId] = useState("");
  const [addingBatch, setAddingBatch] = useState(false);

  const openVariantBatches = (v) => {
    setBatchModalVariant(v);
  };

  const closeVariantBatches = () => {
    setBatchModalVariant(null);
    setNewBatchQty("");
    setNewBatchRate("");
    setNewBatchGodownGuid("");
    setNewBatchVendorId("");
  };

  const handleAddStock = async () => {
    const quantity = Number(newBatchQty);
    if (!quantity || quantity <= 0 || !batchModalVariant) return;
    setAddingBatch(true);
    try {
      await axios.post(
        `${API_BASE_URL}/Inventory/AddVariantStock`,
        {
          itemVariantId: batchModalVariant.itemVariantId,
          qty: quantity,
          purchaseRate: newBatchRate !== "" ? Number(newBatchRate) : 0,
          godownGuid: newBatchGodownGuid || null,
          vendorId: newBatchVendorId || null,
        },
        { headers: getHeaders() }
      );
      Swal.fire("Success", "Stock added", "success");
      closeVariantBatches();
      fetchVariants(currentPage, pageSize);
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || "Failed to add stock", "error");
    } finally {
      setAddingBatch(false);
    }
  };

  // Transfer a variant to a different Item Master entry, to any item
  // regardless of category — stock, serials, spec values and barcodes all
  // follow automatically since they're keyed by itemVariantId, not itemId
  // (see app/Inventory/TransferVariant/route.js). Spec values keep their own
  // label regardless of category (see the specDetails handling below), so
  // they stay visible even after a cross-category move.
  const [transferringVariant, setTransferringVariant] = useState(null);
  const [transferDestItemId, setTransferDestItemId] = useState("");
  const [allItems, setAllItems] = useState([]);
  const [loadingAllItems, setLoadingAllItems] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  const openTransferModal = async (v) => {
    setTransferringVariant(v);
    setTransferDestItemId("");
    setLoadingAllItems(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/Inventory/GetItemList`, {
        params: { limit: 1000 },
        headers: getHeaders(),
      });
      setAllItems(response.data?.data || []);
    } catch (error) {
      console.error("Failed to load items:", error);
      setAllItems([]);
    } finally {
      setLoadingAllItems(false);
    }
  };

  const closeTransferModal = () => {
    setTransferringVariant(null);
    setTransferDestItemId("");
  };

  const handleTransferVariant = async () => {
    if (!transferringVariant || !transferDestItemId) return;
    setTransferSubmitting(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/Inventory/TransferVariant`,
        { itemVariantId: transferringVariant.itemVariantId, destinationItemId: transferDestItemId },
        { headers: getHeaders() }
      );
      Swal.fire("Transferred", response.data?.message || "Variant transferred successfully", "success");
      closeTransferModal();
      fetchVariants();
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || "Failed to transfer variant", "error");
    } finally {
      setTransferSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchGodowns = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/godowns`, { headers: getHeaders() });
        setGodowns(Array.isArray(response.data) ? response.data : response.data?.data || []);
      } catch (error) {
        console.error("Failed to load godowns", error);
      }
    };
    fetchGodowns();
  }, []);

  const [vendors, setVendors] = useState([]);
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/Inventory/GetVendorList`, { headers: getHeaders() });
        setVendors(response.data?.data || []);
      } catch (error) {
        console.error("Failed to load vendors", error);
      }
    };
    fetchVendors();
  }, []);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  // MRP is only shown for categories that opted into it (Category Master "Show MRP" checkbox)
  const [showMrp, setShowMrp] = useState(false);

  // "Ask Serial No." on the item (Item Master) — variants under an item that
  // has this set to No never get serial numbers, so the Serial No. input
  // shouldn't be offered here for them either.
  const [isTrackable, setIsTrackable] = useState(false);

  const fetchVariants = async (page = currentPage, limit = pageSize, search = searchTerm) => {
    if (!rawItemId) return;

    setTableLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/Inventory/GetItemVariantList`, {
        params: { itemId: rawItemId, page, limit, search: search || undefined },
        headers: getHeaders(),
      });
      setVariants(response.data?.data || []);
      setTotalRecords(response.data?.total || 0);
      setShowMrp(!!response.data?.showMrp);
      setIsTrackable(!!response.data?.isTrackable);
      if (response.data?.categoryName) setCategoryName(response.data.categoryName);
      if (response.data?.categoryId) setCategoryId(response.data.categoryId);
    } catch (error) {
      console.error("Failed to load variants", error);
      setVariants([]);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    if (!rawItemId) {
      Swal.fire("Error", "No Item ID provided", "error").then(() => {
        router.push("/itemMaster");
      });
      return;
    }
    fetchVariants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawItemId]);

  useEffect(() => {
    if (rawItemId) fetchVariants(currentPage, pageSize, searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, rawItemId]);

  // Debounce search input, then reset to page 1 and refetch
  useEffect(() => {
    if (!rawItemId) return;
    const handle = setTimeout(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        fetchVariants(1, pageSize, searchTerm);
      }
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const handleSaveVariant = async () => {
    if (!variantCode.trim()) {
      Swal.fire("Warning", "Please enter variant code", "warning");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ItemVariantId: itemVariantId || "0",
        ItemId: rawItemId,
        VariantCode: variantCode.trim(),
        Mrp: mrp !== "" ? Number(mrp) : null,
        Specs: specValues,
      };

      const res = await axios.post(
        `${API_BASE_URL}/Inventory/SaveOrUpdateItemVariant`,
        payload,
        { headers: getHeaders() }
      );

      if (res.data?.message === "Success") {
        Swal.fire("Success", "Variant saved successfully", "success");
        setVariantCode("");
        setMrp("");
        setItemVariantId("");
        resetSpecs();
        fetchVariants();
      } else {
        Swal.fire("Error", res.data?.message || "Failed to save variant", "error");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEditVariant = (v) => {
    setItemVariantId(v.itemVariantId);
    setVariantCode(v.variantCode || "");
    setMrp(v.mrp != null ? String(v.mrp) : "");
    setSpecValues(
      Object.fromEntries(Object.entries(v.specs || {}).map(([specId, val]) => [specId, val ?? ""]))
    );
    setForeignSpecDetails(
      (v.specDetails || []).filter((sd) => !specDefs.some((d) => String(d.specificationId) === String(sd.specificationId)))
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setItemVariantId("");
    setVariantCode("");
    setMrp("");
    resetSpecs();
  };

  const handleDeleteVariant = async (id) => {
    const remarks = await promptDeleteRemarks({
      title: "Delete Variant?",
      text: "Are you sure you want to delete this variant?",
    });
    if (!remarks) return;
    setTableLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/Inventory/DeleteItemVariant`,
        { itemVariantId: id, remarks },
        { headers: getHeaders() }
      );

      if (res.data?.message === "Success" || !res.data?.message) {
        Swal.fire("Deleted", "Variant deleted successfully", "success");
        fetchVariants();
      } else {
        Swal.fire("Error", res.data?.message || "Failed to delete", "error");
      }
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || "Failed to delete variant", "error");
    } finally {
      setTableLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-screen">
      <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl">
            <ListTree size={28} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Item Variant Master</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Manage variants for <strong className="text-indigo-600">{itemName}</strong></p>
          </div>
        </div>
        
        <button 
          onClick={() => router.push("/itemMaster")}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
        >
          <ArrowLeft size={16} /> Back to Items
        </button>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8">
        <div className="flex flex-col md:flex-row gap-6 items-end">
          <div className="flex-1 w-full opacity-70">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Item Name</label>
            <input
              type="text"
              value={itemName}
              readOnly
              className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-slate-600 font-medium cursor-not-allowed outline-none"
            />
          </div>

          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Variant Code <span className="text-slate-400 font-normal normal-case">(Ex: 045-BLACK / 329DW)</span></label>
            <input
              type="text"
              value={variantCode}
              onChange={(e) => setVariantCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveVariant()}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm"
              placeholder="Enter Variant Code"
            />
          </div>

          {showMrp && (
            <div className="w-full md:w-48">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">MRP</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                <input
                  type="number"
                  min="0"
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveVariant()}
                  className="w-full bg-white border border-slate-300 rounded-xl pl-8 pr-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {itemVariantId && (
              <button
                onClick={handleCancelEdit}
                className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSaveVariant}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-200 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 min-w-[160px]"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : itemVariantId ? <Edit2 size={18} /> : <Plus size={18} />}
              {itemVariantId ? "Update Variant" : "Save Variant"}
            </button>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase">Specifications</p>
            {categoryId && (
              <button
                type="button"
                onClick={() => setShowSpecModal(true)}
                className="text-xs text-indigo-500 font-medium hover:underline flex items-center gap-1"
              >
                <Settings2 size={13} /> Manage specifications for {categoryName}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loadingSpecDefs ? (
              <div className="col-span-full flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" /> Loading specifications...
              </div>
            ) : specDefs.length === 0 ? (
              <p className="col-span-full text-sm text-slate-400">
                No specifications defined for this category yet.
              </p>
            ) : (
              specDefs.map((spec) => (
                <div key={spec.specificationId}>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{spec.specName}</label>
                  {spec.fieldType === "DROPDOWN" ? (
                    <select
                      value={specValues[spec.specificationId] || ""}
                      onChange={(e) => setSpecValues((prev) => ({ ...prev, [spec.specificationId]: e.target.value }))}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="">-- Select --</option>
                      {spec.options.map((o) => (
                        <option key={o.optionId} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <textarea
                      value={specValues[spec.specificationId] || ""}
                      onChange={(e) => setSpecValues((prev) => ({ ...prev, [spec.specificationId]: e.target.value }))}
                      rows={2}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 resize-y"
                    />
                  )}
                </div>
              ))
            )}
          </div>
          {itemVariantId && foreignSpecDetails.length > 0 && (
            <div className="mt-5 pt-5 border-t border-dashed border-slate-200">
              <p className="text-xs font-bold text-amber-600 uppercase mb-1">Other Specifications</p>
              <p className="text-[11px] text-slate-400 mb-3">
                Carried over from a different category (likely via Transfer Variant) — fix the value here, or clear it to remove.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {foreignSpecDetails.map((spec) => (
                  <div key={spec.specificationId}>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{spec.specName}</label>
                    <textarea
                      value={specValues[spec.specificationId] ?? ""}
                      onChange={(e) => setSpecValues((prev) => ({ ...prev, [spec.specificationId]: e.target.value }))}
                      rows={2}
                      className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-100 resize-y"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search variant code..."
            className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">

                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Variant Code</th>
                {showMrp && <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">MRP</th>}
                {showMrp && <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Average Price</th>}
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Stock</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-64">Action</th>
              </tr>
            </thead>
                <tbody className="divide-y divide-slate-100">
              {variants.length > 0 ? (
                variants.map((v, index) => {
                  const isExpanded = expandedVariantId === v.itemVariantId;
                  const colCount = showMrp ? 5 : 3;
                  return (
                  <React.Fragment key={v.itemVariantId || index}>
                  <tr
                    className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
                    onClick={() => setExpandedVariantId((prev) => (prev === v.itemVariantId ? "" : v.itemVariantId))}
                  >
                    <td className="py-4 px-6 text-sm font-bold text-slate-800 font-mono">
                      <span className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                        {v.variantCode}
                      </span>
                    </td>
                    {showMrp && (
                      <td className="py-4 px-6 text-sm text-right font-semibold text-slate-700">
                        {v.mrp != null ? `₹${Number(v.mrp).toLocaleString("en-IN")}` : "-"}
                      </td>
                    )}
                    {showMrp && (
                      <td className="py-4 px-6 text-sm text-right font-semibold text-slate-700">
                        {v.avgPurchaseRate != null && v.avgPurchaseRate > 0 ? `₹${Number(v.avgPurchaseRate).toLocaleString("en-IN")}` : "-"}
                      </td>
                    )}
                    <td className="py-4 px-6 text-center">
                      <span className="bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-full text-xs">{v.availablePCS ?? 0}</span>
                    </td>
                    <td className="py-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEditVariant(v)}
                          title="Edit"
                          className="bg-amber-50 border border-amber-100 hover:bg-amber-100 text-amber-700 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center"
                        >
                          <Edit2 size={14} />
                        </button>
                        {isTrackable ? (
                          canAddSerial && (
                            <button
                              onClick={() => router.push(`/itemVariant/serials?itemVariantId=${encodeURIComponent(v.itemVariantId)}&variantCode=${encodeURIComponent(v.variantCode || "")}`)}
                              title="Serial No."
                              className="bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center"
                            >
                              <Hash size={14} />
                            </button>
                          )
                        ) : (
                          canAddStock && (
                            <button
                              onClick={() => openVariantBatches(v)}
                              title="Add Stock"
                              className="bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 text-emerald-700 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center"
                            >
                              <PackagePlus size={14} />
                            </button>
                          )
                        )}
                        <button
                          onClick={() => router.push(`/variantBarcode?itemVariantId=${v.itemVariantId}`)}
                          title="Map Barcode"
                          className="bg-sky-50 border border-sky-100 hover:bg-sky-100 text-sky-700 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center"
                        >
                          <Barcode size={14} />
                        </button>
                        {canTransferVariant && (
                          <button
                            onClick={() => openTransferModal(v)}
                            title="Transfer to another Item"
                            className="bg-teal-50 border border-teal-100 hover:bg-teal-100 text-teal-700 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center"
                          >
                            <ArrowRightLeft size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteVariant(v.itemVariantId)}
                          title="Delete"
                          className="bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (() => {
                    // specDefs are this ITEM's category fields (shown even when
                    // empty, so you can see what's fillable here). specDetails
                    // are whatever this VARIANT actually carries — which can
                    // include values from a category it belonged to before a
                    // Transfer Variant move; those still show here (with their
                    // own name) instead of silently disappearing, same as the
                    // variant's stock/serials already survive a transfer.
                    const foreignSpecs = (v.specDetails || []).filter(
                      (sd) => !specDefs.some((d) => String(d.specificationId) === String(sd.specificationId))
                    );
                    return (
                    <tr className="bg-slate-50/70">
                      <td colSpan={colCount} className="px-6 py-4">
                        {specDefs.length === 0 && foreignSpecs.length === 0 ? (
                          <p className="text-xs text-slate-400">No specifications defined for this category.</p>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {specDefs.map((spec) => (
                              <div key={spec.specificationId}>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{spec.specName}</p>
                                <p className="text-sm font-semibold text-slate-700">
                                  {v.specs?.[spec.specificationId] || "-"}
                                </p>
                              </div>
                            ))}
                            {foreignSpecs.map((spec) => (
                              <div key={spec.specificationId}>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{spec.specName} <span className="normal-case font-medium text-slate-300">(other category)</span></p>
                                <p className="text-sm font-semibold text-slate-700">{spec.value || "-"}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })()}
                  </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={showMrp ? 5 : 3} className="py-8 px-6 text-center">
                    {tableLoading ? (
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <Loader2 className="animate-spin mb-2" size={24} />
                        <span className="text-sm font-medium">Loading variants...</span>
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-slate-500">No variants found</div>
                    )}
                  </td>
                </tr>
              )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalRecords > 0 && (
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-500 font-medium">
                    Showing <span className="font-bold text-slate-700">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPage * pageSize, totalRecords)}</span> of <span className="font-bold text-slate-700">{totalRecords}</span> entries
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <select 
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-600 outline-none focus:border-indigo-400 transition-all cursor-pointer"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
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
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, Math.ceil(totalRecords / pageSize)) }, (_, i) => {
                       const pageNum = i + 1;
                       return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${
                            currentPage === pageNum ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'text-slate-600 hover:bg-white hover:text-indigo-600'
                          }`}
                        >
                          {pageNum}
                        </button>
                       );
                    })}
                  </div>

                  <button 
                    disabled={currentPage >= Math.ceil(totalRecords / pageSize)}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>

          {batchModalVariant && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeVariantBatches}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <PackagePlus size={18} className="text-emerald-600" /> Add Stock — {batchModalVariant.variantCode}
                  </h2>
                  <button onClick={closeVariantBatches} className="text-slate-400 hover:text-slate-700">
                    <X size={20} />
                  </button>
                </div>

                <div className="px-6 pt-4">
                  <div className="flex gap-2">
                    <div className="w-28">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={newBatchQty}
                        onChange={(e) => setNewBatchQty(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-100 outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Purchase Rate</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={newBatchRate}
                          onChange={(e) => setNewBatchRate(e.target.value)}
                          className="w-full border border-slate-300 rounded-xl pl-7 pr-2 py-2 text-sm focus:ring-2 focus:ring-emerald-100 outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Godown</label>
                      <select
                        value={newBatchGodownGuid}
                        onChange={(e) => setNewBatchGodownGuid(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-slate-700"
                      >
                        <option value="">Select Godown (optional)</option>
                        {godowns.map((g) => (
                          <option key={g.guid || g.id} value={g.guid || g.id}>{g.godownName || g.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={handleAddStock}
                        disabled={addingBatch || !newBatchQty}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
                      >
                        {addingBatch ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                        Add
                      </button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Vendor</label>
                    <select
                      value={newBatchVendorId}
                      onChange={(e) => setNewBatchVendorId(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-slate-700"
                    >
                      <option value="">Select Vendor (optional)</option>
                      {vendors.map((v) => (
                        <option key={v.vendorId || v.id} value={v.vendorId || v.id}>{v.vendorFirmName || v.name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">Each add is recorded as its own price batch — old batches keep their own rate instead of being averaged away.</p>
                </div>

                <div className="flex items-center justify-end px-6 py-4 mt-2 border-t border-slate-100">
                  <button onClick={closeVariantBatches} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSpecModal && categoryId && (
            <CategorySpecificationModal
              category={{ categoryId, categoryName }}
              onClose={() => {
                setShowSpecModal(false);
                fetchSpecDefs();
              }}
            />
          )}

          {transferringVariant && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeTransferModal}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <ArrowRightLeft size={18} className="text-teal-600" /> Transfer Variant
                  </h2>
                  <button onClick={closeTransferModal} className="text-slate-400 hover:text-slate-700">
                    <X size={20} />
                  </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                  <p className="text-sm text-slate-500">
                    Move <span className="font-bold text-slate-700">{transferringVariant.variantCode}</span> to a different item —
                    its stock, serial numbers, specifications, and barcodes all move with it.
                  </p>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Destination Item</label>
                    {loadingAllItems ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                        <Loader2 size={14} className="animate-spin" /> Loading items...
                      </div>
                    ) : (() => {
                      const eligibleItems = allItems.filter((it) => it.itemId !== rawItemId && !!it.isTrackable === !!isTrackable);
                      return eligibleItems.length === 0 ? (
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                          No other item with the same &quot;Ask Serial No.&quot; setting exists yet. Create one first (Item Master), then transfer here.
                        </p>
                      ) : (
                        <select
                          value={transferDestItemId}
                          onChange={(e) => setTransferDestItemId(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        >
                          <option value="">Select an item...</option>
                          {eligibleItems.map((it) => (
                            <option key={it.itemId} value={it.itemId}>{it.itemName}{it.categoryName ? ` (${it.categoryName})` : ""}</option>
                          ))}
                        </select>
                      );
                    })()}
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Only items with the same &quot;Ask Serial No.&quot; setting are shown, so stock keeps showing up correctly after the move.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
                  <button onClick={closeTransferModal} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
                    Cancel
                  </button>
                  <button
                    onClick={handleTransferVariant}
                    disabled={transferSubmitting || !transferDestItemId}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {transferSubmitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
                    {transferSubmitting ? "Transferring..." : "Transfer"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
  );
};

export default ItemVariant;


