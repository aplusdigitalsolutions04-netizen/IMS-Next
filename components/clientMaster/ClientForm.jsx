"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Users, FileText, Phone, MapPin, User, Loader2, Check } from "lucide-react";
import Swal from "sweetalert2";
import { clientsService } from "@/lib/services/clientsService";
import { platformsService } from "@/lib/services/platformsService";
import { getStoredUser } from "@/lib/client/auth";
import { hasPermission } from "@/lib/client/rbac";

const EMPTY_FORM = { guid: null, name: "", gstNumber: "", contactNumber: "", shippingAddress: "", buyerAddress: "", consigneeName: "", allowedPlatforms: [] };

// Full-page replacement for the old Add / Edit Client popup. `clientGuid` is
// null for "Add Client". Same fields and same save calls as before.
export default function ClientForm({ clientGuid = null }) {
  const router = useRouter();
  const isEdit = !!clientGuid;
  const currentUser = typeof window !== "undefined" ? getStoredUser() : null;
  const canManage = hasPermission(currentUser, "clientMaster") || !!currentUser?.allow_edit_clientMaster;

  const [form, setForm] = useState(EMPTY_FORM);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    platformsService.getPlatforms().then(setPlatforms).catch((err) => console.error("Failed to load platforms:", err));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    clientsService.getClients()
      .then((data) => {
        const c = (Array.isArray(data) ? data : []).find((x) => x.guid === clientGuid);
        if (!c) { setNotFound(true); return; }
        setForm({
          guid: c.guid,
          name: c.name || "",
          gstNumber: c.gstNumber || "",
          contactNumber: c.contactNumber || "",
          shippingAddress: c.shippingAddress || "",
          buyerAddress: c.buyerAddress || "",
          consigneeName: c.consigneeName || "",
          allowedPlatforms: Array.isArray(c.allowedPlatforms) ? c.allowedPlatforms : [],
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [isEdit, clientGuid]);

  const goBack = () => router.push("/clientMaster");

  const togglePlatform = (value) =>
    setForm((prev) => ({
      ...prev,
      allowedPlatforms: prev.allowedPlatforms.includes(value) ? prev.allowedPlatforms.filter((p) => p !== value) : [...prev.allowedPlatforms, value],
    }));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const name = form.name.trim();
    if (!name) {
      Swal.fire("Warning", "Client name is required", "warning");
      return;
    }
    try {
      setSaving(true);
      if (form.guid) await clientsService.updateClient(form.guid, { ...form, name });
      else await clientsService.addClient({ ...form, name });
      await Swal.fire({ icon: "success", title: form.guid ? "Client updated" : "Client added", timer: 1300, showConfirmButton: false });
      goBack();
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || error.message || "Failed to save client", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-16 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={26} /></div>;
  if (notFound || !canManage) {
    return (
      <div className="space-y-4">
        <button onClick={goBack} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to Clients</button>
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500 text-sm">
          {notFound ? "This client was not found (it may have been deleted)." : "You don't have permission to add or edit clients."}
        </div>
      </div>
    );
  }

  const lbl = "mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700";
  const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center gap-4 shrink-0 sticky top-0 z-10">
        <button type="button" onClick={goBack} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft size={16} /> Back to Clients
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center"><Users size={13} className="text-indigo-700" /></div>
          <h1 className="text-sm font-extrabold text-slate-900">{isEdit ? `Edit Client — ${form.name || ""}` : "Add Client"}</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button type="button" onClick={goBack} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-100 transition-all">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60 shadow-md">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {isEdit ? "Save Changes" : "Add Client"}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-base font-black text-slate-900">Client details</h2>
          <div>
            <label className={lbl}><Users size={14} className="text-slate-400" /> Client Name *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} placeholder="e.g. SKIMS Medical College & Hospital" autoFocus />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}><FileText size={14} className="text-slate-400" /> GSTIN</label>
              <input type="text" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })} className={`${inp} uppercase`} placeholder="e.g. 27ABCDE1234F1Z5" />
            </div>
            <div>
              <label className={lbl}><Phone size={14} className="text-slate-400" /> Contact No.</label>
              <input type="text" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} className={inp} placeholder="e.g. 9876543210" />
            </div>
          </div>
          <div>
            <label className={lbl}><User size={14} className="text-slate-400" /> Consignee Name</label>
            <input type="text" value={form.consigneeName} onChange={(e) => setForm({ ...form, consigneeName: e.target.value })} className={inp} placeholder="Consignee Name" />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-black text-slate-900">Addresses</h2>
            <div>
              <label className={lbl}><MapPin size={14} className="text-slate-400" /> Shipping Address</label>
              <textarea value={form.shippingAddress} onChange={(e) => setForm({ ...form, shippingAddress: e.target.value })} className={inp} placeholder="Full shipping address..." rows={3} />
            </div>
            <div>
              <label className={lbl}><MapPin size={14} className="text-slate-400" /> Buyer Address</label>
              <textarea value={form.buyerAddress} onChange={(e) => setForm({ ...form, buyerAddress: e.target.value })} className={inp} placeholder="Full buyer address..." rows={3} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-black text-slate-900 mb-1">Selling Platforms</h2>
            <p className="mb-3 text-xs text-slate-400">Leave all unselected to show this client for every platform in New Dispatch.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {platforms.map((p) => {
                const checked = form.allowedPlatforms.includes(p.name);
                return (
                  <button key={p.name} type="button" onClick={() => togglePlatform(p.name)}
                    className={`px-3 py-2 rounded-lg border-2 text-xs font-bold transition-all text-left truncate ${checked ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-slate-300 bg-white"}`}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
