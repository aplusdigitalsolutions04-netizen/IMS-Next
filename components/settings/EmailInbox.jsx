"use client";
import React, { useEffect, useRef, useState } from "react";
import { Inbox, Send, RefreshCw, Loader2, Mail, MailOpen, AlertCircle, ArrowLeft, Pencil } from "lucide-react";
import api from "@/lib/client/apiClient";
import ComposeEmailModal from "./ComposeEmailModal";

// Each tick opens a fresh IMAP connect+login+logout (see lib/imapReader.js —
// there's no persistent/IDLE connection, just plain polling), so this
// interval directly sets how many real logins per hour a shared mailbox
// sees just from one tab being left open. 60s meant 60 logins/hour, which
// is aggressive enough that a shared-hosting provider's anti-abuse
// throttling (Hostinger included) can start dropping the connection —
// looking like it "works once, then keeps disconnecting" even with a single
// user. 5 minutes keeps that well below typical thresholds while still
// checking mail often enough; the Refresh button covers "I need it now".
const POLL_INTERVAL_MS = 300000;

function formatDate(val) {
  if (!val) return "-";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// /api/email-accounts already only returns accounts this user added (or
// every account, for Admin) — there's nothing left to hide/lock client-side
// here, the picker just shows whatever the API handed back.
export default function EmailInbox() {
  const [activeTab, setActiveTab] = useState("inbox"); // 'inbox' | 'sent'
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  // Land on "pick an account" first (like folders) rather than dumping every
  // account's mail into one combined list — clicking one filters down to
  // just that account's inbox/sent.
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sentEmails, setSentEmails] = useState([]);
  const [sentLoaded, setSentLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [selected, setSelected] = useState(null);
  const [pollNote, setPollNote] = useState("");
  const [accountsError, setAccountsError] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const timerRef = useRef(null);

  const loadAccounts = async () => {
    setAccountsLoading(true);
    setAccountsError("");
    try {
      const res = await api.get("/email-accounts");
      setAccounts(res.data?.data || []);
    } catch (err) {
      console.error("Failed to load email accounts:", err);
      setAccountsError(err?.response?.data?.message || "Could not load email accounts.");
    } finally {
      setAccountsLoading(false);
    }
  };

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

  const loadSentEmails = async () => {
    setLoading(true);
    try {
      const res = await api.get("/email-sent-log");
      setSentEmails(res.data?.data || []);
      setSentLoaded(true);
    } catch (err) {
      console.error("Failed to load sent emails:", err);
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSelected(null);
    if (tab === "sent" && !sentLoaded) loadSentEmails();
  };

  const openAccount = (account) => {
    setSelectedAccount(account);
    setSelected(null);
  };

  const backToAccounts = () => {
    setSelectedAccount(null);
    setSelected(null);
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
    loadAccounts();
    loadMessages();
    handlePoll();
    timerRef.current = setInterval(handlePoll, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openMessage = async (msg) => {
    setSelected(msg);
    if (activeTab === "inbox" && !msg.isRead) {
      try {
        await api.put(`/email-inbox/${msg.guid}/read`, { isRead: true });
        setMessages((prev) => prev.map((m) => (m.guid === msg.guid ? { ...m, isRead: 1 } : m)));
      } catch (err) {
        console.error("Failed to mark read:", err);
      }
    }
  };

  const unreadCount = messages.filter((m) => !m.isRead).length;
  // Sent emails are now tagged with the exact account they went out
  // through (lib/mailer.js records emailAccountGuid on every send) — used
  // to match on "purpose" instead, which broke as soon as two accounts
  // shared one purpose (nothing stops that): both accounts' Sent tabs
  // showed the same combined list. Older rows sent before this column
  // existed have no guid and simply won't appear under any one account.
  const list = !selectedAccount
    ? []
    : activeTab === "inbox"
    ? messages.filter((m) => m.emailAccountGuid === selectedAccount.guid)
    : sentEmails.filter((e) => e.emailAccountGuid === selectedAccount.guid);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
            <Inbox className="text-indigo-600" size={24} /> Email Inbox
            {unreadCount > 0 && (
              <span className="text-xs font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">{unreadCount} unread</span>
            )}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {activeTab === "inbox"
              ? "Replies received on IMAP-enabled Email Accounts. Checked automatically every minute while this page is open, or click Refresh."
              : "Every email sent by the app."}
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

      <div className="flex items-center gap-2 mb-4 border-b border-slate-200">
        <button
          onClick={() => switchTab("inbox")}
          className={`flex items-center gap-1.5 text-sm font-bold px-4 py-2 -mb-px border-b-2 transition-colors ${
            activeTab === "inbox" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Inbox size={15} /> Inbox
        </button>
        <button
          onClick={() => switchTab("sent")}
          className={`flex items-center gap-1.5 text-sm font-bold px-4 py-2 -mb-px border-b-2 transition-colors ${
            activeTab === "sent" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Send size={15} /> Sent
        </button>
      </div>

      {pollNote && activeTab === "inbox" && (
        <div className="flex items-start gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {pollNote}
        </div>
      )}

      {!selectedAccount ? (
        accountsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo-600" size={26} />
          </div>
        ) : accountsError ? (
          <div className="flex items-start gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /> {accountsError}
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No email accounts configured yet — add one under Settings &gt; Email Accounts.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((acc) => {
              const count = activeTab === "inbox"
                ? messages.filter((m) => m.emailAccountGuid === acc.guid && !m.isRead).length
                : sentEmails.filter((e) => e.emailAccountGuid === acc.guid).length;
              return (
                <button
                  key={acc.guid}
                  onClick={() => openAccount(acc)}
                  className="text-left border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 rounded-2xl p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-black text-slate-800 truncate">{acc.accountName}</span>
                    {activeTab === "inbox" && count > 0 && (
                      <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full shrink-0">{count} unread</span>
                    )}
                    {activeTab === "sent" && count > 0 && (
                      <span className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full shrink-0">{count} sent</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{acc.fromEmail}</p>
                  {!acc.isActive && <p className="text-[10px] font-bold text-slate-400 mt-1">Inactive</p>}
                </button>
              );
            })}
          </div>
        )
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-indigo-600" size={26} />
        </div>
      ) : list.length === 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={backToAccounts} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600">
              <ArrowLeft size={14} /> Back to Accounts
            </button>
            <button
              onClick={() => setShowCompose(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Pencil size={12} /> Compose
            </button>
          </div>
          <div className="text-center py-12 text-slate-400 text-sm">
            {activeTab === "inbox" ? "No messages yet for this account. Enable IMAP on it, then click Refresh." : "No emails sent from this account yet."}
          </div>
        </div>
      ) : selected ? (
        // Full page for the opened message — no split view, just this and a
        // way back to the list.
        <div className="rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[560px]">
          <div className="p-4 border-b border-slate-100 shrink-0">
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 mb-2"
            >
              <ArrowLeft size={14} /> Back to {activeTab === "sent" ? "Sent" : "Inbox"}
            </button>
            <h3 className="text-base font-black text-slate-800 mb-1">{selected.subject || "(no subject)"}</h3>
            {activeTab === "sent" ? (
              <>
                <p className="text-xs text-slate-500">
                  To <span className="font-semibold text-slate-700">{selected.toAddress}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{formatDate(selected.sentAt)} · {selected.purpose}</p>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  From <span className="font-semibold text-slate-700">{selected.fromName ? `${selected.fromName} <${selected.fromAddress}>` : selected.fromAddress}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{formatDate(selected.receivedAt)} · via {selected.accountName}</p>
              </>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {activeTab === "sent" ? (
              <div className="p-4 text-sm text-slate-700 whitespace-pre-wrap">{selected.body || "(empty message)"}</div>
            ) : selected.bodyHtml ? (
              <iframe title="email-body" sandbox="" srcDoc={selected.bodyHtml} className="w-full h-full min-h-[400px] border-0" />
            ) : (
              <div className="p-4 text-sm text-slate-700 whitespace-pre-wrap">{selected.bodyText || "(empty message)"}</div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={backToAccounts} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600">
              <ArrowLeft size={14} /> Back to Accounts
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">{selectedAccount.accountName}</span>
              <button
                onClick={() => setShowCompose(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Pencil size={12} /> Compose
              </button>
            </div>
          </div>
          <div className="h-[560px] overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {list.map((item) => {
            const isSent = activeTab === "sent";
            const key = item.guid;
            const title = isSent ? item.toAddress : (item.fromName || item.fromAddress || "Unknown sender");
            const dateVal = isSent ? item.sentAt : item.receivedAt;
            return (
              <button
                key={key}
                onClick={() => openMessage(item)}
                className={`w-full text-left px-4 py-3 transition-colors hover:bg-slate-50 ${isSent || item.isRead ? "bg-slate-50/50" : "bg-white"}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-sm truncate ${!isSent && !item.isRead ? "font-black text-slate-800" : "font-semibold text-slate-500"}`}>
                    {isSent ? `To: ${title}` : title}
                  </span>
                  {!isSent && (!item.isRead ? <Mail size={13} className="text-indigo-600 shrink-0" /> : <MailOpen size={13} className="text-slate-300 shrink-0" />)}
                </div>
                <p className={`text-xs truncate ${!isSent && !item.isRead ? "font-bold text-slate-700" : "text-slate-500"}`}>{item.subject || "(no subject)"}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{isSent ? item.purpose : item.accountName}</span>
                  <span className="text-[10px] text-slate-400">{formatDate(dateVal)}</span>
                </div>
              </button>
            );
            })}
          </div>
        </div>
      )}

      {showCompose && selectedAccount && (
        <ComposeEmailModal
          account={selectedAccount}
          onClose={() => setShowCompose(false)}
          onSent={() => { setSentLoaded(false); if (activeTab === "sent") loadSentEmails(); }}
        />
      )}
    </div>
  );
}
