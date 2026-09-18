"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Send, Loader2, CheckCircle2, Clock, Bell, Search } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const [expandedGuid, setExpandedGuid] = useState(null);

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

  // Searches everything about the email, not just the To/Subject shown in
  // the collapsed row — the body is where a GeM bid/contract number, model
  // name, or anything else specific to that email actually lives, and the
  // date is searchable both as MySQL stores it (ISO, e.g. "2026-08-27") and
  // as it's displayed (formatDate's "27 Aug 2026") so typing either finds it.
  const filteredEmails = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter((email) =>
      (email.toAddress || "").toLowerCase().includes(q) ||
      (email.subject || "").toLowerCase().includes(q) ||
      (email.body || "").toLowerCase().includes(q) ||
      purposeLabel(email.purpose).toLowerCase().includes(q) ||
      (email.companyName || "").toLowerCase().includes(q) ||
      (email.sentAt || "").toLowerCase().includes(q) ||
      formatDate(email.sentAt).toLowerCase().includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails, query, purposes]);

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
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
            <Send className="text-indigo-600" size={24} /> Sent Emails
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Every email sent by the app. Nothing resends automatically — pick any email below and click &quot;Send Reminder&quot; whenever you decide it needs one.
            Reply status only updates for purposes with an IMAP-enabled Email Account (see Email Inbox).
          </p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search mail"
          className="w-full max-w-md pl-11 pr-4 py-2.5 rounded-full border border-slate-200 bg-slate-50 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-indigo-600" size={26} />
        </div>
      ) : filteredEmails.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          {emails.length === 0 ? "No emails sent yet." : "No emails match your search."}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {filteredEmails.map((email) => {
            const isOpen = expandedGuid === email.guid;
            return (
            <div key={email.guid}>
              <div
                onClick={() => setExpandedGuid((g) => (g === email.guid ? null : email.guid))}
                className="px-4 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-sm font-bold text-slate-800 truncate">To: {email.toAddress}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {email.repliedAt ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        <CheckCircle2 size={11} /> Replied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                        <Clock size={11} /> No reply yet
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 whitespace-nowrap">{formatDate(email.sentAt)} · {daysSince(email.sentAt)}d ago</span>
                  </div>
                </div>
                <p className="text-sm text-slate-600 truncate mb-1.5">{email.subject || "(no subject)"}</p>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-600">{purposeLabel(email.purpose)}</span>
                    <span className="text-[11px] text-slate-400">{email.companyName || "All companies"}</span>
                    {email.remindersSent > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
                        <Bell size={11} /> {email.remindersSent} reminder{email.remindersSent !== 1 ? "s" : ""} sent
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemind(email); }}
                    disabled={remindingGuid === email.guid}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    {remindingGuid === email.guid ? <Loader2 className="animate-spin" size={13} /> : <Bell size={13} />}
                    Send Reminder
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="px-4 pb-4 -mt-1">
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {email.body || <span className="text-slate-400 italic">(empty message)</span>}
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
