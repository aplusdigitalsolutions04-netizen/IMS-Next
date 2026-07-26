"use client";
// Order detail modal extracted from OrderTracking.jsx — markup and behavior unchanged.
import React from "react";
import {
  AlertCircle, Ban, Box, Building, Calendar, Check, CheckCircle, CheckSquare,
  ClipboardList, Edit3, ExternalLink, Eye, FileText, Hash, Loader2, Mail, Package, PauseCircle, Phone, Plus, RefreshCw,
  RotateCcw, Save, Send, Trash2, Truck, UploadCloud, User, Wrench, X, Zap,
} from "lucide-react";
import api from "@/lib/client/apiClient";
import { format } from "date-fns";
import {
  UPDATE_STATUS_OPTIONS, calculateBatchFinancials, getItemSerial, getOldSerial,
  getReturnSerial, isInstallationRequired, isItemReplaced, isItemReturned,
  normalizeSerial, resolveDisplayStatus, safeFormatDate, toLocalDateStr,
} from "./helpers";
import { StatusBadge, StatusTimeline } from "./parts";
import PincodeCheckWidget from "./PincodeCheckWidget";

function openHpWarrantyBridge(serial) {
  const url = `https://support.hp.com/in-en/checkwarranty?serialnumber=${encodeURIComponent(serial)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// Single document tile used throughout the Documents tab — either shows a
// "View" button once `filename` is set, or a custom `action` button (e.g.
// Gate Pass, which generates on demand rather than checking for a filename).
function DocCard({ label, filename, onView, accentBg, accentText, buttonClass, action, onReplace, canReplace }) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-8 h-8 rounded-lg ${accentBg} ${accentText} flex items-center justify-center shrink-0`}>
          <FileText size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-700 truncate">{label}</p>
          {action === undefined && (
            filename ? (
              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1"><CheckCircle size={9} /> Verified</span>
            ) : (
              <span className="text-[10px] text-slate-400 font-bold">Not uploaded</span>
            )
          )}
        </div>
      </div>
      {action !== undefined ? action : filename ? (
        <div className="flex items-center gap-1.5">
          <button onClick={onView} className={`flex-1 text-xs font-bold ${buttonClass} text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 active:scale-95`}>
            <Eye size={12} /> View
          </button>
          {canReplace && onReplace && (
            <label className="cursor-pointer p-2 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-colors shrink-0" title="Replace document">
              <RefreshCw size={13} className="text-blue-500" />
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  const f = e.target.files[0];
                  if (f) onReplace(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      ) : canReplace && onReplace ? (
        <label className="cursor-pointer w-full text-xs font-bold text-slate-500 py-2 rounded-lg border border-dashed border-slate-300 bg-white hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors">
          <UploadCloud size={12} /> Upload
          <input
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => {
              const f = e.target.files[0];
              if (f) onReplace(f);
              e.target.value = "";
            }}
          />
        </label>
      ) : (
        <div className="text-xs text-slate-300 italic text-center py-2 bg-white rounded-lg border border-dashed border-slate-200">Pending</div>
      )}
    </div>
  );
}

