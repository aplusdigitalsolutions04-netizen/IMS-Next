"use client";
import React, { useState } from "react";
import { Wrench, User, Phone, Calendar, IndianRupee, X, Loader2, Check, MessageSquare, Layers, Building2 } from "lucide-react";
import { format, addDays } from "date-fns";

// Same field layout/styling as the "Edit" tab of the Installations page's
// BatchDetailModal (components/installations/Installations.jsx) — kept
// visually consistent so filling this in at dispatch-review time feels like
// the same form, just reachable a step earlier. Deliberately a smaller field
// set though (no status stepper/quick-status buttons) — this is a quick
// capture right after marking installation required, not the full
// installation workflow (status changes, completion, etc. still happen on
// the Installations page).
const FormField = ({ label, icon: Icon, type = "text", value, onChange, placeholder, prefix }) => (
  <div>
    <label className="flex items-center gap-1 text-xs font-medium text-slate-700 mb-1.5"><Icon size={12} className="text-slate-400" />{label}</label>
    <div className="relative">
      {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all ${prefix ? "pl-6" : ""}`}
      />
    </div>
  </div>
);

export default function InstallationDetailsModal({ batch, onClose, onSave, saving }) {
  const rep = batch?.items?.[0];
  const isBulk = (batch?.items?.length || 0) > 1;
  const [form, setForm] = useState({
    technicianName: rep?.technicianName || "",
    technicianContact: rep?.technicianContact || "",
    scheduledDate: rep?.scheduledDate ? String(rep.scheduledDate).slice(0, 10) : "",
    installationCharges: rep?.installationCharges || "",
    installationRemarks: rep?.installationRemarks || "",
  });

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  if (!batch || !rep) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 backdrop-blur-sm p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-white w-full max-w-xl my-6 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="relative bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-4 text-white">
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center"><Wrench size={20} /></div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-base font-bold">Installation Details</h2>
                  {isBulk && <span className="px-2 py-0.5 bg-white/20 text-[10px] font-bold rounded-full">{batch.items.length} Items</span>}
                </div>
                <p className="text-indigo-200 text-xs flex items-center gap-1"><Building2 size={11} />{rep.firmName || rep.customerName}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"><X size={16} /></button>
          </div>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          {isBulk && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-2.5 flex items-center gap-1.5">
              <Layers size={12} className="text-violet-600" />
              <span className="text-xs font-medium text-violet-700">Details apply to all <strong>{batch.items.length} items</strong></span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Technician Name" icon={User} value={form.technicianName} onChange={(v) => updateField("technicianName", v)} placeholder="Enter name" />
            <FormField label="Technician Contact" icon={Phone} type="tel" value={form.technicianContact} onChange={(v) => updateField("technicianContact", v)} placeholder="Enter phone" />
            <div>
              <FormField label="Scheduled Date" icon={Calendar} type="date" value={form.scheduledDate} onChange={(v) => updateField("scheduledDate", v)} />
              <div className="flex gap-1 mt-1.5">
                {[{ label: "Today", days: 0 }, { label: "Tomorrow", days: 1 }, { label: "+7D", days: 7 }].map((d) => (
                  <button key={d.label} type="button" onClick={() => updateField("scheduledDate", format(addDays(new Date(), d.days), "yyyy-MM-dd"))}
                    className="px-2 py-1 text-[10px] font-medium bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors">{d.label}</button>
                ))}
              </div>
            </div>
            <div>
              <FormField label={isBulk ? "Charges (per item)" : "Charges"} icon={IndianRupee} type="number" value={form.installationCharges} onChange={(v) => updateField("installationCharges", v)} placeholder="0" prefix="₹" />
              <div className="flex gap-1 mt-1.5">
                {[500, 1000, 1500, 2000].map((amt) => (
                  <button key={amt} type="button" onClick={() => updateField("installationCharges", amt)}
                    className="px-2 py-1 text-[10px] font-medium bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 border border-emerald-200 transition-colors">₹{amt}</button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-1 text-xs font-medium text-slate-700 mb-1.5"><MessageSquare size={12} className="text-slate-400" />Remarks</label>
              <textarea value={form.installationRemarks} onChange={(e) => updateField("installationRemarks", e.target.value)} placeholder="Add notes..." rows={2}
                className="w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none transition-all" />
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-medium text-xs hover:bg-slate-50 transition-colors">
            Skip for now
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 transition-all"
          >
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><Check size={14} />Save Details</>}
          </button>
        </div>
      </div>
    </div>
  );
}
