"use client";
import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import {
  Layers, Plus, Trash2, Save, Search,
  ArrowLeft, PackageOpen, List, Edit, Loader2, Type
} from 'lucide-react';
import { inventoryService } from '@/lib/services/inventoryService';
import { legacyApi } from '@/lib/client/http';
import Pagination from '../common/Pagination';

const ComboMaster = () => {
  const [comboName, setComboName] = useState('');
  const [parentVariant, setParentVariant] = useState(null);
  const [components, setComponents] = useState([]);
  const [allVariants, setAllVariants] = useState([]);
  const [existingCombos, setExistingCombos] = useState([]);
  const [parentSearchTerm, setParentSearchTerm] = useState('');
  const [componentSearchTerm, setComponentSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [viewingCombo, setViewingCombo] = useState(null);
  const [viewingComponents, setViewingComponents] = useState([]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filters] = useState({});

  useEffect(() => {
    fetchAllVariants();
    fetchComboList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    fetchComboList(currentPage, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  const fetchAllVariants = async () => {
    try {
       // Fetch a larger set for local filtering, or we could implement server-side search later
       const res = await legacyApi.get('/Inventory/GetCurrentStock', { params: { limit: 1000 } });
       setAllVariants(res.data?.data || []);
    } catch (e) { console.error(e); }
  };

  const fetchComboList = async (page = currentPage, limit = pageSize) => {
    setTableLoading(true);
    try {
      const response = await legacyApi.get('/Inventory/GetComboList', {
        params: { page, limit },
      });
      setExistingCombos(response.data?.data || []);
      setTotalRecords(response.data?.total || 0);
    } catch (e) { console.error(e); }
    finally { setTableLoading(false); }
  };

  const handleSelectParent = async (v) => {
    setParentVariant(v);
    setComboName(v.variantCode || v.variantName);
    setParentSearchTerm('');
    
    try {
      const existing = await inventoryService.getComboDetails(v.itemVariantId);
      setComponents(existing.map(x => ({
        childVariantId: x.childVariantId,
        variantCode: x.variantCode,
        itemName: x.itemName,
        quantity: x.quantity,
        unitName: x.unitName
      })));
    } catch (e) { console.error(e); }
  };

  const addComponent = (v) => {
    if (v.itemVariantId === parentVariant?.itemVariantId) {
      Swal.fire("Error", "Cannot add the combo itself as a component", "error");
      return;
    }
    if (components.find(x => x.childVariantId === v.itemVariantId)) {
       Swal.fire("Info", "Item already added", "info");
       return;
    }
    setComponents([...components, { 
      childVariantId: v.itemVariantId, 
      variantCode: v.variantCode || v.variantName, 
      itemName: v.itemName, 
      quantity: 1, 
      unitName: v.unitName || "PCS"
    }]);
    setComponentSearchTerm('');
  };

  const removeComponent = (id) => {
    setComponents(components.filter(x => x.childVariantId !== id));
  };

  const updateQty = (id, q) => {
    setComponents(components.map(x => x.childVariantId === id ? { ...x, quantity: Number(q) } : x));
  };

  const handleSave = async () => {
    if (!comboName.trim()) {
       Swal.fire("Warning", "Please enter a Combo Name", "warning");
       return;
    }
    if (components.length === 0) {
       Swal.fire("Warning", "Please add at least one component to the pack", "warning");
       return;
    }

    setLoading(true);
    try {
      const res = await inventoryService.saveComboMapping({
        parentVariantId: parentVariant?.itemVariantId || "NEW", // Send "NEW" if no parent selected
        comboName: comboName.trim(),
        components: components
      });
      
      if (res.message.toLowerCase().includes("success")) {
        Swal.fire("Success", "Combo saved successfully!", "success");
        setShowForm(false);
        setParentVariant(null);
        setComboName('');
        setComponents([]);
        fetchComboList();
      } else {
        Swal.fire("Error", res.message, "error");
      }
    } catch (e) {
      console.error(e);
      Swal.fire("Error", e.response?.data?.message || "Failed to save combo", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCombo = (pvId) => {
    Swal.fire({
      title: "Delete Combo?",
      text: "This will remove the combo mapping.",
      icon: "warning",
      showCancelButton: true, 
      confirmButtonText: "Yes, Delete",
      confirmButtonColor: "#ef4444"
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await inventoryService.deleteCombo(pvId);
          Swal.fire("Deleted", "Combo mapping removed", "success");
          fetchComboList();
        } catch (e) { console.error(e); }
      }
    });
  };

  const handleEdit = (combo) => {
    handleSelectParent(combo);
    setShowForm(true);
  };

  const handleViewComponents = async (combo) => {
    setViewingCombo(combo);
    try {
      const data = await inventoryService.getComboDetails(combo.itemVariantId);
      setViewingComponents(data);
    } catch (e) { 
      console.error(e);
      Swal.fire("Error", "Failed to fetch components", "error");
    }
  };

  const getFilteredVariants = (query) => {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    
    // Filter and also ensure we don't show visually identical rows (same Name + Variant + SKU)
    const filtered = allVariants.filter(v => 
      (v.itemName?.toLowerCase().includes(lowerQuery) || 
       v.variantName?.toLowerCase().includes(lowerQuery) ||
       v.sku?.toLowerCase().includes(lowerQuery))
    );

    const uniqueVisual = [];
    const visualSeen = new Set();
    
    filtered.forEach(v => {
      const key = `${v.itemName}-${v.variantName}-${v.sku || ''}`.toLowerCase();
      if (!visualSeen.has(key)) {
        visualSeen.add(key);
        uniqueVisual.push(v);
      }
    });

    return uniqueVisual.slice(0, 15);
  };

  const filteredParentVariants = getFilteredVariants(parentSearchTerm);
  const filteredComponentVariants = getFilteredVariants(componentSearchTerm);

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-screen">
      <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-fuchsia-50 rounded-xl">
            <Layers size={28} className="text-fuchsia-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Combo & Pack Master</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Create bundles, kits and &quot;Pack of X&quot; variants</p>
          </div>
        </div>
        <div className="flex gap-3">
          {!showForm ? (
            <button 
              onClick={() => { setShowForm(true); setParentVariant(null); setComboName(''); setComponents([]); }}
              className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-fuchsia-100"
            >
              <Plus size={18} /> Create New Combo
            </button>
          ) : (
            <button 
              onClick={() => setShowForm(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
            >
              <ArrowLeft size={16} /> View List
            </button>
          )}
        </div>
      </div>

      {showForm ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* LEFT COLUMN: SETUP */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
              <h3 className="text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2">
                <Type className="text-fuchsia-600" size={16} /> 1. Name Your Combo
              </h3>
              
              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Combo / SKU Name</label>
                  <input
                    type="text"
                    autoFocus
                    className="w-full bg-white border-2 border-fuchsia-100 rounded-xl px-4 py-3 text-slate-800 font-bold focus:ring-2 focus:ring-fuchsia-50 focus:border-fuchsia-400 outline-none transition-all shadow-sm"
                    placeholder="Example: Set of 3 Black Pens"
                    value={comboName}
                    onChange={(e) => setComboName(e.target.value)}
                  />
                </div>
                
                <div className="relative">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Search Existing (Optional)</label>
                  <div className="absolute inset-y-0 left-0 pl-3 pt-6 flex items-start pointer-events-none">
                    <Search size={16} className="text-slate-300" />
                  </div>
                  <input
                    type="text"
                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-600 outline-none focus:border-fuchsia-200"
                    placeholder="Search existing SKU to load..."
                    value={parentSearchTerm}
                    onChange={(e) => setParentSearchTerm(e.target.value)}
                  />
                  {parentSearchTerm.length > 0 && (
                    <div className="absolute w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                      {filteredParentVariants.map(v => (
                         <button 
                           key={v.itemVariantId}
                           onClick={() => handleSelectParent(v)}
                           className="w-full flex flex-col items-start px-4 py-2 hover:bg-fuchsia-50 transition-colors border-b border-slate-50 last:border-0"
                         >
                           <span className="font-bold text-slate-800 text-xs">{v.variantName} {v.sku ? `(${v.sku})` : ''}</span>
                           <span className="text-[10px] text-slate-500">{v.itemName}</span>
                         </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-2xl p-6">
              <h3 className="text-sm font-black text-fuchsia-800 uppercase mb-4 flex items-center gap-2">
                <PackageOpen className="text-fuchsia-600" size={16} /> 2. Add Component Items
              </h3>
              <div className="relative">
                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={16} className="text-fuchsia-300" />
                 </div>
                 <input
                   type="text"
                   className="w-full bg-white border border-fuchsia-200 rounded-xl pl-9 pr-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-fuchsia-200 outline-none transition-all shadow-sm"
                   placeholder="Search items to add to combo..."
                   value={componentSearchTerm}
                   onChange={(e) => setComponentSearchTerm(e.target.value)}
                 />
                 {componentSearchTerm.length > 0 && (
                   <div className="absolute w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                     {filteredComponentVariants.map(v => (
                        <button 
                          key={v.itemVariantId}
                          onClick={() => addComponent(v)}
                          className="w-full flex flex-col items-start px-4 py-3 hover:bg-fuchsia-50 transition-colors border-b border-slate-50 last:border-0"
                        >
                          <span className="font-bold text-slate-800">{v.variantName} {v.sku ? `(${v.sku})` : ''}</span>
                          <span className="text-xs text-slate-500">{v.itemName}</span>
                        </button>
                     ))}
                   </div>
                 )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: COMPONENTS */}
          <div className="lg:col-span-7">
             <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full min-h-[400px]">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                   <h3 className="text-sm font-black text-slate-800 uppercase flex items-center gap-2">
                      <List className="text-fuchsia-600" size={16} /> Components List
                   </h3>
                   <span className="bg-fuchsia-100 text-fuchsia-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                     {components.length} ITEMS
                   </span>
                </div>

                <div className="flex-1 overflow-y-auto p-0">
                   <table className="w-full text-left">
                      <thead>
                         <tr className="border-b border-slate-100">
                            <th className="py-3 px-6 text-[10px] font-black text-slate-400 uppercase">Item Description</th>
                            <th className="py-3 px-6 text-[10px] font-black text-slate-400 uppercase text-center">Quantity</th>
                            <th className="py-3 px-6 text-[10px] font-black text-slate-400 uppercase text-center">Action</th>
                         </tr>
                      </thead>
                      <tbody>
                         {components.map((c, idx) => (
                            <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                               <td className="py-4 px-6">
                                  <div className="font-bold text-slate-800 text-sm">{c.variantCode}</div>
                                  <div className="text-xs text-slate-500">{c.itemName}</div>
                               </td>
                               <td className="py-4 px-6">
                                  <div className="flex items-center justify-center gap-2">
                                     <input 
                                        type="number"
                                        min="1"
                                        className="w-16 text-center border border-slate-200 rounded-lg py-1 text-sm font-black focus:border-fuchsia-400 outline-none"
                                        value={c.quantity}
                                        onChange={(e) => updateQty(c.childVariantId, e.target.value)}
                                     />
                                     <span className="text-[10px] font-bold text-slate-400">{c.unitName}</span>
                                  </div>
                               </td>
                               <td className="py-4 px-6 text-center">
                                  <button 
                                    onClick={() => removeComponent(c.childVariantId)}
                                    className="text-slate-300 hover:text-red-500 transition-colors"
                                  >
                                     <Trash2 size={18} />
                                  </button>
                               </td>
                            </tr>
                         ))}
                         {components.length === 0 && (
                            <tr>
                               <td colSpan="3" className="py-20 text-center">
                                  <PackageOpen size={48} className="mx-auto text-slate-100 mb-4" />
                                  <div className="text-slate-400 font-medium text-sm">No components added yet</div>
                               </td>
                            </tr>
                         )}
                      </tbody>
                   </table>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100">
                   <button 
                     onClick={handleSave}
                     disabled={loading || components.length === 0 || !comboName}
                     className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white py-4 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-100 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0"
                   >
                      {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                      SAVE COMBO MAPPING
                   </button>
                </div>
             </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
           <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                 <tr>
                    <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase">Sr. No.</th>
                    <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-wider">Combo SKU / Name</th>
                    <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-wider text-center">Items Inside</th>
                    <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-wider text-center">Actions</th>
                 </tr>
              </thead>
              <tbody>
                 {tableLoading ? (
                    <tr>
                       <td colSpan="4" className="py-20 text-center">
                          <Loader2 className="animate-spin mx-auto text-fuchsia-600 mb-2" size={32} />
                          <span className="text-sm font-medium text-slate-500">Loading combos...</span>
                       </td>
                    </tr>
                 ) : existingCombos.length > 0 ? (
                    existingCombos.map((c, index) => (
                       <tr key={c.itemVariantId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-4 px-6 text-sm text-slate-600">{(currentPage - 1) * pageSize + index + 1}</td>
                          <td className="py-4 px-6">
                             <div className="font-black text-slate-800">{c.variantCode}</div>
                             <div className="text-xs text-slate-500">{c.itemName === 'SYSTEM_COMBOS' ? 'Combo Product' : c.itemName}</div>
                          </td>
                          <td className="py-4 px-6 text-center">
                             <button 
                               onClick={() => handleViewComponents(c)}
                               className="bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 px-3 py-1 rounded-full text-xs font-black border border-fuchsia-100 transition-colors"
                             >
                                {c.componentCount} Components
                             </button>
                          </td>
                          <td className="py-4 px-6">
                             <div className="flex items-center justify-center gap-3">
                                <button 
                                  onClick={() => handleEdit(c)}
                                  className="bg-sky-50 text-sky-600 hover:bg-sky-100 p-2 rounded-lg transition-colors"
                                  title="Edit Components"
                                >
                                   <Edit size={18} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteCombo(c.itemVariantId)}
                                  className="bg-red-50 text-red-600 hover:bg-red-100 p-2 rounded-lg transition-colors"
                                  title="Delete Combo"
                                >
                                   <Trash2 size={18} />
                                </button>
                             </div>
                          </td>
                       </tr>
                    ))
                 ) : (
                    <tr>
                       <td colSpan="4" className="py-20 text-center">
                          <div className="text-slate-400 font-medium">No combos found. Start by creating one!</div>
                       </td>
                    </tr>
                 )}
              </tbody>
           </table>
        
        <Pagination
          accent="fuchsia"
          currentPage={currentPage}
          pageSize={pageSize}
          totalRecords={totalRecords}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        />
      </div>
      )}

      {/* VIEW COMPONENTS MODAL */}
      {viewingCombo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-fuchsia-600 p-6 flex justify-between items-center">
              <div className="flex items-center gap-3 text-white">
                <PackageOpen size={24} />
                <div>
                  <h3 className="font-black tracking-tight">{viewingCombo.variantCode}</h3>
                  <p className="text-[10px] text-fuchsia-100 font-bold uppercase tracking-wider">Items Inside This Bundle</p>
                </div>
              </div>
              <button 
                onClick={() => setViewingCombo(null)} 
                className="text-fuchsia-100 hover:text-white transition-colors"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-3">
                {viewingComponents.length > 0 ? viewingComponents.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                      <div className="font-bold text-slate-800">{item.variantCode}</div>
                      <div className="text-xs text-slate-500">{item.itemName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-fuchsia-600 font-black text-lg">{item.quantity}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.unitName || 'PCS'}</div>
                    </div>
                  </div>
                )) : (
                  <div className="py-10 text-center">
                    <Loader2 className="animate-spin mx-auto text-fuchsia-600 mb-2" />
                    <p className="text-sm text-slate-500 font-medium">Fetching details...</p>
                  </div>
                )}
              </div>

              <button 
                onClick={() => setViewingCombo(null)}
                className="w-full mt-6 bg-slate-800 hover:bg-slate-900 text-white py-3.5 rounded-xl font-bold transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComboMaster;


