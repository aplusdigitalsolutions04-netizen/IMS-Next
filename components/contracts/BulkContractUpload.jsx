"use client";
import React, { useState, useRef } from "react";
import { UploadCloud, Loader2, CheckCircle2, XCircle, FileText, ListChecks } from "lucide-react";
import { contractsService } from "@/lib/services/contractsService";
import { useCompany } from "@/lib/client/CompanyContext";
import { normText, allGstNumbers, extractGstins } from "@/lib/companyMatch";
import ContractUpload from "./ContractUpload";

let nextQueueId = 1;

// Non-interactive counterpart of ContractUpload's checkSellerCompanyMatch —
// bulk mode can't pop a Swal per file and switch/create a company mid-batch
// (switchCompany() does a full page reload, which would wipe the whole
// queue), so a mismatch here is simply reported as a failure and left for
// the user to resolve one-by-one via the normal single "Upload Contract"
// flow, which still has the full switch/create handling.
const checkCompanyMatchSilently = (sellerCompany, sellerGstin, companyMatch, activeCompany) => {
  if (!activeCompany || (!sellerCompany && !sellerGstin)) return null;

  if (companyMatch && companyMatch.companyGuid !== activeCompany.guid && !companyMatch.userHasAccess) {
    return `Seller belongs to "${companyMatch.companyName}", which you don't have access to.`;
  }

  const activeGstNumbers = allGstNumbers(activeCompany);
  const sameByGstin = sellerGstin && activeGstNumbers.length > 0 && extractGstins(sellerGstin).some((g) => activeGstNumbers.includes(g));
  const sameByName = sellerCompany && activeCompany.name &&
    (normText(sellerCompany).includes(normText(activeCompany.name)) || normText(activeCompany.name).includes(normText(sellerCompany)));

  const hasComparableData = (sellerGstin && activeGstNumbers.length > 0) || sellerCompany;
  const matches = (sellerGstin && activeGstNumbers.length > 0) ? sameByGstin : sameByName;
  if (hasComparableData && !matches) {
    return `Seller company "${sellerCompany || "Unknown"}" doesn't match the active company "${activeCompany.name}".`;
  }
  return null;
};

export default function BulkContractUpload() {
  const { activeCompany } = useCompany();
  const [queue, setQueue] = useState([]); // {id, name, status, reason, data}
  const [activeId, setActiveId] = useState(null);
  const processingRef = useRef(false);

  const updateItem = (id, patch) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const processQueue = async (items) => {
    if (processingRef.current) return;
    processingRef.current = true;
    for (const item of items) {
      updateItem(item.id, { status: "extracting" });
      try {
        const { extracted: extractedData, pdfFilename, companyMatch, tokenUsage } = await contractsService.parseContractFile(item.file);
        const { products, contractNumber: extractedContractNumber, ...rest } = extractedData || {};
        const num = String(extractedContractNumber || "").trim();
        if (!num) {
          updateItem(item.id, { status: "failed", reason: "Could not find a Contract Number in this document." });
          continue;
        }

        const dup = await contractsService.checkContractNumberExists(num);
        if (dup.exists) {
          const reason = dup.reason === "order"
            ? `Already in Order Processing (status: ${dup.orderStatus}).`
            : "A contract with this Contract Number already exists.";
          updateItem(item.id, { status: "failed", reason });
          continue;
        }

        const mismatchReason = checkCompanyMatchSilently(rest.sellerCompany, rest.sellerGstin, companyMatch, activeCompany);
        if (mismatchReason) {
          updateItem(item.id, { status: "failed", reason: `${mismatchReason} Upload it individually via "Single Upload" to switch/create the right company.` });
          continue;
        }

        updateItem(item.id, {
          status: "ready",
          data: { form: { ...rest, contractNumber: num }, products, pdfFilename, tokenUsage, contractNumber: num },
        });
      } catch (err) {
        updateItem(item.id, { status: "failed", reason: err?.response?.data?.message || err.message || "Failed to extract contract data." });
      }
    }
    processingRef.current = false;
  };

  const handleFilesChosen = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const items = files.map((file) => ({ id: nextQueueId++, name: file.name, file, status: "pending", reason: "", data: null }));
    setQueue((prev) => [...prev, ...items]);
    processQueue(items);
    e.target.value = "";
  };

  const activeItem = queue.find((q) => q.id === activeId);

  const counts = queue.reduce((acc, q) => {
    acc[q.status] = (acc[q.status] || 0) + 1;
    return acc;
  }, {});
  const processingCount = (counts.pending || 0) + (counts.extracting || 0);

  if (activeItem && activeItem.status === "ready") {
    return (
      <ContractUpload
        key={activeItem.id}
        initialData={activeItem.data}
        onSaved={() => {
          updateItem(activeItem.id, { status: "saved" });
          setActiveId(null);
        }}
        onCancel={() => setActiveId(null)}
      />
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl shadow-md shadow-indigo-100 text-white">
          <ListChecks size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Upload Multiple Contracts</h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            Choose several contract files — each gets AI-extracted one by one, then you review and save it individually.
          </p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6">
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
          <UploadCloud size={12} /> Contract Files (PDF / Image)
        </label>
        <input
          type="file"
          multiple
          accept="application/pdf,image/*"
          onChange={handleFilesChosen}
          className="w-full text-sm text-slate-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:text-sm hover:file:bg-indigo-700 cursor-pointer transition-colors"
        />
      </div>

      {queue.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3 text-xs font-bold flex-wrap">
            <span className="text-slate-500">{queue.length} file{queue.length > 1 ? "s" : ""}</span>
            {counts.saved > 0 && <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">Saved: {counts.saved}</span>}
            {counts.ready > 0 && <span className="text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1">Ready to review: {counts.ready}</span>}
            {processingCount > 0 && <span className="text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-1">Processing: {processingCount}</span>}
            {counts.failed > 0 && <span className="text-rose-600 bg-rose-50 border border-rose-100 rounded-full px-2.5 py-1">Failed: {counts.failed}</span>}
          </div>

          <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {queue.map((q) => (
              <div key={q.id} className="flex items-center gap-3 px-4 py-3 bg-white">
                <FileText size={16} className="text-slate-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-700 truncate flex-1" title={q.name}>{q.name}</span>

                {q.status === "pending" && <span className="text-xs font-bold text-slate-400">Queued...</span>}

                {q.status === "extracting" && (
                  <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                    <Loader2 size={13} className="animate-spin" /> Extracting...
                  </span>
                )}

                {q.status === "ready" && (
                  <button
                    onClick={() => setActiveId(q.id)}
                    className="shrink-0 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Review &amp; Save
                  </button>
                )}

                {q.status === "saved" && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 shrink-0">
                    <CheckCircle2 size={13} /> Saved
                  </span>
                )}

                {q.status === "failed" && (
                  <span className="text-xs font-bold text-rose-600 flex items-center gap-1.5 text-right max-w-sm" title={q.reason}>
                    <XCircle size={13} className="shrink-0" /> {q.reason}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