// Dark-theme equivalent of DocCard, used by the expanded/full-detail layout
// further down in this file — same view/replace behavior, different skin.
function DarkDocSlot({ label, filename, onView, onReplace, canReplace, viewClass, viewLabel }) {
  return (
    <div className="bg-white/5 rounded-xl p-3 border border-white/10 hover:bg-white/10 transition-colors group">
      <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-2">{label}</p>
      {filename ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onView}
              className={`flex-1 inline-flex items-center justify-center gap-2 text-xs font-black ${viewClass} text-white px-3 py-2 rounded-lg transition-all shadow-lg active:scale-95`}
            >
              <FileText size={12} /> {viewLabel}
            </button>
            {canReplace && onReplace && (
              <label className="cursor-pointer p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors shrink-0" title="Replace document">
                <RefreshCw size={13} className="text-blue-300" />
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => {
                    const f = e.target.files[0];
                    if (f) onReplace(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <span className="text-[10px] text-emerald-400 flex items-center justify-center gap-1 font-bold">
            <CheckCircle size={10} /> Document Verified
          </span>
        </div>
      ) : canReplace && onReplace ? (
        <label className="w-full cursor-pointer inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white/50 py-2 rounded-lg border border-dashed border-white/20 bg-white/5 hover:bg-white/10 transition-colors">
          <UploadCloud size={12} /> Upload
          <input
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => {
              const f = e.target.files[0];
              if (f) onReplace(f);
              e.target.value = "";
            }}
          />
        </label>
      ) : (
        <p className="text-white/30 text-xs font-bold italic py-1.5 text-center bg-white/5 rounded-lg border border-white/5">Not uploaded</p>
      )}
    </div>
  );
}

export default function OrderDetailModal({
  activeTab, canEditOrder, canEditPayment, cancellationReason, closeModal,
  currentUser, editFormData, editItems, extraDocCustomLabel, extraDocFile,
  extraDocInputRef, extraDocType, handleDeleteExtraDoc, handleRemoveSerial,
  handleReplaceExtraDoc, handleReplaceStandardDoc, handleReplaceSerial, handleRestoreBatch, handleSaveEdits,
  handleSavePaymentEdit, handleSaveItemWarrantyDate, handleToggleInstallation, handleToggleGemUpload, handleUpdateStatus,
  handleUploadExtraDoc, handleViewDocument, isAdmin, isEditMode, isEditingPayment,
  isSupervisor, isUpdating, localSerials, localModels, modalDetailTab, newStatus, paymentEditForm,
  replaceWithSerialId, replacingItemId, restoringBatchKey, returns,
  selectedBatch, setCancellationReason, setContractFile, setInvoiceFile, setEditFormData,
  setEditItems, setExtraDocCustomLabel, setExtraDocFile, setExtraDocType,
  setIsEditMode, setIsEditingPayment, setModalDetailTab, setNewStatus,
  setPaymentEditForm, setReplaceWithSerialId, setReplacingItemId,
  setTrackingId, trackingId, uploadingContract, uploadingInvoice, uploadingExtraDoc,
  isAddingSerial, setIsAddingSerial, newSerialToAdd, setNewSerialToAdd,
  newItemSellingPrice, setNewItemSellingPrice, handleAddSerial,
}) {
  const [serialScanInput, setSerialScanInput] = React.useState("");
  const [scanMatchedModel, setScanMatchedModel] = React.useState("");
  const [scanError, setScanError] = React.useState("");

  // Per-serial warranty start dates: { [itemGuid]: "YYYY-MM-DD" }
  const [itemWarrantyDates, setItemWarrantyDates] = React.useState({});
  const [savingWarrantyItemId, setSavingWarrantyItemId] = React.useState(null);
  const [warrantyItemErrors, setWarrantyItemErrors] = React.useState({});
  // null = unchecked, string (incl. "") = checked (holds the bulk date value)
  const [bulkWarrantyDate, setBulkWarrantyDate] = React.useState(null);

  // Email compose modal: null = closed
  const [emailDraft, setEmailDraft] = React.useState(null);
  const [emailSending, setEmailSending] = React.useState(false);
  const [emailSent, setEmailSent] = React.useState(false);
  const [emailError, setEmailError] = React.useState("");
  const [emailPreview, setEmailPreview] = React.useState(false);
  const [emailAttachments, setEmailAttachments] = React.useState([]);
  const emailFileRef = React.useRef(null);

  const [gatepassLoading, setGatepassLoading] = React.useState(false);

  const downloadGatepass = async () => {
    const orderGuid = selectedBatch?.items?.[0]?.orderGuid || selectedBatch?.items?.[0]?._orderId;
    if (!orderGuid) return;
    try {
      setGatepassLoading(true);
      const res = await api.get(`/gatepass/${orderGuid}`);
      const newWin = window.open('', '_blank');
      if (newWin) {
        newWin.document.open();
        newWin.document.write(res.data);
        newWin.document.close();
      } else {
        alert("Please allow popups to view the gate pass.");
      }
      setGatepassLoading(false);
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to generate gate pass");
    } finally {
      setGatepassLoading(false);
    }
  };

  const openEmailCompose = async () => {
    const orderGuid = selectedBatch?.items?.[0]?.orderGuid || selectedBatch?.items?.[0]?._orderId;
    if (!orderGuid) return;
    setEmailDraft({ to: "", cc: "", bcc: "", subject: "", body: "", loading: true });
    setEmailSent(false);
    setEmailError("");
    setEmailPreview(false);
    setEmailAttachments([]);
    try {
      const res = await api.get(`/warranty/email-preview/${orderGuid}`);
      setEmailDraft({ ...res.data, loading: false });
      setEmailError("");
    } catch (e) {
      setEmailDraft(d => ({ ...d, loading: false }));
      setEmailError(e?.response?.data?.message || "Could not load email template. Check backend.");
    }
  };

  const handleEmailFileAdd = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(",")[1];
        setEmailAttachments(prev => [
          ...prev,
          { name: file.name, size: file.size, type: file.type, base64 }
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleSendEmail = async () => {
    if (!emailDraft?.to?.trim()) { setEmailError('"To" email is required'); return; }
    if (!emailDraft?.subject?.trim()) { setEmailError('Subject is required'); return; }
    if (!emailDraft?.body?.trim()) { setEmailError('Email body is required'); return; }
    setEmailSending(true);
    setEmailError("");
    try {
      await api.post("/warranty/send-email", {
        to: emailDraft.to,
        cc: emailDraft.cc,
        bcc: emailDraft.bcc,
        subject: emailDraft.subject,
        body: emailDraft.body,
        attachments: emailAttachments.map(a => ({
          filename: a.name,
          content: a.base64,
          encoding: "base64",
          contentType: a.type,
        })),
      });
      setEmailSent(true);
      setTimeout(() => setEmailDraft(null), 2000);
    } catch (e) {
      setEmailError(e?.response?.data?.message || "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  };

  // Initialise per-item dates whenever the batch changes
  React.useEffect(() => {
    if (!selectedBatch?.displayItems) return;
    const dates = {};
    selectedBatch.displayItems.forEach(item => {
      const key = item.guid || item.id;
      dates[key] = toLocalDateStr(item.itemWarrantyStartDate || "");
    });
    setItemWarrantyDates(dates);
    setBulkWarrantyDate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatch?.id]);

  const handleSaveOneItemWarranty = async (itemGuid, date) => {
    setSavingWarrantyItemId(itemGuid);
    setWarrantyItemErrors(prev => ({ ...prev, [itemGuid]: null }));
    try {
      await handleSaveItemWarrantyDate(itemGuid, date);
    } catch (err) {
      setWarrantyItemErrors(prev => ({ ...prev, [itemGuid]: err?.message || "Save failed" }));
    } finally {
      setSavingWarrantyItemId(null);
    }
  };

  // Reset the scan box whenever the Add Serial panel is opened/closed (manually or after a successful add)
  React.useEffect(() => {
    if (!isAddingSerial) {
      setSerialScanInput("");
      setScanMatchedModel("");
      setScanError("");
    }
  }, [isAddingSerial]);

  const tryMatchSerialForAdd = (rawValue, { showErrorIfMissing }) => {
    if (!rawValue) {
      setScanMatchedModel("");
      setScanError("");
      setNewSerialToAdd("");
      return;
    }
    const matched = localSerials.find(s => normalizeSerial(s.value || s.serialNumber) === normalizeSerial(rawValue));
    if (!matched) {
      setScanMatchedModel("");
      setNewSerialToAdd("");
      setScanError(showErrorIfMissing ? `Serial "${rawValue}" not found in inventory` : "");
      return;
    }
    if ((matched.status || "").trim().toLowerCase() !== "available") {
      setScanMatchedModel("");
      setNewSerialToAdd("");
      setScanError(`Serial is currently "${matched.status}", not Available`);
      return;
    }
    const matchedModel = localModels?.find(m => String(m.id || m.guid) === String(matched.modelGuid || matched.modelId));
    setScanError("");
    setScanMatchedModel(matchedModel?.name || "Unknown Model");
    setNewSerialToAdd(matched.guid || matched.id);
  };

  return (
    <>
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-3 overflow-y-auto" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4" onClick={(e) => e.stopPropagation()}>

            {/* Modal Header */}
            {(() => {
              const f = selectedBatch.financials || calculateBatchFinancials(selectedBatch.items, returns);
              const selectedBatchOrderValue = selectedBatch.items.reduce((sum, item) => sum + (Number(item.sellingPrice) || 0), 0);
              const selectedBatchEwayBillFilename =
                selectedBatch.ewayBillFilename ||
                selectedBatch.items.find((item) => item.ewayBillFilename)?.ewayBillFilename ||
                null;
              const isEwayBillRequired = selectedBatchOrderValue > 50000;
              const shouldShowEwayBillDocument = isEwayBillRequired || !!selectedBatchEwayBillFilename;
              let representativeItemModal = selectedBatch.activeItems?.find(i => String(i.status).trim() !== "Completed") || selectedBatch.activeItems?.[0] || selectedBatch.items[0];
              let rawStatusModal = representativeItemModal.status;
              let modalDisplayStatus = resolveDisplayStatus(rawStatusModal);
              const processingPhasesModal = ["Pending", "Order Confirmed", "Order Not Confirmed", "Send for Billing", "Billing", "Order Cancelled", "Returned", "Completed", "Draft"];
              if (!processingPhasesModal.includes(rawStatusModal) && !processingPhasesModal.includes(modalDisplayStatus) && representativeItemModal.logisticsStatus) {
                modalDisplayStatus = representativeItemModal.logisticsStatus;
              }
              if (f.returnedCount > 0 && (!selectedBatch.activeItems || selectedBatch.activeItems.length === 0)) {
                modalDisplayStatus = "Returned";
              } else if (f.returnedCount > 0 && activeTab === "returned") {
                modalDisplayStatus = "Partially Returned";
              }

              const isCancelledOrder = selectedBatch.isCancelled;
              const isOnHoldOrder = !!selectedBatch.isHold;
              const isRestoreEligibleInModal = activeTab === "cancelled" && isCancelledOrder;
              const isRestoringSelectedBatch = restoringBatchKey === (selectedBatch.batchKey || String(selectedBatch.id));
              const batchReturnHistory = returns
                .filter((record) => selectedBatch.items.some((item) => 
                  (record.dispatchId && record.dispatchId === item.id) || 
                  (record.serialNumberId && item.serialNumberId && record.serialNumberId === item.serialNumberId)
                ))
                .sort((a, b) => new Date(b.returnDate || 0) - new Date(a.returnDate || 0));

              // Custom/"Additional" doc types have no single authoritative
              // filename column (unlike gemContract/invoice/ewayBill/pod) —
              // every upload, including a "replace", just appends a new row
              // to orderdocuments. Pick the newest upload per docType as
              // current so a replace overwrites rather than duplicating.
              const STANDARD_DOC_TYPES = ["invoice", "ewayBill", "pod", "gemContract"];
              const customDocsInAudit = (selectedBatch.documents || []).filter(d => !STANDARD_DOC_TYPES.includes(d.docType));
              const latestCustomDocByType = new Map();
              customDocsInAudit.forEach(d => {
                const existing = latestCustomDocByType.get(d.docType);
                if (!existing || new Date(d.createdAt || 0) >= new Date(existing.createdAt || 0)) {
                  latestCustomDocByType.set(d.docType, d);
                }
              });

              // Auto-fetch the model for an Edit-mode serial input once a full value lands (scanner Enter / blur)
              const fetchModelForEditRow = (rowIdx, scannedValue) => {
                if (!scannedValue) return;
                const matched = localSerials.find(s => normalizeSerial(s.value || s.serialNumber) === normalizeSerial(scannedValue));
                const u = [...editItems];
                if (matched) {
                  const matchedModel = localModels?.find(m => String(m.id || m.guid) === String(matched.modelGuid || matched.modelId));
                  u[rowIdx] = { ...u[rowIdx], modelName: matchedModel?.name || "Unknown" };
                } else {
                  u[rowIdx] = { ...u[rowIdx], modelName: "Not Found" };
                }
                setEditItems(u);
              };

              return (
                <>
                  <div className={`p-4 rounded-t-2xl ${isEditMode
                      ? "bg-gradient-to-r from-amber-600 to-orange-700"
                      : isCancelledOrder
                        ? "bg-gradient-to-r from-red-700 to-red-900"
                        : isOnHoldOrder
                          ? "bg-gradient-to-r from-yellow-600 to-amber-700"
                          : selectedBatch.status === "Completed"
                            ? "bg-gradient-to-r from-emerald-800 to-teal-900"
                            : "bg-gradient-to-r from-slate-800 to-indigo-900"
                    }`}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          {isEditMode ? <Edit3 className="text-white" size={18} /> :
                            isCancelledOrder ? <Ban className="text-white" size={18} /> :
                              isOnHoldOrder ? <PauseCircle className="text-white" size={18} /> :
                                <Package className="text-white" size={18} />}
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-white flex items-center gap-2">
                            {isEditMode ? "Edit Order" :
                              isCancelledOrder ? "Cancelled Order" :
                                "Order Details"}
                            {selectedBatch.items.length > 1 && <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">{selectedBatch.displayItems.length} of {selectedBatch.items.length} Items</span>}
                          </h2>
                          <p className="text-white/70 text-xs flex items-center gap-1.5 mt-0.5">
                            <Calendar size={10} />
                            {safeFormatDate(selectedBatch.dispatchDate) || "N/A"}
                            {selectedBatch.bidNumber && <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">BID: {selectedBatch.bidNumber}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!isEditMode && isRestoreEligibleInModal && (
                          <button
                            onClick={() => handleRestoreBatch(selectedBatch, true)}
                            disabled={!isAdmin || isRestoringSelectedBatch}
                            className={`p-1.5 rounded-lg flex items-center gap-1 text-xs ${isAdmin
                                ? "text-white/80 hover:text-white hover:bg-white/10"
                                : "text-white/40 cursor-not-allowed"
                              } disabled:opacity-60 disabled:cursor-not-allowed`}
                            title={isAdmin ? "Restore cancelled order" : "Admin only"}
                          >
                            {isRestoringSelectedBatch ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                            <span className="hidden sm:inline">{isRestoringSelectedBatch ? "Restoring" : "Restore"}</span>
                          </button>
                        )}
                        {!isEditMode && canEditOrder && selectedBatch.status !== "Completed" && !isCancelledOrder && (
                          <button onClick={() => setIsEditMode(true)} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg flex items-center gap-1 text-xs">
                            <Edit3 size={13} />
                            <span className="hidden sm:inline">Edit</span>
                          </button>
                        )}
                        {!isEditMode && (selectedBatch.firmName === "GeM" || selectedBatch.platform === "GeM") && (
                          <button
                            onClick={openEmailCompose}
                            title="Send warranty email"
                            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg flex items-center gap-1 text-xs"
                          >
                            <Mail size={13} />
                            <span className="hidden sm:inline">Email</span>
                          </button>
                        )}
                        <button onClick={closeModal} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg">
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <StatusBadge status={modalDisplayStatus} size="default" />
                      {f.returnedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-200 border border-red-400/30">
                          <RotateCcw size={9} />
                          {f.returnedCount} Returned
                        </span>
                      ) : null}
                      {f.replacedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                          <RefreshCw size={9} />
                          {f.replacedCount} Replaced
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Modal Body */}
                  <div className="p-4 space-y-3 max-h-[72vh] overflow-y-auto">
                    {isEditMode ? (
                      <div className="space-y-4">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <h3 className="text-xs font-bold text-amber-700 mb-3 flex items-center gap-1.5">
                            <Edit3 size={13} /> Edit Order Details
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-semibold text-slate-600 block mb-1">Order ID</label>
                              <input className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                                value={editFormData.customerName}
                                onChange={(e) => setEditFormData({ ...editFormData, customerName: e.target.value })}
                              />
                            </div>
                            {selectedBatch.firmName !== "Amazon" && selectedBatch.firmName !== "Flipkart" && (
                              <>
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-600 block mb-1">Contact Number</label>
                                  <input className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                                    value={editFormData.contactNumber}
                                    onChange={(e) => setEditFormData({ ...editFormData, contactNumber: e.target.value })}
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="text-[10px] font-semibold text-slate-600 block mb-1">Shipping Address</label>
                                  <textarea className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                                    rows="2"
                                    value={editFormData.shippingAddress}
                                    onChange={(e) => setEditFormData({ ...editFormData, shippingAddress: e.target.value })}
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="text-[10px] font-semibold text-slate-600 block mb-1">Buy To Address</label>
                                  <textarea className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                                    rows="2"
                                    value={editFormData.buyerAddress}
                                    onChange={(e) => setEditFormData({ ...editFormData, buyerAddress: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-600 block mb-1">Alt Contact Number</label>
                                  <input className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                                    value={editFormData.altContactNumber}
                                    onChange={(e) => setEditFormData({ ...editFormData, altContactNumber: e.target.value })}
                                  />
                                </div>
                              </>
                            )}
                            {selectedBatch.firmName === "GeM" && (
                              <>
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-600 block mb-1">Consignee Name</label>
                                  <input className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                                    value={editFormData.consigneeName}
                                    onChange={(e) => setEditFormData({ ...editFormData, consigneeName: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-600 block mb-1">Consignee Email</label>
                                  <input type="email" className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                                    value={editFormData.consigneeEmail}
                                    onChange={(e) => setEditFormData({ ...editFormData, consigneeEmail: e.target.value })}
                                  />
                                </div>
                              </>
                            )}
                            {selectedBatch.firmName !== "Amazon" && selectedBatch.firmName !== "Flipkart" && (
                              <div>
                                <label className="text-[10px] font-semibold text-slate-600 block mb-1">Warranty</label>
                                <input className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                                  value={editFormData.warranty}
                                  onChange={(e) => setEditFormData({ ...editFormData, warranty: e.target.value })}
                                />
                              </div>
                            )}
                            <div>
                              <label className="text-[10px] font-semibold text-slate-600 block mb-1">Invoice Number</label>
                              <input className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                                value={editFormData.invoiceNumber}
                                onChange={(e) => setEditFormData({ ...editFormData, invoiceNumber: e.target.value })}
                              />
                            </div>
                            {selectedBatch.firmName === "GeM" && (
                              <>
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-600 block mb-1">Buyer Email</label>
                                  <input type="email"
                                    className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                                    value={editFormData.buyerEmail}
                                    onChange={(e) => setEditFormData({ ...editFormData, buyerEmail: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-600 block mb-1">Payment Authority Email</label>
                                  <input type="email"
                                    className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                                    value={editFormData.paymentAuthorityEmail}
                                    onChange={(e) => setEditFormData({ ...editFormData, paymentAuthorityEmail: e.target.value })}
                                  />
                                </div>
                              </>
                            )}
                            <div>
                              <label className="text-[10px] font-semibold text-slate-600 block mb-1">GST Number</label>
                              <input
                                className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                                value={editFormData.gstNumber}
                                onChange={(e) => setEditFormData({ ...editFormData, gstNumber: e.target.value })}
                              />
                            </div>
                          </div>

                          {(selectedBatch.firmName === "Amazon" || selectedBatch.firmName === "Flipkart") && (
                            <div className={`mt-3 p-3 rounded-lg border ${selectedBatch.firmName === "Amazon" ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
                              <h4 className={`text-[10px] font-bold mb-2 flex items-center gap-1 ${selectedBatch.firmName === "Amazon" ? "text-amber-700" : "text-blue-700"}`}>
                                <Building size={12} /> {selectedBatch.firmName} Order Details
                              </h4>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className={`text-[10px] font-semibold block mb-1 ${selectedBatch.firmName === "Amazon" ? "text-amber-700" : "text-blue-700"}`}>Order Date</label>
                                  <input type="date"
                                    className={`w-full border bg-white p-2 rounded-lg text-xs outline-none focus:ring-2 ${selectedBatch.firmName === "Amazon" ? "border-amber-200 focus:ring-amber-500" : "border-blue-200 focus:ring-blue-500"}`}
                                    value={editFormData.orderDate}
                                    onChange={(e) => setEditFormData({ ...editFormData, orderDate: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className={`text-[10px] font-semibold block mb-1 ${selectedBatch.firmName === "Amazon" ? "text-amber-700" : "text-blue-700"}`}>Last Delivery Date</label>
                                  <input type="date"
                                    className={`w-full border bg-white p-2 rounded-lg text-xs outline-none focus:ring-2 ${selectedBatch.firmName === "Amazon" ? "border-amber-200 focus:ring-amber-500" : "border-blue-200 focus:ring-blue-500"}`}
                                    value={editFormData.lastDeliveryDate}
                                    onChange={(e) => setEditFormData({ ...editFormData, lastDeliveryDate: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="mt-2">
                                <label className={`text-[10px] font-semibold block mb-1 flex items-center gap-1 ${selectedBatch.firmName === "Amazon" ? "text-amber-700" : "text-blue-700"}`}>
                                  <UploadCloud size={10} /> Upload / Replace Invoice
                                </label>
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                                  className={`w-full text-xs border bg-white p-1.5 rounded-lg file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:font-semibold file:text-[10px] ${selectedBatch.firmName === "Amazon" ? "border-amber-200 file:bg-amber-100 file:text-amber-700" : "border-blue-200 file:bg-blue-100 file:text-blue-700"}`}
                                  onChange={(e) => setInvoiceFile(e.target.files[0] || null)}
                                />
                                {selectedBatch.invoiceFilename && (
                                  <p className={`text-[10px] mt-1 ${selectedBatch.firmName === "Amazon" ? "text-amber-600" : "text-blue-600"}`}>Current: {selectedBatch.invoiceFilename}</p>
                                )}
                              </div>
                            </div>
                          )}

                          {selectedBatch.firmName === "GeM" && (
                            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                              <h4 className="text-[10px] font-bold text-orange-700 mb-2 flex items-center gap-1">
                                <Building size={12} /> GeM Order Details
                              </h4>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] font-semibold text-orange-700 block mb-1">Bid Number</label>
                                  <input className="w-full border border-orange-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 outline-none"
                                    value={editFormData.bidNumber}
                                    onChange={(e) => setEditFormData({ ...editFormData, bidNumber: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-orange-700 block mb-1">Order Type</label>
                                  <input className="w-full border border-orange-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 outline-none"
                                    value={editFormData.gemOrderType}
                                    onChange={(e) => setEditFormData({ ...editFormData, gemOrderType: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-orange-700 block mb-1">Order Date</label>
                                  <input type="date" className="w-full border border-orange-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 outline-none"
                                    value={editFormData.orderDate}
                                    onChange={(e) => setEditFormData({ ...editFormData, orderDate: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-orange-700 block mb-1">Last Delivery</label>
                                  <input type="date" className="w-full border border-orange-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 outline-none"
                                    value={editFormData.lastDeliveryDate}
                                    onChange={(e) => setEditFormData({ ...editFormData, lastDeliveryDate: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="mt-2">
                                <label className="text-[10px] font-semibold text-orange-700 block mb-1 flex items-center gap-1">
                                  <UploadCloud size={10} /> Upload / Replace Contract
                                </label>
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx"
                                  className="w-full text-xs border border-orange-200 bg-white p-1.5 rounded-lg file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:bg-orange-100 file:text-orange-700 file:font-semibold file:text-[10px]"
                                  onChange={(e) => setContractFile(e.target.files[0] || null)}
                                />
                                {selectedBatch.contractFilename && <p className="text-[10px] text-orange-600 mt-1">Current: {selectedBatch.contractFilename}</p>}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <Hash size={13} /> Edit Items & Serials
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{editItems.length} items</span>
                              {(isAdmin || isSupervisor) && !isCancelledOrder && (
                                <button
                                  onClick={() => setIsAddingSerial(v => !v)}
                                  className="text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 transition-colors"
                                  title="Add Serial to Order"
                                >
                                  <Plus size={9} /> Add Serial
                                </button>
                              )}
                            </div>
                          </div>
                          {isAddingSerial && (
                            <div className="bg-emerald-50/60 border-b border-emerald-200 px-3 py-2.5 flex flex-wrap items-start gap-2">
                              <div className="flex-1 min-w-[200px]">
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Scan or type serial no. to add"
                                  className="w-full border border-slate-300 rounded-md p-1.5 text-[11px] font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                                  value={serialScanInput}
                                  onChange={(e) => {
                                    setSerialScanInput(e.target.value);
                                    tryMatchSerialForAdd(e.target.value, { showErrorIfMissing: false });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      tryMatchSerialForAdd(e.target.value, { showErrorIfMissing: true });
                                    }
                                  }}
                                  onBlur={(e) => tryMatchSerialForAdd(e.target.value, { showErrorIfMissing: true })}
                                />
                                {scanMatchedModel && (
                                  <p className="text-[10px] text-emerald-700 font-bold mt-0.5">✓ Model: {scanMatchedModel}</p>
                                )}
                                {scanError && (
                                  <p className="text-[10px] text-red-600 font-bold mt-0.5">{scanError}</p>
                                )}
                              </div>
                              <span className="text-[10px] font-bold text-slate-400 self-center">OR</span>
                              <select
                                className="flex-1 min-w-[160px] border border-slate-300 rounded-md p-1.5 text-[11px] outline-none focus:ring-2 focus:ring-emerald-500"
                                value={newSerialToAdd}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNewSerialToAdd(val);
                                  const matched = localSerials.find(s => String(s.guid || s.id) === val);
                                  if (matched) {
                                    setSerialScanInput(matched.value || matched.serialNumber || "");
                                    const matchedModel = localModels?.find(m => String(m.id || m.guid) === String(matched.modelGuid || matched.modelId));
                                    setScanMatchedModel(matchedModel?.name || "Unknown Model");
                                    setScanError("");
                                  } else {
                                    setSerialScanInput("");
                                    setScanMatchedModel("");
                                  }
                                }}
                              >
                                <option value="">Select Serial to Add...</option>
                                {localSerials
                                  .filter(s => (s.status || "").trim().toLowerCase() === "available")
                                  .map(s => {
                                    const model = localModels?.find(m => String(m.id || m.guid) === String(s.modelGuid || s.modelId));
                                    return (
                                      <option key={s.id || s.guid} value={s.guid || s.id}>
                                        {(s.value || s.serialNumber)} {model?.name ? `— ${model.name}` : ""}
                                      </option>
                                    );
                                  })}
                              </select>
                              <input
                                type="number"
                                placeholder="Selling Price"
                                className="w-28 border border-slate-300 rounded-md p-1.5 text-[11px] outline-none focus:ring-2 focus:ring-emerald-500"
                                value={newItemSellingPrice}
                                onChange={e => setNewItemSellingPrice(e.target.value)}
                              />
                              <button
                                onClick={handleAddSerial}
                                disabled={isUpdating || !newSerialToAdd}
                                className="text-emerald-600 hover:text-emerald-700 bg-white hover:bg-emerald-100 p-1.5 rounded-md border border-emerald-200 transition-colors disabled:opacity-50"
                                title="Save"
                              >
                                {isUpdating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                              </button>
                              <button
                                onClick={() => { setIsAddingSerial(false); setNewSerialToAdd(""); setNewItemSellingPrice(""); }}
                                className="text-red-600 hover:text-red-700 bg-white hover:bg-red-100 p-1.5 rounded-md border border-red-200 transition-colors"
                                title="Cancel"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          )}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase">#</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase">Model</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase">Serial Number</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase text-right">Price (₹)</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {editItems.map((item, idx) => (
                                  <tr key={idx}>
                                    <td className="px-3 py-2 text-slate-400 font-bold">{idx + 1}</td>
                                    <td className={`px-3 py-2 font-medium ${item.modelName === "Not Found" ? "text-red-500" : "text-slate-700"}`}>{item.modelName || "Unknown"}</td>
                                    <td className="px-3 py-2">
                                      <input
                                        className="w-full border border-slate-200 bg-slate-50 p-1.5 rounded text-xs font-mono focus:ring-2 focus:ring-amber-400 outline-none"
                                        placeholder="Scan or type serial no."
                                        value={item.serialValue || ""}
                                        onChange={(e) => {
                                          const u = [...editItems];
                                          u[idx] = { ...u[idx], serialValue: e.target.value };
                                          setEditItems(u);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            fetchModelForEditRow(idx, e.target.value);
                                          }
                                        }}
                                        onBlur={(e) => fetchModelForEditRow(idx, e.target.value)}
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        className="w-full border border-slate-200 bg-slate-50 p-1.5 rounded text-xs text-right font-mono focus:ring-2 focus:ring-amber-400 outline-none"
                                        value={item.sellingPrice || 0}
                                        onChange={(e) => {
                                          const u = [...editItems];
                                          u[idx] = { ...u[idx], sellingPrice: e.target.value };
                                          setEditItems(u);
                                        }}
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {(isAdmin || currentUser?.allow_edit_dispatch) && (
                                        <button
                                          onClick={() => handleRemoveSerial(item.guid || item.id, item.serialValue)}
                                          className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                                          title="Remove Serial from Order"
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            onClick={() => { setIsEditMode(false); setContractFile(null); setInvoiceFile(null); }}
                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-semibold text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdits}
                            disabled={isUpdating || uploadingContract || uploadingInvoice}
                            className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isUpdating || uploadingContract || uploadingInvoice ? <><Loader2 size={13} className="animate-spin" /> Saving...</> : <><Save size={13} /> Save Changes</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <StatusTimeline currentStatus={modalDisplayStatus} />

                        {/* Cancellation Reason Alert for Cancelled Orders */}
                        {isCancelledOrder && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-start gap-2.5">
                              <div className="p-1.5 bg-red-100 rounded-lg flex-shrink-0 mt-0.5">
                                <Ban size={14} className="text-red-600" />
                              </div>
                              <div className="flex-1">
                                <h4 className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                                  Order Cancelled
                                </h4>
                                <p className="text-xs text-red-600 mt-1">
                                  <span className="font-medium">Reason: </span>
                                  {selectedBatch.cancellationReason || selectedBatch.items[0]?.cancellationReason || selectedBatch.items[0]?.reason || "No reason provided"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* On Hold Alert */}
                        {isOnHoldOrder && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <div className="flex items-start gap-2.5">
                              <div className="p-1.5 bg-yellow-100 rounded-lg flex-shrink-0 mt-0.5">
                                <PauseCircle size={14} className="text-yellow-600" />
                              </div>
                              <div className="flex-1">
                                <h4 className="text-xs font-bold text-yellow-700 flex items-center gap-1.5">
                                  Order On Hold
                                </h4>
                                {(selectedBatch.holdReason) && (
                                  <p className="text-xs text-yellow-600 mt-1">
                                    <span className="font-medium">Reason: </span>
                                    {selectedBatch.holdReason}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {(() => {
                          if (f.returnedCount === 0) return null;
                          return (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <div className="flex items-start gap-2.5">
                                <div className="p-1.5 bg-red-100 rounded-lg flex-shrink-0 mt-0.5">
                                  <RotateCcw size={14} className="text-red-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                                    Return Alert — {f.returnedCount} of {f.totalCount} item{f.returnedCount > 1 ? "s" : ""} returned
                                  </h4>
                                  <div className="flex items-center gap-4 mt-1.5">
                                    <div className="text-[10px] text-red-600">
                                      <span className="font-medium">Returned Value:</span>{" "}
                                      <span className="font-bold">₹{f.returnedValue.toLocaleString()}</span>
                                    </div>
                                    <div className="text-[10px] text-emerald-700">
                                      <span className="font-medium">Net Billing:</span>{" "}
                                      <span className="font-bold">₹{f.netValue.toLocaleString()}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 line-through">
                                      Original: ₹{f.totalValue.toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* ── MODAL TABS ── */}
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-fit">
                          {[
                            { id: "details", label: "Details", Icon: ClipboardList },
                            { id: "documents", label: "Documents", Icon: FileText },
                            { id: "actions", label: "Actions", Icon: Zap },
                          ].map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => setModalDetailTab(tab.id)}
                              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${modalDetailTab === tab.id
                                ? "bg-white text-indigo-600 shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                              }`}
                            >
                              <tab.Icon size={14} /> {tab.label}
                            </button>
                          ))}
                        </div>

                        {/* ── DETAILS TAB ── */}
                        {modalDetailTab === "details" && <div className="space-y-3">

                        {/* Payment Info (Completed orders) */}
                        {selectedBatch.status === "Completed" && (() => {
                          const totalPaidAmount = selectedBatch.items.reduce((sum, item) => sum + Number(item.paymentReceivedAmount || 0), 0);
                          const fallbackAmount = selectedBatch.items.reduce((s, i) => s + Number(i.sellingPrice || 0), 0);
                          const displayAmount = totalPaidAmount > 0 ? totalPaidAmount : fallbackAmount;
                          return (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                                  <CheckSquare size={13} /> Payment Information
                                </h3>
                                {!isEditingPayment && canEditPayment && (
                                  <button
                                    onClick={() => {
                                      const defaultDate = selectedBatch.paymentReceivedDate
                                        ? toLocalDateStr(selectedBatch.paymentReceivedDate)
                                        : toLocalDateStr(new Date());
                                      setPaymentEditForm({ paymentDate: defaultDate, amount: displayAmount, utrId: selectedBatch.utrId || "" });
                                      setIsEditingPayment(true);
                                    }}
                                    className="px-2 py-1 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition"
                                  >
                                    Edit Payment
                                  </button>
                                )}
                              </div>
                              {isEditingPayment ? (
                                <div className="space-y-2 mt-2 border-t border-emerald-200 pt-2">
                                  <div>
                                    <label className="text-[10px] font-semibold text-emerald-700 block mb-1">Payment Date</label>
                                    <input type="date" className="w-full border border-emerald-200 p-1.5 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-500" value={paymentEditForm.paymentDate} onChange={e => setPaymentEditForm({ ...paymentEditForm, paymentDate: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-semibold text-emerald-700 block mb-1">Total Amount (₹)</label>
                                    <input type="number" className="w-full border border-emerald-200 p-1.5 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-500" value={paymentEditForm.amount} onChange={e => setPaymentEditForm({ ...paymentEditForm, amount: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-semibold text-emerald-700 block mb-1">UTR ID</label>
                                    <input type="text" className="w-full border border-emerald-200 p-1.5 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-500 font-mono uppercase" value={paymentEditForm.utrId} onChange={e => setPaymentEditForm({ ...paymentEditForm, utrId: e.target.value })} />
                                  </div>
                                  <div className="flex justify-end gap-2 pt-2">
                                    <button onClick={() => setIsEditingPayment(false)} className="px-3 py-1.5 bg-white border border-emerald-200 rounded text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Cancel</button>
                                    <button onClick={handleSavePaymentEdit} disabled={isUpdating} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                                      {isUpdating ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {[
                                    { label: "Date Received", value: safeFormatDate(selectedBatch.paymentReceivedDate) || "—" },
                                    { label: "Total Amount", value: `₹${displayAmount.toLocaleString('en-IN')}` },
                                    { label: "UTR ID", value: selectedBatch.utrId || "N/A", mono: true },
                                  ].map((item, i) => (
                                    <div key={i} className={`flex justify-between ${i < 2 ? "border-b border-emerald-200 pb-1.5" : ""}`}>
                                      <span className="text-[10px] text-emerald-600 font-medium">{item.label}</span>
                                      <span className={`text-xs font-bold text-emerald-800 ${item.mono ? "font-mono uppercase" : ""}`}>{item.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Shipment Details */}
                        {(() => {
                          const isMarketplace = selectedBatch.firmName === "Amazon" || selectedBatch.firmName === "Flipkart";
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                              <h3 className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                                <User size={13} /> Shipment Details
                              </h3>
                              <div className={!isMarketplace ? "grid gap-2 grid-cols-2" : "grid gap-2 grid-cols-2 sm:grid-cols-3"}>
                                {[
                                  { label: "Platform", value: selectedBatch.firmName || "N/A" },
                                  { label: "Order ID", value: selectedBatch.customerName || "N/A" },
                                  { label: "Shipping Address", value: selectedBatch.shippingAddress || "N/A", break: true, fullWidth: true },
                                  { label: "Buy To Address", value: selectedBatch.buyerAddress || "N/A", break: true, fullWidth: true },
                                  { label: "Order Date", value: safeFormatDate(selectedBatch.orderDate) || "—" },
                                  { label: "Last Delivery", value: safeFormatDate(selectedBatch.lastDeliveryDate) || "—" },
                                  ...(selectedBatch.invoiceNumber ? [{ label: "Invoice No.", value: selectedBatch.invoiceNumber }] : []),
                                  ...(selectedBatch.invoiceDate ? [{ label: "Invoice Date", value: safeFormatDate(selectedBatch.invoiceDate) || selectedBatch.invoiceDate }] : []),
                                  { label: "Warranty", value: selectedBatch.warranty || "N/A" },
                                  ...(selectedBatch.warrantyStartDate ? [{ label: "Warranty Start Date", value: safeFormatDate(selectedBatch.warrantyStartDate) }] : []),
                                  ...(currentUser?.role === "Admin" ? [
                                    { label: "Dispatched By", value: selectedBatch.dispatchedBy || "Unknown" },
                                    ...(isCancelledOrder ? [{ label: "Cancelled By", value: selectedBatch.cancelledBy || "Unknown" }] : [])
                                  ] : [])
                                ].map((item, i) => (
                                  <div key={i} className={`bg-slate-50 rounded p-2 ${item.fullWidth ? "col-span-full" : ""}`}>
                                    <span className="text-[10px] text-slate-500 font-medium">{item.label}</span>
                                    <p className={`text-xs font-semibold text-slate-800 break-words ${item.break ? "whitespace-pre-wrap" : ""}`}>{item.value}</p>
                                  </div>
                                ))}
                                <PincodeCheckWidget address={selectedBatch.shippingAddress || selectedBatch.buyerAddress} />
                              </div>
                              {(() => {
                                if (!selectedBatch.warrantyStartDate || !selectedBatch.invoiceDate) return null;
                                const invD = new Date(selectedBatch.invoiceDate);
                                const startD = new Date(selectedBatch.warrantyStartDate);
                                if (isNaN(invD) || isNaN(startD) || invD <= startD) return null;
                                return (
                                  <div className="mt-2 flex items-center gap-1.5 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs font-bold text-amber-800">
                                    <AlertCircle size={13} className="flex-shrink-0" />
                                    Warranty Update  — Invoice date ({safeFormatDate(selectedBatch.invoiceDate)}) is after Warranty Start Date ({safeFormatDate(selectedBatch.warrantyStartDate)})
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}

                        {/* GeM Details */}
                        {selectedBatch.firmName === "GeM" && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                            <h3 className="text-xs font-bold text-orange-700 mb-2 flex items-center gap-1.5">
                              <Building size={13} /> GeM Details
                            </h3>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                              {[
                                { label: "Bid No", value: selectedBatch.bidNumber },
                                { label: "Order Type", value: selectedBatch.gemOrderType },
                                { label: "GST", value: selectedBatch.gstNumber },
                                { label: "Contact", value: selectedBatch.contactNumber },
                                { label: "Buyer Email", value: selectedBatch.buyerEmail, small: true },
                                { label: "Payment Auth Email", value: selectedBatch.paymentAuthorityEmail, small: true },
                                { label: "Consignee Name", value: selectedBatch.consigneeName },
                                { label: "Consignee Email", value: selectedBatch.consigneeEmail, small: true },
                                { label: "Order Date", value: safeFormatDate(selectedBatch.orderDate) || "—" },
                                { label: "Last Delivery", value: safeFormatDate(selectedBatch.lastDeliveryDate) || "—" },
                              ].map((item, i) => (
                                <div key={i} className="flex justify-between text-xs">
                                  <span className="text-orange-600">{item.label}</span>
                                  <span className={`font-bold text-slate-800 ${item.small ? "text-[10px]" : ""}`}>{item.value || "N/A"}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Contact */}
                        {(selectedBatch.contactNumber || selectedBatch.buyerEmail) && selectedBatch.firmName !== "GeM" && (
                          <div className="bg-white border border-slate-200 rounded-lg p-3">
                            <h3 className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                              <Phone size={13} /> Contact
                            </h3>
                            <div className="space-y-1.5">
                              {selectedBatch.contactNumber && (
                                <div className="flex items-center gap-1.5 bg-slate-50 rounded p-2">
                                  <Phone size={11} className="text-slate-400" />
                                  <span className="text-xs font-medium text-slate-700">{selectedBatch.contactNumber}</span>
                                </div>
                              )}
                              {selectedBatch.buyerEmail && (
                                <div className="flex items-center gap-1.5 bg-slate-50 rounded p-2">
                                  <span className="text-xs font-medium text-slate-700">{selectedBatch.buyerEmail}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Installation Toggle */}
                        {!isCancelledOrder && (
                          <div className={`flex items-center justify-between p-3 rounded-lg border ${isInstallationRequired(selectedBatch.installationRequired) ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-200"}`}>
                            <div className="flex items-center gap-2.5">
                              <div className={`p-2 rounded-lg ${isInstallationRequired(selectedBatch.installationRequired) ? "bg-indigo-100 text-indigo-600" : "bg-slate-200 text-slate-500"}`}>
                                <Wrench size={16} />
                              </div>
                              <div>
                                <div className="font-bold text-slate-700 text-xs">Installation Required?</div>
                                <div className="text-[10px] text-slate-500">
                                  {isInstallationRequired(selectedBatch.installationRequired)
                                    ? "Yes — Will appear in Installation tab"
                                    : "No — Default. Toggle to enable"}
                                </div>
                              </div>
                            </div>
                            <div className="flex bg-white rounded-md border border-slate-300 p-0.5">
                              <button
                                onClick={() => handleToggleInstallation(false)}
                                disabled={isUpdating}
                                className={`px-3 py-1 rounded text-[10px] font-bold transition ${!isInstallationRequired(selectedBatch.installationRequired) ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                              >No</button>
                              <button
                                onClick={() => handleToggleInstallation(true)}
                                disabled={isUpdating}
                                className={`px-3 py-1 rounded text-[10px] font-bold transition ${isInstallationRequired(selectedBatch.installationRequired) ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                              >Yes</button>
                            </div>
                          </div>
                        )}

                        {/* Order Items */}
                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <Box size={13} /> Order Items
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">Showing {selectedBatch.displayItems?.length || 0} of {f.totalCount} Items</span>
                              {f.activeCount > 0 && f.returnedCount > 0 && (
                                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100">{f.activeCount} Active</span>
                              )}
                              {f.returnedCount > 0 && (
                                <span className="text-[10px] font-bold bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 flex items-center gap-0.5">
                                  <RotateCcw size={8} />{f.returnedCount} Returned
                                </span>
                              )}
                              {f.replacedCount > 0 && (
                                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 flex items-center gap-0.5">
                                  <RefreshCw size={8} />{f.replacedCount} Replaced
                                </span>
                              )}
                              {(() => {
                                const hpSerials = (selectedBatch.displayItems || [])
                                  .map(item => getItemSerial(item))
                                  .filter(s => s && s !== "N/A");
                                if (hpSerials.length < 2) return null;
                                return (
                                  <button
                                    onClick={() => {
                                      hpSerials.forEach((serial, i) => {
                                        setTimeout(() => {
                                          openHpWarrantyBridge(serial);
                                        }, i * 500);
                                      });
                                    }}
                                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded transition-colors cursor-pointer"
                                    title={`Check HP Warranty for all ${hpSerials.length} serial numbers`}
                                  >
                                    <ExternalLink size={9} /> Check All HP ({hpSerials.length})
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-white border-b border-slate-100">
                                <tr>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase">#</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase">Model</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase">Serial No.</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase text-center">Status</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase text-right">Value</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {selectedBatch.displayItems.map((item, idx) => {
                                  const returned = isItemReturned(item, returns);
                                  const replaced = isItemReplaced(item);
                                  const oldSerial = getOldSerial(item);
                                  const itemSerial = getItemSerial(item);
                                  const isReplacing = replacingItemId === (item.guid || item.id);

                                  const currentSerialId = item.serialGuid || item.serialId;
                                  const currentSerialObj = localSerials.find(s => s.id === currentSerialId);
                                  const targetModelId = item.modelId || item.modelGuid || currentSerialObj?.modelId || currentSerialObj?.modelGuid;

                                  const availableSerialsForModel = localSerials.filter(s =>
                                    String(s.modelId || s.modelGuid) === String(targetModelId) &&
                                    (s.status || "").trim().toLowerCase() === "available"
                                  );

                                  return (
                                    <tr key={idx} className={returned ? "bg-red-50" : replaced ? "bg-indigo-50/30" : isOnHoldOrder ? "bg-yellow-50/50" : "hover:bg-slate-50"}>
                                      <td className="px-3 py-2.5 text-slate-400 font-bold text-center">{idx + 1}</td>
                                      <td className="px-3 py-2.5">
                                        <span className={`font-medium ${returned ? "text-red-700" : "text-slate-700"}`}>
                                          {item.modelName || "Unknown"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <span className={`font-mono ${returned ? "text-red-600" : replaced ? "text-indigo-600" : "text-slate-600"}`}>
                                          {itemSerial || "N/A"}
                                        </span>
                                        {itemSerial && itemSerial !== "N/A" && (
                                          <button
                                            onClick={() => openHpWarrantyBridge(itemSerial)}
                                            className="mt-0.5 flex items-center gap-0.5 w-fit text-[9px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                            title={`Check HP Warranty for ${itemSerial}`}
                                          >
                                            <ExternalLink size={8} /> HP Warranty
                                          </button>
                                        )}
                                        {replaced && (
                                          <div className="text-[9px] text-indigo-500 font-bold mt-0.5 bg-indigo-50 px-1 py-0.5 rounded w-fit border border-indigo-100">
                                            Replaced old: {oldSerial}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        {isReplacing ? (
                                          <div className="flex items-center justify-center gap-1.5">
                                            <select
                                              className="w-[130px] border border-slate-300 rounded-md p-1.5 text-[10px] outline-none focus:ring-2 focus:ring-indigo-500"
                                              value={replaceWithSerialId}
                                              onChange={e => setReplaceWithSerialId(e.target.value)}
                                            >
                                              <option value="">Select Serial...</option>
                                              {availableSerialsForModel.map(s => <option key={s.id} value={s.guid || s.id}>{s.value || s.serialNumber}</option>)}
                                            </select>
                                            <button onClick={() => handleReplaceSerial(item.guid || item.id, replaceWithSerialId, itemSerial)} className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-md border border-emerald-200 transition-colors" title="Save"><Check size={12} /></button>
                                            <button onClick={() => { setReplacingItemId(null); setReplaceWithSerialId(""); }} className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-md border border-red-200 transition-colors" title="Cancel"><X size={12} /></button>
                                          </div>
                                        ) : returned ? (
                                          <div className="flex items-center justify-center gap-2">
                                            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-[10px] font-bold border border-red-200"><RotateCcw size={9} />RETURNED</span>
                                            {(isAdmin || isSupervisor) && (
                                              <button onClick={() => setReplacingItemId(item.guid || item.id)} className="text-[10px] text-indigo-600 font-bold hover:bg-indigo-100 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100 transition-colors" title="Replace Serial"><RefreshCw size={10} /> Replace</button>
                                            )}
                                          </div>
                                        ) : replaced ? (
                                          <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-[10px] font-bold border border-indigo-200">
                                            <RefreshCw size={9} /> REPLACED
                                          </span>
                                        ) : isCancelledOrder ? (
                                          <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-[10px] font-bold border border-red-100">
                                            <Ban size={9} />CANCELLED
                                          </span>
                                        ) : (
                                          <div className="flex items-center justify-center gap-2">
                                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-[10px] font-bold border border-emerald-100">
                                              <Check size={9} />ACTIVE
                                            </span>
                                          </div>
                                        )}
                                      </td>
                                      <td className={`px-3 py-2.5 text-right font-bold ${returned || isCancelledOrder ? "text-red-400 line-through" : "text-slate-700"}`}>
                                        ₹{Number(item.sellingPrice || 0).toLocaleString()}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-slate-50 border-t border-slate-200">
                                  <td colSpan="4" className="px-3 py-2 text-right text-slate-500 font-medium text-[10px] uppercase">
                                    Total Batch Value ({f.totalCount} items)
                                  </td>
                                  <td className={`px-3 py-2 text-right font-bold text-xs ${isCancelledOrder ? "text-red-400 line-through" : "text-slate-800"}`}>
                                    ₹{f.totalValue.toLocaleString()}
                                  </td>
                                </tr>
                                {f.returnedValue > 0 && !isCancelledOrder && activeTab === "active" && (
                                  <tr className="bg-red-50 border-t border-red-100">
                                    <td colSpan="4" className="px-3 py-2 text-right text-red-600 font-medium text-[10px] uppercase flex items-center justify-end gap-1">
                                      <RotateCcw size={9} /> Less: Returns ({f.returnedCount} item{f.returnedCount > 1 ? "s" : ""})
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold text-red-600 text-xs">
                                      -₹{f.returnedValue.toLocaleString()}
                                    </td>
                                  </tr>
                                )}
                                {!isCancelledOrder && (
                                  <tr className={`border-t-2 ${(f.returnedCount > 0 && activeTab === "active") ? "bg-amber-50 border-amber-200" : isOnHoldOrder ? "bg-yellow-50 border-yellow-200" : "bg-indigo-50 border-indigo-200"}`}>
                                    <td colSpan="4" className={`px-3 py-2.5 text-right font-bold uppercase text-[10px] ${(f.returnedCount > 0 && activeTab === "active") ? "text-amber-700" : isOnHoldOrder ? "text-yellow-700" : "text-indigo-700"}`}>
                                      {(f.returnedCount > 0 && activeTab === "active") ? "Net Billing Value (After Returns)" : isOnHoldOrder ? "Pending Value (On Hold)" : "Final Billing Value"}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right font-bold text-sm ${(f.returnedCount > 0 && activeTab === "active") ? "text-amber-700" : isOnHoldOrder ? "text-yellow-700" : "text-indigo-700"}`}>
                                      ₹{f.netValue.toLocaleString()}
                                    </td>
                                  </tr>
                                )}
                                {isCancelledOrder && (
                                  <tr className="border-t-2 bg-red-50 border-red-200">
                                    <td colSpan="4" className="px-3 py-2.5 text-right font-bold uppercase text-[10px] text-red-700">
                                      Order Cancelled — No Billing
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-bold text-sm text-red-700">₹0</td>
                                  </tr>
                                )}
                              </tfoot>
                            </table>
                          </div>
                        </div>

                        {/* Return History */}
                        {batchReturnHistory.length > 0 && (activeTab === "active" || activeTab === "returned") && (
                          <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden">
                            <div className="bg-red-100/60 px-3 py-2 border-b border-red-200 flex items-center justify-between">
                              <h3 className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                                <RotateCcw size={13} /> Return History
                              </h3>
                              <span className="text-[10px] font-bold bg-white text-red-700 px-2 py-0.5 rounded border border-red-200">
                                {batchReturnHistory.length} record{batchReturnHistory.length > 1 ? "s" : ""}
                              </span>
                            </div>
                            <div className="p-3 space-y-2">
                              {batchReturnHistory.map((record) => (
                                <div key={record.id} className="bg-white border border-red-100 rounded-lg p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
                                  <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Serial</p>
                                    <p className="font-mono text-xs font-bold text-slate-700">{record.serialValue || getReturnSerial(record) || "N/A"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Condition</p>
                                    <p className="text-xs font-semibold text-red-700">{record.condition || "Returned"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Reason</p>
                                    <p className="text-xs font-medium text-slate-700 break-words">{record.reason || "No reason recorded"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Invoice</p>
                                    <p className="text-xs font-medium text-slate-700">{record.invoiceNumber || "N/A"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Returned On</p>
                                    <p className="text-xs font-medium text-slate-700">
                                      {record.returnDate ? format(new Date(record.returnDate), "dd MMM yyyy, hh:mm a") : "N/A"}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Serial Replacements */}
                        {selectedBatch.items.some(isItemReplaced) && (
                          <div className="bg-indigo-50 border border-indigo-200 rounded-lg overflow-hidden">
                            <div className="bg-indigo-100/50 px-3 py-2 border-b border-indigo-200 flex items-center justify-between">
                              <h3 className="text-xs font-bold text-indigo-800 flex items-center gap-1.5">
                                <RefreshCw size={13} /> Serial Replacements
                              </h3>
                            </div>
                            <div className="p-3 space-y-2">
                              {selectedBatch.items.filter(isItemReplaced).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-white border border-indigo-100 p-2.5 rounded-lg shadow-sm">
                                  <div className="flex items-center gap-4">
                                    <div className="text-center">
                                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Old Serial (Returned)</p>
                                      <p className="font-mono text-xs font-bold text-red-500 line-through bg-red-50 px-2 py-0.5 rounded border border-red-100">{getOldSerial(item)}</p>
                                    </div>
                                    <div className="text-indigo-300 font-bold text-lg">➔</div>
                                    <div className="text-center">
                                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">New Serial (Active)</p>
                                      <p className="font-mono text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">{getItemSerial(item)}</p>
                                    </div>
                                  </div>
                                  <div className="hidden sm:block text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200">
                                    Replaced Successfully
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        </div>}

                        {/* ── DOCUMENTS TAB ── */}
                        {modalDetailTab === "documents" && <div className="space-y-3">

                        {/* Audit Documents */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-3 flex items-center gap-2">
                            <FileText size={14} className="text-white/70" />
                            <h3 className="text-xs font-black text-white uppercase tracking-widest">Audit Documents</h3>
                          </div>
                          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {(() => {
                              const isMarketplace = selectedBatch.firmName === "Amazon" || selectedBatch.firmName === "Flipkart";
                              const selectedBatchChallanFilename =
                                (selectedBatch.documents || []).find((d) => d.docType === "challan")?.filename || null;
                              const gatePassAction = (
                                <button onClick={downloadGatepass} disabled={gatepassLoading} className="w-full text-xs font-bold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 active:scale-95">
                                  {gatepassLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} Download
                                </button>
                              );
                              if (isMarketplace) {
                                return (
                                  <>
                                    <DocCard
                                      label="Tax Invoice (Custom)"
                                      filename={selectedBatch.invoiceFilename}
                                      onView={() => handleViewDocument(selectedBatch.invoiceFilename)}
                                      onReplace={(f) => handleReplaceStandardDoc("invoice", f)}
                                      canReplace={canEditOrder && !isCancelledOrder}
                                      accentBg="bg-indigo-50" accentText="text-indigo-600" buttonClass="bg-indigo-600 hover:bg-indigo-700"
                                    />
                                    <DocCard
                                      label="Optional Doc / Challan"
                                      filename={selectedBatchEwayBillFilename}
                                      onView={() => handleViewDocument(selectedBatchEwayBillFilename)}
                                      onReplace={(f) => handleReplaceStandardDoc("ewayBill", f)}
                                      canReplace={canEditOrder && !isCancelledOrder}
                                      accentBg="bg-amber-50" accentText="text-amber-600" buttonClass="bg-amber-600 hover:bg-amber-700"
                                    />
                                    <DocCard label="Gate Pass" accentBg="bg-teal-50" accentText="text-teal-600" action={gatePassAction} />
                                  </>
                                );
                              }
                              return (
                                <>
                                  <DocCard
                                    label="GeM Contract"
                                    filename={selectedBatch.contractFilename}
                                    onView={() => handleViewDocument(selectedBatch.contractFilename)}
                                    onReplace={(f) => handleReplaceStandardDoc("gemContract", f)}
                                    canReplace={canEditOrder && !isCancelledOrder}
                                    accentBg="bg-indigo-50" accentText="text-indigo-600" buttonClass="bg-indigo-600 hover:bg-indigo-700"
                                  />
                                  <DocCard
                                    label="Invoice"
                                    filename={selectedBatch.invoiceFilename}
                                    onView={() => handleViewDocument(selectedBatch.invoiceFilename)}
                                    onReplace={(f) => handleReplaceStandardDoc("invoice", f)}
                                    canReplace={canEditOrder && !isCancelledOrder}
                                    accentBg="bg-indigo-50" accentText="text-indigo-600" buttonClass="bg-indigo-600 hover:bg-indigo-700"
                                  />
                                  <DocCard
                                    label="Challan"
                                    filename={selectedBatchChallanFilename}
                                    onView={() => handleViewDocument(selectedBatchChallanFilename)}
                                    onReplace={(f) => handleReplaceExtraDoc(selectedBatchChallanFilename, "challan", f)}
                                    canReplace={canEditOrder && !isCancelledOrder}
                                    accentBg="bg-amber-50" accentText="text-amber-600" buttonClass="bg-amber-600 hover:bg-amber-700"
                                  />
                                  {shouldShowEwayBillDocument && (
                                    <DocCard
                                      label={isEwayBillRequired ? "E-Way Bill (Required)" : "E-Way Bill"}
                                      filename={selectedBatchEwayBillFilename}
                                      onView={() => handleViewDocument(selectedBatchEwayBillFilename)}
                                      onReplace={(f) => handleReplaceStandardDoc("ewayBill", f)}
                                      canReplace={canEditOrder && !isCancelledOrder}
                                      accentBg="bg-amber-50" accentText="text-amber-600" buttonClass="bg-amber-600 hover:bg-amber-700"
                                    />
                                  )}
                                  <DocCard
                                    label="POD"
                                    filename={selectedBatch.podFilename}
                                    onView={() => handleViewDocument(selectedBatch.podFilename)}
                                    onReplace={(f) => handleReplaceStandardDoc("pod", f)}
                                    canReplace={canEditOrder && !isCancelledOrder}
                                    accentBg="bg-emerald-50" accentText="text-emerald-600" buttonClass="bg-emerald-600 hover:bg-emerald-700"
                                  />
                                  <DocCard label="Gate Pass" accentBg="bg-teal-50" accentText="text-teal-600" action={gatePassAction} />
                                </>
                              );
                            })()}
                          </div>
                          {/* Additional / Custom Docs shown inside Audit section */}
                          {(() => {
                            const extraDocsInAudit = Array.from(latestCustomDocByType.values());
                            if (extraDocsInAudit.length === 0) return null;
                            return (
                              <div className="px-4 pb-4">
                                <h4 className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2 pt-3 border-t border-slate-100 flex items-center gap-1.5">
                                  <FileText size={11} /> Additional Documents
                                </h4>
                                <div className="space-y-1.5">
                                  {extraDocsInAudit.map((doc, idx) => (
                                    <div key={idx} className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3.5 py-2.5 rounded-xl transition-colors">
                                      <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                        <FileText size={13} />
                                      </div>
                                      <span className="text-xs text-slate-700 font-semibold flex-1 truncate">{doc.docType}</span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          onClick={() => handleViewDocument(doc.filename)}
                                          className="text-[11px] font-bold text-indigo-600 hover:text-white hover:bg-indigo-600 px-2.5 py-1.5 rounded-lg transition-colors"
                                        >
                                          View
                                        </button>
                                        {canEditOrder && !isCancelledOrder && (
                                          <>
                                            <label className="cursor-pointer p-1.5 rounded-lg hover:bg-blue-100 transition-colors" title="Replace document">
                                              <RefreshCw size={13} className="text-blue-500" />
                                              <input
                                                type="file"
                                                className="hidden"
                                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                                                onChange={e => {
                                                  const f = e.target.files[0];
                                                  if (f) handleReplaceExtraDoc(doc.filename, doc.docType, f);
                                                  e.target.value = "";
                                                }}
                                              />
                                            </label>
                                            <button
                                              onClick={() => handleDeleteExtraDoc(doc.filename, doc.docType)}
                                              className="p-1.5 rounded-lg hover:bg-red-100 transition-colors"
                                              title="Delete document"
                                            >
                                              <Trash2 size={13} className="text-red-500" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Additional Documents (GeM & Other only) */}
                        {(() => {
                          const isMarketplaceOrder = selectedBatch.firmName === "Amazon" || selectedBatch.firmName === "Flipkart";
                          if (isMarketplaceOrder) return null;
                          const STANDARD_TYPES = ["invoice", "ewayBill", "pod", "gemContract"];
                          // const extraDocs = (selectedBatch.documents || []).filter(d => !STANDARD_TYPES.includes(d.docType));
                          if (!canEditOrder || isCancelledOrder) return null;
                          return (
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                              <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-3">
                                <h3 className="text-xs font-black text-white flex items-center gap-2">
                                  <UploadCloud size={14} /> Upload Additional Document
                                </h3>
                              </div>
                              <div className="p-3 space-y-2.5">
                                <input
                                  type="text"
                                  placeholder="Enter document name (e.g. Inspection Certificate)"
                                  value={extraDocType}
                                  onChange={e => setExtraDocType(e.target.value)}
                                  className="w-full text-xs border border-violet-200 bg-white rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-violet-400 outline-none font-medium text-slate-700 placeholder-slate-300"
                                />
                                <div className="flex items-center gap-2">
                                  <label className="flex-1 cursor-pointer">
                                    <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 transition-colors ${extraDocFile ? "border-violet-400 bg-violet-100" : "border-violet-200 bg-white hover:bg-violet-50"}`}>
                                      <UploadCloud size={14} className={extraDocFile ? "text-violet-600" : "text-slate-400"} />
                                      <span className={`text-xs font-medium truncate ${extraDocFile ? "text-violet-700" : "text-slate-400"}`}>
                                        {extraDocFile ? extraDocFile.name : "Choose file (PDF, DOC, JPG, PNG)"}
                                      </span>
                                    </div>
                                    <input
                                      ref={extraDocInputRef}
                                      type="file"
                                      className="hidden"
                                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                                      onChange={e => setExtraDocFile(e.target.files[0] || null)}
                                    />
                                  </label>
                                  {extraDocFile && (
                                    <button onClick={() => { setExtraDocFile(null); if (extraDocInputRef.current) extraDocInputRef.current.value = ""; }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>
                                <button
                                  onClick={handleUploadExtraDoc}
                                  disabled={!extraDocFile || uploadingExtraDoc || !extraDocType.trim()}
                                  className="w-full flex items-center justify-center gap-2 text-xs font-black bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md shadow-violet-200"
                                >
                                  {uploadingExtraDoc ? <><Loader2 size={13} className="animate-spin" /> Uploading...</> : <><UploadCloud size={13} /> Upload Document</>}
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        </div>}

                        {/* ── ACTIONS TAB ── */}
                        {modalDetailTab === "actions" && <div className="space-y-3">

                        {/* ── WARRANTY CALCULATION PANEL ── */}
                        {(() => {
                          const batchWarrantyStr = selectedBatch.warranty || "";
                          const items = selectedBatch.displayItems || [];
                          const displayWarrantyStr = batchWarrantyStr || items[0]?.warranty || "";

                          const getItemYears = (item) => {
                            const str = item.warranty || batchWarrantyStr || "";
                            const m = str.match(/^(\d+)/);
                            return m ? parseInt(m[1]) : null;
                          };

                          const addYears = (dateStr, y) => {
                            if (!dateStr || !y) return null;
                            const d = new Date(dateStr);
                            if (isNaN(d)) return null;
                            d.setFullYear(d.getFullYear() + y);
                            return d;
                          };

                          const invD = selectedBatch.invoiceDate ? new Date(selectedBatch.invoiceDate) : null;

                          return (
                            <div className="border border-amber-200 rounded-lg overflow-hidden">
                              {/* Header */}
                              <div className="bg-amber-50 px-3 py-2 flex items-center justify-between border-b border-amber-200">
                                <h3 className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                                  <AlertCircle size={13} /> Warranty Calculation
                                </h3>
                                <div className="flex items-center gap-2">
                                  {selectedBatch.invoiceDate && (
                                    <span className="text-[10px] text-amber-600 flex items-center gap-1">
                                      <Calendar size={9} />
                                      Invoice: <span className="font-bold ml-0.5">{safeFormatDate(selectedBatch.invoiceDate)}</span>
                                    </span>
                                  )}
                                  {displayWarrantyStr && (
                                    <span className="bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      {displayWarrantyStr}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Per-serial table */}
                              <div className="bg-white">
                                {/* Column headers */}
                                <div className="bg-amber-50/80 px-3 py-1.5 grid grid-cols-[1fr_130px_90px_40px] gap-2 items-center border-b border-amber-100">
                                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">Serial No.</span>
                                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">Warranty Start</span>
                                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">Expiry</span>
                                  <span />
                                </div>

                                {/* Apply-all row (only when 2+ items) */}
                                {items.length > 1 && (
                                  <div className="bg-amber-50/50 border-b border-amber-100 px-3 py-2 grid grid-cols-[1fr_130px_90px_40px] gap-2 items-center">
                                    <label htmlFor="bulk-w" className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        id="bulk-w"
                                        className="accent-amber-600 w-3.5 h-3.5 cursor-pointer flex-shrink-0"
                                        checked={bulkWarrantyDate !== null}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            const firstDate = Object.values(itemWarrantyDates).find(d => d) || "";
                                            setBulkWarrantyDate(firstDate);
                                            if (firstDate) {
                                              const updated = {};
                                              items.forEach(it => { updated[it.guid || it.id] = firstDate; });
                                              setItemWarrantyDates(prev => ({ ...prev, ...updated }));
                                            }
                                          } else {
                                            setBulkWarrantyDate(null);
                                          }
                                        }}
                                      />
                                      <span className="text-[10px] font-bold text-amber-700 whitespace-nowrap">Apply same date to all</span>
                                    </label>
                                    {bulkWarrantyDate !== null ? (
                                      <input
                                        type="date"
                                        className="w-full border border-amber-300 bg-white p-1 rounded text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                                        value={bulkWarrantyDate || ""}
                                        onChange={(e) => {
                                          const d = e.target.value;
                                          setBulkWarrantyDate(d);
                                          const updated = {};
                                          items.forEach(it => { updated[it.guid || it.id] = d; });
                                          setItemWarrantyDates(prev => ({ ...prev, ...updated }));
                                        }}
                                      />
                                    ) : <span />}
                                    {bulkWarrantyDate !== null ? (
                                      <span className="text-[10px] text-slate-400 italic">all items</span>
                                    ) : <span />}
                                    {bulkWarrantyDate !== null ? (
                                      <button
                                        onClick={async () => {
                                          if (!bulkWarrantyDate) return;
                                          for (const it of items) {
                                            const k = it.guid || it.id;
                                            await handleSaveOneItemWarranty(k, bulkWarrantyDate);
                                          }
                                        }}
                                        disabled={!bulkWarrantyDate || savingWarrantyItemId !== null}
                                        title="Save all"
                                        className="flex items-center justify-center bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white w-8 h-8 rounded text-[10px] font-bold transition flex-shrink-0"
                                      >
                                        {savingWarrantyItemId !== null ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                      </button>
                                    ) : <span />}
                                  </div>
                                )}

                                {/* Per-serial rows */}
                                {items.map((item, idx) => {
                                  const key = item.guid || item.id;
                                  const serial = getItemSerial(item) || "N/A";
                                  const dateVal = itemWarrantyDates[key] || "";
                                  const itemYears = getItemYears(item);
                                  const expiry = addYears(dateVal, itemYears);
                                  const startD = dateVal ? new Date(dateVal) : null;
                                  const inconsistent = invD && startD && !isNaN(invD) && !isNaN(startD) && invD > startD;
                                  const ok = invD && startD && !isNaN(invD) && !isNaN(startD) && invD <= startD;
                                  const isSaving = savingWarrantyItemId === key;

                                  return (
                                    <div key={key} className={`px-3 py-2 grid grid-cols-[1fr_130px_90px_40px] gap-2 items-center border-b border-slate-50 last:border-b-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                      {/* Serial */}
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inconsistent ? "bg-red-400" : ok ? "bg-emerald-400" : "bg-slate-300"}`} />
                                        <span className="font-mono text-[11px] font-bold text-slate-700 truncate">{serial}</span>
                                      </div>
                                      {/* Date input */}
                                      <input
                                        type="date"
                                        className="w-full border border-slate-200 bg-white p-1 rounded text-xs focus:ring-1 focus:ring-amber-400 outline-none"
                                        value={dateVal}
                                        onChange={(e) => setItemWarrantyDates(prev => ({ ...prev, [key]: e.target.value }))}
                                      />
                                      {/* Expiry */}
                                      <span className={`text-[11px] font-semibold ${inconsistent ? "text-red-500" : ok ? "text-emerald-600" : dateVal ? "text-slate-500" : "text-slate-300"}`}>
                                        {expiry ? safeFormatDate(expiry) : dateVal && !itemYears ? <span className="text-[10px] text-slate-400 italic">set warranty</span> : "—"}
                                      </span>
                                      {/* Save */}
                                      <button
                                        onClick={() => handleSaveOneItemWarranty(key, dateVal)}
                                        disabled={isSaving || !dateVal}
                                        title="Save"
                                        className="flex items-center justify-center bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white w-8 h-8 rounded text-[10px] font-bold transition flex-shrink-0"
                                      >
                                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                      </button>
                                      {warrantyItemErrors[key] && (
                                        <p className="col-span-4 text-[10px] text-red-600 -mt-1">{warrantyItemErrors[key]}</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Upload on GeM Toggle */}
                        {selectedBatch.firmName === "GeM" && (
                          <div className={`flex items-center justify-between p-3 rounded-lg border ${selectedBatch.gemBillUploaded === "Yes" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                            <div className="flex items-center gap-2.5">
                              <div className={`p-2 rounded-lg ${selectedBatch.gemBillUploaded === "Yes" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
                                <UploadCloud size={16} />
                              </div>
                              <div>
                                <div className="font-bold text-slate-700 text-xs">Upload on GeM?</div>
                                <div className="text-[10px] text-slate-500">
                                  {selectedBatch.gemBillUploaded === "Yes"
                                    ? "Yes — Bill uploaded on GeM portal"
                                    : "No — Bill not yet uploaded on GeM portal"}
                                </div>
                              </div>
                            </div>
                            <div className="flex bg-white rounded-md border border-slate-300 p-0.5">
                              <button
                                onClick={() => handleToggleGemUpload(false)}
                                disabled={isUpdating}
                                className={`px-3 py-1 rounded text-[10px] font-bold transition ${selectedBatch.gemBillUploaded !== "Yes" ? "bg-red-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                              >No</button>
                              <button
                                onClick={() => handleToggleGemUpload(true)}
                                disabled={isUpdating}
                                className={`px-3 py-1 rounded text-[10px] font-bold transition ${selectedBatch.gemBillUploaded === "Yes" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                              >Yes</button>
                            </div>
                          </div>
                        )}

                        {/* Update Status */}
                        {selectedBatch.status !== "Completed" && !isCancelledOrder ? (
                          <div className={`border rounded-lg p-3 ${isOnHoldOrder ? "bg-yellow-50 border-yellow-200" : "bg-indigo-50 border-indigo-200"}`}>
                            <h3 className={`text-xs font-bold mb-3 flex items-center gap-1.5 ${isOnHoldOrder ? "text-yellow-700" : "text-indigo-700"}`}>
                              <Truck size={13} /> Update Status
                            </h3>
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] font-semibold text-slate-600 block mb-1">New Status</label>
                                <select
                                  className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                  value={newStatus}
                                  onChange={(e) => setNewStatus(e.target.value)}
                                >
                                  {UPDATE_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                              </div>
                              {newStatus === "Order Cancelled" && (
                                <div>
                                  <label className="text-[10px] font-semibold text-red-600 block mb-1 flex items-center gap-1">
                                    <AlertCircle size={10} /> Cancellation Reason <span className="text-red-500">*</span>
                                  </label>
                                  <textarea
                                    className="w-full border border-red-200 bg-red-50 p-2 rounded-lg text-xs focus:ring-2 focus:ring-red-500 outline-none resize-none"
                                    placeholder="Why is this order being cancelled?"
                                    rows="2"
                                    value={cancellationReason}
                                    onChange={(e) => setCancellationReason(e.target.value)}
                                  />
                                </div>
                              )}
                              <div>
                                <label className="text-[10px] font-semibold text-slate-600 block mb-1">Tracking ID</label>
                                <input
                                  className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                  placeholder="e.g. DTDC12345"
                                  value={trackingId}
                                  onChange={(e) => setTrackingId(e.target.value)}
                                />
                              </div>
                              <button
                                onClick={handleUpdateStatus}
                                disabled={isUpdating}
                                className={`w-full text-white py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50 ${newStatus === "Order Cancelled" ? "bg-red-600 hover:bg-red-700" : newStatus === "Order Confirmed" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
                              >
                                {isUpdating ? (
                                  <><Loader2 size={13} className="animate-spin" /> Updating...</>
                                ) : (
                                  <>
                                    {newStatus === "Order Cancelled" ? <Ban size={13} /> : newStatus === "Order Confirmed" ? <CheckCircle size={13} /> : <Save size={13} />}
                                    {newStatus === "Order Cancelled" ? "Confirm Cancellation" : newStatus === "Order Confirmed" ? "Confirm Order" : "Update Status"}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-400">
                            <CheckSquare size={32} className="mx-auto mb-2 opacity-30" />
                            <p className="text-xs font-semibold">
                              {isCancelledOrder ? "This order is cancelled — no status updates available." : "Order is completed — no further status changes needed."}
                            </p>
                          </div>
                        )}

                        </div>}

                        {/* ─ legacy content below is hidden; all content moved to tabs above ─ */}
                        <div style={{display:"none"}} aria-hidden="true">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-3">
                            {selectedBatch.status !== "Completed" && !isCancelledOrder && (
                              <div className={`border rounded-lg p-3 ${isOnHoldOrder ? "bg-yellow-50 border-yellow-200" : "bg-indigo-50 border-indigo-200"}`}>
                                <h3 className={`text-xs font-bold mb-3 flex items-center gap-1.5 ${isOnHoldOrder ? "text-yellow-700" : "text-indigo-700"}`}>
                                  <Truck size={13} /> Update Status
                                </h3>
                                <div className="space-y-2">
                                  <div>
                                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">New Status</label>
                                    <select
                                      className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                      value={newStatus}
                                      onChange={(e) => setNewStatus(e.target.value)}
                                    >
                                      {UPDATE_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                  </div>

                                  {newStatus === "Order Cancelled" && (
                                    <div>
                                      <label className="text-[10px] font-semibold text-red-600 block mb-1 flex items-center gap-1">
                                        <AlertCircle size={10} /> Cancellation Reason <span className="text-red-500">*</span>
                                      </label>
                                      <textarea
                                        className="w-full border border-red-200 bg-red-50 p-2 rounded-lg text-xs focus:ring-2 focus:ring-red-500 outline-none resize-none"
                                        placeholder="Why is this order being cancelled?"
                                        rows="2"
                                        value={cancellationReason}
                                        onChange={(e) => setCancellationReason(e.target.value)}
                                      />
                                    </div>
                                  )}

                                  <div>
                                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">Tracking ID</label>
                                    <input
                                      className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                      placeholder="e.g. DTDC12345"
                                      value={trackingId}
                                      onChange={(e) => setTrackingId(e.target.value)}
                                    />
                                  </div>

                                  <button
                                    onClick={handleUpdateStatus}
                                    disabled={isUpdating}
                                    className={`w-full text-white py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50 ${newStatus === "Order Cancelled"
                                        ? "bg-red-600 hover:bg-red-700"
                                        : newStatus === "Order Confirmed"
                                          ? "bg-emerald-600 hover:bg-emerald-700"
                                          : "bg-indigo-600 hover:bg-indigo-700"
                                      }`}
                                  >
                                    {isUpdating ? (
                                      <><Loader2 size={13} className="animate-spin" /> Updating...</>
                                    ) : (
                                      <>
                                        {newStatus === "Order Cancelled" ? <Ban size={13} /> :
                                          newStatus === "Order Confirmed" ? <CheckCircle size={13} /> :
                                            <Save size={13} />}
                                        {newStatus === "Order Cancelled" ? "Confirm Cancellation" :
                                          newStatus === "Order Confirmed" ? "Confirm Order" :
                                            "Update Status"}
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {selectedBatch.status === "Completed" && (() => {
                                const totalPaidAmount = selectedBatch.items.reduce((sum, item) => sum + Number(item.paymentReceivedAmount || 0), 0);
                                const fallbackAmount = selectedBatch.items.reduce((s, i) => s + Number(i.sellingPrice || 0), 0);
                                const displayAmount = totalPaidAmount > 0 ? totalPaidAmount : fallbackAmount;

                                return (
                                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 h-fit">
                                    <div className="flex items-center justify-between mb-2">
                                      <h3 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                                        <CheckSquare size={13} /> Payment Information
                                      </h3>
                                      {!isEditingPayment && canEditPayment && (
                                        <button
                                          onClick={() => {
                                            const defaultDate = selectedBatch.paymentReceivedDate
                                              ? toLocalDateStr(selectedBatch.paymentReceivedDate)
                                              : toLocalDateStr(new Date());
                                            setPaymentEditForm({
                                              paymentDate: defaultDate,
                                              amount: displayAmount,
                                              utrId: selectedBatch.utrId || ""
                                            });
                                            setIsEditingPayment(true);
                                          }}
                                          className="px-2 py-1 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition"
                                        >
                                          Edit Payment
                                        </button>
                                      )}
                                    </div>

                                    {isEditingPayment ? (
                                      <div className="space-y-2 mt-2 border-t border-emerald-200 pt-2">
                                        <div>
                                          <label className="text-[10px] font-semibold text-emerald-700 block mb-1">Payment Date</label>
                                          <input type="date" className="w-full border border-emerald-200 p-1.5 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-500" value={paymentEditForm.paymentDate} onChange={e => setPaymentEditForm({ ...paymentEditForm, paymentDate: e.target.value })} />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-semibold text-emerald-700 block mb-1">Total Amount (₹)</label>
                                          <input type="number" className="w-full border border-emerald-200 p-1.5 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-500" value={paymentEditForm.amount} onChange={e => setPaymentEditForm({ ...paymentEditForm, amount: e.target.value })} />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-semibold text-emerald-700 block mb-1">UTR ID</label>
                                          <input type="text" className="w-full border border-emerald-200 p-1.5 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-500 font-mono uppercase" value={paymentEditForm.utrId} onChange={e => setPaymentEditForm({ ...paymentEditForm, utrId: e.target.value })} />
                                        </div>
                                        <div className="flex justify-end gap-2 pt-2">
                                          <button onClick={() => setIsEditingPayment(false)} className="px-3 py-1.5 bg-white border border-emerald-200 rounded text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Cancel</button>
                                          <button onClick={handleSavePaymentEdit} disabled={isUpdating} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                                            {isUpdating ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {[
                                          { label: "Date Received", value: safeFormatDate(selectedBatch.paymentReceivedDate) || "—" },
                                          { label: "Total Amount", value: `₹${displayAmount.toLocaleString('en-IN')}` },
                                          { label: "UTR ID", value: selectedBatch.utrId || "N/A", mono: true },
                                        ].map((item, i) => (
                                          <div key={i} className={`flex justify-between ${i < 2 ? "border-b border-emerald-200 pb-1.5" : ""}`}>
                                            <span className="text-[10px] text-emerald-600 font-medium">{item.label}</span>
                                            <span className={`text-xs font-bold text-emerald-800 ${item.mono ? "font-mono uppercase" : ""}`}>{item.value}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {(() => {
                                const isMarketplace = selectedBatch.firmName === "Amazon" || selectedBatch.firmName === "Flipkart";
                                return (
                                  <div className="bg-white border border-slate-200 rounded-lg p-3 h-fit md:col-span-2">
                                    <h3 className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                                      <User size={13} /> Shipment Details
                                    </h3>
                                    <div className={!isMarketplace ? "grid gap-2 grid-cols-2" : "grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}>
                                      {[
                                        { label: "Platform", value: selectedBatch.firmName || "N/A" },
                                        { label: "Order ID", value: selectedBatch.customerName || "N/A" },
                                        { label: "Shipping Address", value: selectedBatch.shippingAddress || "N/A", break: true, fullWidth: true },
                                        { label: "Buy To Address", value: selectedBatch.buyerAddress || "N/A", break: true, fullWidth: true },
                                        { label: "Order Date", value: safeFormatDate(selectedBatch.orderDate) || "—" },
                                        { label: "Last Delivery", value: safeFormatDate(selectedBatch.lastDeliveryDate) || "—" },
                                        { label: "Warranty", value: selectedBatch.warranty || "N/A" },
                                        ...(selectedBatch.warrantyStartDate ? [{ label: "Warranty Start Date", value: safeFormatDate(selectedBatch.warrantyStartDate) }] : []),
                                        ...(currentUser?.role === "Admin" ? [
                                          { label: "Dispatched By", value: selectedBatch.dispatchedBy || "Unknown" },
                                          ...(isCancelledOrder ? [{ label: "Cancelled By", value: selectedBatch.cancelledBy || "Unknown" }] : [])
                                        ] : [])
                                      ].map((item, i) => (
                                        <div key={i} className={`bg-slate-50 rounded p-2 ${!isMarketplace ? (item.fullWidth ? "col-span-full" : "") : `p-2.5 ${item.fullWidth ? "col-span-full" : ""}`}`}>
                                          <span className="text-[10px] text-slate-500 font-medium">{item.label}</span>
                                          <p className={`text-xs font-semibold text-slate-800 break-words ${item.break ? "whitespace-pre-wrap" : ""} ${item.mono ? "font-mono" : ""}`}>{item.value}</p>
                                        </div>
                                      ))}
                                      <PincodeCheckWidget address={selectedBatch.shippingAddress || selectedBatch.buyerAddress} />
                                    </div>
                                    {(() => {
                                      if (!selectedBatch.warrantyStartDate || !selectedBatch.invoiceDate) return null;
                                      const invD = new Date(selectedBatch.invoiceDate);
                                      const startD = new Date(selectedBatch.warrantyStartDate);
                                      if (isNaN(invD) || isNaN(startD) || invD <= startD) return null;
                                      return (
                                        <div className="mt-2 flex items-center gap-1.5 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs font-bold text-amber-800">
                                          <AlertCircle size={13} className="flex-shrink-0" />
                                          Warranty Update — Invoice date ({safeFormatDate(selectedBatch.invoiceDate)}) is after Warranty Start Date ({safeFormatDate(selectedBatch.warrantyStartDate)})
                                        </div>
                                      );
                                    })()}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-xl">
                              <h3 className="text-xs font-black text-white/60 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <FileText size={14} /> Audit Documents
                              </h3>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {(() => {
                                  const isMarketplace = selectedBatch.firmName === "Amazon" || selectedBatch.firmName === "Flipkart";
                                  
                                  if (isMarketplace) {
                                    return (
                                      <>
                                        {/* Tax Invoice (Mandatory) */}
                                        <DarkDocSlot
                                          label="Tax Invoice (Custom)" filename={selectedBatch.invoiceFilename}
                                          onView={() => handleViewDocument(selectedBatch.invoiceFilename)}
                                          onReplace={(f) => handleReplaceStandardDoc("invoice", f)}
                                          canReplace={canEditOrder && !isCancelledOrder}
                                          viewClass="bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20" viewLabel="View Invoice"
                                        />

                                        {/* Optional Invoice / Challan */}
                                        <DarkDocSlot
                                          label="Optional Doc / Challan" filename={selectedBatchEwayBillFilename}
                                          onView={() => handleViewDocument(selectedBatchEwayBillFilename)}
                                          onReplace={(f) => handleReplaceStandardDoc("ewayBill", f)}
                                          canReplace={canEditOrder && !isCancelledOrder}
                                          viewClass="bg-amber-600 hover:bg-amber-500 shadow-amber-900/20" viewLabel="View Document"
                                        />
                                      </>
                                    );
                                  }

                                  return (
                                    <>
                                      {/* GeM Contract */}
                                      <DarkDocSlot
                                        label="GeM Contract" filename={selectedBatch.contractFilename}
                                        onView={() => handleViewDocument(selectedBatch.contractFilename)}
                                        onReplace={(f) => handleReplaceStandardDoc("gemContract", f)}
                                        canReplace={canEditOrder && !isCancelledOrder}
                                        viewClass="bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20" viewLabel="View Contract"
                                      />

                                      {/* Tax Invoice */}
                                      <DarkDocSlot
                                        label="Invoice" filename={selectedBatch.invoiceFilename}
                                        onView={() => handleViewDocument(selectedBatch.invoiceFilename)}
                                        onReplace={(f) => handleReplaceStandardDoc("invoice", f)}
                                        canReplace={canEditOrder && !isCancelledOrder}
                                        viewClass="bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20" viewLabel="View Invoice"
                                      />

                                      {/* E-Way Bill */}
                                      {shouldShowEwayBillDocument && (
                                        <DarkDocSlot
                                          label={isEwayBillRequired ? "E-Way Bill (Req)" : "E-Way Bill"} filename={selectedBatchEwayBillFilename}
                                          onView={() => handleViewDocument(selectedBatchEwayBillFilename)}
                                          onReplace={(f) => handleReplaceStandardDoc("ewayBill", f)}
                                          canReplace={canEditOrder && !isCancelledOrder}
                                          viewClass="bg-amber-600 hover:bg-amber-500 shadow-amber-900/20" viewLabel="View E-Way Bill"
                                        />
                                      )}

                                      {/* Proof of Delivery */}
                                      <DarkDocSlot
                                        label="POD" filename={selectedBatch.podFilename}
                                        onView={() => handleViewDocument(selectedBatch.podFilename)}
                                        onReplace={(f) => handleReplaceStandardDoc("pod", f)}
                                        canReplace={canEditOrder && !isCancelledOrder}
                                        viewClass="bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20" viewLabel="View POD"
                                      />
                                    </>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* ── Additional / Custom Documents (GeM & Other only, not marketplaces) */}
                            {(() => {
                              const isMarketplaceOrder = selectedBatch.firmName === "Amazon" || selectedBatch.firmName === "Flipkart";
                              if (isMarketplaceOrder) return null;
                              const STANDARD_TYPES = ["invoice", "ewayBill", "pod", "gemContract"];
                              const EXTRA_DOC_OPTIONS = [
                                "Inspection Certificate",
                                "Acceptance Certificate",
                                "CAMC Agreement",
                                "Purchase Order Copy",
                                "Warranty Certificate",
                                "Test / QC Report",
                                "Performance Bank Guarantee",
                                "Installation Report",
                                "Other",
                              ];
                              // Custom docs already uploaded (not standard types)
                              const extraDocs = (selectedBatch.documents || []).filter(
                                d => !STANDARD_TYPES.includes(d.docType)
                              );
                              return (
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                  {/* Header */}
                                  <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-3 flex items-center justify-between">
                                    <h3 className="text-xs font-black text-white flex items-center gap-2">
                                      <UploadCloud size={14} /> Additional Documents
                                      {extraDocs.length > 0 && (
                                        <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-black">{extraDocs.length} file{extraDocs.length !== 1 ? "s" : ""}</span>
                                      )}
                                    </h3>
                                    <span className="text-white/50 text-[10px] font-medium">GeM / Custom Docs</span>
                                  </div>

                                  <div className="p-3 space-y-3">
                                    {/* Existing extra docs */}
                                    {extraDocs.length > 0 && (
                                      <div className="space-y-1.5">
                                        {extraDocs.map((doc, idx) => (
                                          <div key={idx} className="flex items-center justify-between bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                                                <FileText size={13} className="text-violet-600" />
                                              </div>
                                              <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-800 truncate">{doc.docType}</p>
                                                <p className="text-[10px] text-slate-400 truncate">{doc.filename}</p>
                                              </div>
                                            </div>
                                            <button
                                              onClick={() => handleViewDocument(doc.filename)}
                                              className="ml-2 flex-shrink-0 flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:text-violet-900 bg-violet-100 hover:bg-violet-200 px-2.5 py-1 rounded-lg transition-colors"
                                            >
                                              <Eye size={11} /> View
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Upload form */}
                                    {canEditOrder && !isCancelledOrder && (
                                      <div className="border border-dashed border-violet-300 bg-violet-50/50 rounded-xl p-3 space-y-2.5">
                                        <p className="text-[10px] font-black text-violet-600 uppercase tracking-wider flex items-center gap-1">
                                          <UploadCloud size={11} /> Upload New Document
                                        </p>

                                        {/* Doc type selector */}
                                        <select
                                          value={extraDocType}
                                          onChange={e => { setExtraDocType(e.target.value); setExtraDocCustomLabel(""); }}
                                          className="w-full text-xs border border-violet-200 bg-white rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-violet-400 outline-none font-medium text-slate-700"
                                        >
                                          {EXTRA_DOC_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                          ))}
                                        </select>

                                        {/* Custom label */}
                                        {extraDocType === "Other" && (
                                          <input
                                            type="text"
                                            placeholder="Enter document name (e.g. CAMC Letter)"
                                            value={extraDocCustomLabel}
                                            onChange={e => setExtraDocCustomLabel(e.target.value)}
                                            className="w-full text-xs border border-violet-200 bg-white rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-violet-400 outline-none font-medium text-slate-700 placeholder-slate-300"
                                          />
                                        )}

                                        {/* File picker */}
                                        <div className="flex items-center gap-2">
                                          <label className="flex-1 cursor-pointer">
                                            <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 transition-colors ${extraDocFile ? "border-violet-400 bg-violet-100" : "border-violet-200 bg-white hover:bg-violet-50"}`}>
                                              <UploadCloud size={14} className={extraDocFile ? "text-violet-600" : "text-slate-400"} />
                                              <span className={`text-xs font-medium truncate ${extraDocFile ? "text-violet-700" : "text-slate-400"}`}>
                                                {extraDocFile ? extraDocFile.name : "Choose file (PDF, DOC, JPG, PNG)"}
                                              </span>
                                            </div>
                                            <input
                                              ref={extraDocInputRef}
                                              type="file"
                                              className="hidden"
                                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                                              onChange={e => setExtraDocFile(e.target.files[0] || null)}
                                            />
                                          </label>
                                          {extraDocFile && (
                                            <button
                                              onClick={() => { setExtraDocFile(null); if (extraDocInputRef.current) extraDocInputRef.current.value = ""; }}
                                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                              <X size={14} />
                                            </button>
                                          )}
                                        </div>

                                        {/* Upload button */}
                                        <button
                                          onClick={handleUploadExtraDoc}
                                          disabled={!extraDocFile || uploadingExtraDoc || !extraDocType.trim()}
                                          className="w-full flex items-center justify-center gap-2 text-xs font-black bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md shadow-violet-200"
                                        >
                                          {uploadingExtraDoc
                                            ? <><Loader2 size={13} className="animate-spin" /> Uploading...</>
                                            : <><UploadCloud size={13} /> Upload Document</>
                                          }
                                        </button>
                                      </div>
                                    )}

                                    {extraDocs.length === 0 && !canEditOrder && (
                                      <p className="text-xs text-slate-400 italic text-center py-3">No additional documents have been uploaded.</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {selectedBatch.firmName === "GeM" && (
                              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                                <h3 className="text-xs font-bold text-orange-700 mb-2 flex items-center gap-1.5">
                                  <Building size={13} /> GeM Details
                                </h3>
                                <div className="space-y-1.5">
                                  {[
                                    { label: "Bid No", value: selectedBatch.bidNumber },
                                    { label: "Order Type", value: selectedBatch.gemOrderType },
                                    { label: "GST", value: selectedBatch.gstNumber },
                                    { label: "Contact", value: selectedBatch.contactNumber },
                                    { label: "Buyer Email", value: selectedBatch.buyerEmail, small: true },
                                    { label: "Payment Auth Email", value: selectedBatch.paymentAuthorityEmail, small: true },
                                    { label: "Consignee Name", value: selectedBatch.consigneeName },
                                    { label: "Consignee Email", value: selectedBatch.consigneeEmail, small: true },
                                    { label: "Order Date", value: safeFormatDate(selectedBatch.orderDate) || "—" },
                                    { label: "Last Delivery", value: safeFormatDate(selectedBatch.lastDeliveryDate) || "—" },
                                  ].map((item, i) => (
                                    <div key={i} className="flex justify-between text-xs">
                                      <span className="text-orange-600">{item.label}</span>
                                      <span className={`font-bold text-slate-800 ${item.small ? "text-[10px]" : ""}`}>{item.value || "N/A"}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(selectedBatch.contactNumber || selectedBatch.buyerEmail) && (
                              <div className="bg-white border border-slate-200 rounded-lg p-3">
                                <h3 className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                                  <Phone size={13} /> Contact
                                </h3>
                                <div className="space-y-1.5">
                                  {selectedBatch.contactNumber && (
                                    <div className="flex items-center gap-1.5 bg-slate-50 rounded p-2">
                                      <Phone size={11} className="text-slate-400" />
                                      <span className="text-xs font-medium text-slate-700">{selectedBatch.contactNumber}</span>
                                    </div>
                                  )}
                                  {selectedBatch.buyerEmail && (
                                    <div className="flex items-center gap-1.5 bg-slate-50 rounded p-2">
                                      <span className="text-xs font-medium text-slate-700">{selectedBatch.buyerEmail}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Installation Toggle - Hide for cancelled orders */}
                        {!isCancelledOrder && (
                          <div className={`flex items-center justify-between p-3 rounded-lg border ${isInstallationRequired(selectedBatch.installationRequired) ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-200"}`}>
                            <div className="flex items-center gap-2.5">
                              <div className={`p-2 rounded-lg ${isInstallationRequired(selectedBatch.installationRequired) ? "bg-indigo-100 text-indigo-600" : "bg-slate-200 text-slate-500"}`}>
                                <Wrench size={16} />
                              </div>
                              <div>
                                <div className="font-bold text-slate-700 text-xs">Installation Required?</div>
                                <div className="text-[10px] text-slate-500">
                                  {isInstallationRequired(selectedBatch.installationRequired)
                                    ? "Yes — Will appear in Installation tab"
                                    : "No — Default. Toggle to enable"}
                                </div>
                              </div>
                            </div>
                            <div className="flex bg-white rounded-md border border-slate-300 p-0.5">
                              <button
                                onClick={() => handleToggleInstallation(false)}
                                disabled={isUpdating}
                                className={`px-3 py-1 rounded text-[10px] font-bold transition ${!isInstallationRequired(selectedBatch.installationRequired)
                                    ? "bg-slate-700 text-white shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                  }`}
                              >
                                No
                              </button>
                              <button
                                onClick={() => handleToggleInstallation(true)}
                                disabled={isUpdating}
                                className={`px-3 py-1 rounded text-[10px] font-bold transition ${isInstallationRequired(selectedBatch.installationRequired)
                                    ? "bg-indigo-600 text-white shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                  }`}
                              >
                                Yes
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <Box size={13} /> Order Items
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">Showing {selectedBatch.displayItems?.length || 0} of {f.totalCount} Items</span>
                              {f.activeCount > 0 && f.returnedCount > 0 && (
                                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100">{f.activeCount} Active</span>
                              )}
                              {f.returnedCount > 0 && (
                                <span className="text-[10px] font-bold bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 flex items-center gap-0.5">
                                  <RotateCcw size={8} />{f.returnedCount} Returned
                                </span>
                              )}
                              {f.replacedCount > 0 && (
                                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 flex items-center gap-0.5">
                                  <RefreshCw size={8} />{f.replacedCount} Replaced
                                </span>
                              )}
                              {(() => {
                                const hpSerials = (selectedBatch.displayItems || [])
                                  .map(item => getItemSerial(item))
                                  .filter(s => s && s !== "N/A");
                                if (hpSerials.length < 2) return null;
                                return (
                                  <button
                                    onClick={() => {
                                      hpSerials.forEach((serial, i) => {
                                        setTimeout(() => {
                                          openHpWarrantyBridge(serial);
                                        }, i * 500);
                                      });
                                    }}
                                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded transition-colors cursor-pointer"
                                    title={`Check HP Warranty for all ${hpSerials.length} serial numbers`}
                                  >
                                    <ExternalLink size={9} /> Check All HP ({hpSerials.length})
                                  </button>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-white border-b border-slate-100">
                                <tr>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase">#</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase">Model</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase">Serial No.</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase text-center">Status</th>
                                  <th className="px-3 py-2 text-[10px] text-slate-500 font-bold uppercase text-right">Value</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {selectedBatch.displayItems.map((item, idx) => {
                                  const returned = isItemReturned(item, returns);
                                  const replaced = isItemReplaced(item);
                                  const oldSerial = getOldSerial(item);
                                  const itemSerial = getItemSerial(item);
                                  const isReplacing = replacingItemId === (item.guid || item.id);

                                  // Safely find the correct modelId for the current item
                                  const currentSerialId = item.serialGuid || item.serialId;
                                  const currentSerialObj = localSerials.find(s => s.id === currentSerialId);
                                  const targetModelId = item.modelId || item.modelGuid || currentSerialObj?.modelId || currentSerialObj?.modelGuid;

                                  const availableSerialsForModel = localSerials.filter(s =>
                                    String(s.modelId || s.modelGuid) === String(targetModelId) &&
                                    (s.status || "").trim().toLowerCase() === "available"
                                  );

                                  return (
                                    <tr key={idx} className={returned ? "bg-red-50" : replaced ? "bg-indigo-50/30" : isOnHoldOrder ? "bg-yellow-50/50" : "hover:bg-slate-50"}>
                                      <td className="px-3 py-2.5 text-slate-400 font-bold text-center">{idx + 1}</td>
                                      <td className="px-3 py-2.5">
                                        <span className={`font-medium ${returned ? "text-red-700" : "text-slate-700"}`}>
                                          {item.modelName || "Unknown"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <span className={`font-mono ${returned ? "text-red-600" : replaced ? "text-indigo-600" : "text-slate-600"}`}>
                                          {itemSerial || "N/A"}
                                        </span>
                                        {itemSerial && itemSerial !== "N/A" && (
                                          <button
                                            onClick={() => openHpWarrantyBridge(itemSerial)}
                                            className="mt-0.5 flex items-center gap-0.5 w-fit text-[9px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                            title={`Check HP Warranty for ${itemSerial}`}
                                          >
                                            <ExternalLink size={8} /> HP Warranty
                                          </button>
                                        )}
                                        {replaced && (
                                          <div className="text-[9px] text-indigo-500 font-bold mt-0.5 bg-indigo-50 px-1 py-0.5 rounded w-fit border border-indigo-100">
                                            Replaced old: {oldSerial}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        {isReplacing ? (
                                          <div className="flex items-center justify-center gap-1.5">
                                            <select
                                              className="w-[130px] border border-slate-300 rounded-md p-1.5 text-[10px] outline-none focus:ring-2 focus:ring-indigo-500"
                                              value={replaceWithSerialId}
                                              onChange={e => setReplaceWithSerialId(e.target.value)}
                                            >
                                              <option value="">Select Serial...</option>
                                              {availableSerialsForModel.map(s => <option key={s.id} value={s.guid || s.id}>{s.value || s.serialNumber}</option>)}
                                            </select>
                                            <button onClick={() => handleReplaceSerial(item.guid || item.id, replaceWithSerialId, itemSerial)} className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-md border border-emerald-200 transition-colors" title="Save"><Check size={12} /></button>
                                            <button onClick={() => { setReplacingItemId(null); setReplaceWithSerialId(""); }} className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-md border border-red-200 transition-colors" title="Cancel"><X size={12} /></button>
                                          </div>
                                        ) : returned ? (
                                          <div className="flex items-center justify-center gap-2">
                                            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-[10px] font-bold border border-red-200"><RotateCcw size={9} />RETURNED</span>
                                            {(isAdmin || isSupervisor) && (
                                              <button onClick={() => setReplacingItemId(item.guid || item.id)} className="text-[10px] text-indigo-600 font-bold hover:bg-indigo-100 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100 transition-colors" title="Replace Serial"><RefreshCw size={10} /> Replace</button>
                                            )}
                                          </div>
                                        ) : replaced ? (
                                          <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-[10px] font-bold border border-indigo-200">
                                            <RefreshCw size={9} /> REPLACED
                                          </span>
                                        ) : isCancelledOrder ? (
                                          <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-[10px] font-bold border border-red-100">
                                            <Ban size={9} />CANCELLED
                                          </span>
                                        ) : (
                                          <div className="flex items-center justify-center gap-2">
                                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-[10px] font-bold border border-emerald-100">
                                              <Check size={9} />ACTIVE
                                            </span>
                                          </div>
                                        )}
                                      </td>
                                      <td className={`px-3 py-2.5 text-right font-bold ${returned || isCancelledOrder ? "text-red-400 line-through" : "text-slate-700"}`}>
                                        ₹{Number(item.sellingPrice || 0).toLocaleString()}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-slate-50 border-t border-slate-200">
                                  <td colSpan="4" className="px-3 py-2 text-right text-slate-500 font-medium text-[10px] uppercase">
                                    Total Batch Value ({f.totalCount} items)
                                  </td>
                                  <td className={`px-3 py-2 text-right font-bold text-xs ${isCancelledOrder ? "text-red-400 line-through" : "text-slate-800"}`}>
                                    ₹{f.totalValue.toLocaleString()}
                                  </td>
                                </tr>

                                {f.returnedValue > 0 && !isCancelledOrder && activeTab === "active" && (
                                  <tr className="bg-red-50 border-t border-red-100">
                                    <td colSpan="4" className="px-3 py-2 text-right text-red-600 font-medium text-[10px] uppercase flex items-center justify-end gap-1">
                                      <RotateCcw size={9} /> Less: Returns ({f.returnedCount} item{f.returnedCount > 1 ? "s" : ""})
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold text-red-600 text-xs">
                                      -₹{f.returnedValue.toLocaleString()}
                                    </td>
                                  </tr>
                                )}

                                {!isCancelledOrder && (
                                  <tr className={`border-t-2 ${(f.returnedCount > 0 && activeTab === "active") ? "bg-amber-50 border-amber-200" :
                                      isOnHoldOrder ? "bg-yellow-50 border-yellow-200" :
                                        "bg-indigo-50 border-indigo-200"
                                    }`}>
                                    <td colSpan="4" className={`px-3 py-2.5 text-right font-bold uppercase text-[10px] ${(f.returnedCount > 0 && activeTab === "active") ? "text-amber-700" :
                                        isOnHoldOrder ? "text-yellow-700" :
                                          "text-indigo-700"
                                      }`}>
                                      {(f.returnedCount > 0 && activeTab === "active") ? "Net Billing Value (After Returns)" :
                                        isOnHoldOrder ? "Pending Value (On Hold)" :
                                          "Final Billing Value"}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right font-bold text-sm ${(f.returnedCount > 0 && activeTab === "active") ? "text-amber-700" :
                                        isOnHoldOrder ? "text-yellow-700" :
                                          "text-indigo-700"
                                      }`}>
                                      ₹{f.netValue.toLocaleString()}
                                    </td>
                                  </tr>
                                )}

                                {isCancelledOrder && (
                                  <tr className="border-t-2 bg-red-50 border-red-200">
                                    <td colSpan="4" className="px-3 py-2.5 text-right font-bold uppercase text-[10px] text-red-700">
                                      Order Cancelled — No Billing
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-bold text-sm text-red-700">
                                      ₹0
                                    </td>
                                  </tr>
                                )}
                              </tfoot>
                            </table>
                          </div>
                        </div>

                        {/* ✅ REPLACEMENT HISTORY CARD */}
                        {batchReturnHistory.length > 0 && (activeTab === "active" || activeTab === "returned") && (
                          <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden mt-4">
                            <div className="bg-red-100/60 px-3 py-2 border-b border-red-200 flex items-center justify-between">
                              <h3 className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                                <RotateCcw size={13} /> Return History
                              </h3>
                              <span className="text-[10px] font-bold bg-white text-red-700 px-2 py-0.5 rounded border border-red-200">
                                {batchReturnHistory.length} record{batchReturnHistory.length > 1 ? "s" : ""}
                              </span>
                            </div>
                            <div className="p-3 space-y-2">
                              {batchReturnHistory.map((record) => (
                                <div key={record.id} className="bg-white border border-red-100 rounded-lg p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
                                  <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Serial</p>
                                    <p className="font-mono text-xs font-bold text-slate-700">{record.serialValue || getReturnSerial(record) || "N/A"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Condition</p>
                                    <p className="text-xs font-semibold text-red-700">{record.condition || "Returned"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Reason</p>
                                    <p className="text-xs font-medium text-slate-700 break-words">{record.reason || "No reason recorded"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Invoice</p>
                                    <p className="text-xs font-medium text-slate-700">{record.invoiceNumber || "N/A"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Returned On</p>
                                    <p className="text-xs font-medium text-slate-700">
                                      {record.returnDate ? format(new Date(record.returnDate), "dd MMM yyyy, hh:mm a") : "N/A"}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedBatch.items.some(isItemReplaced) && (
                          <div className="bg-indigo-50 border border-indigo-200 rounded-lg overflow-hidden mt-4">
                            <div className="bg-indigo-100/50 px-3 py-2 border-b border-indigo-200 flex items-center justify-between">
                              <h3 className="text-xs font-bold text-indigo-800 flex items-center gap-1.5">
                                <RefreshCw size={13} /> Serial Replacements
                              </h3>
                            </div>
                            <div className="p-3 space-y-2">
                              {selectedBatch.items.filter(isItemReplaced).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-white border border-indigo-100 p-2.5 rounded-lg shadow-sm">
                                  <div className="flex items-center gap-4">
                                    <div className="text-center">
                                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Old Serial (Returned)</p>
                                      <p className="font-mono text-xs font-bold text-red-500 line-through bg-red-50 px-2 py-0.5 rounded border border-red-100">{getOldSerial(item)}</p>
                                    </div>
                                    <div className="text-indigo-300 font-bold text-lg">➔</div>
                                    <div className="text-center">
                                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">New Serial (Active)</p>
                                      <p className="font-mono text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">{getItemSerial(item)}</p>
                                    </div>
                                  </div>
                                  <div className="hidden sm:block text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200">
                                    Replaced Successfully
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        </div>{/* closes hidden legacy wrapper */}
                      </>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-3 rounded-b-xl flex justify-end">
              <button onClick={closeModal} className="px-4 py-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-semibold text-xs">
                Close
              </button>
            </div>
          </div>
        </div>

      {/* ── Email Compose Modal ─────────────────────────────────────────────── */}
      {emailDraft && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                  <Mail size={15} className="text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Send Warranty Email</p>
                  <p className="text-[10px] text-slate-400">Edit fields if needed, then send</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!emailDraft.loading && (
                  <button
                    onClick={() => setEmailPreview(p => !p)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${emailPreview ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'}`}
                  >
                    {emailPreview ? <Eye size={13} /> : <Eye size={13} />}
                    {emailPreview ? 'Edit' : 'Preview'}
                  </button>
                )}
                <button onClick={() => setEmailDraft(null)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                  <X size={16} />
                </button>
              </div>
            </div>

            {emailDraft.loading ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-slate-500 text-sm p-10">
                <Loader2 size={18} className="animate-spin text-indigo-500" /> Loading template...
              </div>
            ) : emailPreview ? (
              /* ── Preview mode ── */
              <div className="flex-1 overflow-y-auto p-5">
                <div className="mb-3 space-y-1 text-xs text-slate-500 border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <div><span className="font-bold text-slate-700 w-14 inline-block">To:</span> {emailDraft.to || <em className="text-slate-400">—</em>}</div>
                  {emailDraft.cc  && <div><span className="font-bold text-slate-700 w-14 inline-block">CC:</span> {emailDraft.cc}</div>}
                  {emailDraft.bcc && <div><span className="font-bold text-slate-700 w-14 inline-block">BCC:</span> {emailDraft.bcc}</div>}
                  <div><span className="font-bold text-slate-700 w-14 inline-block">Sub:</span> {emailDraft.subject || <em className="text-slate-400">—</em>}</div>
                </div>
                <div className="border border-slate-200 rounded-xl p-5 bg-white text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans min-h-[200px]">
                  {emailDraft.body || <span className="text-slate-400 italic">No body content</span>}
                </div>
                {emailAttachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {emailAttachments.map((a, i) => (
                      <span key={i} className="flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full border border-slate-200">
                        <FileText size={11} /> {a.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* ── Edit mode ── */
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {/* To */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">To</label>
                  <input
                    type="text"
                    value={emailDraft.to}
                    onChange={e => setEmailDraft(d => ({ ...d, to: e.target.value }))}
                    placeholder="recipient@example.com"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                  />
                </div>
                {/* CC / BCC */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">CC</label>
                    <input
                      type="text"
                      value={emailDraft.cc}
                      onChange={e => setEmailDraft(d => ({ ...d, cc: e.target.value }))}
                      placeholder="cc@example.com"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">BCC</label>
                    <input
                      type="text"
                      value={emailDraft.bcc}
                      onChange={e => setEmailDraft(d => ({ ...d, bcc: e.target.value }))}
                      placeholder="bcc@example.com"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                    />
                  </div>
                </div>
                {/* Subject */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Subject</label>
                  <input
                    type="text"
                    value={emailDraft.subject}
                    onChange={e => setEmailDraft(d => ({ ...d, subject: e.target.value }))}
                    placeholder="Email subject"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                  />
                </div>
                {/* Body */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Body</label>
                  <textarea
                    rows={10}
                    value={emailDraft.body}
                    onChange={e => setEmailDraft(d => ({ ...d, body: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none resize-y font-mono"
                  />
                </div>
                {/* Attachments */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Attachments</label>
                    <button
                      onClick={() => emailFileRef.current?.click()}
                      className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition"
                    >
                      <Plus size={11} /> Add File
                    </button>
                    <input ref={emailFileRef} type="file" multiple className="hidden" onChange={handleEmailFileAdd} />
                  </div>
                  {emailAttachments.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No attachments</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {emailAttachments.map((a, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                          <FileText size={11} className="text-slate-400" />
                          <span className="text-xs text-slate-700 max-w-[160px] truncate">{a.name}</span>
                          <span className="text-[10px] text-slate-400">({(a.size/1024).toFixed(0)}KB)</span>
                          <button onClick={() => setEmailAttachments(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 ml-1">
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            {!emailDraft.loading && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 flex-shrink-0 bg-slate-50 rounded-b-2xl">
                <div>
                  {emailError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={12} /> {emailError}
                    </p>
                  )}
                  {emailSent && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle size={12} /> Email sent successfully!
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEmailDraft(null)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendEmail}
                    disabled={emailSending || emailSent}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold px-5 py-2 rounded-xl transition"
                  >
                    {emailSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {emailSending ? "Sending..." : emailSent ? "Sent!" : "Send Email"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}


