"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, ChevronRight, MailCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import api from "@/lib/client/apiClient";

// Dashboard card for the email inbox: unread / today counts and the latest
// few messages. Read-only; opening, replying and marking read all happen in
// the Email Inbox page.
export default function MailWidget() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get("/email-inbox/summary").then((res) => setData(res.data)).catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  if (!data) return <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 h-[88px] animate-pulse" />;

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <Mail size={14} className="text-indigo-500" /> Mail Inbox
          {data.unread > 0 && (
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5 normal-case tracking-normal">{data.unread.toLocaleString("en-IN")} unread</span>
          )}
          {data.today > 0 && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5 normal-case tracking-normal">{data.today} today</span>
          )}
        </h3>
        <button onClick={() => router.push("/emailInbox")} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-0.5">
          Open inbox <ChevronRight size={12} />
        </button>
      </div>

      {data.latest.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-500">
          <MailCheck size={14} className="shrink-0" /> No mails yet.
        </div>
      ) : (
        <div className="space-y-2">
          {data.latest.map((m) => (
            <button
              key={m.guid}
              onClick={() => router.push("/emailInbox")}
              className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs border hover:opacity-80 transition-opacity ${m.isRead ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-indigo-50/60 border-indigo-100 text-slate-800"}`}
            >
              <span className="min-w-0 flex items-center gap-2">
                {!m.isRead && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />}
                <span className="min-w-0">
                  <span className={`block truncate ${m.isRead ? "font-semibold" : "font-bold"}`}>{m.fromName || m.fromAddress}</span>
                  <span className="block truncate text-[11px] text-slate-500 font-medium">{m.subject || "(no subject)"}</span>
                </span>
              </span>
              <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                {m.receivedAt ? formatDistanceToNow(new Date(m.receivedAt), { addSuffix: true }) : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
