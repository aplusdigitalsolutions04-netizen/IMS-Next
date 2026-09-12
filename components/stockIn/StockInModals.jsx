"use client";
// Modals extracted from StockIn.jsx — markup and behavior unchanged.
import React from "react";
import { FileText, ListOrdered, Trash2 } from "lucide-react";
import MasterDropdown from "@/components/common/MasterDropdown";

export default function StockInModals({
  autoSaveDraft, barcodeVariants, batchCarePack, currentScannedBarcode, godowns,
  handleDeleteSerial, handleSerialInputChange, handleSerialInputKeyDown,
  isFinalized, previewFileUrl, processUnitSelection, processVariantSelection,
  saveSerialNumbersClick, serialNumbersToSave, serialPopupIndex, setBatchCarePack,
  setPendingVariantData, setShowInvoicePreview, setShowSerialModal,
  setShowUnitModal, setShowVariantModal, setStockItems, showInvoicePreview,
  showSerialModal, showUnitModal, showVariantModal, stockItems, units,
}) {
  return (
    <>
      {/* MODAL: VARIANT SELECTION */}
      {showVariantModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800">
                Select Variant
              </h3>
              <button 
                onClick={() => setShowVariantModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                X
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              This barcode is linked to multiple variants. Which one are you stocking in?
            </p>
            
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {barcodeVariants.map((v, idx) => (
                <button
                  key={idx}
                  onClick={() => processVariantSelection(v, currentScannedBarcode)}
                  className="flex flex-col items-start p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
                >
                  <span className="font-bold text-slate-800">{v.variantCode || v.itemName}</span>
                  <span className="text-xs text-slate-500 mt-1">
                    Item: {v.itemName} | In Stock: {v.stockQty} {v.unitName || 'PCS'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: UNIT SELECTION */}
      {showUnitModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800">
                Select Unit
              </h3>
              <button 
                onClick={() => { setShowUnitModal(false); setPendingVariantData(null); }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                X
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Please select the unit for this stock entry:
            </p>
            
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {units.map((u, idx) => (
                <button
                  key={idx}
                  onClick={() => processUnitSelection(u)}
                  className="flex justify-between items-center p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
                >
                  <div>
                    <span className="font-bold text-slate-800">{u.unitName}</span>
                    <span className="block text-xs text-slate-500 mt-1">
                      {u.unitDesc || 'No description'}
                    </span>
                  </div>
                  <span className="inline-flex items-center justify-center bg-indigo-100 text-indigo-700 text-xs font-black px-2 py-1 rounded-lg">
                    x {u.baseUnitQty} PCS
                  </span>
                </button>
              ))}
              {units.length === 0 && (
                 <div className="p-4 text-center text-sm font-medium text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
                    No units found in Unit Master.
                 </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SERIAL NUMBERS */}
      {showSerialModal && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
               <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2">
                 <ListOrdered className="text-indigo-600" /> Enter Serial Numbers
               </h3>
               <p className="text-sm font-medium text-slate-500 mb-6">Assign exact serial identities mapping to the quantity purchased.</p>

               {stockItems[serialPopupIndex]?.hasSerialNumber && (
                 <div className="mb-4 border-b border-slate-100 pb-4">
                    <label className="block text-xs font-bold text-indigo-700 uppercase mb-2 flex items-center gap-1.5">
                      Target Godown
                      {!stockItems[serialPopupIndex]?.godownGuid && !isFinalized && (
                        <span className="text-amber-500 text-[10px] font-semibold normal-case">(Please Select)</span>
                      )}
                    </label>
                    <select
                      disabled={isFinalized}
                      value={stockItems[serialPopupIndex]?.godownGuid || ""}
                      onChange={(e) => {
                         setStockItems(prev => {
                           const updated = [...prev];
                           if (updated[serialPopupIndex]) {
                             updated[serialPopupIndex] = { ...updated[serialPopupIndex], godownGuid: e.target.value };
                             autoSaveDraft(updated[serialPopupIndex], updated, serialPopupIndex);
                           }
                           return updated;
                         });
                      }}
                      className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-slate-800 font-bold focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 outline-none disabled:bg-slate-100 transition-all cursor-pointer ${
                        !stockItems[serialPopupIndex]?.godownGuid && !isFinalized ? 'border-amber-300' : 'border-slate-200'
                      }`}
                    >
                      <option value="">-- Select Godown --</option>
                      {godowns.map(g => (
                        <option key={g.guid} value={g.guid}>{g.godownName}</option>
                      ))}
                    </select>
                 </div>
               )}

               {stockItems[serialPopupIndex]?.hasSerialNumber && (
                 <div className="mb-4 border-b border-slate-100 pb-4">
                    <label className="block text-xs font-bold text-indigo-700 uppercase mb-2">Care Pack</label>
                    <MasterDropdown
                      code="CARE_PACK"
                      placeholder="-- No Care Pack --"
                      value={batchCarePack || ""}
                      onChange={(e) => setBatchCarePack(e.target.value)}
                      disabled={isFinalized}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-bold focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 outline-none disabled:bg-slate-100 transition-all cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Applies to every serial entered below.</p>
                 </div>
               )}

               <div className="overflow-y-auto mb-6 pr-2 space-y-3">
                  {serialNumbersToSave.map((serialObj, iterIndex) => (
                     <div key={iterIndex} className="flex gap-2">
                        <input
                          id={`serial-input-${iterIndex}`}
                          type="text"
                          disabled={isFinalized}
                          className={`w-full bg-slate-50 border rounded-lg px-4 py-2.5 font-mono text-sm font-bold outline-none transition-all shadow-sm disabled:bg-slate-100 ${
                            serialObj.isDuplicate
                               ? 'border-red-500 text-red-600 focus:border-red-600 focus:ring-2 focus:ring-red-100 bg-red-50/50'
                               : 'border-slate-300 text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                          }`}
                          placeholder={`Serial #${iterIndex + 1}`}
                          value={serialObj.serialValue}
                          onChange={(e) => handleSerialInputChange(iterIndex, e.target.value)}
                          onKeyDown={(e) => handleSerialInputKeyDown(e, iterIndex)}
                        />
                        {!isFinalized && (
                           <button
                             onClick={() => handleDeleteSerial(serialObj.serialId, iterIndex)}
                             className="bg-red-50 text-red-600 hover:bg-red-100 px-3 flex items-center justify-center rounded-lg border border-red-200"
                             title="Remove serial input"
                           >
                              <Trash2 size={16} />
                           </button>
                        )}
                     </div>
                  ))}
               </div>

               <div className="flex justify-end gap-3 mt-auto pt-4 border-t border-slate-100">
                  <button onClick={() => setShowSerialModal(false)} className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Close</button>
                  {!isFinalized && (
                     <button onClick={saveSerialNumbersClick} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md shadow-emerald-200">Save Checked Identifiers</button>
                  )}
               </div>
            </div>
         </div>
      )}


      {/* Invoice Preview Modal */}
      {showInvoicePreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-xl text-white">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Invoice Preview</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Verification Mode</p>
                </div>
              </div>
              <button 
                onClick={() => setShowInvoicePreview(false)}
                className="p-2.5 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-all"
              >
                <Trash2 size={24} />
              </button>
            </div>
            
            <div className="flex-1 bg-slate-200 overflow-auto p-4 flex justify-center items-center">
              {previewFileUrl.toLowerCase().endsWith('.pdf') ? (
                <iframe 
                  src={`${previewFileUrl}#toolbar=0`} 
                  className="w-full h-full rounded-xl border shadow-lg bg-white"
                  title="PDF Invoice"
                />
              ) : (
                <img 
                  src={previewFileUrl} 
                  alt="Invoice" 
                  className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                  onError={(e) => {
                    e.target.src = "https://placehold.co/600x400?text=Invoice+Preview+Not+Available";
                  }}
                />
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50/50">
              <button 
                onClick={() => setShowInvoicePreview(false)}
                className="bg-slate-800 text-white px-8 py-3 rounded-xl font-black text-sm hover:bg-slate-900 transition-all shadow-lg shadow-slate-200"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

