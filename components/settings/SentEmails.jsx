"use client";
import React, { useEffect, useState } from "react";
import { Send, Loader2, CheckCircle2, Clock, Bell } from "lucide-react";
import Swal from "sweetalert2";
import api from "@/lib/client/apiClient";

function daysSince(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDate(val) {
  if (!val) return "-";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function SentEmails() {
  const [emails, setEmails] = useState([]);
  const [purposes, setPurposes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remindingGuid, setRemindingGuid] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [logRes, purpRes] = await Promise.all([api.get("/email-sent-log"), api.get("/email-purposes")]);
      setEmails(logRes.data?.data || []);
      setPurposes(purpRes.data?.data || []);
    } catch (err) {
      console.error("Failed to load sent emails:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const purposeLabel = (key) => purposes.find((p) => p.purposeKey === key)?.label || key;

  const handleRemind = async (email) => {
    const confirm = await Swal.fire({
      title: "Send reminder?",
      html: `Resend "<b>${email.subject || "(no subject)"}</b>" to <b>${email.toAddress}</b> right now?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Send Now",
    });
    if (!confirm.isConfirmed) return;

    setRemindingGuid(email.guid);
    try {
      await api.post(`/email-sent-log/${email.guid}/remind`);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Reminder sent", timer: 1800, showConfirmButton: false });
      await load();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || "Failed to send reminder", "error");
    } finally {
      setRemindingGuid(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
            <Send className="text-indigo-600" size={24} /> Sent Emails
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Every email sent by the app. Nothing resends automatically — pick any email below and click "Send Reminder" whenever you decide it needs one.
            Reply status only updates for purposes with an IMAP-enabled Email Account (see Email Inbox).
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-indigo-600" size={26} />
        </div>
      ) : emails.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No emails sent yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">To</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Subject</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Purpose</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Company</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Sent</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Reply Status</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Reminders</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {emails.map((email) => (
                <tr key={email.guid} className="hover:bg-slate-50">
                  <td className="p-3 whitespace-nowrap font-semibold text-slate-700">{email.toAddress}</td>
                  <td className="p-3 max-w-[220px] truncate text-slate-600" title={email.subject}>{email.subject || "-"}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600">{purposeLabel(email.purpose)}</span>
                  </td>
                  <td className="p-3 whitespace-nowrap text-slate-500">{email.companyName || <span className="text-slate-400">All companies</span>}</td>
                  <td className="p-3 whitespace-nowrap text-slate-500">
                    <div className="text-xs">{formatDate(email.sentAt)}</div>
                    <div className="text-[11px] text-slate-400">{daysSince(email.sentAt)}d ago</div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {email.repliedAt ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1 w-fit">
                        <CheckCircle2 size={12} /> Replied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-1 w-fit">
                        <Clock size={12} /> No reply yet
                      </span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap text-slate-500">
                    {email.remindersSent > 0 ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-amber-700">
                        <Bell size={12} /> {email.remindersSent} sent
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <button
                      onClick={() => handleRemind(email)}
                      disabled={remindingGuid === email.guid}
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {remindingGuid === email.guid ? <Loader2 className="animate-spin" size={13} /> : <Bell size={13} />}
                      Send Reminder
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
