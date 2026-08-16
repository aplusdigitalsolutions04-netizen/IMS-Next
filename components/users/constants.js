import {
  BarChart3, Printer, Barcode, ShieldCheck, ShoppingCart, Receipt, Package,
  Wrench, AlertOctagon, Tags, Layers, History, FileText, Bell, Shield, Database,
  Ruler, ArrowDownCircle, ArrowUpCircle, Plus, Truck, Users,
  Building2, Globe, UploadCloud, Mail, Inbox, Send, ShieldAlert, DatabaseBackup,
  ShieldHalf, HardDrive, Trash2, ArrowRightLeft, Briefcase, Sparkles,
} from "lucide-react";

// Having view access to a tab is enough to add/edit everything in it, except
// Order Processing/Billing/Dispatch (see PROTECTED_EDIT_PERMISSIONS in
// lib/auth.js) — so these tabs only need a Delete checkbox here; Add/Edit no
// longer have their own toggle since view access already covers them.
// masterKey must match the suffix used by allow_delete_<key> in
// lib/auth.js's authorizeMasterDelete and lib/helpers.js's MASTER_KEYS.
const MASTER_EDIT_ENTRIES = [
  { key: "category", label: "Category" },
  { key: "brand",    label: "Brand" },
  { key: "vendor",   label: "Vendor" },
  { key: "item",     label: "Item" },
  { key: "combo",    label: "Combo" },
  { key: "unit",     label: "Unit" },
  { key: "mapping",  label: "Cate-Brand Mapping" },
].map(({ key, label }) => ({ key: `allow_delete_${key}`, label: `Delete ${label}`, icon: Trash2, group: "Master Data" }));

// Tabs that previously had one bundled permission with no create/edit/delete
// split — same "view access covers Add/Edit, only Delete needs its own
// toggle" rule as Master Data above.
const FULL_CRUD_ENTRIES = [
  { key: "roles",           label: "Role",            group: "Admin & Analytics" },
  { key: "companyMaster",   label: "Company",         group: "Master Data" },
  { key: "platformMaster",  label: "Selling Platform", group: "Master Data" },
  { key: "deliveryPartnerMaster", label: "Delivery Partner", group: "Master Data" },
  { key: "users",           label: "User",            group: "Admin & Analytics" },
  { key: "emailAccounts",   label: "Email Account",   group: "Email" },
  { key: "emailTemplates",  label: "Email Template",  group: "Email" },
].map(({ key, label, group }) => ({ key: `allow_delete_${key}`, label: `Delete ${label}`, icon: Trash2, group }));

