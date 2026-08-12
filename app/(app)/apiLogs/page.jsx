"use client";
import React from "react";
import ApiLogs from "@/components/apiLogs/ApiLogs";
import { getStoredUser } from "@/lib/client/auth";
import { hasPermission } from "@/lib/client/rbac";

export default function ApiLogsPage() {
  let currentUser = null;
  if (typeof window !== "undefined") {
    currentUser = getStoredUser();
  }
  const canView = hasPermission(currentUser, "apiLogs");

  return <ApiLogs currentUser={currentUser} hasPermission={canView} />;
}
