"use client";
import React from "react";
import ClientMaster from "@/components/clientMaster/ClientMaster";
import { getStoredUser } from "@/lib/client/auth";

export default function ClientMasterPage() {
    let currentUser = null;
    if (typeof window !== "undefined") {
        currentUser = getStoredUser();
    }

    return <ClientMaster currentUser={currentUser} />;
}
