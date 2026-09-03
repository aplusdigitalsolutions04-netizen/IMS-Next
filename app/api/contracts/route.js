import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany, requirePermission, resolveScopedCompanyGuid, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";
import { createNotification } from "@/lib/notifications";

// Was gated on "orders" (copy-pasted from an Order Processing route) —
// "orders" is a PROTECTED_EDIT_PERMISSIONS tab, so that silently also
// required the unrelated allow_edit_order_processing edit-flag on top of
// "contracts" view access to upload/edit/delete a contract. "contracts"
// isn't protected, so view access alone is enough here (matches
// app/api/orders/draft/route.js's "contracts view access is enough on its
// own" — the two routes should agree on that).
const authorize = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "contracts",
    adminOnlyDelete: true,
    deleteFlag: "allow_delete_contracts",
    denyMessage: "You do not have permission to manage contracts.",
  });

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "contracts", "You do not have permission to access contracts.");
  authorize(user, "GET");

  const companyGuid = resolveScopedCompanyGuid(user, request);
  const clause = companyGuid ? "AND companyGuid = ?" : "";
  const params = companyGuid ? [companyGuid] : [];

  const [rows] = await mysqlPool.query(
    `SELECT * FROM contracts WHERE isDeleted=0 ${clause} ORDER BY createdAt DESC`,
    params
  );

  // pdfFilename alone isn't proof a file actually exists on Drive — a
  // contract row created by a direct DB insert (skipping Upload Contract)
  // can have that column set to arbitrary text with nothing backing it in
  // drive_files. hasDrivePdf reflects reality so the frontend can offer the
  // "attach PDF" action exactly when there's genuinely nothing to open.
  // Looked up separately (not a SQL JOIN) — contracts.pdfFilename and
  // drive_files.filename don't share a collation on every environment, and
  // comparing across them in SQL 500s with "Illegal mix of collations".
  const filenames = [...new Set(rows.map((r) => r.pdfFilename).filter(Boolean))];
  let driveFilenames = new Set();
  if (filenames.length > 0) {
    const [driveRows] = await mysqlPool.query("SELECT filename FROM drive_files WHERE filename IN (?)", [filenames]);
    driveFilenames = new Set(driveRows.map((r) => r.filename));
  }

  return NextResponse.json(rows.map((r) => ({ ...r, hasDrivePdf: driveFilenames.has(r.pdfFilename) })));
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "contracts", "You do not have permission to access contracts.");
  authorize(user, "POST");

  const body = await parseJsonBody(request);
  const {
    bidNumber, contractNumber, generatedDate, buyerContact, products, buyerEmail, buyerGstin,
    buyerAddress, deliveryStartAfter, deliveryCompletedBy, deliveryInstructions, ministry, department, organisation,
    officeZone, sellerCompany, sellerContact, sellerGstin, consigneeDesignation, consigneeEmail,
    consigneeContact, consigneeAddress, pdfFilename, tokenUsage,
  } = body;

  if (!contractNumber || !String(contractNumber).trim()) {
    throw new ApiError(400, "Contract Number is required");
  }

  const [dup] = await mysqlPool.query(
    "SELECT guid FROM contracts WHERE contractNumber=? AND companyGuid=? AND isDeleted=0",
    [contractNumber.trim(), user.companyId]
  );
  if (dup.length > 0) throw new ApiError(400, "A contract with this Contract Number already exists");

  // Contracts link to their order only by orderid == contractNumber (set in
  // app/api/orders/draft/route.js when the draft is created — see
  // findLinkedOrder in app/api/contracts/[id]/route.js). If that order
  // already exists, this contract number has already been processed — don't
  // let it be uploaded again.
  const [existingOrder] = await mysqlPool.query(
    "SELECT guid, status FROM orders WHERE orderid=? AND companyGuid=? AND isDeleted=0 LIMIT 1",
    [contractNumber.trim(), user.companyId]
  );
  if (existingOrder.length > 0) {
    throw new ApiError(400, `An order already exists in Order Processing for Contract #${contractNumber.trim()} (status: ${existingOrder[0].status}) — this contract can't be uploaded again.`);
  }

  const guid = randomUUID();
  try {
    await mysqlPool.query(
      `INSERT INTO contracts (
        guid, companyGuid, bidNumber, contractNumber, generatedDate, buyerContact, products, buyerEmail, buyerGstin,
        buyerAddress, deliveryStartAfter, deliveryCompletedBy, deliveryInstructions, ministry, department, organisation,
        officeZone, sellerCompany, sellerContact, sellerGstin, consigneeDesignation, consigneeEmail,
        consigneeContact, consigneeAddress, pdfFilename, aiPromptTokens, aiCompletionTokens, aiTotalTokens,
        isDeleted, createdBy, modifiedBy
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        guid, user.companyId, bidNumber || null, contractNumber.trim(), generatedDate || null,
        buyerContact || null, products || null, buyerEmail || null, buyerGstin || null,
        buyerAddress || null, deliveryStartAfter || null, deliveryCompletedBy || null, deliveryInstructions || null,
        ministry || null, department || null, organisation || null, officeZone || null,
        sellerCompany || null, sellerContact || null, sellerGstin || null, consigneeDesignation || null,
        consigneeEmail || null, consigneeContact || null, consigneeAddress || null, pdfFilename || null,
        tokenUsage?.promptTokens ?? null, tokenUsage?.completionTokens ?? null, tokenUsage?.totalTokens ?? null,
        user.username || user.fullName || "Unknown", user.username || user.fullName || "Unknown",
      ]
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new ApiError(400, "A contract with this Contract Number already exists");
    throw err;
  }

  broadcastRealtimeEvent(user.companyId, "contracts");

  await createNotification(mysqlPool, {
    targetRole: "Admin",
    title: "Contract Uploaded",
    message: `Contract #${contractNumber.trim()} was uploaded${organisation ? ` for ${organisation}` : ""} and is ready to create an order draft.`,
    type: "contract-upload",
    priority: "low",
    link: guid,
    companyGuid: user.companyId,
  });

  return NextResponse.json({ message: "Contract saved", guid });
});
