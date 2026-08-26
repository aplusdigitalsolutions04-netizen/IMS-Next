"use client";
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { PackageSearch, Search, Layers, TrendingUp, AlertTriangle, FileDown, Loader2, Hash, X, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { useToast } from '@/lib/client/ToastContext';

const CurrentStock = () => {
  const toast = useToast();
  const [stockData, setStockData] = useState([]);
  const [brands, setBrands] = useState([]);
  const [activeBrandId, setActiveBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [globalValue, setGlobalValue] = useState(0);
  const [globalLowStock, setGlobalLowStock] = useState(0);
  // Guards against a slower, older request overwriting a faster, newer one
  // when the user types/filters quickly — fetchCurrentStock only applies a
  // response if it's still the most recently *issued* request.
  const latestRequestId = useRef(0);

  // Click a serialized variant to open a popup with its serial numbers
  const [serialModalVariant, setSerialModalVariant] = useState(null); // { itemVariantId, variantName }
  const [serialModalRows, setSerialModalRows] = useState([]);
  const [loadingSerialModal, setLoadingSerialModal] = useState(false);

  const openVariantSerials = async (item) => {
    if (!item.isTrackable) return;
    setSerialModalVariant(item);
    setSerialModalRows([]);
    setLoadingSerialModal(true);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || ""}/Inventory/GetVariantSerials`, {
        params: { itemVariantId: item.itemVariantId },
        headers: { Authorization: `Bearer ${sessionStorage.getItem("pt_auth_token")}` },
      });
      setSerialModalRows((response.data?.data || []).filter((s) => s.status === "Available"));
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
  };

  const [deletingSerialGuid, setDeletingSerialGuid] = useState("");

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
          `${process.env.NEXT_PUBLIC_API_URL || ""}/Inventory/DeleteVariantSerial`,
          { serialGuid: serial.guid },
          { headers: { Authorization: `Bearer ${sessionStorage.getItem("pt_auth_token")}` } }
        );
        await openVariantSerials(serialModalVariant);
        fetchCurrentStock(currentPage, pageSize);
      } catch (error) {
        toast.error(error.response?.data?.message || "Failed to delete serial");
      } finally {
        setDeletingSerialGuid("");
      }
    });
  };

  useEffect(() => {
    fetchBrands();
  }, []);

  useEffect(() => {
    fetchCurrentStock(currentPage, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, activeBrandId, searchTerm]);

  // Uses the Brand *dropdown* endpoint, not GetBrandList — this is just a
  // filter for Current Stock, not the Brand Master screen, so it shouldn't
  // require "Brand Master" permission the way GetBrandList does.
  const fetchBrands = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || ""}/Inventory/GetBrandDropdown`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("pt_auth_token")}` },
      });
      const rows = response.data?.data || [];
      setBrands(rows.map((r) => ({ brandId: r.Value, brandName: r.Text })));
    } catch (error) {
      console.error("Error fetching brands:", error);
    }
  };

  const fetchCurrentStock = async (page = currentPage, limit = pageSize) => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || ""}/Inventory/GetCurrentStock`, {
        params: {
          page,
          limit,
          brandId: activeBrandId,
          search: searchTerm
        },
        headers: { Authorization: `Bearer ${sessionStorage.getItem("pt_auth_token")}` }
      });
      if (requestId !== latestRequestId.current) return; // a newer request has since been issued — drop this stale response
      setStockData(response.data?.data || []);
      setTotalRecords(response.data?.total || 0);
      setGlobalValue(response.data?.totalValue || 0);
      setGlobalLowStock(response.data?.lowStockCount || 0);
    } catch (error) {
      if (requestId !== latestRequestId.current) return;
      console.error("Error fetching stock:", error);
      toast.error("Failed to load current stock");
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  };

  const [exportingExcel, setExportingExcel] = useState(false);

  // Row-per-serial export (not the paginated summary `stockData`) — pulled
  // from ExportCurrentStock so trackable items show their actual serial
  // number per row and non-trackable items show a blank Serial No. instead
  // of nothing to show for at all.
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || ""}/Inventory/ExportCurrentStock`, {
        params: { brandId: activeBrandId, search: searchTerm },
        headers: { Authorization: `Bearer ${sessionStorage.getItem("pt_auth_token")}` },
      });
      const rows = response.data?.data || [];
      if (rows.length === 0) {
        toast.warning("No stock information to export");
        return;
      }

      const reportData = rows.map(item => ({
        "Item Name": item.itemName,
        "Variant": item.variantName,
        "Serial No.": item.serialNumber,
        "Available Qty": item.availableQty,
        "Landing Price": item.landingPrice,
        "Total Value": item.totalValue,
      }));

      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "CurrentStock_Report");
      XLSX.writeFile(wb, `CurrentStock_${new Date().toISOString().split('T')[0]}.xlsx`);

      toast.success("Current stock report downloaded");
    } catch (error) {
      console.error("Failed to export current stock:", error);
      toast.error("Failed to export current stock");
    } finally {
      setExportingExcel(false);
    }
  };

  // Reset page when brand or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeBrandId, searchTerm]);



  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <Layers className="text-indigo-600" size={28} />
            Current Stock Overview
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Real-time inventory levels and valuation across all items.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 p-5 rounded-2xl flex items-center gap-4">
          <div className="bg-white p-3 rounded-xl shadow-sm text-indigo-600">
            <Layers size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">Total Variants</p>
            <p className="text-2xl font-black text-slate-800">{totalRecords}</p>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-5 rounded-2xl flex items-center gap-4">
          <div className="bg-white p-3 rounded-xl shadow-sm text-emerald-600">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">Total Valuation</p>
            <p className="text-2xl font-black text-slate-800">{formatCurrency(globalValue)}</p>
          </div>
        </div>
        <div className="bg-gradient-to-br from-rose-50 to-orange-50 border border-rose-100 p-5 rounded-2xl flex items-center gap-4">
          <div className="bg-white p-3 rounded-xl shadow-sm text-rose-600">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">Low Stock Alerts</p>
            <p className="text-2xl font-black text-slate-800">{globalLowStock}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
         <button
           onClick={() => setActiveBrandId("all")}
           className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all whitespace-nowrap ${
             activeBrandId === "all" 
             ? "bg-slate-800 text-white shadow-lg shadow-slate-200" 
             : "bg-slate-50 text-slate-500 hover:bg-slate-100"
           }`}
         >
           All Stock
         </button>
         {brands.map((brand) => (
           <button
             key={brand.brandId}
             onClick={() => setActiveBrandId(brand.brandId)}
             className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all whitespace-nowrap ${
               activeBrandId === brand.brandId 
               ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" 
               : "bg-slate-50 text-slate-500 hover:bg-slate-100 border border-transparent"
             }`}
           >
             {brand.brandName}
           </button>
         ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-6 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search by Item Name or Variant Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
          />
        </div>
        <button
          onClick={handleExportExcel}
          disabled={exportingExcel}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md shadow-emerald-100 shrink-0 w-full md:w-auto justify-center disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {exportingExcel ? <Loader2 size={20} className="animate-spin" /> : <FileDown size={20} />}
          {exportingExcel ? "Exporting..." : "Export All Stock"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider">Sr. No.</th>
              <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider">Item Name</th>
              <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider">Variant</th>
              <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Available Qty</th>
              <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Landing Price</th>
              <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Total Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan="6" className="p-8 text-center">
                  <div className="flex justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full"></div>
                  </div>
                </td>
              </tr>
            ) : stockData.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-8 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <PackageSearch size={48} className="mb-3 opacity-20" />
                    <p className="font-medium">No stock data found</p>
                  </div>
                </td>
              </tr>
            ) : (
              stockData.map((item, index) => (
                <tr
                  key={item.itemVariantId || index}
                  className={`hover:bg-slate-50 transition-colors ${item.isTrackable ? "cursor-pointer" : ""}`}
                  onClick={() => openVariantSerials(item)}
                  title={item.isTrackable ? "Click to view serial numbers" : ""}
                >
                  <td className="p-4 text-sm text-slate-600">{(currentPage - 1) * pageSize + index + 1}</td>
                  <td className="p-4">
                    <span className="font-bold text-slate-800">{item.itemName}</span>
                  </td>
                  <td className="p-4">
                    <span className="font-medium text-slate-600">{item.variantName}</span>
                  </td>
                  <td className="p-4 text-right">
                    <span className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-lg text-sm font-black ${
                      item.availablePCS <= 0 ? 'bg-rose-100 text-rose-700'
                      : item.availablePCS < 5 ? 'bg-orange-100 text-orange-700'
                      : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {item.availablePCS || 0}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <span className="font-medium text-slate-600">
                      {formatCurrency(item.avgPurchaseRate)}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <span className="font-bold text-indigo-600">
                      {formatCurrency(item.totalValue)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination Controls */}
      {totalRecords > 0 && (
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4 mt-4 rounded-b-2xl">
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

      {serialModalVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeVariantSerials}>
          <div className="bg-white rounded-2xl shadow-xl w-[90vw] max-w-6xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Hash size={18} className="text-indigo-600" /> Serial Numbers — {serialModalVariant.variantName}
              </h2>
              <button onClick={closeVariantSerials} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
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
                      <th className="p-2.5 text-xs font-bold text-slate-500 uppercase">Sr. No.</th>
                      <th className="p-2.5 text-xs font-bold text-slate-500 uppercase">Serial No.</th>
                      <th className="p-2.5 text-xs font-bold text-slate-500 uppercase">Status</th>
                      <th className="p-2.5 text-xs font-bold text-slate-500 uppercase text-right">Landing Price</th>
                      <th className="p-2.5 text-xs font-bold text-slate-500 uppercase text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {serialModalRows.map((s, idx) => (
                      <tr key={s.guid}>
                        <td className="p-2.5 text-slate-500">{idx + 1}</td>
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
                          <button
                            onClick={() => handleDeleteSerial(s)}
                            disabled={deletingSerialGuid === s.guid}
                            title="Delete"
                            className="bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 p-1.5 rounded-lg transition-all disabled:opacity-50 inline-flex items-center justify-center"
                          >
                            {deletingSerialGuid === s.guid ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-400">
              <span>{serialModalRows.length} serial number{serialModalRows.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrentStock;

