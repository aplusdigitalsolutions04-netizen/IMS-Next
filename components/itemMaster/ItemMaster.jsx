"use client";
import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { Edit2, Trash2, Plus, Loader2, Package, ListTree } from "lucide-react";
import { useRouter as useNavigate } from "next/navigation";
import { legacyApi } from "@/lib/client/http";
import PageHeader from "../common/PageHeader";
import Pagination from "../common/Pagination";

export default function ItemMaster() {
  const router = useNavigate();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [units, setUnits] = useState([]);

  // Form fields
  const [itemId, setItemId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [unitId, setUnitId] = useState("");
  const [isTrackable, setIsTrackable] = useState(false);
  const [useSerialTab, setUseSerialTab] = useState(false);

  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Filter items down to one category (e.g. "Printer") instead of showing
  // everything mixed together flat.
  const [filterCategoryId, setFilterCategoryId] = useState("");

  // Fetch initial dropdown data
  const fetchDependencies = async () => {
    try {
      const [catRes, unitRes] = await Promise.all([
        legacyApi.get("/Inventory/GetCategoryDropdown"),
        legacyApi.get("/Inventory/GetUnitDropdown"),
      ]);
      setCategories(
        (catRes.data?.data || []).map((c) => ({ categoryId: c.Value, categoryName: c.Text }))
      );
      setUnits(unitRes.data?.data || []);
    } catch (error) {
      console.error("Error fetching dependencies", error);
    }
  };

  // Fetch Items
  const fetchItems = async (page = currentPage, limit = pageSize, catFilter = filterCategoryId) => {
    setTableLoading(true);
    try {
      const response = await legacyApi.get("/Inventory/GetItemList", {
        params: { page, limit, ...(catFilter ? { categoryId: catFilter } : {}) },
      });
      setItems(response.data?.data || []);
      setTotalRecords(response.data?.total || 0);
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setTableLoading(false);
    }
  };

  // Load brands dynamically based on Category selection using the mapping route
  const fetchBrandsForCategory = async (catId) => {
    if (!catId) {
      setBrands([]);
      return;
    }
    try {
      const response = await legacyApi.get(`/Inventory/GetBrandByCategory?categoryId=${catId}`);
      setBrands(response.data?.data || []);
    } catch (error) {
      console.error("Error fetching brands", error);
      setBrands([]);
    }
  };

  useEffect(() => {
    fetchDependencies();
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchItems(currentPage, pageSize, filterCategoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, filterCategoryId]);

  useEffect(() => {
    fetchBrandsForCategory(categoryId);
  }, [categoryId]);

  const handleSaveItem = async () => {
    // Ensure unitId has a default if hidden and none selected
    let finalUnitId = unitId;
    if (!finalUnitId && units.length > 0) {
      finalUnitId = units[0].unitId;
    }

    if (!categoryId || !brandId || !itemName.trim() || !finalUnitId) {
      Swal.fire("Warning", "Please fill all required fields (Category, Brand, Item Name)", "warning");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ItemId: itemId || "0",
        CategoryId: categoryId,
        BrandId: brandId,
        ItemName: (itemName || "").trim(),
        ItemCode: (itemCode || "").trim(),
        HsnCode: (hsnCode || "").trim(),
        UnitId: finalUnitId,
        IsTrackable: isTrackable,
        UseSerialTab: useSerialTab,
      };

      const res = await legacyApi.post("/Inventory/SaveOrUpdateItem", payload);

      if (res.data?.message === "Success") {
        Swal.fire("Success", `Item ${itemId ? "updated" : "saved"} successfully`, "success");
        resetForm();
        fetchItems();
      } else {
        Swal.fire("Error", res.data?.message || "Failed to save item", "error");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Error", error.response?.data?.message || "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = (id) => {
    Swal.fire({
      title: "Are you sure?",
      text: "This item will be deactivated",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    }).then(async (result) => {
      if (result.isConfirmed) {
        setTableLoading(true);
        try {
          const res = await legacyApi.post("/Inventory/DeleteItem", { itemId: id });

          if (res.data?.message === "Success") {
            Swal.fire("Deleted", "Item deleted successfully", "success");
            fetchItems();
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

  const handleEdit = (item) => {
    setItemId(item.itemId || "");
    setCategoryId(item.categoryId || "");
    // We need to fetch brands for this category manually so the brand dropdown populates before we set the selected brand
    fetchBrandsForCategory(item.categoryId).then(() => {
      setBrandId(item.brandId || "");
    });
    setItemName(item.itemName || "");
    setItemCode(item.itemCode || "");
    setHsnCode(item.hsnCode || "");
    setUnitId(item.unitId || "");
    setIsTrackable(item.isTrackable);
    setUseSerialTab(!!item.useSerialTab);
  };

  const resetForm = () => {
    setItemId("");
    setCategoryId("");
    setBrandId("");
    setItemName("");
    setItemCode("");
    setHsnCode("");
    setUnitId("");
    setIsTrackable(false);
    setUseSerialTab(false);
  };

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-screen">
      <PageHeader icon={Package} title="Item Master" subtitle="Manage base items for your inventory" />

      {/* Form Section */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Category <span className="text-red-500">*</span></label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 shadow-sm">
              <option value="">Select Category</option>
              {categories.map((c) => (<option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Brand <span className="text-red-500">*</span></label>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={!categoryId} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 shadow-sm disabled:bg-slate-100">
              <option value="">Select Brand</option>
              {brands.map((b) => (<option key={b.brandId} value={b.brandId}>{b.brandName}</option>))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Item Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveItem()}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 shadow-sm"
              placeholder="Enter Item Name"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Item Code</label>
            <input
              type="text"
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveItem()}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 shadow-sm"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">HSN Code</label>
            <input
              type="text"
              value={hsnCode}
              onChange={(e) => setHsnCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveItem()}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 shadow-sm"
              placeholder="Optional"
            />
          </div>
          <div className="hidden">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Unit <span className="text-red-500">*</span></label>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 shadow-sm">
              <optgroup label="Default">
                {units.length > 0 && <option value={units[0].unitId}>{units[0].unitName}</option>}
              </optgroup>
              {units.map((u) => (<option key={u.unitId} value={u.unitId}>{u.unitName}</option>))}
            </select>
          </div>
          <div className="flex flex-col justify-center pt-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Ask Serial No. <span className="text-red-500">*</span></label>
            <select value={isTrackable ? "true" : "false"} onChange={(e) => setIsTrackable(e.target.value === "true")} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 shadow-sm font-semibold">
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          {itemId && (<button onClick={resetForm} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 shadow-sm transition-all">Clear</button>)}
          <button onClick={handleSaveItem} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md transition-all disabled:opacity-70">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} {itemId ? "Update Item" : "Save Item"}
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
          <ListTree size={13} /> Category
        </label>
        <select
          value={filterCategoryId}
          onChange={(e) => { setFilterCategoryId(e.target.value); setCurrentPage(1); }}
          className="bg-white border border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 shadow-sm"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (<option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>))}
        </select>
      </div>

      {/* Table Section */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase">Sr. No.</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Item Details</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase">Category</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase">Brand</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase">Serial No</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase">Code/HSN</th>
                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase text-center w-32">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length > 0 ? items.map((item, index) => (
                <tr key={item.itemId || index} className="hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-6 text-sm text-slate-600">{(currentPage - 1) * pageSize + index + 1}</td>
                  <td className="py-4 px-6 text-sm font-bold text-slate-700">
                    {item.itemName}
                    {item.isTrackable ? <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Trackable</span> : null}
                  </td>
                  <td className="py-3 px-6 text-sm text-slate-600">{item.categoryName}</td>
                  <td className="py-3 px-6 text-sm text-slate-600">{item.brandName}</td>
                  <td className="py-3 px-6 text-sm font-semibold">
                    {item.isTrackable ? (
                      <span className="bg-indigo-100 text-indigo-700 font-bold px-3 py-1 rounded-full text-xs">Yes</span>
                    ) : (
                      <span className="bg-slate-100 text-slate-600 font-bold px-3 py-1 rounded-full text-xs">No</span>
                    )}
                  </td>
                  <td className="py-3 px-6 text-sm text-slate-500 text-xs">Code: {item.itemCode || '-'}<br />HSN: {item.hsnCode || '-'}</td>
                  <td className="py-3 px-6">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => router.push(`/itemVariant?itemId=${item.itemId}&itemName=${encodeURIComponent(item.itemName)}&categoryName=${encodeURIComponent(item.categoryName || "")}`)}
                        className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg tooltip"
                        title="Manage Variants"
                      >
                        <ListTree size={16} />
                      </button>
                      <button onClick={() => handleEdit(item)} className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg"><Edit2 size={16} /></button>
                      <button onClick={() => handleDeleteItem(item.itemId)} className="p-2 text-red-600 hover:bg-red-100 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan="7" className="py-12 text-center text-sm font-medium text-slate-500">{tableLoading ? <Loader2 className="animate-spin inline mr-2" size={18} /> : "No items found"}</td></tr>}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalRecords={totalRecords}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        />
      </div>
    </div>
  );
}