// print_models_view/print_models_edit/print_serials_view/print_serials_edit and
// create_order used to exist here as separate "view" entries, but nothing
// server-side ever checked them — the real gates are print_models/print_serials
// (view) + allow_edit_models/allow_edit_serials/allow_create_order (below, in
// EDIT_PERMISSIONS). Keeping both copies just showed the same feature twice in
// the Manage Roles checkbox UI with no functional difference, so they were removed.
export const PERMISSIONS_LIST = [
  { id: "dashboard",          label: "Dashboard",              icon: BarChart3 },
  { id: "print_models",       label: "Model Pricing (Dispatch)", icon: Printer },
  { id: "print_serials",      label: "Serial Number Operations", icon: Barcode },
  { id: "warranty",           label: "Warranty Certificates",  icon: ShieldCheck },
  { id: "orders",             label: "Order Processing",       icon: ShoppingCart },
  { id: "billing",            label: "Billing",                icon: Receipt },
  { id: "dispatch",           label: "Dispatch",               icon: Package },
  { id: "stat_category",      label: "Category Master",        icon: Database },
  { id: "stat_brand",         label: "Brand Master",           icon: Tags },
  { id: "stat_vendor",        label: "Vendor Master",          icon: Users },
  { id: "stat_item",          label: "Item Master",            icon: Package },
  { id: "stat_combo",         label: "Combos Master",          icon: Layers },
  { id: "stat_mapping",       label: "Cate-Brand Mapping",     icon: FileText },
  { id: "stat_unit",          label: "Unit Master",            icon: Ruler },
  { id: "stat_stock_in",      label: "Stock-In",               icon: ArrowDownCircle },
  { id: "stat_stock_out",     label: "Stock-Out",              icon: ArrowUpCircle },
  { id: "stat_current_stock", label: "Current Stock",          icon: History },
  { id: "installation",       label: "Installation",           icon: Wrench },
  { id: "damage",             label: "Damage Records",         icon: AlertOctagon },
  { id: "returns",            label: "Returns",                icon: History },
  { id: "notifications",      label: "Notifications",          icon: Bell },
  { id: "users",              label: "User Management",        icon: Shield },
  { id: "roles",              label: "Manage Roles",           icon: Briefcase },
  { id: "userActivity",       label: "User Activity",          icon: History },
  { id: "reports",            label: "System Reports",         icon: FileText },
  { id: "godownMaster",       label: "Godown Master",          icon: Database },
  { id: "godownTransfer",     label: "Godown Transfer",        icon: ArrowRightLeft },
  { id: "fbfFbaMaster",       label: "FBF/FBA Master",         icon: Database },
  { id: "fbfFbaManagement",   label: "FBF/FBA Stock",          icon: Database },
  { id: "companyMaster",      label: "Company Master",         icon: Building2 },
  { id: "platformMaster",     label: "Selling Platforms",      icon: Globe },
  { id: "deliveryPartnerMaster", label: "Delivery Partners",   icon: Truck },
  { id: "contracts",          label: "Contracts",              icon: UploadCloud },
  { id: "emailAccounts",      label: "Email Accounts",         icon: Mail },
  { id: "emailTemplates",     label: "Email Templates",        icon: FileText },
  { id: "emailInbox",         label: "Email Inbox",            icon: Inbox },
  { id: "sentEmails",         label: "Sent Emails",            icon: Send },
  { id: "apiLogs",            label: "API Logs",               icon: ShieldAlert },
  { id: "backupRestore",      label: "Backup & Restore",       icon: DatabaseBackup },
  { id: "rateLimitSettings",  label: "Rate Limiting",          icon: ShieldHalf },
  { id: "aiSettings",         label: "AI Settings",            icon: Sparkles },
  { id: "googleDrive",        label: "Google Drive",           icon: HardDrive },
];

export const PERMISSION_GROUPS = [
  { name: "Sales & Orders",   icon: ShoppingCart, color: "indigo",  permissions: ["orders", "billing", "dispatch", "installation", "stat_stock_out", "returns", "damage"] },
  { name: "Master Data",      icon: Database,     color: "violet",  permissions: ["stat_category", "stat_brand", "stat_vendor", "stat_item", "stat_combo", "stat_mapping", "stat_unit", "godownMaster", "fbfFbaMaster", "companyMaster", "platformMaster", "deliveryPartnerMaster"] },
  { name: "Inventory",        icon: History,      color: "sky",     permissions: ["print_models", "print_serials", "warranty", "stat_stock_in", "stat_current_stock", "fbfFbaManagement", "godownTransfer"] },
  { name: "Admin & Analytics",icon: BarChart3,    color: "emerald", permissions: ["dashboard", "notifications", "users", "roles", "userActivity", "reports", "contracts"] },
  { name: "Email",            icon: Mail,         color: "amber",   permissions: ["emailAccounts", "emailTemplates", "emailInbox", "sentEmails"] },
  { name: "System Admin",     icon: ShieldAlert,  color: "rose",    permissions: ["apiLogs", "backupRestore", "rateLimitSettings", "aiSettings", "googleDrive"] },
];

