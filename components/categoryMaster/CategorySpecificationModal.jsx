"use client";
import React, { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import { X, Plus, Loader2, Trash2, Edit2, ListPlus, Check } from "lucide-react";
import { legacyApi } from "@/lib/client/http";

/**
 * Manage the specification fields (dropdown or free-text) that this category
 * exposes on the Item Variant form — e.g. "Color Type" (dropdown), "CPU"
 * (textarea). Dropdown-type specs also get an inline option-value editor
 * backed by dropdown_master / dropdown_option.
 */
export default function CategorySpecificationModal({ category, onClose }) {
  const [specs, setSpecs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [specName, setSpecName] = useState("");
  const [fieldType, setFieldType] = useState("DROPDOWN");
  const [editSpecId, setEditSpecId] = useState("");

  const [openOptionsFor, setOpenOptionsFor] = useState("");
  const [optionLabel, setOptionLabel] = useState("");
  const [editOptionId, setEditOptionId] = useState("");
  const [savingOption, setSavingOption] = useState(false);

  const fetchSpecs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await legacyApi.get("/Inventory/GetCategorySpecificationList", {
        params: { categoryId: category.categoryId },
      });
      setSpecs(res.data?.data || []);
    } catch (error) {
      console.error("Failed to load specifications", error);
      setSpecs([]);
    } finally {
      setLoading(false);
    }
  }, [category.categoryId]);

  useEffect(() => {
    fetchSpecs();
  }, [fetchSpecs]);

  const resetSpecForm = () => {
    setSpecName("");
    setFieldType("DROPDOWN");
    setEditSpecId("");
  };

  const handleSaveSpec = async () => {
    if (!specName.trim()) {
      Swal.fire("Warning", "Please enter specification name", "warning");
      return;
    }
    setSaving(true);
    try {
      const res = await legacyApi.post("/Inventory/SaveOrUpdateCategorySpecification", {
        SpecificationId: editSpecId || "0",
        CategoryId: category.categoryId,
        SpecName: specName.trim(),
        FieldType: fieldType,
        DisplayOrder: specs.length,
      });
      if (res.data?.message === "Success") {
        resetSpecForm();
        fetchSpecs();
      } else {
        Swal.fire("Error", res.data?.message || "Failed to save specification", "error");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "Something went wrong", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSpec = (spec) => {
    setEditSpecId(spec.specificationId);
    setSpecName(spec.specName);
    setFieldType(spec.fieldType);
  };

  const handleDeleteSpec = (spec) => {
    Swal.fire({
      title: "Delete specification?",
      text: `"${spec.specName}" will be removed from this category's Item Variant form.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        await legacyApi.post("/Inventory/DeleteCategorySpecification", { specificationId: spec.specificationId });
        if (editSpecId === spec.specificationId) resetSpecForm();
        if (openOptionsFor === spec.specificationId) setOpenOptionsFor("");
        fetchSpecs();
      } catch (error) {
        Swal.fire("Error", "Failed to delete specification", "error");
      }
    });
  };

  const resetOptionForm = () => {
    setOptionLabel("");
    setEditOptionId("");
  };

  const toggleOptions = (spec) => {
    setOpenOptionsFor((prev) => (prev === spec.specificationId ? "" : spec.specificationId));
    resetOptionForm();
  };

  const handleSaveOption = async (spec) => {
    if (!optionLabel.trim()) return;
    setSavingOption(true);
    try {
      const res = await legacyApi.post("/Inventory/SaveOrUpdateCategorySpecificationOption", {
        OptionId: editOptionId || "0",
        SpecificationId: spec.specificationId,
        Label: optionLabel.trim(),
        DisplayOrder: spec.options.length,
      });
      if (res.data?.message === "Success") {
        resetOptionForm();
        fetchSpecs();
      } else {
        Swal.fire("Error", res.data?.message || "Failed to save value", "error");
      }
    } catch (error) {
      Swal.fire("Error", "Something went wrong", "error");
    } finally {
      setSavingOption(false);
    }
  };

  const handleEditOption = (option) => {
    setEditOptionId(option.optionId);
    setOptionLabel(option.label);
  };

  const handleDeleteOption = (option) => {
    Swal.fire({
      title: "Delete value?",
      text: `"${option.label}" will be removed.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        await legacyApi.post("/Inventory/DeleteCategorySpecificationOption", { optionId: option.optionId });
        if (editOptionId === option.optionId) resetOptionForm();
        fetchSpecs();
      } catch (error) {
        Swal.fire("Error", "Failed to delete value", "error");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">
            Specifications — <span className="text-indigo-600">{category.categoryName}</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pt-4 pb-2 border-b border-slate-100 bg-slate-50">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
            {editSpecId ? "Edit specification" : "Add specification"}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={specName}
              onChange={(e) => setSpecName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveSpec()}
              placeholder="e.g. Color Type, CPU, Screen Size"
              className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
            />
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="DROPDOWN">Dropdown</option>
              <option value="TEXTAREA">Text Area</option>
            </select>
            {editSpecId && (
              <button
                onClick={resetSpecForm}
                className="px-4 py-2.5 rounded-xl font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSaveSpec}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 shrink-0"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {editSpecId ? "Update" : "Add"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading specifications...
            </div>
          ) : specs.length === 0 ? (
            <p className="text-sm text-slate-400">No specifications defined for this category yet.</p>
          ) : (
            <div className="space-y-2">
              {specs.map((spec) => (
                <div key={spec.specificationId} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-white">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-800">{spec.specName}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {spec.fieldType === "DROPDOWN" ? "Dropdown" : "Text Area"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {spec.fieldType === "DROPDOWN" && (
                        <button
                          onClick={() => toggleOptions(spec)}
                          title="Manage values"
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <ListPlus size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => handleEditSpec(spec)}
                        title="Edit"
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteSpec(spec)}
                        title="Delete"
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {spec.fieldType === "DROPDOWN" && openOptionsFor === spec.specificationId && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="flex gap-2 mb-3">
                        <input
                          type="text"
                          value={optionLabel}
                          onChange={(e) => setOptionLabel(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveOption(spec)}
                          placeholder="Add a value, e.g. Black"
                          className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                        />
                        {editOptionId && (
                          <button
                            onClick={resetOptionForm}
                            className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleSaveOption(spec)}
                          disabled={savingOption}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-60 shrink-0"
                        >
                          {savingOption ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          {editOptionId ? "Update" : "Add"}
                        </button>
                      </div>
                      {spec.options.length === 0 ? (
                        <p className="text-xs text-slate-400">No values added yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {spec.options.map((option) => (
                            <span
                              key={option.optionId}
                              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full pl-3 pr-1.5 py-1 text-xs font-semibold text-slate-700"
                            >
                              {option.label}
                              <button onClick={() => handleEditOption(option)} className="text-indigo-500 hover:text-indigo-700 p-0.5">
                                <Edit2 size={11} />
                              </button>
                              <button onClick={() => handleDeleteOption(option)} className="text-red-500 hover:text-red-700 p-0.5">
                                <Trash2 size={11} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
