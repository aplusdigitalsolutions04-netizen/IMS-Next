"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Loader2, Users, Plus, Search, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import { clientsService } from "@/lib/services/clientsService";
import { hasPermission } from "@/lib/client/rbac";

export default function ClientMaster({ currentUser }) {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // "clientMaster" isn't a PROTECTED_EDIT_PERMISSIONS tab (see lib/auth.js) —
  // the view permission alone is enough to add/edit, same as Godown/Company
  // Master. Delete stays gated behind the separate Manage Roles checkbox.
  const canManage = hasPermission(currentUser, "clientMaster") || !!currentUser?.allow_edit_clientMaster;
  const canDelete = currentUser?.role === "Admin" || !!currentUser?.allow_delete_clientMaster;

  // `loading` already starts true (see useState above), so this doesn't need
  // to set it again on the initial call — a later refetch (after save/
  // delete) just silently swaps the list in instead of re-flashing the
  // spinner.
  const fetchClients = async () => {
    try {
      const data = await clientsService.getClients();
      setClients(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const filteredClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.gstNumber || "").toLowerCase().includes(q) ||
      (c.consigneeName || "").toLowerCase().includes(q)
    );
  }, [clients, searchTerm]);

  const openModal = (client = null) => router.push(client ? `/clientMaster/${client.guid}` : "/clientMaster/new");

  const handleDelete = async (client) => {
    const confirm = await Swal.fire({
      title: "Delete client?",
      text: `${client.name} will be removed from the client list.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, delete",
    });
    if (!confirm.isConfirmed) return;

    try {
      await clientsService.deleteClient(client.guid);
      Swal.fire("Deleted", "Client deleted successfully", "success");
      fetchClients();
    } catch (error) {
      Swal.fire("Error", error.response?.data?.message || error.message || "Failed to delete client", "error");
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
        <div className="border-b border-slate-100 bg-white px-5 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Client Master</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">Manage clients/buyers so New Dispatch can auto-fill their details.</p>
            </div>
            <button
              onClick={() => openModal()}
              disabled={!canManage}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            >
              <Plus size={18} />
              Add Client
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search client..."
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
        ) : filteredClients.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-500">
            <Users size={48} className="mb-4 text-slate-300" />
            <p className="text-lg font-semibold">No clients found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Client Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">GST Number</th>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Contact No.</th>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Platforms</th>
                  <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredClients.map((client) => (
                  <tr key={client.guid} className="transition hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Users size={16} className="text-indigo-500" />
                        {client.name}
                      </span>
                      {client.consigneeName && <p className="mt-0.5 pl-6 text-xs text-slate-400">Consignee: {client.consigneeName}</p>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{client.gstNumber || "-"}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{client.contactNumber || "-"}</td>
                    <td className="px-6 py-4">
                      {client.allowedPlatforms?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {client.allowedPlatforms.map((p) => (
                            <span key={p} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-100">{p}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-slate-400">All Platforms</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openModal(client)} disabled={!canManage} className="rounded-lg p-1.5 text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50" title="Edit">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete(client)} disabled={!canDelete} className="rounded-lg p-1.5 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50" title="Delete">
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
    </div>
  );
}
