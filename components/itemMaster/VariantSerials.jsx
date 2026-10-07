"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import Swal from "sweetalert2";
import { ArrowLeft, Hash, Plus, Loader2, Edit2, Trash2, X } from "lucide-react";
import MasterDropdown from "@/components/common/MasterDropdown";
import { getStoredUser } from "@/lib/client/auth";
import { promptDeleteRemarks } from "@/lib/client/promptRemarks";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("pt_auth_token")}` });

const inp = "w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 outline-none bg-white text-slate-700";
const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

// Full-page replacement for the old "Serial Numbers — <variant>" popup in Item
// Variant Master: add serial number(s) (bulk), see every serial of the
// variant, edit or delete one. Same API calls as before.
export default function VariantSerials() {
  const router = useRouter();
  const params = useSearchParams();
  const itemVariantId = params.get("itemVariantId") || "";
  const variantCode = params.get("variantCode") || "";

  const storedUser = typeof window !== "undefined" ? getStoredUser() : null;
  const canAddSerial = !!storedUser?.allow_add_serial;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [godowns, setGodowns] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [newSerialValue, setNewSerialValue] = useState("");
  const [newLandingPrice, setNewLandingPrice] = useState("");
  const [newGodownGuid, setNewGodownGuid] = useState("");
  // Care Pack is opt-out for a freshly added serial, so it defaults to 1 Year.
  const [newCarePack, setNewCarePack] = useState("1 Year");
  const [newCarePackPrice, setNewCarePackPrice] = useState("");
  const [newVendorId, setNewVendorId] = useState("");
  const [addingSerial, setAddingSerial] = useState(false);
  const [deletingSerialGuid, setDeletingSerialGuid] = useState("");

  const [editingSerial, setEditingSerial] = useState(null);
  const [savingSerialEdit, setSavingSerialEdit] = useState(false);

  const loadSerials = useCallback(async () => {
    if (!itemVariantId) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/Inventory/GetVariantSerials`, { params: { itemVariantId }, headers: getHeaders() });
      setRows(response.data?.data || []);
      // Landing Price is pre-filled with the last used price for this variant.
      setNewLandingPrice((prev) => (prev === "" && response.data?.lastPurchaseRate ? String(response.data.lastPurchaseRate) : prev));
    } catch (error) {
      console.error("Failed to load serials", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [itemVariantId]);

  useEffect(() => { loadSerials(); }, [loadSerials]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/godowns`, { headers: getHeaders() })
      .then((r) => setGodowns(Array.isArray(r.data) ? r.data : r.data?.data || []))
      .catch((e) => console.error("Failed to load godowns", e));
    axios.get(`${API_BASE_URL}/Inventory/GetVendorList`, { headers: getHeaders() })
      .then((r) => setVendors(r.data?.data || []))
      .catch((e) => console.error("Failed to load vendors", e));
  }, []);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/itemMaster");
  };

  const handleAddSerial = async () => {
    // One or more serial numbers — split on newline/comma for bulk add.
    const values = newSerialValue.split(/[\n,]/).map((v) => v.trim()).filter((v) => v.length > 0);
    if (values.length === 0 || !itemVariantId) return;
    setAddingSerial(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/Inventory/AddVariantSerial`,
        {
          itemVariantId, values,
          landingPrice: newLandingPrice !== "" ? Number(newLandingPrice) : 0,
          godownGuid: newGodownGuid || null,
          carePack: newCarePack || null,
          carePackPrice: newCarePackPrice !== "" ? Number(newCarePackPrice) : null,
          vendorId: newVendorId || null,
        },
        { headers: getHeaders() }
      );
      setNewSerialValue("");
      await loadSerials();
      Swal.fire({ icon: "success", title: res.data?.count > 1 ? `${res.data.count} serial numbers added` : "Serial number added", timer: 1400, showConfirmButton: false });
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || "Failed to add serial number(s)", "error");
    } finally {
      setAddingSerial(false);
    }
  };

  const handleDeleteSerial = async (serial) => {
    const remarks = await promptDeleteRemarks({ title: "Delete Serial No.?", text: `This will remove "${serial.value}" from stock.` });
    if (!remarks) return;
    setDeletingSerialGuid(serial.guid);
    try {
      await axios.post(`${API_BASE_URL}/Inventory/DeleteVariantSerial`, { serialGuid: serial.guid, remarks }, { headers: getHeaders() });
      await loadSerials();
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || "Failed to delete serial", "error");
    } finally {
      setDeletingSerialGuid("");
    }
  };

  const openEditSerial = (s) =>
    setEditingSerial({
      guid: s.guid, value: s.value || "",
      landingPrice: s.landingPrice ? String(s.landingPrice) : "",
      godownGuid: s.godownGuid || "", vendorId: s.vendorId || "",
      carePack: s.carePack || "", carePackPrice: s.carePackPrice != null ? String(s.carePackPrice) : "",
    });

  const handleSaveSerialEdit = async () => {
    if (!editingSerial || !editingSerial.value.trim()) return;
    setSavingSerialEdit(true);
    try {
      await axios.post(
        `${API_BASE_URL}/Inventory/EditVariantSerial`,
        {
          serialGuid: editingSerial.guid,
          value: editingSerial.value.trim(),
          landingPrice: editingSerial.landingPrice !== "" ? Number(editingSerial.landingPrice) : 0,
          godownGuid: editingSerial.godownGuid || null,
          vendorId: editingSerial.vendorId || null,
          carePack: editingSerial.carePack || null,
          carePackPrice: editingSerial.carePackPrice !== "" ? Number(editingSerial.carePackPrice) : null,
        },
        { headers: getHeaders() }
      );
      setEditingSerial(null);
      await loadSerials();
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || "Failed to update serial", "error");
    } finally {
      setSavingSerialEdit(false);
    }
  };

  if (!itemVariantId) {
    return (
      <div className="space-y-4">
        <button onClick={goBack} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back</button>
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500 text-sm">No variant selected.</div>
      </div>
    );
  }
  if (!canAddSerial) {
    return (
      <div className="space-y-4">
        <button onClick={goBack} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back</button>
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500 text-sm">You don&apos;t have permission to manage serial numbers.</div>
      </div>
    );
  }

  const available = rows.filter((r) => r.status === "Available").length;

  return (
    <div className="bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center gap-4 shrink-0 sticky top-0 z-10">
        <button onClick={goBack} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"><ArrowLeft size={16} /> Back to Variants</button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center"><Hash size={13} className="text-indigo-700" /></div>
          <h1 className="text-sm font-extrabold text-slate-900">Serial Numbers — {variantCode || "Variant"}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs font-bold">
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{available} available</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{rows.length} total</span>
        </div>
      </div>

      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6 items-start">
        {/* Add serials */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 xl:sticky xl:top-20">
          <h2 className="text-base font-black text-slate-900">Add Serial No.</h2>
          <div>
            <label className={lbl}>Serial number(s) <span className="text-slate-400 font-normal normal-case">(ek se zyada ho to alag-alag line mein daalo — bulk add)</span></label>
            <textarea value={newSerialValue} onChange={(e) => setNewSerialValue(e.target.value)} rows={5} className={`${inp} font-mono resize-y`} placeholder={"Enter or scan serial number(s)\nOne per line for bulk add"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Landing Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                <input type="number" min="0" value={newLandingPrice} onChange={(e) => setNewLandingPrice(e.target.value)} className={`${inp} pl-7`} placeholder="Landing" />
              </div>
            </div>
            <div>
              <label className={lbl}>Godown</label>
              <select value={newGodownGuid} onChange={(e) => setNewGodownGuid(e.target.value)} className={inp}>
                <option value="">Select (optional)</option>
                {godowns.map((g) => <option key={g.guid || g.id} value={g.guid || g.id}>{g.godownName || g.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Care Pack</label>
              <MasterDropdown code="CARE_PACK" placeholder="Care Pack (optional)" value={newCarePack} onChange={(e) => setNewCarePack(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Care Pack Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                <input type="number" min="0" value={newCarePackPrice} onChange={(e) => setNewCarePackPrice(e.target.value)} className={`${inp} pl-7`} placeholder="CP Price" />
              </div>
            </div>
          </div>
          <div>
            <label className={lbl}>Vendor</label>
            <select value={newVendorId} onChange={(e) => setNewVendorId(e.target.value)} className={inp}>
              <option value="">Select Vendor (optional)</option>
              {vendors.map((v) => <option key={v.vendorId || v.id} value={v.vendorId || v.id}>{v.vendorFirmName || v.name}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-slate-400">Landing Price is pre-filled with the last used price for this variant — change it if this batch is different. Care Pack, its price, and Vendor (if any) apply to every serial added in this batch.</p>
          <button onClick={handleAddSerial} disabled={addingSerial || !newSerialValue.trim()} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50">
            {addingSerial ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add Serial No.
          </button>
        </div>

        {/* Serial list */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900">All serial numbers</h2>
            <span className="text-xs text-slate-400">{rows.length} serial number{rows.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading serial numbers...</div>
            ) : rows.length === 0 ? (
              <p className="p-12 text-center text-sm text-slate-400">No serial numbers found for this variant.</p>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {["#", "Serial No.", "Status", "Vendor", "Landing Price", "Care Pack Price", "Total", "Action"].map((h, i) => (
                      <th key={h} className={`p-3 text-xs font-bold text-slate-500 uppercase ${i >= 4 && i <= 6 ? "text-right" : i === 7 ? "text-center" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((s, idx) => {
                    const landing = Number(s.landingPrice) || 0;
                    const cpPrice = Number(s.carePackPrice) || 0;
                    return (
                      <tr key={s.guid} className="hover:bg-slate-50/60">
                        <td className="p-3 text-slate-400">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-slate-800">{s.value}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.status === "Available" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>{s.status}</span>
                        </td>
                        <td className="p-3 text-slate-600">{s.vendorName || "-"}</td>
                        <td className="p-3 text-right text-slate-600">{landing ? `₹${landing.toLocaleString("en-IN")}` : "-"}</td>
                        <td className="p-3 text-right text-slate-600">
                          {cpPrice ? `₹${cpPrice.toLocaleString("en-IN")}` : "-"}
                          {s.carePack && <span className="block text-[10px] text-violet-500">{s.carePack}</span>}
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-700">₹{(landing + cpPrice).toLocaleString("en-IN")}</td>
                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button onClick={() => openEditSerial(s)} title="Edit" className="bg-amber-50 border border-amber-100 hover:bg-amber-100 text-amber-700 p-1.5 rounded-lg transition-all inline-flex items-center justify-center"><Edit2 size={13} /></button>
                            {s.status === "Available" ? (
                              <button onClick={() => handleDeleteSerial(s)} disabled={deletingSerialGuid === s.guid} title="Delete" className="bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 p-1.5 rounded-lg transition-all disabled:opacity-50 inline-flex items-center justify-center">
                                {deletingSerialGuid === s.guid ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {editingSerial && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingSerial(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Edit2 size={18} className="text-amber-600" /> Edit Serial No.</h2>
              <button onClick={() => setEditingSerial(null)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={lbl}>Serial Number</label>
                <input type="text" value={editingSerial.value} onChange={(e) => setEditingSerial((p) => ({ ...p, value: e.target.value }))} className={`${inp} font-mono`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Landing Price</label>
                  <input type="number" min="0" value={editingSerial.landingPrice} onChange={(e) => setEditingSerial((p) => ({ ...p, landingPrice: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Godown</label>
                  <select value={editingSerial.godownGuid} onChange={(e) => setEditingSerial((p) => ({ ...p, godownGuid: e.target.value }))} className={inp}>
                    <option value="">-- None --</option>
                    {godowns.map((g) => <option key={g.guid || g.id} value={g.guid || g.id}>{g.godownName || g.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Vendor</label>
                <select value={editingSerial.vendorId} onChange={(e) => setEditingSerial((p) => ({ ...p, vendorId: e.target.value }))} className={inp}>
                  <option value="">-- None --</option>
                  {vendors.map((v) => <option key={v.vendorId || v.id} value={v.vendorId || v.id}>{v.vendorFirmName || v.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Care Pack</label>
                  <MasterDropdown code="CARE_PACK" placeholder="-- None --" value={editingSerial.carePack} onChange={(e) => setEditingSerial((p) => ({ ...p, carePack: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Care Pack Price</label>
                  <input type="number" min="0" value={editingSerial.carePackPrice} onChange={(e) => setEditingSerial((p) => ({ ...p, carePackPrice: e.target.value }))} className={inp} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setEditingSerial(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={handleSaveSerialEdit} disabled={savingSerialEdit || !editingSerial.value.trim()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed">
                {savingSerialEdit ? <Loader2 size={14} className="animate-spin" /> : <Edit2 size={14} />}
                {savingSerialEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
