"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Barcode,
  Boxes,
  CheckCircle2,
  History,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Undo2,
  X,
  MapPin
} from 'lucide-react';
import { format } from 'date-fns';
import Swal from 'sweetalert2';
import { printerService } from '@/lib/services/api';
import { hasPermission } from '@/lib/client/rbac';
import { modalTypes } from "./constants";
import { CategoryChoice, Modal, SearchablePicker, StatusBadge, SummaryTile } from "./parts";
import FbfModals from "./FbfModals";

const tabs = ['FBF', 'FBA'];

const splitSerials = (value) =>
  String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const isSerializedModel = (value) =>
  value === true || value === 1 || value === '1' || value === 'true' || value === 'TRUE';

const hiddenSerialStatuses = new Set(['Dispatched', 'Sold', 'FBF', 'FBA']);
const getTodayDateInputValue = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
};


export default function FbfFbaManagement({ isAdmin, currentUser }) {
  // "fbfFbaManagement" isn't a PROTECTED_EDIT_PERMISSIONS tab (see
  // lib/auth.js) — same bug already fixed in the sibling FbfFbaMaster.jsx:
  // allow_edit_fbf_fba has no checkbox anywhere in Manage Roles to actually
  // grant it (see components/users/constants.js's EDIT_PERMISSIONS), so no
  // non-Admin role could ever pass this gate no matter what was checked —
  // granting "FBF/FBA Stock" view access alone should be enough, matching
  // every other non-protected tab.
  const canManage = isAdmin || hasPermission(currentUser, 'fbfFbaManagement') || !!currentUser?.allow_edit_fbf_fba;
  const [activeTab, setActiveTab] = useState('FBF');
  const [stock, setStock] = useState([]);
  const [models, setModels] = useState([]);
  const [serials, setSerials] = useState([]);
  const [stationeryItems, setStationeryItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeModal, setActiveModal] = useState(null);
  const [activeView, setActiveView] = useState('list');
  const [sellHistory, setSellHistory] = useState([]);
  const [loadingSellHistory, setLoadingSellHistory] = useState(false);
  const [editingSellOut, setEditingSellOut] = useState(null);
  const [editSellOutForm, setEditSellOutForm] = useState({ referenceId: '', amount: '', transactionDate: '' });
  const [savingSellOutEdit, setSavingSellOutEdit] = useState(false);
  const [showSerialSelector, setShowSerialSelector] = useState(false);
  const [serialViewItem, setSerialViewItem] = useState(null);
  const [stockCategory, setStockCategory] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [serialSearchTerm, setSerialSearchTerm] = useState('');
  const [serialModelFilter, setSerialModelFilter] = useState('');
  const [selectedSerials, setSelectedSerials] = useState([]);
  const [selectedWhState, setSelectedWhState] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [formData, setFormData] = useState({
    warehouseGuid: '',
    modelGuid: '',
    itemId: '',
    quantity: 1,
    serialNumbers: ''
  });
  const [editData, setEditData] = useState({
    guid: '',
    warehouseGuid: '',
    quantity: '',
    itemKind: ''
  });
  const [sellData, setSellData] = useState({
    warehouseGuid: '',
    modelGuid: '',
    itemId: '',
    itemKind: 'serialized',
    modelName: '',
    quantity: 1,
    amount: '',
    transactionDate: getTodayDateInputValue(),
    referenceId: '',
    serialNumbersInput: ''
  });

  // Return-Stock flow — kept fully separate from the Add-Stock state above
  // (own category/picker/quantity) so the two full-page views never bleed
  // into each other's fields. Grouped into one object (matching formData/
  // editData/sellData above) instead of 11 standalone useState calls —
  // destructured right below under their original names so every existing
  // read site (JSX, handlers) is untouched; only the setters change shape.
  const initialReturnState = {
    category: '', serialInput: '', serialLookupLoading: false,
    serials: [], // [{ serialNumber, modelGuid, modelName, type, warehouseGuid, warehouseName, warehouseState }]
    pickerQuery: '', item: null, // { id, title, ... } from SearchablePicker
    itemBuckets: [], bucketLoading: false, selectedBucketKey: '', quantity: 1, saving: false,
  };
  const [returnState, setReturnState] = useState(initialReturnState);
  const patchReturnState = (patch) => setReturnState((prev) => ({ ...prev, ...patch }));
  const {
    category: returnCategory, serialInput: returnSerialInput, serialLookupLoading: returnSerialLookupLoading,
    serials: returnSerials, pickerQuery: returnPickerQuery, item: returnItem, itemBuckets: returnItemBuckets,
    bucketLoading: returnBucketLoading, selectedBucketKey: returnSelectedBucketKey, quantity: returnQuantity,
    saving: returnSaving,
  } = returnState;

  const pickerOptions = useMemo(() => {
    if (stockCategory === 'serialized') {
      return models
        .filter((model) => isSerializedModel(model.isSerialized))
        .map((model) => ({
          id: model.guid,
          guid: model.guid,
          title: model.name,
          subtitle: [model.company, model.category].filter(Boolean).join(' - '),
          raw: model
        }));
    }

    if (stockCategory === 'nonSerialized') {
      return stationeryItems
        .filter((item) => !isSerializedModel(item.isTrackable))
        .map((item) => ({
          id: item.itemId,
          title: item.itemName,
          subtitle: [item.brandName, item.categoryName].filter(Boolean).join(' - '),
          raw: item
        }));
    }

    return [];
  }, [models, stationeryItems, stockCategory]);

  const selectedPickerOption = useMemo(() => {
    const selectedId = stockCategory === 'nonSerialized' ? formData.itemId : formData.modelGuid;
    return pickerOptions.find((option) => String(option.id) === String(selectedId)) || null;
  }, [formData.itemId, formData.modelGuid, pickerOptions, stockCategory]);

  // Non-serialized items only, for Return's item picker — items have no
  // serial identity, so this is the only lookup path for them.
  const returnPickerOptions = useMemo(() => {
    if (returnCategory !== 'nonSerialized') return [];
    return stationeryItems
      .filter((item) => !isSerializedModel(item.isTrackable))
      .map((item) => ({
        id: item.itemId,
        title: item.itemName,
        subtitle: [item.brandName, item.categoryName].filter(Boolean).join(' - '),
        raw: item
      }));
  }, [stationeryItems, returnCategory]);

  const modelSerials = useMemo(() => {
    if (stockCategory !== 'serialized') return [];
    return serials
      .filter((serial) => !hiddenSerialStatuses.has(serial.status))
      .filter((serial) => {
        if (activeView === 'sell_stock' && formData.modelGuid) {
          return String(serial.itemVariantId) === String(formData.modelGuid);
        }
        return true;
      })
      .filter((serial) => !serialModelFilter || String(serial.itemVariantId) === String(serialModelFilter))
      .sort((a, b) => String(a.value || a.serialNumber).localeCompare(String(b.value || b.serialNumber)));
  }, [formData.modelGuid, serials, stockCategory, serialModelFilter, activeView]);

  const visibleModelSerials = useMemo(() => {
    const term = serialSearchTerm.trim().toLowerCase();
    if (!term) return modelSerials.slice(0, 60);

    return modelSerials
      .filter((serial) =>
        [serial.value, serial.serialNumber, serial.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      )
      .slice(0, 60);
  }, [modelSerials, serialSearchTerm]);

  const selectedSerialValues = useMemo(
    () => selectedSerials.map((serial) => serial.value || serial.serialNumber),
    [selectedSerials]
  );

  const filteredStock = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return stock;

    return stock.filter((item) =>
      [item.modelName, item.brand, item.activeSerials]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [searchTerm, stock]);

  const totals = useMemo(() => {
    const totalModels = stock.length;
    const totalQuantity = stock.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return { totalModels, totalQuantity };
  }, [stock]);

  const serialViewNumbers = useMemo(
    () => splitSerials(serialViewItem?.activeSerials),
    [serialViewItem]
  );

  const fetchStock = useCallback(async () => {
    setLoading(true);
    try {
      const data = await printerService.getFbfFbaStock(activeTab);
      setStock(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch FBF/FBA stock', err);
      Swal.fire('Could not load stock', err.message || 'Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const fetchSellHistory = useCallback(async () => {
    setLoadingSellHistory(true);
    try {
      const data = await printerService.getFbfFbaSellOutHistory(activeTab);
      setSellHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch sell out history', err);
      Swal.fire('Could not load sell out history', err.message || 'Please try again.', 'error');
    } finally {
      setLoadingSellHistory(false);
    }
  }, [activeTab]);

  const openSellHistoryView = () => {
    setActiveView('sell_history');
    fetchSellHistory();
  };

  const openEditSellOut = (t) => {
    setEditingSellOut(t);
    setEditSellOutForm({
      referenceId: t.referenceId || '',
      amount: t.amount ?? '',
      transactionDate: t.transactionDate ? format(new Date(t.transactionDate), 'yyyy-MM-dd') : '',
    });
  };

  const handleSaveSellOutEdit = async (event) => {
    event.preventDefault();
    setSavingSellOutEdit(true);
    try {
      await printerService.updateFbfFbaSellOut(editingSellOut.guid, {
        referenceId: editSellOutForm.referenceId.trim(),
        amount: editSellOutForm.amount === '' ? null : Number(editSellOutForm.amount),
        transactionDate: editSellOutForm.transactionDate,
      });
      setEditingSellOut(null);
      await fetchSellHistory();
      Swal.fire('Updated', 'Sell out record updated.', 'success');
    } catch (err) {
      Swal.fire('Update failed', err.message || 'Please try again.', 'error');
    } finally {
      setSavingSellOutEdit(false);
    }
  };

  const fetchModels = useCallback(async () => {
    try {
      const [modelData, stationeryData, serialData, warehouseData] = await Promise.all([
        printerService.getModels(),
        printerService.getStationeryItems(),
        printerService.getSerials(),
        printerService.getFbfFbaWarehouses()
      ]);
      setModels(Array.isArray(modelData) ? modelData : []);
      setStationeryItems(Array.isArray(stationeryData) ? stationeryData : []);
      setSerials(Array.isArray(serialData) ? serialData : []);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
    } catch (err) {
      console.error('Failed to fetch stock masters', err);
      setModels([]);
      setStationeryItems([]);
      setSerials([]);
      setWarehouses([]);
    }
  }, []);

  useEffect(() => {
    fetchStock();
    fetchModels();
  }, [fetchModels, fetchStock]);

  useEffect(() => {
    if (activeView === 'sell_history') fetchSellHistory();
  }, [activeView, fetchSellHistory]);

  const resetAddForm = () => {
    setStockCategory('');
    setPickerQuery('');
    setBarcodeInput('');
    setSerialSearchTerm('');
    setSerialModelFilter('');
    setSelectedSerials([]);
    setShowSerialSelector(false);
    setFormData({ warehouseGuid: formData.warehouseGuid, modelGuid: '', itemId: '', quantity: 1, serialNumbers: '' });
  };

  const closeModal = () => {
    if (activeModal === modalTypes.ADD) {
      resetAddForm();
    }
    setShowSerialSelector(false);
    setActiveModal(null);
    setSerialViewItem(null);
  };

  const openSerialSelector = () => {
    setShowSerialSelector(true);
  };

  const closeSerialSelector = () => {
    setShowSerialSelector(false);
  };

  const openAddModal = () => {
    resetAddForm();
    setFormData((prev) => ({ ...prev, warehouseGuid: '' }));
    setSelectedWhState('');
    setSerialViewItem(null);
    setActiveView('add_stock');
  };

  const handleAddStock = async (event) => {
    event.preventDefault();



    if (stockCategory === 'serialized') {
      if (selectedSerials.length === 0) {
        Swal.fire('Missing serials', 'Please select at least one serial number.', 'warning');
        return;
      }

      setSaving(true);
      try {
        // Group by itemVariantId
        const groups = {};
        for (const serial of selectedSerials) {
          if (!groups[serial.itemVariantId]) groups[serial.itemVariantId] = [];
          groups[serial.itemVariantId].push(serial.value || serial.serialNumber);
        }

        let totalAdded = 0;
        const failedGroups = [];
        for (const mId of Object.keys(groups)) {
          const snums = groups[mId];
          const matchedModel = models.find(m => String(m.guid) === String(mId));

          try {
            await printerService.addFbfFbaStock({
              modelGuid: matchedModel?.guid || mId || null,
              itemId: null,
              itemKind: 'serialized',
              type: activeTab,
              warehouseGuid: formData.warehouseGuid || null,
              quantity: snums.length,
              serialNumbers: snums,
              createdBy: currentUser?.username || 'System'
            });
            totalAdded += snums.length;
          } catch (err) {
            failedGroups.push({ modelName: matchedModel?.name || mId, message: err.message });
          }
        }

        setActiveModal(null);
        resetAddForm();
        setActiveView('list');
        await fetchStock();

        if (failedGroups.length > 0) {
          Swal.fire(
            'Partially completed',
            `Moved ${totalAdded} serials successfully. Failed for: ${failedGroups.map(f => `${f.modelName} (${f.message})`).join(', ')}`,
            'warning'
          );
        } else {
          Swal.fire('Stock added', `Successfully moved ${totalAdded} serials across ${Object.keys(groups).length} models to ${activeTab}.`, 'success');
        }
      } catch (err) {
        Swal.fire('Add stock failed', err.message || 'Please try again.', 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    const quantity = Number(formData.quantity);
    const serialNumbers = splitSerials(formData.serialNumbers);
    const selectedId = formData.itemId;

    if (!selectedId || !Number.isFinite(quantity) || quantity <= 0) {
      Swal.fire('Missing details', 'Select an item and enter a valid quantity.', 'warning');
      return;
    }

    if (!stockCategory) {
      Swal.fire('Choose category', 'Select Serialized or Non-Serialized first.', 'warning');
      return;
    }



    setSaving(true);
    try {
      await printerService.addFbfFbaStock({
        modelGuid: stockCategory === 'serialized' ? formData.modelGuid : null,
        itemId: stockCategory === 'nonSerialized' ? formData.itemId : null,
        itemKind: stockCategory,
        type: activeTab,
        warehouseGuid: formData.warehouseGuid || null,
        quantity,
        serialNumbers: stockCategory === 'serialized' ? serialNumbers : [],
        createdBy: currentUser?.username || 'System'
      });
      setActiveModal(null);
      resetAddForm();
      setActiveView('list');
      await fetchStock();
      Swal.fire('Stock added', `${quantity} item${quantity === 1 ? '' : 's'} moved to ${activeTab}.`, 'success');
    } catch (err) {
      Swal.fire('Add stock failed', err.message || 'Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openSellModal = (item) => {
    setSerialViewItem(null);
    // itemId presence is the reliable signal (non-serialized stock rows always
    // have itemId set, serialized ones never do) — item.itemKind can be stale
    // on rows created before that column existed, since it was backfilled with
    // a DEFAULT 'serialized' rather than derived per-row.
    setSellData({
      modelGuid: item.modelGuid || '',
      itemId: item.itemId,
      itemKind: item.itemId ? 'nonSerialized' : 'serialized',
      modelName: item.modelName,
      quantity: 1,
      amount: '',
      transactionDate: getTodayDateInputValue(),
      referenceId: '',
      warehouseGuid: item.warehouseGuid || '',
      serialNumbersInput: ''
    });
    setActiveModal(modalTypes.SELL);
  };

  const openDetailsModal = (item) => {
    setSerialViewItem(item);
    setActiveModal(modalTypes.DETAILS);
  };

  const openEditModal = (item) => {
    setSerialViewItem(null);
    setEditData({
      guid: item.guid,
      warehouseGuid: item.warehouseGuid || '',
      quantity: item.quantity,
      itemKind: item.itemId ? 'nonSerialized' : 'serialized'
    });
    setActiveModal(modalTypes.EDIT);
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editData.guid) return;
    
    setSaving(true);
    try {
      await printerService.updateFbfFbaStock(editData.guid, {
        warehouseGuid: editData.warehouseGuid,
        quantity: editData.quantity
      });
      setActiveModal(null);
      await fetchStock();
      Swal.fire('Success', 'Stock updated successfully', 'success');
    } catch (err) {
      Swal.fire('Error', err.message || 'Failed to update stock', 'error');
    } finally {
      setSaving(false);
    }
  };

  const syncSelectedSerials = (nextSerials) => {
    const serialValues = nextSerials.map((serial) => serial.value || serial.serialNumber);
    setSelectedSerials(nextSerials);
    setFormData((prev) => ({
      ...prev,
      serialNumbers: serialValues.join('\n'),
      quantity: serialValues.length || 1
    }));
  };

  const addSelectedSerial = (serial) => {
    const serialValue = serial?.value || serial?.serialNumber;
    if (!serialValue) return;

    if (selectedSerialValues.includes(serialValue)) {
      Swal.fire('Already selected', `${serialValue} is already in the selected list.`, 'info');
      return;
    }

    if (!formData.modelGuid && activeView === 'sell_stock') {
      const matchedModel = models.find(m => String(m.guid) === String(serial.itemVariantId));
      if (matchedModel) {
        setFormData(prev => ({
          ...prev,
          modelGuid: matchedModel.guid || ''
        }));
        setPickerQuery(matchedModel.name);
      }
    }

    syncSelectedSerials([...selectedSerials, serial]);
  };

  const removeSelectedSerial = (serialValue) => {
    syncSelectedSerials(selectedSerials.filter((serial) => (serial.value || serial.serialNumber) !== serialValue));
  };

  const handleBarcodeSubmit = (event) => {
    event.preventDefault();
    const scannedValue = barcodeInput.trim();
    if (!scannedValue) return;

    const matchedSerial = modelSerials.find(
      (serial) => String(serial.value || serial.serialNumber).trim().toLowerCase() === scannedValue.toLowerCase()
    );

    if (!matchedSerial) {
      Swal.fire('Serial not found', 'This serial number is not available under the selected model.', 'warning');
      return;
    }

    addSelectedSerial(matchedSerial);
    setBarcodeInput('');
  };

  const handleSellStock = async (event) => {
    event.preventDefault();

    const quantity = Number(sellData.quantity);
    const amount = sellData.amount === '' ? null : Number(sellData.amount);
    const selectedSellId = sellData.itemKind === 'nonSerialized' ? sellData.itemId : sellData.modelGuid;
    if (!selectedSellId || !Number.isFinite(quantity) || quantity <= 0) {
      Swal.fire('Invalid quantity', 'Enter a valid quantity to sell out.', 'warning');
      return;
    }

    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      Swal.fire('Invalid amount', 'Enter a valid sell out amount.', 'warning');
      return;
    }

    if (!sellData.transactionDate) {
      Swal.fire('Missing date', 'Select a sell out date.', 'warning');
      return;
    }

    // Optional: user may type specific serial numbers instead of relying on FIFO auto-selection
    const serialNumbers = sellData.itemKind === 'serialized'
      ? (sellData.serialNumbersInput || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean)
      : [];

    if (serialNumbers.length > 0 && serialNumbers.length !== quantity) {
      Swal.fire('Serial count mismatch', `You entered ${serialNumbers.length} serial(s) but quantity is ${quantity}. They must match, or clear the serial field to auto-select.`, 'warning');
      return;
    }

    setSaving(true);
    try {
      await printerService.sellFbfFbaStock({
        modelGuid: sellData.itemKind === 'serialized' ? sellData.modelGuid : null,
        itemId: sellData.itemKind === 'nonSerialized' ? sellData.itemId : null,
        itemKind: sellData.itemKind,
        type: activeTab,
        warehouseGuid: sellData.warehouseGuid || null,
        quantity,
        amount,
        transactionDate: sellData.transactionDate,
        referenceId: sellData.referenceId.trim(),
        serialNumbers: serialNumbers.length > 0 ? serialNumbers : undefined,
        createdBy: currentUser?.username || 'System'
      });
      setActiveModal(null);
      await fetchStock();
      Swal.fire({
        title: 'Stock updated',
        text: `${quantity} item${quantity === 1 ? '' : 's'} sold out from ${activeTab}.`,
        icon: 'success'
      });
    } catch (err) {
      Swal.fire('Sell out failed', err.message || 'Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };


  const resetReturnForm = () => {
    setReturnState(initialReturnState);
  };

  const openReturnView = () => {
    resetReturnForm();
    setActiveView('return_stock');
  };

  const bucketKey = (b) => `${b.type}::${b.warehouseGuid || ''}`;

  const handleAddReturnSerial = async (event) => {
    event?.preventDefault?.();
    const serialNumber = returnSerialInput.trim();
    if (!serialNumber) return;

    if (returnSerials.some((s) => s.serialNumber.toLowerCase() === serialNumber.toLowerCase())) {
      Swal.fire('Already added', `${serialNumber} is already in the return list.`, 'info');
      return;
    }

    patchReturnState({ serialLookupLoading: true });
    try {
      const result = await printerService.lookupFbfFbaReturn({ serialNumber });
      if (!result.found) {
        Swal.fire('Not found', result.message || 'This serial is not currently in FBF/FBA stock.', 'warning');
        return;
      }
      setReturnState((prev) => ({ ...prev, serials: [...prev.serials, result], serialInput: '' }));
    } catch (err) {
      Swal.fire('Lookup failed', err.message || 'Could not look up this serial.', 'error');
    } finally {
      patchReturnState({ serialLookupLoading: false });
    }
  };

  const removeReturnSerial = (serialNumber) => {
    setReturnState((prev) => ({ ...prev, serials: prev.serials.filter((s) => s.serialNumber !== serialNumber) }));
  };

  const handleReturnItemSelect = async (option) => {
    patchReturnState({ pickerQuery: option.title, item: option, itemBuckets: [], selectedBucketKey: '', bucketLoading: true });
    try {
      const result = await printerService.lookupFbfFbaReturn({ itemId: option.id });
      if (!result.found) {
        Swal.fire('No stock found', result.message || 'This item has no FBF/FBA stock to return.', 'info');
        return;
      }
      const buckets = result.buckets || [];
      patchReturnState({ itemBuckets: buckets, selectedBucketKey: buckets.length === 1 ? bucketKey(buckets[0]) : '' });
    } catch (err) {
      Swal.fire('Lookup failed', err.message || 'Could not look up this item.', 'error');
    } finally {
      patchReturnState({ bucketLoading: false });
    }
  };

  const handleReturnSubmit = async (event) => {
    event.preventDefault();

    if (returnCategory === 'serialized') {
      if (returnSerials.length === 0) {
        Swal.fire('Missing serials', 'Add at least one serial number to return.', 'warning');
        return;
      }

      patchReturnState({ saving: true });
      try {
        // Group by (type, warehouse, model) — a batch of scanned serials can
        // span more than one, same as Add Stock's per-model grouping.
        const groups = {};
        for (const s of returnSerials) {
          const key = `${s.type}::${s.warehouseGuid || ''}::${s.modelGuid}`;
          if (!groups[key]) groups[key] = { type: s.type, warehouseGuid: s.warehouseGuid, modelGuid: s.modelGuid, modelName: s.modelName, serials: [] };
          groups[key].serials.push(s.serialNumber);
        }

        // Each group targets a different (type, warehouse, model) combo —
        // independent requests, so they don't need to wait on each other.
        // allSettled (not all) so one group's failure doesn't stop the rest
        // from completing, same partial-failure reporting as before.
        const groupList = Object.values(groups);
        const results = await Promise.allSettled(
          groupList.map((group) =>
            printerService.returnFbfFbaStock({
              modelGuid: group.modelGuid,
              itemKind: 'serialized',
              type: group.type,
              warehouseGuid: group.warehouseGuid || null,
              serialNumbers: group.serials,
              createdBy: currentUser?.username || 'System'
            })
          )
        );

        let totalReturned = 0;
        const failedGroups = [];
        results.forEach((result, i) => {
          const group = groupList[i];
          if (result.status === 'fulfilled') {
            totalReturned += group.serials.length;
          } else {
            failedGroups.push({ modelName: group.modelName, message: result.reason?.message });
          }
        });

        resetReturnForm();
        setActiveView('list');
        await fetchStock();

        if (failedGroups.length > 0) {
          Swal.fire('Partially completed', `Returned ${totalReturned} serials successfully. Failed for: ${failedGroups.map(f => `${f.modelName} (${f.message})`).join(', ')}`, 'warning');
        } else {
          Swal.fire('Stock returned', `Successfully returned ${totalReturned} serial(s) to main inventory.`, 'success');
        }
      } catch (err) {
        Swal.fire('Return failed', err.message || 'Please try again.', 'error');
      } finally {
        patchReturnState({ saving: false });
      }
      return;
    }

    const selectedBucket = returnItemBuckets.find((b) => bucketKey(b) === returnSelectedBucketKey);
    const quantity = Number(returnQuantity);

    if (!returnItem || !selectedBucket) {
      Swal.fire('Missing details', 'Select an item and choose which warehouse to return from.', 'warning');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > selectedBucket.quantity) {
      Swal.fire('Invalid quantity', `Enter a quantity between 1 and ${selectedBucket.quantity}.`, 'warning');
      return;
    }

    patchReturnState({ saving: true });
    try {
      await printerService.returnFbfFbaStock({
        itemId: returnItem.id,
        itemKind: 'nonSerialized',
        type: selectedBucket.type,
        warehouseGuid: selectedBucket.warehouseGuid || null,
        quantity,
        createdBy: currentUser?.username || 'System'
      });
      resetReturnForm();
      setActiveView('list');
      await fetchStock();
      Swal.fire('Stock returned', `${quantity} item${quantity === 1 ? '' : 's'} returned to main inventory.`, 'success');
    } catch (err) {
      Swal.fire('Return failed', err.message || 'Please try again.', 'error');
    } finally {
      patchReturnState({ saving: false });
    }
  };

  if (activeView === 'sell_history') {
    return (
      <div className="w-full space-y-6 pb-20 animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-950">Sell Out History — {activeTab}</h1>
              {!loadingSellHistory && (
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                  {sellHistory.length} {sellHistory.length === 1 ? 'record' : 'records'}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Every sell out recorded from {activeTab}, with the Order ID / Reference, amount and date entered at the time.
            </p>
          </div>
          <button
            onClick={() => setActiveView('list')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition"
          >
            <X size={18} />
            Close
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loadingSellHistory ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
              <Loader2 size={20} className="animate-spin" /> Loading sell out history...
            </div>
          ) : sellHistory.length === 0 ? (
            <div className="py-16 text-center text-sm font-medium text-slate-400">
              No sell out transactions recorded for {activeTab} yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Order ID / Reference</th>
                    <th className="px-4 py-3">Warehouse</th>
                    <th className="px-4 py-3">Serials</th>
                    <th className="px-4 py-3">By</th>
                    {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sellHistory.map((t, idx) => (
                    <tr key={t.guid} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {t.transactionDate ? format(new Date(t.transactionDate), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{t.itemName || 'Unknown item'}</div>
                        {t.brand && <div className="text-xs text-slate-400">{t.brand}</div>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{t.quantity}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {t.amount !== null && t.amount !== undefined ? `₹${Number(t.amount).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-indigo-700">{t.referenceId || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {t.warehouseName || 'No warehouse recorded'}
                        {t.warehouseState && <span className="text-xs text-slate-400"> · {t.warehouseState}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">
                        {t.serialNumbers?.length ? t.serialNumbers.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{t.createdBy || '—'}</td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openEditSellOut(t)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 transition"
                          >
                            <Pencil size={13} />
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {editingSellOut && (
          <Modal title="Edit Sell Out Record" onClose={() => setEditingSellOut(null)} size="sm">
            <form onSubmit={handleSaveSellOutEdit} className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">Order ID / Reference</label>
                <input
                  type="text"
                  value={editSellOutForm.referenceId}
                  onChange={(e) => setEditSellOutForm((prev) => ({ ...prev, referenceId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editSellOutForm.amount}
                  onChange={(e) => setEditSellOutForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">Date</label>
                <input
                  type="date"
                  required
                  value={editSellOutForm.transactionDate}
                  onChange={(e) => setEditSellOutForm((prev) => ({ ...prev, transactionDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <p className="text-xs text-slate-400">Quantity and serials can't be edited here — they already moved stock when this sell out was made.</p>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSellOut(null)}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSellOutEdit}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingSellOutEdit ? <Loader2 className="animate-spin" size={16} /> : null}
                  Save Changes
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    );
  }

  if (activeView === 'return_stock') {
    return (
      <div className="w-full space-y-6 pb-20 animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Return Stock from FBF/FBA</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Bring serials or items back into main inventory — still sitting in FBF/FBA, or already sold and returned by a customer.
            </p>
          </div>
          <button
            onClick={() => { setActiveView('list'); resetReturnForm(); }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition"
          >
            <X size={18} />
            Cancel
          </button>
        </div>

        <form onSubmit={handleReturnSubmit} className="w-full space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-black text-indigo-600 ring-4 ring-indigo-50/50">1</div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Stock Category</h3>
                <p className="text-sm font-medium text-slate-500">Serialized items are looked up by serial number; non-serialized by item + warehouse.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <CategoryChoice
                icon={Barcode}
                title="Serialized Items"
                description="Return by scanning/typing serial numbers"
                active={returnCategory === 'serialized'}
                onClick={() => { resetReturnForm(); patchReturnState({ category: 'serialized' }); }}
              />
              <CategoryChoice
                icon={Boxes}
                title="Non-Serialized"
                description="Return by item + warehouse + quantity"
                active={returnCategory === 'nonSerialized'}
                onClick={() => { resetReturnForm(); patchReturnState({ category: 'nonSerialized' }); }}
              />
            </div>
          </div>

          {returnCategory === 'serialized' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-black text-indigo-600 ring-4 ring-indigo-50/50">2</div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Serial Number</h3>
                  <p className="text-sm font-medium text-slate-500">Type or scan a serial — its warehouse and type will show up automatically.</p>
                </div>
              </div>

              {/* Nested <form> isn't valid HTML (this whole view is already
                  inside the outer Return <form>), so this is a <div> with
                  its own Enter-key + button handling instead of a submit. */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input
                    autoFocus
                    value={returnSerialInput}
                    onChange={(e) => patchReturnState({ serialInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddReturnSerial(e);
                      }
                    }}
                    placeholder="Scan or type serial number and press Enter"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-mono outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddReturnSerial}
                  disabled={returnSerialLookupLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {returnSerialLookupLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                  Look Up
                </button>
              </div>

              <div className="mt-5">
                {returnSerials.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-slate-400 py-8 text-center">
                    <Undo2 size={36} className="mb-3 opacity-20" />
                    <p className="text-sm font-semibold text-slate-500">No serials added yet.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                        <tr>
                          <th className="p-3">Serial No.</th>
                          <th className="p-3">Model</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">Warehouse</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {returnSerials.map((s) => (
                          <tr key={s.serialNumber}>
                            <td className="p-3 font-mono font-bold text-slate-800">{s.serialNumber}</td>
                            <td className="p-3 text-slate-600">{s.modelName}</td>
                            <td className="p-3"><StatusBadge status={s.type} /></td>
                            <td className="p-3 text-slate-600">
                              {s.type === 'Sold' ? (
                                <div className="font-semibold text-emerald-700">→ Main Inventory (customer return)</div>
                              ) : (
                                <>
                                  <div className="font-semibold">{s.warehouseName}</div>
                                  {s.warehouseState && <div className="text-xs text-slate-400">{s.warehouseState}</div>}
                                </>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => removeReturnSerial(s.serialNumber)}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              >
                                <X size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {returnCategory === 'nonSerialized' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 animate-in fade-in slide-in-from-top-2 duration-300 space-y-6">
              <div className="flex items-center gap-4 mb-2 pb-6 border-b border-slate-100">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-black text-indigo-600 ring-4 ring-indigo-50/50">2</div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Item &amp; Warehouse</h3>
                  <p className="text-sm font-medium text-slate-500">Pick the item, then which warehouse's stock to return from.</p>
                </div>
              </div>

              <SearchablePicker
                label="Item Name"
                placeholder="Search and select stationery item"
                options={returnPickerOptions}
                query={returnPickerQuery}
                selectedOption={returnItem}
                onQueryChange={(value) => {
                  patchReturnState({ pickerQuery: value, item: null, itemBuckets: [], selectedBucketKey: '' });
                }}
                onSelect={handleReturnItemSelect}
                emptyText="No stationery items found"
              />

              {returnBucketLoading && (
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <Loader2 className="animate-spin" size={16} /> Checking FBF/FBA stock…
                </div>
              )}

              {!returnBucketLoading && returnItemBuckets.length > 0 && (
                <div className="space-y-2">
                  <span className="text-sm font-bold text-slate-700">Return From</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {returnItemBuckets.map((b) => {
                      const key = bucketKey(b);
                      const active = returnSelectedBucketKey === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => patchReturnState({ selectedBucketKey: key })}
                          className={`text-left rounded-xl border p-3 transition ${active ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <StatusBadge status={b.type} />
                            <span className={`text-xs font-bold ${active ? 'text-white' : 'text-slate-500'}`}>{b.quantity} in stock</span>
                          </div>
                          <div className={`mt-1 text-sm font-bold ${active ? 'text-white' : 'text-slate-800'}`}>{b.warehouseName}</div>
                          {b.warehouseState && <div className={`text-xs ${active ? 'text-slate-300' : 'text-slate-400'}`}>{b.warehouseState}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {returnSelectedBucketKey && (
                <label className="block max-w-xs">
                  <span className="text-sm font-bold text-slate-700">Quantity to Return</span>
                  <input
                    type="number"
                    min="1"
                    max={returnItemBuckets.find((b) => bucketKey(b) === returnSelectedBucketKey)?.quantity || 1}
                    value={returnQuantity}
                    onChange={(e) => patchReturnState({ quantity: e.target.value })}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  />
                </label>
              )}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={
                returnSaving ||
                (returnCategory === 'serialized' && returnSerials.length === 0) ||
                (returnCategory === 'nonSerialized' && (!returnItem || !returnSelectedBucketKey))
              }
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-black text-white shadow-md hover:bg-indigo-700 hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {returnSaving ? <Loader2 className="animate-spin" size={20} /> : <Undo2 size={20} />}
              Confirm Return
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (activeView === 'add_stock') {
    return (
      <div className="w-full space-y-6 pb-20 animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Add Stock to {activeTab}</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Select a warehouse, pick your stock category, and assign serials or quantities.
            </p>
          </div>
          <button
            onClick={() => { setActiveView('list'); resetAddForm(); }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition"
          >
            <X size={18} />
            Cancel
          </button>
        </div>

        <form onSubmit={handleAddStock} className="w-full space-y-6">

          {/* Step 1: Location */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-black text-indigo-600 ring-4 ring-indigo-50/50">1</div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Select Location</h3>
                <p className="text-sm font-medium text-slate-500">Choose the warehouse where the stock is stored.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">State</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none hover:bg-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
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
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="mb-2 block text-sm font-bold text-slate-700">Warehouse Name</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none hover:bg-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
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
            </div>

            {formData.warehouseGuid && (
              <div className="mt-5 pt-5 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="mb-2 block text-sm font-bold text-slate-700">Warehouse Address</label>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-600 flex gap-3">
                  <MapPin className="text-slate-400 shrink-0 mt-0.5" size={18} />
                  <p>{warehouses.find(w => w.guid === formData.warehouseGuid)?.warehouseAddress || 'No address provided'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Category */}
          <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 transition-all duration-300 ${!formData.warehouseGuid ? 'opacity-50 blur-[1px] pointer-events-none' : ''}`}>
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-black text-indigo-600 ring-4 ring-indigo-50/50">2</div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Stock Category</h3>
                <p className="text-sm font-medium text-slate-500">Select the type of inventory to add.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <CategoryChoice
                icon={Barcode}
                title="Serialized Items"
                description="Printers or items with serial numbers"
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
                description="Stationery or bulk quantity items"
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

          {/* Step 3: Details */}
          <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 transition-all duration-300 ${(!formData.warehouseGuid || !stockCategory) ? 'opacity-50 blur-[1px] pointer-events-none' : ''}`}>
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-black text-indigo-600 ring-4 ring-indigo-50/50">3</div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Stock Details</h3>
                <p className="text-sm font-medium text-slate-500">Add items or scan serial numbers.</p>
              </div>
            </div>

            {!stockCategory ? (
              <div className="flex flex-col items-center justify-center text-slate-400 py-6 text-center">
                <Package size={42} className="mb-4 opacity-20" />
                <p className="font-medium text-sm">Select a stock category in Step 2 to continue.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {stockCategory === 'nonSerialized' && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-6">
                    <SearchablePicker
                      key={stockCategory}
                      label={'Item Name'}
                      placeholder={'Search and select stationery item'}
                      options={pickerOptions}
                      query={pickerQuery}
                      selectedOption={selectedPickerOption}
                      onQueryChange={(value) => {
                        setPickerQuery(value);
                        setFormData((prev) => ({ ...prev, itemId: '' }));
                      }}
                      onSelect={(option) => {
                        setPickerQuery(option.title);
                        setFormData((prev) => ({
                          ...prev,
                          itemId: option.id,
                          quantity: 1
                        }));
                      }}
                      emptyText={'No stationery items found'}
                    />

                    <div>
                      <label className="block">
                        <span className="mb-2 block text-sm font-bold text-slate-700">Quantity</span>
                        <input
                          type="number"
                          min="1"
                          value={formData.quantity}
                          onChange={(event) => setFormData((prev) => ({ ...prev, quantity: event.target.value }))}
                          className="w-full sm:w-1/2 lg:w-1/3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none hover:bg-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {stockCategory === 'serialized' && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white">
                      <div className="p-5 border-b border-slate-100 bg-slate-50 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-black text-slate-900">Serial Numbers</div>
                          <div className="text-xs font-medium text-slate-500 mt-1">
                            {`${selectedSerials.length} selected from ${modelSerials.length} available`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={openSerialSelector}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-600 transition-all focus:ring-4 focus:ring-indigo-500/30 active:scale-[0.98]"
                        >
                          <Barcode size={18} />
                          Manage Serials
                        </button>
                      </div>

                      <div className="p-5 max-h-[350px] overflow-y-auto">
                        {selectedSerials.length === 0 ? (
                          <div className="flex flex-col items-center justify-center text-slate-400 py-8 text-center">
                            <Barcode size={36} className="mb-3 opacity-20" />
                            <p className="text-sm font-semibold text-slate-500">No serials selected yet.</p>
                            <p className="text-xs font-medium mt-1 text-slate-400">Click Manage Serials to add printers.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {selectedSerials.map((serial) => {
                              const serialValue = serial.value || serial.serialNumber;
                              return (
                                <div key={serialValue} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 group transition hover:border-slate-300">
                                  <div className="min-w-0">
                                    <div className="truncate font-mono text-xs font-bold text-slate-800">{serialValue}</div>
                                    <div className="truncate text-[10px] font-medium text-slate-500">
                                      {models.find(m => String(m.guid) === String(serial.itemVariantId))?.name || 'Unknown Model'}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeSelectedSerial(serialValue)}
                                    className="rounded-md p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-colors shrink-0"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>



                    {/* Manage Serials Section */}
                    {showSerialSelector && (
                      <div className="border-t border-slate-200 bg-slate-50 p-5 rounded-b-xl">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-sm font-bold text-slate-800">Select Serials</h3>
                          <button type="button" onClick={closeSerialSelector} className="text-xs font-bold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 shadow-sm">
                            Done Selecting
                          </button>
                        </div>
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-black text-slate-800">{selectedPickerOption?.title || 'Selected model'}</div>
                    <div className="text-xs font-medium text-slate-500">
                      Pick serial numbers for {activeTab}.
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
                      Selected {selectedSerials.length}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="text-xs font-bold uppercase text-slate-500">Scan / Add</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Scan barcode..."
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleBarcodeSubmit(e); } }}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                      />
                      <button type="button" onClick={handleBarcodeSubmit} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                        Add
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">Scanned serials are auto-selected.</p>
                  </div>

                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="text-xs font-bold uppercase text-slate-500">Filter & Search</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        value={serialModelFilter}
                        onChange={(e) => setSerialModelFilter(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-1/3 bg-slate-50 font-medium"
                      >
                        <option value="">All Models</option>
                        {models.filter(m => isSerializedModel(m.isSerialized)).map(m => (
                          <option key={m.guid} value={m.guid}>{m.name}</option>
                        ))}
                      </select>
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="text"
                          placeholder="Search by serial..."
                          value={serialSearchTerm}
                          onChange={(e) => setSerialSearchTerm(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 pl-9 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                  {visibleModelSerials.length === 0 ? (
                    <div className="p-8 text-center text-sm font-medium text-slate-500">No matching serials found.</div>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs font-bold uppercase text-slate-500 shadow-sm">
                        <tr>
                          <th className="p-3">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300"
                              checked={visibleModelSerials.length > 0 && visibleModelSerials.every((s) => selectedSerialValues.includes(s.value || s.serialNumber))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const newToAdd = visibleModelSerials.filter((s) => !selectedSerialValues.includes(s.value || s.serialNumber));
                                  setSelectedSerials((prev) => [...prev, ...newToAdd]);
                                } else {
                                  const filteredValues = visibleModelSerials.map((s) => s.value || s.serialNumber);
                                  setSelectedSerials((prev) => prev.filter((s) => !filteredValues.includes(s.value || s.serialNumber)));
                                }
                              }}
                            />
                          </th>
                          <th className="p-3">Model Name</th>
                          <th className="p-3">Serial Number</th>
                          <th className="p-3">Current Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {visibleModelSerials.map((s) => {
                          const val = s.value || s.serialNumber;
                          const isSelected = selectedSerialValues.includes(val);
                          return (
                            <tr key={val} className={`transition ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  className="rounded border-slate-300"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      removeSelectedSerial(val);
                                    } else {
                                      setSelectedSerials((prev) => [...prev, s]);
                                    }
                                  }}
                                />
                              </td>
                              <td className="p-3 font-medium text-slate-600">
                               {models.find(m => String(m.guid || m.id) === String(s.modelId || s.modelGuid || s.itemVariantId))?.name || 'Unknown'}
                              </td>
                              <td className="p-3 font-mono font-bold text-slate-800">{val}</td>
                              <td className="p-3"><StatusBadge status={s.status} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

              </div>
                      </div>
                    )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving || !formData.warehouseGuid || !stockCategory || (stockCategory === 'nonSerialized' && !formData.itemId) || (stockCategory === 'serialized' && selectedSerials.length === 0)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-black text-white shadow-md hover:bg-indigo-700 hover:shadow-lg focus:ring-4 focus:ring-indigo-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                {saving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                Confirm & Add Stock
              </button>
            </div>
          </div>
        </form>


      </div>
    );
  }
  return (
    <div className="space-y-6 text-slate-900">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
        <div className="border-b border-slate-100 bg-white px-5 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
                <ShoppingCart size={15} className="text-indigo-600" />
                FBF/FBA Operations
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">Marketplace Stock</h1>
              <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
                Move printer serials and stationery items into marketplace buckets with scan-first controls.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openSellHistoryView}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md"
              >
                <History size={18} />
                Sell Out History
              </button>
              <button
                onClick={openReturnView}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!canManage}
              >
                <Undo2 size={18} />
                Return Stock
              </button>
              <button
                onClick={openAddModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!canManage}
              >
                <Plus size={18} />
                Add Stock
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 bg-slate-50/70 p-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Active Bucket</div>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition ${activeTab === tab
                    ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <SummaryTile icon={Package} label="Items In Stock" value={totals.totalModels} tone="indigo" />
          <SummaryTile icon={CheckCircle2} label="Total Units" value={totals.totalQuantity} tone="emerald" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-white p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search model, item, brand, serial"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-medium outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            onClick={fetchStock}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            {loading ? <Loader2 className="animate-spin" size={17} /> : <ArrowUpRight size={17} />}
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={30} />
          </div>
        ) : filteredStock.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
            <AlertTriangle className="text-slate-300" size={34} />
            <p className="mt-3 font-semibold text-slate-700">No {activeTab} stock found</p>
            <p className="text-sm text-slate-500">Add stock to this bucket to see it here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Model / Item</th>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3">Serials</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStock.map((item) => (
                  <tr key={item.guid} className="transition hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openDetailsModal(item)}
                        className="text-left font-bold text-slate-900 transition hover:text-indigo-700 hover:underline"
                      >
                        {item.modelName}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.brand || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.whPlatform ? (
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 text-xs">{item.whName}</span>
                          <span className="text-[10px] text-slate-500 uppercase">{item.whPlatform} • {item.whState}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{item.quantity}</td>
                    <td className="max-w-sm px-4 py-3 text-slate-500">
                      {item.activeSerials ? (
                        <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
                          Serialized
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                          Non-serialized
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {item.lastUpdated ? format(new Date(item.lastUpdated), 'dd MMM yyyy, hh:mm a') : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          disabled={!canManage}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openSellModal(item)}
                          disabled={!canManage}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ArrowDownRight size={14} />
                          Sell Out
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

      <FbfModals
        {...{
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
        }}
      />
    </div>
  );
}

