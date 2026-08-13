"use client";
import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import axios from "axios";
import {
  PackagePlus, Search, Store, FileText, Trash2, Edit2, Edit,
  Settings, Save, Loader2, ListOrdered, CheckCircle2, Upload, FileDown, Filter, X, Lock
} from "lucide-react";
import * as XLSX from 'xlsx';
import StockInModals from "./StockInModals";
import { inventoryService } from "@/lib/services/inventoryService";
import { legacyApi } from "@/lib/client/http";
import { printerService } from "@/lib/services/api";
import DayFilterSelect from "@/components/common/DayFilterSelect";
import { getDayFilterRange } from "@/lib/client/dayFilter";
import { toLocalDateStr as toYmd } from "@/lib/dateUtils";


// In a real crypto JS environment we'd use crypto.randomUUID()
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const StockIn = ({ onRefresh, initialDayFilter = "all", initialCustomStart = "", initialCustomEnd = "" }) => {
  const [stockInId, setStockInId] = useState("");
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [parsingInvoice, setParsingInvoice] = useState(false);
  const fileInputRef = React.useRef(null);
  
  const [stockItems, setStockItems] = useState([]);
  
  // History Filters and counts
  const [activeFilter, setActiveFilter] = useState(() => parseInt(localStorage.getItem('stockInFilter') || "0"));
  const [draftCount, setDraftCount] = useState(0);
  const [finalCount, setFinalCount] = useState(0);
  const [historyItems, setHistoryItems] = useState([]);
  const [isFinalized, setIsFinalized] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    if (initialDayFilter === "custom") return initialCustomStart;
    const range = getDayFilterRange(initialDayFilter);
    return range ? toYmd(range.start) : "";
  });
  const [endDate, setEndDate] = useState(() => {
    if (initialDayFilter === "custom") return initialCustomEnd;
    const range = getDayFilterRange(initialDayFilter);
    return range ? toYmd(range.end) : "";
  });
  const [exporting, setExporting] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dayFilter, setDayFilter] = useState(initialDayFilter);

  const handleDayFilterChange = (key) => {
    setDayFilter(key);
    if (key === "custom") return; // wait for custom start/end inputs below
    const range = getDayFilterRange(key);
    setStartDate(range ? toYmd(range.start) : "");
    setEndDate(range ? toYmd(range.end) : "");
  };

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Modals
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendorFirmName, setNewVendorFirmName] = useState("");

  const [showSerialModal, setShowSerialModal] = useState(false);
  const [serialPopupIndex, setSerialPopupIndex] = useState(-1);
  const [serialNumbersToSave, setSerialNumbersToSave] = useState([]);

  const [showVariantModal, setShowVariantModal] = useState(false);
  const [barcodeVariants, setBarcodeVariants] = useState([]);
  const [currentScannedBarcode, setCurrentScannedBarcode] = useState("");

  const [units, setUnits] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [pendingVariantData, setPendingVariantData] = useState(null);

  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [previewFileUrl, setPreviewFileUrl] = useState("");

  // ----------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------
  useEffect(() => {
    fetchVendors();
    fetchCounts();
    fetchHistory(activeFilter);
    loadDraftContext();
    fetchUnits();
    fetchGodowns();
  }, [activeFilter, startDate, endDate]);

  useEffect(() => {
    fetchHistory(activeFilter, startDate, endDate, currentPage, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  useEffect(() => {
    // Setup global hotkeys matching CSHTML feature
    const handleKeyDown = (e) => {
      if (!e.altKey) return;
      
      switch (e.key.toLowerCase()) {
        case "d": e.preventDefault(); handleFilterChange(0); break;
        case "f": e.preventDefault(); handleFilterChange(1); break;
        case "b": {
          e.preventDefault(); 
          const barcodeField = document.getElementById("barcode-scanner");
          if(barcodeField) barcodeField.focus();
          break;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchVendors = async (selectedId = null) => {
    try {
      const res = await legacyApi.get("/Inventory/GetVendorDropdown");
      const data = res.data?.data || [];
      setVendors(data || []);
      if (selectedId) setVendorId(selectedId);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGodowns = async () => {
    try {
      const gRes = await printerService.getGodowns();
      setGodowns(Array.isArray(gRes) ? gRes : (gRes.value || []));
    } catch (e) {
      console.error("Failed to fetch godowns", e);
    }
  };

  const fetchUnits = async () => {
    try {
      const res = await legacyApi.get("/Inventory/GetUnitDropdown");
      const data = res.data?.data || [];
      setUnits(data || []);
    } catch (e) {
      console.error("Failed to load units:", e);
    }
  };

  const fetchCounts = async () => {
    try {
      const data = await inventoryService.getStockInCounts();
      setDraftCount(Number(data?.draftCount || 0));
      setFinalCount(Number(data?.finalizedCount || 0));
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async (status, start = startDate, end = endDate, page = currentPage, limit = pageSize) => {
    try {
      const response = await inventoryService.getStockInList(status, start, end, page, limit);
      setHistoryItems(response?.data || []);
      setTotalRecords(response?.total || 0);
    } catch (e) {
      console.error(e);
    }
  };

  const handleFilterChange = (status) => {
    setActiveFilter(status);
    localStorage.setItem('stockInFilter', status);
    setCurrentPage(1); // Reset to page 1
    fetchHistory(status, startDate, endDate, 1, pageSize);
  };

  const handleExportExcel = async () => {
    if (!startDate || !endDate) {
      Swal.fire("Date Required", "Please select a date range to export", "warning");
      return;
    }
    setExporting(true);
    try {
      const data = await inventoryService.getStockInList(activeFilter, startDate, endDate);
      if (!data || data.length === 0) {
        Swal.fire("No Data", "No records found for the selected range", "info");
        return;
      }

      const reportData = data.map(h => ({
        "Invoice No": h.invoiceNo,
        "Date": h.invoiceDate.split("T")[0],
        "Vendor": h.vendorFirmName || h.vendorName || "-",
        "Total Qty": h.totalQty || 0,
        "Total Amount": h.totalAmount || 0,
        "Status": h.status === 0 ? "Draft" : "Finalized"
      }));

      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "StockIn_Report");
      XLSX.writeFile(wb, `StockIn_${activeFilter === 1 ? "Finalized" : "Draft"}_${startDate}_to_${endDate}.xlsx`);
      
      Swal.fire("Exported", "Excel sheet downloaded successfully", "success");
    } catch (e) {
      console.error(e);
      Swal.fire("Error", "Failed to export excel", "error");
    } finally {
      setExporting(false);
    }
  };

  const handleExportToday = async () => {
    const today = new Date().toLocaleDateString('en-CA');
    setStartDate(today);
    setEndDate(today);
    await fetchHistory(activeFilter, today, today);
    // Add small delay to ensure state/data is ready before export
    setTimeout(() => handleExportExcel(today, today), 500);
  };

  const handleExportYesterday = async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toLocaleDateString('en-CA');
    setStartDate(dateStr);
    setEndDate(dateStr);
    await fetchHistory(activeFilter, dateStr, dateStr);
    setTimeout(() => handleExportExcel(dateStr, dateStr), 500);
  };

  const applyCustomFilter = () => {
    if (!startDate || !endDate) {
      Swal.fire("Date Required", "Please select both start and end dates", "warning");
      return;
    }
    fetchHistory(activeFilter, startDate, endDate);
  };

  // ----------------------------------------------------
  // DRAFT MANAGEMENT
  // ----------------------------------------------------
  const loadDraftContext = async () => {
    try {
      const data = await inventoryService.getLastDraftStockIn();
      
      if (data.length === 0) {
        setStockInId(generateUUID());
        return; // fresh draft
      }

      const draft = data[0];
      setStockInId(draft.stockInId);
      setVendorId(draft.vendorId);
      setInvoiceNo(draft.invoiceNo);
      if (draft.invoiceDate) {
        setInvoiceDate(draft.invoiceDate.split("T")[0]);
      }
      setInvoiceFile(draft.invoiceFile || null);

      // Fetch details for this draft
      const detailData = await inventoryService.getStockInDetails(draft.stockInId);
      const items = detailData.map((r) => ({
        stockInDetailId: r.stockInDetailId,
        itemVariantId: r.itemVariantId,
        unitId: r.unitId,
        variantPackBarcodeId: r.variantPackBarcodeId,
        barcode: r.barcode,
        itemName: r.itemName,
        variantCode: r.variantCode,
        modelGuid: r.modelGuid,
        godownGuid: r.godownGuid,
        unitName: r.unitName,
        qty: Number(r.qty || 0),
        pcs: Number(r.pcs || 1),
        rate: Number(r.rate || 0),
        amount: Number(r.amount || 0),
        hasSerialNumber: !!r.hasSerialNumber,
        serialCount: Number(r.serialCount || 0),
        rowColor: r.rowColor,
        tags: r.tags
      }));

      setStockItems(items);
      setIsFinalized(false);
    } catch (e) {
      console.error("Failed to load draft context", e);
      setStockInId(generateUUID());
    }
  };
  const resetForm = () => {
    setStockInId(generateUUID());
    setVendorId("");
    setInvoiceNo("");
    setInvoiceDate("");
    setStockItems([]);
    setIsFinalized(false);
    setBarcodeInput("");
    setInvoiceFile(null);
  };

  const loadSpecificDraft = async (id) => {
    if (!id) return;
    setStockInId(id);
    setStockItems([]);

    try {
      const data = await inventoryService.getStockInDetails(id);
      if (!data || data.length === 0) return;

      const h = data[0];
      setVendorId(h.vendorId);
      setInvoiceNo(h.invoiceNo);
      if (h.invoiceDate) setInvoiceDate(h.invoiceDate.split("T")[0]);
      setInvoiceFile(h.invoiceFile || null);

      const items = data
        .filter(r => r.stockInDetailId)
        .map((r) => ({
          stockInDetailId: r.stockInDetailId,
          itemVariantId: r.itemVariantId,
          unitId: r.unitId,
          variantPackBarcodeId: r.variantPackBarcodeId,
          barcode: r.barcode,
          itemName: r.itemName,
          variantCode: r.variantCode,
          modelGuid: r.modelGuid,
          godownGuid: r.godownGuid,
          unitName: r.unitName,
          qty: Number(r.qty || 0),
          pcs: Number(r.pcs || 1),
          rate: Number(r.rate || 0),
          amount: Number(r.amount || 0),
          hasSerialNumber: !!r.hasSerialNumber,
          serialCount: Number(r.serialCount || 0),
          rowColor: r.rowColor,
          tags: r.tags
        }));

      setStockItems(items);
      setIsFinalized(h.stockInStatus === 1 || h.stockInStatus === 'Finalized');
      
      // Optional: scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error(error);
    }
  };

  const autoSaveDraft = async (itemObj, itemsList, specificIndex, onComplete) => {
    // Only save if header is complete
    if (!vendorId || !invoiceNo || !invoiceDate) {
      if (onComplete) onComplete();
      return;
    }

    try {
      const payload = {
        StockInId: stockInId,
        StockInDetailId: itemObj.stockInDetailId || null,
        VendorId: vendorId,
        InvoiceNo: invoiceNo,
        InvoiceDate: invoiceDate,
        Remarks: "",
        InvoiceFile: invoiceFile || "",
        ItemVariantId: itemObj.itemVariantId,
        modelGuid: itemObj.modelGuid || null,
        godownGuid: itemObj.godownGuid || null,
        UnitId: itemObj.unitId,
        VariantPackBarcodeId: itemObj.variantPackBarcodeId || null,
        Barcode: itemObj.barcode,
        StockInQty: itemObj.qty,
        DefaultPcsQty: itemObj.pcs,
        FinalPcsQty: itemObj.qty * itemObj.pcs,
        PurchaseRate: Number(itemObj.rate)
      };

      const result = await inventoryService.saveDraft(payload);

      if (result?.data?.data?.stockInDetailId) {
        // Update the detail ID in state using a functional update
        setStockItems(prev => {
          const newItems = [...prev];
          if (newItems[specificIndex] && newItems[specificIndex].barcode === itemObj.barcode) {
             newItems[specificIndex].stockInDetailId = result.data.data.stockInDetailId;
          }
          return newItems;
        });
      }
      
      if (onComplete) onComplete(result?.data?.data?.stockInDetailId || itemObj.stockInDetailId);

    } catch (e) {
      console.error("Autosave draft failed", e);
    }
  };

  const handleDeleteDraft = (id) => {
    Swal.fire({
      title: "Delete Draft Stock In?",
      text: "This will permanently delete the draft invoice.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete"
    }).then(async (r) => {
      if (r.isConfirmed) {
        try {
          await inventoryService.deleteDraftStockIn(id);
          Swal.fire("Deleted", "Draft deleted", "success");
          fetchHistory(activeFilter);
          fetchCounts();
        } catch (e) {
          Swal.fire("Error", "Failed to delete", "error");
        }
      }
    });
  };

  // ----------------------------------------------------
  // BARCODE & LINE ITEMS
  // ----------------------------------------------------

  const handleBarcodeEnterPress = async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      
      if (!vendorId || !invoiceNo || !invoiceDate) {
        Swal.fire("Header Required", "Please select Vendor, Invoice No and Date before scanning", "warning");
        setBarcodeInput("");
        return;
      }
      
      const code = barcodeInput.trim();
      if (!code) return;

      try {
        const data = await inventoryService.resolveBarcodeForStockIn(code, stockInId);

        if (!data || (Array.isArray(data) && data.length === 0)) {
          Swal.fire("Barcode Not Found", "No data found for this barcode. Map item/variant first.", "error");
          setBarcodeInput("");
          return;
        }

        if (Array.isArray(data) && data.length > 1) {
          setBarcodeVariants(data);
          setCurrentScannedBarcode(code);
          setShowVariantModal(true);
        } else {
          const variantData = Array.isArray(data) ? data[0] : data;
          processVariantSelection(variantData, code);
        }

        setBarcodeInput("");

      } catch (error) {
         console.error("Barcode lookup failed", error);
         const msg = error.response?.data?.message || error.message || "Server connection error";
         Swal.fire("Error", `Barcode lookup failed: ${msg}`, "error");
         setBarcodeInput("");
      }
    }
  };

  // Printer model barcode — skip unit selection, add directly with modelGuid
  const processModelItem = (data) => {
    if (!vendorId || !invoiceNo || !invoiceDate) {
      Swal.fire("Header Required", "Please fill Vendor, Invoice No and Date first", "warning");
      return;
    }
    setStockItems(prev => {
      const updatedList = [...prev];
      const existIndex = updatedList.findIndex(x => x.modelGuid === data.modelGuid);

      if (existIndex >= 0) {
        const updated = { ...updatedList[existIndex], qty: updatedList[existIndex].qty + 1 };
        updated.amount = updated.qty * updated.rate;
        updatedList[existIndex] = updated;
        setTimeout(() => autoSaveDraft(updated, updatedList, existIndex), 0);
      } else {
        const newItem = {
          stockInDetailId: null,
          itemVariantId: null,
          modelGuid: data.modelGuid,
          godownGuid: null,
          unitId: null,
          variantPackBarcodeId: null,
          barcode: null,
          itemName: data.itemName,
          variantCode: data.itemName,
          unitName: "",
          qty: 1,
          pcs: 1,
          rate: Number(data.lastPurchaseRate || 0),
          amount: Number(data.lastPurchaseRate || 0),
          hasSerialNumber: !!data.hasSerialNumber,
          serialCount: 0,
          tags: "Printer Model"
        };
        updatedList.push(newItem);
        const addedIndex = updatedList.length - 1;
        setTimeout(() => autoSaveDraft(newItem, updatedList, addedIndex), 0);
      }
      return updatedList;
    });
  };

  const processVariantSelection = (data, code) => {
        setShowVariantModal(false);
        // Printer model barcode — skip unit modal
        if (data.isModelItem && data.modelGuid) {
          processModelItem(data);
          return;
        }
        setPendingVariantData({ data, code });
        setShowUnitModal(true);
  };

  const processUnitSelection = (selectedUnit) => {
        setShowUnitModal(false);
        if (!pendingVariantData) return;
        const { data, code } = pendingVariantData;
        
        setStockItems(prev => {
          let updatedList = [...prev];
          // Check if item exists with same barcode, variant AND unit
          const existIndex = updatedList.findIndex(x => x.barcode === code && x.itemVariantId === data.itemVariantId && x.unitId === selectedUnit.unitId);

          if (existIndex >= 0) {
            // Update exist
            updatedList[existIndex] = {
              ...updatedList[existIndex],
              qty: updatedList[existIndex].qty + 1
            };
            updatedList[existIndex].amount = updatedList[existIndex].qty * updatedList[existIndex].rate;
            
            setTimeout(() => {
                autoSaveDraft(updatedList[existIndex], updatedList, existIndex, () => {
                    if (updatedList[existIndex].hasSerialNumber && updatedList[existIndex].qty > updatedList[existIndex].serialCount) {
                        openSerialPopup(existIndex, updatedList[existIndex], updatedList);
                    }
                });
            }, 0);
          } else {
            // Add new
            const newItem = {
               stockInDetailId: data.stockInDetailId || null,
               itemVariantId: data.itemVariantId,
               unitId: selectedUnit.unitId,
               variantPackBarcodeId: data.variantPackBarcodeId,
               barcode: code,
               itemName: data.itemName,
               variantCode: data.variantCode,
               unitName: selectedUnit.unitName,
               qty: 1,
               pcs: Number(selectedUnit.baseUnitQty) || 1,
               rate: Number(data.lastPurchaseRate || 0),
               amount: Number(data.lastPurchaseRate || 0),
               hasSerialNumber: !!data.hasSerialNumber,
               serialCount: 0
            };
            updatedList.push(newItem);
            
            setTimeout(() => {
                const addedIndex = updatedList.length - 1;
                autoSaveDraft(newItem, updatedList, addedIndex, () => {
                    // auto popup disabled, user will click when ready
                });
            }, 0);
          }
          return updatedList;
        });
        setPendingVariantData(null);
  };

  const updateItemQty = (index, value) => {
    let newQty = Number(value);
    if (!Number.isInteger(newQty) || newQty <= 0) return;

    setStockItems(prev => {
      let list = [...prev];
      let item = list[index];

      // Block logic — once serial numbers are entered against the current
      // quantity, the quantity is locked (both up and down) until those
      // serials are deleted, so the qty always matches the serial count.
      if (item.hasSerialNumber && item.serialCount > 0 && newQty !== item.qty) {
        Swal.fire("Not Allowed", "Serial numbers already exist for this quantity. Delete serials first to change quantity.", "warning");
        return list; // Break early, no change
      }

      item.qty = newQty;
      item.amount = item.qty * item.rate;

      autoSaveDraft(item, list, index);

      return list;
    });
  };

  const updateItemRate = (index, value) => {
    let newRate = parseFloat(value);
    if (isNaN(newRate) || newRate < 0) newRate = 0;

    setStockItems(prev => {
       let list = [...prev];
       let item = list[index];
       item.rate = newRate;
       item.amount = item.qty * item.rate;
       
       autoSaveDraft(item, list, index);
       return list;
    });
  };

  const removeRow = (index) => {
    const item = stockItems[index];

    if (!item.stockInDetailId) {
      setStockItems(prev => prev.filter((_, i) => i !== index));
      return;
    }

    Swal.fire({
      title: "Remove item?",
      text: "This will permanently remove the item from draft",
      icon: "warning",
      showCancelButton: true
    }).then(async (r) => {
       if (r.isConfirmed) {
         try {
           await inventoryService.deleteStockInDetail(item.stockInDetailId);
           setStockItems(prev => prev.filter((_, i) => i !== index));
         } catch (e) {
           Swal.fire("Error", "Failed to remove item", "error");
         }
       }
    });
  };

  const totals = stockItems.reduce((acc, obj) => {
    acc.qty += obj.qty;
    acc.amount += obj.amount;
    return acc;
  }, { qty: 0, amount: 0 });

  // ----------------------------------------------------
  // SERIAL NUMBERS
  // ----------------------------------------------------
  const _hydrateSerialCount = async (itemObj, index, list) => {
    if (!itemObj.hasSerialNumber || !itemObj.stockInDetailId) return;

    try {
      const data = await inventoryService.getSerialNumbers(itemObj.stockInDetailId);
      
      const count = data?.length || 0;
      
      setStockItems(prev => {
         const newList = [...prev];
         if (newList[index]) {
            newList[index].serialCount = count;
            
            // Absolute min
            if (newList[index].qty < count) {
                newList[index].qty = count;
                newList[index].amount = newList[index].qty * newList[index].rate;
            }
         }
         return newList;
      });

    } catch (e) {
      console.error(e);
    }
  };

  const openSerialPopup = (index, targetItem = null, stateList = stockItems) => {
    const i = typeof index === 'number' ? index : serialPopupIndex;
    if (i < 0) return;
    
    // We optionally take the item from direct args or from state
    const item = targetItem || stateList[i];

    if (!item.qty || item.qty <= 0) {
       Swal.fire("Quantity Required", "Please enter quantity first before adding serial numbers", "warning");
       return;
    }

    setSerialPopupIndex(i);

    if (!item.stockInDetailId) {
       // Autosave draft if detail id doesn't exist yet, passing openSerialPopup as callback with newly received detailId
       autoSaveDraft(item, stateList, i, (newDetailId) => {
          // fetch serials will happen inside openSerialPopup when recalled
          const hydratedItem = { ...item, stockInDetailId: newDetailId };
          openSerialPopup(i, hydratedItem, stateList); 
       });
       return;
    }

    inventoryService.getSerialNumbers(item.stockInDetailId).then(data => {
       const serials = data || [];
       
       // Construct array based on current qty needed
       const inputs = [];
       for (let qtyI = 0; qtyI < item.qty; qtyI++) {
          inputs.push({
             serialValue: serials[qtyI]?.serialNumber || '',
             serialId: serials[qtyI]?.serialId || ''
          });
       }
       setSerialNumbersToSave(inputs);
       setShowSerialModal(true);
    });
  };

  const handleSerialInputChange = (localIndex, value) => {
     const newList = [...serialNumbersToSave];
     newList[localIndex].serialValue = value;
     
     const valueMap = {};
     newList.forEach((item, idx) => {
         item.isDuplicate = false; 
         const val = item.serialValue.trim();
         if (val) {
             if (valueMap[val] !== undefined) {
                 item.isDuplicate = true;
                 newList[valueMap[val]].isDuplicate = true; 
             } else {
                 valueMap[val] = idx;
             }
         }
     });

     setSerialNumbersToSave(newList);
  };

  const handleDeleteSerial = async (serialId, localIndex) => {
     if(serialId) {
       try {
         await inventoryService.deleteSerialNumber(serialId);
       } catch(e) {
           console.error(e);
       }
     }
     
     const newList = [...serialNumbersToSave];
     newList.splice(localIndex, 1);
     setSerialNumbersToSave(newList);
     
     setStockItems(prev => {
        const up = [...prev];
        up[serialPopupIndex].qty = newList.length;
        up[serialPopupIndex].amount = up[serialPopupIndex].qty * up[serialPopupIndex].rate;
        
        autoSaveDraft(up[serialPopupIndex], up, serialPopupIndex);
        return up;
     });
  };

  const handleSerialInputKeyDown = (e, localIndex) => {
     if (e.key === "Enter") {
        e.preventDefault();
        const nextInput = document.getElementById(`serial-input-${localIndex + 1}`);
        if (nextInput) {
           nextInput.focus();
        } else {
           saveSerialNumbersClick();
        }
     }
  };

  const saveSerialNumbersClick = async () => {
    const hasDuplicates = serialNumbersToSave.some(x => x.isDuplicate);
    if (hasDuplicates) {
        Swal.fire("Duplicates Found", "Please remove duplicate serial numbers from the list before saving.", "error");
        return;
    }

    const validSerials = serialNumbersToSave.map(x => x.serialValue.trim()).filter(x => x);
    const newSerialsToSave = serialNumbersToSave.filter(x => !x.serialId && x.serialValue.trim()).map(x => x.serialValue.trim());

    // Always read current item from live state (avoids stale closure)
    const currentItem = stockItems[serialPopupIndex];
    if (!currentItem) return;

    if (validSerials.length !== currentItem.qty) {
       Swal.fire("Mismatch", `Exactly ${currentItem.qty} serial number(s) required`, "error");
       return;
    }

    // Immutable serialCount update helper
    const updateSerialCount = (count) => {
      setStockItems(prev => {
        const updated = [...prev];
        if (updated[serialPopupIndex]) {
          updated[serialPopupIndex] = { ...updated[serialPopupIndex], serialCount: count };
        }
        return updated;
      });
    };

    // All already saved — just sync count and close
    if (newSerialsToSave.length === 0) {
        updateSerialCount(validSerials.length);
        setShowSerialModal(false);
        return;
    }

    try {
      const res = await inventoryService.saveStockInSerials({
        stockInDetailId: currentItem.stockInDetailId,
        itemVariantId: currentItem.itemVariantId,
        serialNumbers: newSerialsToSave
      });

      const msg = res?.message?.toLowerCase() || "";
      if (msg.includes("saved") || msg.includes("success")) {
         updateSerialCount(validSerials.length);
         setShowSerialModal(false);
      } else {
         Swal.fire("Error", res?.message || "Failed to save serials", "error");
      }
    } catch (e) {
       console.error("serials failed", e);
       Swal.fire("Error", e.response?.data?.message || "Failed to save serials", "error");
    }
  };

  // ----------------------------------------------------
  // FINALIZE
  // ----------------------------------------------------
  const finalizeStockIn = () => {
     if (!vendorId || !invoiceNo || !invoiceDate || stockItems.length === 0) {
        Swal.fire("Required", "Vendor, Invoice No, Invoice Date and at least one item are required", "warning");
        return;
     }

     const invalidSerial = stockItems.find(x => x.hasSerialNumber && x.qty !== x.serialCount);
     if (invalidSerial) {
        Swal.fire("Mismatch", "Qty and serial numbers must be equal for all serial-tracked items", "error");
        return;
     }

     Swal.fire({
       title: "Finalize Stock In?",
       text: "Once finalized, this invoice cannot be edited.",
       icon: "warning",
       showCancelButton: true,
       confirmButtonText: "Yes, Finalize"
     }).then(async (r) => {
       if (r.isConfirmed) {
         try {
            const res = await inventoryService.finalizeStockIn(stockInId);

            if (res?.data?.message?.toLowerCase().includes("success")) {
               Swal.fire("Success", "Finalized successfully", "success").then(() => {
                  resetForm();
                  fetchCounts();
                  fetchHistory(activeFilter);
                  if (onRefresh) onRefresh(); // Refresh serials/models in parent so Serial tab updates immediately
               });
            } else {
               Swal.fire("Error", res?.data?.message || "Failed to finalize", "error");
            }
         } catch(e) {
           console.error(e);
           Swal.fire("Error", "Something went wrong finalize", "error");
         }
       }
     });
  };

  const handleRevertStockIn = async () => {
    Swal.fire({
      title: "Revert Stock-In?",
      text: "This will remove the items from live inventory and unlock this invoice for editing.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Revert",
      confirmButtonColor: "#ef4444"
    }).then(async (r) => {
      if (r.isConfirmed) {
        try {
          await inventoryService.revertStockIn(stockInId);
          Swal.fire("Reverted!", "Invoice is now in draft mode and editable.", "success");
          fetchHistory(activeFilter);
          fetchCounts();
          loadSpecificDraft(stockInId); // Reload to unlock
        } catch (e) {
          Swal.fire("Error", e.response?.data?.message || "Failed to revert. Some serials might be already sold.", "error");
        }
      }
    });
  };

  // ----------------------------------------------------
  // ADD VENDOR POPUP
  // ----------------------------------------------------
  const handleSaveVendorPopup = async () => {
    let name = newVendorFirmName.trim();
    if (!name) {
      Swal.fire("Required", "Vendor name required", "warning");
      return;
    }
    try {
      const res = await inventoryService.saveVendor({ VendorFirmName: name });
      if (res?.message === "Success") {
         Swal.fire("Success", "Vendor Added", "success");
         setShowAddVendor(false);
         setNewVendorFirmName("");
         
         // Pass vendorId to auto-select
         fetchVendors(res.vendorId);
      }
    } catch(e) {
      Swal.fire("Error", "Could not save vendor", "error");
    }
  };

  const handleInvoiceUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("invoice", file);

    setParsingInvoice(true);
    try {
      const res = await inventoryService.parseInvoice(formData);

      if (res?.message === "Success") {
        const { invoiceNo, invoiceDate, vendorId, items } = res.data;
        
        if (invoiceNo) setInvoiceNo(invoiceNo);
        if (invoiceDate) {
           // Try to normalize to YYYY-MM-DD
           try {
             const d = new Date(invoiceDate);
             if (!isNaN(d.getTime())) setInvoiceDate(d.toISOString().split('T')[0]);
            } catch (err) { /* ignore */ }
        }
        if (vendorId) setVendorId(vendorId);

        if (items && items.length > 0) {
           // Confirm before overwriting/appending
           Swal.fire({
             title: "Invoice Parsed",
             text: `Found ${items.length} matching items. Add to current list?`,
             icon: "info",
             showCancelButton: true,
             confirmButtonText: "Yes, Add Items"
           }).then((r) => {
             if (r.isConfirmed) {
                const newItems = items.map(item => ({
                   stockInDetailId: null,
                   itemVariantId: item.itemVariantId,
                   unitId: item.unitId,
                   variantPackBarcodeId: item.variantPackBarcodeId,
                   barcode: item.barcode || "",
                   itemName: item.itemName,
                   variantCode: item.variantCode,
                   unitName: item.unitName,
                   qty: item.qty || 1,
                   pcs: item.defaultPcsQty || 1,
                   rate: item.rate || 0,
                   amount: (item.qty || 1) * (item.rate || 0),
                   hasSerialNumber: false, // Stock In always books as Current Stock (quantity) now — no serial tracking here
                   serialCount: 0
                }));
                
                setStockItems(prev => [...prev, ...newItems]);
                // Trigger autosave for each new item
                newItems.forEach((it, idx) => {
                   setTimeout(() => autoSaveDraft(it, [...stockItems, ...newItems], stockItems.length + idx), 100 * idx);
                });
             }
           });
        } else {
           Swal.fire("Success", "Invoice headers parsed, but no matching items were found.", "success");
        }
      }
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.response?.data?.message || "Failed to parse invoice", "error");
    } finally {
      setParsingInvoice(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };


  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-screen">
      <div className="flex items-center gap-4 border-b border-slate-100 pb-6 mb-8">
        <div className="p-3 bg-indigo-50 rounded-xl">
          <PackagePlus size={28} className="text-indigo-600" />
        </div>
        <div>
           <h2 className="text-2xl font-black text-slate-800 tracking-tight">Stock In</h2>
           <p className="text-sm text-slate-500 mt-1 font-medium text-slate-500">Scan items referencing vendor invoices</p>
        </div>
      </div>

      {/* HEADER SECTION */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
           <FileText size={16} className="text-slate-500"/> Invoice Details 
           <button 
             onClick={() => fileInputRef.current?.click()}
             disabled={parsingInvoice || isFinalized}
             className="ml-4 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
           >
             {parsingInvoice ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
             {parsingInvoice ? "Parsing..." : "Auto-Fill from Invoice (Excel/PDF)"}
           </button>
           <input 
             type="file" 
             ref={fileInputRef} 
             className="hidden" 
             accept=".xlsx,.xls,.pdf" 
             onChange={handleInvoiceUpload} 
           />
           <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded ml-auto text-[10px] tracking-normal">Draft UUID: {stockInId.split("-")[0]}...</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between items-center">
              Vendor *
              {!isFinalized && (
                <button 
                   onClick={() => setShowAddVendor(true)} 
                   className="text-indigo-600 hover:text-indigo-800 normal-case text-xs underline"
                >
                  + Add Vendor
                </button>
              )}
            </label>
            <select
              value={vendorId}
              disabled={isFinalized}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value="">Select Vendor</option>
              {vendors.map(v => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.status === false ? `${v.vendorFirmName} (Inactive)` : v.vendorFirmName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Invoice No *</label>
            <input
              type="text"
              value={invoiceNo}
              disabled={isFinalized}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium font-mono focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm disabled:bg-slate-100"
              placeholder="e.g. INV-1001"
            />
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Invoice Date *</label>
             <input 
               type="date"
               value={invoiceDate}
               disabled={isFinalized}
               onChange={(e) => setInvoiceDate(e.target.value)}
               className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm disabled:bg-slate-100"
             />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Attach Invoice File</label>
            <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={invoiceFile || ""}
                  placeholder="No file attached"
                  className="flex-1 bg-slate-100 border border-slate-300 rounded-xl px-4 py-3 text-slate-500 text-xs truncate outline-none"
                />
                {invoiceFile && (
                  <button
                    onClick={() => {
                      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
                      setPreviewFileUrl(`${baseUrl}/uploads/${invoiceFile}`);
                      setShowInvoicePreview(true);
                    }}
                    className="bg-indigo-50 text-indigo-600 p-3 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm"
                    title="View Invoice"
                  >
                    <FileText size={18} />
                  </button>
                )}
                <button
                  onClick={() => {
                    const el = document.createElement("input");
                    el.type = "file";
                    el.accept = ".pdf,image/*";
                    el.onchange = async (e) => {
                       const file = e.target.files[0];
                       if(!file) return;
                       setUploadingFile(true);
                       const formData = new FormData();
                       formData.append("file", file);
                       try {
                         const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
                         const res = await axios.post(`${apiBase}/Inventory/UploadInvoice`, formData, { headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` } });
                         setInvoiceFile(res.data.filePath);
                         Swal.fire("Success", "Invoice attached successfully", "success");
                         // Trigger an autosave if we have enough header info
                         if(stockItems.length > 0) autoSaveDraft(stockItems[0], stockItems, 0);
                       } catch(err) {
                         Swal.fire("Error", "File upload failed", "error");
                       } finally {
                         setUploadingFile(false);
                       }
                    }
                    el.click();
                  }}
                  className="bg-slate-800 text-white px-4 rounded-xl hover:bg-slate-700 transition-all shadow-sm"
                >
                  {uploadingFile ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                </button>
              
            </div>
          </div>
        </div>
      </div>

      {/* BARCODE SCANNER */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 mb-8">
         <label className="block text-xs font-bold text-indigo-700 uppercase mb-2 flex items-center gap-2">
           <Search size={14} /> Barcode Scan — Scan the item and press Enter (Alt+B)
         </label>
         <div className="relative">
            <Search size={20} className="absolute left-4 top-3.5 text-indigo-300" />
            <input
              id="barcode-scanner"
              value={barcodeInput}
              disabled={isFinalized}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeEnterPress}
              className="w-full bg-white border-2 border-indigo-200 rounded-xl pl-12 pr-4 py-3 text-indigo-900 font-mono font-bold text-lg focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all shadow-sm placeholder:text-indigo-200 placeholder:font-sans placeholder:font-medium placeholder:text-base disabled:bg-slate-100 disabled:border-slate-200 disabled:placeholder:text-slate-300"
              placeholder={isFinalized ? "Locked — Finalized Record" : "Scan barcode and press Enter…"}
            />
         </div>
      </div>

      {/* ITEMS DATA GRID */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3 px-4 text-xs font-bold text-slate-500 tracking-wider">Barcode</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 tracking-wider">Item</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 tracking-wider">Variant</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 tracking-wider">Unit</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 tracking-wider text-center w-24">Qty</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 tracking-wider text-center w-20">PCS</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 tracking-wider text-center w-28">Rate</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 tracking-wider text-right w-32">Amount</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 tracking-wider text-center w-[180px]">Action</th>
               </tr>
            </thead>
            <tbody>
              {stockItems.length > 0 ? (
                stockItems.map((item, index) => {
                  return (
                    <tr 
                      key={index} 
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-800 tracking-tight leading-tight flex items-center gap-2">
                              {item.itemName} 
                              <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{item.variantCode}</span>
                              {item.hasSerialNumber && (
                                 <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">SERIALIZED</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-800">{item.itemName}</td>
                      <td className="py-3 px-4 text-sm font-bold text-indigo-700"><span className="bg-indigo-50 px-2 py-0.5 rounded">{item.variantCode}</span></td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-600">{item.unitName}</td>
                      
                      <td className="py-2 px-2 text-center">
                         {isFinalized ? (
                            <span className="text-sm font-bold text-slate-800">{item.qty}</span>
                         ) : item.hasSerialNumber && item.serialCount > 0 ? (
                            <span
                              className="inline-flex items-center justify-center gap-1 text-sm font-bold text-slate-500 cursor-not-allowed"
                              title="Serial numbers already entered — delete them first to change quantity"
                            >
                              {item.qty} <Lock size={12} />
                            </span>
                         ) : (
                            <input
                              type="number"
                              min="1"
                              className="w-full text-center border border-slate-200 rounded-lg py-1.5 focus:border-indigo-400 outline-none text-slate-800 font-bold"
                              value={item.qty || 0}
                              onChange={(e) => updateItemQty(index, e.target.value)}
                            />
                         )}
                      </td>
                      
                      <td className="py-3 px-4 text-center text-sm font-bold text-slate-500">{item.pcs || 1}</td>
                      
                      <td className="py-2 px-2 text-center">
                         {isFinalized ? (
                            <span className="text-sm font-bold text-slate-800 font-mono">{item.rate}</span>
                         ) : (
                            <input 
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full text-center border border-slate-200 rounded-lg py-1.5 focus:border-indigo-400 outline-none text-slate-800 font-bold font-mono"
                              value={item.rate || 0}
                              onChange={(e) => updateItemRate(index, e.target.value)}
                            />
                         )}
                      </td>
                      
                      <td className="py-3 px-4 text-right text-sm font-black text-rose-600 font-mono">
                        {(Number(item.amount) || 0).toFixed(2)}
                      </td>
                      
                      <td className="py-2 px-4 text-center">
                         <div className="flex items-center justify-center gap-1.5">
                            {item.hasSerialNumber && (
                               <button
                                 onClick={() => openSerialPopup(index)}
                                 className="bg-amber-100 hover:bg-amber-200 text-amber-700 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors truncate max-w-[100px]"
                               >
                                 {isFinalized ? "View Serials" : `Serials (${item.serialCount})`}
                               </button>
                            )}
                            {!isFinalized && (
                               <button
                                 onClick={() => removeRow(index)}
                                 className="bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                               >
                                 Remove
                               </button>
                            )}
                         </div>
                      </td>

                    </tr>
                  );
                })
              ) : (
                <tr>
                   <td colSpan="9" className="py-12 px-6 text-center text-slate-400 font-medium bg-slate-50">
                      Grid is empty. Scan an item above to add to draft.
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center mb-10 bg-slate-800 rounded-2xl p-6 text-white shadow-lg">
         <div className="flex gap-10">
            <div>
               <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Quantity</div>
               <div className="text-2xl font-black">{totals.qty}</div>
            </div>
            <div>
               <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Amount</div>
               <div className="text-2xl font-black font-mono tracking-tight text-emerald-400">
                 ₹ {totals.amount.toFixed(2)}
               </div>
            </div>
         </div>

         <div className="mt-4 md:mt-0 flex gap-3">
            {isFinalized ? (
               <>
                 <button
                    onClick={handleRevertStockIn}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-4 rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg text-lg"
                 >
                    <Edit size={24} /> Edit (Revert)
                 </button>
                 <button
                    onClick={resetForm}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-black flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 text-lg"
                 >
                    <PackagePlus size={24} /> New Inward
                 </button>
               </>
            ) : (
               <button
                  onClick={finalizeStockIn}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-xl font-black flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg disabled:opacity-50 hover:-translate-y-0.5 text-lg"
                  disabled={stockItems.length === 0}
               >
                  <CheckCircle2 size={24} /> Finalize Stock In
               </button>
            )}
         </div>
      </div>

      <hr className="border-slate-200 mb-8" />

      {/* FILTERS & HISTORY TABLE */}
      <div>
         <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex gap-3 bg-slate-100 p-1 rounded-xl">
               <button 
                 onClick={() => handleFilterChange(0)}
                 className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                   activeFilter === 0 ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
                 }`}
               >
                 Drafts ({draftCount})
               </button>
               <button 
                 onClick={() => handleFilterChange(1)}
                 className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                   activeFilter === 1 ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
                 }`}
               >
                 Finalized ({finalCount})
               </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
               <button
                  onClick={handleExportToday}
                  disabled={exporting}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-slate-200 disabled:opacity-50"
               >
                  <FileDown size={14} /> Today
               </button>
               <button
                  onClick={handleExportYesterday}
                  disabled={exporting}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all border border-slate-200 disabled:opacity-50"
               >
                  <FileDown size={14} /> Yesterday
               </button>

               <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>

               <DayFilterSelect
                  value={dayFilter}
                  onChange={handleDayFilterChange}
                  customStart={startDate}
                  onCustomStartChange={setStartDate}
                  customEnd={endDate}
                  onCustomEndChange={setEndDate}
               />

               <button
                  onClick={() => setShowDateFilter(!showDateFilter)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border ${
                    showDateFilter 
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
                      onClick={applyCustomFilter}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-indigo-100"
                    >
                      Apply
                    </button>
                    <button 
                      onClick={handleExportExcel}
                      disabled={exporting}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all border border-slate-200 disabled:opacity-50"
                    >
                      {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                      Download
                    </button>
                 </div>
               )}

               <button onClick={() => fetchHistory(activeFilter)} className="text-slate-500 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-lg">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
               </button>
            </div>
         </div>

         <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                  <thead>
                     <tr className="bg-slate-50 border-b border-slate-200">
                        
                        <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice No</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Items</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total Qty</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Total Amount</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-[160px]">Action</th>
                     </tr>
                  </thead>
                  <tbody>
                     {historyItems.map((h, index) => {
                       return (
                         <tr 
                           key={h.stockInId || index} 
                           className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                         >
                          
                          <td className="py-4 px-6 text-sm font-bold text-slate-700">
                            <div className="flex items-center gap-3">
                               <div className="flex flex-col">
                                 <span className="bg-slate-100 rounded px-2 py-1 border border-slate-200">{h.invoiceNo}</span>
                               </div>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-sm font-medium text-slate-600">{h.invoiceDate.split("T")[0]}</td>
                          <td className="py-4 px-6 text-sm font-bold text-indigo-700">{h.vendorFirmName || h.vendorName || "-"}</td>
                          <td className="py-4 px-6 text-sm font-medium text-slate-700">
                            {h.itemTypeCount > 1 ? (
                              <span className="text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md text-xs font-bold border border-indigo-100">Multiple Items</span>
                            ) : (
                              <span className="truncate max-w-[200px] inline-block font-bold text-slate-700" title={h.itemNames || 'N/A'}>
                                {h.itemNames || 'N/A'}
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-sm font-black text-slate-700 text-center">{Number(h.totalQty || 0)}</td>
                          <td className="py-4 px-6 text-sm font-mono font-bold text-emerald-600 text-right">₹ {Number(h.totalAmount || 0).toFixed(2)}</td>
                          <td className="py-4 px-6 text-center text-sm font-bold">
                            {h.status === 0 ? (
                               <span className="text-amber-600">Draft</span>
                            ) : (
                               <span className="text-emerald-600">Finalized</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-center">
                             <div className="flex gap-2 justify-center">
                               {h.invoiceFile && (
                                 <button 
                                   onClick={() => {
                                     const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
                                     setPreviewFileUrl(`${baseUrl}/uploads/${h.invoiceFile}`);
                                     setShowInvoicePreview(true);
                                   }} 
                                   className="bg-sky-50 text-sky-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-sky-100 transition-colors flex items-center gap-1.5"
                                   title="Preview Invoice File"
                                 >
                                   <FileText size={13} /> File
                                 </button>
                               )}
                               {h.status === 0 ? (
                                 <>
                                    <button onClick={() => loadSpecificDraft(h.stockInId)} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors" title="Edit Draft">Edit</button>
                                    <button onClick={() => handleDeleteDraft(h.stockInId)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors" title="Delete Draft">Del</button>
                                 </>
                               ) : (
                                  <button onClick={() => loadSpecificDraft(h.stockInId)} className="bg-emerald-50 text-emerald-700 px-4 py-1.5 rounded-lg text-xs font-black hover:bg-emerald-100 transition-all border border-emerald-100 flex items-center gap-2">
                                    <CheckCircle2 size={14} /> View Details
                                  </button>
                               )}
                             </div>
                          </td>
                       </tr>
                      );
                    })}
                     {historyItems.length === 0 && (
                        <tr><td colSpan="8" className="py-8 text-center text-slate-500 font-medium">No records found</td></tr>
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
                  
                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, Math.ceil(totalRecords / pageSize)) }, (_, i) => {
                       const pageNum = i + 1; // Simplified for now
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
      </div>

      {/* MODAL: ADD VENDOR */}
      {showAddVendor && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in fade-in zoom-in-95 duration-200">
               <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                 <Store className="text-indigo-600" /> Quick Add Vendor
               </h3>
               <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Firm Name *</label>
               <input 
                 autoFocus
                 type="text"
                 className="w-full border border-slate-300 focus:border-indigo-500 rounded-xl px-4 py-3 outline-none text-slate-800 font-medium shadow-sm mb-6"
                 value={newVendorFirmName}
                 onChange={(e) => setNewVendorFirmName(e.target.value)}
                 onKeyDown={(e) => { if(e.key === "Enter") handleSaveVendorPopup(); }}
               />
               <div className="flex justify-end gap-3">
                  <button onClick={() => setShowAddVendor(false)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                  <button onClick={handleSaveVendorPopup} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md shadow-indigo-200">Save Vendor</button>
               </div>
            </div>
         </div>
      )}

      <StockInModals
        {...{
          autoSaveDraft, barcodeVariants, currentScannedBarcode, godowns,
          handleDeleteSerial, handleSerialInputChange, handleSerialInputKeyDown,
          isFinalized, previewFileUrl, processUnitSelection, processVariantSelection,
          saveSerialNumbersClick, serialNumbersToSave, serialPopupIndex,
          setPendingVariantData, setShowInvoicePreview, setShowSerialModal,
          setShowUnitModal, setShowVariantModal, setStockItems, showInvoicePreview,
          showSerialModal, showUnitModal, showVariantModal, stockItems, units,
        }}
      />

    </div>
  );
};

export default StockIn;


