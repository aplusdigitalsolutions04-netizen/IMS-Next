"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, Package, Receipt, Truck, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import api, { API_URL } from "@/lib/client/apiClient";
import { getStoredToken } from "@/lib/client/auth";

const parseOrderId = (text) => {
  if (!text) return null;
  const match = text.match(/order\s*(?:#|id)?\s*[:-]?\s*([A-Za-z0-9-]+)/i);
  return match ? match[1] : null;
};

export default function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef(null);
  const router = useRouter();

  async function fetchNotifications() {
    try {
      const { data } = await api.get("/notifications?limit=50");
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }

  useEffect(() => {
    fetchNotifications();
    const handleSync = () => fetchNotifications();
    window.addEventListener("notificationsUpdated", handleSync);
    return () => window.removeEventListener("notificationsUpdated", handleSync);
  }, []);

  // Real-time — a dedicated SSE connection for notifications (separate from
  // AppDataContext's models/serials/dispatches/returns stream).
  useEffect(() => {
    let evtSource = null;
    let retryTimer = null;
    let retryDelay = 5000;
    let stopped = false;

    function connect() {
      const token = getStoredToken();
      if (!token || stopped) return;

      evtSource = new EventSource(`${API_URL}/notifications/stream?token=${token}`);

      evtSource.onmessage = (event) => {
        if (!event.data) return; // heartbeat
        retryDelay = 5000;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "NEW_NOTIFICATION") {
            const newNotif = data.payload;
            setNotifications((prev) => [newNotif, ...prev]);
            setUnreadCount((prev) => prev + 1);
            window.dispatchEvent(new Event("notificationsUpdated"));
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(newNotif.title, { body: newNotif.message });
            }
          }
        } catch {
          // ignore malformed event
        }
      };

      evtSource.onerror = () => {
        evtSource?.close();
        evtSource = null;
        if (stopped) return;
        retryDelay = Math.min(retryDelay * 2, 60000);
        retryTimer = setTimeout(connect, retryDelay);
      };
    }

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      evtSource?.close();
    };
  }, []);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (guid) => {
    try {
      await api.put(`/notifications/${guid}/read`);
      setNotifications((prev) => prev.map((n) => (n.guid === guid ? { ...n, isRead: 1 } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch (err) {
      console.error("Failed to mark read", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: 1 })));
      setUnreadCount(0);
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch (err) {
      console.error("Failed to mark all read", err);
    }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.isRead) markAsRead(notif.guid);
    setIsOpen(false);

    if (notif.link && typeof notif.link === "string" && notif.link.startsWith("/")) {
      router.push(notif.link);
      return;
    }

    const titleLower = (notif.title || "").toLowerCase();
    const messageLower = (notif.message || "").toLowerCase();

    if (titleLower.includes("billing") || messageLower.includes("billing")) {
      router.push("/billing");
    } else if (
      titleLower.includes("dispatch") || messageLower.includes("dispatch") ||
      titleLower.includes("logistics") || messageLower.includes("logistics")
    ) {
      router.push("/dispatch");
    } else if (
      titleLower.includes("model") || messageLower.includes("model") ||
      titleLower.includes("approval") || messageLower.includes("approval")
    ) {
      router.push("/itemMaster");
    } else {
      router.push("/orderTracking");
    }
  };

  const getIcon = (title) => {
    if ((title || "").includes("Billing")) return <Receipt className="text-yellow-500" size={16} />;
    if ((title || "").includes("Dispatch") || (title || "").includes("Logistics")) return <Truck className="text-emerald-500" size={16} />;
    return <Package className="text-indigo-500" size={16} />;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-full hover:bg-slate-100 transition-colors"
      >
        <Bell size={20} className="text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[26rem] max-w-[90vw] max-h-[85vh] bg-white border border-slate-200 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">
                    {unreadCount} new
                  </span>
                )}
              </h3>
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push("/notifications");
                }}
                className="text-xs text-slate-500 font-semibold hover:text-slate-900 transition underline decoration-slate-300 underline-offset-2 ml-2"
              >
                View all
              </button>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-indigo-600 font-bold hover:text-indigo-800 transition bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="text-center p-8 text-slate-400 flex flex-col items-center">
                <Bell size={36} className="mb-3 opacity-20" />
                <p className="text-sm font-semibold text-slate-500">All caught up!</p>
                <p className="text-xs mt-1">No new notifications.</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.guid}
                  onClick={() => handleNotificationClick(notif)}
                  className={`relative p-3.5 cursor-pointer transition-colors flex gap-3 ${
                    notif.isRead ? "bg-white hover:bg-slate-50/80" : "bg-indigo-50/40 hover:bg-indigo-50/80"
                  }`}
                >
                  {!notif.isRead && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-500" />}
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`p-2 rounded-full ${notif.isRead ? "bg-slate-100/80" : "bg-white shadow-sm ring-1 ring-slate-200/50"}`}>
                      {getIcon(notif.title)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1.5 gap-2">
                      <h4 className={`text-sm truncate pr-2 ${notif.isRead ? "text-slate-600 font-medium" : "text-slate-900 font-semibold"}`}>
                        {notif.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap flex items-center gap-1 font-medium shrink-0 mt-0.5">
                        <Clock size={10} />
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className={`text-xs leading-relaxed ${notif.isRead ? "text-slate-500 line-clamp-2" : "text-slate-700 line-clamp-3"}`}>
                      {notif.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
