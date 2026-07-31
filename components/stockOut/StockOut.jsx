"use client";
import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import axios from "axios";
import { PackageMinus, Check, Search, Hash, Tag, Loader2, ListOrdered, Navigation, ArrowRight, FileText, FileDown, Filter, X, Trash2, Edit2 } from "lucide-react";
import * as XLSX from 'xlsx';
import { inventoryService } from "@/lib/services/inventoryService";

import Pagination from "@/components/common/Pagination";
import StockOutModals from "./StockOutModals";


const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

const StockOut = () => {
  const [platforms, setPlatforms] = useState([]);
  const [platformId, setPlatformId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [orderId, setOrderId] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [barcode, setBarcode] = useState("");

  // Resolved Barcode Details
  const [itemVariantId, setItemVariantId] = useState("");
  const [variantName, setVariantName] = useState("");
  const [availableQty, setAvailableQty] = useState("");
  const [issueQty, setIssueQty] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");

  const [isSerialItem, setIsSerialItem] = useState(false);
  const [hasSku, setHasSku] = useState(false);
  const [unitName, setUnitName] = useState("");

  // Modals Data
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [barcodeVariants, setBarcodeVariants] = useState([]);

  const [showSkuModal, setShowSkuModal] = useState(false);
  const [skus, setSkus] = useState([]);
  const [selectedSkuId, setSelectedSkuId] = useState("");

  const [showSerialModal, setShowSerialModal] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [selectedSerials, setSelectedSerials] = useState([]);

  const [loading, setLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);

  // Cart & Invoice
  const [cartItems, setCartItems] = useState([]);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showComboDetailsModal, setShowComboDetailsModal] = useState(false);
  const [comboDetails, setComboDetails] = useState([]);
  const [activeComboName, setActiveComboName] = useState("");



  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [previewFileUrl, setPreviewFileUrl] = useState("");
  const [previewIsPdf, setPreviewIsPdf] = useState(false);



  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  const getHeaders = () => {
    const token = sessionStorage.getItem("pt_auth_token");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  useEffect(() => {
    // Setting static platforms as requested
    setPlatforms([
      { platformId: 'Amazon', platformName: 'Amazon' },
      { platformId: 'Flipkart', platformName: 'Flipkart' },
      { platformId: 'Wery', platformName: 'Wery' },
      { platformId: 'Other', platformName: 'Other' }
    ]);
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchHistory(startDate, endDate, currentPage, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  const fetchHistory = async (start = startDate, end = endDate, page = currentPage, limit = pageSize) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/Inventory/GetStockOutList`, {
        params: { startDate: start, endDate: end, page, limit },
        headers: getHeaders()
      });
      if (res.data?.data) {
        setHistoryItems(res.data.data);
        setTotalRecords(res.data.total || 0);
      }
    } catch (e) {
      console.error("Error fetching stock out history", e);
    }
  };

  const handleExportToday = () => {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    handleExportExcel(today, today);
  };

  const handleExportYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toLocaleDateString('en-CA');
    handleExportExcel(dateStr, dateStr);
  };

  const handleExportExcel = async (sDate = startDate, eDate = endDate) => {
    if (!sDate || !eDate) {
      Swal.fire("Date Required", "Please select a date range to export", "warning");
      return;
    }
    setExporting(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/Inventory/GetStockOutList`, {
        params: { startDate: sDate, endDate: eDate },
        headers: getHeaders()
      });
      const data = res.data?.data;
      if (!data || data.length === 0) {
        Swal.fire("No Data", "No records found for the selected range", "info");
        return;
      }

      const reportData = data.map(h => ({
        "Date": new Date(h.createdAt || h.issueDate).toLocaleString(),
        "Ref / Bill": h.refNo || "-",
        "Issued To": h.issuedBy || "Unknown",
        "Item Name": h.itemName,
        "Variant": h.variantCode,
        "Qty": h.issueQty,
        "Unit": h.unitName || "PCS",
        "Packing Cost": h.packingCost || 0,
        "Freight Cost": h.freightCost || 0,
        "Commission": h.commission || 0
      }));

      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "StockOut_Report");
      XLSX.writeFile(wb, `StockOut_${sDate}_to_${eDate}.xlsx`);

      Swal.fire("Exported", "Excel sheet downloaded successfully", "success");
    } catch (e) {
      console.error(e);
      Swal.fire("Error", "Failed to export excel", "error");
    } finally {
      setExporting(false);
    }
  };

  const handleViewComboDetails = async (variantId, variantName) => {
    try {
      const components = await inventoryService.getComboDetails(variantId);
      setComboDetails(components);
      setActiveComboName(variantName);
      setShowComboDetailsModal(true);
    } catch (e) {
      console.error(e);
      Swal.fire("Error", "Failed to fetch combo details", "error");
    }
  };

  const handleBarcodeEnter = async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await resolveBarcode();
    }
  };

  const resolveBarcode = async () => {
    if (!barcode.trim()) return;

    try {
      const res = await axios.get(`${API_BASE_URL}/Inventory/ResolveBarcodeForStockOut`, {
        params: { barcode: barcode.trim() },
        headers: getHeaders()
      });

      const data = res.data?.data;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        Swal.fire("Not Found", "Barcode not found in inventory", "warning");
        resetBarcodeData();
        return;
      }

      if (Array.isArray(data) && data.length === 1 && data[0].availableQty > 0) {
        // Exactly one variant found and it has stock - auto-select it
        await selectVariant(data[0]);
      } else if (Array.isArray(data) && data.length > 0) {
        // Either multiple variants or the only variant has 0 stock - show the modal
        setBarcodeVariants(data);
        setShowVariantModal(true);
      }

    } catch (error) {
      console.error(error);
      Swal.fire("Error", "Failed to resolve barcode", "error");
      resetBarcodeData();
    }
  };

  const selectVariant = async (data) => {
    setShowVariantModal(false);

    if (data.availableQty <= 0) {
      Swal.fire("Out of Stock", "This item/combo is currently out of stock", "warning");
      return;
    }

    if (data.isCombo) {
      // Fetch combo component details to validate stock availability
      try {
        const comboComponents = await inventoryService.getComboDetails(data.itemVariantId);
        // Check each component's available quantity against required combo count
        const insufficient = comboComponents.filter(c => {
          const requiredQty = c.comboCount || 0; // quantity needed per combo
          const available = c.availableQty || 0;
          return available < requiredQty;
        });
        if (insufficient.length > 0) {
          const first = insufficient[0];
          Swal.fire(
            'Out of Stock',
            `Combo cannot be added because component "${first.itemName || first.variantCode}" has insufficient quantity. Required: ${first.comboCount}, Available: ${first.availableQty}`,
            'warning'
          );
          // Do not add combo to cart
          resetBarcodeData();
          setBarcode("");
          setShowVariantModal(false);
          return;
        }
      } catch (e) {
        console.error('Failed to validate combo stock', e);
        Swal.fire('Error', 'Could not validate combo stock. Please try again.', 'error');
        resetBarcodeData();
        setBarcode("");
        setShowVariantModal(false);
        return;
      }
      const newItem = {
        id: Date.now() + Math.random(),
        itemVariantId: data.itemVariantId,
        variantName: data.variantCode || data.itemName,
        issueQty: 1,
        unitName: "Combo",
        serialIds: [],
        skuId: null,
        isCombo: true
      };
      setCartItems([...cartItems, newItem]);
      Swal.fire({
        title: "Added to Cart",
        text: `Combo ${data.variantCode} added successfully`,
        icon: "success",
        timer: 1500,
        showConfirmButton: false
      });
      resetBarcodeData();
      setBarcode("");
      setShowVariantModal(false);
      return;
    }

    setItemVariantId(data.itemVariantId);
    setVariantName(data.variantCode || data.itemName);
    setAvailableQty(data.availableQty);
    setIsSerialItem(data.isSerialItem);
    setHasSku(data.hasSku);
    setUnitName(data.unitName || "PCS");

    if (data.hasSku) {
      await loadSkuOptions(data.itemVariantId);
      setShowSkuModal(true);
      return;
    }

    if (data.isSerialItem) {
      // This opens the serial picker straight off a barcode scan, before the
      // user has typed a quantity — issueQty is still "" at this point, and
      // Number("") is 0, which made every checkbox's disabled condition
      // (selectedSerials.length >= Number(issueQty)) true from the start.
      // Serialized items are scanned/issued one at a time, so default to 1.
      setIssueQty(1);
      await loadSerials(data.itemVariantId);
      setShowSerialModal(true);
      return;
    }
  };

  const resetBarcodeData = () => {
    setItemVariantId("");
    setVariantName("");
    setAvailableQty("");
    setIssueQty("");
    setSellingPrice("");
    setIsSerialItem(false);
    setHasSku(false);
    setUnitName("");
    setSelectedSkuId("");
  };

  const loadSkuOptions = async (variantId) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/Inventory/GetSkuOptions`, {
        params: { itemVariantId: variantId },
        headers: getHeaders()
      });
      setSkus(res.data?.data || []);
    } catch (e) {
      console.error("Failed to fetch SKUs", e);
    }
  };

  const confirmSku = () => {
    if (!selectedSkuId) {
      Swal.fire("Warning", "Please select a SKU first", "warning");
      return;
    }
    setShowSkuModal(false);
  };

  const handleAddClick = async () => {
    const qty = Number(issueQty);

    if (!itemVariantId) {
      Swal.fire("Validation", "Please scan a valid barcode first", "warning");
      return;
    }

    if (qty <= 0 || !Number.isInteger(qty)) {
      Swal.fire("Validation", "Invalid quantity", "warning");
      return;
    }

    if (qty > Number(availableQty)) {
      Swal.fire("Validation", "Insufficient stock available", "warning");
      return;
    }

    if (isSerialItem) {
      await loadSerials();
      setShowSerialModal(true);
      return;
    }

    addToCart([]);
  };

  const addToCart = (serialIds = []) => {
    const newItem = {
      id: Date.now() + Math.random(),
      itemVariantId,
      variantName,
      barcode: barcode,
      availableQty: availableQty, // Save available qty for editing
      issueQty: Number(issueQty),
      sellingPrice: Number(sellingPrice) || 0,
      unitName,
      serialIds,
      skuId: selectedSkuId || null
    };
    setCartItems([...cartItems, newItem]);
    resetBarcodeData();
    setBarcode("");
  };

  const removeFromCart = (id) => {
    setCartItems(cartItems.filter(c => c.id !== id));
  };

  const clearCart = () => {
    Swal.fire({
      title: "Clear Cart?",
      text: "This will remove all items currently in your cart.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      confirmButtonText: "Yes, clear it!"
    }).then((result) => {
      if (result.isConfirmed) {
        setCartItems([]);
      }
    });
  };

  const editCartItem = (item) => {
    // Populate fields for editing
    setItemVariantId(item.itemVariantId);
    setVariantName(item.variantName);
    setAvailableQty(item.availableQty); // Restore available qty
    setIssueQty(item.issueQty);
    setSellingPrice(item.sellingPrice || "");
    setUnitName(item.unitName);
    setSelectedSkuId(item.skuId || "");
    setBarcode(item.barcode || ""); // Restore the barcode

    // Remove from cart
    removeFromCart(item.guid);

    // Smooth scroll to inputs
    window.scrollTo({ top: 0, behavior: 'smooth' });

    Swal.fire({
      title: "Editing Item",
      text: "Item has been moved to the input fields for modification.",
      icon: "info",
      timer: 1500,
      showConfirmButton: false
    });
  };

  const loadSerials = async (variantId = itemVariantId) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/Inventory/GetAvailableSerials`, {
        params: { itemVariantId: variantId },
        headers: getHeaders()
      });
      setAvailableSerials(res.data?.data || []);
      setSelectedSerials([]);
    } catch (e) {
      console.error("Failed to fetch serials", e);
    }
  };

  const handleSerialToggle = (serialId) => {
    setSelectedSerials((prev) =>
      prev.includes(serialId) ? prev.filter(id => id !== serialId) : [...prev, serialId]
    );
  };

  const confirmSerialOut = () => {
    if (selectedSerials.length !== Number(issueQty)) {
      Swal.fire("Warning", `Please select exactly ${issueQty} serial numbers. You have selected ${selectedSerials.length}.`, "warning");
      return;
    }

    setShowSerialModal(false);
    addToCart(selectedSerials);
  };

  const submitAll = async () => {
    if (cartItems.length === 0) {
      Swal.fire("Empty", "Please add items to issue", "warning");
      return;
    }

    // Ask for Packing & Freight costs via popup
    const { value: formValues } = await Swal.fire({
      title: 'Dispatch Costs',
      html: `
        <div style="text-align: left; padding: 10px;">
          <label style="display: block; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">Packing Cost</label>
          <input id="swal-packing" type="number" class="swal2-input" style="margin: 0; width: 100%; border-radius: 12px; border: 1px solid #e2e8f0;" placeholder="0.00">
          <br><br>
          <label style="display: block; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">Freight Cost</label>
          <input id="swal-freight" type="number" class="swal2-input" style="margin: 0; width: 100%; border-radius: 12px; border: 1px solid #e2e8f0;" placeholder="0.00">
          <br><br>
          <label style="display: block; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">Commission</label>
          <input id="swal-commission" type="number" class="swal2-input" style="margin: 0; width: 100%; border-radius: 12px; border: 1px solid #e2e8f0;" placeholder="0.00">
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Submit Dispatch',
      confirmButtonColor: '#4f46e5',
      preConfirm: () => {
        return {
          packing: document.getElementById('swal-packing').value || 0,
          freight: document.getElementById('swal-freight').value || 0,
          commission: document.getElementById('swal-commission').value || 0
        }
      }
    });

    if (!formValues) return;

    setLoading(true);
    try {
      let uploadedFilePath = null;
      if (invoiceFile) {
        const formData = new FormData();
        formData.append("file", invoiceFile);
        const uploadRes = await axios.post(`${API_BASE_URL}/Inventory/UploadStockOutInvoice`, formData, {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("pt_auth_token")}`, // ✅ Auth only
            // DO NOT set Content-Type — let Axios set it automatically with the correct boundary
          }
        });
        if (uploadRes.data?.filePath) {
          uploadedFilePath = uploadRes.data.filePath;
        }
      }

      const payload = {
        RefNo: billNo || null,
        OrderId: orderId || null,
        TrackingId: trackingId || null,
        IssueDate: new Date().toISOString(),
        IssuedBy: JSON.parse(sessionStorage.getItem("pt_user"))?.username || "System",
        Items: cartItems.map(item => ({
          itemVariantId: item.itemVariantId,
          issueQty: item.issueQty,
          sellingPrice: item.sellingPrice || 0,
          serials: item.serialIds // This was serialIds in cart
        })),
        invoiceFile: uploadedFilePath,
        packingCost: Number(formValues.packing || 0),
        freightCost: Number(formValues.freight || 0),
        commission: Number(formValues.commission || 0),
        platformId: platformId || null
      };

      const res = await axios.post(`${API_BASE_URL}/Inventory/SaveStockOut`, payload, {
        headers: getHeaders()
      });

      if (res.data?.message === "Success") {
        Swal.fire({
          title: "Success",
          text: "Dispatch recorded successfully!",
          icon: "success",
          timer: 2000,
          showConfirmButton: false
        }).then(() => {
          setBarcode("");
          setPlatformId("");
          setBillNo("");
          setOrderId("");
          setTrackingId("");
          setInvoiceFile(null);
          setCartItems([]);
          resetBarcodeData();
          fetchHistory();
        });
      } else {
        Swal.fire("Error", res.data?.message || "Failed to save dispatch", "error");
      }
    } catch (e) {
      console.error(e);
      const errorMsg = e.response?.data?.message || e.message || "Something went wrong";
      Swal.fire("Error", errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-screen relative">
      <div className="flex items-center gap-4 border-b border-slate-100 pb-6 mb-8">
        <div className="p-3 bg-rose-50 rounded-xl">
          <PackageMinus size={28} className="text-rose-600" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Stock Out (Issue / Sale)</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">Issue inventory to customers, bills, or platforms</p>
        </div>
      </div>

      {/* Header Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><Navigation size={14} /> Platform</label>
          <select
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-rose-100 outline-none transition-all shadow-sm"
          >
            <option value="">Select Platform</option>
            {platforms.map(p => (
              <option key={p.platformId} value={p.platformId}>{p.platformName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><FileText size={14} /> Bill No</label>
          <input
            type="text"
            value={billNo}
            onChange={(e) => setBillNo(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-rose-100 outline-none transition-all shadow-sm"
            placeholder="Invoice / Bill"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><Tag size={14} /> Order ID</label>
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-rose-100 outline-none transition-all shadow-sm"
            placeholder="Order ID"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><Hash size={14} /> Tracking ID</label>
          <input
            type="text"
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-rose-100 outline-none transition-all shadow-sm"
            placeholder="Tracking ID"
          />
        </div>

        <div className="flex flex-col sm:col-span-2">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><FileText size={14} /> Invoice File</label>
          <div className="flex gap-2">
            <input
              type="file"
              onChange={(e) => setInvoiceFile(e.target.files[0])}
              className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-[9px] text-slate-800 font-medium focus:ring-2 focus:ring-rose-100 outline-none transition-all shadow-sm file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100"
              accept="image/*,.pdf"
            />
            {invoiceFile && (
              <button
                type="button"
                onClick={() => {
                  const url = URL.createObjectURL(invoiceFile);
                  setPreviewFileUrl(url);
                  setPreviewIsPdf(invoiceFile.type === 'application/pdf' || invoiceFile.name.toLowerCase().endsWith('.pdf'));
                  setShowInvoicePreview(true);
                }}
                className="bg-indigo-50 text-indigo-600 p-3 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm"
                title="View Selected Invoice"
              >
                <FileText size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Barcode & Resolution Fields */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8">
        <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 flex items-center gap-2">
          <Search size={16} /> Scan & Issue Items
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Scan Barcode</label>
            <div className="relative">
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={handleBarcodeEnter}
                autoFocus
                className="w-full bg-white border-2 border-rose-200 rounded-xl pl-4 pr-12 py-3.5 font-mono font-bold text-slate-800 focus:border-rose-400 outline-none transition-all shadow-sm"
                placeholder="Scan barcode and press Enter..."
              />
              <button
                onClick={resolveBarcode}
                className="absolute right-2 top-2 bottom-2 bg-rose-50 text-rose-600 hover:bg-rose-100 px-3 rounded-lg font-bold text-sm transition-colors flex items-center"
              >
                Enter
              </button>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Variant Data</label>
            <div className="flex gap-4">
              <input
                type="text"
                value={variantName}
                readOnly
                className="w-full bg-slate-100 border border-slate-300 rounded-xl px-4 py-3.5 text-slate-600 font-medium cursor-not-allowed text-sm truncate shadow-sm"
                placeholder="Variant Name"
              />
              <div className="relative w-32 shrink-0">
                <div className="absolute -top-6 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Avail {unitName || 'PCS'}</div>
                <input
                  type="number"
                  value={availableQty}
                  readOnly
                  className="w-full bg-slate-100 border border-slate-300 rounded-xl px-4 py-3.5 text-center text-slate-700 font-black cursor-not-allowed shadow-sm"
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 mt-6 pt-6 border-t border-slate-200">
          <div className="flex flex-wrap items-center gap-4">
            {!!hasSku && (
              <span className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                <Tag size={14} /> SKU Selection Required
              </span>
            )}
            {!!isSerialItem && (
              <span className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                <ListOrdered size={14} /> Serials Required on Submission
              </span>
            )}
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-4 items-end justify-end">
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-bold text-rose-600 uppercase mb-2">Selling Price</label>
              <input
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full sm:w-32 bg-white border border-rose-300 focus:ring-2 focus:ring-rose-200 focus:border-rose-400 rounded-xl px-4 py-3 text-center text-slate-800 font-bold text-lg outline-none transition-all shadow-sm"
                placeholder="0.00"
                disabled={!itemVariantId}
              />
            </div>
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-bold text-rose-600 uppercase mb-2">Issue Qty</label>
              <input
                type="number"
                value={issueQty}
                onChange={(e) => setIssueQty(e.target.value)}
                min="1"
                className="w-full sm:w-24 bg-white border border-rose-300 focus:ring-2 focus:ring-rose-200 focus:border-rose-400 rounded-xl px-4 py-3 text-center text-rose-700 font-black text-lg outline-none transition-all shadow-sm"
                placeholder="1"
                disabled={!itemVariantId}
              />
            </div>
            <div className="w-full sm:w-auto">
              <label className="hidden sm:block text-xs font-bold text-transparent uppercase mb-2">&nbsp;</label>
              <button
                onClick={handleAddClick}
                disabled={!itemVariantId}
                className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md shadow-rose-200 hover:-translate-y-0.5 justify-center text-lg"
              >
                <Check size={18} /> Cart
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CART TABLE */}
      {cartItems.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-8 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <PackageMinus size={16} className="text-rose-500" />
              Items to Issue ({cartItems.length})
            </h3>
            <button
              onClick={clearCart}
              className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
            >
              <Trash2 size={12} /> Clear All
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 text-slate-500 text-[11px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-6">Item Details</th>
                  <th className="py-3 px-6 text-center">Qty</th>
                  <th className="py-3 px-6 text-center">Price</th>
                  <th className="py-3 px-6 text-center">Serials</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cartItems.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-6">
                      <div className="text-sm font-black text-slate-800">
                        {c.variantName === 'SYSTEM_COMBOS' ? 'Combo Item' : c.variantName}
                      </div>
                    </td>
                    <td className="py-3 px-6 text-center">
                      <span className="bg-rose-50 text-rose-700 px-3 py-1 rounded-lg text-xs font-black border border-rose-100">
                        {c.issueQty} {c.unitName}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-center">
                      <span className="font-bold text-slate-700">₹{c.sellingPrice?.toLocaleString() || '0'}</span>
                    </td>
                    <td className="py-3 px-6 text-center">
                      {c.serialIds?.length > 0 ? (
                        <span className="text-xs font-medium text-slate-500">{c.serialIds.length} Serials</span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => editCartItem(c)}
                          className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => removeFromCart(c.id)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-colors"
                          title="Remove"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              onClick={submitAll}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-8 py-3 rounded-xl font-black flex items-center gap-2 transition-all shadow-lg shadow-indigo-200"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
              Submit All Items
            </button>
          </div>
        </div>
      )}

      {/* HISTORY TABLE */}
      <div className="mt-12 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-wrap justify-between items-center gap-4">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <ListOrdered size={16} className="text-slate-500" />
            Stock Out History
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Export Buttons */}
            <button
              onClick={handleExportToday}
              disabled={exporting}
              className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-slate-200"
            >
              <FileDown size={14} /> Today
            </button>
            <button
              onClick={handleExportYesterday}
              disabled={exporting}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all border border-slate-200"
            >
              <FileDown size={14} /> Yesterday
            </button>

            <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>

            {/* Custom Filter Toggle */}
            <button
              onClick={() => setShowDateFilter(!showDateFilter)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border ${showDateFilter
                ? "bg-rose-50 border-rose-200 text-rose-600"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
            >
              <Filter size={14} /> {showDateFilter ? "Hide Custom Filter" : "Custom Filter"}
            </button>

            {showDateFilter && (
              <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                  <span className="text-[10px] font-black text-slate-400 uppercase">From</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 w-28"
                  />
                  <span className="text-[10px] font-black text-slate-400 uppercase ml-2">To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 w-28"
                  />
                </div>
                <button
                  onClick={() => handleExportExcel()}
                  disabled={exporting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-indigo-100 disabled:opacity-50"
                >
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                  Download
                </button>
              </div>
            )}

            <button onClick={() => fetchHistory()} className="text-slate-500 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider font-bold">
              <tr>

                <th className="py-3 px-6">Date / Time</th>
                <th className="py-3 px-6">Ref / Bill</th>
                <th className="py-3 px-6">Issued To</th>
                <th className="py-3 px-6">Item Details</th>
                <th className="py-3 px-6 text-center">Qty Out</th>
                <th className="py-3 px-6 text-center">Selling Price</th>
                <th className="py-3 px-6 text-center">Packing/Freight</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyItems.map((h, index) => {
                const [colorClass, intensity] = (h.rowColor || "").split("|");
                return (
                  <tr
                    key={h.stockOutId || index}
                    style={{ "--row-opacity": intensity ? parseInt(intensity) / 100 : undefined }}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${colorClass || (h.rowColor && !h.rowColor.includes('|') ? h.rowColor : '')}`}
                  >

                    <td className="py-4 px-6 text-sm font-medium text-slate-600">
                      {new Date(h.createdAt || h.issueDate).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-sm font-bold text-slate-700">
                      <div className="flex items-center gap-3">

                        <div className="flex flex-col">
                          <span className="bg-slate-100 rounded px-2 py-1 border border-slate-200">{h.refNo || "-"}</span>
                          {/* Tags Display */}
                          {(() => {
                            try {
                              const tags = h.tags ? JSON.parse(h.tags) : [];
                              if (tags.length === 0) return null;
                              return (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {tags.map((t, idx) => (
                                    <span
                                      key={idx}
                                      style={{ backgroundColor: t.tagColor + '15', color: t.tagColor, borderColor: t.tagColor + '30' }}
                                      className="px-1.5 py-0.5 rounded-[4px] text-[9px] font-extrabold uppercase border"
                                    >
                                      {t.tagName}
                                    </span>
                                  ))}
                                </div>
                              );
                            } catch (e) { return null; }
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold">
                        {h.issuedBy || "Unknown"}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-black text-slate-800">
                          {h.itemName === 'SYSTEM_COMBOS' ? h.variantCode : h.itemName}
                        </div>
                        <div className="flex items-center gap-2">
                          {h.itemName !== 'SYSTEM_COMBOS' && (
                            <div className="text-xs text-slate-500 font-mono">{h.variantCode}</div>
                          )}
                          {h.comboCount > 0 && (
                            <button
                              onClick={() => handleViewComboDetails(h.itemVariantId, h.variantCode)}
                              className="bg-fuchsia-50 text-fuchsia-600 text-[9px] font-black px-1.5 py-0.5 rounded-md border border-fuchsia-100 hover:bg-fuchsia-100 transition-colors uppercase tracking-tighter whitespace-nowrap"
                            >
                              Details
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="bg-rose-50 text-rose-700 px-3 py-1 rounded-lg text-sm font-black border border-rose-100">
                        {h.issueQty} {h.unitName || 'PCS'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="text-sm font-bold text-slate-700">₹{h.sellingPrice?.toLocaleString() || '0'}</span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">P: ₹{h.packingCost || 0}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">F: ₹{h.freightCost || 0}</div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {h.invoiceFile && (
                        <button
                          // ✅ Fixed
                          onClick={() => {
                            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
                            const filename = h.invoiceFile.replace(/^\/?(uploads\/)?/, ''); // strip any accidental prefix
                            setPreviewFileUrl(`${baseUrl}/uploads/${filename}`);
                            setPreviewIsPdf(filename.toLowerCase().endsWith('.pdf'));
                            setShowInvoicePreview(true);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100 shadow-sm"
                        >
                          <FileText size={14} /> View
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {historyItems.length === 0 && (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-500 font-medium">
                    No recent stock out records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          accent="rose"
          currentPage={currentPage}
          pageSize={pageSize}
          totalRecords={totalRecords}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        />
      </div>
      <StockOutModals
        {...{
          activeComboName, availableSerials, barcodeVariants, comboDetails,
          confirmSerialOut, confirmSku, handleSerialToggle, issueQty, previewFileUrl,
          previewIsPdf, selectVariant, selectedSerials, selectedSkuId,
          setSelectedSkuId, setShowComboDetailsModal, setShowInvoicePreview,
          setShowSerialModal, setShowSkuModal, setShowVariantModal,
          showComboDetailsModal, showInvoicePreview, showSerialModal, showSkuModal,
          showVariantModal, skus,
        }}
      />
    </div>
  );
};

export default StockOut;


