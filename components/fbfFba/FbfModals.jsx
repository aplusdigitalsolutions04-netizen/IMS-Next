"use client";
// FBF/FBA modals extracted from FbfFbaManagement.jsx — markup unchanged.
import React from "react";
import {
  ArrowDownRight, ArrowUpRight, Barcode, Boxes, Loader2, Search, X,
} from "lucide-react";
import { modalTypes } from "./constants";
import { CategoryChoice, Modal, SearchablePicker, StatusBadge } from "./parts";

export default function FbfModals({
  activeModal, activeTab, addSelectedSerial, barcodeInput, closeModal,
  closeSerialSelector, editData, formData, handleAddStock,
  handleBarcodeSubmit, handleEditSubmit, handleSellStock, modelSerials,
  openSerialSelector, pickerOptions, pickerQuery, removeSelectedSerial,
  saving, selectedPickerOption, selectedSerialValues, selectedSerials,
  selectedWhState, sellData, serialSearchTerm, serialViewItem,
  serialViewNumbers, setActiveModal, setBarcodeInput, setEditData,
  setFormData, setPickerQuery, setSelectedSerials, setSelectedWhState,
  setSellData, setSerialModelFilter, setSerialSearchTerm,
  setShowSerialSelector, setStockCategory, showSerialSelector,
  stockCategory, visibleModelSerials, warehouses,
}) {
  return (
    <>
      {activeModal === modalTypes.WAREHOUSE_SELECT && (
        <Modal
          title={`Select Warehouse for ${activeTab}`}
          onClose={closeModal}
          size="md"
        >
          <div className="p-4 space-y-4">
            <div className="text-sm text-slate-500 font-medium">
              Please choose a warehouse location to add the stock into. Only warehouses mapped to {activeTab} will be shown.
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">State</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={selectedWhState}
                  onChange={(e) => {
                    setSelectedWhState(e.target.value);
                    setFormData(prev => ({ ...prev, warehouseGuid: '' }));
                  }}
                >
                  <option value="">-- Select a State --</option>
                  {[...new Set(warehouses.filter(w => w.platform === activeTab).map(w => w.state))].map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>

              {selectedWhState && (
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">Warehouse Name</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    value={formData.warehouseGuid || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, warehouseGuid: e.target.value }))}
                  >
                    <option value="">-- Select a Warehouse --</option>
                    {warehouses
                      .filter(w => w.platform === activeTab && w.state === selectedWhState)
                      .map(w => (
                        <option key={w.guid} value={w.guid}>{w.warehouseName}</option>
                      ))}
                  </select>
                </div>
              )}

              {formData.warehouseGuid && (
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">Warehouse Address</label>
                  <textarea
                    readOnly
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none text-slate-600"
                    rows={3}
                    value={warehouses.find(w => w.guid === formData.warehouseGuid)?.warehouseAddress || 'No address provided'}
                  />
                </div>
              )}
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!formData.warehouseGuid}
                onClick={() => setActiveModal(modalTypes.ADD)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </Modal>
      )}

      {activeModal === modalTypes.ADD && (
        <Modal
          title={`Add ${activeTab} Stock`}
          onClose={closeModal}
          size="xl"
          closeOnEscape={!showSerialSelector}
        >
          <form onSubmit={handleAddStock} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-800">Choose Stock Category</div>
                  <div className="text-xs font-medium text-slate-500">Pick one path, then select model or item.</div>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{activeTab}</span>
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <CategoryChoice
                  icon={Barcode}
                  title="Serialized"
                  description="Serial number wise stock"
                  active={stockCategory === 'serialized'}
                  onClick={() => {
                    setStockCategory('serialized');
                    setPickerQuery('');
                    setBarcodeInput('');
                    setSerialSearchTerm('');
                    setSerialModelFilter('');
                    setSelectedSerials([]);
                    setFormData(prev => ({ ...prev, modelGuid: '', itemId: '', quantity: 1, serialNumbers: '' }));
                  }}
                />
                <CategoryChoice
                  icon={Boxes}
                  title="Non-Serialized"
                  description="Quantity based stock"
                  active={stockCategory === 'nonSerialized'}
                  onClick={() => {
                    setStockCategory('nonSerialized');
                    setPickerQuery('');
                    setBarcodeInput('');
                    setSerialSearchTerm('');
                    setSerialModelFilter('');
                    setSelectedSerials([]);
                    setFormData(prev => ({ ...prev, modelGuid: '', itemId: '', quantity: 1, serialNumbers: '' }));
                  }}
                />
              </div>
            </div>

            {stockCategory && (
              <div className={`grid gap-4 ${stockCategory === 'nonSerialized' ? 'md:grid-cols-[1fr_180px]' : ''}`}>
                <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <SearchablePicker
                    key={stockCategory}
                    label={stockCategory === 'nonSerialized' ? 'Item Name' : 'Model'}
                    placeholder={stockCategory === 'nonSerialized' ? 'Search and select stationery item' : 'Search and select model'}
                    options={pickerOptions}
                    query={pickerQuery}
                    selectedOption={selectedPickerOption}
                    onQueryChange={(value) => {
                      setPickerQuery(value);
                      setBarcodeInput('');
                      setSerialSearchTerm('');
                      setSerialModelFilter('');
                      setSelectedSerials([]);
                      setShowSerialSelector(false);
                      setFormData((prev) => ({ ...prev, modelGuid: '', itemId: '' }));
                    }}
                    onSelect={(option) => {
                      setPickerQuery(option.title);
                      setBarcodeInput('');
                      setSerialSearchTerm('');
                      setSerialModelFilter('');
                      setSelectedSerials([]);
                      setFormData((prev) => ({
                        ...prev,
                        modelGuid: stockCategory === 'serialized' ? option.guid || '' : '',
                        itemId: stockCategory === 'nonSerialized' ? option.id : '',
                        quantity: 1,
                        serialNumbers: ''
                      }));
                      if (stockCategory === 'serialized') {
                        setShowSerialSelector(true);
                      }
                    }}
                    emptyText={stockCategory === 'nonSerialized' ? 'No stationery items found' : 'No serialized models found'}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-bold uppercase text-slate-400">Bucket</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{activeTab}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-bold uppercase text-slate-400">Quantity</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{formData.quantity || 0}</div>
                    </div>
                  </div>

                  {stockCategory === 'nonSerialized' && (
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Quantity</span>
                      <input
                        type="number"
                        min="1"
                        value={formData.quantity}
                        onChange={(event) => setFormData((prev) => ({ ...prev, quantity: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </label>
                  )}

                  {stockCategory === 'serialized' && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-black text-slate-800">Serials</div>
                          <div className="text-xs font-medium text-slate-500">
                            {formData.modelGuid
                              ? `${selectedSerials.length} selected from ${modelSerials.length} available serials`
                              : 'Select a model to choose serial numbers.'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={openSerialSelector}
                          disabled={!formData.modelGuid}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Barcode size={17} />
                          Select Serials
                        </button>
                      </div>

                      {selectedSerials.length > 0 && (
                        <div className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                          <div className="divide-y divide-slate-100">
                            {selectedSerials.map((serial) => {
                              const serialValue = serial.value || serial.serialNumber;
                              return (
                                <div key={serialValue} className="flex items-center justify-between gap-3 px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="break-all font-mono text-sm font-bold text-slate-800">{serialValue}</div>
                                    <StatusBadge status={serial.status} />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeSelectedSerial(serialValue)}
                                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? <Loader2 className="animate-spin" size={17} /> : <ArrowUpRight size={17} />}
                Add Stock
              </button>
            </div>
          </form>
        </Modal>
      )}

      {activeModal === modalTypes.ADD && showSerialSelector && (
        <Modal title="Select Serials" onClose={closeSerialSelector} size="lg">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-black text-slate-800">{selectedPickerOption?.title || 'Selected model'}</div>
                <div className="text-xs font-medium text-slate-500">
                  Pick serial numbers for {activeTab}. Selected count will become add quantity.
                </div>
              </div>
              <div className="flex gap-2">
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
                  Selected {selectedSerials.length}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                  {modelSerials.length} serials
                </span>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-xs font-bold uppercase text-slate-500">Scan / Add</div>
                <form onSubmit={handleBarcodeSubmit} className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                    <input
                      value={barcodeInput}
                      onChange={(event) => setBarcodeInput(event.target.value)}
                      placeholder="Scan serial and press Enter"
                      className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
                  >
                    Add
                  </button>
                </form>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <div className="text-xs font-bold uppercase text-slate-500">Selected Serials</div>
                  <span className="text-xs font-bold text-slate-400">{selectedSerials.length}</span>
                </div>
                <div className="max-h-32 overflow-y-auto divide-y divide-slate-100">
                  {selectedSerials.length === 0 ? (
                    <div className="px-3 py-5 text-center text-xs font-medium text-slate-400">
                      No serial selected
                    </div>
                  ) : (
                    selectedSerials.map((serial) => {
                      const serialValue = serial.value || serial.serialNumber;
                      return (
                        <div key={serialValue} className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="min-w-0">
                            <div className="break-all font-mono text-sm font-bold text-slate-800">{serialValue}</div>
                            <StatusBadge status={serial.status} />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSelectedSerial(serialValue)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  value={serialSearchTerm}
                  onChange={(event) => setSerialSearchTerm(event.target.value)}
                  placeholder="Search serial no. or status"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                Showing {visibleModelSerials.length}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              {visibleModelSerials.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm font-medium text-slate-500">
                  No serials found for this model.
                </div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Serial No.</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleModelSerials.map((serial) => {
                      const serialValue = serial.value || serial.serialNumber;
                      const isSelected = selectedSerialValues.includes(serialValue);
                      return (
                        <tr
                          key={serial.guid || serialValue}
                          className={`transition ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                        >
                          <td className="px-3 py-2">
                            <div className="break-all font-mono text-sm font-bold text-slate-800">{serialValue}</div>
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={serial.status} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => (isSelected ? removeSelectedSerial(serialValue) : addSelectedSerial(serial))}
                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${isSelected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-700'
                                }`}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={closeSerialSelector}
                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {activeModal === modalTypes.SELL && (
        <Modal title={`Sell Out From ${activeTab}`} onClose={closeModal} size="sm">
          <form onSubmit={handleSellStock} className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-bold uppercase text-slate-400">Model / Item</div>
              <div className="mt-1 font-semibold text-slate-800">{sellData.modelName}</div>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Quantity</span>
              <input
                type="number"
                min="1"
                value={sellData.quantity}
                onChange={(event) => setSellData((prev) => ({ ...prev, quantity: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellData.amount}
                  onChange={(event) => setSellData((prev) => ({ ...prev, amount: event.target.value }))}
                  placeholder="Sell amount"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Date</span>
                <input
                  type="date"
                  value={sellData.transactionDate}
                  onChange={(event) => setSellData((prev) => ({ ...prev, transactionDate: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Order ID / Reference <span className="font-normal text-slate-400">(optional)</span></span>
              <input
                value={sellData.referenceId}
                onChange={(event) => setSellData((prev) => ({ ...prev, referenceId: event.target.value }))}
                placeholder="Order ID, marketplace ref, or note"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            {sellData.itemKind === 'serialized' && (
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Serial Number(s) <span className="font-normal text-slate-400">(optional — leave blank to auto-pick oldest)</span>
                </span>
                <textarea
                  rows={2}
                  value={sellData.serialNumbersInput}
                  onChange={(event) => setSellData((prev) => ({ ...prev, serialNumbersInput: event.target.value }))}
                  placeholder="Comma or newline separated, e.g. SN001, SN002"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                <span className="mt-1 block text-xs text-slate-400">Count must match Quantity above if provided.</span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="animate-spin" size={17} /> : <ArrowDownRight size={17} />}
                Sell Out
              </button>
            </div>
          </form>
        </Modal>
      )}

      {activeModal === modalTypes.DETAILS && serialViewItem && (
        <Modal title={`${serialViewItem.modelName} Details`} onClose={closeModal} size="md">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs font-bold uppercase text-slate-400">Bucket</div>
                <div className="mt-1 font-semibold text-slate-800">{serialViewItem.type || activeTab}</div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-slate-400">Brand</div>
                <div className="mt-1 font-semibold text-slate-800">{serialViewItem.brand || '-'}</div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-slate-400">Quantity</div>
                <div className="mt-1 font-semibold text-slate-800">{serialViewItem.quantity || 0}</div>
              </div>
            </div>

            {serialViewItem.itemKind !== 'serialized' ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                This item is non-serialized, so serial numbers are not available.
              </div>
            ) : serialViewNumbers.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-700">
                No active serial numbers found for this model.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
                <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  {serialViewNumbers.map((serial, index) => (
                    <div key={`${serial}-${index}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">
                        {index + 1}
                      </span>
                      <span className="break-all font-semibold text-slate-700">{serial}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {activeModal === modalTypes.EDIT && (
        <Modal title="Edit Stock Record" onClose={closeModal} size="md">
          <form onSubmit={handleEditSubmit} className="space-y-4 p-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Warehouse</label>
              <select
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={editData.warehouseGuid}
                onChange={(e) => setEditData(prev => ({ ...prev, warehouseGuid: e.target.value }))}
              >
                <option value="">-- Select a Warehouse --</option>
                {warehouses.map(w => (
                  <option key={w.guid} value={w.guid}>{w.warehouseName}</option>
                ))}
              </select>
            </div>

            {editData.itemKind === 'nonSerialized' && (
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">Quantity</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={editData.quantity}
                  onChange={(e) => setEditData(prev => ({ ...prev, quantity: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !editData.warehouseGuid}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : null}
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

