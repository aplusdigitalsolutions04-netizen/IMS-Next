"use client";
import React, { useEffect, useState } from "react";
import { X, Loader2, ArrowRight, ArrowLeft, CheckCircle2, Plus, Tag, Layers, Link2, Ruler, Package, Sparkles, PackagePlus } from "lucide-react";
import Swal from "sweetalert2";
import { legacyApi } from "@/lib/client/http";

const STEPS = ["Brand", "Category", "Mapping", "Unit", "Item"];

function StepHeader({ step }) {
  return (
    <div className="px-6 sm:px-8 pt-5 pb-4 bg-slate-50 border-b border-slate-100">
      <div className="flex items-center">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                  i < step
                    ? "bg-emerald-500 text-white"
                    : i === step
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 ring-4 ring-indigo-100"
                    : "bg-white border-2 border-slate-200 text-slate-400"
                }`}
              >
                {i < step ? <CheckCircle2 size={16} /> : i + 1}
              </span>
              <span className={`text-[11px] font-bold uppercase tracking-wide hidden sm:block ${i <= step ? "text-slate-700" : "text-slate-300"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-[3px] mx-1.5 sm:mx-2 rounded-full transition-colors ${i < step ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function PickOrCreate({ icon: Icon, label, helperText, items, valueKey, labelKey, selected, onSelect, onCreate, newFieldLabel = "Name", extraFields, suggestedName, contractHint }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [extra, setExtra] = useState({});
  const [saving, setSaving] = useState(false);

  // If the contract already told us the brand/category and nothing in the
  // master matched it, jump straight to "create new" with the name filled
  // in — the user just confirms instead of typing it again.
  useEffect(() => {
    if (!selected && suggestedName && !creating) {
      setNewName(suggestedName);
      setCreating(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedName]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await onCreate(newName.trim(), extra);
      setCreating(false);
      setNewName("");
      setExtra({});
    } finally {
      setSaving(false);
    }
  };

  const isMatched =
    selected && contractHint && String(selected[labelKey] || "").trim().toLowerCase() === String(contractHint).trim().toLowerCase();

  return (
    <div className="p-6 sm:p-8 max-w-2xl mx-auto">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <Icon size={19} className="text-indigo-600" />
        </div>
        <div>
          <h4 className="text-base font-black text-slate-800">{label}</h4>
          {helperText && <p className="text-xs text-slate-400 font-medium mt-0.5">{helperText}</p>}
        </div>
      </div>

      {isMatched && (
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-4">
          <Sparkles size={13} /> Matched "{contractHint}" from the contract
        </div>
      )}

      {items.length > 0 && !creating && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
          {items.map((it) => {
            const isSelected = selected?.[valueKey] === it[valueKey];
            return (
              <button
                key={it[valueKey]}
                onClick={() => onSelect(it)}
                className={`relative text-left px-3.5 py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                  isSelected
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                    : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50"
                }`}
              >
                {it[labelKey]}
                {isSelected && <CheckCircle2 size={15} className="absolute top-2 right-2" />}
              </button>
            );
          })}
        </div>
      )}

      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={14} /> Create New {label}
        </button>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          {suggestedName && (
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
              <Sparkles size={12} /> Prefilled from the contract — review and confirm
            </p>
          )}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{newFieldLabel}</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={newFieldLabel}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
            />
          </div>
          {extraFields?.map((f) => (
            <div key={f.key}>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{f.label}</label>
              <input
                value={extra[f.key] || ""}
                onChange={(e) => setExtra((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.label}
                type={f.type || "text"}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Save {label}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AddProductWizard({ product, onClose, onLinked }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [items, setItems] = useState([]);

  const [brand, setBrand] = useState(null);
  const [category, setCategory] = useState(null);
  const [unit, setUnit] = useState(null);
  const [mappingBusy, setMappingBusy] = useState(false);

  const [itemMode, setItemMode] = useState(null); // "variant" | "new"
  const [existingItem, setExistingItem] = useState(null);
  const [newItem, setNewItem] = useState({
    itemName: product?.productName || "",
    hsnCode: product?.hsnCode || "",
    isTrackable: false,
  });
  const [finishing, setFinishing] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [b, c, u] = await Promise.all([
        legacyApi.get("/Inventory/GetBrandDropdown"),
        legacyApi.get("/Inventory/GetCategoryDropdown"),
        legacyApi.get("/Inventory/GetUnitDropdown"),
      ]);
      const brandList = b.data?.data || [];
      const categoryList = c.data?.data || [];
      setBrands(brandList);
      setCategories(categoryList);
      setUnits(u.data?.data || []);

      // Auto-match against what the contract already told us (product.brand /
      // product.categoryQuadrant) so the user doesn't re-type what's already
      // on file — falls through to the "create new, name prefilled" path in
      // PickOrCreate when nothing matches.
      const norm = (v) => String(v || "").trim().toLowerCase();
      if (product?.brand) {
        const match = brandList.find((it) => norm(it.Text) === norm(product.brand));
        if (match) setBrand(match);
      }
      if (product?.categoryQuadrant) {
        const match = categoryList.find((it) => norm(it.Text) === norm(product.categoryQuadrant));
        if (match) setCategory(match);
      }
    } catch (err) {
      console.error("Failed to load master data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateBrand = async (name) => {
    const res = await legacyApi.post("/Inventory/SaveOrUpdateBrand", { BrandId: "", BrandName: name, ShowInModels: true });
    const brandsRes = await legacyApi.get("/Inventory/GetBrandDropdown");
    setBrands(brandsRes.data?.data || []);
    const created = (brandsRes.data?.data || []).find((b) => b.Value === res.data.brandId) || { Value: res.data.brandId, Text: name };
    setBrand(created);
  };

  const handleCreateCategory = async (name) => {
    const res = await legacyApi.post("/Inventory/SaveOrUpdateCategory", { CategoryId: "", CategoryName: name, ShowMrp: false });
    const catRes = await legacyApi.get("/Inventory/GetCategoryDropdown");
    setCategories(catRes.data?.data || []);
    const created = (catRes.data?.data || []).find((c) => c.Value === res.data.categoryId) || { Value: res.data.categoryId, Text: name };
    setCategory(created);
  };

  const handleCreateUnit = async (name, extra) => {
    const res = await legacyApi.post("/Inventory/SaveOrUpdateUnit", {
      UnitId: "", UnitName: name, UnitDesc: extra.UnitDesc || "", BaseUnitQty: extra.BaseUnitQty || 1,
    });
    const unitRes = await legacyApi.get("/Inventory/GetUnitDropdown");
    setUnits(unitRes.data?.data || []);
    const created = (unitRes.data?.data || []).find((u) => u.unitId === res.data.unitId) || { unitId: res.data.unitId, unitName: name };
    setUnit(created);
  };

  const ensureMapping = async () => {
    setMappingBusy(true);
    try {
      const res = await legacyApi.get("/Inventory/CheckCategoryBrandMapping", {
        params: { categoryId: category.Value, brandId: brand.Value },
      });
      const already = res.data?.exists;
      if (!already) {
        await legacyApi.post("/Inventory/SaveOrUpdateCategoryBrandMapping", {
          MappingId: "", CategoryId: category.Value, BrandId: brand.Value,
        });
      }
      setStep(3);
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to map category & brand", "error");
    } finally {
      setMappingBusy(false);
    }
  };

  const loadItemsForCategory = async () => {
    try {
      const res = await legacyApi.get("/Inventory/GetItemDropdown", { params: { categoryId: category.Value, brandId: brand.Value } });
      setItems(res.data?.data || []);
    } catch (err) {
      console.error("Failed to load items:", err);
    }
  };

  useEffect(() => {
    if (step === 4 && category && brand) loadItemsForCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const finishAsVariant = async () => {
    if (!existingItem) return;
    setFinishing(true);
    try {
      const res = await legacyApi.post("/Inventory/SaveOrUpdateItemVariant", {
        ItemVariantId: "", ItemId: existingItem.itemId, VariantCode: product.productName,
      });
      onLinked(res.data.itemVariantId);
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to create variant", "error");
    } finally {
      setFinishing(false);
    }
  };

  const finishAsNewItem = async () => {
    if (!newItem.itemName.trim()) {
      Swal.fire("Item Name required", "Please enter an item name.", "warning");
      return;
    }
    setFinishing(true);
    try {
      const itemRes = await legacyApi.post("/Inventory/SaveOrUpdateItem", {
        ItemId: "", CategoryId: category.Value, BrandId: brand.Value,
        ItemName: newItem.itemName.trim(), ItemCode: "", HsnCode: newItem.hsnCode || "",
        UnitId: unit.unitId, IsTrackable: newItem.isTrackable, UseSerialTab: newItem.isTrackable,
      });
      const variantRes = await legacyApi.post("/Inventory/SaveOrUpdateItemVariant", {
        ItemVariantId: "", ItemId: itemRes.data.itemId, VariantCode: product.productName || newItem.itemName.trim(),
      });
      onLinked(variantRes.data.itemVariantId);
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to create item", "error");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 sm:px-8 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <PackagePlus size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-white tracking-tight">Add Product to Inventory</h3>
              <p className="text-xs text-indigo-100 font-semibold truncate">{product?.productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/15 rounded-xl text-white transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="animate-spin text-indigo-600" size={30} />
            <p className="text-sm font-semibold text-slate-400">Loading masters…</p>
          </div>
        ) : (
          <>
            <StepHeader step={step} />
            <div className="option-scroll flex-1 overflow-y-auto bg-white">
              {step === 0 && (
                <PickOrCreate
                  icon={Tag}
                  label="Brand"
                  helperText="Which brand does this product belong to?"
                  items={brands}
                  valueKey="Value"
                  labelKey="Text"
                  selected={brand}
                  onSelect={setBrand}
                  onCreate={handleCreateBrand}
                  newFieldLabel="Brand Name"
                  suggestedName={!brand ? product?.brand : null}
                  contractHint={product?.brand}
                />
              )}
              {step === 1 && (
                <PickOrCreate
                  icon={Layers}
                  label="Category"
                  helperText="Pick the product category, or create a new one."
                  items={categories}
                  valueKey="Value"
                  labelKey="Text"
                  selected={category}
                  onSelect={setCategory}
                  onCreate={handleCreateCategory}
                  newFieldLabel="Category Name"
                  suggestedName={!category ? product?.categoryQuadrant : null}
                  contractHint={product?.categoryQuadrant}
                />
              )}
              {step === 2 && (
                <div className="p-8 sm:p-12 flex flex-col items-center text-center gap-4 max-w-lg mx-auto">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center">
                    <Link2 size={28} className="text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-800 mb-1.5">Link Category to Brand</h4>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      We'll map category <span className="text-indigo-700 font-black">{category?.Text}</span> to brand{" "}
                      <span className="text-indigo-700 font-black">{brand?.Text}</span> — this makes it available together in Item Master going forward.
                    </p>
                  </div>
                  <button
                    onClick={ensureMapping}
                    disabled={mappingBusy}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold px-6 py-3 rounded-xl flex items-center gap-2 shadow-md shadow-indigo-100 transition-all"
                  >
                    {mappingBusy ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Confirm Mapping
                  </button>
                </div>
              )}
              {step === 3 && (
                <PickOrCreate
                  icon={Ruler}
                  label="Unit"
                  helperText="Unit of measurement (e.g. Piece, Box, Set)."
                  items={units}
                  valueKey="unitId"
                  labelKey="unitName"
                  selected={unit}
                  onSelect={setUnit}
                  onCreate={handleCreateUnit}
                  newFieldLabel="Unit Name"
                  extraFields={[
                    { key: "UnitDesc", label: "Description (optional)" },
                    { key: "BaseUnitQty", label: "Base Unit Quantity", type: "number" },
                  ]}
                />
              )}
              {step === 4 && (
                <div className="p-6 sm:p-8 max-w-2xl mx-auto">
                  <div className="flex items-start gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                      <Package size={19} className="text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-slate-800">Item Master</h4>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">Last step — link this to a product record.</p>
                    </div>
                  </div>

                  {!itemMode && (
                    <div>
                      <p className="text-sm font-semibold text-slate-500 mb-3">Is this a variant of an existing item, or a new item?</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={() => setItemMode("variant")}
                          className="text-left border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-2xl p-4 transition-all group"
                        >
                          <Layers size={20} className="text-indigo-600 mb-2" />
                          <div className="text-sm font-black text-slate-700 group-hover:text-indigo-700">Variant of Existing Item</div>
                          <div className="text-xs text-slate-400 font-medium mt-0.5">Add as a new variant under an item already in Item Master</div>
                        </button>
                        <button
                          onClick={() => setItemMode("new")}
                          className="text-left border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-2xl p-4 transition-all group"
                        >
                          <Sparkles size={20} className="text-indigo-600 mb-2" />
                          <div className="text-sm font-black text-slate-700 group-hover:text-indigo-700">New Item</div>
                          <div className="text-xs text-slate-400 font-medium mt-0.5">Create a brand-new item in Item Master</div>
                        </button>
                      </div>
                    </div>
                  )}

                  {itemMode === "variant" && (
                    <div>
                      <button onClick={() => setItemMode(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-4">
                        <ArrowLeft size={12} /> Back
                      </button>
                      {items.length === 0 ? (
                        <p className="text-sm text-slate-400 mb-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                          No existing items for this brand/category yet — try "New Item" instead.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
                          {items.map((it) => {
                            const isSelected = existingItem?.itemId === it.itemId;
                            return (
                              <button
                                key={it.itemId}
                                onClick={() => setExistingItem(it)}
                                className={`relative text-left px-3.5 py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                                  isSelected
                                    ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                                    : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50"
                                }`}
                              >
                                {it.itemName}
                                {isSelected && <CheckCircle2 size={15} className="absolute top-2 right-2" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">New variant name</span>
                        <p className="text-sm font-black text-slate-700">{product?.productName}</p>
                      </div>
                      <button
                        onClick={finishAsVariant}
                        disabled={!existingItem || finishing}
                        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-emerald-100 transition-all"
                      >
                        {finishing ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Create Variant &amp; Link
                      </button>
                    </div>
                  )}

                  {itemMode === "new" && (
                    <div>
                      <button onClick={() => setItemMode(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-4">
                        <ArrowLeft size={12} /> Back
                      </button>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Item Name</label>
                          <input
                            value={newItem.itemName}
                            onChange={(e) => setNewItem((prev) => ({ ...prev, itemName: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">HSN Code</label>
                          <input
                            value={newItem.hsnCode}
                            onChange={(e) => setNewItem((prev) => ({ ...prev, hsnCode: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Item Type</label>
                          <div className="flex gap-2 h-[42px] items-center">
                            <label className={`flex-1 h-full flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl border-2 cursor-pointer transition-colors ${newItem.isTrackable ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300"}`}>
                              <input type="radio" className="hidden" checked={newItem.isTrackable === true} onChange={() => setNewItem((prev) => ({ ...prev, isTrackable: true }))} />
                              Serialized
                            </label>
                            <label className={`flex-1 h-full flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl border-2 cursor-pointer transition-colors ${!newItem.isTrackable ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300"}`}>
                              <input type="radio" className="hidden" checked={newItem.isTrackable === false} onChange={() => setNewItem((prev) => ({ ...prev, isTrackable: false }))} />
                              Non-Serialized
                            </label>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={finishAsNewItem}
                        disabled={finishing}
                        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-emerald-100 transition-all"
                      >
                        {finishing ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Save Item &amp; Link
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {step < 4 && (
              <div className="px-6 sm:px-8 py-4 border-t border-slate-100 flex justify-between items-center shrink-0 bg-white">
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl disabled:opacity-30 disabled:hover:bg-transparent flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft size={14} /> Back
                </button>
                {step !== 2 && (
                  <button
                    onClick={() => setStep((s) => s + 1)}
                    disabled={(step === 0 && !brand) || (step === 1 && !category) || (step === 3 && !unit)}
                    className="px-6 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-100 transition-all"
                  >
                    Next <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
