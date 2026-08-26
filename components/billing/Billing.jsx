"use client";
import React, { useState, useMemo, useEffect } from "react";
import { format, differenceInDays } from "date-fns";
import axios from "axios";
import {
    Receipt, Search, X, Edit2, ChevronLeft, ChevronRight, ChevronDown, Activity,
    IndianRupee, FileText, UploadCloud, Link, Building, MapPin,
    Phone, Mail, Calendar, Box, User, Info, Download, Hash, Clock,
    ShoppingCart, CreditCard, CheckCircle, AlertTriangle, ExternalLink, Package, Loader2
} from "lucide-react";
import { printerService } from "@/lib/services/api";
import { platformsService } from "@/lib/services/platformsService";
import AppearanceModal from "@/components/common/AppearanceModal";
import { Palette } from "lucide-react";
import DayFilterSelect from "@/components/common/DayFilterSelect";
import { getDayFilterRange, isWithinDayFilter } from "@/lib/client/dayFilter";
import { toLocalDateStr } from "@/lib/dateUtils";
import { useToast } from "@/lib/client/ToastContext";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";


export default function Billing({
    models = [],
    serials = [],
    dispatches = [],
    onUpdate,
    onRefresh,
    currentUser,
    initialDayFilter = "all",
    initialCustomStart = "",
    initialCustomEnd = "",
}) {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState("billing");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchTerm, setSearchTerm] = useState("");
    const [platformFilter, setPlatformFilter] = useState("All");
    const [platformOptions, setPlatformOptions] = useState([]);
    useEffect(() => { platformsService.getPlatforms().then(setPlatformOptions); }, []);
    const [dayFilter, setDayFilter] = useState(initialDayFilter);
    const [customStart, setCustomStart] = useState(initialCustomStart);
    const [customEnd, setCustomEnd] = useState(initialCustomEnd);
    const dayRange = useMemo(() => getDayFilterRange(dayFilter, customStart, customEnd), [dayFilter, customStart, customEnd]);

    const canManage = currentUser?.role === 'Admin' || !!currentUser?.allow_edit_billing;

    // State for Editing Billing Status
    const [editingBatch, setEditingBatch] = useState(null);

    // State for Payment Collection
    const [paymentBatch, setPaymentBatch] = useState(null);
    const [paymentForm, setPaymentForm] = useState({
        paymentDate: toLocalDateStr(new Date()),
        paymentType: "Full",
        amount: "",
        settlementDeduction: "",
        utrId: ""
    });

    // State for Viewing Order Details
    const [viewingOrder, setViewingOrder] = useState(null);

    const [editForm, setEditForm] = useState({
        // ✅ UPDATED: Default status changed
        status: "Send for Billing",
        invoiceNo: "",
        invoiceDate: "",
        ewayBill: "",
        gemUploaded: "No",
        invoiceFile: null,
        existingInvoice: "",
        // ✅ NEW: E-Way Bill file upload fields
        ewayBillFile: null,
        existingEwayBillName: "",
        challanFile: null,
        existingChallan: "",
        removeInvoice: false,
        removeEwayBill: false
    });
    // True while invoiceDate is still just the auto-filled "today" default (not a saved
    // value or a manual edit) — lets AI contract extraction still override it.
    const [invoiceDateIsDefault, setInvoiceDateIsDefault] = useState(false);
    const [aiParsingInvoice, setAiParsingInvoice] = useState(false);
    const [aiParsingEwayBill, setAiParsingEwayBill] = useState(false);
    // Bumped every time a different order is opened for editing — lets in-flight AI parse
    // results from a previously-open (and possibly closed) order detect they're stale and
    // avoid overwriting whichever order's form is now open.
    const editSessionRef = React.useRef(0);

    const [appearanceModalOpen, setAppearanceModalOpen] = useState(false);
    const [appearanceItem, setAppearanceItem] = useState(null);

    const openAppearanceModal = (e, item) => {
        e.stopPropagation();
        setAppearanceItem(item);
        setAppearanceModalOpen(true);
    };

    // Helper to get Serial/Model names
    const getDetails = (item) => {
        const serialId = item.serialGuid || item.serialNumberId;
        const s = serials.find((x) => (x.guid || x.id) === serialId);
        
        const targetModelId = s?.modelGuid || s?.modelId || item.modelGuid || item.modelId;
        const m = targetModelId ? models.find((x) => (x.guid || x.id) === targetModelId) : null;
        
        const serialVal = item.serialValue || item.serialNumber || s?.serialNumber || s?.value || "N/A";
        const modelName = item.modelName || item.model || m?.name || m?.modelName || "-";
        const companyName = item.company || m?.company || "-";

        return { serial: serialVal, model: modelName, company: companyName };
    };

    // Filter logic based on Active Tab
    const billingDispatches = useMemo(() => {
        if (!dispatches || !Array.isArray(dispatches)) return [];

        return dispatches.filter(d => {
            if (!d || d.isDeleted) return false;

            if (activeTab === "billing") {
                return d.status === "Send for Billing" || d.status === "Send for Billing (Hold)";
            } else if (activeTab === "draft") {
                // Opt-in only — a draft order shows here only after someone
                // explicitly clicks "Send for Billing" on it from Order
                // Processing's Draft tab (draftSentToBilling flag), not the
                // moment it's created. Once its bill has been uploaded/prepped,
                // it drops off this list — it's done from Billing's side and
                // just waits on Order Processing's Confirm step now.
                return d.status === "Draft" && !!d.draftSentToBilling && !d.invoiceFilename;
            } else {
                return d.status === "Payment Pending" || (d.logisticsStatus === "Delivered" && d.status !== "Completed");
            }
        });
    }, [dispatches, activeTab]);

    // Helper to generate consistent batch keys just like Order Tracking
    const getBatchKey = (item) => {
        const firm = String(item.firmName || "").trim();
        const customer = String(item.customerName || item.customer || "").trim();
        const bid = String(item.bidNumber || "").trim();
        if (bid) return `${firm}__${bid}`;
        if (customer) return `${firm}__${customer}`;
        return `single__${item.guid || item.id}`;
    };

    const groupedBilling = useMemo(() => {
        const groups = {};
        const term = String(searchTerm || "").toLowerCase();

        const filtered = billingDispatches.filter(d => {
            if (!d) return false;
            const { serial: serialVal } = getDetails(d);

            const firm = String(d.firmName || "").toLowerCase();
            const customer = String(d.customerName || d.customer || "").toLowerCase();
            const serialStr = String(serialVal || "").toLowerCase();
            const contact = String(d.contactNumber || "").toLowerCase();

            const matchesSearch = firm.includes(term) || customer.includes(term) || serialStr.includes(term) || contact.includes(term);
            const matchesPlatform = platformFilter === "All" || (d.firmName || "Other") === platformFilter;
            const matchesDay = isWithinDayFilter(d.dispatchDate || d.updatedAt || d.createdAt, dayRange);
            return matchesSearch && matchesPlatform && matchesDay;
        });

        filtered.forEach((d) => {
            const key = getBatchKey(d);
            if (!groups[key]) groups[key] = [];
            groups[key].push(d);
        });

        return Object.values(groups).sort((a, b) => {
            const dateA = a[0]?.dispatchDate ? new Date(a[0].dispatchDate).getTime() : 0;
            const dateB = b[0]?.dispatchDate ? new Date(b[0].dispatchDate).getTime() : 0;
            return dateB - dateA;
        });
    }, [billingDispatches, searchTerm, serials, platformFilter, dayRange]);

    // ✅ NEW: Calculate how many bills are due (older than 2 days in Send for Billing)
    const dueBillsCount = useMemo(() => {
        if (!dispatches || !Array.isArray(dispatches)) return 0;
        return dispatches.filter(d => {
            if (!d || d.isDeleted || d.status !== "Send for Billing") return false;
            const refDate = new Date(d.updatedAt || d.dispatchDate || d.createdAt || new Date());
            return differenceInDays(new Date(), refDate) >= 2;
        }).length;
    }, [dispatches]);

    // Draft tab — distinct Draft orders that were explicitly sent for
    // billing, and how many of those still have no invoice uploaded
    const draftOrdersCount = useMemo(() => {
        if (!dispatches || !Array.isArray(dispatches)) return 0;
        const keys = new Set();
        dispatches.forEach(d => {
            if (!d || d.isDeleted || d.status !== "Draft" || !d.draftSentToBilling) return;
            keys.add(getBatchKey(d));
        });
        return keys.size;
    }, [dispatches]);

    const draftPendingBillCount = useMemo(() => {
        if (!dispatches || !Array.isArray(dispatches)) return 0;
        const seen = new Set();
        let count = 0;
        dispatches.forEach(d => {
            if (!d || d.isDeleted || d.status !== "Draft" || !d.draftSentToBilling) return;
            const key = getBatchKey(d);
            if (seen.has(key)) return;
            seen.add(key);
            const hasInvoice = !!d.invoiceFilename;
            if (!hasInvoice) count++;
        });
        return count;
    }, [dispatches]);

    const totalPages = Math.max(1, Math.ceil(groupedBilling.length / pageSize));
    const currentDispatches = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return groupedBilling.slice(start, start + pageSize);
    }, [groupedBilling, currentPage, pageSize]);

    const totalBillingRevenue = billingDispatches.reduce((sum, d) => sum + (Number(d.sellingPrice) || 0) * (Number(d.quantity) || 1), 0);

    // ✅ NEW: Calculate batch order value for E-Way Bill validation
    const editingBatchOrderValue = useMemo(() => {
        if (!editingBatch || !Array.isArray(editingBatch)) return 0;
        return editingBatch.reduce((sum, item) => sum + (Number(item.sellingPrice) || 0) * (Number(item.quantity) || 1), 0);
    }, [editingBatch]);

    // ✅ NEW: E-Way Bill required if order value > 50,000 and NOT an Amazon/Flipkart batch
    const editingBatchIsMarketplace = useMemo(() => {
        if (!editingBatch || !Array.isArray(editingBatch)) return false;
        return editingBatch.every(item => {
            const firm = String(item.firmName || "").trim().toLowerCase();
            return firm === "amazon" || firm === "flipkart";
        });
    }, [editingBatch]);

    const editingBatchIsGem = useMemo(() => {
        if (!editingBatch || !Array.isArray(editingBatch)) return false;
        return editingBatch[0] && String(editingBatch[0].firmName || "").trim() === "GeM";
    }, [editingBatch]);

    // E-Way Bill only applies once an order is actually being billed/shipped —
    // a Draft order hasn't been confirmed with real serials/dispatch yet, so
    // it shouldn't show as E-Way Bill "required" just for crossing ₹50,000
    // in the editor.
    const isEwayBillRequired = editingBatch?.[0]?.status !== "Draft" && !editingBatchIsMarketplace && editingBatchOrderValue > 50000;

    // Handle Edit Invoice Click
    const handleEditClick = (group) => {
        editSessionRef.current += 1;
        setEditingBatch(group);
        const firstItem = group[0] || {};

        setInvoiceDateIsDefault(!firstItem.invoiceDate);
        setEditForm({
            status: firstItem.status || "Send for Billing",
            invoiceNo: firstItem.invoiceNumber || "",
            invoiceDate: firstItem.invoiceDate ? toLocalDateStr(firstItem.invoiceDate) : toLocalDateStr(new Date()),
            ewayBill: firstItem.ewayBillNumber || "",
            gemUploaded: firstItem.gemBillUploaded || "No",
            invoiceFile: null,
            existingInvoice: firstItem.invoiceFilename || "",
            // ✅ NEW: Load existing E-Way Bill
            ewayBillFile: null,
            existingEwayBillName: firstItem.ewayBillFilename || "",
            challanFile: null,
            existingChallan: (firstItem.documents || []).find(d => d.docType === 'challan')?.filename || "",
            additionalDocFile: null,
            removeInvoice: false,
            removeEwayBill: false
        });
    };

    const closeEditModal = () => {
        editSessionRef.current += 1;
        setEditingBatch(null);
    };

    // Handle Payment Click
    const handlePaymentClick = (group) => {
        setPaymentBatch(group);
        const totalAmount = group.reduce((sum, item) => sum + (Number(item.sellingPrice) || 0) * (Number(item.quantity) || 1), 0);

        setPaymentForm({
            paymentDate: toLocalDateStr(new Date()),
            paymentType: "Full",
            amount: totalAmount,
            settlementDeduction: "",
            utrId: "",
            gemUploaded: group[0]?.gemBillUploaded || "No"
        });
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            setEditForm(prev => ({ ...prev, invoiceFile: file }));
        }
    };

    // ✅ NEW: E-Way Bill file change handler with validation
    const handleEwayBillFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const allowedTypes = [
                "application/pdf",
                "image/jpeg",
                "image/jpg",
                "image/png",
                "image/webp"
            ];
            if (!allowedTypes.includes(file.type)) {
                toast.warning("Only PDF, JPG, PNG, and WEBP files are allowed for E-Way Bill.");
                e.target.value = "";
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                toast.warning("File size must be less than 10MB.");
                e.target.value = "";
                return;
            }
        }
        setEditForm(prev => ({ ...prev, ewayBillFile: file || null }));
    };

    // ✅ UPDATED: Save Invoice Logic — with E-Way Bill upload + "Send for Packing"
    const isDraftBatch = editingBatch?.[0]?.status === "Draft";

    const handleSaveEdit = async (e) => {
        e.preventDefault();

        if (!isDraftBatch && editForm.status === "Send for Packing" && !editForm.invoiceNo.trim()) {
            toast.warning("Invoice Number is required.");
            return;
        }

        if (!isDraftBatch && editForm.status === "Send for Packing" && isEwayBillRequired) {
            if (!editForm.ewayBillFile && !editForm.existingEwayBillName) {
                toast.warning(
                    `E-Way Bill is mandatory for orders above ₹50,000.\n` +
                    `Order Value: ₹${editingBatchOrderValue.toLocaleString("en-IN")}\n` +
                    `Please upload an E-Way Bill document to proceed.`
                );
                return;
            }
        }

        // Upload Invoice file
        let filename = editForm.existingInvoice;
        if (editForm.invoiceFile) {
            try {
                const uploadResponse = await printerService.uploadOrderDocument(
                    editingBatch[0].guid || editingBatch[0].id,
                    editForm.invoiceFile,
                    'invoice'
                );
                filename = uploadResponse.filename;
            } catch (uploadError) {
                console.error("File upload failed", uploadError);
                toast.error("Failed to upload invoice file.");
                return;
            }
        }

        // ✅ NEW: Upload E-Way Bill file
        let ewayBillFilename = editForm.existingEwayBillName;
        if (editForm.ewayBillFile) {
            try {
                const uploadResponse = await printerService.uploadOrderDocument(
                    editingBatch[0].guid || editingBatch[0].id,
                    editForm.ewayBillFile,
                    'ewayBill'
                );
                ewayBillFilename = uploadResponse.filename;
            } catch (uploadError) {
                console.error("E-Way Bill upload failed:", uploadError);
                toast.error("E-Way Bill upload failed. Please try again.");
                return;
            }
        }

        // Upload additional doc (marketplace optional second uploader)
        if (editForm.additionalDocFile) {
            try {
                await printerService.uploadOrderDocument(
                    editingBatch[0].guid || editingBatch[0].id,
                    editForm.additionalDocFile,
                    'additionalDoc'
                );
            } catch (uploadError) {
                console.error("Additional doc upload failed:", uploadError);
                toast.error("Additional document upload failed. Please try again.");
                return;
            }
        }

        // Upload Challan file (GeM orders only)
        let challanFilename = editForm.existingChallan;
        if (editForm.challanFile) {
            try {
                const uploadResponse = await printerService.uploadOrderDocument(
                    editingBatch[0].guid || editingBatch[0].id,
                    editForm.challanFile,
                    'challan'
                );
                challanFilename = uploadResponse.filename;
            } catch (uploadError) {
                console.error("Challan upload failed:", uploadError);
                toast.error("Challan upload failed. Please try again.");
                return;
            }
        }

        // Draft orders aren't serialized/confirmed yet — saving billing details
        // here is just prep work. Use the dedicated draft-billing endpoint
        // (a plain field update) instead of the normal dispatch update path,
        // which assumes a real assigned serial and would move the order out
        // of Draft. Draft → Active only happens via Order Processing's Confirm flow.
        if (isDraftBatch) {
            const orderGuid = editingBatch[0]?._orderId || editingBatch[0]?.orderId || editingBatch[0]?.guid || editingBatch[0]?.id;
            try {
                await printerService.updateDraftBilling(orderGuid, {
                    invoiceNumber: editForm.invoiceNo,
                    invoiceDate: editForm.invoiceDate || null,
                    ewayBillNumber: editForm.ewayBill,
                    gemBillUploaded: editForm.gemUploaded,
                    invoiceFilename: filename,
                    ewayBillFilename: ewayBillFilename || null,
                });
            } catch (error) {
                console.error("Failed to save draft billing details", error);
                toast.error("Failed to save billing details.");
                return;
            }
            closeEditModal();
            if (onRefresh) onRefresh();
            return;
        }

        // ✅ UPDATED: Map final statuses for backend
        let finalStatus = editForm.status;
        let finalLogisticsStatus = null;

        if (editForm.status === "Send for Packing") {
            finalStatus = "Billed";
            finalLogisticsStatus = "Packing in Process";
        }

        const updateData = {
            status: finalStatus,
            invoiceNumber: editForm.invoiceNo,
            invoiceDate: editForm.invoiceDate || null,
            ewayBillNumber: editForm.ewayBill,
            gemBillUploaded: editForm.gemUploaded,
            invoiceFilename: filename,
            // ✅ NEW: Include E-Way Bill filename
            ewayBillFilename: ewayBillFilename || null,
            challanFilename: challanFilename || null,
            // ✅ NEW: Set logistics status when sending for packing
            ...(finalLogisticsStatus ? { logisticsStatus: finalLogisticsStatus } : {})
        };

        let payload;
        if (editingBatch.length === 1) {
            payload = { id: editingBatch[0].id, ...updateData };
        } else {
            payload = editingBatch.map(item => ({ id: item.id || item.guid, ...updateData }));
        }

        try {
            if (Array.isArray(payload)) {
                if (onUpdate) await onUpdate(null, payload);
            } else {
                if (onUpdate) await onUpdate(payload.id, payload);
            }
        } catch (error) {
            console.error("Update failed", error);
            toast.error("Failed to update status.");
            return;
        }

        // If user checked remove flags, explicitly reset them in backend
        if (editForm.removeInvoice || editForm.removeEwayBill) {
            try {
                await printerService.resetDocs({
                    items: editingBatch.map(item => ({ id: item._orderId || item.orderId || item.guid || item.id })),
                    removeInvoice: editForm.removeInvoice,
                    removeEwayBill: editForm.removeEwayBill
                });
                if (onRefresh) onRefresh();
            } catch (error) {
                console.error("Document reset failed", error);
                toast.error("Status was updated, but clearing the invoice/e-way bill failed. Please retry that step.");
            }
        }

        closeEditModal();
    };

    // Save Payment Logic
    const handleSavePayment = async (e) => {
        e.preventDefault();

        if (!paymentForm.utrId || !paymentForm.amount) {
            toast.warning("UTR ID and Amount are required.");
            return;
        }

        // Use a unified order payment endpoint to avoid duplicate payments per item
        const orderGroupId = paymentBatch[0].dispatchGroupId || paymentBatch[0].orderId || paymentBatch[0].id;
        const showGemUpload = paymentBatch[0]?.firmName === "GeM" && paymentBatch.some(item => item.gemBillUploaded !== "Yes");
        
        try {
            await axios.post(`${API_BASE_URL}/api/orders/batch-payment`, {
                orderGroupId: orderGroupId,
                itemIds: paymentBatch.map(item => item.guid || item.id),
                paymentDate: paymentForm.paymentDate,
                totalAmount: paymentForm.amount,
                paymentType: paymentForm.paymentType,
                settlementDeduction: paymentForm.paymentType === "Settlement" ? paymentForm.settlementDeduction : 0,
                utrId: paymentForm.utrId,
                status: "Completed",
                gemBillUploaded: showGemUpload ? paymentForm.gemUploaded : undefined
            }, { headers: { Authorization: `Bearer ${sessionStorage.getItem("pt_auth_token")}` } });

            toast.success("Payment recorded successfully! Orders moved to Completed.");
            setPaymentBatch(null);
            if (onRefresh) await onRefresh();

        } catch (error) {
            console.error("Payment save failed", error);
            toast.error("Failed to save payment details. Check console.");
        }
    };

    const handleDownloadContract = (filename) => {
        if (!filename) return;
        window.open(`${API_BASE_URL}/uploads/${filename}`, "_blank");
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 space-y-5 relative">
            {/* Header */}
            <div className="relative">
                <div className="absolute -top-4 -left-4 w-48 h-48 bg-gradient-to-br from-indigo-500/10 to-blue-500/10 rounded-full blur-3xl -z-10" />
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg shadow-md shadow-indigo-500/25">
                                <Receipt size={14} className="text-white" />
                            </div>
                            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">Billing & Accounts</h1>
                        </div>
                        <p className="text-xs text-slate-500">Manage Invoices and Payment Collection</p>
                    </div>

                    {/* Tab Switcher */}
                    <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner">
                        <button
                            onClick={() => { setActiveTab("draft"); setCurrentPage(1); }}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === "draft" ? "bg-white text-slate-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            <FileText size={14} /> Draft
                            {draftOrdersCount > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${draftPendingBillCount > 0 ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-slate-200 text-slate-700"}`}>
                                    {draftOrdersCount}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => { setActiveTab("billing"); setCurrentPage(1); }}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === "billing" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            <FileText size={14} /> Pending Invoice
                        </button>
                        <button
                            onClick={() => { setActiveTab("payment"); setCurrentPage(1); }}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === "payment" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            <CreditCard size={14} /> Pending Payment
                        </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {activeTab === "billing" && dueBillsCount > 0 && (
                            <div className="flex items-center gap-2 bg-yellow-50 px-4 py-2 rounded-xl border border-yellow-200 shadow-sm animate-pulse">
                                <AlertTriangle size={16} className="text-yellow-600" />
                                <div>
                                    <p className="text-[10px] text-yellow-600 uppercase font-bold">Due Bills &gt; 2 Days</p>
                                    <p className="text-base font-bold text-yellow-800">{dueBillsCount} Orders</p>
                                </div>
                            </div>
                        )}
                        {activeTab === "draft" && draftPendingBillCount > 0 && (
                            <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 rounded-xl border border-amber-200 shadow-sm animate-pulse">
                                <AlertTriangle size={16} className="text-amber-600" />
                                <div>
                                    <p className="text-[10px] text-amber-600 uppercase font-bold">Bill Pending</p>
                                    <p className="text-base font-bold text-amber-800">{draftPendingBillCount} Draft Order{draftPendingBillCount > 1 ? "s" : ""}</p>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 shadow-sm">
                            <IndianRupee size={16} className="text-indigo-600" />
                            <div>
                                <p className="text-[10px] text-indigo-500 uppercase font-bold">Total {activeTab === "billing" ? "Unbilled" : activeTab === "draft" ? "Draft Value" : "Receivable"}</p>
                                <p className="text-base font-bold text-indigo-800">₹{totalBillingRevenue.toLocaleString('en-IN')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Search + Platform Filter */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="w-full md:w-72 relative group">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input className="w-full border border-slate-200 pl-9 pr-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm bg-white" placeholder={`Search ${activeTab === 'billing' ? 'billing' : activeTab === 'draft' ? 'draft' : 'payment'} orders...`} value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
                    {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
                </div>
                <div className="relative">
                    <select
                        value={platformFilter}
                        onChange={(e) => { setPlatformFilter(e.target.value); setCurrentPage(1); }}
                        className="appearance-none border border-slate-200 bg-white pl-3 pr-8 py-2.5 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm cursor-pointer"
                    >
                        <option value="All">All Platforms</option>
                        {platformOptions.map((p) => (
                            <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                    </select>
                    <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
                <DayFilterSelect
                    value={dayFilter}
                    onChange={(v) => { setDayFilter(v); setCurrentPage(1); }}
                    customStart={customStart}
                    onCustomStartChange={setCustomStart}
                    customEnd={customEnd}
                    onCustomEndChange={setCustomEnd}
                />
            </div>

            {/* TABLE */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className={`border-b border-slate-200 px-4 py-3 flex items-center gap-2 ${activeTab === 'payment' ? 'bg-emerald-50/50' : 'bg-indigo-50/50'}`}>
                    <span className="flex h-2 w-2 relative">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activeTab === 'payment' ? 'bg-emerald-400' : 'bg-indigo-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${activeTab === 'payment' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></span>
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                        {activeTab === 'billing' ? 'Orders Awaiting Invoice' : activeTab === 'draft' ? 'Draft Orders — Upload Bill' : 'Orders Awaiting Payment'} ({groupedBilling.length})
                    </span>
                </div>

                <div className="overflow-x-auto min-h-[300px]">
                    <table className="w-full text-sm">
                        <thead className="text-[10px] uppercase font-bold tracking-wider border-b bg-slate-50 text-slate-500">
                            <tr>
                                <th className="w-10 p-4 text-center">#</th>
                                <th className="p-4 text-left">Order ID</th>
                                <th className="p-4 text-left">Platform</th>
                                <th className="p-4 text-left">Model</th>
                                <th className="p-4 text-center">Amount</th>
                                <th className="p-4 text-center">{activeTab === 'payment' ? 'Delivery Date' : 'Order Date'}</th>
                                <th className="p-4 text-left">Contact No.</th>
                                <th className="w-40 p-4 text-center">{activeTab === 'draft' ? 'Draft Bill' : 'Action'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {currentDispatches.length === 0 ? (
                                <tr><td colSpan="100" className="p-12 text-center text-sm font-medium text-slate-400">
                                    {activeTab === 'billing'
                                        ? 'No pending bills. Check Dispatch to send orders here.'
                                        : activeTab === 'draft'
                                            ? 'No draft orders. Create one from Order Processing\'s Draft tab.'
                                            : 'No pending payments. Ensure orders are marked "Delivered" in Dispatch.'}
                                </td></tr>
                            ) : (
                                currentDispatches.map((group, index) => {
                                    const item = group[0];
                                    const isMultiple = group.length > 1;
                                    const { model } = getDetails(item);
                                    const totalAmount = group.reduce((sum, i) => sum + (Number(i.sellingPrice) || 0) * (Number(i.quantity) || 1), 0);

                                    // ✅ NEW: Show E-Way Bill indicator for high-value orders
                                    const needsEway = totalAmount > 50000;

                                    const isGroupDue = activeTab === 'billing' && group.some(i => {
                                        const refDate = new Date(i.updatedAt || i.dispatchDate || i.createdAt || new Date());
                                        return differenceInDays(new Date(), refDate) >= 2;
                                    });

                                    const [colorClass, intensity] = (item.rowColor || "").split("|");

                                    return (
                                        <tr 
                                            key={index} 
                                            style={{ "--row-opacity": intensity ? parseInt(intensity) / 100 : undefined }}
                                            className={`transition-colors ${activeTab === 'payment' ? 'hover:bg-emerald-50/30' : isGroupDue ? 'bg-yellow-50/80 hover:bg-yellow-100/80 border-l-4 border-yellow-400' : 'hover:bg-indigo-50/30'} ${colorClass || (item.rowColor && !item.rowColor.includes('|') ? item.rowColor : '')}`}
                                        >
                                            <td className="p-4 text-center text-slate-400 font-medium">
                                                {(currentPage - 1) * pageSize + index + 1}
                                            </td>

                                            <td className="p-4 flex items-center gap-2">
                                                <button
                                                    onClick={() => setViewingOrder(group)}
                                                    className={`text-xs font-bold hover:underline font-mono px-2 py-1 rounded transition-colors text-left ${activeTab === 'payment' ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                                                    title="Click to view full order details"
                                                >
                                                     {item.orderid || item.orderId || item.customerName || item.customer || "N/A"}
                                                </button>
                                                {/* Tags Display */}
                                                {(() => {
                                                    try {
                                                        const tags = item.tags ? JSON.parse(item.tags) : [];
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
                                            </td>

                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase
                                                    ${item.firmName === 'GeM' ? 'bg-orange-100 text-orange-700' :
                                                        item.firmName === 'Amazon' ? 'bg-yellow-100 text-yellow-700' :
                                                            item.firmName === 'Flipkart' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-slate-100 text-slate-600'}
                                                `}>
                                                    {item.firmName === 'GeM' && <Building size={10} />}
                                                    {item.firmName || 'Other'}
                                                </span>
                                            </td>

                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-700 truncate max-w-[150px]" title={model}>
                                                        {isMultiple ? `${model} (+${group.length - 1} more)` : model}
                                                    </span>
                                                    {isMultiple && <span className="text-[9px] text-slate-500 font-medium">Batch Order</span>}
                                                    {(() => {
                                                        try {
                                                            const tags = item.tags ? JSON.parse(item.tags) : [];
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
                                                        } catch (_e) { return null; }
                                                    })()}
                                                </div>
                                            </td>

                                            <td className="p-4 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-xs font-bold text-slate-800">
                                                        ₹{totalAmount.toLocaleString('en-IN')}
                                                    </span>
                                                    {/* ✅ NEW: E-Way Bill indicator badge */}
                                                    {activeTab === 'billing' && needsEway && (
                                                        <span className="text-[8px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5">
                                                            <AlertTriangle size={8} /> E-Way Req.
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="p-4 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-xs text-slate-600 font-medium">
                                                        {activeTab === 'payment'
                                                            ? (item.logisticsDispatchDate ? format(new Date(item.logisticsDispatchDate), "dd MMM, yyyy") : "-")
                                                            : (item.orderDate ? format(new Date(item.orderDate), "dd MMM, yyyy") : "-")
                                                        }
                                                    </span>
                                                    {isGroupDue && (
                                                        <span className="text-[8px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200 flex items-center gap-0.5">
                                                            <AlertTriangle size={8} /> OVERDUE
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="p-4">
                                                <span className="text-xs text-slate-600 font-mono">
                                                    {item.contactNumber || "-"}
                                                </span>
                                            </td>

                                            <td className="p-4 text-center">
                                                <div className="flex items-center gap-2 justify-center">
                                                    <button
                                                        onClick={(e) => openAppearanceModal(e, item)}
                                                        className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 rounded-lg transition-all shadow-sm shrink-0"
                                                        title="Appearance & Tags"
                                                    >
                                                        <Palette size={14} />
                                                    </button>
                                                    {(activeTab === 'billing' || activeTab === 'draft') ? (
                                                        <button disabled={!canManage} onClick={() => handleEditClick(group)} title="Generate Bill" className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm text-xs font-bold justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                                                            <Edit2 size={12} />
                                                            Process
                                                        </button>
                                                    ) : (
                                                        <button disabled={!canManage} onClick={() => handlePaymentClick(group)} title="Receive Payment" className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-sm text-xs font-bold w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                                                            <CreditCard size={12} />
                                                            Payment
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {groupedBilling.length > 0 && (
                    <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <span className="text-xs text-slate-500 font-medium">
                                Showing <span className="font-bold text-slate-700">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPage * pageSize, groupedBilling.length)}</span> of <span className="font-bold text-slate-700">{groupedBilling.length}</span> entries
                            </span>
                            
                            <div className="flex items-center gap-2">
                                <select 
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 outline-none focus:border-indigo-400 transition-all cursor-pointer"
                                    value={pageSize}
                                    onChange={(e) => {
                                        setPageSize(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                >
                                    {[10, 20, 50, 100].map(val => (
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
                                <ChevronLeft size={16} />
                            </button>
                            
                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    const pageNum = i + 1;
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                                currentPage === pageNum ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'text-slate-600 hover:bg-white hover:text-indigo-600'
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                                {totalPages > 5 && <span className="text-slate-400 px-1">...</span>}
                            </div>

                            <button 
                                disabled={currentPage >= totalPages}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* PAYMENT MODAL */}
            {paymentBatch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 my-auto">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                            <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                                <IndianRupee size={22} className="text-emerald-600" /> Payment Details
                            </h3>
                            <button type="button" onClick={() => setPaymentBatch(null)} className="p-2 hover:bg-slate-100 rounded-full transition"><X size={20} className="text-slate-400" /></button>
                        </div>

                        <form onSubmit={handleSavePayment} className="space-y-5">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">Payment Received Date <span className="text-red-500">*</span></label>
                                <input type="date" required className="w-full border p-2.5 rounded-lg mt-1 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} />
                            </div>
                            <div>
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">Payment Type <span className="text-red-500">*</span></label>
                            <select required className="w-full border p-2.5 rounded-lg mt-1 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" value={paymentForm.paymentType} onChange={(e) => setPaymentForm({ ...paymentForm, paymentType: e.target.value })}>
                                <option value="Full">Full Payment</option>
                                <option value="Settlement">Settlement (Partial/Fee)</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">Received Amount (₹) <span className="text-red-500">*</span></label>
                                <input type="number" required className="w-full border p-2.5 rounded-lg mt-1 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                            </div>
                            {paymentForm.paymentType === "Settlement" && (
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">Deduction / Fee (₹) <span className="text-red-500">*</span></label>
                                    <input type="number" required className="w-full border p-2.5 rounded-lg mt-1 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-rose-600" value={paymentForm.settlementDeduction} onChange={(e) => setPaymentForm({ ...paymentForm, settlementDeduction: e.target.value })} />
                                </div>
                            )}
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">UTR / Transaction ID <span className="text-red-500">*</span></label>
                                <input type="text" required placeholder="Enter UTR / Ref No." className="w-full border p-2.5 rounded-lg mt-1 text-sm focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-mono" value={paymentForm.utrId} onChange={(e) => setPaymentForm({ ...paymentForm, utrId: e.target.value })} />
                            </div>
                            {/* Conditional GeM Upload Check */}
                            {paymentBatch[0]?.firmName === "GeM" && paymentBatch.some(item => item.gemBillUploaded !== "Yes") && (
                                <div className="bg-orange-50 border border-orange-200 p-3 rounded-xl flex flex-col gap-2">
                                    <label className="text-xs font-bold text-orange-800 uppercase flex items-center gap-1">
                                        Uploaded on GeM Portal? <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                        value={paymentForm.gemUploaded}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, gemUploaded: e.target.value })}
                                        required
                                    >
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                    <p className="text-[10px] text-orange-600">
                                        This order was NOT uploaded on GeM during Billing. Please confirm if it is uploaded now.
                                    </p>
                                </div>
                            )}
                            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex gap-3">
                                <CheckCircle className="text-emerald-600 flex-shrink-0" size={18} />
                                <p className="text-xs text-emerald-800 font-medium">
                                    Submitting this will mark the order as <strong>Completed</strong> and move it to the Completed Orders tab.
                                </p>
                            </div>
                            <div className="flex gap-3 justify-end pt-2">
                                <button type="button" onClick={() => setPaymentBatch(null)} className="px-5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
                                <button type="submit" className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition">Save & Complete Order</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* VIEW ORDER DETAILS MODAL */}
            {viewingOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 my-auto">

                        <div className="flex justify-between items-center p-5 bg-gradient-to-r from-slate-50 to-indigo-50/50 border-b border-slate-200">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                                    <Info size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">Order Details</h3>
                                    <p className="text-xs text-slate-500 flex items-center gap-2">
                                        ID: <span className="font-mono text-slate-700 bg-white border border-slate-200 px-1.5 rounded">{viewingOrder[0].customerName || viewingOrder[0].customer}</span>
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setViewingOrder(null)} className="p-2 hover:bg-slate-200/60 rounded-full transition">
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>

                        <div className="p-6 max-h-[75vh] overflow-y-auto">
                            {(() => {
                                const details = viewingOrder[0];
                                const isGeM = details.firmName === "GeM";
                                const isBidOrPBP = isGeM && (details.gemOrderType === "Bid" || details.gemOrderType === "PBP");

                                return (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-8">
                                        <div className="space-y-4">
                                            <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                <Building size={12} /> Basic Information
                                            </h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Order ID</p>
                                                    <p className="text-sm font-bold font-mono text-slate-800">{details.customerName || details.customer}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Platform</p>
                                                    <p className="text-sm font-semibold text-slate-700">{details.firmName || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Order Date</p>
                                                    <p className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                                        <Calendar size={12} />
                                                        {details.orderDate ? format(new Date(details.orderDate), "dd MMM yyyy") : "-"}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Last Delivery Date</p>
                                                    <p className="text-sm font-medium text-red-600 flex items-center gap-1">
                                                        <Clock size={12} />
                                                        {details.lastDeliveryDate ? format(new Date(details.lastDeliveryDate), "dd MMM yyyy") : "-"}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Warranty</p>
                                                    <p className="text-sm font-semibold text-slate-700">{details.warranty || "N/A"}</p>
                                                </div>
                                            </div>

                                            {isGeM && (
                                                <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg mt-3">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <p className="text-[10px] text-orange-400 font-bold uppercase">Order Type</p>
                                                            <p className="text-sm font-bold text-orange-800">{details.gemOrderType || "Direct Order"}</p>
                                                        </div>
                                                        {isBidOrPBP && details.bidNumber && (
                                                            <div>
                                                                <p className="text-[10px] text-orange-400 font-bold uppercase">Bid No.</p>
                                                                <p className="text-sm font-mono text-orange-800">{details.bidNumber}</p>
                                                            </div>
                                                        )}
                                                        {details.contractFilename && (
                                                            <div className="col-span-2 pt-2 border-t border-orange-100/50">
                                                                <p className="text-[10px] text-orange-400 font-bold uppercase mb-1">Bid Contract</p>
                                                                <button
                                                                    onClick={() => handleDownloadContract(details.contractFilename)}
                                                                    className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:underline"
                                                                >
                                                                    <FileText size={14} />
                                                                    {details.contractFilename} <Download size={10} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                <User size={12} /> Customer & Contact
                                            </h4>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Shipping Address</p>
                                                <div className="flex gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                    <MapPin size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
                                                    <p className="text-sm text-slate-600 leading-relaxed">
                                                        {details.shippingAddress || "No address provided"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Invoice No.</p>
                                                    <p className="text-sm font-bold text-slate-700">{details.invoiceNumber || "-"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Invoice Date</p>
                                                    <p className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                                        <Calendar size={12} />
                                                        {details.invoiceDate ? format(new Date(toLocalDateStr(details.invoiceDate)), "dd MMM yyyy") : "-"}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">GST Number</p>
                                                    <p className="text-sm font-mono text-slate-700">{details.gstNumber || "-"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Contact No.</p>
                                                    <p className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                                        <Phone size={12} /> {details.contactNumber || "-"}
                                                    </p>
                                                </div>
                                                {details.invoiceFilename && (
                                                    <div className="col-span-2 pt-2 border-t border-slate-100">
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Invoice Document</p>
                                                        <button
                                                            onClick={() => handleDownloadContract(details.invoiceFilename)}
                                                            className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:underline"
                                                        >
                                                            <FileText size={14} />
                                                            {details.invoiceFilename} <Download size={10} />
                                                        </button>
                                                    </div>
                                                )}
                                                {isGeM && (
                                                    <>
                                                        <div>
                                                            <p className="text-[10px] text-slate-400 font-bold uppercase">Alt. Contact No.</p>
                                                            <p className="text-sm font-medium text-slate-700">{details.altContactNumber || "-"}</p>
                                                        </div>
                                                        <div className="col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Buyer Email</p>
                                                                <p className="text-xs font-medium text-indigo-600 break-all flex items-center gap-1">
                                                                    <Mail size={10} /> {details.buyerEmail || "-"}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Consignee Name</p>
                                                                <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
                                                                    <User size={10} /> {details.consigneeName || "-"}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Consignee Email</p>
                                                                <p className="text-xs font-medium text-indigo-600 break-all flex items-center gap-1">
                                                                    <Mail size={10} /> {details.consigneeEmail || "-"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div>
                                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3 flex items-center gap-1">
                                    <Box size={12} /> Items in this Order ({viewingOrder.length})
                                </h4>
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                                            <tr>
                                                <th className="px-4 py-3 w-10">#</th>
                                                <th className="px-4 py-3">Model</th>
                                                <th className="px-4 py-3">Serial Number</th>
                                                <th className="px-4 py-3 text-right">Selling Price</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {viewingOrder.map((item, idx) => {
                                                const { model, serial } = getDetails(item);
                                                return (
                                                    <tr key={idx} className="hover:bg-slate-50/50">
                                                        <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                                                        <td className="px-4 py-3 font-medium text-slate-700">{model}</td>
                                                        <td className="px-4 py-3 font-mono text-slate-600">{serial}</td>
                                                        <td className="px-4 py-3 text-right font-bold text-emerald-600">
                                                            ₹{(Number(item.sellingPrice || 0) * (Number(item.quantity) || 1)).toLocaleString('en-IN')}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="bg-slate-50 border-t border-slate-200">
                                            <tr>
                                                <td colSpan="3" className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">Total Amount</td>
                                                <td className="px-4 py-3 text-right font-bold text-indigo-700 text-base">
                                                    ₹{viewingOrder.reduce((sum, i) => sum + Number(i.sellingPrice || 0) * (Number(i.quantity) || 1), 0).toLocaleString('en-IN')}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                            <button onClick={() => setViewingOrder(null)} className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-sm transition">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* ✅ UPDATED: EDIT INVOICE MODAL — WITH E-WAY BILL + SEND FOR PACKING */}
            {/* ================================================================ */}
            {editingBatch && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">

                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-indigo-600 rounded-lg">
                                    <Receipt size={14} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-extrabold text-slate-800">Process Billing</h3>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                        {editingBatch[0]?.customerName || editingBatch[0]?.customer || "Order"} &nbsp;·&nbsp; {editingBatch.length} item{editingBatch.length > 1 ? "s" : ""} &nbsp;·&nbsp; <span className="font-bold text-slate-600">₹{editingBatchOrderValue.toLocaleString("en-IN")}</span>
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={closeEditModal} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                                <X size={16} className="text-slate-400" />
                            </button>
                        </div>

                        {/* E-Way Bill required banner */}
                        {isEwayBillRequired && (
                            <div className="mx-5 mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                                <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                                <p className="text-xs font-semibold text-amber-700">E-Way Bill required — order value above ₹50,000</p>
                            </div>
                        )}

                        <form onSubmit={handleSaveEdit}>
                            <div className="px-5 pt-4 pb-5 space-y-4">

                                {/* ── Invoice Details ── */}
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Invoice Details</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                                                <FileText size={11} /> Invoice / Bill No. <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                required
                                                className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-mono uppercase placeholder:normal-case"
                                                placeholder="INV-XXXXX"
                                                value={editForm.invoiceNo}
                                                onChange={(e) => setEditForm({ ...editForm, invoiceNo: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                                                <Calendar size={11} /> Invoice Date
                                            </label>
                                            <input
                                                type="date"
                                                className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                                                value={editForm.invoiceDate}
                                                onChange={(e) => {
                                                    setInvoiceDateIsDefault(false);
                                                    setEditForm({ ...editForm, invoiceDate: e.target.value });
                                                }}
                                            />
                                        </div>

                                        {!editingBatchIsMarketplace && (<>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                                                    <Link size={11} /> E-Way Bill No. <span className="text-slate-400 font-normal">(opt.)</span>
                                                </label>
                                                <input
                                                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-mono uppercase placeholder:normal-case"
                                                    placeholder="EWAY-XXXXX"
                                                    value={editForm.ewayBill}
                                                    onChange={(e) => setEditForm({ ...editForm, ewayBill: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                                                    <Activity size={11} /> Uploaded on GeM?
                                                </label>
                                                <select
                                                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white font-medium"
                                                    value={editForm.gemUploaded}
                                                    onChange={(e) => setEditForm({ ...editForm, gemUploaded: e.target.value })}
                                                >
                                                    <option value="No">No</option>
                                                    <option value="Yes">Yes</option>
                                                </select>
                                            </div>
                                        </>)}
                                    </div>
                                </div>

                                {/* ── Documents ── */}
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Documents</p>
                                    <div className="flex gap-2">

                                        {/* Invoice Upload */}
                                        {(() => {
                                            const hasExisting = !!editForm.existingInvoice && !editForm.invoiceFile;
                                            const hasNew = !!editForm.invoiceFile;
                                            return (
                                                <div className="flex-1 min-w-0 border border-slate-200 rounded-xl overflow-hidden">
                                                    <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-200">
                                                        <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><FileText size={12} className="text-indigo-500" /> Invoice</span>
                                                        {hasExisting && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={8} /> Saved</span>}
                                                        {hasNew && !aiParsingInvoice && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1"><UploadCloud size={8} /> Ready</span>}
                                                        {hasNew && aiParsingInvoice && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Loader2 size={8} className="animate-spin" /> Reading...</span>}
                                                    </div>
                                                    <div className="p-3 flex flex-col gap-2">
                                                        {hasExisting ? (
                                                            <>
                                                                <div className="flex flex-col items-center gap-1 bg-emerald-50 px-3 py-3 rounded-lg border border-emerald-100 text-center">
                                                                    <FileText size={20} className="text-emerald-500" />
                                                                    <p className="text-[10px] text-emerald-800 font-mono truncate max-w-full w-full">{editForm.existingInvoice}</p>
                                                                </div>
                                                                <div className="flex gap-1.5">
                                                                    <a href={`${API_BASE_URL}/uploads/${editForm.existingInvoice}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1"><ExternalLink size={9} /> View</a>
                                                                    <label className="flex-1 text-center text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"><UploadCloud size={9} /> Replace<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} /></label>
                                                                    <button type="button" onClick={() => setEditForm(prev => ({ ...prev, existingInvoice: "", removeInvoice: true }))} className="flex-1 text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1"><X size={9} /> Remove</button>
                                                                </div>
                                                            </>
                                                        ) : hasNew ? (
                                                            <>
                                                                <div className="relative flex flex-col items-center gap-1 bg-indigo-50 px-3 py-3 rounded-lg border border-indigo-100 text-center">
                                                                    {aiParsingInvoice && (
                                                                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
                                                                            <Loader2 size={22} className="text-indigo-500 animate-spin" />
                                                                        </div>
                                                                    )}
                                                                    <UploadCloud size={20} className="text-indigo-400" />
                                                                    <p className="text-[10px] font-semibold text-indigo-800 truncate max-w-full w-full">{editForm.invoiceFile.name}</p>
                                                                    <p className="text-[9px] text-indigo-400">{(editForm.invoiceFile.size / 1024).toFixed(1)} KB</p>
                                                                </div>
                                                                <button type="button" onClick={() => setEditForm(prev => ({ ...prev, invoiceFile: null }))} className="w-full text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1"><X size={9} /> Remove</button>
                                                            </>
                                                        ) : (
                                                            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-indigo-300 rounded-lg px-4 py-6 cursor-pointer transition-colors group w-full">
                                                                <UploadCloud size={24} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
                                                                <p className="text-xs font-semibold text-slate-400 group-hover:text-indigo-500 transition-colors">Choose file</p>
                                                                <p className="text-[10px] text-slate-300">PDF, JPG, PNG, WEBP</p>
                                                                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} />
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* E-Way Bill Upload */}
                                        {!editingBatchIsMarketplace && (() => {
                                            const hasExisting = !!editForm.existingEwayBillName && !editForm.ewayBillFile;
                                            const hasNew = !!editForm.ewayBillFile;
                                            const isRequired = isEwayBillRequired;
                                            return (
                                                <div className={`flex-1 min-w-0 border rounded-xl overflow-hidden ${isRequired && !hasExisting && !hasNew ? "border-red-200" : "border-slate-200"}`}>
                                                    <div className={`flex items-center justify-between px-4 py-3 border-b ${isRequired && !hasExisting && !hasNew ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
                                                        <span className={`text-xs font-bold flex items-center gap-1.5 ${isRequired && !hasExisting && !hasNew ? "text-red-600" : "text-slate-600"}`}>
                                                            <FileText size={12} className={isRequired && !hasExisting && !hasNew ? "text-red-400" : "text-indigo-500"} />
                                                            E-Way Bill {isRequired ? <span className="text-red-400">*</span> : <span className="text-slate-400 font-normal">(opt.)</span>}
                                                        </span>
                                                        {hasExisting && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={8} /> Saved</span>}
                                                        {hasNew && !aiParsingEwayBill && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1"><UploadCloud size={8} /> Ready</span>}
                                                        {hasNew && aiParsingEwayBill && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Loader2 size={8} className="animate-spin" /> Reading...</span>}
                                                    </div>
                                                    <div className="p-3 flex flex-col gap-2">
                                                        {hasExisting ? (
                                                            <>
                                                                <div className="flex flex-col items-center gap-1 bg-emerald-50 px-3 py-3 rounded-lg border border-emerald-100 text-center">
                                                                    <FileText size={20} className="text-emerald-500" />
                                                                    <p className="text-[10px] text-emerald-800 font-mono truncate max-w-full w-full">{editForm.existingEwayBillName}</p>
                                                                </div>
                                                                <div className="flex gap-1.5">
                                                                    <a href={`${API_BASE_URL}/uploads/${editForm.existingEwayBillName}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1"><ExternalLink size={9} /> View</a>
                                                                    <label className="flex-1 text-center text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"><UploadCloud size={9} /> Replace<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleEwayBillFileChange} /></label>
                                                                    <button type="button" onClick={() => setEditForm(prev => ({ ...prev, existingEwayBillName: "", removeEwayBill: true }))} className="flex-1 text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1"><X size={9} /> Remove</button>
                                                                </div>
                                                            </>
                                                        ) : hasNew ? (
                                                            <>
                                                                <div className="relative flex flex-col items-center gap-1 bg-indigo-50 px-3 py-3 rounded-lg border border-indigo-100 text-center">
                                                                    {aiParsingEwayBill && (
                                                                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
                                                                            <Loader2 size={22} className="text-indigo-500 animate-spin" />
                                                                        </div>
                                                                    )}
                                                                    <UploadCloud size={20} className="text-indigo-400" />
                                                                    <p className="text-[10px] font-semibold text-indigo-800 truncate max-w-full w-full">{editForm.ewayBillFile.name}</p>
                                                                    <p className="text-[9px] text-indigo-400">{(editForm.ewayBillFile.size / 1024).toFixed(1)} KB</p>
                                                                </div>
                                                                <button type="button" onClick={() => setEditForm(prev => ({ ...prev, ewayBillFile: null }))} className="w-full text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1"><X size={9} /> Remove</button>
                                                            </>
                                                        ) : (
                                                            <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-6 cursor-pointer transition-colors group w-full ${isRequired ? "border-red-200 hover:border-red-400" : "border-slate-200 hover:border-indigo-300"}`}>
                                                                <UploadCloud size={24} className={`transition-colors ${isRequired ? "text-red-200 group-hover:text-red-400" : "text-slate-300 group-hover:text-indigo-400"}`} />
                                                                <p className={`text-xs font-semibold transition-colors ${isRequired ? "text-red-400 group-hover:text-red-600" : "text-slate-400 group-hover:text-indigo-500"}`}>Choose file</p>
                                                                <p className="text-[10px] text-slate-300">PDF, JPG, PNG, WEBP</p>
                                                                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleEwayBillFileChange} />
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Platform Invoice — Marketplace view-only */}
                                        {editingBatchIsMarketplace && editForm.existingEwayBillName && (
                                            <div className="flex-1 min-w-0 border border-slate-200 rounded-xl overflow-hidden">
                                                <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-200">
                                                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                                                        <FileText size={12} className="text-indigo-500" /> Platform Invoice
                                                    </span>
                                                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={8} /> Saved</span>
                                                </div>
                                                <div className="p-3 flex flex-col items-center justify-center gap-3 min-h-[110px]">
                                                    <FileText size={24} className="text-slate-300" />
                                                    <p className="text-[10px] text-slate-500 font-mono truncate max-w-full px-2 text-center">{editForm.existingEwayBillName}</p>
                                                    <a href={`${API_BASE_URL}/uploads/${editForm.existingEwayBillName}`} target="_blank" rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-3 py-1 rounded-md transition">
                                                        <ExternalLink size={9} /> View File
                                                    </a>
                                                </div>
                                            </div>
                                        )}

                                        {/* Additional Doc — Marketplace optional uploader */}
                                        {editingBatchIsMarketplace && (() => {
                                            const hasNew = !!editForm.additionalDocFile;
                                            return (
                                                <div className="flex-1 min-w-0 border border-slate-200 rounded-xl overflow-hidden">
                                                    <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-200">
                                                        <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                                                            <FileText size={12} className="text-indigo-500" /> Additional Doc
                                                            <span className="text-slate-400 font-normal">(opt.)</span>
                                                        </span>
                                                        {hasNew && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1"><UploadCloud size={8} /> Ready</span>}
                                                    </div>
                                                    <div className="p-3">
                                                        {hasNew ? (
                                                            <div className="flex items-center justify-between bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100 mb-2">
                                                                <div>
                                                                    <p className="text-xs font-semibold text-indigo-800 truncate max-w-[180px]">{editForm.additionalDocFile.name}</p>
                                                                    <p className="text-[9px] text-indigo-400">{(editForm.additionalDocFile.size / 1024).toFixed(1)} KB</p>
                                                                </div>
                                                                <button type="button" onClick={() => setEditForm(prev => ({ ...prev, additionalDocFile: null }))} className="p-1 text-red-400 hover:text-red-600 ml-2 shrink-0"><X size={13} /></button>
                                                            </div>
                                                        ) : null}
                                                        <label className={`${hasNew ? "mt-2 " : ""}flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-indigo-300 rounded-lg px-4 py-6 cursor-pointer transition-colors group w-full`}>
                                                            <UploadCloud size={24} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
                                                            <p className="text-xs font-semibold text-slate-400 group-hover:text-indigo-500 transition-colors text-center">{hasNew ? "Replace file" : "Choose file"}</p>
                                                            <p className="text-[10px] text-slate-300 group-hover:text-indigo-400 transition-colors">PDF, JPG, PNG, WEBP</p>
                                                            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => setEditForm(prev => ({ ...prev, additionalDocFile: e.target.files[0] || null }))} />
                                                        </label>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Challan Upload — GeM only */}
                                        {editingBatchIsGem && (() => {
                                            const hasExisting = !!editForm.existingChallan && !editForm.challanFile;
                                            const hasNew = !!editForm.challanFile;
                                            return (
                                                <div className="flex-1 min-w-0 border border-slate-200 rounded-xl overflow-hidden">
                                                    <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-200">
                                                        <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><FileText size={12} className="text-indigo-500" /> Challan <span className="text-slate-400 font-normal">(opt.)</span></span>
                                                        {hasExisting && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={8} /> Saved</span>}
                                                        {hasNew && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1"><UploadCloud size={8} /> Ready</span>}
                                                    </div>
                                                    <div className="p-3 flex flex-col gap-2">
                                                        {hasExisting ? (
                                                            <>
                                                                <div className="flex flex-col items-center gap-1 bg-emerald-50 px-3 py-3 rounded-lg border border-emerald-100 text-center">
                                                                    <FileText size={20} className="text-emerald-500" />
                                                                    <p className="text-[10px] text-emerald-800 font-mono truncate max-w-full w-full">{editForm.existingChallan}</p>
                                                                </div>
                                                                <div className="flex gap-1.5">
                                                                    <a href={`${API_BASE_URL}/uploads/${editForm.existingChallan}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1"><ExternalLink size={9} /> View</a>
                                                                    <label className="flex-1 text-center text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"><UploadCloud size={9} /> Replace<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => setEditForm(prev => ({ ...prev, challanFile: e.target.files[0] || null }))} /></label>
                                                                    <button type="button" onClick={() => setEditForm(prev => ({ ...prev, existingChallan: "" }))} className="flex-1 text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1"><X size={9} /> Remove</button>
                                                                </div>
                                                            </>
                                                        ) : hasNew ? (
                                                            <>
                                                                <div className="flex flex-col items-center gap-1 bg-indigo-50 px-3 py-3 rounded-lg border border-indigo-100 text-center">
                                                                    <UploadCloud size={20} className="text-indigo-400" />
                                                                    <p className="text-[10px] font-semibold text-indigo-800 truncate max-w-full w-full">{editForm.challanFile.name}</p>
                                                                    <p className="text-[9px] text-indigo-400">{(editForm.challanFile.size / 1024).toFixed(1)} KB</p>
                                                                </div>
                                                                <button type="button" onClick={() => setEditForm(prev => ({ ...prev, challanFile: null }))} className="w-full text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1"><X size={9} /> Remove</button>
                                                            </>
                                                        ) : (
                                                            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-indigo-300 rounded-lg px-4 py-6 cursor-pointer transition-colors group w-full">
                                                                <UploadCloud size={24} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
                                                                <p className="text-xs font-semibold text-slate-400 group-hover:text-indigo-500 transition-colors">Choose file</p>
                                                                <p className="text-[10px] text-slate-300">PDF, JPG, PNG, WEBP</p>
                                                                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => setEditForm(prev => ({ ...prev, challanFile: e.target.files[0] || null }))} />
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* ── Final Action ── */}
                                {isDraftBatch ? (
                                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                                        <FileText size={14} className="text-slate-400 shrink-0" />
                                        <p className="text-[11px] text-slate-600 font-semibold">
                                            This order is still in Draft — saving here only stores billing details early. It moves to Active from Order Processing's Confirm step.
                                        </p>
                                    </div>
                                ) : (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Final Action</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setEditForm(prev => ({ ...prev, status: "Send for Billing" }))}
                                            className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 text-xs font-bold transition-all ${editForm.status === "Send for Billing" ? "border-slate-400 bg-slate-100 text-slate-700" : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600"}`}
                                        >
                                            <Clock size={16} />
                                            Keep Pending
                                            <span className="text-[9px] font-normal text-slate-400">Stay in billing queue</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditForm(prev => ({ ...prev, status: "Send for Packing" }))}
                                            className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 text-xs font-bold transition-all ${editForm.status === "Send for Packing" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-400 hover:border-indigo-300 hover:text-indigo-500"}`}
                                        >
                                            <Package size={16} />
                                            Send for Packing
                                            <span className="text-[9px] font-normal">Move to packing</span>
                                        </button>
                                    </div>

                                    {editForm.status === "Send for Packing" && isEwayBillRequired && !editForm.ewayBillFile && !editForm.existingEwayBillName && (
                                        <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                            <AlertTriangle size={12} className="text-red-500 shrink-0" />
                                            <p className="text-[11px] text-red-700 font-semibold">E-Way Bill required before sending for packing</p>
                                        </div>
                                    )}
                                </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="flex gap-2 justify-end px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                                <button type="button" onClick={closeEditModal} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition">
                                    Cancel
                                </button>
                                <button type="submit" className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-md shadow-indigo-200 hover:bg-indigo-700 transition flex items-center gap-1.5">
                                    {editForm.status === "Send for Packing" ? (
                                        <><Package size={13} /> Save & Send for Packing</>
                                    ) : (
                                        <><CheckCircle size={13} /> Save Billing Details</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <AppearanceModal 
                isOpen={appearanceModalOpen} 
                onClose={() => setAppearanceModalOpen(false)} 
                item={appearanceItem} 
                type="dispatch" 
                onUpdated={onRefresh} 
            />
        </div>
    );
}
