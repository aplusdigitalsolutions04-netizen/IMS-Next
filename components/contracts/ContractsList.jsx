"use client";
import React, { useEffect, useState } from "react";
import { FileText, Loader2, Trash2, Eye, X, ListOrdered, Pencil, Ban, Plus, Save, PackagePlus } from "lucide-react";
import Swal from "sweetalert2";
import { contractsService } from "@/lib/services/contractsService";
import { printerService } from "@/lib/services/api";
import { useCompany } from "@/lib/client/CompanyContext";
import { useAppData } from "@/lib/client/AppDataContext";

const parseProducts = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

const EMPTY_PRODUCT = {
  productName: "", brand: "", model: "", categoryQuadrant: "", hsnCode: "", quantity: "", unitPrice: "", totalValue: "",
};

const EDIT_FIELDS = [
  { key: "bidNumber", label: "Bid Number" },
  { key: "contractNumber", label: "Contract Number" },
  { key: "generatedDate", label: "Generated Date", type: "date" },
  { key: "buyerContact", label: "Buyer Contact Number" },
  { key: "buyerEmail", label: "Buyer Email ID" },
  { key: "buyerGstin", label: "Buyer GSTIN" },
  { key: "buyerAddress", label: "Buyer Address" },
  { key: "ministry", label: "Ministry" },
  { key: "department", label: "Department" },
  { key: "organisation", label: "Organisation Name" },
  { key: "officeZone", label: "Office Zone" },
  { key: "sellerCompany", label: "Seller Company Name" },
  { key: "sellerContact", label: "Seller Contact Number" },
  { key: "sellerGstin", label: "Seller GSTIN" },
  { key: "consigneeDesignation", label: "Consignee Designation" },
  { key: "consigneeEmail", label: "Consignee Email ID" },
  { key: "consigneeContact", label: "Consignee Contact" },
  { key: "consigneeAddress", label: "Consignee Address" },
  { key: "deliveryStartAfter", label: "Delivery Start After", type: "date" },
  { key: "deliveryCompletedBy", label: "Delivery To Be Completed By", type: "date" },
];

// MySQL DATE columns come back from the API as a full ISO datetime string
// (e.g. "2026-06-23T18:30:00.000Z") — <input type="date"> needs "yyyy-MM-dd",
// so trim it down for both the input's display and what gets saved back.
const toDateInputValue = (val) => {
  if (!val) return "";
  return String(val).slice(0, 10);
};

