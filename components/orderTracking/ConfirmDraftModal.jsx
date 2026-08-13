"use client";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, Loader2, Search, ChevronDown, Box } from "lucide-react";
import { inventoryService } from "@/lib/services/inventoryService";

// Searchable serial-number picker — a plain text input that filters the
// available-serials list as you type, with a dropdown to click a match.
// The dropdown is portaled to <body> and positioned via the input's screen
// coordinates so it floats above the modal instead of being clipped by the
// modal's own overflow-y-auto scroll container.
function SerialSearchSelect({ value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => String(o.id || o.guid) === String(value));

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => String(o.value || o.serialNumber || "").toLowerCase().includes(term));
  }, [options, query]);

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return;
    const update = () => setRect(inputRef.current.getBoundingClientRect());
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const handleFocus = () => {
    setQuery("");
    setOpen(true);
  };

  const handleSelect = (opt) => {
    onChange(opt.id || opt.guid);
    setQuery("");
    setOpen(false);
  };

  const handleBlur = () => {
    // Delay so a click on an option registers before the list unmounts.
    setTimeout(() => setOpen(false), 150);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={open ? query : (selected?.value || selected?.serialNumber || "")}
          placeholder={disabled ? "Select model first" : "Search serial no."}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border border-slate-200 rounded-lg pl-8 pr-7 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
      {open && !disabled && rect && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width }}
          className="z-[100] max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">No matching serial numbers</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id || o.guid}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(o)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 text-slate-700"
              >
                {o.value || o.serialNumber}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// Draft orders are created from Contract data with no real serial numbers —
