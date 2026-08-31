"use client";
import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, MapPin, Loader2, Layers, Map } from 'lucide-react';
import Swal from 'sweetalert2';
import { printerService } from '@/lib/services/api';
import { hasPermission } from '@/lib/client/rbac';

export default function FbfFbaMaster({ isAdmin, currentUser }) {
  // "fbfFbaMaster" isn't a PROTECTED_EDIT_PERMISSIONS tab (see lib/auth.js) —
  // the backend already accepts add/edit with just the "fbfFbaMaster" view
  // permission. This gate previously checked allow_edit_fbf_fba, which is
  // actually the edit-flag for the unrelated "fbfFbaManagement" (Stock) tab
  // — granting "FBF/FBA Master" alone left Add Warehouse/Platform/State
  // disabled here even though the API would have accepted it.
  const canManage = isAdmin || hasPermission(currentUser, 'fbfFbaMaster') || !!currentUser?.allow_edit_fbf_fba;
  // Delete is Admin-only by default, delegable via the "Delete FBF/FBA Master"
  // Manage Roles checkbox (allow_delete_fbfFbaMaster) — see lib/fbfFbaMasterAuth.js.
  const canDelete = isAdmin || !!currentUser?.allow_delete_fbfFbaMaster;
  const [activeTab, setActiveTab] = useState('Warehouses');
  const [warehouses, setWarehouses] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    guid: null,
    name: '', // Used for Platform and State
    platform: '',
    state: '',
    warehouseName: '',
    warehouseAddress: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [wRes, pRes, sRes] = await Promise.all([
        printerService.getFbfFbaWarehouses(),
        printerService.getFbfFbaPlatforms(),
        printerService.getFbfFbaStates()
      ]);
      setWarehouses(Array.isArray(wRes) ? wRes : []);
      setPlatforms(Array.isArray(pRes) ? pRes : []);
      setStates(Array.isArray(sRes) ? sRes : []);
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'Failed to fetch master data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (item = null) => {
    if (activeTab === 'Warehouses') {
      if (item) {
        setFormData({
          guid: item.guid,
          platform: item.platform,
          state: item.state,
          warehouseName: item.warehouseName,
          warehouseAddress: item.warehouseAddress || '',
          name: ''
        });
      } else {
        setFormData({ guid: null, platform: platforms[0]?.name || '', state: '', warehouseName: '', warehouseAddress: '', name: '' });
      }
    } else {
      // Platform or State
      setFormData({
        guid: item ? item.guid : null,
        name: item ? item.name : '',
        platform: '', state: '', warehouseName: '', warehouseAddress: ''
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setFormData({ guid: null, name: '', platform: '', state: '', warehouseName: '', warehouseAddress: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (activeTab === 'Warehouses') {
        if (!formData.platform || !formData.state || !formData.warehouseName) {
          setSaving(false);
          return Swal.fire('Warning', 'Platform, State and Warehouse Name are required', 'warning');
        }
        if (formData.guid) {
          await printerService.updateFbfFbaWarehouse(formData.guid, formData);
          Swal.fire('Success', 'Warehouse updated', 'success');
        } else {
          await printerService.addFbfFbaWarehouse(formData);
          Swal.fire('Success', 'Warehouse added', 'success');
        }
      } else if (activeTab === 'Platforms') {
        if (!formData.name) return Swal.fire('Warning', 'Platform Name is required', 'warning');
        await printerService.addFbfFbaPlatform({ name: formData.name });
        Swal.fire('Success', 'Platform added', 'success');
      } else if (activeTab === 'States') {
        if (!formData.name) return Swal.fire('Warning', 'State Name is required', 'warning');
        await printerService.addFbfFbaState({ name: formData.name });
        Swal.fire('Success', 'State added', 'success');
      }
      handleCloseModal();
      fetchData();
    } catch (error) {
      Swal.fire('Error', error.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (guid) => {
    const confirm = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    });

    if (confirm.isConfirmed) {
      try {
        if (activeTab === 'Warehouses') await printerService.deleteFbfFbaWarehouse(guid);
        else if (activeTab === 'Platforms') await printerService.deleteFbfFbaPlatform(guid);
        else if (activeTab === 'States') await printerService.deleteFbfFbaState(guid);
        
        Swal.fire('Deleted!', 'Record has been deleted.', 'success');
        fetchData();
      } catch (error) {
        Swal.fire('Error', error.message || 'Failed to delete', 'error');
      }
    }
  };

  const renderTable = () => {
    if (activeTab === 'Warehouses') {
      const filtered = warehouses.filter(w => 
        w.platform.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.state.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.warehouseName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filtered.length === 0) return (
        <div className="flex h-64 flex-col items-center justify-center text-slate-500">
          <MapPin size={48} className="mb-4 text-slate-300" />
          <p className="text-lg font-semibold">No warehouses found</p>
        </div>
      );
      return (
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Platform</th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">State</th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Warehouse Name</th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Address</th>
              <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {filtered.map((w) => (
              <tr key={w.guid} className="transition hover:bg-slate-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800">{w.platform}</span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-700">{w.state}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-slate-900">{w.warehouseName}</td>
                <td className="px-6 py-4 text-sm text-slate-500"><p className="line-clamp-2 max-w-xs">{w.warehouseAddress || '-'}</p></td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => handleOpenModal(w)} disabled={!canManage} className="rounded-lg p-1.5 text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"><Edit2 size={18} /></button>
                    <button onClick={() => handleDelete(w.guid)} disabled={!canDelete} className="rounded-lg p-1.5 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    } else {
      const data = activeTab === 'Platforms' ? platforms : states;
      const filtered = data.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
      if (filtered.length === 0) return (
        <div className="flex h-64 flex-col items-center justify-center text-slate-500">
          <Layers size={48} className="mb-4 text-slate-300" />
          <p className="text-lg font-semibold">No {activeTab.toLowerCase()} found</p>
        </div>
      );
      return (
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Name</th>
              <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {filtered.map((d) => (
              <tr key={d.guid} className="transition hover:bg-slate-50">
                <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-slate-900">{d.name}</td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                  <button onClick={() => handleDelete(d.guid)} disabled={!canDelete} className="rounded-lg p-1.5 text-rose-600 transition hover:bg-rose-50"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
        <div className="border-b border-slate-100 bg-white px-5 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">FBF / FBA Master</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Manage platforms, states, and warehouses for marketplace stock.
              </p>
            </div>
            <button
              onClick={() => handleOpenModal()}
              disabled={!canManage}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus size={18} />
              Add {activeTab.slice(0, -1)}
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex space-x-1 rounded-lg bg-slate-200/50 p-1">
              {['Warehouses', 'Platforms', 'States'].map(tab => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setSearchTerm(''); }}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                    activeTab === tab ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder={`Search ${activeTab.toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            {renderTable()}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">{formData.guid ? `Edit ${activeTab.slice(0, -1)}` : `Add ${activeTab.slice(0, -1)}`}</h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5">
              <div className="space-y-4">
                {activeTab === 'Warehouses' ? (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-700">Platform</label>
                      <select
                        value={formData.platform}
                        onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Select Platform --</option>
                        {platforms.map(p => (
                          <option key={p.guid} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-700">State</label>
                      <select
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Select State --</option>
                        {states.map(s => (
                          <option key={s.guid} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-700">Warehouse Name</label>
                      <input
                        type="text"
                        value={formData.warehouseName}
                        onChange={(e) => setFormData({ ...formData, warehouseName: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
                        placeholder="e.g. Bhiwandi FBF Hub"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-700">Warehouse Address</label>
                      <textarea
                        value={formData.warehouseAddress}
                        onChange={(e) => setFormData({ ...formData, warehouseAddress: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
                        placeholder="Full address details..."
                        rows={3}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="mb-1 block text-sm font-bold text-slate-700">{activeTab.slice(0, -1)} Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
                      placeholder={`e.g. ${activeTab === 'Platforms' ? 'FBF' : 'Maharashtra'}`}
                    />
                  </div>
                )}
              </div>
              
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {formData.guid ? 'Save Changes' : `Add ${activeTab.slice(0, -1)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