function EditContractModal({ contract, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const initial = {};
    EDIT_FIELDS.forEach((f) => {
      const raw = contract[f.key] || "";
      initial[f.key] = f.type === "date" ? toDateInputValue(raw) : raw;
    });
    return initial;
  });
  const [products, setProducts] = useState(() => parseProducts(contract.products).map((p) => ({ ...EMPTY_PRODUCT, ...p })));
  const [saving, setSaving] = useState(false);

  const handleFieldChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const handleProductChange = (idx, key, value) => setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
  const addProductRow = () => setProducts((prev) => [...prev, { ...EMPTY_PRODUCT }]);
  const removeProductRow = (idx) => setProducts((prev) => prev.filter((_, i) => i !== idx));
  const totalOrderValue = products.reduce((sum, p) => sum + toNum(p.totalValue), 0);

  const handleSave = async () => {
    if (!form.contractNumber?.trim()) {
      Swal.fire("Contract Number required", "Please enter a Contract Number.", "warning");
      return;
    }
    setSaving(true);
    try {
      await contractsService.updateContract(contract.guid, { ...form, products: JSON.stringify(products) });
      Swal.fire("Saved", "Contract updated successfully.", "success");
      onSaved();
      onClose();
    } catch (error) {
      console.error("Update contract failed:", error);
      Swal.fire("Error", error?.response?.data?.message || "Failed to update contract", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Pencil size={18} className="text-indigo-600" /> Edit Contract
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {EDIT_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{f.label}</label>
                <input
                  type={f.type || "text"}
                  value={form[f.key] || ""}
                  onChange={(e) => handleFieldChange(f.key, e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Products</label>
              <button onClick={addProductRow} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                <Plus size={14} /> Add Row
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="p-2 text-xs font-black text-slate-500 uppercase min-w-[200px]">Product Name</th>
                    <th className="p-2 text-xs font-black text-slate-500 uppercase min-w-[100px]">Brand</th>
                    <th className="p-2 text-xs font-black text-slate-500 uppercase min-w-[160px]">Model</th>
                    <th className="p-2 text-xs font-black text-slate-500 uppercase min-w-[160px]">Category &amp; Quadrant</th>
                    <th className="p-2 text-xs font-black text-slate-500 uppercase min-w-[120px]">HSN Code</th>
                    <th className="p-2 text-xs font-black text-slate-500 uppercase min-w-[90px]">Qty</th>
                    <th className="p-2 text-xs font-black text-slate-500 uppercase min-w-[100px]">Unit Price</th>
                    <th className="p-2 text-xs font-black text-slate-500 uppercase min-w-[100px]">Total Value</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.length === 0 ? (
                    <tr><td colSpan={9} className="p-4 text-center text-slate-400">No products</td></tr>
                  ) : (
                    products.map((p, idx) => (
                      <tr key={idx}>
                        {["productName", "brand", "model", "categoryQuadrant", "hsnCode"].map((key) => (
                          <td key={key} className="p-1.5">
                            <input value={p[key] || ""} onChange={(e) => handleProductChange(idx, key, e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
                          </td>
                        ))}
                        {["quantity", "unitPrice", "totalValue"].map((key) => (
                          <td key={key} className="p-1.5">
                            <input type="number" value={p[key] ?? ""} onChange={(e) => handleProductChange(idx, key, e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
                          </td>
                        ))}
                        <td className="p-1.5 text-center">
                          <button onClick={() => removeProductRow(idx)} className="p-1.5 text-rose-500 hover:text-white hover:bg-rose-500 rounded-lg transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {products.length > 0 && (
                  <tfoot>
                    <tr className="bg-emerald-50 border-t-2 border-emerald-100">
                      <td colSpan={7} className="p-2 text-right font-black text-slate-600 text-xs uppercase">Total Order Value</td>
                      <td className="p-2 font-black text-emerald-700">₹{totalOrderValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md transition-all"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CANCEL_REASONS = ["Mutual Cancellation", "Buyer not accepting", "Other reason"];

function CancelContractModal({ contract, onClose, onCancelled }) {
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason) {
      Swal.fire("Reason required", "Please select a reason for cancellation.", "warning");
      return;
    }
    setSubmitting(true);
    try {
      await contractsService.cancelContract(contract.guid, reason, remarks);
      onCancelled();
      onClose();
    } catch (error) {
      console.error("Cancel contract failed:", error);
      Swal.fire("Error", error?.response?.data?.message || "Failed to cancel contract", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-rose-600 to-red-500 p-5 relative">
          <h3 className="text-lg font-black text-white">Cancel Contract</h3>
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
            <X size={16} className="text-white" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Select Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">-- Select Reason --</option>
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="Additional Remarks (optional)"
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md hover:from-emerald-600 hover:to-teal-600 transition-all">
            Close
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-md hover:from-teal-600 hover:to-emerald-600 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            Confirm Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ContractsList({ statusFilter = "Active" }) {
  const { activeCompany } = useCompany();
  const { subscribeRealtime } = useAppData();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedContractId, setExpandedContractId] = useState(null);
  const [editingContract, setEditingContract] = useState(null);
  const [cancellingContract, setCancellingContract] = useState(null);

  const loadContracts = async () => {
    setLoading(true);
    const data = await contractsService.getContracts();
    setContracts(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    loadContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.guid]);

  // Real-time sync — rides the single app-wide SSE connection already opened
  // in AppDataContext (see [[realtime-sync]]) instead of opening its own, so
  // this stays in sync with every other user in the same company the same
  // way models/serials/dispatches/returns do everywhere else in the app.
  useEffect(() => {
    return subscribeRealtime("contracts", loadContracts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: "Delete contract?",
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (!confirm.isConfirmed) return;
    try {
      await contractsService.deleteContract(id);
      await loadContracts();
    } catch (error) {
      console.error("Delete contract failed:", error);
      Swal.fire("Error", "Failed to delete contract", "error");
    }
  };


  const handleCreateDraftOrder = async (c) => {
    const products = parseProducts(c.products);
    if (products.length === 0) {
      Swal.fire("No products", "This contract has no products to create a draft order from.", "warning");
      return;
    }
    try {
      await printerService.createOrderDraft({ ...c, products, pdfFilename: c.pdfFilename });
      Swal.fire("Draft created", "Order draft created — check the Draft tab in Order Processing.", "success");
    } catch (error) {
      console.error("Create order draft failed:", error);
      Swal.fire("Error", error?.response?.data?.message || "Failed to create order draft", "error");
    }
  };

  const formatDate = (val) => {
    if (!val) return "-";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const showingCancelled = statusFilter === "Cancelled";
  const visibleContracts = contracts.filter((c) => (showingCancelled ? c.status === "Cancelled" : c.status !== "Cancelled"));

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 mb-6">
        <FileText className={showingCancelled ? "text-rose-600" : "text-indigo-600"} size={28} />
        {showingCancelled ? "Cancelled Contracts" : "Saved Contracts"} ({visibleContracts.length})
      </h2>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Sr No</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Actions</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Status</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Bid Number</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Contract Number</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Generated Date</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Buyer Contact</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Products</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Buyer Email</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Buyer GSTIN</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Buyer Address</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Delivery Start After</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Delivery To Be Completed By</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Ministry</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Department</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Organisation</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Office Zone</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Seller Company</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Seller Contact</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Seller GSTIN</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Consignee Designation</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Consignee Email</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Consignee Contact</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Consignee Address</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Created Date</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Created By</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Modified Date</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Modified By</th>
              <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">View PDF</th>
              {showingCancelled && (
                <>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Cancel Reason</th>
                  <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Cancel Remarks</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={showingCancelled ? 30 : 28} className="p-8 text-center">
                  <Loader2 className="animate-spin mx-auto text-indigo-600" size={24} />
                </td>
              </tr>
            ) : visibleContracts.length === 0 ? (
              <tr>
                <td colSpan={showingCancelled ? 30 : 28} className="p-8 text-center text-slate-400">
                  {showingCancelled ? "No cancelled contracts" : "No contracts saved yet"}
                </td>
              </tr>
            ) : (
              visibleContracts.map((c, idx) => {
                const isCancelled = c.status === "Cancelled";
                return (
                  <React.Fragment key={c.guid}>
                  <tr className={`hover:bg-slate-50 ${isCancelled ? "opacity-60" : ""}`}>
                    <td className="p-3 whitespace-nowrap">{idx + 1}</td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditingContract(c)} className="text-indigo-500 hover:text-indigo-700" title="Edit">
                          <Pencil size={16} />
                        </button>
                        {!isCancelled && (
                          <>
                            <button onClick={() => handleCreateDraftOrder(c)} className="text-teal-600 hover:text-teal-800" title="Create Order Draft">
                              <PackagePlus size={16} />
                            </button>
                            <button onClick={() => setCancellingContract(c)} className="text-amber-500 hover:text-amber-700" title="Cancel Contract">
                              <Ban size={16} />
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDelete(c.guid)} className="text-rose-500 hover:text-rose-700" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        isCancelled ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {c.status || "Active"}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">{c.bidNumber || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{c.contractNumber || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{formatDate(c.generatedDate)}</td>
                    <td className="p-3 whitespace-nowrap">{c.buyerContact || "-"}</td>
                    <td className="p-3 whitespace-nowrap">
                      {parseProducts(c.products).length > 0 ? (
                        <button
                          onClick={() => setExpandedContractId((prev) => (prev === c.guid ? null : c.guid))}
                          className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold"
                        >
                          <ListOrdered size={14} /> View ({parseProducts(c.products).length})
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">{c.buyerEmail || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{c.buyerGstin || "-"}</td>
                    <td className="p-3 max-w-[200px] truncate" title={c.buyerAddress}>{c.buyerAddress || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{formatDate(c.deliveryStartAfter)}</td>
                    <td className="p-3 whitespace-nowrap">{formatDate(c.deliveryCompletedBy)}</td>
                    <td className="p-3 whitespace-nowrap">{c.ministry || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{c.department || "-"}</td>
                    <td className="p-3 max-w-[180px] truncate" title={c.organisation}>{c.organisation || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{c.officeZone || "-"}</td>
                    <td className="p-3 max-w-[180px] truncate" title={c.sellerCompany}>{c.sellerCompany || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{c.sellerContact || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{c.sellerGstin || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{c.consigneeDesignation || "-"}</td>
                    <td className="p-3 max-w-[180px] truncate" title={c.consigneeEmail}>{c.consigneeEmail || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{c.consigneeContact || "-"}</td>
                    <td className="p-3 max-w-[200px] truncate" title={c.consigneeAddress}>{c.consigneeAddress || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{formatDate(c.createdAt)}</td>
                    <td className="p-3 whitespace-nowrap">{c.createdBy || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{formatDate(c.modifiedAt)}</td>
                    <td className="p-3 whitespace-nowrap">{c.modifiedBy || "-"}</td>
                    <td className="p-3 whitespace-nowrap">
                      {c.pdfFilename ? (
                        <a
                          href={`/uploads/${c.pdfFilename}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold"
                        >
                          <Eye size={14} /> View
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    {showingCancelled && (
                      <>
                        <td className="p-3 whitespace-nowrap">{c.cancelReason || "-"}</td>
                        <td className="p-3 max-w-[220px] truncate" title={c.cancelRemarks}>{c.cancelRemarks || "-"}</td>
                      </>
                    )}
                  </tr>
                  {expandedContractId === c.guid && (() => {
                    const contractProducts = parseProducts(c.products);
                    return (
                      <tr key={`${c.guid}-products`} className="bg-slate-50">
                        <td colSpan={showingCancelled ? 30 : 28} className="p-0">
                          <div className="sticky left-0 w-[calc(100vw-4rem)] max-w-[1100px] p-4">
                            <table className="w-full text-left border-collapse text-xs border border-slate-200 rounded-xl overflow-hidden bg-white table-fixed">
                              <thead>
                                <tr className="bg-slate-100 border-b border-slate-200">
                                  <th className="p-2 font-bold text-slate-700 truncate">Product Name</th>
                                  <th className="p-2 font-bold text-slate-700 truncate">Brand</th>
                                  <th className="p-2 font-bold text-slate-700 truncate">Model</th>
                                  <th className="p-2 font-bold text-slate-700 truncate">Category &amp; Quadrant</th>
                                  <th className="p-2 font-bold text-slate-700 truncate">HSN Code</th>
                                  <th className="p-2 font-bold text-slate-700 truncate">Qty</th>
                                  <th className="p-2 font-bold text-slate-700 truncate">Unit Price</th>
                                  <th className="p-2 font-bold text-slate-700 truncate">Total Value</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {contractProducts.map((p, pIdx) => (
                                  <tr key={pIdx}>
                                    <td className="p-2 text-indigo-700 font-medium truncate" title={p.productName}>{p.productName || "-"}</td>
                                    <td className="p-2 truncate" title={p.brand}>{p.brand || "-"}</td>
                                    <td className="p-2 text-indigo-700 truncate" title={p.model}>{p.model || "-"}</td>
                                    <td className="p-2 truncate" title={p.categoryQuadrant}>{p.categoryQuadrant || "-"}</td>
                                    <td className="p-2 truncate" title={p.hsnCode}>{p.hsnCode || "-"}</td>
                                    <td className="p-2">{p.quantity ?? "-"}</td>
                                    <td className="p-2">{p.unitPrice ?? "-"}</td>
                                    <td className="p-2">{toNum(p.totalValue).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  </tr>
                                ))}
                                <tr className="bg-slate-50">
                                  <td colSpan={7} className="p-2 text-right font-bold text-slate-600">Total Order Value</td>
                                  <td className="p-2 font-bold text-slate-800">
                                    {contractProducts.reduce((sum, p) => sum + toNum(p.totalValue), 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editingContract && (
        <EditContractModal
          contract={editingContract}
          onClose={() => setEditingContract(null)}
          onSaved={loadContracts}
        />
      )}

      {cancellingContract && (
        <CancelContractModal
          contract={cancellingContract}
          onClose={() => setCancellingContract(null)}
          onCancelled={loadContracts}
        />
      )}
    </div>
  );
}
