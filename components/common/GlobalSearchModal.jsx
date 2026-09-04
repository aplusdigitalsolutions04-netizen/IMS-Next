"use client";

import { X, CheckCircle2, AlertOctagon, Truck, XCircle, RotateCcw, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useAppData } from "@/lib/client/AppDataContext";

// Global serial/order lookup result modal — always mounted in app/(app)/layout.jsx
// so the top-bar search works the same on every page, not just the dashboard.
export default function GlobalSearchModal({ showFinancials }) {
  const router = useRouter();
  const { searchResult, showSearchModal, clearGlobalSearch } = useAppData();

  if (!showSearchModal || !searchResult) return null;

  const onOpenOrderDetails = (orderId) => {
    if (orderId === null || orderId === undefined || String(orderId).trim() === "") return;
    clearGlobalSearch();
    router.push(`/orderTracking?focus=${encodeURIComponent(String(orderId).trim())}`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[95vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />

          <div className="relative flex justify-between items-start">
            <div>
              <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-wider mb-0.5">Serial Number</p>
              <h3 className="text-lg font-extrabold text-white tracking-wide">#{searchResult.serial}</h3>
            </div>
            <button onClick={clearGlobalSearch} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
              <X size={16} className="text-white" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex justify-center">
            <span
              className={`px-4 py-1.5 rounded-full text-xs font-bold shadow-sm flex items-center gap-1.5 ${
                searchResult.status === "Available"
                  ? "bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700 border border-emerald-200"
                  : searchResult.status === "Damaged"
                    ? "bg-gradient-to-r from-red-100 to-rose-100 text-red-700 border border-red-200"
                    : "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 border border-blue-200"
              }`}
            >
              {searchResult.status === "Available" && <CheckCircle2 size={14} />}
              {searchResult.status === "Damaged" && <AlertOctagon size={14} />}
              {searchResult.status === "Dispatched" && <Truck size={14} />}
              {searchResult.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Model</p>
              <p className="text-sm font-bold text-slate-700 truncate" title={searchResult.model}>
                {searchResult.model}
              </p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Company</p>
              <p className="text-sm font-bold text-slate-700">{searchResult.company}</p>
            </div>
          </div>

          {searchResult.vendor && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Vendor (Stock In)</p>
              <p className="text-sm font-bold text-slate-700 truncate" title={searchResult.vendor}>
                {searchResult.vendor}
              </p>
            </div>
          )}

          {showFinancials && (
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-3 rounded-xl border border-emerald-200 text-center">
              <p className="text-[9px] text-emerald-500 uppercase font-bold tracking-wider mb-0.5">Landing Price</p>
              <p className="text-xl font-extrabold text-emerald-700">₹{searchResult.landingPrice?.toLocaleString("en-IN") || 0}</p>
            </div>
          )}

          {searchResult.status === "Dispatched" && searchResult.dispatch && (
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 relative">
              <div className="absolute top-0 right-0 bg-blue-500 text-white text-[9px] font-bold px-2 py-1 rounded-bl-lg">DISPATCHED</div>
              <h4 className="text-[10px] font-bold text-blue-600 uppercase mb-3 flex items-center gap-1.5">
                <Truck size={14} /> Shipment Details
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-blue-100">
                  <span className="text-slate-500">Platform</span>
                  <span className="font-semibold text-slate-700">{searchResult.dispatch.firmName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-blue-100">
                  <span className="text-slate-500">Order ID</span>
                  <span className="font-semibold text-slate-700">{searchResult.dispatch.customerName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-blue-100">
                  <span className="text-slate-500">Date</span>
                  <span className="font-semibold text-slate-700">{format(new Date(searchResult.dispatch.dispatchDate), "dd MMM yyyy")}</span>
                </div>
                {showFinancials && (
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Selling Price</span>
                    <span className="text-base font-extrabold text-emerald-600">₹{searchResult.dispatch.sellingPrice?.toLocaleString("en-IN") || 0}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => onOpenOrderDetails(searchResult.dispatch.customerName)}
                className="mt-3 w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Truck size={16} /> View Full Order
              </button>
            </div>
          )}

          {searchResult.cancelledDispatch && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-200 relative">
              <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-bold px-2 py-1 rounded-bl-lg">CANCELLED</div>
              <h4 className="text-[10px] font-bold text-red-600 uppercase mb-3 flex items-center gap-1.5">
                <XCircle size={14} /> Cancelled Dispatch
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-red-100">
                  <span className="text-slate-500">Platform</span>
                  <span className="font-semibold text-slate-400 line-through">{searchResult.cancelledDispatch.firmName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-red-100">
                  <span className="text-slate-500">Order ID</span>
                  <span className="font-semibold text-slate-400 line-through">{searchResult.cancelledDispatch.customerName}</span>
                </div>
                <div className="py-1.5 border-b border-red-100">
                  <span className="text-slate-500 block mb-0.5">Reason</span>
                  <span className="font-semibold text-red-600">{searchResult.cancelledDispatch.cancellationReason || "N/A"}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Cancelled On</span>
                  <span className="font-semibold text-slate-600">
                    {searchResult.cancelledDispatch.cancelledAt ? format(new Date(searchResult.cancelledDispatch.cancelledAt), "dd MMM yyyy") : "N/A"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {searchResult.status === "Sold" && searchResult.fbfFbaSellOut && (
            <div className="bg-violet-50 p-4 rounded-xl border border-violet-200 relative">
              <div className="absolute top-0 right-0 bg-violet-500 text-white text-[9px] font-bold px-2 py-1 rounded-bl-lg">SOLD VIA {searchResult.fbfFbaSellOut.type}</div>
              <h4 className="text-[10px] font-bold text-violet-600 uppercase mb-3 flex items-center gap-1.5">
                <ShoppingCart size={14} /> Sell Out Details
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-violet-100">
                  <span className="text-slate-500">Order ID / Reference</span>
                  <span className="font-semibold text-slate-700">{searchResult.fbfFbaSellOut.referenceId || "—"}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-violet-100">
                  <span className="text-slate-500">Date</span>
                  <span className="font-semibold text-slate-700">
                    {searchResult.fbfFbaSellOut.transactionDate ? format(new Date(searchResult.fbfFbaSellOut.transactionDate), "dd MMM yyyy") : "—"}
                  </span>
                </div>
                {showFinancials && searchResult.fbfFbaSellOut.amount !== null && searchResult.fbfFbaSellOut.amount !== undefined && (
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Amount</span>
                    <span className="text-base font-extrabold text-emerald-600">₹{Number(searchResult.fbfFbaSellOut.amount).toLocaleString("en-IN")}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(searchResult.status === "Available" || searchResult.status === "Damaged") && searchResult.returnRecord && (
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 relative">
              <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] font-bold px-2 py-1 rounded-bl-lg">RETURNED</div>
              <h4 className="text-[10px] font-bold text-orange-600 uppercase mb-3 flex items-center gap-1.5">
                <RotateCcw size={14} /> Return History
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-orange-100">
                  <span className="text-slate-500">From</span>
                  <span className="font-semibold text-slate-700">{searchResult.returnRecord.firmName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-orange-100">
                  <span className="text-slate-500">Date</span>
                  <span className="font-semibold text-slate-700">{format(new Date(searchResult.returnRecord.returnDate), "dd MMM yyyy")}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Condition</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded ${
                      searchResult.returnRecord.condition === "Damaged" ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
                    }`}
                  >
                    {searchResult.returnRecord.condition}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t">
          <button
            onClick={clearGlobalSearch}
            className="w-full py-2.5 bg-gradient-to-r from-slate-800 to-slate-900 text-white text-sm font-bold rounded-xl hover:from-slate-700 hover:to-slate-800 transition-all shadow-lg active:scale-[0.98]"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
