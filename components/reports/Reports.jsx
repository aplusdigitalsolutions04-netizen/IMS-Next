"use client";
import React, { useState, useEffect, useMemo } from "react";
import { printerService } from "@/lib/services/api";
import { useToast } from "@/lib/client/ToastContext";
import { 
  Calendar, Download, TrendingUp, Box,
  FileText, Printer, Layers, AlertTriangle, CheckCircle, Edit2, Save, X,
  ChevronLeft, ChevronRight, Truck, RefreshCw,
  ArrowDownRight, ArrowUpRight, ArrowDownCircle, ArrowUpCircle
} from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfYear, endOfYear } from "date-fns";
import { platformsService } from "@/lib/services/platformsService";
import { useCompany } from "@/lib/client/CompanyContext";

// Helper to format numbers for CSV
function formatCsvNumber(val) {
  if (val === null || val === undefined) return "0";
  const num = Number(val);
  if (isNaN(num)) return "0";
  return num.toString();
}

export default function Reports({ isAdmin, isAccountant, isSupervisor, returns = [] }) {
  const toast = useToast();
  const { activeCompany } = useCompany();
  const [dateRange, setDateRange] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [reportData, setReportData] = useState({ transactions: [], stockSummary: null });
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [stockTypeFilter, setStockTypeFilter] = useState("all"); // 'all', 'in', 'out'
  const [masterPlatforms, setMasterPlatforms] = useState([]);

  // Platform Master (Settings > Selling Platforms) is the source of truth —
  // was a hardcoded list before (including a stray "Wery" entry that isn't
  // a real configured platform). Re-fetches on company switch since a
  // company's allowedPlatforms scoping below depends on which company is
  // active.
  useEffect(() => {
    platformsService.getPlatforms().then((rows) => setMasterPlatforms(Array.isArray(rows) ? rows : []));
  }, [activeCompany?.guid]);

  const allowedPlatforms = activeCompany?.allowedPlatforms;
  const platforms = [
    { id: "all", name: "All Platforms" },
    ...masterPlatforms
      .filter((p) => !allowedPlatforms || allowedPlatforms.includes(p.name))
      .map((p) => ({ id: p.name, name: p.name })),
  ];

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const canEditCommission = isAdmin || isAccountant;

  const [editingId, setEditingId] = useState(null);
  const [tempCommission, setTempCommission] = useState("");

  useEffect(() => {
    if (dateRange !== "custom") fetchReport(dateRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reportData, stockTypeFilter, categoryFilter, platformFilter]);

  const fetchReport = async (range) => {
    setLoading(true);
    let start, end;
    const now = new Date();

    if (range === "today") {
      start = startOfDay(now);
      end = endOfDay(now);
    } else if (range === "week") {
      start = startOfWeek(now, { weekStartsOn: 1 });
      end = endOfWeek(now, { weekStartsOn: 1 });
    } else if (range === "year") {
      start = startOfYear(now);
      end = endOfYear(now);
    } else if (range === "all") {
      start = new Date("2000-01-01");
      end = new Date("2100-12-31");
    } else if (range === "custom") {
      start = new Date(customStart);
      end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
    }

    if (start && end) {
      try {
        // Send plain local calendar dates (YYYY-MM-DD), not .toISOString() —
        // the backend (app/api/reports/route.js) takes the date portion of
        // whatever string it's given and treats it as the intended IST
        // calendar date. Converting a local IST midnight to UTC first shifts
        // it back a day (IST is UTC+5:30), so "Today"/"This Week"/"This
        // Year" silently pulled in an extra day of yesterday's transactions.
        const data = await printerService.getReports(format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));
        const transactionsArray = Array.isArray(data) ? data : (data?.transactions || []);
        setReportData({ 
          transactions: transactionsArray, 
          stockSummary: data?.stockSummary || null 
        });
      } catch (error) {
        console.error("Failed to fetch reports", error);
        setReportData({ transactions: [], stockSummary: null });
      }
    }
    setLoading(false);
  };

  const handleCustomSearch = (e) => {
    e.preventDefault();
    if (customStart && customEnd) fetchReport("custom");
  };

  const startEditing = (transaction) => {
    setEditingId(transaction.guid || transaction._id || transaction.id);
    setTempCommission(transaction.commission || 0);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setTempCommission("");
  };

  const saveCommission = async (transaction) => {
    const commissionValue = Number(tempCommission);
    if (isNaN(commissionValue) || commissionValue < 0) {
      toast.error("Commission must be a valid positive number");
      return;
    }
    if (!transaction.itemCount) {
      toast.error("Cannot compute per-item commission: item count is 0");
      return;
    }
    try {
      const perItemCommission = commissionValue / transaction.itemCount;

      const outcomes = await Promise.allSettled(transaction.batchIds.map(id =>
        printerService.updateDispatch(id, { commission: perItemCommission })
      ));

      const failedCount = outcomes.filter(o => o.status === "rejected").length;
      if (failedCount > 0) {
        toast.warning(`Commission updated for ${outcomes.length - failedCount} of ${outcomes.length} items. ${failedCount} failed.`);
      } else {
        toast.success("Commission updated");
      }

      fetchReport(dateRange === "custom" ? "custom" : dateRange);
      setEditingId(null);
      setTempCommission("");
    } catch (error) {
      toast.error("Failed to update commission: " + error.message);
      console.error("Commission update error:", error);
    }
  };

  const processedData = useMemo(() => {
    if (!reportData || !reportData.transactions) return { 
      tableTransactions: [], 
      summary: { stockValue: 0, printerStockValue: 0, stationeryStockValue: 0, bookingValue: 0, revenue: 0, damageLoss: 0, netProfit: 0, deliveredCount: 0 } 
    };

    let stockValue = 0, printerStockValue = 0, stationeryStockValue = 0, bookingValue = 0, bookingCount = 0, revenue = 0, damageLoss = 0, netProfitTotal = 0, deliveredCount = 0;

    const deliveredStatuses = ["delivered", "completed", "payment pending", "stock out"];
    
    // Explicit Status Array matching your exact requirements
    const activeBookingStatuses = [
      "packing in process", 
      "ready for pickup", 
      "pickup scheduled", 
      "in transit", 
      "out for delivery"
    ];
    
    const damageStatuses = ["damage", "damaged"];

    const groupedTransactions = [];
    const groups = {};
    const platformStats = {};

    reportData.transactions.forEach(t => {
      const rawLogisticsStatus = String(t.logisticsStatus || t.LogisticsStatus || "").trim();
      const rawOrderStatus = String(t.status || t.Status || t.orderStatus || "Pending").trim();
      
      // Force "Billed" logic strictly into Packing in Process to ensure clean UI
      let finalLiveDisplayStatus = rawLogisticsStatus !== "" ? rawLogisticsStatus : rawOrderStatus;
      const lowerDisplayCheck = finalLiveDisplayStatus.toLowerCase();
      
      if (lowerDisplayCheck === "billed" || lowerDisplayCheck === "send for billing" || lowerDisplayCheck === "billing") {
        finalLiveDisplayStatus = "Packing in Process";
      }

      const status = rawOrderStatus.toLowerCase();
      const logStatus = rawLogisticsStatus.toLowerCase();
      
      const landing = Number(t.landingPrice || t.landing || t.LandingPrice || t.purchasePrice || t.costPrice || 0);
      const selling = Number(t.sellingPrice || t.selling || t.SellingPrice || t.price || 0);
      const commission = Number(t.commission || t.Commission || 0);
      const freight = Number(t.freight || t.freightCharges || t.FreightCharges || 0);
      const packing = Number(t.packing || t.packagingCost || t.PackagingCost || 0);

      const resolvedInvoiceFile = t.invoiceFile || t.invoiceFilename || t.billFile || t.InvoiceFile || t.InvoiceFilename || null;
      const resolvedEwayBillFile = t.ewayBillFile || t.ewayBillFilename || t.EwayBillFile || t.EwayBillFilename || null;

      const platform = String(t.firmName || t.FirmName || "Other").trim();
      if (!platformStats[platform]) {
        platformStats[platform] = { revenue: 0, profit: 0, count: 0 };
      }

      const isStockInFlow = status === "available" || status === "stock in";
      if (stockTypeFilter === "in" && !isStockInFlow) return;
      if (stockTypeFilter === "out" && isStockInFlow) return;

      const cat = (t.category || "").toLowerCase();
      const model = (t.modelName || "").toLowerCase();
      const isStationery = !(
        cat.includes("printer") || cat.includes("laser") || cat.includes("aio") || cat.includes("pc") || cat.includes("monitor") || cat.includes("ups") || cat.includes("cpu") ||
        model.includes("printer") || model.includes("laser") || model.includes("aio") || model.includes("all-in-one") || model.includes("pc ") || model.includes("desktop")
      );

      if (categoryFilter !== "all") {
        if (categoryFilter === "printer" && isStationery) return;
        if (categoryFilter === "stationery" && !isStationery) return;
      }

      if (platformFilter !== "all" && platform !== platformFilter) return;

      if (isStockInFlow) {
        stockValue += landing;
        if (!isStationery) printerStockValue += landing;
        else stationeryStockValue += landing;
      }

      const tId = t.guid || t._id || t.id;
      const orderReturns = returns.filter(r => r.dispatchGuid && tId && String(r.dispatchGuid) === String(tId));
      let refundAmount = 0;
      let repairCost = 0;
      let damagedReturnCount = 0;

      orderReturns.forEach(r => {
        refundAmount += (Number(r.refundAmount) || 0);
        repairCost += (Number(r.repairCost) || 0);
        if (r.condition === "Damaged") damagedReturnCount += 1;
      });

      // Removed 'send for billing' from hiddenStatuses to ensure it goes into Booking Amount
      const hiddenStatuses = ["order confirmed", "pending", "order on hold", "order not confirmed"];
      const isCancelled = status === "order cancelled" || status === "cancelled" || logStatus === "cancelled";
      const isReturned = status === "returned" || status === "partially returned" || status === "rto" || logStatus === "rto" || logStatus === "returned";
      const hasLogistics = rawLogisticsStatus !== "";

      const isMarketplace = platform.toLowerCase() === 'amazon' || platform.toLowerCase() === 'flipkart';
      if (!isCancelled && !isReturned && hiddenStatuses.includes(status) && !hasLogistics && !isMarketplace) {
        return; 
      }

      const customerIdentifier = t.customerName || t.customer;
      const dateStr = t.dispatchDate ? String(t.dispatchDate).split('T')[0] : 'nodate';
      const tIdForGroup = t.guid || t._id || t.id;
      const key = customerIdentifier ? `${platform}_${customerIdentifier}_${dateStr}` : tIdForGroup;
      
      if (!groups[key]) {
        groups[key] = {
          ...t,
          isBulk: false,
          itemCount: 1,
          batchIds: [tIdForGroup],
          selling,
          landing,
          commission,
          freight,
          packing,
          refundAmount,
          damagedLanding: damagedReturnCount * landing,
          repairCost,
          hasReturn: orderReturns.length > 0,
          status: status, 
          liveDisplayStatus: finalLiveDisplayStatus, 
          logisticsStatus: logStatus,
          invoiceFile: resolvedInvoiceFile, 
          ewayBillFile: resolvedEwayBillFile,
          platform
        };
      } else {
        groups[key].isBulk = true;
        groups[key].itemCount += 1;
        if (!groups[key].batchIds.includes(tIdForGroup)) {
          groups[key].batchIds.push(tIdForGroup);
          groups[key].freight = (groups[key].freight || 0) + freight;
          groups[key].packing = (groups[key].packing || 0) + packing;
        }
        groups[key].landing += landing;
        groups[key].selling += selling;
        groups[key].commission += commission;
        groups[key].refundAmount = (groups[key].refundAmount || 0) + refundAmount;
        groups[key].damagedLanding = (groups[key].damagedLanding || 0) + (damagedReturnCount * landing);
        groups[key].repairCost = (groups[key].repairCost || 0) + repairCost;
        if (orderReturns.length > 0) groups[key].hasReturn = true;
        
        // Re-enforce dynamic updates on batches
        if (rawLogisticsStatus !== "") {
          let updatedLogStatus = rawLogisticsStatus;
          if (updatedLogStatus.toLowerCase() === "billed" || updatedLogStatus.toLowerCase() === "billing") {
             updatedLogStatus = "Packing in Process";
          }
          groups[key].liveDisplayStatus = updatedLogStatus;
        }
        if (resolvedInvoiceFile) {
          groups[key].invoiceFile = resolvedInvoiceFile;
        }
        if (resolvedEwayBillFile) {
          groups[key].ewayBillFile = resolvedEwayBillFile;
        }
      }
    });

    Object.values(groups).forEach(batch => {
      const isRto = batch.status === "rto" || batch.logisticsStatus === "rto";
      const platform = batch.platform || "Other";

      if (isRto) {
        batch.selling = 0;
        batch.landing = 0;
        batch.netProfit = -(batch.commission + batch.freight + batch.packing);
        damageLoss += Math.abs(batch.netProfit);
        netProfitTotal += batch.netProfit;
      } else if (batch.status === "stock in" || batch.status === "available") {
        batch.netProfit = 0;
      } else {
        const actualSelling = batch.selling - (batch.refundAmount || 0);
        const effectiveLanding = batch.landing; 
        batch.netProfit = actualSelling - effectiveLanding - batch.commission - batch.freight - batch.packing - (batch.repairCost || 0);

        if (damageStatuses.includes(batch.status) || damageStatuses.includes(batch.logisticsStatus) || batch.damagedLanding > 0 || (batch.repairCost || 0) > 0) {
          damageLoss += (batch.damagedLanding > 0 ? batch.damagedLanding : batch.landing) + (batch.repairCost || 0);
        } 
        
        const isBypass = (platform.toLowerCase() === 'amazon' || platform.toLowerCase() === 'flipkart') && batch.status === 'ready for pickup';
        
        const currentBStatus = (batch.status || "").toLowerCase().trim();
        const currentLStatus = (batch.logisticsStatus || "").toLowerCase().trim();
        const currentDisplayStatus = (batch.liveDisplayStatus || "").toLowerCase().trim();

        const isDeliveredFlow = deliveredStatuses.includes(currentBStatus) || 
                                deliveredStatuses.includes(currentLStatus) || 
                                deliveredStatuses.includes(currentDisplayStatus);

        const isActiveFlow = activeBookingStatuses.includes(currentBStatus) || 
                             activeBookingStatuses.includes(currentLStatus) || 
                             activeBookingStatuses.includes(currentDisplayStatus);

        if (isActiveFlow) {
          // ✅ Guaranteed increment for active booking items here!
          bookingValue += actualSelling; 
          bookingCount += 1;
        } else if (isDeliveredFlow || batch.hasReturn || isBypass) {
          revenue += actualSelling;
          netProfitTotal += batch.netProfit;
          deliveredCount += batch.itemCount;
          
          if (platformStats[platform]) {
            platformStats[platform].revenue += actualSelling;
            platformStats[platform].profit += batch.netProfit;
            platformStats[platform].count += batch.itemCount;
          }
        }
      }
      groupedTransactions.push(batch);
    });

    groupedTransactions.sort((a, b) => new Date(b.dispatchDate || 0) - new Date(a.dispatchDate || 0));

    return { 
      tableTransactions: groupedTransactions,
      summary: { 
        stockValue: reportData.stockSummary 
          ? (categoryFilter === "all" ? reportData.stockSummary.total : 
             categoryFilter === "printer" ? reportData.stockSummary.printer : 
             reportData.stockSummary.stationery)
          : stockValue, 
        printerStockValue: reportData.stockSummary ? reportData.stockSummary.printer : printerStockValue, 
        stationeryStockValue: reportData.stockSummary ? reportData.stockSummary.stationery : stationeryStockValue, 
        bookingValue, 
        bookingCount,
        revenue, 
        damageLoss, 
        netProfit: netProfitTotal, 
        deliveredCount,
        platformStats
      }
    };
  }, [reportData, returns, categoryFilter, platformFilter, stockTypeFilter]);

  const { tableTransactions, summary } = processedData;

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentTransactions = tableTransactions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(tableTransactions.length / itemsPerPage);

  const nextPage = () => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); };
  const prevPage = () => { if (currentPage > 1) setCurrentPage(currentPage - 1); };

  const downloadCSV = () => {
    if (!reportData) {
      toast.warning("No data available to download");
      return;
    }

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes("\n") || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const rangeLabel = dateRange === "custom" 
      ? customStart + " to " + customEnd 
      : dateRange === "all" ? "ALL TIME" : dateRange.toUpperCase();

    const summaryRows = [
      ["FINANCIAL REPORT SUMMARY"],
      ["Generated Date", new Date().toLocaleString()],
      ["Report Range", rangeLabel],
      [],
      ["METRIC", "AMOUNT (INR)"],
      ["Available Stock", (summary.stockValue || 0).toLocaleString("en-IN")],
      ["Order Booking Count (Active)", summary.bookingCount.toString()],
      ["Total Revenue (Delivered)", summary.revenue.toLocaleString("en-IN")],
      ["Net Profit (After RTO)", summary.netProfit.toLocaleString("en-IN")],
      ["Total Loss (Damage & RTO)", summary.damageLoss.toLocaleString("en-IN")],
      [],
      ["DETAILED ORDER BREAKDOWN"],
    ];

    const tableHeaders = stockTypeFilter === "in" ? [
      "#", "Date", "Order ID", "Category", "Status", "Model", "Invoice", "Landing Price"
    ] : [
      "#", "Date", "Order ID", "Category", "Status", "Model", 
      "Invoice", "Landing Price", "Selling Price", "Refund",
      "Commission", "Packing", "Freight", "Repair Cost", "Net Profit"
    ];

    const tableData = tableTransactions.map((t, index) => {
      let dateStr = "N/A";
      if (t.dispatchDate) {
        try {
          dateStr = format(new Date(t.dispatchDate), "yyyy-MM-dd");
        } catch (e) {
          dateStr = "N/A";
        }
      }
      
      const orderIdStr = t.customerName || t.customer || t.orderId || "N/A";
      const modelStr = t.isBulk 
        ? `Multiple (${t.itemCount} items)` 
        : (t.modelName || "N/A") + " (" + (t.serialValue || "N/A") + ")";

      if (stockTypeFilter === "in") {
        return [
          index + 1, dateStr, orderIdStr, t.category || "N/A", 
          t.liveDisplayStatus || "N/A", modelStr, 
          t.invoiceFile ? "Available" : "-", formatCsvNumber(t.landing)
        ];
      }

      return [
        index + 1, dateStr, orderIdStr, t.category || "N/A",
        t.liveDisplayStatus || "N/A", modelStr,
        t.invoiceFile ? "Available" : "-",
        formatCsvNumber(t.landing), formatCsvNumber(t.selling), formatCsvNumber(t.refundAmount),
        formatCsvNumber(t.commission), formatCsvNumber(t.packing), formatCsvNumber(t.freight),
        formatCsvNumber(t.repairCost), formatCsvNumber(t.netProfit)
      ];
    });

    const allRows = [...summaryRows, tableHeaders, ...tableData];

    const csvString = allRows
      .map(function(row) { return row.map(escapeCsv).join(","); })
      .join("\n");

    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `profit_report_${stockTypeFilter}_` + dateRange + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-20 print:p-0 print:m-0">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-indigo-600" /> Financial Report
          </h2>
          <p className="text-sm text-slate-500">Manage Commissions & View Profit Analysis</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchReport(dateRange === "custom" ? "custom" : dateRange)} disabled={loading} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-100 transition shadow-sm disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={downloadCSV} disabled={!tableTransactions.length} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition shadow-sm disabled:opacity-50">
            <Download size={16} /> CSV
          </button>
          <button onClick={() => window.print()} disabled={!reportData} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-lg disabled:opacity-50">
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Date Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex flex-wrap gap-2 mb-4">
          {["all", "today", "week", "year", "custom"].map((r) => (
            <button key={r} onClick={() => setDateRange(r)} className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all ${dateRange === r ? "bg-indigo-100 text-indigo-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}>
              {r === "all" ? "All Time" : r === "year" ? "This Year" : r === "week" ? "This Week" : r}
            </button>
          ))}
        </div>
        {dateRange === "custom" && (
          <form onSubmit={handleCustomSearch} className="flex flex-wrap items-end gap-3 bg-slate-50 p-3 rounded-xl">
            <div><label className="text-xs font-bold text-slate-500 block mb-1">Start</label><input type="date" className="border p-2 rounded-lg text-sm" value={customStart} onChange={(e) => setCustomStart(e.target.value)} required /></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">End</label><input type="date" className="border p-2 rounded-lg text-sm" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} required /></div>
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 h-10">Generate</button>
          </form>
        )}
      </div>

      {/* Primary Stock Type Filter (Stock In / Stock Out Tabs) */}
      <div className="flex gap-2 print:hidden mb-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
        {[
          { id: "all", label: "All Records", icon: Layers },
          { id: "in", label: "Stock In Inward", icon: ArrowDownCircle },
          { id: "out", label: "Stock Out Outward", icon: ArrowUpCircle }
        ].map((type) => (
          <button
            key={type.id}
            onClick={() => setStockTypeFilter(type.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all duration-200 ${
              stockTypeFilter === type.id
                ? "bg-white text-slate-900 shadow-md scale-102"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <type.icon size={16} className={stockTypeFilter === type.id ? "text-indigo-600" : "text-slate-400"} />
            {type.label}
          </button>
        ))}
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 print:hidden mb-4">
        {[
          { id: "all", label: "All Items", icon: Layers },
          { id: "printer", label: "Printers / AIO / PC", icon: Printer },
          { id: "stationery", label: "Stationery", icon: FileText }
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all shadow-sm border ${
              categoryFilter === cat.id
                ? `bg-indigo-600 text-white border-indigo-600 shadow-indigo-200`
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <cat.icon size={18} />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Platform Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {platforms.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlatformFilter(p.id)}
            className={`px-4 py-1.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all duration-200 ${
              platformFilter === p.id
                ? "bg-slate-800 text-white shadow-lg scale-105"
                : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Processing Data...</div>
      ) : reportData ? (
        <div className="space-y-6 print:space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 p-3 opacity-10"><Layers size={40} className="text-blue-600"/></div>
              <div>
                <p className="text-[10px] font-bold text-blue-500 uppercase">Available Stock Value</p>
                <h3 className="text-xl font-extrabold text-slate-800 mt-0.5">₹{summary.stockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
              </div>
              <div className="flex gap-3 mt-2 pt-2 border-t border-blue-50">
                <div className="flex-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Printers/AIO</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">₹{summary.printerStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="flex-1 border-l border-blue-50 pl-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Stationery</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">₹{summary.stationeryStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 p-3 opacity-10"><Truck size={40} className="text-amber-600"/></div>
              <div>
                <p className="text-[10px] font-bold text-amber-500 uppercase">Order Booking (Active)</p>
                <h3 className="text-xl font-extrabold text-slate-800 mt-1">₹{summary.bookingValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
              </div>
              <div className="mt-2 pt-2 border-t border-amber-50">
                <p className="text-[9px] font-bold text-slate-400 uppercase">Pending Fulfillment</p>
                <p className="text-xs font-bold text-amber-700 mt-1">{summary.bookingCount} Orders</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 p-3 opacity-10"><CheckCircle size={40} className="text-emerald-600"/></div>
              <div>
                <p className="text-[10px] font-bold text-emerald-600 uppercase">Total Revenue</p>
                <h3 className="text-xl font-extrabold text-slate-800 mt-1">₹{summary.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
              </div>
              <div className="mt-2 pt-2 border-t border-emerald-50">
                <p className="text-[9px] font-bold text-slate-400 uppercase">Processed Orders</p>
                <p className="text-xs font-bold text-emerald-700 mt-1">{summary.deliveredCount} Items Sold</p>
              </div>
            </div>

            <div className={`bg-white p-4 rounded-2xl border shadow-sm relative overflow-hidden flex flex-col justify-between ${summary.netProfit >= 0 ? 'border-indigo-100' : 'border-red-100'}`}>
              <div className="absolute top-0 right-0 p-3 opacity-10"><TrendingUp size={40} className="text-indigo-600"/></div>
              <div>
                <p className={`text-[10px] font-bold uppercase ${summary.netProfit >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>Net Profit (Margin)</p>
                <h3 className={`text-xl font-extrabold mt-1 ${summary.netProfit >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>₹{summary.netProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
              </div>
              <div className="mt-2 pt-2 border-t border-indigo-50">
                <p className="text-[9px] font-bold text-slate-400 uppercase">Efficiency</p>
                <p className="text-xs font-bold text-indigo-700 mt-1">
                  {summary.revenue > 0 ? ((summary.netProfit / summary.revenue) * 100).toFixed(1) : 0}% Profit Margin
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-red-100 shadow-sm relative overflow-hidden bg-red-50/20 flex flex-col justify-between">
              <div className="absolute top-0 right-0 p-3 opacity-10"><AlertTriangle size={40} className="text-red-600"/></div>
              <div>
                <p className="text-[10px] font-bold text-red-500 uppercase">Loss (Damage & RTO)</p>
                <h3 className="text-xl font-extrabold text-red-700 mt-1">₹{summary.damageLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
              </div>
              <div className="mt-2 pt-2 border-t border-red-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase">Impact on Revenue</p>
                <p className="text-xs font-bold text-red-600 mt-1">
                  {summary.revenue > 0 ? ((summary.damageLoss / summary.revenue) * 100).toFixed(1) : 0}% Loss Ratio
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:border-slate-800">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 print:bg-white flex justify-between items-center">
              <h3 className="font-bold text-slate-700 text-sm">
                Order Breakdown {stockTypeFilter === "in" && "(Stock Inward Flow)"} {stockTypeFilter === "out" && "(Stock Outward Flow)"}
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                Showing {tableTransactions.length > 0 ? indexOfFirstItem + 1 : 0} - {Math.min(indexOfLastItem, tableTransactions.length)} of {tableTransactions.length}
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold tracking-wider print:bg-white border-b">
                  <tr>
                    <th className="px-4 py-3 w-24">Date</th>
                    <th className="px-4 py-3">Order ID</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Model</th>
                    <th className="px-4 py-3 text-center">Invoice</th>
                    <th className="px-4 py-3 text-right text-slate-600 bg-slate-50/50">Landing</th>
                    
                    {/* Hide commerce metrics dynamically for Stock In filters */}
                    {stockTypeFilter !== "in" && (
                      <>
                        <th className="px-4 py-3 text-right text-indigo-600 bg-indigo-50/30">Selling</th>
                        <th className="px-4 py-3 text-right text-orange-600 bg-orange-50/30">Refund</th>
                        <th className="px-4 py-3 text-center w-32 bg-amber-50/30 text-amber-700">Commission</th>
                        <th className="px-4 py-3 text-right">Packing</th>
                        <th className="px-4 py-3 text-right">Freight</th>
                        <th className="px-4 py-3 text-right text-red-600 bg-red-50/30">Repair</th>
                        <th className="px-4 py-3 text-right bg-emerald-50/30">Net Profit</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentTransactions.map((t, index) => {
                    const isRowStockIn = t.status === "stock in" || t.status === "available";
                    const lowerDisplayStatus = (t.liveDisplayStatus || "").toLowerCase();
                    
                    return (
                      <tr key={t.guid || t._id || t.id || index} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {(() => {
                            try {
                              return t.dispatchDate ? format(new Date(t.dispatchDate), "dd MMM yy") : "-";
                            } catch {
                              return "-";
                            }
                          })()}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-700">
                          {t.customerName || t.customer || t.orderId || "-"}
                          {t.isBulk && (
                            <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">
                              Batch ({t.itemCount})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">
                            {t.category || "Printer"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md flex items-center gap-1 w-fit ${
                            isRowStockIn ? 'bg-blue-100 text-blue-700' :
                            lowerDisplayStatus === 'packing in process' ? 'bg-amber-100 text-amber-700' :
                            lowerDisplayStatus === 'in transit' || lowerDisplayStatus === 'dispatched' ? 'bg-indigo-100 text-indigo-700' :
                            lowerDisplayStatus === 'delivered' || lowerDisplayStatus === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            lowerDisplayStatus === 'cancelled' || lowerDisplayStatus === 'rto' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {isRowStockIn && <ArrowDownRight size={10} />}
                            {!isRowStockIn && <ArrowUpRight size={10} />}
                            {(t.liveDisplayStatus || "N/A").toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-700">
                            {t.isBulk ? "Multiple Models" : t.modelName || "-"}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {t.isBulk ? `${t.itemCount} Serials` : t.serialValue || "-"}
                          </div>
                        </td>
                        
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            {t.invoiceFile && (
                              <button
                                onClick={() => {
                                  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
                                  window.open(`${baseUrl}/uploads/${t.invoiceFile}`, "_blank", "noopener,noreferrer");
                                }}
                                className="w-full justify-center p-1 bg-indigo-50 text-indigo-600 rounded flex items-center gap-1 hover:bg-indigo-100 transition-all border border-indigo-100 shadow-sm"
                                title="View Primary Invoice"
                              >
                                <FileText size={10} />
                                <span className="text-[9px] font-black uppercase">Primary</span>
                              </button>
                            )}

                            {t.ewayBillFile && (
                              <button
                                onClick={() => {
                                  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
                                  window.open(`${baseUrl}/uploads/${t.ewayBillFile}`, "_blank", "noopener,noreferrer");
                                }}
                                className="w-full justify-center p-1 bg-emerald-50 text-emerald-600 rounded flex items-center gap-1 hover:bg-emerald-100 transition-all border border-emerald-100 shadow-sm"
                                title="View Secondary Invoice"
                              >
                                <FileText size={10} />
                                <span className="text-[9px] font-black uppercase">Secondary</span>
                              </button>
                            )}

                            {!t.invoiceFile && !t.ewayBillFile && (
                              <span className="text-[10px] text-slate-300 font-bold uppercase tracking-tighter">-</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600 bg-slate-50/50 font-bold">
                          ₹{(t.landing || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>

                        {/* Render extra commerce details only when Stock In filters are not active */}
                        {stockTypeFilter !== "in" && (
                          <>
                            <td className="px-4 py-3 text-right font-bold text-indigo-700 bg-indigo-50/30">
                              {isRowStockIn ? "-" : (t.selling > 0 ? "₹" + t.selling.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : "-")}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-orange-700 bg-orange-50/30">
                              {isRowStockIn ? "-" : (t.refundAmount > 0 ? "-₹" + t.refundAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : "-")}
                            </td>
                            <td className="px-4 py-3 text-center bg-amber-50/30">
                              {isRowStockIn ? "-" : (
                                canEditCommission && editingId === (t.guid || t._id || t.id) ? (
                                  <div className="flex items-center gap-1 justify-center">
                                    <input 
                                      type="number" 
                                      className="w-16 p-1 border rounded text-xs text-center" 
                                      value={tempCommission} 
                                      onChange={(e) => setTempCommission(e.target.value)} 
                                      autoFocus 
                                    />
                                    <button onClick={() => saveCommission(t)} className="text-emerald-600 hover:bg-emerald-100 p-1 rounded">
                                      <Save size={14}/>
                                    </button>
                                    <button onClick={cancelEditing} className="text-red-500 hover:bg-red-100 p-1 rounded">
                                      <X size={14}/>
                                    </button>
                                  </div>
                                ) : canEditCommission ? (
                                  <div className="flex items-center justify-center gap-2 group cursor-pointer hover:bg-amber-100/50 py-1 rounded transition" onClick={() => startEditing(t)} title="Click to Edit Commission">
                                    <span className={`text-xs font-bold ${t.commission > 0 ? 'text-amber-700' : 'text-slate-300'}`}>
                                      ₹{(t.commission || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </span>
                                    <Edit2 size={12} className="text-slate-300 group-hover:text-amber-600 opacity-0 group-hover:opacity-100 transition-all" />
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-2 py-1 rounded">
                                    <span className={`text-xs font-bold ${t.commission > 0 ? 'text-amber-700' : 'text-slate-300'}`}>
                                      ₹{(t.commission || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </span>
                                  </div>
                                )
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500">
                              {isRowStockIn ? "-" : `₹${(t.packing || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500">
                              {isRowStockIn ? "-" : `₹${(t.freight || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                            </td>
                            <td className="px-4 py-3 text-right text-red-500 bg-red-50/30 font-semibold">
                              {isRowStockIn ? "-" : (t.repairCost > 0 ? "₹" + t.repairCost.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : "-")}
                            </td>
                            <td className={`px-4 py-3 text-right font-bold bg-emerald-50/30 ${isRowStockIn ? "text-slate-400" : (t.netProfit >= 0 ? "text-emerald-600" : "text-red-600")}`}>
                              {isRowStockIn ? "₹0" : `₹${(t.netProfit || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {tableTransactions.length === 0 && (
                    <tr>
                      <td colSpan={stockTypeFilter === "in" ? "7" : "14"} className="p-8 text-center text-slate-400">
                        No transactions found for this configuration or period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {tableTransactions.length > 0 && (
              <div className="flex flex-col md:flex-row items-center justify-between px-6 py-4 border-t bg-slate-50/50 print:hidden gap-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-500 font-medium">
                    Showing <span className="font-bold text-slate-800">{indexOfFirstItem + 1}</span> to <span className="font-bold text-slate-800">{Math.min(indexOfLastItem, tableTransactions.length)}</span> of <span className="font-bold text-slate-800">{tableTransactions.length}</span> entries
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <select 
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="text-sm font-bold text-indigo-700 bg-white border border-indigo-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer shadow-sm"
                    >
                      {[10, 20, 50, 100].map(val => (
                        <option key={val} value={val}>{val} per page</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button onClick={prevPage} disabled={currentPage === 1} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed group">
                    <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
                  </button>

                  <div className="flex items-center gap-1">
                    {(() => {
                      const pages = [];
                      const maxVisible = 5;
                      let start = Math.max(1, currentPage - 2);
                      let end = Math.min(totalPages, start + maxVisible - 1);
                      
                      if (end - start < maxVisible - 1) {
                        start = Math.max(1, end - maxVisible + 1);
                      }

                      if (start > 1) {
                        pages.push(
                          <button key={1} onClick={() => setCurrentPage(1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all">1</button>
                        );
                        if (start > 2) pages.push(<span key="s1" className="text-slate-300 px-1">...</span>);
                      }

                      for (let i = start; i <= end; i++) {
                        pages.push(
                          <button key={i} onClick={() => setCurrentPage(i)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-all shadow-sm ${currentPage === i ? "bg-indigo-600 text-white shadow-indigo-200" : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"}`}>
                            {i}
                          </button>
                        );
                      }

                      if (end < totalPages) {
                        if (end < totalPages - 1) pages.push(<span key="e1" className="text-slate-300 px-1">...</span>);
                        pages.push(
                          <button key={totalPages} onClick={() => setCurrentPage(totalPages)} className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all">{totalPages}</button>
                        );
                      }
                      
                      return pages;
                    })()}
                  </div>

                  <button onClick={nextPage} disabled={currentPage === totalPages} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed group">
                    <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Calendar size={48} className="mb-4 opacity-20" />
          <p>Select a date range.</p>
        </div>
      )}
    </div>
  );
}

