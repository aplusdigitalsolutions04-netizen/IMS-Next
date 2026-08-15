"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Loader2, MapPin, Plus, Search, Star, Trash2, Warehouse, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { printerService } from '@/lib/services/api';
import { hasPermission } from '@/lib/client/rbac';

export default function GodownMaster({ currentUser }) {
  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    guid: null,
    godownName: '',
    godownAddress: '',
    isDefault: false
  });

  // "godownMaster" isn't a PROTECTED_EDIT_PERMISSIONS tab (see lib/auth.js) —
  // the backend already accepts add/edit with just the "godownMaster" view
  // permission, no separate edit-flag required. This button gate previously
  // only checked allow_edit_godown, so granting "Godown Master" alone left
  // Add/Edit disabled here even though the API would have accepted it.
  const canManage = hasPermission(currentUser, 'godownMaster') || !!currentUser?.allow_edit_godown;

  const fetchGodowns = async () => {
    try {
      setLoading(true);
      const data = await printerService.getGodowns();
      setGodowns(Array.isArray(data) ? data : []);
    } catch (error) {
      Swal.fire('Error', error.response?.data?.message || error.message || 'Failed to fetch godowns', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGodowns();
  }, []);

  const filteredGodowns = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return godowns;
    return godowns.filter((godown) =>
      (godown.godownName || '').toLowerCase().includes(q) ||
      (godown.godownAddress || '').toLowerCase().includes(q)
    );
  }, [godowns, searchTerm]);

  const openModal = (godown = null) => {
    setFormData({
      guid: godown?.guid || null,
      godownName: godown?.godownName || '',
      godownAddress: godown?.godownAddress || '',
      isDefault: Boolean(godown?.isDefault)
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData({ guid: null, godownName: '', godownAddress: '', isDefault: false });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const godownName = formData.godownName.trim();
    if (!godownName) {
      Swal.fire('Warning', 'Godown name is required', 'warning');
      return;
    }

    try {
      setSaving(true);
      if (formData.guid) {
        await printerService.updateGodown(formData.guid, { ...formData, godownName });
        Swal.fire('Success', 'Godown updated', 'success');
      } else {
        await printerService.addGodown({ ...formData, godownName });
        Swal.fire('Success', 'Godown added', 'success');
      }
      closeModal();
      fetchGodowns();
    } catch (error) {
      Swal.fire('Error', error.response?.data?.message || error.message || 'Failed to save godown', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (godown) => {
    const confirm = await Swal.fire({
      title: 'Delete godown?',
      text: `${godown.godownName} will be removed from master and unassigned from linked serials.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete'
    });

    if (!confirm.isConfirmed) return;

    try {
      await printerService.deleteGodown(godown.guid);
      Swal.fire('Deleted', 'Godown deleted successfully', 'success');
      fetchGodowns();
    } catch (error) {
      Swal.fire('Error', error.response?.data?.message || error.message || 'Failed to delete godown', 'error');
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
        <div className="border-b border-slate-100 bg-white px-5 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Godown Master</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">Manage internal godowns used while adding printer serials.</p>
            </div>

            <button
              onClick={() => openModal()}
              disabled={!canManage}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            >
              <Plus size={18} />
              Add Godown
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search godown..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        ) : filteredGodowns.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-500">
            <Warehouse size={48} className="mb-4 text-slate-300" />
            <p className="text-lg font-semibold">No godowns found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Godown Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Address</th>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Default</th>
                  <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredGodowns.map((godown) => (
                  <tr key={godown.guid} className="transition hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        <MapPin size={16} className="text-indigo-500" />
                        {godown.godownName}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      <p className="line-clamp-2 max-w-xl">{godown.godownAddress || '-'}</p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {godown.isDefault ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-100">
                          <Star size={12} /> Default
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-400">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openModal(godown)} disabled={!canManage} className="rounded-lg p-1.5 text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50" title="Edit">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete(godown)} disabled={!canManage} className="rounded-lg p-1.5 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50" title="Delete">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">{formData.guid ? 'Edit Godown' : 'Add Godown'}</h3>
              <button onClick={closeModal} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">Godown Name</label>
                  <input
                    type="text"
                    value={formData.godownName}
                    onChange={(e) => setFormData({ ...formData, godownName: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
                    placeholder="e.g. Main Godown"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">Address</label>
                  <textarea
                    value={formData.godownAddress}
                    onChange={(e) => setFormData({ ...formData, godownAddress: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
                    placeholder="Full godown address..."
                    rows={3}
                  />
                </div>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Set as default godown
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
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
                  {formData.guid ? 'Save Changes' : 'Add Godown'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
