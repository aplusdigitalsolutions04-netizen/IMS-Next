import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, authorizeOrdersRequest } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

// Combined sent + reply history for one order — `id` here is orders.guid
// (matching EmailComposeTab's own `orderGuid` prop), not order_items.guid
// like some of this folder's sibling routes use. A reply is matched purely
// by its own In-Reply-To/References Message-ID chain back to a sent row
// (see lib/imapReader.js) — never by "same address" — so it still shows up
// here even when the reply doesn't come back from the exact address the
// original was sent to.
export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeOrdersRequest(user, "GET", new URL(request.url).pathname, null);
  const { id: orderGuid } = await params;

  const [sent] = await mysqlPool.query(
    `SELECT guid, toAddress, subject, body, purpose, sentAt, repliedAt, remindersSent
     FROM email_sent_log WHERE orderGuid = ? AND companyGuid = ? ORDER BY sentAt DESC`,
    [orderGuid, user.companyId]
  );

  let replies = [];
  if (sent.length > 0) {
    [replies] = await mysqlPool.query(
      `SELECT guid, repliedToSentLogGuid, fromAddress, fromName, subject, bodyText, bodyHtml, receivedAt
       FROM email_messages WHERE repliedToSentLogGuid IN (?) ORDER BY receivedAt ASC`,
      [sent.map((s) => s.guid)]
    );
  }

  const repliesBySentGuid = new Map();
  for (const r of replies) {
    if (!repliesBySentGuid.has(r.repliedToSentLogGuid)) repliesBySentGuid.set(r.repliedToSentLogGuid, []);
    repliesBySentGuid.get(r.repliedToSentLogGuid).push(r);
  }

  const history = sent.map((s) => ({ ...s, replies: repliesBySentGuid.get(s.guid) || [] }));

  return NextResponse.json({ data: history, message: "Success" });
});
