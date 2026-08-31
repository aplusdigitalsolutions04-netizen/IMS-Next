"use client";
import React from "react";
import ContractsList from "@/components/contracts/ContractsList";
import { getStoredUser } from "@/lib/client/auth";

export default function ContractsPage() {
  let currentUser = null;
  if (typeof window !== "undefined") {
    currentUser = getStoredUser();
  }

  return <ContractsList statusFilter="Active" currentUser={currentUser} />;
}
