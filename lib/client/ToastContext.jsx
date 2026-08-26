"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Check, AlertTriangle, AlertCircle, X } from "lucide-react";

// One toast UI for the whole app — mounted once in app/layout.js. Before
// this, every feature had its own way of surfacing a message: OrderTracking
// had its own local <Toast>, everything else used the browser's native
// alert()/confirm() or SweetAlert2 popups, so the same kind of message
// looked different depending on which screen you were on. useToast() below
// is the one API every component should call instead.
const ToastContext = createContext(null);

const CONFIG = {
  success: { bg: "bg-emerald-500", icon: Check },
  error: { bg: "bg-red-500", icon: AlertTriangle },
  warning: { bg: "bg-amber-500", icon: AlertTriangle },
  info: { bg: "bg-blue-500", icon: AlertCircle },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, type = "info") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const toastApi = useMemo(() => ({
    success: (message) => show(message, "success"),
    error: (message) => show(message, "error"),
    warning: (message) => show(message, "warning"),
    info: (message) => show(message, "info"),
    show,
  }), [show]);

  return (
    <ToastContext.Provider value={toastApi}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2.5 items-center pointer-events-none w-[calc(100%-3rem)] sm:w-auto">
        {toasts.map((t) => {
          const { bg, icon: Icon } = CONFIG[t.type] || CONFIG.info;
          return (
            <div
              key={t.id}
              className={`${bg} text-white px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 w-full sm:min-w-[320px] sm:max-w-md pointer-events-auto`}
            >
              <Icon size={22} className="shrink-0" />
              <span className="font-semibold text-sm leading-snug whitespace-pre-line flex-1">{t.message}</span>
              <button onClick={() => dismiss(t.id)} className="hover:bg-white/20 rounded-full p-1 shrink-0">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
