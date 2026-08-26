"use client";
// components/Installations.jsx
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { printerService } from "@/lib/services/api";
import { useToast } from "@/lib/client/ToastContext";
import {
    Wrench, Search, X, Phone, User, Calendar, Clock, Check,
    AlertCircle, IndianRupee, MapPin, Package, Loader2, RefreshCw,
    CheckSquare, AlertTriangle, CheckCircle, XCircle, PlayCircle,
    Edit3, Save, Building2, Truck, MessageSquare, LayoutGrid,
    List, Table2, SortAsc, SortDesc, Eye, ChevronDown, Hash,
    Mail, Copy, MoreVertical, History, Printer, Zap, ArrowRight,
    ChevronLeft, ChevronRight, Filter, Layers, Activity, Target,
    Box, FileText, ChevronUp
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isTomorrow, isPast, differenceInDays, addDays } from "date-fns";

// ── Batch Key Generator ──
function getBatchKey(item) {
    const firm = String(item.firmName || "").trim();
    const customer = String(item.customerName || item.customer || "").trim();
    const bid = String(item.bidNumber || "").trim();
    if (bid) return `${firm}__${bid}`;
    if (customer) return `${firm}__${customer}`;
    return `single__${item.id}`;
}

// ── Loading Skeleton ──
const Skeleton = ({ className }) => (
    <div className={`bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] animate-shimmer rounded ${className}`} />
);
const CardSkeleton = () => (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-start justify-between mb-2"><Skeleton className="h-5 w-16" /><Skeleton className="h-4 w-14 rounded-full" /></div>
        <Skeleton className="h-4 w-3/4 mb-1.5" /><Skeleton className="h-3 w-1/2 mb-3" />
        <div className="flex gap-2"><Skeleton className="h-6 w-6 rounded-full" /><div className="flex-1"><Skeleton className="h-3 w-20 mb-1" /><Skeleton className="h-3 w-14" /></div></div>
    </div>
);

// ── Status Chip ──
const StatusChip = ({ status, variant = "default" }) => {
    const cfg = {
        "Pending": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Clock },
        "Scheduled": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", icon: Calendar },
        "In Progress": { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", icon: PlayCircle },
        "Completed": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle },
        "Cancelled": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: XCircle }
    };
    const c = cfg[status] || cfg["Pending"];
    const Icon = c.icon;
    if (variant === "dot") return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${c.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.bg} ${c.border} border`} />{status}
        </span>
    );
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${c.bg} ${c.text} ${c.border} border`}>
            <Icon size={10} />{status}
        </span>
    );
};

// ── Urgency Badge ──
const UrgencyBadge = ({ date, status }) => {
    if (status === "Completed" || status === "Cancelled" || !date) return null;
    const d = new Date(date);
    const days = differenceInDays(d, new Date());
    if (isPast(d) && !isToday(d)) return <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[9px] font-bold rounded animate-pulse">OVERDUE</span>;
    if (isToday(d)) return <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded">TODAY</span>;
    if (isTomorrow(d)) return <span className="px-1.5 py-0.5 bg-sky-500 text-white text-[9px] font-bold rounded">TOMORROW</span>;
    if (days <= 3) return <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[9px] font-semibold rounded">{days}D LEFT</span>;
    return null;
};

