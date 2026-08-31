import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeFbfFba } from "@/lib/fbfFbaAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Edits the details recorded on a Sell Out transaction — Order ID / Reference,
// Amount, and Date only. Quantity/serials are deliberately NOT editable here:
// they already moved stock and flipped serial statuses when the sell-out was
// made (see sell-out/route.js), and correcting those retroactively would mean
// re-running that whole stock-adjustment/serial-status logic, not just an
// UPDATE — out of scope for what was asked (fixing a wrong reference/amount/
// date typed at the time, not undoing a sale).
export const PATCH = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeFbfFba(user, "PATCH");

  const { guid } = await params;
  const body = await parseJsonBody(request);

  const [existing] = await mysqlPool.query(
    "SELECT guid FROM fbf_fba_transactions WHERE guid = ? AND companyGuid = ? AND transactionType = 'OUT'",
    [guid, user.companyId]
  );
  if (!existing.length) throw new ApiError(404, "Sell out transaction not found");

  const referenceId = body.referenceId === undefined ? undefined : String(body.referenceId || "").trim();
  const amount = body.amount === undefined ? undefined : (body.amount === null || body.amount === "" ? null : Number(body.amount));
  const transactionDate = body.transactionDate === undefined || body.transactionDate === null ? undefined : new Date(body.transactionDate);

  if (amount !== undefined && amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    throw new ApiError(400, "Amount must be a valid positive number");
  }
  if (body.transactionDate !== undefined && (transactionDate === undefined || Number.isNaN(transactionDate.getTime()))) {
    throw new ApiError(400, "Invalid date");
  }

  const setClauses = [];
  const setParams = [];
  if (referenceId !== undefined) { setClauses.push("referenceId = ?"); setParams.push(referenceId); }
  if (amount !== undefined) { setClauses.push("amount = ?"); setParams.push(amount); }
  if (transactionDate !== undefined) { setClauses.push("transactionDate = ?"); setParams.push(transactionDate); }

  if (!setClauses.length) throw new ApiError(400, "Nothing to update");

  await mysqlPool.query(
    `UPDATE fbf_fba_transactions SET ${setClauses.join(", ")} WHERE guid = ? AND companyGuid = ?`,
    [...setParams, guid, user.companyId]
  );

  return NextResponse.json({ message: "Sell out record updated" });
});
