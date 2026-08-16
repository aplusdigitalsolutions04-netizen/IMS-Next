"use client";
import React, { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Dispatch from "@/components/dispatch/Dispatch";
import { getStoredUser } from "@/lib/client/auth";
import { useAppData } from "@/lib/client/AppDataContext";
import { printerService } from "@/lib/services/api";

// Ported from Frontend4/src/components/AdminLayout.jsx's <Route path="/dispatch">
// wiring (handleUpdateDispatch/handleDeleteDispatch/handleRestoreDispatch).
// Previously this page only passed currentUser, leaving `models`/`serials`/
// `dispatches` on Dispatch.jsx's default param values (`= []`) — a *new* empty
// array on every render, which retriggered its `useEffect([models])` every
// render and looped ("Maximum update depth exceeded"). See [[ims-next-migration]].
export default function DispatchPage() {
  const currentUser = typeof window !== "undefined" ? getStoredUser() : null;
  const { models, serials, dispatches, refreshData } = useAppData();
  const searchParams = useSearchParams();
  const initialDayFilter = searchParams.get("day") || "all";
  const initialCustomStart = searchParams.get("start") || "";
  const initialCustomEnd = searchParams.get("end") || "";

  const userRole = currentUser?.role || "User";
  const isAdmin = userRole === "Admin";
  // "reports" permission (resolved from the user's role, not a hardcoded
  // role name) gates cost/financial visibility here — Supervisor/Accountant
  // tier by default, same as the Dashboard's equivalent split.
  const hasReportsAccess = isAdmin || !!currentUser?.permissions?.includes("reports");

  const handleUpdate = useCallback(
    async (ids, updatedData) => {
      await printerService.updateDispatch(ids, updatedData);
      await refreshData();
    },
    [refreshData]
  );

  const handleDelete = useCallback(
    async (ids, reason, cancelledBy, clearCharges) => {
      await printerService.deleteDispatch(ids, reason, cancelledBy || currentUser?.username || "Unknown", clearCharges);
      await refreshData();
    },
    [refreshData, currentUser]
  );

  const handleRestore = useCallback(
    async (ids) => {
      await printerService.restoreDispatch(ids);
      await refreshData();
    },
    [refreshData]
  );

  return (
    <Dispatch
      models={models}
      serials={serials}
      dispatches={dispatches}
      currentUser={currentUser}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      onRestore={handleRestore}
      onRefresh={refreshData}
      isAdmin={isAdmin}
      isSupervisor={hasReportsAccess}
      isAccountant={hasReportsAccess}
      initialDayFilter={initialDayFilter}
      initialCustomStart={initialCustomStart}
      initialCustomEnd={initialCustomEnd}
    />
  );
}