// each order_item just carries a product description + quantity. Before a
// draft can become an active order, every item needs a real model assigned.
// If that model is a serialized one (models.isSerialized), a real serial
// number is needed per unit; if the model is non-serialized (e.g. stationery
// / consumables), the item just needs its quantity confirmed and the
// catalog's stockQuantity gets decremented instead — no serial ever needed.
// This modal collects those selections and posts them to
// /api/orders/draft/:orderId/confirm.
export default function ConfirmDraftModal({ batch, models, serials, onClose, onConfirm }) {
  const items = batch?.items || [];

  // `models` (from GET /api/models) only ever contains serialized/trackable
  // items — non-serialized ones are filtered out server-side entirely — so
  // looking a non-serialized item's modelGuid up in it always misses,
  // isNonSerializedModel() always came back false, and every item (serial
  // or not) got funneled into the "needs a serial number" path. Fetch the
  // full Item Master catalog (both trackable and non-trackable) once here so
  // non-serialized items resolve correctly.
  const [fullCatalog, setFullCatalog] = useState([]);
  useEffect(() => {
    inventoryService.getCurrentStock({ limit: 2000 })
      .then((res) => setFullCatalog(Array.isArray(res?.data) ? res.data : []))
      .catch((err) => console.error("Failed to load item catalog:", err.message));
  }, []);

  const getModel = (modelGuid) => {
    const fromModels = models.find((m) => String(m.id || m.guid) === String(modelGuid));
    if (fromModels) return fromModels;
    const fromCatalog = fullCatalog.find((v) => String(v.itemVariantId) === String(modelGuid));
    return fromCatalog ? { id: fromCatalog.itemVariantId, guid: fromCatalog.itemVariantId, name: fromCatalog.variantName, isSerialized: !!fromCatalog.isTrackable } : undefined;
  };

  // `models` (serialized-only, from GET /api/models) misses any non-serialized
  // item — so if the draft's product is a non-serialized model, it never
  // appeared in the picker at all and there was no way to select it. Merge in
  // the full catalog (deduped by id) so every model, serialized or not, is pickable.
  const allPickableModels = useMemo(() => {
    const byId = new Map(models.map((m) => [String(m.id || m.guid), m]));
    fullCatalog.forEach((v) => {
      const id = String(v.itemVariantId);
      if (!byId.has(id)) {
        byId.set(id, { id: v.itemVariantId, guid: v.itemVariantId, name: v.variantName, isSerialized: !!v.isTrackable });
      }
    });
    return Array.from(byId.values());
  }, [models, fullCatalog]);
  const isNonSerializedModel = (modelGuid) => {
    const m = getModel(modelGuid);
    return !!m && (m.isSerialized === false || m.isSerialized === 0 || m.isSerialized === "0");
  };

  const [selections, setSelections] = useState(() => {
    const initial = {};
    items.forEach((item) => {
      const qty = Number(item.quantity) || 1;
      const prefilledModelGuid = item.modelId || item.modelGuid || "";
      initial[item.id || item.guid] = Array.from({ length: qty }, () => ({ modelGuid: prefilledModelGuid, serialGuid: "" }));
    });
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // `chosen` excludes serials already picked by OTHER unit slots (so the
  // same serial can't be double-assigned) — but a slot's *own* already-
  // picked serial must stay in its own options list, otherwise
  // SerialSearchSelect can never find it in `options` to display it, and
  // the input goes blank right after selecting (and stays unselectable on
  // re-open, since the "selected" serial isn't there to re-pick either).
  const availableSerialsByModel = useMemo(() => {
    const chosen = new Set();
    Object.values(selections).forEach((units) => units.forEach((u) => u.serialGuid && chosen.add(u.serialGuid)));
    return (modelGuid, ownSerialGuid) => serials.filter((s) => {
      const status = String(s.status || "").trim().toLowerCase();
      const serialModelId = s.modelId || s.modelGuid || s.itemVariantId;
      const sId = String(s.id || s.guid);
      const isOwn = ownSerialGuid && sId === String(ownSerialGuid);
      return String(serialModelId) === String(modelGuid) && status === "available" && (isOwn || !chosen.has(sId));
    });
  }, [serials, selections]);

  const updateUnit = (itemKey, index, field, value) => {
    setSelections((prev) => {
      const units = [...prev[itemKey]];
      units[index] = { ...units[index], [field]: value };
      if (field === "modelGuid") units[index].serialGuid = "";
      return { ...prev, [itemKey]: units };
    });
  };

  // Live available stock for a non-serialized item — same source used to
  // resolve model names, so this stays consistent with what the backend
  // will actually check on confirm (app/api/orders/draft/[orderId]/confirm/route.js).
  const getAvailableStock = (modelGuid) => {
    const entry = fullCatalog.find((v) => String(v.itemVariantId) === String(modelGuid));
    return entry ? Number(entry.availablePCS) || 0 : null;
  };

  const isComplete = items.every((item) => {
    const itemKey = item.id || item.guid;
    const units = selections[itemKey] || [];
    if (units.length === 0) return false;
    if (isNonSerializedModel(units[0].modelGuid)) {
      const modelGuid = units[0].modelGuid;
      if (!modelGuid) return false;
      const stock = getAvailableStock(modelGuid);
      return stock !== null && stock >= units.length;
    }
    return units.every((u) => u.modelGuid && u.serialGuid);
  });

  const handleSubmit = async () => {
    setError("");
    if (!isComplete) {
      setError("Please select a model (and serial number, for serialized models) for every item — non-serialized items also need enough stock available.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = items.map((item) => {
        const itemKey = item.id || item.guid;
        const units = selections[itemKey];
        const modelGuid = units[0].modelGuid;
        const nonSerialized = isNonSerializedModel(modelGuid);
        return {
          draftItemGuid: itemKey,
          modelGuid,
          nonSerialized,
          quantity: nonSerialized ? units.length : undefined,
          serialGuids: nonSerialized ? [] : units.map((u) => u.serialGuid),
        };
      });
      await onConfirm(payload);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to confirm order.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!batch) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-indigo-600" /> Confirm Draft Order
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <p className="text-sm text-slate-500">
            Confirm the model for each item. Serialized models need a serial number picked per unit; non-serialized models (stationery/consumables) just need the model confirmed — stock is deducted automatically. This order will move to Active once confirmed.
          </p>

          {items.map((item) => {
            const itemKey = item.id || item.guid;
            const units = selections[itemKey] || [];
            const nonSerialized = isNonSerializedModel(units[0]?.modelGuid);
            return (
              <div key={itemKey} className="border border-slate-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-slate-700 mb-3">{item.remarks || "Product"}</div>

                {nonSerialized ? (
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 flex items-center truncate" title={getModel(units[0].modelGuid)?.name}>
                      {getModel(units[0].modelGuid)?.name || "Model"}
                    </div>
                    {(() => {
                      const stock = getAvailableStock(units[0].modelGuid);
                      const insufficient = stock !== null && stock < units.length;
                      return (
                        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 border ${
                          insufficient ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200"
                        }`}>
                          <Box size={13} /> Non-Serialized — Qty {units.length}
                          {stock !== null && (
                            <span className="opacity-80">
                              {insufficient ? ` — only ${stock} in stock` : ` (${stock} in stock)`}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {units.map((unit, idx) => {
                      const resolvedModel = getModel(unit.modelGuid);
                      const modelName = resolvedModel?.name;
                      return (
                        <div key={idx} className="grid grid-cols-2 gap-3">
                          {unit.modelGuid && resolvedModel ? (
                            <div className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 flex items-center truncate" title={modelName}>
                              {modelName || "Model"}
                            </div>
                          ) : (
                            <select
                              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                              value={unit.modelGuid}
                              onChange={(e) => updateUnit(itemKey, idx, "modelGuid", e.target.value)}
                            >
                              <option value="">Select Model</option>
                              {allPickableModels.map((m) => (
                                <option key={m.id || m.guid} value={m.id || m.guid}>{m.name}</option>
                              ))}
                            </select>
                          )}
                          <SerialSearchSelect
                            value={unit.serialGuid}
                            disabled={!unit.modelGuid}
                            options={availableSerialsByModel(unit.modelGuid, unit.serialGuid)}
                            onChange={(serialGuid) => updateUnit(itemKey, idx, "serialGuid", serialGuid)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !isComplete}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {submitting ? "Confirming..." : "Confirm & Move to Active"}
          </button>
        </div>
      </div>
    </div>
  );
}
