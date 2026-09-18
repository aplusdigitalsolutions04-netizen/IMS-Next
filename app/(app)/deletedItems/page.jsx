"use client";
import React from "react";
import DeletedItems from "@/components/admin/DeletedItems";
import { getStoredUser } from "@/lib/client/auth";
import { hasPermission } from "@/lib/client/rbac";

export default function DeletedItemsPage() {
  let currentUser = null;
  if (typeof window !== "undefined") {
    currentUser = getStoredUser();
  }
  const canView = hasPermission(currentUser, "deletedItems");

  return <DeletedItems currentUser={currentUser} hasPermission={canView} />;
}
