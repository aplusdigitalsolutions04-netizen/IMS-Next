"use client";
// Small presentational pieces extracted out of Dispatch.jsx — pure
// functions/components, no logic changed, just moved to their own file so
// the main component isn't 1600+ lines of everything mixed together.
import { differenceInDays } from "date-fns";
import { AlertTriangle } from "lucide-react";

export function getDeadlineUrgency(lastDeliveryDate, status) {
  if (!lastDeliveryDate) return { level: "none", label: "", daysLeft: null };

  const cancelledStatuses = ["Order Cancelled", "Delivered", "Completed", "RTO", "POD Pending"];
  if (cancelledStatuses.includes(status)) return { level: "none", label: "", daysLeft: null };

  try {
    const deadline = new Date(lastDeliveryDate);
    if (isNaN(deadline.getTime())) return { level: "none", label: "", daysLeft: null };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadline.setHours(0, 0, 0, 0);

    const daysLeft = differenceInDays(deadline, today);

    if (daysLeft < 0) return { level: "overdue", label: `${Math.abs(daysLeft)}d OVERDUE`, daysLeft };
    if (daysLeft === 0) return { level: "today", label: "DUE TODAY", daysLeft: 0 };
    if (daysLeft === 1) return { level: "critical", label: "DUE TOMORROW", daysLeft: 1 };
    if (daysLeft <= 3) return { level: "warning", label: `${daysLeft}d LEFT`, daysLeft };
    return { level: "safe", label: "", daysLeft };
  } catch {
    return { level: "none", label: "", daysLeft: null };
  }
}

export const DeadlineBadge = ({ lastDeliveryDate, status }) => {
  const urgency = getDeadlineUrgency(lastDeliveryDate, status);
  if (urgency.level === "none" || urgency.level === "safe") return null;

  const styles = {
    overdue: "bg-red-500 text-white animate-pulse",
    today: "bg-red-500 text-white",
    critical: "bg-orange-500 text-white",
    warning: "bg-amber-100 text-amber-700 border border-amber-300"
  };

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${styles[urgency.level]}`}>
      <AlertTriangle size={9} />
      {urgency.label}
    </span>
  );
};

export const StatCard = ({ icon: Icon, label, value, color, subText, onClick, className = "" }) => {
  const textColorClasses = color.split(' ').find(c => c.startsWith('text-')) || 'text-slate-600';
  const bgColorClasses = color.split(' ').find(c => c.startsWith('bg-')) || 'bg-slate-50';
  const borderColor = textColorClasses.replace('text-', 'border-').replace(/600|700|800/, '200').replace(/500/, '100');

  return (
    <div
      onClick={onClick}
      className={`bg-white p-3 sm:p-4 rounded-2xl border ${borderColor} shadow-sm relative overflow-hidden transition-all duration-300 flex items-center gap-3 sm:gap-4 w-full ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : "hover:shadow-md"} ${className}`}
    >
      <div className="absolute -right-3 -bottom-3 opacity-[0.06] pointer-events-none transform rotate-12">
        <Icon size={80} className={textColorClasses} />
      </div>
      <div className={`p-2.5 sm:p-3 rounded-xl ${bgColorClasses} ${textColorClasses} shadow-inner border ${borderColor} relative z-10 flex-shrink-0`}>
        <Icon size={20} className="sm:w-[22px] sm:h-[22px] w-4 h-4" />
      </div>
      <div className="relative z-10 min-w-0">
        <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${textColorClasses} truncate`}>{label}</p>
        <h3 className="text-lg sm:text-xl font-extrabold text-slate-800 leading-tight mt-0.5 truncate">{value}</h3>
        {subText && <p className="text-[8px] sm:text-[9px] text-slate-400 mt-0.5 font-medium truncate">{subText}</p>}
      </div>
    </div>
  );
};
