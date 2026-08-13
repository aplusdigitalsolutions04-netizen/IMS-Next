"use client";
import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { Edit2, Trash2, Plus, Loader2, Link2 } from "lucide-react";
import { legacyApi } from "@/lib/client/http";
import PageHeader from "../common/PageHeader";

export default function CategoryBrandMapping() {
  const [mappings, setMappings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);

  const [mappingId, setMappingId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");

  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);

  const fetchDependencies = async () => {
    try {
      const [catRes, brandRes] = await Promise.all([
        legacyApi.get("/Inventory/GetCategoryDropdown"),
        legacyApi.get("/Inventory/GetBrandDropdown"),
      ]);
      setCategories(
        (catRes.data?.data || []).map((c) => ({ categoryId: c.Value, categoryName: c.Text }))
      );
      setBrands(
        (brandRes.data?.data || []).map((b) => ({ brandId: b.Value, brandName: b.Text }))
      );
    } catch (error) {
      console.error("Error fetching dependencies", error);
    }
  };

  const fetchMappings = async () => {
    setTableLoading(true);
    try {
      // This page renders every mapping in one table (no pager UI), so it
      // needs the full list — the endpoint itself paginates by default now,
      // so ask for a high limit explicitly instead of relying on it to
      // return everything unbounded.
      const response = await legacyApi.get("/Inventory/GetCategoryBrandMappingList", { params: { limit: 5000 } });
      setMappings(response.data?.data || []);
    } catch (error) {
      console.error(error);
      setMappings([]);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    fetchDependencies();
    fetchMappings();
  }, []);

  const handleSaveMapping = async () => {
    if (!categoryId || !brandId) {
      Swal.fire("Warning", "Please select both Category and Brand", "warning");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        MappingId: mappingId || "0",
        CategoryId: categoryId,
        BrandId: brandId,
      };

      const res = await legacyApi.post("/Inventory/SaveOrUpdateCategoryBrandMapping", payload);

      if (res.data?.message === "Success") {
        Swal.fire("Success", `Mapping ${mappingId ? "updated" : "saved"} successfully`, "success");
        resetForm();
        fetchMappings();
      } else {
        Swal.fire("Error", res.data?.message || "Failed to save mapping", "error");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Error", error.response?.data?.message || "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMapping = (id) => {
    Swal.fire({
      title: "Are you sure?",
      text: "This mapping will be deactivated",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    }).then(async (result) => {
      if (result.isConfirmed) {
        setTableLoading(true);
        try {
          const res = await legacyApi.post("/Inventory/DeleteCategoryBrandMapping", { mappingId: id });

          if (res.data?.message === "Success") {
            Swal.fire("Deleted", "Mapping deleted successfully", "success");
            fetchMappings();
          } else {
            Swal.fire("Error", res.data?.message || "Failed to delete", "error");
          }
        } catch (error) {
          console.error(error);
          Swal.fire("Error", "Something went wrong", "error");
        } finally {
          setTableLoading(false);
        }
      }
    });
  };

  const handleEdit = (map) => {
    setMappingId(map.mappingId);
    setCategoryId(map.categoryId);
    setBrandId(map.brandId);
  };

  const resetForm = () => {
    setMappingId("");
    setCategoryId("");
    setBrandId("");
  };

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-screen">
      <PageHeader icon={Link2} title="Category Brand Mapping" subtitle="Link brands to specific categories" />

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-end">

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm"
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Brand</label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm"
            >
              <option value="">Select Brand</option>
              {brands.map((b) => (
                <option key={b.brandId} value={b.brandId}>{b.brandName}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            {mappingId && (
              <button
                onClick={resetForm}
                className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition-all shadow-sm"
              >
                Clear
              </button>
            )}
            <button
              onClick={handleSaveMapping}
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-200 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              {mappingId ? "Update Mapping" : "Save Mapping"}
            </button>
          </div>
        </div>
      </div>

      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase">Sr. No.</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Brand</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-48">Action</th>
              </tr>
            </thead>
            <tbody>
              {mappings.length > 0 ? (
                mappings.map((map, index) => (
                  <tr key={map.mappingId || index} className="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors">
                    <td className="py-4 px-6 text-sm text-slate-600">{index + 1}</td>
                    <td className="py-4 px-6 text-sm font-bold text-slate-700">{map.categoryName}</td>
                    <td className="py-4 px-6 text-sm font-bold text-slate-700">{map.brandName}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(map)}
                          className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors tooltip"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteMapping(map.mappingId)}
                          className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors tooltip"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="py-8 px-6 text-center">
                    {tableLoading ? (
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <Loader2 className="animate-spin mb-2" size={24} />
                        <span className="text-sm font-medium">Loading mappings...</span>
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-slate-500">No mappings found</div>
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
}