// ── Metric Card ──
const MetricCard = ({ icon: Icon, label, value, color, active, onClick, subtitle }) => {
    const colors = {
        slate: { bg: "bg-slate-500", light: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" },
        amber: { bg: "bg-amber-500", light: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
        sky: { bg: "bg-sky-500", light: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
        violet: { bg: "bg-violet-500", light: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
        emerald: { bg: "bg-emerald-500", light: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
        rose: { bg: "bg-rose-500", light: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
        indigo: { bg: "bg-indigo-500", light: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" }
    };
    const c = colors[color] || colors.slate;
    return (
        <button onClick={onClick} className={`relative group flex flex-col p-3 rounded-lg border-2 transition-all duration-200 min-w-[110px] ${active ? `${c.light} ${c.border} shadow-md scale-[1.02]` : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}>
            <div className={`w-8 h-8 ${c.bg} rounded-lg flex items-center justify-center mb-2 shadow group-hover:scale-110 transition-transform`}>
                <Icon size={16} className="text-white" />
            </div>
            <span className={`text-xl font-bold ${c.text}`}>{value}</span>
            <span className="text-[10px] text-slate-500 font-medium mt-0.5">{label}</span>
            {subtitle && <span className="text-[9px] text-slate-400 mt-0.5">{subtitle}</span>}
            {active && <div className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 ${c.bg} rounded-full`} />}
        </button>
    );
};

// ── Contact Buttons ──
const ContactButtons = ({ phone, name, size = "sm" }) => {
    if (!phone) return null;
    const s = size === "sm" ? "p-1" : "p-1.5";
    const i = size === "sm" ? 10 : 12;
    return (
        <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
            <a href={`tel:${phone}`} className={`${s} bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-200 transition-colors`} title="Call"><Phone size={i} /></a>
            <a href={`https://wa.me/91${phone}?text=Hi ${name || ''}, regarding your printer installation...`} target="_blank" rel="noopener noreferrer" className={`${s} bg-green-100 text-green-600 rounded hover:bg-green-200 transition-colors`} title="WhatsApp"><MessageSquare size={i} /></a>
        </div>
    );
};

// ── View Switcher ──
const ViewSwitcher = ({ view, setView }) => {
    const views = [{ id: "grid", icon: LayoutGrid }, { id: "list", icon: List }, { id: "table", icon: Table2 }];
    return (
        <div className="inline-flex bg-slate-100 p-0.5 rounded-lg">
            {views.map(v => (
                <button key={v.id} onClick={() => setView(v.id)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-all ${view === v.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    <v.icon size={13} />
                </button>
            ))}
        </div>
    );
};

// ── Sort Menu ──
const SortMenu = ({ config, setConfig }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const options = [
        { field: "id", label: "Order", icon: Hash },
        { field: "scheduledDate", label: "Schedule", icon: Calendar },
        { field: "customerName", label: "Customer", icon: User },
        { field: "installationStatus", label: "Status", icon: Activity },
        { field: "createdAt", label: "Created", icon: Clock }
    ];
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);
    const current = options.find(o => o.field === config.field);
    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                {config.direction === "asc" ? <SortAsc size={13} /> : <SortDesc size={13} />}
                <span className="hidden sm:inline">{current?.label || "Sort"}</span>
                <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg border border-slate-200 shadow-xl z-30 py-1">
                    {options.map(opt => (
                        <button key={opt.field} onClick={() => { setConfig(prev => ({ field: opt.field, direction: prev.field === opt.field && prev.direction === "asc" ? "desc" : "asc" })); setOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50 ${config.field === opt.field ? "text-indigo-600 bg-indigo-50" : "text-slate-600"}`}>
                            <span className="flex items-center gap-1.5"><opt.icon size={12} />{opt.label}</span>
                            {config.field === opt.field && (config.direction === "asc" ? <SortAsc size={10} /> : <SortDesc size={10} />)}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Batch Card (Grid) ──
const BatchCard = ({ batch, selected, onSelect, onView, onStatusChange, selectionMode, canManage }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const isBulk = batch.items.length > 1;
    const rep = batch.items[0];

    useEffect(() => {
        const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    const gradients = {
        "Pending": "from-amber-400 to-orange-500", "Scheduled": "from-sky-400 to-blue-500",
        "In Progress": "from-violet-400 to-purple-500", "Completed": "from-emerald-400 to-teal-500",
        "Cancelled": "from-rose-400 to-red-500"
    };
    const earliest = batch.items.filter(i => i.scheduledDate).sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate))[0]?.scheduledDate;
    const totalCharges = batch.items.reduce((s, i) => s + Number(i.installationCharges || 0), 0);
    const techs = [...new Set(batch.items.map(i => i.technicianName).filter(Boolean))];
    const batchIds = batch.items.map(i => i.id);
    const allSel = batchIds.every(id => selected.includes(id));

    return (
        <div onClick={() => !selectionMode && onView(batch)}
            className={`group relative bg-white rounded-lg border-2 overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg ${allSel ? "border-indigo-500 shadow-md shadow-indigo-100 ring-2 ring-indigo-50" : "border-slate-200 hover:border-indigo-200"}`}>
            <div className={`h-1 bg-gradient-to-r ${gradients[rep.installationStatus] || gradients["Pending"]}`} />

            {selectionMode && (
                <div className="absolute top-2 left-2 z-10">
                    <input type="checkbox" checked={allSel}
                        onChange={e => { e.stopPropagation(); allSel ? onSelect(batchIds, "remove") : onSelect(batchIds, "add"); }}
                        onClick={e => e.stopPropagation()} className="w-4 h-4 rounded border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                </div>
            )}

            <div className="absolute top-2 right-2 z-10" ref={menuRef}>
                <button onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                    className="p-1 bg-white/90 backdrop-blur-sm rounded shadow-sm opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition-all">
                    <MoreVertical size={12} className="text-slate-500" />
                </button>
                {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg border border-slate-200 shadow-xl py-1 z-20">
                        <button onClick={e => { e.stopPropagation(); onView(batch); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"><Eye size={12} /> View Details</button>
                    {canManage && (
                        <>
                            <div className="border-t border-slate-100 my-0.5" />
                            {["Scheduled", "In Progress", "Completed"].map(s => (
                                <button key={s} onClick={e => { e.stopPropagation(); batch.items.forEach(item => onStatusChange(item, s)); setMenuOpen(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"><StatusChip status={s} variant="dot" /></button>
                            ))}
                        </>
                    )}
                    </div>
                )}
            </div>

            <div className={`p-3 ${selectionMode ? "pl-8" : ""}`}>
                <div className="flex items-start justify-between gap-1.5 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {isBulk ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[10px] font-bold rounded">
                                <Layers size={9} />{batch.items.length} Items
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded">
                                <Box size={9} />Single
                            </span>
                        )}
                        <UrgencyBadge date={earliest} status={rep.installationStatus} />
                    </div>
                    <StatusChip status={rep.installationStatus} />
                </div>

                <h3 className="font-bold text-slate-800 text-sm mb-0.5 truncate group-hover:text-indigo-600 transition-colors">
                    {rep.firmName || rep.customerName || "Unknown Customer"}
                </h3>
                <p className="text-xs text-slate-500 mb-3 flex items-center gap-1">
                    <Printer size={10} className="text-slate-400 flex-shrink-0" />
                    <span className="truncate">{isBulk ? `${batch.items.length} units • ${rep.modelName}` : rep.modelName}</span>
                    {rep.companyName && <><span className="text-slate-300">•</span><span className="text-slate-400">{rep.companyName}</span></>}
                </p>

                {isBulk && (
                    <div className="mb-2.5 p-1.5 bg-slate-50 rounded border border-slate-100">
                        <div className="flex items-center gap-1 mb-1">
                            <Box size={10} className="text-slate-400" />
                            <span className="text-[9px] font-bold text-slate-500 uppercase">Serials</span>
                        </div>
                        <div className="flex flex-wrap gap-0.5">
                            {batch.items.slice(0, 3).map((item, idx) => (
                                <span key={idx} className="text-[9px] font-mono bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-600">
                                    {item.serialValue || item.serialNumber || "N/A"}
                                </span>
                            ))}
                            {batch.items.length > 3 && <span className="text-[9px] font-bold bg-indigo-50 text-indigo-600 px-1 py-0.5 rounded">+{batch.items.length - 3}</span>}
                        </div>
                    </div>
                )}

                <div className="space-y-1.5">
                    {techs.length > 0 && (
                        <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                            <div className="flex items-center gap-1.5">
                                <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center"><Wrench size={11} className="text-indigo-600" /></div>
                                <div>
                                    <p className="text-[10px] text-slate-400">Technician</p>
                                    <p className="text-xs font-medium text-slate-700">{techs[0]}{techs.length > 1 && <span className="text-slate-400"> +{techs.length - 1}</span>}</p>
                                </div>
                            </div>
                            {rep.technicianContact && <ContactButtons phone={rep.technicianContact} name={techs[0]} />}
                        </div>
                    )}
                    {earliest && (
                        <div className="flex items-center gap-1.5 text-xs">
                            <Calendar size={11} className="text-slate-400" />
                            <span className="font-medium text-slate-700">{format(new Date(earliest), "dd MMM yyyy")}</span>
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{formatDistanceToNow(new Date(earliest), { addSuffix: true })}</span>
                        </div>
                    )}
                    {rep.customerName && rep.firmName && (
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 text-slate-600"><User size={11} className="text-slate-400" /><span>{rep.customerName}</span></div>
                            {rep.contactNo && <ContactButtons phone={rep.contactNo} name={rep.customerName} />}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                        {totalCharges > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded border border-emerald-200">
                                <IndianRupee size={10} />{totalCharges.toLocaleString()}
                            </span>
                        )}
                        {!isBulk && rep.serialNumber && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {rep.serialNumber.length > 10 ? rep.serialNumber.slice(0, 10) + "…" : rep.serialNumber}
                            </span>
                        )}
                    </div>
                    <button onClick={e => { e.stopPropagation(); onView(batch); }}
                        className="flex items-center gap-0.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors group/btn">
                        {isBulk ? "View Batch" : "Open"}<ArrowRight size={12} className="group-hover/btn:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Batch Row (List) ──
const BatchRow = ({ batch, selected, onSelect, onView, selectionMode, canManage }) => {
    const isBulk = batch.items.length > 1;
    const rep = batch.items[0];
    const totalCharges = batch.items.reduce((s, i) => s + Number(i.installationCharges || 0), 0);
    const batchIds = batch.items.map(i => i.id);
    const allSel = batchIds.every(id => selected.includes(id));
    const earliest = batch.items.filter(i => i.scheduledDate).sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate))[0]?.scheduledDate;

    return (
        <div onClick={() => !selectionMode && onView(batch)}
            className={`flex items-center gap-3 p-3 bg-white rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${allSel ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-200"}`}>
            {selectionMode && (
                <input type="checkbox" checked={allSel}
                    onChange={e => { e.stopPropagation(); allSel ? onSelect(batchIds, "remove") : onSelect(batchIds, "add"); }}
                    onClick={e => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
            )}
            <div className="flex items-center gap-2 min-w-[100px]">
                {isBulk ? (
                    <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-[10px] font-bold rounded flex items-center gap-0.5"><Layers size={9} />{batch.items.length}</span>
                ) : (
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded flex items-center gap-0.5"><Box size={9} />Single</span>
                )}
                <UrgencyBadge date={earliest} status={rep.installationStatus} />
            </div>
            <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-slate-800 text-sm truncate">{rep.firmName || rep.customerName}</h4>
                <p className="text-xs text-slate-500 truncate">{isBulk ? `${batch.items.length} units • ` : ""}{rep.modelName} • {rep.companyName}</p>
            </div>
            <div className="hidden md:flex items-center gap-1.5 min-w-[130px]">
                {rep.technicianName ? (
                    <><div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center"><Wrench size={10} className="text-indigo-600" /></div><span className="text-xs text-slate-600">{rep.technicianName}</span></>
                ) : <span className="text-xs text-slate-400 italic">No tech</span>}
            </div>
            <div className="hidden lg:block min-w-[100px]">
                {earliest ? <span className="text-xs text-slate-600">{format(new Date(earliest), "dd MMM yy")}</span> : <span className="text-xs text-slate-400 italic">—</span>}
            </div>
            <div className="min-w-[90px]"><StatusChip status={rep.installationStatus} /></div>
            {totalCharges > 0 && <div className="hidden lg:block min-w-[70px]"><span className="text-xs font-bold text-emerald-600">₹{totalCharges.toLocaleString()}</span></div>}
            {canManage && <button onClick={e => { e.stopPropagation(); onView(batch); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"><Edit3 size={14} /></button>}
        </div>
    );
};

// ── Batch Table ──
const BatchTable = ({ batches, selectedIds, onSelect, onView, selectionMode, canManage }) => {
    const allIds = batches.flatMap(b => b.items.map(i => i.id));
    const allSel = allIds.length > 0 && allIds.every(id => selectedIds.includes(id));
    return (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            {selectionMode && <th className="px-3 py-2 text-left w-10"><input type="checkbox" checked={allSel} onChange={() => allSel ? onSelect([], "set") : onSelect(allIds, "set")} className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600" /></th>}
                            <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">Type</th>
                            <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                            <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">Product</th>
                            <th className="px-3 py-2 text-center font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                            <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Technician</th>
                            <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Schedule</th>
                            <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">₹</th>
                            {canManage && <th className="px-3 py-2 w-10"></th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {batches.map(batch => {
                            const rep = batch.items[0];
                            const isBulk = batch.items.length > 1;
                            const bIds = batch.items.map(i => i.id);
                            const bSel = bIds.every(id => selectedIds.includes(id));
                            const tc = batch.items.reduce((s, i) => s + Number(i.installationCharges || 0), 0);
                            const es = batch.items.filter(i => i.scheduledDate).sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate))[0]?.scheduledDate;
                            return (
                                <tr key={batch.batchKey} onClick={() => !selectionMode && onView(batch)} className={`cursor-pointer transition-colors ${bSel ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                                    {selectionMode && <td className="px-3 py-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={bSel} onChange={() => bSel ? onSelect(bIds, "remove") : onSelect(bIds, "add")} className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600" /></td>}
                                    <td className="px-3 py-2">
                                        {isBulk ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-violet-50 text-violet-700 text-[10px] font-bold rounded"><Layers size={9} />Batch</span>
                                            : <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded"><Box size={9} />Single</span>}
                                    </td>
                                    <td className="px-3 py-2"><p className="font-semibold text-slate-800">{rep.firmName || rep.customerName}</p>{rep.firmName && rep.customerName && <p className="text-[10px] text-slate-500">{rep.customerName}</p>}</td>
                                    <td className="px-3 py-2 hidden md:table-cell"><p className="text-slate-600">{rep.modelName}</p><p className="text-[10px] text-slate-400">{rep.companyName}</p></td>
                                    <td className="px-3 py-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isBulk ? "bg-violet-50 text-violet-700" : "bg-slate-50 text-slate-600"}`}>{batch.items.length}</span></td>
                                    <td className="px-3 py-2 hidden lg:table-cell">
                                        {rep.technicianName ? <div className="flex items-center gap-1"><span className="text-slate-600">{rep.technicianName}</span>{rep.technicianContact && <ContactButtons phone={rep.technicianContact} name={rep.technicianName} />}</div> : <span className="text-slate-400 italic">—</span>}
                                    </td>
                                    <td className="px-3 py-2 hidden sm:table-cell">
                                        {es ? <div className="flex flex-col gap-0.5"><span className="text-slate-600">{format(new Date(es), "dd MMM yy")}</span><UrgencyBadge date={es} status={rep.installationStatus} /></div> : <span className="text-slate-400 italic">—</span>}
                                    </td>
                                    <td className="px-3 py-2"><StatusChip status={rep.installationStatus} /></td>
                                    <td className="px-3 py-2 hidden lg:table-cell">{tc > 0 ? <span className="font-bold text-emerald-600">₹{tc.toLocaleString()}</span> : <span className="text-slate-400">—</span>}</td>
                                {canManage && <td className="px-3 py-2" onClick={e => e.stopPropagation()}><button onClick={() => onView(batch)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"><Edit3 size={12} /></button></td>}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ── Progress Stepper ──
const ProgressStepper = ({ status }) => {
    const steps = [
        { key: "Pending", label: "Pending", icon: Clock },
        { key: "Scheduled", label: "Scheduled", icon: Calendar },
        { key: "In Progress", label: "In Progress", icon: PlayCircle },
        { key: "Completed", label: "Completed", icon: CheckCircle }
    ];
    const idx = steps.findIndex(s => s.key === status);
    if (status === "Cancelled") return (
        <div className="flex items-center gap-2 p-3 bg-rose-50/50 rounded-lg border border-rose-200"><XCircle className="text-rose-500" size={16} /><span className="font-semibold text-rose-700 text-sm">Cancelled</span></div>
    );
    return (
        <div className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg">
            {steps.map((step, i) => {
                const done = i < idx;
                const active = i === idx;
                const Icon = step.icon;
                return (
                    <React.Fragment key={step.key}>
                        <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${done ? "bg-emerald-500 text-white shadow-lg" : active ? "bg-white text-indigo-600 shadow-lg ring-2 ring-white/50" : "bg-white/20 text-white/50"}`}>
                                {done ? <Check size={14} /> : <Icon size={14} />}
                            </div>
                            <span className={`text-[10px] font-medium mt-1 ${active ? "text-white" : done ? "text-emerald-200" : "text-white/40"}`}>{step.label}</span>
                        </div>
                        {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 rounded-full ${done ? "bg-emerald-400" : "bg-white/20"}`} />}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

// ── Info Row ──
const InfoRow = ({ label, value, icon: Icon, mono, isPhone, onCopy }) => (
    <div className="flex items-start gap-2">
        <Icon size={12} className={`${value ? "text-slate-400" : "text-slate-300"} mt-0.5 flex-shrink-0`} />
        <div className="flex-1 min-w-0">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider">{label}</p>
            {value ? (
                <div className="flex items-center gap-1.5">
                    <p className={`text-xs text-slate-700 font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
                    {onCopy && <button onClick={onCopy} className="p-0.5 text-slate-400 hover:text-slate-600 rounded"><Copy size={10} /></button>}
                    {isPhone && <ContactButtons phone={value} size="sm" />}
                </div>
            ) : <p className="text-xs text-slate-400 italic">Not provided</p>}
        </div>
    </div>
);

// ── Form Field ──
const FormField = ({ label, icon: Icon, type = "text", value, onChange, placeholder, prefix }) => (
    <div>
        <label className="flex items-center gap-1 text-xs font-medium text-slate-700 mb-1.5"><Icon size={12} className="text-slate-400" />{label}</label>
        <div className="relative">
            {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">{prefix}</span>}
            <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className={`w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all ${prefix ? "pl-6" : ""}`} />
        </div>
    </div>
);

// ── Batch Detail Modal ──
const getBatchFormDefaults = (item) => ({
    technicianName: item?.technicianName || "",
    technicianContact: item?.technicianContact || "",
    installationStatus: item?.installationStatus || "Pending",
    installationCharges: item?.installationCharges || "",
    installationRemarks: item?.installationRemarks || "",
    scheduledDate: item?.scheduledDate ? format(new Date(item.scheduledDate), "yyyy-MM-dd") : ""
});

const BatchDetailModal = ({ batch, isOpen, onClose, onSave, saving, notify, canManage }) => {
    const isBulk = batch?.items?.length > 1;
    const rep = batch?.items?.[0];
    const [tab, setTab] = useState("info");
    const [form, setForm] = useState(() => getBatchFormDefaults(rep));
    const [dirty, setDirty] = useState(false);
    const [expandedItems, setExpandedItems] = useState(false);

    const updateField = (f, v) => { setForm(p => ({ ...p, [f]: v })); setDirty(true); };
    const copyText = (text, label) => { navigator.clipboard.writeText(text); notify(`${label} copied!`, "success"); };

    if (!isOpen || !batch || !rep) return null;
    const totalCharges = batch.items.reduce((s, i) => s + Number(i.installationCharges || 0), 0);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-3 overflow-y-auto" onClick={onClose}>
            <div className="bg-white w-full max-w-xl my-6 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="relative bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-4 text-white">
                    <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center"><Wrench size={20} /></div>
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <h2 className="text-base font-bold">{isBulk ? "Batch Installation" : `Installation Details`}</h2>
                                    {isBulk && <span className="px-2 py-0.5 bg-white/20 text-[10px] font-bold rounded-full">{batch.items.length} Items</span>}
                                    {dirty && <span className="px-1.5 py-0.5 bg-amber-400 text-amber-900 text-[9px] font-bold rounded-full">UNSAVED</span>}
                                </div>
                                <p className="text-indigo-200 text-xs flex items-center gap-1"><Building2 size={11} />{rep.firmName || rep.customerName}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"><X size={16} /></button>
                    </div>
                    <div className="mt-4"><ProgressStepper status={form.installationStatus} /></div>
                </div>

                {/* Tabs */}
                <div className="border-b border-slate-200 bg-slate-50 px-4">
                    <div className="flex gap-0.5">
                        {[
                            { id: "info", label: "Info", icon: FileText },
                            ...(isBulk ? [{ id: "items", label: `Items (${batch.items.length})`, icon: Layers }] : []),
                        ...(canManage ? [{ id: "edit", label: "Edit", icon: Edit3 }] : []),
                            { id: "logs", label: "Activity", icon: History }
                        ].map(t => (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? "border-indigo-600 text-indigo-600 bg-white" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                                <t.icon size={12} />{t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Body */}
                <div className="p-4 max-h-[50vh] overflow-y-auto">
                    {tab === "info" && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><User size={10} /> Customer</h3>
                                    <div className="space-y-2">
                                        <InfoRow label="Order ID" value={rep.customerName} icon={User} onCopy={() => copyText(rep.customerName, "Order ID")} />
                                        <InfoRow label="Platform" value={rep.firmName} icon={Building2} />
                                        <InfoRow label="Contact" value={rep.contactNumber} icon={Phone} isPhone />
                                        <InfoRow label="Email" value={rep.buyerEmail} icon={Mail} />
                                    </div>
                                </div>
                                <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                                    <h3 className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1"><Printer size={10} /> Product</h3>
                                    <div className="space-y-2">
                                        <InfoRow label="Model" value={rep.modelName} icon={Printer} />
                                        <InfoRow label="Company" value={rep.companyName} icon={Building2} />
                                        {!isBulk && <InfoRow label="Serial" value={rep.serialNumber || rep.serialValue} icon={Hash} mono onCopy={() => copyText(rep.serialNumber || rep.serialValue, "Serial")} />}
                                        <InfoRow label="Dispatch" value={rep.dispatchDate ? format(new Date(rep.dispatchDate), "dd MMM yyyy") : null} icon={Truck} />
                                        {isBulk && <div className="flex items-start gap-2"><Layers size={12} className="text-indigo-400 mt-0.5" /><div><p className="text-[9px] text-indigo-400 uppercase tracking-wider">Quantity</p><p className="text-xs text-indigo-700 font-bold">{batch.items.length} Units</p></div></div>}
                                    </div>
                                </div>
                                <div className="md:col-span-2 bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                                    <h3 className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1"><MapPin size={10} /> Address</h3>
                                    <p className="text-xs text-slate-700">{rep.shippingAddress || <span className="text-slate-400 italic">No address</span>}</p>
                                </div>
                            </div>
                            {isBulk && (
                                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                    <button onClick={() => setExpandedItems(!expandedItems)} className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors">
                                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><Box size={12} />Items ({batch.items.length})</span>
                                        {expandedItems ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                                    </button>
                                    {expandedItems && (
                                        <div className="divide-y divide-slate-100">
                                            {batch.items.map((item, idx) => (
                                                <div key={idx} className="px-3 py-2 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-slate-400 w-5">{idx + 1}</span>
                                                        <div><span className="text-xs font-mono text-slate-700">{item.serialValue || item.serialNumber || "N/A"}</span><p className="text-[10px] text-slate-500">{item.modelName}</p></div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <StatusChip status={item.installationStatus} />
                                                        {item.installationCharges > 0 && <span className="text-[10px] font-bold text-emerald-600">₹{Number(item.installationCharges).toLocaleString()}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                            {totalCharges > 0 && <div className="px-3 py-2 bg-emerald-50 flex items-center justify-between"><span className="text-xs font-bold text-emerald-700">Total</span><span className="text-xs font-bold text-emerald-700">₹{totalCharges.toLocaleString()}</span></div>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {tab === "items" && isBulk && (
                        <div className="space-y-3">
                            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 flex items-center justify-between">
                                <span className="text-xs font-bold text-violet-700 flex items-center gap-1.5"><Layers size={14} />All Items</span>
                                <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">{batch.items.length} Total</span>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            
                                            <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase">Serial</th>
                                            <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase">Model</th>
                                            <th className="px-3 py-2 text-center font-bold text-slate-500 uppercase">Status</th>
                                            <th className="px-3 py-2 text-right font-bold text-slate-500 uppercase">₹</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {batch.items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="px-3 py-2 text-slate-400 font-bold">{idx + 1}</td>
                                                <td className="px-3 py-2 font-mono text-slate-700">{item.serialValue || item.serialNumber || "N/A"}</td>
                                                <td className="px-3 py-2 text-slate-600">{item.modelName}</td>
                                                <td className="px-3 py-2 text-center"><StatusChip status={item.installationStatus} /></td>
                                                <td className="px-3 py-2 text-right">{item.installationCharges > 0 ? <span className="font-bold text-emerald-600">₹{Number(item.installationCharges).toLocaleString()}</span> : <span className="text-slate-400">—</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-emerald-50 border-t border-emerald-200">
                                        <tr><td colSpan="4" className="px-3 py-2 text-right font-bold text-emerald-700">Total</td><td className="px-3 py-2 text-right font-bold text-emerald-700">₹{totalCharges.toLocaleString()}</td></tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}

                    {tab === "edit" && (
                        <div className="space-y-4">
                            {isBulk && (
                                <div className="bg-violet-50 border border-violet-200 rounded-lg p-2.5 flex items-center gap-1.5">
                                    <Layers size={12} className="text-violet-600" />
                                    <span className="text-xs font-medium text-violet-700">Changes apply to all <strong>{batch.items.length} items</strong></span>
                                </div>
                            )}
                            <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                                <h3 className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1"><Zap size={10} /> Quick Status</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {["Pending", "Scheduled", "In Progress", "Completed", "Cancelled"].map(s => (
                                        <button key={s} onClick={() => updateField("installationStatus", s)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${form.installationStatus === s
                                                ? s === "Cancelled" ? "bg-rose-500 text-white border-rose-500 shadow" : "bg-indigo-600 text-white border-indigo-600 shadow"
                                                : s === "Cancelled" ? "bg-white text-rose-600 border-rose-200 hover:border-rose-400" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-400"}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <FormField label="Technician Name" icon={User} value={form.technicianName} onChange={v => updateField("technicianName", v)} placeholder="Enter name" />
                                <FormField label="Technician Contact" icon={Phone} type="tel" value={form.technicianContact} onChange={v => updateField("technicianContact", v)} placeholder="Enter phone" />
                                <div>
                                    <FormField label="Scheduled Date" icon={Calendar} type="date" value={form.scheduledDate} onChange={v => updateField("scheduledDate", v)} />
                                    <div className="flex gap-1 mt-1.5">
                                        {[{ label: "Today", days: 0 }, { label: "Tomorrow", days: 1 }, { label: "+7D", days: 7 }].map(d => (
                                            <button key={d.label} type="button" onClick={() => updateField("scheduledDate", format(addDays(new Date(), d.days), "yyyy-MM-dd"))}
                                                className="px-2 py-1 text-[10px] font-medium bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors">{d.label}</button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <FormField label={isBulk ? "Charges (per item)" : "Charges"} icon={IndianRupee} type="number" value={form.installationCharges} onChange={v => updateField("installationCharges", v)} placeholder="0" prefix="₹" />
                                    <div className="flex gap-1 mt-1.5">
                                        {[500, 1000, 1500, 2000].map(amt => (
                                            <button key={amt} type="button" onClick={() => updateField("installationCharges", amt)}
                                                className="px-2 py-1 text-[10px] font-medium bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 border border-emerald-200 transition-colors">₹{amt}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="flex items-center gap-1 text-xs font-medium text-slate-700 mb-1.5"><MessageSquare size={12} className="text-slate-400" />Remarks</label>
                                    <textarea value={form.installationRemarks} onChange={e => updateField("installationRemarks", e.target.value)} placeholder="Add notes..." rows={2}
                                        className="w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none transition-all" />
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === "logs" && (
                        <div className="py-2">
                            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-4 flex items-center gap-2">
                                <History size={14} className="text-indigo-600" />
                                <span className="text-xs font-medium text-indigo-800">Timeline generated from available order history.</span>
                            </div>
                            <div className="relative border-l-2 border-slate-200 ml-4 space-y-5 pb-4">
                                {(() => {
                                    const events = [];
                                    if (rep.installationStatus) {
                                        events.push({ id: 'status', title: `Status: ${rep.installationStatus}`, desc: `Current installation status is marked as ${rep.installationStatus}.`, date: new Date(), icon: rep.installationStatus === "Completed" ? CheckCircle : Activity, color: rep.installationStatus === "Completed" ? "text-emerald-600" : "text-amber-600", bg: rep.installationStatus === "Completed" ? "bg-emerald-100" : "bg-amber-100" });
                                    }
                                    if (rep.technicianName) {
                                        events.push({ id: 'tech', title: "Technician Assigned", desc: `${rep.technicianName} assigned for installation.`, date: rep.scheduledDate ? new Date(rep.scheduledDate) : new Date(), icon: User, color: "text-violet-600", bg: "bg-violet-100" });
                                    }
                                    if (rep.dispatchDate) {
                                        events.push({ id: 'disp', title: "Order Dispatched", desc: "Item was dispatched and logged into the system.", date: new Date(rep.dispatchDate), icon: Truck, color: "text-sky-600", bg: "bg-sky-100" });
                                    }
                                    if (rep.createdAt) {
                                        events.push({ id: 'create', title: "Installation Record Created", desc: "Initial record generated.", date: new Date(rep.createdAt), icon: FileText, color: "text-slate-600", bg: "bg-slate-200" });
                                    }

                                    return events.map((ev) => (
                                        <div key={ev.id} className="relative pl-6">
                                            <div className={`absolute -left-[17px] top-1 w-8 h-8 rounded-full border-4 border-white ${ev.bg} flex items-center justify-center shadow-sm`}>
                                                <ev.icon size={12} className={ev.color} />
                                            </div>
                                            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="text-xs font-bold text-slate-700">{ev.title}</h4>
                                                    <span className="text-[9px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                                        {format(ev.date, "dd MMM yyyy")}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-500 leading-relaxed">{ev.desc}</p>
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="flex items-center gap-0.5"><Clock size={10} />Created: {rep.createdAt ? format(new Date(rep.createdAt), "dd MMM yy") : "N/A"}</span>
                        {rep.dispatchDate && <span className="flex items-center gap-0.5"><Truck size={10} />Dispatched: {format(new Date(rep.dispatchDate), "dd MMM yy")}</span>}
                        {isBulk && <span className="flex items-center gap-0.5 text-violet-600 font-bold"><Layers size={10} />{batch.items.length} Items</span>}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-medium text-xs hover:bg-slate-50 transition-colors">Cancel</button>
                    {canManage && (
                        <button onClick={() => onSave(form, batch)} disabled={saving || !dirty}
                            className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 transition-all">
                            {saving ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><Save size={14} />{isBulk ? "Save All" : "Save"}</>}
                        </button>
                    )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ════════════════════════════════════════════
// 🏠 MAIN COMPONENT
// ════════════════════════════════════════════
export default function Installations({ installations: propInstallations, stats: propStats, isLoaded = false, onRefresh, isSupervisor, currentUser }) {
    const [installations, setInstallations] = useState(propInstallations || []);
    const [stats, setStats] = useState(propStats || null);
    const [loading, setLoading] = useState(!isLoaded);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState("grid");
    const [sort, setSort] = useState({ field: "id", direction: "desc" });
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);

    // Supervisors are view-only for installations; everyone else with access to
    // this page (Admin, User, Operator) can fill in/edit installation details.
    const canManage = !isSupervisor;

    const toastCtx = useToast();
    const notify = useCallback((message, type = "info") => toastCtx.show(message, type), [toastCtx]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [instData, statsData] = await Promise.all([printerService.getInstallations(), printerService.getInstallationStats()]);
            setInstallations(instData);
            setStats(statsData);
        } catch { notify("Failed to load installations", "error"); }
        finally { setLoading(false); }
    }, [notify]);

    const refreshInstallations = useCallback(async () => {
        if (onRefresh) {
            await onRefresh({ includeInstallations: true });
            return;
        }

        await loadData();
    }, [loadData, onRefresh]);

    useEffect(() => { 
        if (isLoaded) {
            setInstallations(Array.isArray(propInstallations) ? propInstallations : []);
            setStats(propStats || null);
            setLoading(false);
        } else {
            loadData(); 
        }
    }, [isLoaded, propInstallations, propStats, loadData]);

    const groupedBatches = useMemo(() => {
        const groups = {};
        installations.forEach(item => {
            const key = getBatchKey(item);
            if (!groups[key]) groups[key] = { batchKey: key, items: [] };
            groups[key].items.push(item);
        });
        return Object.values(groups);
    }, [installations]);

    const filteredBatches = useMemo(() => {
        let result = groupedBatches.filter(batch => {
            const q = search.toLowerCase();
            const matchSearch = batch.items.some(item =>
                item.firmName?.toLowerCase().includes(q) || item.customerName?.toLowerCase().includes(q) ||
                item.modelName?.toLowerCase().includes(q) || item.technicianName?.toLowerCase().includes(q) ||
                item.serialNumber?.toLowerCase().includes(q) || item.serialValue?.toLowerCase().includes(q) || String(item.id).includes(q)
            );
            const matchStatus = statusFilter === "All" || batch.items.some(item => item.installationStatus === statusFilter);
            return matchSearch && matchStatus;
        });
        result.sort((a, b) => {
            const aR = a.items[0], bR = b.items[0];
            let aV = aR[sort.field], bV = bR[sort.field];
            if (sort.field.includes("Date") || sort.field === "createdAt") { aV = aV ? new Date(aV).getTime() : 0; bV = bV ? new Date(bV).getTime() : 0; }
            if (typeof aV === "string") aV = aV.toLowerCase();
            if (typeof bV === "string") bV = bV.toLowerCase();
            if (aV < bV) return sort.direction === "asc" ? -1 : 1;
            if (aV > bV) return sort.direction === "asc" ? 1 : -1;
            return 0;
        });
        return result;
    }, [groupedBatches, search, statusFilter, sort]);

    const openModal = useCallback((batch) => { setSelectedBatch(batch); setModalOpen(true); }, []);
    const closeModal = useCallback(() => { setModalOpen(false); setSelectedBatch(null); }, []);

    const handleSave = async (formData, batch) => {
        if (!batch) return;
        setSaving(true);
        try {
            await Promise.all(batch.items.map(item => printerService.updateInstallation(item.id, formData)));
            notify(`${batch.items.length > 1 ? 'Batch' : 'Installation'} updated!`, "success");
            await refreshInstallations();
            closeModal();
        } catch (err) { notify(err.message || "Update failed", "error"); }
        finally { setSaving(false); }
    };

    const handleQuickStatus = async (item, status) => {
        try { await printerService.updateInstallation(item.id, { installationStatus: status }); notify(`Status → ${status}`, "success"); loadData(); }
        catch { notify("Update failed", "error"); }
    };

    const toggleSelect = (ids, action) => {
        if (action === "set") setSelectedIds(Array.isArray(ids) ? ids : [ids]);
        else if (action === "add") { const a = Array.isArray(ids) ? ids : [ids]; setSelectedIds(p => [...new Set([...p, ...a])]); }
        else if (action === "remove") { const a = Array.isArray(ids) ? ids : [ids]; setSelectedIds(p => p.filter(id => !a.includes(id))); }
        else { if (Array.isArray(ids)) setSelectedIds(ids); else setSelectedIds(p => p.includes(ids) ? p.filter(i => i !== ids) : [...p, ids]); }
    };

    const handleBulkAction = async (status) => {
        if (!selectedIds.length) return;
        try {
            const result = await printerService.bulkUpdateInstallations(selectedIds, { installationStatus: status });
            const successCount = result?.results?.success?.length ?? selectedIds.length;
            const failedCount = result?.results?.failed?.length || 0;
            notify(
                failedCount > 0 ? `${successCount} items → ${status}. ${failedCount} failed.` : `${successCount} items → ${status}`,
                failedCount > 0 ? "warning" : "success"
            );
            setSelectedIds([]); setSelectMode(false); loadData();
        }
        catch { notify("Bulk update failed", "error"); }
    };

    const totalItems = installations.length;

    if (loading) return (
        <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-3 mb-4"><Skeleton className="w-10 h-10 rounded-lg" /><div><Skeleton className="h-5 w-40 mb-1.5" /><Skeleton className="h-3 w-28" /></div></div>
                <div className="flex gap-2 overflow-hidden">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 w-28 flex-shrink-0 rounded-lg" />)}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{[1, 2, 3, 4, 5, 6, 7, 8].map(i => <CardSkeleton key={i} />)}</div>
        </div>
    );

    return (
        <div className="space-y-4 pb-20 min-h-screen">
            {/* Header */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-4">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shadow"><Wrench className="text-white" size={20} /></div>
                            <div>
                                <h1 className="text-lg font-bold text-white">Installation Manager</h1>
                                <p className="text-indigo-200 text-xs">
                                    Track & manage installations
                                    <span className="ml-2 bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-bold">{filteredBatches.length} Batches • {totalItems} Items</span>
                                </p>
                            </div>
                        </div>
                        <button onClick={refreshInstallations} className="flex items-center gap-1.5 px-3 py-2 bg-white/20 backdrop-blur-sm text-white rounded-lg hover:bg-white/30 font-medium text-xs transition-colors">
                            <RefreshCw size={14} />Refresh
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="p-4 border-b border-slate-100">
                    {stats && (
                        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                            <MetricCard icon={Layers} value={stats.total || 0} label="Total" color="slate" active={statusFilter === "All"} onClick={() => setStatusFilter("All")} />
                            <MetricCard icon={Clock} value={stats.pending || 0} label="Pending" color="amber" active={statusFilter === "Pending"} onClick={() => setStatusFilter("Pending")} />
                            <MetricCard icon={Calendar} value={stats.scheduled || 0} label="Scheduled" color="sky" active={statusFilter === "Scheduled"} onClick={() => setStatusFilter("Scheduled")} />
                            <MetricCard icon={PlayCircle} value={stats.inProgress || 0} label="In Progress" color="violet" active={statusFilter === "In Progress"} onClick={() => setStatusFilter("In Progress")} />
                            <MetricCard icon={CheckCircle} value={stats.completed || 0} label="Completed" color="emerald" active={statusFilter === "Completed"} onClick={() => setStatusFilter("Completed")} />
                            <MetricCard icon={IndianRupee} value={`₹${Number(stats.totalCharges || 0).toLocaleString()}`} label="Revenue" color="indigo" subtitle="Total Charges" />
                        </div>
                    )}
                </div>

                {/* Search & Filters */}
                <div className="p-4">
                    <div className="flex flex-col lg:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="Search customer, model, technician, serial..." value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-10 pr-8 py-2.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                            {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full"><X size={14} /></button>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                className="px-3 py-2.5 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none cursor-pointer font-medium">
                                <option value="All">All Status</option>
                                <option value="Pending">Pending</option>
                                <option value="Scheduled">Scheduled</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                                <option value="Cancelled">Cancelled</option>
                            </select>
                            <SortMenu config={sort} setConfig={setSort} />
                            <ViewSwitcher view={view} setView={setView} />
                            {!isSupervisor && (
                            <button onClick={() => { setSelectMode(!selectMode); setSelectedIds([]); }}
                                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${selectMode ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                                {selectMode ? <X size={14} /> : <CheckSquare size={14} />}
                                {selectMode ? "Cancel" : "Select"}
                            </button>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-between items-center mt-3 text-xs">
                        <p className="text-slate-500">
                            Showing <span className="font-bold text-slate-700">{filteredBatches.length}</span> batches
                            {" "}(<span className="font-bold text-slate-700">{filteredBatches.reduce((s, b) => s + b.items.length, 0)}</span> items)
                            {" "}of <span className="font-bold text-slate-700">{totalItems}</span>
                        </p>
                        {(search || statusFilter !== "All") && (
                            <button onClick={() => { setSearch(""); setStatusFilter("All"); }} className="text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-0.5"><X size={12} />Clear</button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            {filteredBatches.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                    <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4"><Box size={28} className="text-slate-300" /></div>
                    <h3 className="text-lg font-bold text-slate-700 mb-1">No Installations Found</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">{search || statusFilter !== "All" ? "Try adjusting your filters." : "New installations will appear here."}</p>
                    {(search || statusFilter !== "All") && (
                        <button onClick={() => { setSearch(""); setStatusFilter("All"); }} className="mt-3 px-3 py-1.5 bg-indigo-100 text-indigo-600 rounded-lg font-medium text-xs hover:bg-indigo-200 transition-colors">Clear filters</button>
                    )}
                </div>
            ) : view === "table" ? (
                <BatchTable batches={filteredBatches} selectedIds={selectedIds} onSelect={toggleSelect} onView={openModal} selectionMode={selectMode} canManage={canManage} />
            ) : view === "list" ? (
                <div className="space-y-2">
                    {filteredBatches.map(batch => <BatchRow key={batch.batchKey} batch={batch} selected={selectedIds} onSelect={toggleSelect} onView={openModal} selectionMode={selectMode} canManage={canManage} />)}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredBatches.map(batch => <BatchCard key={batch.batchKey} batch={batch} selected={selectedIds} onSelect={toggleSelect} onView={openModal} onStatusChange={handleQuickStatus} selectionMode={selectMode && !isSupervisor} canManage={canManage} />)}
                </div>
            )}

            {/* Modal */}
            <BatchDetailModal key={selectedBatch?.batchKey || selectedBatch?.id || "installations-empty"} batch={selectedBatch} isOpen={modalOpen} onClose={closeModal} onSave={handleSave} saving={saving} notify={notify} canManage={canManage} />

            {/* Bulk Action Bar */}
            {selectedIds.length > 0 && !isSupervisor && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-sm">{selectedIds.length}</div>
                        <span className="text-xs font-medium">selected</span>
                    </div>
                    <div className="h-6 w-px bg-slate-700" />
                    <div className="flex gap-1.5">
                        <button onClick={() => handleBulkAction("Scheduled")} className="px-3 py-1.5 bg-sky-500/20 text-sky-400 rounded-lg text-xs font-medium hover:bg-sky-500/30 flex items-center gap-1"><Calendar size={12} />Schedule</button>
                        <button onClick={() => handleBulkAction("In Progress")} className="px-3 py-1.5 bg-violet-500/20 text-violet-400 rounded-lg text-xs font-medium hover:bg-violet-500/30 flex items-center gap-1"><PlayCircle size={12} />Start</button>
                        <button onClick={() => handleBulkAction("Completed")} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/30 flex items-center gap-1"><CheckCircle size={12} />Complete</button>
                    </div>
                    <button onClick={() => { setSelectedIds([]); setSelectMode(false); }} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-1"><X size={16} /></button>
                </div>
            )}

            <style>{`
                @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
                .animate-shimmer { animation: shimmer 1.5s infinite linear; }
            `}</style>
        </div>
    );
}

