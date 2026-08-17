"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Swal from "sweetalert2";
import axios from "axios";
import { Plus, Loader2, ListTree, ArrowLeft, Trash2, Barcode, Hash, X, Edit2, Search, Settings2 } from "lucide-react";
import CategorySpecificationModal from "../categoryMaster/CategorySpecificationModal";

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
  };
  
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);

  // Click a variant to open a popup with its serial numbers
  const [expandedVariantId, setExpandedVariantId] = useState("");
  const [serialModalVariant, setSerialModalVariant] = useState(null); // { itemVariantId, variantCode }
  const [serialModalRows, setSerialModalRows] = useState([]);
  const [loadingSerialModal, setLoadingSerialModal] = useState(false);

  const openVariantSerials = async (v) => {
    setSerialModalVariant(v);
    setSerialModalRows([]);
    setLoadingSerialModal(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/Inventory/GetVariantSerials`, {
        params: { itemVariantId: v.itemVariantId },
        headers: getHeaders(),
      });
      setSerialModalRows(response.data?.data || []);
      setNewLandingPrice(response.data?.lastPurchaseRate ? String(response.data.lastPurchaseRate) : "");
    } catch (error) {
      console.error("Failed to load serials", error);
      setSerialModalRows([]);
    } finally {
      setLoadingSerialModal(false);
    }
  };

  const closeVariantSerials = () => {
    setSerialModalVariant(null);
    setSerialModalRows([]);
    setNewSerialValue("");
    setNewLandingPrice("");
    setNewGodownGuid("");
  };

  const [newSerialValue, setNewSerialValue] = useState("");
  const [newLandingPrice, setNewLandingPrice] = useState("");
  const [newGodownGuid, setNewGodownGuid] = useState("");
  const [godowns, setGodowns] = useState([]);
  const [addingSerial, setAddingSerial] = useState(false);
  const [deletingSerialGuid, setDeletingSerialGuid] = useState("");

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

  const handleDeleteSerial = (serial) => {
    Swal.fire({
      title: "Delete Serial No.?",
      text: `This will remove "${serial.value}" from stock.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      setDeletingSerialGuid(serial.guid);
      try {
        await axios.post(
          `${API_BASE_URL}/Inventory/DeleteVariantSerial`,
          { serialGuid: serial.guid },
          { headers: getHeaders() }
        );
        await openVariantSerials(serialModalVariant);
        fetchVariants(currentPage, pageSize);
      } catch (error) {
        Swal.fire("Error", error.response?.data?.message || "Failed to delete serial", "error");
      } finally {
        setDeletingSerialGuid("");
      }
    });
  };

  const handleAddSerial = async () => {
    // One or more serial numbers — split on newline/comma for bulk add.
    const values = newSerialValue
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    if (values.length === 0 || !serialModalVariant) return;
    setAddingSerial(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/Inventory/AddVariantSerial`,
        {
          itemVariantId: serialModalVariant.itemVariantId,
          values,
          landingPrice: newLandingPrice !== "" ? Number(newLandingPrice) : 0,
          godownGuid: newGodownGuid || null,
        },
        { headers: getHeaders() }
      );
      setNewSerialValue("");
      await openVariantSerials(serialModalVariant);
      fetchVariants(currentPage, pageSize);
      if (res.data?.count > 1) {
        Swal.fire("Success", `${res.data.count} serial numbers added`, "success");
      }
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || "Failed to add serial number(s)", "error");
    } finally {
      setAddingSerial(false);
    }
  };

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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setItemVariantId("");
    setVariantCode("");
    setMrp("");
    resetSpecs();
  };

  const handleDeleteVariant = (id) => {
    Swal.fire({
      title: "Delete Variant?",
      text: "Are you sure you want to delete this variant?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    }).then(async (result) => {
      if (result.isConfirmed) {
        setTableLoading(true);
        try {
          const res = await axios.post(`${API_BASE_URL}/Inventory/DeleteItemVariant`, 
            { itemVariantId: id }, 
            { headers: getHeaders() }
          );
          
          if (res.data?.message === "Success" || !res.data?.message) {
            Swal.fire("Deleted", "Variant deleted successfully", "success");
            fetchVariants();
          } else {
            Swal.fire("Error", res.data?.message || "Failed to delete", "error");
          }
        } catch (error) {
          console.error(error);
          // If the backend returns empty response on success as per CSHTML jQuery ajax
          fetchVariants(); 
        } finally {
          setTableLoading(false);
        }
      }
    });
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
                        {isTrackable && (
                          <button
                            onClick={() => openVariantSerials(v)}
                            title="Serial No."
                            className="bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center"
                          >
                            <Hash size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/variantBarcode?itemVariantId=${v.itemVariantId}`)}
                          title="Map Barcode"
                          className="bg-sky-50 border border-sky-100 hover:bg-sky-100 text-sky-700 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center"
                        >
                          <Barcode size={14} />
                        </button>
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
                  {isExpanded && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={colCount} className="px-6 py-4">
                        {specDefs.length === 0 ? (
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
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
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

          {serialModalVariant && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeVariantSerials}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Hash size={18} className="text-indigo-600" /> Serial Numbers — {serialModalVariant.variantCode}
                  </h2>
                  <button onClick={closeVariantSerials} className="text-slate-400 hover:text-slate-700">
                    <X size={20} />
                  </button>
                </div>

                <div className="px-6 pt-4">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Add Serial No. <span className="text-slate-400 font-normal normal-case">(ek se zyada ho to alag-alag line mein daalo — bulk add)</span></label>
                  <textarea
                    value={newSerialValue}
                    onChange={(e) => setNewSerialValue(e.target.value)}
                    rows={3}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none resize-y"
                    placeholder={"Enter or scan serial number(s)\nOne per line for bulk add"}
                  />
                  <div className="flex gap-2 mt-2">
                    <div className="w-32 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                      <input
                        type="number"
                        min="0"
                        value={newLandingPrice}
                        onChange={(e) => setNewLandingPrice(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl pl-7 pr-2 py-2 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                        placeholder="Landing"
                        title="Landing Price"
                      />
                    </div>
                    <select
                      value={newGodownGuid}
                      onChange={(e) => setNewGodownGuid(e.target.value)}
                      className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 outline-none bg-white text-slate-700"
                      title="Godown"
                    >
                      <option value="">Select Godown (optional)</option>
                      {godowns.map((g) => (
                        <option key={g.guid || g.id} value={g.guid || g.id}>{g.godownName || g.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddSerial}
                      disabled={addingSerial || !newSerialValue.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
                    >
                      {addingSerial ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                      Add
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Landing Price is pre-filled with the last used price for this variant — change it if this batch is different.</p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {loadingSerialModal ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 size={16} className="animate-spin" /> Loading serial numbers...
                    </div>
                  ) : serialModalRows.length === 0 ? (
                    <p className="text-sm text-slate-400">No serial numbers found for this variant.</p>
                  ) : (
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="p-2.5 text-xs font-bold text-slate-500 uppercase">Serial No.</th>
                          <th className="p-2.5 text-xs font-bold text-slate-500 uppercase">Status</th>
                          <th className="p-2.5 text-xs font-bold text-slate-500 uppercase text-right">Landing Price</th>
                          <th className="p-2.5 text-xs font-bold text-slate-500 uppercase text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {serialModalRows.map((s) => (
                          <tr key={s.guid}>
                            <td className="p-2.5 font-mono font-bold text-slate-800">{s.value}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                s.status === "Available" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600 border border-slate-200"
                              }`}>
                                {s.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-right text-slate-600">{s.landingPrice ? `₹${s.landingPrice}` : "-"}</td>
                            <td className="p-2.5 text-center">
                              {s.status === "Available" ? (
                                <button
                                  onClick={() => handleDeleteSerial(s)}
                                  disabled={deletingSerialGuid === s.guid}
                                  title="Delete"
                                  className="bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 p-1.5 rounded-lg transition-all disabled:opacity-50 inline-flex items-center justify-center"
                                >
                                  {deletingSerialGuid === s.guid ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 text-xs text-slate-400">
                  <span>{serialModalRows.length} serial number{serialModalRows.length !== 1 ? "s" : ""}</span>
                  <button onClick={closeVariantSerials} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
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
        </div>
  );
};

export default ItemVariant;


