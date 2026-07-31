"use client";
import React, { useEffect, useRef, useState } from "react";
import { Inbox, RefreshCw, Loader2, Mail, MailOpen, AlertCircle } from "lucide-react";
import api from "@/lib/client/apiClient";

const POLL_INTERVAL_MS = 60000;

function formatDate(val) {
  if (!val) return "-";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function EmailInbox() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [selected, setSelected] = useState(null);
  const [pollNote, setPollNote] = useState("");
  const timerRef = useRef(null);

  const loadMessages = async () => {
    try {
      const res = await api.get("/email-inbox");
      setMessages(res.data?.data || []);
    } catch (err) {
      console.error("Failed to load inbox:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePoll = async () => {
    setPolling(true);
    setPollNote("");
    try {
      const res = await api.post("/email-inbox/poll");
      const results = res.data?.results || [];
      const totalNew = results.reduce((sum, r) => sum + (r.newMessages || 0), 0);
      const failed = results.filter((r) => !r.ok);
      if (results.length === 0) {
        setPollNote("No IMAP-enabled accounts configured yet — enable one under Email Accounts.");
      } else if (failed.length > 0) {
        setPollNote(`${failed.length} account(s) failed: ${failed.map((f) => `${f.accountName} (${f.error})`).join("; ")}`);
      } else {
        setPollNote(`Checked ${results.length} account(s) — ${totalNew} new message(s).`);
      }
      await loadMessages();
    } catch (err) {
      setPollNote(err?.response?.data?.message || "Failed to poll inbox");
    } finally {
      setPolling(false);
    }
  };

  useEffect(() => {
    loadMessages();
    handlePoll();
    timerRef.current = setInterval(handlePoll, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openMessage = async (msg) => {
    setSelected(msg);
    if (!msg.isRead) {
      try {
        await api.put(`/email-inbox/${msg.guid}/read`, { isRead: true });
        setMessages((prev) => prev.map((m) => (m.guid === msg.guid ? { ...m, isRead: 1 } : m)));
      } catch (err) {
        console.error("Failed to mark read:", err);
      }
    }
  };

  const unreadCount = messages.filter((m) => !m.isRead).length;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
            <Inbox className="text-indigo-600" size={24} /> Email Inbox
            {unreadCount > 0 && (
              <span className="text-xs font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">{unreadCount} unread</span>
            )}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Replies received on IMAP-enabled Email Accounts. Checked automatically every minute while this page is open, or click Refresh.
          </p>
        </div>
        <button
          onClick={handlePoll}
          disabled={polling}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md shadow-indigo-100 shrink-0"
        >
          {polling ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Refresh
        </button>
      </div>

      {pollNote && (
        <div className="flex items-start gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {pollNote}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-indigo-600" size={26} />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No messages yet. Enable IMAP on an Email Account, then click Refresh.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,360px)_1fr] gap-4 h-[560px]">
          <div className="overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {messages.map((msg) => (
              <button
                key={msg.guid}
                onClick={() => openMessage(msg)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  selected?.guid === msg.guid ? "bg-indigo-50" : "hover:bg-slate-50"
                } ${!msg.isRead ? "bg-white" : "bg-slate-50/50"}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-sm truncate ${!msg.isRead ? "font-black text-slate-800" : "font-semibold text-slate-500"}`}>
                    {msg.fromName || msg.fromAddress || "Unknown sender"}
                  </span>
                  {!msg.isRead ? <Mail size={13} className="text-indigo-600 shrink-0" /> : <MailOpen size={13} className="text-slate-300 shrink-0" />}
                </div>
                <p className={`text-xs truncate ${!msg.isRead ? "font-bold text-slate-700" : "text-slate-500"}`}>{msg.subject || "(no subject)"}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{msg.accountName}</span>
                  <span className="text-[10px] text-slate-400">{formatDate(msg.receivedAt)}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Select a message to read it</div>
            ) : (
              <>
                <div className="p-4 border-b border-slate-100 shrink-0">
                  <h3 className="text-base font-black text-slate-800 mb-1">{selected.subject || "(no subject)"}</h3>
                  <p className="text-xs text-slate-500">
                    From <span className="font-semibold text-slate-700">{selected.fromName ? `${selected.fromName} <${selected.fromAddress}>` : selected.fromAddress}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(selected.receivedAt)} · via {selected.accountName}</p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {selected.bodyHtml ? (
                    <iframe title="email-body" sandbox="" srcDoc={selected.bodyHtml} className="w-full h-full min-h-[400px] border-0" />
                  ) : (
                    <div className="p-4 text-sm text-slate-700 whitespace-pre-wrap">{selected.bodyText || "(empty message)"}</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
