"use client";
// Small presentational components shared by the OrderTracking screen.
import React from "react";
import {
  CheckCircle, AlertCircle, Receipt, Truck, CheckSquare,
  FileText, ExternalLink, PauseCircle,
} from "lucide-react";
import { STATUS_CONFIG, resolveDisplayStatus } from "./helpers";

export function StatusBadge({ status, size = "default" }) {
  const displayStatus = resolveDisplayStatus(status);
  const config = STATUS_CONFIG[displayStatus] || STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
  const Icon = config.icon;
  const sizeClasses = { small: "px-2 py-0.5 text-[10px] gap-1", default: "px-2.5 py-1 text-[11px] gap-1", large: "px-3 py-1.5 text-xs gap-1.5" };
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap ${config.bgClass} ${sizeClasses[size]}`}>
      <Icon size={size === "small" ? 9 : size === "large" ? 13 : 11} /><span>{config.label}</span>
    </span>
  );
}

export function StatusTimeline({ currentStatus }) {
  const steps = [
    { key: "Send for Billing", label: "Billing", icon: Receipt },
    { key: "Dispatched", label: "Dispatched", icon: Truck },
    { key: "Delivered", label: "Delivered", icon: CheckCircle },
    { key: "Completed", label: "Completed", icon: CheckSquare },
  ];

  const resolvedStatus = resolveDisplayStatus(currentStatus);
  const currentConfig = STATUS_CONFIG[resolvedStatus] || STATUS_CONFIG[currentStatus] || STATUS_CONFIG.Pending;
  const currentStep = currentConfig.step;

  if (currentStep === -1) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-center gap-2">
        <AlertCircle size={16} className="text-red-500" />
        <span className="text-red-600 font-semibold text-sm">
          {resolvedStatus === "Partially Returned"
              ? "Order Partially Returned"
              : resolvedStatus === "Order Cancelled"
                ? "Order Cancelled"
                : "Order Cancelled / Returned"}
        </span>
      </div>
    );
  }

  if (currentStep === 0 && (currentStatus === "Order Not Confirmed" || resolvedStatus === "Order On Hold")) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <div className="flex items-center justify-center gap-2 mb-2">
          <PauseCircle size={16} className="text-yellow-600" />
          <span className="text-yellow-700 font-semibold text-sm">Order On Hold — Not Yet Confirmed</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <React.Fragment key={step.key}>
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-400">
                    <Icon size={14} />
                  </div>
                  <span className="text-[10px] mt-1.5 font-medium text-slate-400">{step.label}</span>
                </div>
                {index < steps.length - 1 && <div className="flex-1 h-0.5 mx-1.5 rounded bg-slate-200" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  // Hidden Timeline for normal steps, fully preserved via original logic
  return null;
}

export function DocumentButton({ label, filename, onView }) {
  const isAvailable = !!filename;
  return (
    <button
      onClick={() => onView(filename)}
      disabled={!isAvailable}
      className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-all ${isAvailable ? "bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer" : "bg-slate-50 border-slate-100 cursor-not-allowed opacity-60"}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <FileText size={14} className={isAvailable ? "text-indigo-600 flex-shrink-0" : "text-slate-400 flex-shrink-0"} />
        <span className={`font-medium text-xs truncate ${isAvailable ? "text-slate-700" : "text-slate-400"}`}>{label}</span>
      </div>
      <div className="flex-shrink-0 ml-2">
        {isAvailable ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">View <ExternalLink size={8} /></span>
        ) : (
          <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">Missing</span>
        )}
      </div>
    </button>
  );
}