// Order Processing, Billing, and Dispatch are the only tabs where view
// access does NOT automatically grant edit rights — everywhere else (Model
// Pricing, Serials, Godown, FBF/FBA, Installations, Returns, Damaged,
// Warranty, Platform Fields, Master Data, Roles, Company/Platform Master,
// Users, Email) the tab's own view checkbox above already covers add/edit,
// so those no longer need a separate entry here. Only Delete (still
// flag-gated everywhere, see lib/auth.js) and these 4 protected edit-flags
// remain.
export const EDIT_PERMISSIONS = [
  { key: "allow_create_order",          label: "Create Orders",             icon: Plus,         group: "Orders" },
  { key: "allow_edit_order_processing", label: "Edit Orders",               icon: ShoppingCart, group: "Orders" },
  { key: "allow_edit_billing",          label: "Edit Billing",              icon: Receipt,      group: "Orders" },
  { key: "allow_edit_dispatch",         label: "Edit Dispatch",             icon: Truck,        group: "Orders" },
  ...MASTER_EDIT_ENTRIES,
  ...FULL_CRUD_ENTRIES,
];

export const INITIAL_FORM = {
  username: "", password: "", roleId: "", fullName: "", email: "", phone: "",
};

// No role names are predefined, so colors can't be keyed by a fixed list —
// Admin gets a fixed identity, every other role name is hashed onto a small
// rotating palette so it still reads consistently across the app.
const ADMIN_CONFIG = { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500", avatar: "bg-indigo-100 text-indigo-700 border-indigo-300" };
const ROLE_PALETTE = [
  { bg: "bg-sky-100",     text: "text-sky-700",     border: "border-sky-200",     dot: "bg-sky-500",     avatar: "bg-sky-100 text-sky-700 border-sky-300" },
  { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500", avatar: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500",   avatar: "bg-amber-100 text-amber-700 border-amber-300" },
  { bg: "bg-violet-100",  text: "text-violet-700",  border: "border-violet-200",  dot: "bg-violet-500",  avatar: "bg-violet-100 text-violet-700 border-violet-300" },
  { bg: "bg-rose-100",    text: "text-rose-700",    border: "border-rose-200",    dot: "bg-rose-500",    avatar: "bg-rose-100 text-rose-700 border-rose-300" },
  { bg: "bg-teal-100",    text: "text-teal-700",    border: "border-teal-200",    dot: "bg-teal-500",    avatar: "bg-teal-100 text-teal-700 border-teal-300" },
];
const FALLBACK_CONFIG = { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200", dot: "bg-slate-400", avatar: "bg-slate-100 text-slate-600 border-slate-200" };

export const roleConfigFor = (roleName) => {
  if (!roleName) return FALLBACK_CONFIG;
  if (roleName === "Admin") return ADMIN_CONFIG;
  let hash = 0;
  for (let i = 0; i < roleName.length; i++) hash = (hash * 31 + roleName.charCodeAt(i)) >>> 0;
  return ROLE_PALETTE[hash % ROLE_PALETTE.length];
};

export const GROUP_COLORS = {
  indigo:  { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200",  icon: "text-indigo-500",  header: "bg-indigo-50 border-indigo-100",   checked: "bg-indigo-600 text-white",  checkedCard: "bg-indigo-50/80 border-indigo-200 text-indigo-900" },
  violet:  { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200",  icon: "text-violet-500",  header: "bg-violet-50 border-violet-100",   checked: "bg-violet-600 text-white",  checkedCard: "bg-violet-50/80 border-violet-200 text-violet-900" },
  sky:     { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     icon: "text-sky-500",     header: "bg-sky-50 border-sky-100",         checked: "bg-sky-600 text-white",     checkedCard: "bg-sky-50/80 border-sky-200 text-sky-900" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: "text-emerald-500", header: "bg-emerald-50 border-emerald-100", checked: "bg-emerald-600 text-white", checkedCard: "bg-emerald-50/80 border-emerald-200 text-emerald-900" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   icon: "text-amber-500",   header: "bg-amber-50 border-amber-100",     checked: "bg-amber-600 text-white",   checkedCard: "bg-amber-50/80 border-amber-200 text-amber-900" },
  rose:    { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    icon: "text-rose-500",    header: "bg-rose-50 border-rose-100",       checked: "bg-rose-600 text-white",    checkedCard: "bg-rose-50/80 border-rose-200 text-rose-900" },
};
