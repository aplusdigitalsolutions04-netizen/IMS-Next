"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, CheckSquare, History, Loader2, Square } from 'lucide-react';
import Swal from 'sweetalert2';
import { printerService } from '@/lib/services/api';
import SearchableSelect from '@/components/common/SearchableSelect';

export default function GodownTransfer({ currentUser }) {
  const [activeTab, setActiveTab] = useState('transfer'); // transfer, history

  const [godowns, setGodowns] = useState([]);
  const [loadingGodowns, setLoadingGodowns] = useState(true);

  const [sourceGodown, setSourceGodown] = useState('');
  const [destinationGodown, setDestinationGodown] = useState('');

  const [itemsList, setItemsList] = useState([]);
  const [fetchingItems, setFetchingItems] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');

  const [serialsList, setSerialsList] = useState([]);
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const [selectedSerials, setSelectedSerials] = useState([]);
  const [quantity, setQuantity] = useState('');

  const [transferring, setTransferring] = useState(false);

  // History State
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);

  const canManage = currentUser?.role === 'Admin' || !!currentUser?.allow_edit_godown;

  useEffect(() => {
    (async () => {
      try {
        setLoadingGodowns(true);
        const data = await printerService.getGodowns();
        setGodowns(Array.isArray(data) ? data : []);
      } catch (error) {
        Swal.fire('Error', error.response?.data?.message || error.message || 'Failed to fetch godowns', 'error');
      } finally {
        setLoadingGodowns(false);
      }
    })();
  }, []);

  // ------------------ TRANSFER LOGIC ------------------

  useEffect(() => {
    setSelectedItemId('');
    setSerialsList([]);
    setSelectedSerials([]);
    setQuantity('');
    if (!sourceGodown) {
      setItemsList([]);
      return;
    }
    (async () => {
      try {
        setFetchingItems(true);
        const data = await printerService.getGodownModels(sourceGodown);
        setItemsList(Array.isArray(data) ? data : []);
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || err.message, 'error');
      } finally {
        setFetchingItems(false);
      }
    })();
  }, [sourceGodown]);

  const selectedItem = useMemo(
    () => itemsList.find((m) => m.modelId === selectedItemId) || null,
    [itemsList, selectedItemId]
  );
  const isSerialized = !!selectedItem?.isTrackable;

  useEffect(() => {
    setSelectedSerials([]);
    setQuantity('');
    if (!sourceGodown || !selectedItemId || !isSerialized) {
      setSerialsList([]);
      return;
    }
    (async () => {
      try {
        setFetchingSerials(true);
        const data = await printerService.getGodownModelSerials(sourceGodown, selectedItemId);
        setSerialsList(Array.isArray(data) ? data : []);
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || err.message, 'error');
      } finally {
        setFetchingSerials(false);
      }
    })();
  }, [sourceGodown, selectedItemId, isSerialized]);

  const canSubmit =
    !!sourceGodown &&
    !!destinationGodown &&
    sourceGodown !== destinationGodown &&
    !!selectedItemId &&
    (isSerialized ? selectedSerials.length > 0 : Number(quantity) > 0);

  const handleTransfer = async () => {
    if (!canSubmit) {
      Swal.fire('Warning', 'Please complete all selections to transfer.', 'warning');
      return;
    }

    const confirm = await Swal.fire({
      title: 'Confirm Transfer?',
      text: isSerialized
        ? `Move ${selectedSerials.length} serial(s) of "${selectedItem?.modelName}"?`
        : `Move ${quantity} unit(s) of "${selectedItem?.modelName}"?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      confirmButtonText: 'Yes, Transfer',
    });
    if (!confirm.isConfirmed) return;

    setTransferring(true);
    try {
      await printerService.transferGodownStock({
        sourceGodownId: sourceGodown,
        destinationGodownId: destinationGodown,
        itemVariantId: selectedItemId,
        serialIds: isSerialized ? selectedSerials : undefined,
        quantity: isSerialized ? undefined : Number(quantity),
        modelName: selectedItem?.modelName || 'Unknown',
      });
      Swal.fire('Success', 'Stock Transferred Successfully', 'success');

      setSelectedItemId('');
      setSerialsList([]);
      setSelectedSerials([]);
      setQuantity('');
      const data = await printerService.getGodownModels(sourceGodown);
      setItemsList(Array.isArray(data) ? data : []);
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || err.message, 'error');
    } finally {
      setTransferring(false);
    }
  };

  const toggleSerial = (id) => {
    setSelectedSerials((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const toggleAllSerials = () => {
    setSelectedSerials(selectedSerials.length === serialsList.length ? [] : serialsList.map((s) => s.id));
  };

  // ------------------ HISTORY LOGIC ------------------

  const fetchHistory = async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await printerService.getGodownTransferHistory(page, 20);
      setHistory(res.data);
      setHistoryTotal(res.total);
      setHistoryPage(res.page);
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || err.message, 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory(1);
    }
  }, [activeTab]);

  // Godown Transfer is gated on its own "godownTransfer" permission, not
  // "godownMaster" — Godown Master access alone manages godowns themselves
  // but shouldn't unlock this separate stock-transfer feature. The sidebar
  // already hides this page's nav link without the permission, but a direct
  // URL visit should get the same clear message instead of a page full of
  // 403 errors from every API call.
  const canView = currentUser?.role === 'Admin' || !!currentUser?.permissions?.includes('godownTransfer');
  if (!canView) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
        <ArrowRightLeft size={48} className="mb-4 text-slate-300" />
        <p className="text-lg font-semibold">You do not have permission to access Godown Transfer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-900">

      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('transfer')}
          disabled={!canManage}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${activeTab === 'transfer' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <ArrowRightLeft size={18} />
          Stock Transfer
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${activeTab === 'history' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <History size={18} />
          Transfer History
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
        <div className="border-b border-slate-100 bg-white px-5 py-5">
          <h1 className="text-2xl font-black tracking-tight text-slate-950">
            {activeTab === 'transfer' && 'Stock Transfer Between Godowns'}
            {activeTab === 'history' && 'Stock Transfer History'}
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {activeTab === 'transfer' && 'Move serialized or non-serialized stock from one godown to another.'}
            {activeTab === 'history' && 'View the audit log of stock movements between godowns.'}
          </p>
        </div>

        {/* -------------------- STOCK TRANSFER TAB -------------------- */}
        {activeTab === 'transfer' && (
          loadingGodowns ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
            </div>
          ) : (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700">1. Select Source Godown</label>
                <select
                  value={sourceGodown}
                  onChange={(e) => setSourceGodown(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">-- Choose Godown --</option>
                  {godowns.map((g) => (
                    <option key={g.guid} value={g.guid}>{g.godownName}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700">2. Select Destination Godown</label>
                <select
                  value={destinationGodown}
                  onChange={(e) => setDestinationGodown(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">-- Choose Destination --</option>
                  {godowns.filter((g) => g.guid !== sourceGodown).map((g) => (
                    <option key={g.guid} value={g.guid}>{g.godownName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-6 space-y-1 relative">
              <label className="text-sm font-bold text-slate-700">3. Select Item</label>
              <SearchableSelect
                value={selectedItemId}
                onChange={setSelectedItemId}
                disabled={!sourceGodown || fetchingItems}
                placeholder="Choose item"
                options={itemsList.map((m) => ({
                  value: m.modelId,
                  label: `${m.itemName ? `${m.itemName} - ` : ''}${m.modelName} (${m.availableCount} available)`,
                }))}
              />
              {fetchingItems && <Loader2 className="absolute right-10 top-9 animate-spin text-indigo-600" size={16} />}
            </div>

            {selectedItemId && isSerialized && (
              <div className="mb-6 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <h3 className="text-sm font-bold text-slate-800">4. Select Serial Numbers to Transfer</h3>
                  {fetchingSerials && <Loader2 className="animate-spin text-indigo-600" size={18} />}
                </div>

                <div className="max-h-64 overflow-y-auto p-4 bg-white">
                  {serialsList.length === 0 ? (
                    <p className="text-sm text-slate-500 italic text-center py-4">No serials available. Please select a source godown and item first.</p>
                  ) : (
                    <div className="space-y-3">
                      <button onClick={toggleAllSerials} className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 mb-2">
                        {selectedSerials.length === serialsList.length ? <CheckSquare size={16} /> : <Square size={16} />}
                        {selectedSerials.length === serialsList.length ? 'Deselect All' : 'Select All'}
                      </button>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {serialsList.map((serial) => {
                          const isSelected = selectedSerials.includes(serial.id);
                          return (
                            <div
                              key={serial.id}
                              onClick={() => toggleSerial(serial.id)}
                              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                                isSelected ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                              }`}
                            >
                              <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>
                                {isSelected && <CheckSquare size={14} className="text-white" />}
                              </div>
                              <span className="text-sm font-bold text-slate-700 truncate" title={serial.serialNumber}>{serial.serialNumber}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedItemId && !isSerialized && (
              <div className="mb-6 space-y-1">
                <label className="text-sm font-bold text-slate-700">4. Quantity to Transfer</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Enter quantity"
                  className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                {selectedItem && (
                  <p className="text-xs font-medium text-slate-500">{selectedItem.availableCount} available in source godown</p>
                )}
              </div>
            )}

            <button
              onClick={handleTransfer}
              disabled={transferring || !canSubmit}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed md:w-auto"
            >
              {transferring ? <Loader2 size={18} className="animate-spin" /> : <ArrowRightLeft size={18} />}
              Transfer{isSerialized && selectedSerials.length > 0 ? ` ${selectedSerials.length} Item(s)` : ''}
            </button>
          </div>
          )
        )}

        {/* -------------------- TRANSFER HISTORY TAB -------------------- */}
        {activeTab === 'history' && (
          <div className="flex flex-col">
            {historyLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
              </div>
            ) : history.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-slate-500">
                <History size={48} className="mb-4 text-slate-300" />
                <p className="text-lg font-semibold">No transfers recorded</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Item</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Serial No. / Qty</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">From Godown</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">To Godown</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Transferred By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {history.map((item) => (
                      <tr key={item.id} className="transition hover:bg-slate-50">
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 font-medium">
                          {new Date(item.transferDate).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">
                          {item.modelName}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-indigo-600">
                          {item.serialNumber || (item.quantity != null ? `Qty: ${item.quantity}` : '-')}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-600">
                           {item.fromGodown}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-600">
                          <span className="flex items-center gap-1.5 text-emerald-600">
                            <ArrowRightLeft size={14} />
                            {item.toGodown}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                          {item.transferredBy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {historyTotal > 20 && (
              <div className="border-t border-slate-200 p-4 flex items-center justify-between">
                <span className="text-sm text-slate-600">
                  Showing page {historyPage} of {Math.ceil(historyTotal / 20)}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={historyPage === 1 || historyLoading}
                    onClick={() => fetchHistory(historyPage - 1)}
                    className="px-3 py-1 border border-slate-300 rounded text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={historyPage >= Math.ceil(historyTotal / 20) || historyLoading}
                    onClick={() => fetchHistory(historyPage + 1)}
                    className="px-3 py-1 border border-slate-300 rounded text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
