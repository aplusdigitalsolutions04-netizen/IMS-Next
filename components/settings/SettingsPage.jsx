"use client";
import React, { Suspense, lazy, useState } from 'react';
import { Loader2, Users, ShieldCheck, History, FileText, User, Mail } from 'lucide-react';
import WarrantyEmailTemplate from './WarrantyEmailTemplate';

const UsersComp = lazy(() => import('@/components/users/Users'));
const RolesComp = lazy(() => import('@/components/roles/Roles'));
const UserActivityComp = lazy(() => import('@/components/userActivity/UserActivity'));
const ReportsComp = lazy(() => import('@/components/reports/Reports'));
const ProfilePageComp = lazy(() => import('@/components/profile/ProfilePage'));

const tabFallback = (
  <div className="flex justify-center items-center min-h-[320px]">
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex items-center gap-3">
      <Loader2 className="animate-spin text-indigo-600" size={22} />
      <span className="text-sm font-semibold text-slate-600">Loading...</span>
    </div>
  </div>
);

export default function SettingsPage({
  currentUser,
  hasPermission,
  onCurrentUserUpdate,
  isAdmin,
  isAccountant,
  returns,
}) {
  const tabs = [
    hasPermission('users') && { id: 'users', label: 'User Management', icon: Users },
    hasPermission('users') && { id: 'roles', label: 'Manage Roles', icon: ShieldCheck },
    hasPermission('users') && { id: 'activity', label: 'User Activity', icon: History },
    hasPermission('reports') && { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'warranty-email', label: 'Warranty Email', icon: Mail },
    { id: 'profile', label: 'My Profile', icon: User },
  ].filter(Boolean);

  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'profile');

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-0">
        <h1 className="text-xl font-bold text-slate-800 mb-1">Settings</h1>
        <p className="text-sm text-slate-400 mb-4">Manage users, activity logs, reports and your profile</p>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-200 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <tab.icon size={15} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        <Suspense fallback={tabFallback}>
          {activeTab === 'users' && hasPermission('users') && (
            <UsersComp
              currentUser={currentUser}
              hasPermission={hasPermission}
              onCurrentUserUpdate={onCurrentUserUpdate}
            />
          )}
          {activeTab === 'roles' && hasPermission('users') && (
            <RolesComp />
          )}
          {activeTab === 'activity' && hasPermission('users') && (
            <UserActivityComp hasPermission={hasPermission} />
          )}
          {activeTab === 'reports' && hasPermission('reports') && (
            <ReportsComp
              isAdmin={isAdmin}
              isAccountant={isAccountant}
              returns={returns}
              hasPermission={hasPermission}
            />
          )}
          {activeTab === 'warranty-email' && (
            <WarrantyEmailTemplate />
          )}
          {activeTab === 'profile' && (
            <ProfilePageComp
              currentUser={currentUser}
              hasPermission={hasPermission}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}

