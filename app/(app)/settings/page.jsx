"use client";
import React, { useEffect, useState } from "react";
import SettingsPage from "@/components/settings/SettingsPage";
import { getStoredUser } from "@/lib/client/auth";
import { hasPermission as userHasPermission } from "@/lib/client/rbac";

// SettingsPage expects its user / permission helpers as props (it used to be
// mounted by the old single-page shell). Rendering it bare crashed with
// "hasPermission is not a function".
export default function SettingsRoute() {
    const [currentUser, setCurrentUser] = useState(null);
    useEffect(() => { setCurrentUser(getStoredUser()); }, []);
    if (!currentUser) return null;

    const hasPermission = (id) => userHasPermission(currentUser, id);
    return (
        <SettingsPage
            currentUser={currentUser}
            hasPermission={hasPermission}
            onCurrentUserUpdate={setCurrentUser}
            isAdmin={currentUser.role === "Admin"}
            isAccountant={currentUser.role === "Accountant"}
            returns={[]}
        />
    );
}
