"use client";
import React, { useState } from "react";
import { X, FileDown, Loader2, CheckSquare, Square } from "lucide-react";
import Swal from "sweetalert2";
import { exportService } from "@/lib/services/exportService";

// Mirrors the Excel export's own column list (app/api/orders/export/route.js
// EXPORT_COLUMNS) — kept as a plain array here since the picker only needs
// key+label, not the backend's row-mapping logic.
const ALL_COLUMNS = [
  { key: "orderId", label: "Order ID" },
  { key: "platform", label: "Platform" },
  { key: "status", label: "Status" },
  { key: "orderDate", label: "Order Date" },
  { key: "dispatchDate", label: "Dispatch Date" },
  { key: "customerName", label: "Customer Name" },
  { key: "consigneeName", label: "Consignee Name" },
  { key: "buyerEmail", label: "Buyer Email" },
  { key: "consigneeEmail", label: "Consignee Email" },
  { key: "shippingAddress", label: "Shipping Address" },
  { key: "gstNumber", label: "GST Number" },
  { key: "contactNumber", label: "Contact Number" },
  { key: "bidNumber", label: "Bid Number" },
  { key: "modelName", label: "Model" },
  { key: "company", label: "Brand" },
  { key: "serialNumber", label: "Serial Number" },
  { key: "quantity", label: "Quantity" },
  { key: "sellingPrice", label: "Selling Price" },
  { key: "warranty", label: "Warranty" },
  { key: "invoiceNumber", label: "Invoice Number" },
  { key: "invoiceFilename", label: "Invoice File" },
  { key: "ewayBillNumber", label: "E-Way Bill Number" },
  { key: "ewayBillFilename", label: "E-Way Bill File" },
  { key: "contractFilename", label: "Contract File" },
  { key: "challanFilename", label: "Challan File" },
  { key: "podFilename", label: "POD File" },
  { key: "courierPartner", label: "Courier Partner" },
  { key: "trackingId", label: "Tracking ID" },
  { key: "logisticsStatus", label: "Logistics Status" },
  { key: "lastDeliveryDate", label: "Last Delivery Date" },
  { key: "freightCharges", label: "Freight Charges" },
  { key: "packagingCost", label: "Packaging Cost" },
  { key: "commission", label: "Commission" },
  { key: "installationRequired", label: "Installation Required" },
  { key: "installationStatus", label: "Installation Status" },
];

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default function OrderExportModal({ dayRange, onClose }) {
  const [selected, setSelected] = useState(() => new Set(ALL_COLUMNS.map((c) => c.key)));
  const [downloading, setDownloading] = useState(false);
  // Pre-filled from whatever date filter is currently active on the Order
  // Processing page, but editable here independently — the export doesn't
  // have to match exactly what's on screen, this is its own "from - to" pick.
  const [fromDate, setFromDate] = useState(() => toDateInput(dayRange?.start));
  const [toDate, setToDate] = useState(() => toDateInput(dayRange?.end));

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleDownload = async () => {
    if (selected.size === 0) {
      Swal.fire("Pick at least one column", "Select which columns to include, or use Select All.", "warning");
      return;
    }
    if ((fromDate && !toDate) || (!fromDate && toDate)) {
      Swal.fire("Incomplete date range", "Pick both a From and a To date, or leave both empty for all orders.", "warning");
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      Swal.fire("Invalid date range", "The From date must be on or before the To date.", "warning");
      return;
    }
    setDownloading(true);
    try {
      await exportService.exportOrders({
        startDate: fromDate || undefined,
        endDate: toDate || undefined,
        columns: selected.size === ALL_COLUMNS.length ? undefined : [...selected],
      });
      onClose();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to export orders", "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileDown size={18} className="text-emerald-600" /> Export Orders to Excel
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Pick a date range (based on Dispatch Date) and which columns to include.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 px-6 py-4 border-b border-slate-100">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate || undefined}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate || undefined}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(""); setToDate(""); }}
              className="col-span-2 text-[11px] font-bold text-slate-400 hover:text-slate-600 text-left"
            >
              Clear dates (export all orders, no date filter)
            </button>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{selected.size} of {ALL_COLUMNS.length} columns selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set(ALL_COLUMNS.map((c) => c.key)))} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">Select All</button>
            <button onClick={() => setSelected(new Set())} className="text-xs font-bold text-slate-500 hover:text-slate-700">Clear All</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto option-scroll px-6 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_COLUMNS.map((col) => {
              const isChecked = selected.has(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => toggle(col.key)}
                  className={`flex items-center gap-2 text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    isChecked ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {isChecked ? <CheckSquare size={14} className="shrink-0" /> : <Square size={14} className="shrink-0" />}
                  <span className="truncate">{col.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {downloading ? "Downloading..." : "Download Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}
