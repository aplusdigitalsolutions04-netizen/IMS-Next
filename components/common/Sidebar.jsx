"use client";
import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Barcode,
  Bell,
  Truck,
  RotateCcw,
  FileText,
  Receipt,
  Package, Tags, Ruler, Link2, Layers,
  Wrench,
  Users as UsersIcon,
  History,
  User,
  Briefcase,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  ArrowDownCircle,
  ArrowUpCircle,
  Warehouse,
  ChevronLeft as HideIcon,
  Settings,
  ShieldAlert,
  Mail,
  Box,
  Building2,
  Inbox,
  Send,
  UploadCloud,
  Ban,
  ArrowRightLeft,
  DatabaseBackup,
  ShieldHalf,
  Globe,
  HardDrive
} from "lucide-react";
import { useCompany } from "@/lib/client/CompanyContext";

export default function Sidebar({ currentUser, isAdmin, hasPermission = () => false }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const { activeCompany } = useCompany();
  const logoSrc = activeCompany?.logoFilename ? `/uploads/${activeCompany.logoFilename}` : "/aplus.png";
  const [expandedMenus, setExpandedMenus] = useState({});

  const activeTab = pathname.split("/")[1] || "dashboard";

  const toggleSubmenu = (menu) => {
    setExpandedMenus((prev) => ({ ...prev, [menu]: !prev[menu] }));
  };

  const navItems = [
    // Contracts
    { id: "contracts-upload", label: "Upload Contract", icon: UploadCloud, group: "contracts", path: "/contracts/upload" },
    { id: "contracts-list", label: "Saved Contracts", icon: FileText, group: "contracts", path: "/contracts" },
    { id: "contracts-cancelled", label: "Cancelled Contracts", icon: Ban, group: "contracts", path: "/contracts/cancelled" },

    // Masters
    { id: "categoryMaster", label: "Category Master", icon: Tags, group: "masters" },
    { id: "brandMaster", label: "Brand Master", icon: Barcode, group: "masters" },
    { id: "vendorMaster", label: "Vendor Master", icon: UsersIcon, group: "masters" },
    { id: "categoryBrandMapping", label: "Cate-Brand Mapping", icon: FileText, group: "masters" },
    { id: "unitMaster", label: "Unit Master", icon: Ruler, group: "masters" },
    { id: "itemMaster", label: "Item Master", icon: Package, group: "masters" },
    { id: "comboMaster", label: "Combos Master", icon: Layers, group: "masters" },
    { id: "godownMaster", label: "Godown Master", icon: Warehouse, group: "masters" },
    { id: "fbfFbaMaster", label: "FBF / FBA Master", icon: Layers, group: "masters" },

    // Inventory
    { id: "currentStock", label: "Current Stock", icon: Package, group: "inventory" },
    { id: "stockIn", label: "Stock In", icon: Truck, group: "inventory" }, // Using ShieldAlert for ShieldCheck as fallback
    { id: "fbfFbaManagement", label: "FBF / FBA Stock", icon: Package, group: "inventory" },
    { id: "godownTransfer", label: "Godown Transfer", icon: ArrowRightLeft, group: "inventory" },
   

    // Order Processing
    { id: "orderTracking", label: "Order Processing", icon: Package, group: "orders" },
    { id: "dispatch", label: " Dispatch", icon: Truck, group: "orders" },
    { id: "stockOut", label: "Stock Out", icon: Receipt, group: "orders" },

    // Operations
    { id: "returns", label: "Returns", icon: RotateCcw, group: "operations" },
    { id: "damaged", label: "Damaged", icon: Bell, group: "operations" }, // Using Bell or AlertOctagon if imported. Wait, I imported Bell.

    // Independent
    { id: "billing", label: "Billing", icon: Receipt },
    { id: "warranty", label: "Warranty Certs", icon: ShieldAlert },
    { id: "installations", label: "Installations", icon: Wrench, badgeColor: "orange" }, // Badge value can be passed if needed
  ];

  if (!isSidebarVisible) {
    const mastersGroup = ["categoryMaster","brandMaster","vendorMaster","categoryBrandMapping","unitMaster","itemMaster","comboMaster","godownMaster","fbfFbaMaster"];
    const inventoryGroup = ["currentStock","stockIn","fbfFbaManagement","godownTransfer"];
    const ordersGroup = ["orderTracking","dispatch","stockOut"];
    const operationsGroup = ["returns","damaged"];
    const settingsGroup = ["companyMaster","users","roles","userActivity","reports","profile","settings","notifications","warrantyEmail","emailAccounts","emailTemplates","emailInbox","sentEmails","apiLogs","backupRestore","rateLimitSettings","platformMaster","googleDrive"];

    const expandTo = (group) => {
      setIsSidebarVisible(true);
      setExpandedMenus((prev) => ({ ...prev, [group]: true }));
    };

    return (
      <aside className="bg-white border-r flex flex-col items-center py-3 w-16 transition-all">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="Logo" className="h-8 w-auto object-contain mb-3 logo-invert" />
        <nav className="flex-1 flex flex-col items-center gap-1.5 overflow-y-auto w-full px-2 py-1">
          <button
            onClick={() => router.push("/")}
            title="Dashboard"
            className={`p-2.5 rounded-xl transition-colors ${activeTab === "dashboard" ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <LayoutDashboard size={20} />
          </button>
          <button
            onClick={() => expandTo("contracts")}
            title="Contracts"
            className={`p-2.5 rounded-xl transition-colors ${activeTab === "contracts" ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <FileText size={20} />
          </button>
          <button
            onClick={() => expandTo("masters")}
            title="Masters"
            className={`p-2.5 rounded-xl transition-colors ${mastersGroup.includes(activeTab) ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <Tags size={20} />
          </button>
          <button
            onClick={() => expandTo("inventory")}
            title="Inventory"
            className={`p-2.5 rounded-xl transition-colors ${inventoryGroup.includes(activeTab) ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <Warehouse size={20} />
          </button>
          <button
            onClick={() => expandTo("orders")}
            title="Order Processing"
            className={`p-2.5 rounded-xl transition-colors ${ordersGroup.includes(activeTab) ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <ShoppingCart size={20} />
          </button>
          <button
            onClick={() => router.push("/billing")}
            title="Billing"
            className={`p-2.5 rounded-xl transition-colors ${activeTab === "billing" ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <Receipt size={20} />
          </button>
          <button
            onClick={() => router.push("/warranty")}
            title="Warranty Certs"
            className={`p-2.5 rounded-xl transition-colors ${activeTab === "warranty" ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <ShieldAlert size={20} />
          </button>
          <button
            onClick={() => router.push("/installations")}
            title="Installations"
            className={`p-2.5 rounded-xl transition-colors ${activeTab === "installations" ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <Wrench size={20} />
          </button>
          <button
            onClick={() => expandTo("operations")}
            title="Returns & Damaged"
            className={`p-2.5 rounded-xl transition-colors ${operationsGroup.includes(activeTab) ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <RotateCcw size={20} />
          </button>
          <button
            onClick={() => router.push("/profile")}
            title="Settings"
            className={`p-2.5 rounded-xl transition-colors ${settingsGroup.includes(activeTab) ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <Settings size={20} />
          </button>
        </nav>
        <button
          onClick={() => setIsSidebarVisible(true)}
          title="Expand Menu"
          className="mt-2 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors border border-slate-200 shadow-sm"
        >
          <ChevronRight size={18} />
        </button>
      </aside>
    );
  }

  // Settings mode
  if (['companyMaster','users','roles','userActivity','reports','profile','settings','notifications','warrantyEmail','emailAccounts','emailTemplates','emailInbox','sentEmails','apiLogs','backupRestore','rateLimitSettings','platformMaster','googleDrive'].includes(activeTab)) {
    return (
      <aside className="bg-white border-r flex flex-col w-64 h-full shrink-0 animate-sidebar-in transition-all">
        <div className="p-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex flex-col items-center justify-center flex-1">
            <img src={logoSrc} alt="Company Logo" className="h-12 w-auto object-contain logo-invert" />
          </div>
          <button onClick={() => setIsSidebarVisible(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 border border-slate-200 shadow-sm">
            <HideIcon size={18} />
          </button>
        </div>
        <div className="p-4 font-bold text-indigo-600 text-lg text-center">
          Inventory Management
        </div>
        <div className="px-4 py-3 flex items-center gap-2.5 border-b border-slate-100">
          <Settings size={18} className="text-indigo-600" />
          <span className="font-bold text-indigo-600 text-base">Settings</span>
        </div>
        <nav className="flex-1 px-2 py-2 flex flex-col overflow-y-auto gap-1 min-h-0">
          <button onClick={() => router.push('/profile')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'profile' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
            <User size={18} /> <span>My Profile</span>
          </button>
          {hasPermission('companyMaster') && (
            <button onClick={() => router.push('/companyMaster')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'companyMaster' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Building2 size={18} /> <span>Company Master</span>
            </button>
          )}
          {hasPermission('platformMaster') && (
            <button onClick={() => router.push('/platformMaster')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'platformMaster' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Globe size={18} /> <span>Selling Platforms</span>
            </button>
          )}
          <button onClick={() => router.push('/users')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
            <UsersIcon size={18} /> <span>User Management</span>
          </button>
          <button onClick={() => router.push('/roles')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'roles' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Briefcase size={18} /> <span>Manage Roles</span>
          </button>
          <button onClick={() => router.push('/userActivity')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'userActivity' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
            <History size={18} /> <span>User Activity</span>
          </button>
          <button onClick={() => router.push('/reports')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'reports' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
            <FileText size={18} /> <span>Reports</span>
          </button>
          <button onClick={() => router.push('/notifications')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'notifications' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Bell size={18} /> <span>Notifications</span>
          </button>
          {(hasPermission('emailAccounts') || hasPermission('emailTemplates') || hasPermission('sentEmails') || hasPermission('emailInbox')) && (
            <div className="space-y-1">
              <button onClick={() => toggleSubmenu('email')} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100">
                <div className="flex items-center gap-3"><Mail size={18} /><span>Email</span></div>
                {expandedMenus.email ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {expandedMenus.email && (
                <div className="space-y-1 ml-4 border-l border-slate-100 animate-in slide-in-from-top-1">
                  {hasPermission('emailAccounts') && (
                    <button onClick={() => router.push('/emailAccounts')} className={`w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'emailAccounts' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                      <Mail size={14} className="flex-shrink-0" /> <span className="truncate">Email Accounts</span>
                    </button>
                  )}
                  {hasPermission('emailTemplates') && (
                    <button onClick={() => router.push('/emailTemplates')} className={`w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'emailTemplates' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                      <FileText size={14} className="flex-shrink-0" /> <span className="truncate">Email Templates</span>
                    </button>
                  )}
                  {hasPermission('sentEmails') && (
                    <button onClick={() => router.push('/sentEmails')} className={`w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'sentEmails' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                      <Send size={14} className="flex-shrink-0" /> <span className="truncate">Sent Emails</span>
                    </button>
                  )}
                  {hasPermission('emailInbox') && (
                    <button onClick={() => router.push('/emailInbox')} className={`w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'emailInbox' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                      <Inbox size={14} className="flex-shrink-0" /> <span className="truncate">Email Inbox</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {hasPermission('apiLogs') && (
            <button onClick={() => router.push('/apiLogs')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'apiLogs' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
              <ShieldAlert size={18} /> <span>API Logs</span>
            </button>
          )}
          {hasPermission('backupRestore') && (
            <button onClick={() => router.push('/backupRestore')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'backupRestore' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
              <DatabaseBackup size={18} /> <span>Backup &amp; Restore</span>
            </button>
          )}
          {hasPermission('rateLimitSettings') && (
            <button onClick={() => router.push('/rateLimitSettings')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'rateLimitSettings' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
              <ShieldHalf size={18} /> <span>Rate Limiting</span>
            </button>
          )}
          {hasPermission('googleDrive') && (
            <button onClick={() => router.push('/googleDrive')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'googleDrive' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
              <HardDrive size={18} /> <span>Google Drive</span>
            </button>
          )}
        </nav>
        <div className="shrink-0 px-2 pb-2 border-t border-slate-100 pt-2">
          <button onClick={() => router.push('/')} className="w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-500 hover:bg-indigo-50 hover:text-indigo-600">
            <LayoutDashboard size={18} /> <span>Back to Dashboard</span>
          </button>
        </div>
      </aside>
    );
  }

  // Normal mode
  return (
    <aside className="bg-white border-r flex flex-col w-64 h-full shrink-0 transition-all">
      <div className="p-4 flex items-center justify-between border-b border-slate-100">
        <div className="flex flex-col items-center justify-center flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="Company Logo" className="h-12 w-auto object-contain logo-invert" />
        </div>
        <button onClick={() => setIsSidebarVisible(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 border border-slate-200 shadow-sm">
          <HideIcon size={18} />
        </button>
      </div>
      <div className="p-4 font-bold text-indigo-600 text-lg text-center">Inventory Management</div>
      <nav className="flex-1 px-2 space-y-1 overflow-y-auto pb-4">
        <button
          onClick={() => router.push("/")}
          className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === "dashboard" ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </button>

        {/* CONTRACTS */}
        {hasPermission("contracts") && (
          <div className="space-y-1">
            <button onClick={() => toggleSubmenu("contracts")} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100">
              <div className="flex items-center gap-3"><FileText size={18} /><span>Contracts</span></div>
              {expandedMenus.contracts ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {expandedMenus.contracts && (
              <div className="space-y-1 ml-4 border-l border-slate-100 animate-in slide-in-from-top-1">
                {navItems.filter(i => i.group === "contracts").map(item => (
                  <button key={item.id} onClick={() => router.push(item.path || `/${item.id}`)} className={`w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === (item.path || `/${item.id}`) ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {item.icon && <item.icon size={14} className="flex-shrink-0" />} <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MASTERS */}
        <div className="space-y-1">
          <button onClick={() => toggleSubmenu("masters")} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100">
            <div className="flex items-center gap-3"><Package size={18} /><span>Masters</span></div>
            {expandedMenus.masters ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {expandedMenus.masters && (
            <div className="space-y-1 ml-4 border-l border-slate-100 animate-in slide-in-from-top-1">
              {navItems.filter(i => i.group === "masters").map(item => (
                <button key={item.id} onClick={() => router.push(`/${item.id}`)} className={`w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === item.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {item.icon && <item.icon size={14} className="flex-shrink-0" />} <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* INVENTORY */}
        <div className="space-y-1">
          <button onClick={() => toggleSubmenu("inventory")} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100">
            <div className="flex items-center gap-3"><Warehouse size={18} /><span>Inventory</span></div>
            {expandedMenus.inventory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {expandedMenus.inventory && (
            <div className="space-y-1 ml-4 border-l border-slate-100 animate-in slide-in-from-top-1">
              {navItems.filter(i => i.group === "inventory").map(item => (
                <button key={item.id} onClick={() => router.push(`/${item.id}`)} className={`w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === item.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {item.icon && <item.icon size={14} className="flex-shrink-0" />} <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ORDER PROCESSING */}
        <div className="space-y-1">
          <button onClick={() => toggleSubmenu("orders")} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100">
            <div className="flex items-center gap-3"><ShoppingCart size={18} /><span>Order Processing</span></div>
            {expandedMenus.orders ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {expandedMenus.orders && (
            <div className="space-y-1 ml-4 border-l border-slate-100 animate-in slide-in-from-top-1">
              {navItems.filter(i => i.group === "orders").map(item => (
                <button key={item.id} onClick={() => router.push(`/${item.id}`)} className={`w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === item.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {item.icon && <item.icon size={14} className="flex-shrink-0" />} <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* BILLING */}
        <button onClick={() => router.push('/billing')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'billing' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
          <Receipt size={18} /> <span>Billing</span>
        </button>

        {/* WARRANTY */}
        <button onClick={() => router.push('/warranty')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'warranty' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
          <ShieldAlert size={18} /> <span>Warranty Certs</span>
        </button>

        {/* INSTALLATIONS */}
        <button onClick={() => router.push('/installations')} className={`w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'installations' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
          <Wrench size={18} /> <span>Installations</span>
        </button>

        {/* OPERATIONS */}
        <div className="space-y-1">
          <button onClick={() => toggleSubmenu("operations")} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100">
            <div className="flex items-center gap-3"><RotateCcw size={18} /><span>Returns & Damaged</span></div>
            {expandedMenus.operations ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {expandedMenus.operations && (
            <div className="space-y-1 ml-4 border-l border-slate-100 animate-in slide-in-from-top-1">
              {navItems.filter(i => i.group === "operations").map(item => (
                <button key={item.id} onClick={() => router.push(`/${item.id}`)} className={`w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-sm font-medium transition-colors relative ${activeTab === item.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {item.icon && <item.icon size={14} />}
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full ${item.badgeColor === 'orange' ? 'bg-orange-100 text-orange-600' : 'bg-indigo-100 text-indigo-600'}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* SETTINGS */}
        <button onClick={() => router.push('/profile')} className="w-full flex gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100">
          <Settings size={18} /> <span>Settings</span>
        </button>

      </nav>
    </aside>
  );
}
