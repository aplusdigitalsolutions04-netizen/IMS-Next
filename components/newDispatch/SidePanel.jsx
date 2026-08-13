"use client";
// Right-hand quick-pick panel extracted from NewDispatch.jsx — unchanged markup.
import React from "react";
import {
  AlertCircle, Building2, Database, ListChecks, Package, Shield, Boxes,
} from "lucide-react";
import SearchableSelect from "../common/SearchableSelect";

export default function SidePanel({
  activeTab, batchList, companyOptions, filteredModelsByCompany,
  getCompanyName, getSerialValue, models, processSerial, selectedCompany,
  selectedModelId, selectedPanelSerials, setForm, setSelectedCompany,
  setSelectedModelId, itemNameOptions = [], selectedItemName = "", setSelectedItemName,
}) {
  return (
          <aside className="xl:sticky xl:top-6 self-start">
            <div className="bg-white/95 backdrop-blur-2xl border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden">
              {/* Panel Header */}
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/80 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400"></div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-400 rounded-xl blur-md opacity-20"></div>
                    <div className="relative p-2 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-xl border border-indigo-200/50">
                      <Database size={18} className="text-indigo-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Serial Selection Panel</h3>
                    <p className="text-[10px] text-slate-500 font-medium">Browse & select serial numbers</p>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Brand Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Building2 size={11} className="text-slate-400" />
                    Brand Name
                  </label>
                  <SearchableSelect
                    value={selectedCompany}
                    onChange={(val) => { setSelectedCompany(val); setSelectedItemName(""); setSelectedModelId(""); }}
                    options={companyOptions.map(c => ({ label: c, value: c }))}
                    placeholder="Select brand"
                    emptyMsg="No brands found"
                  />
                </div>

                {/* Item Name Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Boxes size={11} className="text-slate-400" />
                    Item Name
                  </label>
                  <SearchableSelect
                    value={selectedItemName}
                    onChange={(val) => { setSelectedItemName(val); setSelectedModelId(""); }}
                    options={itemNameOptions.map(n => ({ label: n, value: n }))}
                    placeholder={selectedCompany ? "Select item" : "Select brand first"}
                    disabled={!selectedCompany}
                    emptyMsg="No items found"
                  />
                </div>

                {/* Model Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Package size={11} className="text-slate-400" />
                    Model
                  </label>
                  <SearchableSelect
                    value={selectedModelId}
                    onChange={setSelectedModelId}
                    options={filteredModelsByCompany.map(m => ({ label: m.name, value: m.guid }))}
                    placeholder={selectedItemName ? "Select model" : "Select item first"}
                    disabled={!selectedItemName}
                    emptyMsg="No models found"
                  />
                </div>

                {/* Serial Numbers List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <ListChecks size={11} className="text-slate-400" />
                      Available Serials
                    </label>
                    <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                      {selectedPanelSerials.length} found
                    </span>
                  </div>

                  {!selectedCompany || !selectedModelId ? (
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center bg-slate-50/50">
                      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <Database size={20} className="text-slate-300" />
                      </div>
                      <p className="text-sm font-bold text-slate-400">
                        Select brand & model
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">to view serial numbers</p>
                    </div>
                  ) : selectedPanelSerials.length === 0 ? (
                    <div className="border-2 border-dashed border-amber-200 rounded-2xl p-6 text-center bg-amber-50/50">
                      <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <AlertCircle size={20} className="text-amber-400" />
                      </div>
                      <p className="text-sm font-bold text-amber-700">
                        No serials available
                      </p>
                      <p className="text-[11px] text-amber-600 mt-1">for this model</p>
                    </div>
                  ) : (
                    <div className="border border-slate-200/80 rounded-2xl bg-slate-50/80 max-h-[480px] overflow-y-auto shadow-inner">
                      <div className="divide-y divide-slate-200/80">
                        {selectedPanelSerials.map((serial) => {
                          const model = models.find((m) => String(m.id) === String(serial.modelGuid));
                          const serialDisplay = getSerialValue(serial);
                          const isAlreadyAdded = batchList.some((b) => String(b.serialId) === String(serial.guid));

                          return (
                            <div
                              key={serial.guid}
                              className={`p-3.5 transition-all duration-200 ${
                                isAlreadyAdded
                                  ? "bg-emerald-50/60 opacity-60"
                                  : "hover:bg-white"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-mono text-xs font-extrabold text-slate-800 break-all leading-relaxed">
                                    {serialDisplay}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                    <span className="text-[9px] font-bold bg-white border border-slate-200 px-2 py-0.5 rounded-md text-slate-600 shadow-sm">
                                      {getCompanyName(model)}
                                    </span>
                                    <span className="text-[9px] font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md text-indigo-700">
                                      {model?.name || "Unknown"}
                                    </span>
                                    <span className="text-[9px] font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-amber-700">
                                      📍 {serial.godownName || "Unassigned"}
                                    </span>
                                    {Number(serial.returnCount || 0) > 0 && (
                                      <span className="text-[9px] font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-amber-700">
                                        Returned Earlier
                                      </span>
                                    )}
                                  </div>
                                  {serial.latestReturnReason && (
                                    <p className="text-[10px] text-amber-700 mt-1.5 break-words">
                                      Last reason: {serial.latestReturnReason}
                                    </p>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  disabled={isAlreadyAdded}
                                  onClick={() => {
                                    if (activeTab === "single") {
                                      processSerial(serialDisplay);
                                    } else {
                                      setForm((prev) => ({ ...prev, serialInput: serialDisplay }));
                                      processSerial(serialDisplay);
                                    }
                                  }}
                                  className={`flex-shrink-0 px-3 py-1.5 text-[10px] font-extrabold rounded-lg transition-all duration-200 ${
                                    isAlreadyAdded
                                      ? "bg-emerald-100 text-emerald-600 cursor-not-allowed border border-emerald-200"
                                      : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-sm hover:shadow-md active:scale-95"
                                  }`}
                                >
                                  {isAlreadyAdded ? "✓ Added" : "Add"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/60 border border-emerald-200/80 rounded-2xl p-4 shadow-sm">
                  <h4 className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                    <Shield size={11} className="text-emerald-600" />
                    Rules Applied
                  </h4>
                  <ul className="space-y-1.5 text-[11px] text-emerald-700 font-medium">
                    <li className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-emerald-400 rounded-full mt-1.5 flex-shrink-0"></span>
                      Single item quantity is fixed at 1
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-emerald-400 rounded-full mt-1.5 flex-shrink-0"></span>
                      Multiple item quantity is editable
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-emerald-400 rounded-full mt-1.5 flex-shrink-0"></span>
                      Selected serial is removed instantly
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-emerald-400 rounded-full mt-1.5 flex-shrink-0"></span>
                      Last delivery date auto-fills +15 days
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-emerald-400 rounded-full mt-1.5 flex-shrink-0"></span>
                      Order status available for GeM & Other only
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </aside>
  );
}

