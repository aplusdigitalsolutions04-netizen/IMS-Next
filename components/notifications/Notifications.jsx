"use client";
import React, { useEffect, useState } from 'react';
import { Bell, Clock, Package, Receipt, Truck, CheckCheck, RefreshCw, BellOff, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import api from '@/lib/services/api';

const getIcon = (title) => {
  if (title.includes('Billing')) return <Receipt className="text-amber-500" size={20} />;
  if (title.includes('Dispatch') || title.includes('Logistics')) return <Truck className="text-emerald-500" size={20} />;
  return <Package className="text-indigo-500" size={20} />;
};

const parseOrderId = (text) => {
  if (!text) return null;
  const match = text.match(/order\s*(?:#|id)?\s*[:-]?\s*([A-Za-z0-9-]+)/i);
  return match ? match[1] : null;
};

const Notifications = ({ onOpenOrder }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const fetchNotifications = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data } = await api.get('/notifications?limit=100');
      const list = data.notifications || [];
      setNotifications(list);
      setUnreadCount(list.filter((item) => !item.isRead).length);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAsRead = async (guid) => {
    try {
      await api.put(`/notifications/${guid}/read`);
      setNotifications((prev) => prev.map((item) => (item.guid === guid ? { ...item, isRead: 1 } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      window.dispatchEvent(new Event('notificationsUpdated'));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: 1 })));
      setUnreadCount(0);
      window.dispatchEvent(new Event('notificationsUpdated'));
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  const deleteNotification = async (e, guid, isRead) => {
    e.stopPropagation(); // Prevent opening the notification
    try {
      await api.delete(`/notifications/${guid}`);
      setNotifications((prev) => prev.filter((item) => item.guid !== guid));
      if (!isRead) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      window.dispatchEvent(new Event('notificationsUpdated'));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const clearAllNotifications = async () => {
    const result = await Swal.fire({
      title: "Clear all notifications?",
      text: "This will permanently delete every notification. This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EF4444",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, clear all",
      cancelButtonText: "Cancel",
      customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-semibold', cancelButton: 'rounded-xl font-semibold' },
    });
    if (!result.isConfirmed) return;

    try {
      await api.delete('/notifications/clear-all');
      setNotifications([]);
      setUnreadCount(0);
      window.dispatchEvent(new Event('notificationsUpdated'));
      Swal.fire({ title: "Cleared!", text: "All notifications have been deleted.", icon: "success", confirmButtonColor: "#6366F1", customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-semibold' } });
    } catch (err) {
      console.error('Failed to clear notifications:', err);
      Swal.fire({ title: "Error", text: "Failed to clear notifications.", icon: "error", confirmButtonColor: "#6366F1", customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-semibold' } });
    }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.isRead) {
      markAsRead(notif.guid);
    }

    const orderId = parseOrderId(notif.title) || parseOrderId(notif.message);
    if (orderId && typeof onOpenOrder === 'function') {
      onOpenOrder(orderId);
      return;
    }

    if (notif.title.includes('Billing') || notif.message.includes('billing')) {
      router.push('/billing');
    } else if (notif.title.includes('Dispatch') || notif.message.includes('Dispatch')) {
      router.push('/dispatch');
    } else {
      router.push('/orderTracking');
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white rounded-2xl border border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner">
            <Bell size={24} strokeWidth={2.5} />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full"></span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Notifications</h2>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 rounded-full">
                  {unreadCount} New
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">Stay updated with your latest alerts.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchNotifications(true)}
            className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200"
            title="Refresh notifications"
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin text-indigo-500" : ""} />
          </button>
          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className={`flex items-center gap-2 text-sm font-medium transition-all px-4 py-2.5 rounded-xl
              ${unreadCount === 0
                ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md hover:shadow-lg active:scale-95'
              }`}
          >
            <CheckCheck size={16} />
            Mark all read
          </button>
          <button
            onClick={clearAllNotifications}
            disabled={notifications.length === 0}
            className={`flex items-center gap-2 text-sm font-medium transition-all px-4 py-2.5 rounded-xl
              ${notifications.length === 0
                ? 'bg-red-50/50 text-red-300 cursor-not-allowed'
                : 'bg-red-50 text-red-600 hover:bg-red-100 shadow-sm active:scale-95'
              }`}
          >
            <Trash2 size={16} />
            Clear all
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100/80">

          {loading ? (
            /* Skeleton Loader */
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-5 flex items-start gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0"></div>
                <div className="flex-1 space-y-3 py-1">
                  <div className="flex justify-between items-center">
                    <div className="h-4 bg-slate-200 rounded-md w-1/3"></div>
                    <div className="h-3 bg-slate-100 rounded-md w-16"></div>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-md w-3/4"></div>
                  <div className="h-3 bg-slate-100 rounded-md w-1/2"></div>
                </div>
              </div>
            ))
          ) : notifications.length === 0 ? (
            /* Empty State */
            <div className="px-6 py-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <BellOff size={32} className="text-slate-300" />
              </div>
              <h3 className="text-base font-semibold text-slate-800">You're all caught up!</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-xs">
                When new activity or alerts happen, they'll appear right here.
              </p>
            </div>
          ) : (
            /* Notification Items */
            notifications.map((notif) => (
              <div
                key={notif.guid}
                role="button"
                tabIndex={0}
                onClick={() => handleNotificationClick(notif)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNotificationClick(notif);
                  }
                }}
                className={`group relative w-full text-left p-5 flex items-start gap-4 transition-all duration-200 hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 cursor-pointer
                  ${!notif.isRead ? 'bg-indigo-50/30' : 'bg-white'}`}
              >
                {/* Unread Left Border Indicator */}
                {!notif.isRead && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-indigo-500 rounded-r-full shadow-[1px_0_4px_rgba(99,102,241,0.4)]"></div>
                )}

                <div className={`p-2.5 rounded-full shrink-0 transition-colors
                  ${notif.isRead ? 'bg-slate-100 text-slate-500 group-hover:bg-slate-200' : 'bg-white shadow-sm ring-1 ring-slate-100'}`}>
                  {getIcon(notif.title)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 mb-1">
                    <p className={`text-sm font-semibold truncate pr-8 
                      ${notif.isRead ? 'text-slate-700' : 'text-slate-900'}`}>
                      {notif.title}
                    </p>
                    <span className={`text-[11px] whitespace-nowrap flex items-center gap-1.5 font-medium
                      ${notif.isRead ? 'text-slate-400' : 'text-indigo-600'}`}>
                      <Clock size={12} strokeWidth={notif.isRead ? 2 : 2.5} />
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className={`text-sm leading-relaxed whitespace-pre-line pr-8
                    ${notif.isRead ? 'text-slate-500' : 'text-slate-700'}`}>
                    {notif.message}
                  </p>
                </div>

                {/* Delete Button */}
                <button
                  onClick={(e) => deleteNotification(e, notif.guid, notif.isRead)}
                  className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
                  title="Delete notification"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Notifications;
