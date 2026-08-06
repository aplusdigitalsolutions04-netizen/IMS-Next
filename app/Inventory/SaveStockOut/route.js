import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);

  const { RefNo, OrderId, TrackingId, IssueDate, IssuedBy, Items, invoiceFile, packingCost, freightCost, commission, platformId } = body;

  const connection = await mysqlPool.getConnection();
  let soId;
  try {
    await connection.beginTransaction();

    soId = `SO-${Date.now()}`;
    const formattedDate = IssueDate ? IssueDate.replace("T", " ").slice(0, 19) : new Date().toISOString().replace("T", " ").slice(0, 19);

    const totalSellingPrice = Items.reduce((sum, item) => sum + item.issueQty * (item.sellingPrice || 0), 0);

    await connection.execute(
      "INSERT INTO inventorystockout (stockOutId, companyGuid, refNo, orderId, trackingId, issueDate, issuedBy, invoiceFile, packingCost, freightCost, commission, platformId, sellingPrice) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [soId, user.companyId, RefNo, OrderId, TrackingId, formattedDate, IssuedBy, invoiceFile || null, packingCost || 0, freightCost || 0, commission || 0, platformId || null, totalSellingPrice]
    );

    // Batch-fetched once for every item on this stock-out, instead of one
    // SELECT per line item inside the loop below (which was running while
    // the transaction already holds locks from the stock UPDATEs).
    const allVariantIds = [...new Set(Items.map((item) => item.itemVariantId))];
    const [allComboRows] = allVariantIds.length
      ? await connection.query(
          "SELECT parentVariantId, childVariantId, quantity FROM inventorycombomapping WHERE parentVariantId IN (?) AND isDeleted = 0",
          [allVariantIds]
        )
      : [[]];
    const comboByParent = new Map();
    allComboRows.forEach((comboRow) => {
      if (!comboByParent.has(comboRow.parentVariantId)) comboByParent.set(comboRow.parentVariantId, []);
      comboByParent.get(comboRow.parentVariantId).push(comboRow);
    });

    for (const item of Items) {
      const detId = uuidv4();
      await connection.execute(
        "INSERT INTO inventorystockoutdetail (stockOutDetailId, companyGuid, stockOutId, itemVariantId, issueQty, sellingPrice) VALUES (?, ?, ?, ?, ?, ?)",
        [detId, user.companyId, soId, item.itemVariantId, item.issueQty, item.sellingPrice || 0]
      );

      if (item.serials && item.serials.length > 0) {
        for (const serial of item.serials) {
          await connection.execute(
            "INSERT INTO inventorystockoutserial (stockOutSerialId, stockOutDetailId, stockInSerialId, serialNumber) VALUES (?, ?, ?, ?)",
            [uuidv4(), detId, serial.stockInSerialId || serial, serial.serialNumber || null]
          );
        }
      }

      const comboComponents = comboByParent.get(item.itemVariantId) || [];

      if (comboComponents.length > 0) {
        for (const comp of comboComponents) {
          const totalChildQty = comp.quantity * item.issueQty;
          const [result] = await connection.execute(
            "UPDATE inventoryvariantstock SET availablePCS = availablePCS - ? WHERE itemVariantId = ? AND availablePCS >= ?",
            [totalChildQty, comp.childVariantId, totalChildQty]
          );
          if (result.affectedRows === 0) {
            const [[stockRow]] = await connection.query("SELECT availablePCS FROM inventoryvariantstock WHERE itemVariantId = ?", [comp.childVariantId]);
            throw new Error(stockRow
              ? `Insufficient stock for combo component ${comp.childVariantId}: have ${stockRow.availablePCS}, need ${totalChildQty}`
              : `Stock record not found for component ${comp.childVariantId}`);
          }
        }
      } else {
        const issueQty = Number(item.issueQty);
        const [result] = await connection.execute(
          "UPDATE inventoryvariantstock SET availablePCS = availablePCS - ? WHERE itemVariantId = ? AND availablePCS >= ?",
          [issueQty, item.itemVariantId, issueQty]
        );
        if (result.affectedRows === 0) {
          const [[stockRow]] = await connection.query("SELECT availablePCS FROM inventoryvariantstock WHERE itemVariantId = ?", [item.itemVariantId]);
          throw new Error(stockRow
            ? `Insufficient stock for item variant ${item.itemVariantId}: have ${stockRow.availablePCS}, need ${issueQty}`
            : `Stock record not found for item variant ${item.itemVariantId}`);
        }
      }
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return NextResponse.json({ message: "Success", stockOutId: soId });
});
