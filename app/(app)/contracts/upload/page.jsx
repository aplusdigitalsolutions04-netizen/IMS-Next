"use client";
import React, { useState } from "react";
import { FileUp, ListChecks } from "lucide-react";
import ContractUpload from "@/components/contracts/ContractUpload";
import BulkContractUpload from "@/components/contracts/BulkContractUpload";

export default function ContractUploadPage() {
  const [mode, setMode] = useState("single");

  return (
    <div>
      <div className="flex justify-end mb-4">
        <div className="inline-flex bg-slate-100 border border-slate-200 rounded-xl p-1">
          <button
            onClick={() => setMode("single")}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              mode === "single" ? "bg-white shadow-sm text-indigo-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileUp size={14} /> Single Upload
          </button>
          <button
            onClick={() => setMode("bulk")}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              mode === "bulk" ? "bg-white shadow-sm text-indigo-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <ListChecks size={14} /> Upload Multiple
          </button>
        </div>
      </div>
      {mode === "single" ? <ContractUpload /> : <BulkContractUpload />}
    </div>
  );
}
