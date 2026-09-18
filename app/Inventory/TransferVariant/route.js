import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requireEditPermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Moves a variant from one Item Master entry to another, to ANY item
// regardless of category. Stock (inventoryvariantstock /
// inventorygodownstock / inventorynonserializedbatch), serial numbers
// (inventorystockinserial), specification values
// (inventoryitemvariantspecvalue), and barcode mappings are all keyed by
// itemVariantId, never by itemId — so re-pointing the variant's itemId
// carries all of it along automatically, nothing to touch here. Spec values
// keep their own name/label regardless of which item's category they end up
// under (see GetItemVariantList/route.js, which resolves each value's label
// directly off its specificationId instead of filtering through whatever
// category is currently being browsed) — so they stay visible even after a
// cross-category move, same as they always were.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  // Separate from the broad Item Master edit permission — moving a variant
  // (and everything attached to it) to a different item is more sensitive
  // than editing one, so it can be delegated independently (see Manage Roles).
  requireEditPermission(user, "allow_transfer_variant");

  const { itemVariantId, destinationItemId } = await parseJsonBody(request);
  if (!itemVariantId || !destinationItemId) {
    throw new ApiError(400, "A variant and a destination item are required.");
  }

  const [[variant]] = await mysqlPool.query(
    `SELECT v.itemVariantId, v.itemId, v.variantName, i.itemName as currentItemName, i.isTrackable
     FROM inventoryitemvariant v
     JOIN inventoryitemmaster i ON v.itemId = i.itemId
     WHERE v.itemVariantId = ? AND v.companyGuid = ? AND v.isDeleted = 0`,
    [itemVariantId, user.companyId]
  );
  if (!variant) throw new ApiError(404, "Variant not found.");

  if (String(variant.itemId) === String(destinationItemId)) {
    throw new ApiError(400, "This variant is already under the selected item.");
  }

  const [[destItem]] = await mysqlPool.query(
    "SELECT itemId, itemName, isTrackable FROM inventoryitemmaster WHERE itemId = ? AND companyGuid = ? AND isDeleted = 0",
    [destinationItemId, user.companyId]
  );
  if (!destItem) throw new ApiError(404, "Destination item not found.");

  // isTrackable (Ask Serial No. Yes/No) is an Item Master-level setting that
  // every variant under it inherits — Current Stock and every stock-in/
  // dispatch path decide how to compute a variant's available quantity from
  // it (live serial count vs inventoryvariantstock.availablePCS). Moving a
  // serialized variant's existing serials under a non-serialized item (or
  // vice versa) wouldn't move any actual stock, it would just make that
  // stock invisible — the quantity computation for the new item type was
  // never being kept in sync for this variant.
  if (!!variant.isTrackable !== !!destItem.isTrackable) {
    throw new ApiError(
      400,
      `Can't transfer — "${variant.currentItemName}" is ${variant.isTrackable ? "serialized" : "non-serialized"} but "${destItem.itemName}" is ${destItem.isTrackable ? "serialized" : "non-serialized"}. Only transfer between items with the same "Ask Serial No." setting, or its stock will stop showing up correctly.`
    );
  }

  await mysqlPool.query(
    "UPDATE inventoryitemvariant SET itemId = ? WHERE itemVariantId = ? AND companyGuid = ?",
    [destinationItemId, itemVariantId, user.companyId]
  );

  return NextResponse.json({ message: `"${variant.variantName}" moved from "${variant.currentItemName}" to "${destItem.itemName}".` });
});
