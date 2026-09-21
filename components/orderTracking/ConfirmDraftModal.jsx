"use client";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, Loader2, Save, Search, ChevronDown, Box, Plus, Trash2 } from "lucide-react";
import { inventoryService } from "@/lib/services/inventoryService";
import { ordersService } from "@/lib/services/ordersService";

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
export default function ConfirmDraftModal({ batch, orderId, models, serials, onClose, onConfirm, onSaveSelections }) {
  const items = batch?.items || [];

  // `models` (from GET /api/models) only ever contains serialized/trackable
  // items — non-serialized ones are filtered out server-side entirely — so
  // looking a non-serialized item's modelGuid up in it always misses,
  // isNonSerializedModel() always came back false, and every item (serial
  // or not) got funneled into the "needs a serial number" path. Fetch the
  // full Item Master catalog (both trackable and non-trackable) once here so
  // non-serialized items resolve correctly.
  const [fullCatalog, setFullCatalog] = useState([]);
  // Until this resolves, a non-serialized item's model can't be found in
  // either `models` or `fullCatalog` yet — isNonSerializedModel() would
  // wrongly default it to "serialized" for that first render, flashing the
  // wrong (serial-number) picker before flipping to the right one. Gate
  // rendering on this instead of racing it.
  const [catalogLoading, setCatalogLoading] = useState(true);
  useEffect(() => {
    inventoryService.getCurrentStock({ limit: 2000 })
      .then((res) => setFullCatalog(Array.isArray(res?.data) ? res.data : []))
      .catch((err) => console.error("Failed to load item catalog:", err.message))
      .finally(() => setCatalogLoading(false));
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
  const [savingSelections, setSavingSelections] = useState(false);
  const [error, setError] = useState("");

  // Picks made on an earlier visit via "Save" (see handleSave below) —
  // reserved serials sit at serialStatus='Reserved', not 'Available', so
  // they need to be re-merged into this draft's own picker options (below)
  // instead of just vanishing because they're no longer technically
  // "available" to anyone else.
  const [loadingReservations, setLoadingReservations] = useState(!!orderId);
  const [reservedSerialGuidsMine, setReservedSerialGuidsMine] = useState(new Set());
  useEffect(() => {
    if (!orderId) return;
    ordersService.getDraftSelections(orderId)
      .then((byItem) => {
        const mine = new Set();
        setSelections((prev) => {
          const next = { ...prev };
          Object.entries(byItem).forEach(([draftItemGuid, units]) => {
            if (!next[draftItemGuid] || units.length === 0) return;
            const sorted = [...units].sort((a, b) => a.unitIndex - b.unitIndex);
            next[draftItemGuid] = sorted.map((u) => {
              if (u.serialGuid) mine.add(String(u.serialGuid));
              return { modelGuid: u.modelGuid || "", serialGuid: u.serialGuid || "" };
            });
          });
          return next;
        });
        setReservedSerialGuidsMine(mine);
      })
      .catch((err) => console.error("Failed to load saved selections:", err.message))
      .finally(() => setLoadingReservations(false));
  }, [orderId]);

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
      // A serial this same draft already reserved via a previous "Save" sits
      // at status 'Reserved' (not 'Available') everywhere else in the app —
      // still pickable here, since it's this draft's own reservation.
      const isAvailableToMe = status === "available" || (status === "reserved" && reservedSerialGuidsMine.has(sId));
      return String(serialModelId) === String(modelGuid) && isAvailableToMe && (isOwn || !chosen.has(sId));
    });
  }, [serials, selections, reservedSerialGuidsMine]);

  const updateUnit = (itemKey, index, field, value) => {
    setSelections((prev) => {
      const units = [...prev[itemKey]];
      units[index] = { ...units[index], [field]: value };
      if (field === "modelGuid") units[index].serialGuid = "";
      return { ...prev, [itemKey]: units };
    });
  };

  // Non-serialized items are represented as N identical {modelGuid} slots
  // (one per unit, no serial needed) — changing the model applies to all of
  // them at once, and changing quantity just grows/shrinks the array.
  const updateNonSerializedModel = (itemKey, modelGuid) => {
    setSelections((prev) => ({
      ...prev,
      [itemKey]: prev[itemKey].map(() => ({ modelGuid, serialGuid: "" })),
    }));
  };

  const updateNonSerializedQty = (itemKey, newCount) => {
    setSelections((prev) => {
      const units = [...prev[itemKey]];
      const modelGuid = units[0]?.modelGuid || "";
      if (newCount > units.length) {
        while (units.length < newCount) units.push({ modelGuid, serialGuid: "" });
      } else {
        units.length = Math.max(1, newCount);
      }
      return { ...prev, [itemKey]: units };
    });
  };

  // Serialized items need one slot per physical unit; add/remove a slot to
  // change how many units of this line are being dispatched.
  const addSerialUnit = (itemKey) => {
    setSelections((prev) => ({ ...prev, [itemKey]: [...prev[itemKey], { modelGuid: "", serialGuid: "" }] }));
  };

  const removeSerialUnit = (itemKey, idx) => {
    setSelections((prev) => {
      const units = prev[itemKey].filter((_, i) => i !== idx);
      return { ...prev, [itemKey]: units.length ? units : [{ modelGuid: "", serialGuid: "" }] };
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

  // Persists whatever's picked so far without confirming — unlike Confirm,
  // this is allowed to be partial (no isComplete gate): a serialized item
  // only reserves the unit slots that already have both a model AND a
  // serial picked, so a still-empty slot just doesn't get saved instead of
  // blocking the save for every other item that IS ready.
  const handleSave = async () => {
    setError("");
    // Every item is sent, even ones with no picks yet — the backend releases
    // whatever a draft item had reserved before re-saving its (possibly now
    // empty) picks, so a cleared-out item's old reservation actually gets
    // freed instead of lingering forever because it got filtered out here.
    const payload = items.map((item) => {
      const itemKey = item.id || item.guid;
      const units = selections[itemKey] || [];
      const modelGuid = units[0]?.modelGuid;
      const nonSerialized = modelGuid && isNonSerializedModel(modelGuid);
      return {
        draftItemGuid: itemKey,
        units: nonSerialized
          ? (modelGuid ? [{ modelGuid, quantity: units.length }] : [])
          : units.filter((u) => u.modelGuid && u.serialGuid).map((u) => ({ modelGuid: u.modelGuid, serialGuid: u.serialGuid })),
      };
    });

    const hasAnyPick = payload.some((entry) => entry.units.length > 0);
    if (!hasAnyPick && reservedSerialGuidsMine.size === 0) {
      setError("Pick at least one model (and serial number, for serialized models) before saving.");
      return;
    }

    setSavingSelections(true);
    try {
      await onSaveSelections(payload);
      // Reflect the save immediately, replacing the previously-loaded set —
      // these picked serials are this draft's own reservation now (status
      // 'Reserved' server-side) and must stay selectable here even if a
      // background data refresh lands before this saves and shows them as
      // just 'Reserved' with no way to tell they're this draft's own.
      const freshlyReserved = new Set();
      payload.forEach((entry) => entry.units.forEach((u) => u.serialGuid && freshlyReserved.add(String(u.serialGuid))));
      setReservedSerialGuidsMine(freshlyReserved);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to save selections.");
    } finally {
      setSavingSelections(false);
    }
  };

  if (!batch) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
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
            Pick a model (and serial number, for serialized items) per unit. Not ready to confirm yet? Use <span className="font-semibold text-indigo-600">Save (Keep as Draft)</span> — your picks are kept and the serials reserved, but the order stays in Draft until you hit Confirm.
          </p>

          {catalogLoading || loadingReservations ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading item catalog…
            </div>
          ) : items.map((item) => {
            const itemKey = item.id || item.guid;
            const units = selections[itemKey] || [];
            const nonSerialized = isNonSerializedModel(units[0]?.modelGuid);
            return (
              <div key={itemKey} className="border border-slate-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-slate-700 mb-3">{item.remarks || "Product"}</div>

                {nonSerialized ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      className="flex-1 min-w-[180px] border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      value={units[0]?.modelGuid || ""}
                      onChange={(e) => updateNonSerializedModel(itemKey, e.target.value)}
                    >
                      <option value="">Select Model</option>
                      {allPickableModels.map((m) => (
                        <option key={m.id || m.guid} value={m.id || m.guid}>{m.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={units.length}
                      onChange={(e) => updateNonSerializedQty(itemKey, parseInt(e.target.value, 10) || 1)}
                      className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      title="Quantity"
                    />
                    {(() => {
                      const stock = getAvailableStock(units[0]?.modelGuid);
                      const insufficient = stock !== null && stock < units.length;
                      return (
                        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 border ${
                          insufficient ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200"
                        }`}>
                          <Box size={13} /> Non-Serialized
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
                    {units.map((unit, idx) => (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          value={unit.modelGuid}
                          onChange={(e) => updateUnit(itemKey, idx, "modelGuid", e.target.value)}
                        >
                          <option value="">Select Model</option>
                          {allPickableModels.map((m) => (
                            <option key={m.id || m.guid} value={m.id || m.guid}>{m.name}</option>
                          ))}
                        </select>
                        <SerialSearchSelect
                          value={unit.serialGuid}
                          disabled={!unit.modelGuid}
                          options={availableSerialsByModel(unit.modelGuid, unit.serialGuid)}
                          onChange={(serialGuid) => updateUnit(itemKey, idx, "serialGuid", serialGuid)}
                        />
                        <button
                          type="button"
                          onClick={() => removeSerialUnit(itemKey, idx)}
                          disabled={units.length <= 1}
                          title="Remove this unit"
                          className="text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed px-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addSerialUnit(itemKey)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      <Plus size={14} /> Add unit
                    </button>
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
          {onSaveSelections && (
            <button
              onClick={handleSave}
              disabled={submitting || savingSelections || catalogLoading || loadingReservations}
              title="Save these picks without confirming — the order stays in Draft, and picked serials are reserved so no other order can take them"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingSelections ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {savingSelections ? "Saving..." : "Save (Keep as Draft)"}
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || savingSelections || catalogLoading || !isComplete}
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
