"use client";
import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Swal from "sweetalert2";
import axios from "axios";
import { Plus, Loader2, ArrowLeft, Trash2, Barcode } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

const VariantBarcode = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawVariantId = searchParams.get("itemVariantId");
  
  const [variantPackBarcodeId, setVariantPackBarcodeId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [pcsQty, setPcsQty] = useState("");
  
  const [barcodes, setBarcodes] = useState([]);
  const [units, setUnits] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [defaultQty, setDefaultQty] = useState(0);

  const getHeaders = () => {
    const token = sessionStorage.getItem("pt_auth_token");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchUnits = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/Inventory/GetUnitDropdown`, {
        headers: getHeaders(),
      });
      setUnits(response.data?.data || []);
    } catch (error) {
      console.error("Failed to load units", error);
    }
  };

  const fetchBarcodes = async () => {
    if (!rawVariantId) return;
    
    setTableLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/Inventory/GetVariantBarcodeList`, {
        params: { itemVariantId: rawVariantId },
        headers: getHeaders(),
      });
      setBarcodes(response.data?.data || []);
    } catch (error) {
      console.error("Failed to load barcodes", error);
      setBarcodes([]);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    if (!rawVariantId) {
      Swal.fire("Error", "Invalid access, Item variant not found", "error").then(() => {
        router.push("/itemMaster");
      });
      return;
    }
    fetchBarcodes();
    fetchUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawVariantId]);

  const handleQtyChange = (e) => {
    const val = e.target.value;
    setPcsQty(val);
    
    // Alert logic from CSHTML
    if (defaultQty > 0 && val != defaultQty && val !== "") {
      Swal.fire({
        icon: 'info',
        title: 'Quantity changed',
        text: `Default packing is ${defaultQty} PCS. You entered ${val} PCS.`,
        timer: 2500,
        showConfirmButton: false
      });
    }
  };

  const handleSaveBarcode = async () => {
    if (!unitId) {
      Swal.fire("Validation", "Please select unit", "warning");
      return;
    }
    if (!barcode.trim()) {
      Swal.fire("Validation", "Please enter barcode", "warning");
      return;
    }
    if (Number(pcsQty) <= 0) {
      Swal.fire("Validation", "PCS quantity must be greater than zero", "warning");
      return;
    }

    setDefaultQty(Number(pcsQty));
    setLoading(true);

    try {
      const payload = {
        BarcodeId: variantPackBarcodeId || "0",
        ItemVariantId: rawVariantId,
        Barcode: barcode.trim(),
        SubUnitQty: Number(pcsQty)
      };
      
      const res = await axios.post(
        `${API_BASE_URL}/Inventory/SaveOrUpdateVariantBarcode`,
        payload,
        { headers: getHeaders() }
      );
      
      if (res.data?.message === "Success") {
        Swal.fire("Success", "Barcode saved successfully", "success");
        resetForm();
        fetchBarcodes();
      } else {
        Swal.fire("Error", res.data?.message || "Failed to save barcode", "error");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBarcode = (id) => {
    Swal.fire({
      title: "Are you sure?",
      text: "Barcode mapping will be disabled",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel"
    }).then(async (result) => {
      if (result.isConfirmed) {
        setTableLoading(true);
        try {
          const res = await axios.post(`${API_BASE_URL}/Inventory/DeleteVariantBarcode`, 
            { barcodeId: id }, 
            { headers: getHeaders() }
          );
          
          if (res.data?.message === "Success" || !res.data?.message) {
            Swal.fire("Deleted", "Barcode deleted successfully", "success");
            fetchBarcodes();
          } else {
            Swal.fire("Error", res.data?.message || "Failed to delete", "error");
          }
        } catch (error) {
          console.error(error);
          fetchBarcodes();
        } finally {
          setTableLoading(false);
        }
      }
    });
  };

  const resetForm = () => {
    setVariantPackBarcodeId("");
    setBarcode("");
    setPcsQty("");
    setUnitId("");
    setDefaultQty(0);
  };

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-screen">
      <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl">
            <Barcode size={28} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Variant Barcode Mapping</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Map barcodes and pack limits to units</p>
          </div>
        </div>
        
        <button 
          onClick={() => router.back()}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Unit</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
            >
              <option value="">Select Unit</option>
              {units.map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {u.unitName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Barcode</label>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveBarcode()}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 font-mono text-slate-800 font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm"
              placeholder="Enter / Scan Barcode"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Default PCS Qty</label>
            <input
              type="number"
              value={pcsQty}
              onChange={handleQtyChange}
              onKeyDown={(e) => e.key === "Enter" && handleSaveBarcode()}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm"
              placeholder="Ex: 5"
            />
          </div>

          <div className="flex gap-3 h-full pb-[1px]">
            <button
              onClick={handleSaveBarcode}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-200 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Barcode</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">PCS Qty</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-32">Action</th>
              </tr>
            </thead>
            <tbody>
              {barcodes.length > 0 ? (
                barcodes.map((b, index) => (
                  <tr key={b.BarcodeId || index} className="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors">
                    
                    <td className="py-4 px-6 text-sm font-bold text-slate-800 font-mono">
                      <span className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                        {b.Barcode}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center text-sm font-bold text-emerald-700">
                      {b.SubUnitQty}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <button 
                        onClick={() => handleDeleteBarcode(b.BarcodeId)}
                        className="bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1 mx-auto"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="py-8 px-6 text-center">
                    {tableLoading ? (
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <Loader2 className="animate-spin mb-2" size={24} />
                        <span className="text-sm font-medium">Loading barcodes...</span>
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-slate-500">No barcodes mapped</div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VariantBarcode;


