"use client";
import React from "react";
import Reports from "@/components/reports/Reports";
import { getStoredUser } from "@/lib/client/auth";
import { useAppData } from "@/lib/client/AppDataContext";

// Previously this page only passed currentUser, leaving `returns` on
// Reports.jsx's default param value (always []) and isAdmin/isAccountant/
// isSupervisor undefined — silently zeroing out every refund/repair/damage
// number and hiding the commission-edit control for everyone, Admins
// included. Same class of bug already fixed on app/(app)/dispatch/page.jsx.
export default function ReportsPage() {
    let currentUser = null;
    if (typeof window !== "undefined") {
        currentUser = getStoredUser();
    }
    const { returns } = useAppData();

    const userRole = currentUser?.role || "User";
    const isAdmin = userRole === "Admin";
    const hasReportsAccess = isAdmin || !!currentUser?.permissions?.includes("reports");

    return (
        <Reports
            returns={returns}
            isAdmin={isAdmin}
            isSupervisor={hasReportsAccess}
            isAccountant={hasReportsAccess}
        />
    );
}
