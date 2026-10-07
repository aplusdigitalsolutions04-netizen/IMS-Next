"use client";
import React, { useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OrderTracking from "@/components/orderTracking/OrderTracking";
import { getStoredUser } from "@/lib/client/auth";
import { useAppData } from "@/lib/client/AppDataContext";

// Ported from Frontend4/src/components/AdminLayout.jsx's <Route path="/orderTracking">
// wiring. Previously this page only passed currentUser, leaving orders/models/
// serials/returns on OrderTracking.jsx's default param values (`= []`) — a new
// empty array on every render, which retriggered its `useEffect([orders])`
// every render and looped ("Maximum update depth exceeded"), same root cause
// as the earlier Dispatch.jsx fix. See [[ims-next-migration]].
export default function OrderTrackingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = typeof window !== "undefined" ? getStoredUser() : null;
  const { orders, models, serials, returns, dataStatus, loadOrdersData, refreshData } = useAppData();

  const userRole = currentUser?.role || "User";
  const isAdmin = userRole === "Admin";
  // Gates "Edit Items & Serials" in the order detail modal — driven by the
  // order-processing edit-flag (role-resolved), not a hardcoded role name.
  const isSupervisor = isAdmin || !!currentUser?.allow_edit_order_processing;

  useEffect(() => {
    if (!dataStatus.orders) loadOrdersData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialDayFilter = searchParams.get("day") || "all";
  const initialCustomStart = searchParams.get("start") || "";
  const initialCustomEnd = searchParams.get("end") || "";

  const focusOrderId = searchParams.get("focus") || null;
  // `orderId` (when an order was opened) swaps ?focus= for ?order= in one
  // step, so the open order page keeps its URL.
  const handleFocusHandled = useCallback((orderId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    if (orderId) params.set("order", orderId);
    router.replace(`/orderTracking${params.toString() ? `?${params.toString()}` : ""}`);
  }, [router, searchParams]);

  return (
    <OrderTracking
      orders={orders}
      models={models}
      serials={serials}
      returns={returns}
      currentUser={currentUser}
      onRefresh={refreshData}
      isAdmin={isAdmin}
      isSupervisor={isSupervisor}
      focusOrderId={focusOrderId}
      onFocusHandled={handleFocusHandled}
      initialDayFilter={initialDayFilter}
      initialCustomStart={initialCustomStart}
      initialCustomEnd={initialCustomEnd}
      catalogLoaded={dataStatus.models && dataStatus.serials}
      returnsLoaded={dataStatus.returns}
    />
  );
}
