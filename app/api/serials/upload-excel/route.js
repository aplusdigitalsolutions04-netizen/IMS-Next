import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError, requireCompany } from "@/lib/auth";
import { authorizeSerials } from "@/lib/serialsAuth";
import { withErrorHandling } from "@/lib/apiResponse";
import { uploadDir, saveUploadedFile } from "@/lib/upload";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeSerials(user, "POST");

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");
  const targetModelId = formData.get("targetModelId") ? String(formData.get("targetModelId")).trim() : null;

  const saved = await saveUploadedFile(file);
  const filePath = path.join(uploadDir, saved.filename);

  try {
    const workbook = xlsx.readFile(filePath);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    if (!data.length) throw new ApiError(400, "Excel file is empty");

    const results = { success: [], failed: [], skipped: [], totalRows: data.length };

    // First pass — pull out and normalize every field per row (pure, no DB
    // access) so the lookups below can be batched instead of firing 3-4
    // queries per row. A 1,000-row sheet previously meant 3,000-4,000
    // sequential round-trips; this brings it down to 3 lookups total.
    const parsed = data.map((row, i) => {
      const rowNum = i + 2;
      const modelIdValue = row.modelId || row.modelid || row.ModelId || row["Model ID"] || row.model_id;
      const serialValue = row.value || row.Value || row.serialNumber || row.SerialNumber || row["Serial Number"] || row["Serial No"] || row.serial;
      const lpKey = Object.keys(row).find((key) => key.toLowerCase().replace(/[^a-z]/g, "") === "landingprice");
      const rawLp = lpKey ? row[lpKey] : 0;
      const statusValue = row.status || row.Status || "Available";
      const reasonValue = row.landingPriceReason || row.LandingPriceReason || row.reason || row.Reason || null;
      const godownGuidValue = row.godownGuid || row.GodownGuid || row["Godown GUID"] || row["Godown Id"] || row["Godown ID"] || row.warehouseGuid || row["Warehouse GUID"] || null;
      return { rowNum, row, modelIdValue, serialValue, rawLp, statusValue, reasonValue, godownGuidValue };
    });

    const modelIds = [...new Set(parsed.map((parsedRow) => parsedRow.modelIdValue && String(parsedRow.modelIdValue).trim()).filter(Boolean))];
    const serialValues = [...new Set(parsed.map((parsedRow) => parsedRow.serialValue && String(parsedRow.serialValue).trim()).filter(Boolean))];
    const godownGuids = [...new Set(parsed.map((parsedRow) => parsedRow.godownGuidValue && String(parsedRow.godownGuidValue).trim()).filter(Boolean))];

    const modelsById = new Map();
    if (modelIds.length) {
      const [modelRows] = await mysqlPool.query(
        "SELECT itemVariantId as id, sellingPrice as mrp, variantName as name FROM inventoryitemvariant WHERE itemVariantId IN (?) AND isDeleted=0 AND companyGuid=?",
        [modelIds, user.companyId]
      );
      modelRows.forEach((modelRow) => modelsById.set(String(modelRow.id), modelRow));
    }
    const existingSerials = new Set();
    if (serialValues.length) {
      const [serialRows] = await mysqlPool.query(
        "SELECT serialNumber FROM inventorystockinserial WHERE serialNumber IN (?) AND companyGuid=?",
        [serialValues, user.companyId]
      );
      serialRows.forEach((serialRow) => existingSerials.add(serialRow.serialNumber));
    }
    const validGodowns = new Set();
    if (godownGuids.length) {
      const [godownRows] = await mysqlPool.query(
        "SELECT guid FROM godowns WHERE guid IN (?) AND isDeleted=0 AND companyGuid=?",
        [godownGuids, user.companyId]
      );
      godownRows.forEach((godownRow) => validGodowns.add(godownRow.guid));
    }

    const seenInFile = new Set();
    const toInsert = [];

    for (const parsedRow of parsed) {
      const { rowNum, row, modelIdValue, serialValue, rawLp, statusValue, reasonValue, godownGuidValue } = parsedRow;
      if (!modelIdValue || !serialValue) { results.failed.push({ row: rowNum, serialNumber: serialValue || "N/A", reason: "Missing required fields: modelId or value" }); continue; }

      const modelId = String(modelIdValue).trim();
      if (targetModelId && modelId !== targetModelId) { results.skipped.push({ row: rowNum, serialNumber: String(serialValue), reason: "Skipped (Model Filter)" }); continue; }

      const trimmedSerial = String(serialValue).trim();
      let cleanLp = 0;
      if (rawLp !== undefined && rawLp !== null && rawLp !== "") cleanLp = Number(String(rawLp).replace(/[^0-9.]/g, ""));
      const landingPrice = isNaN(cleanLp) ? 0 : cleanLp;
      const landingPriceReason = reasonValue ? String(reasonValue).trim() : null;

      const model = modelsById.get(modelId);
      if (!model) { results.failed.push({ row: rowNum, serialNumber: trimmedSerial, reason: `Model ID ${modelId} not found` }); continue; }

      // Checks both "already in the database" and "already earlier in this
      // same file" — the old row-by-row version caught in-file duplicates
      // for free because each insert committed before the next row's SELECT
      // ran; batching means that has to be tracked explicitly instead.
      if (existingSerials.has(trimmedSerial) || seenInFile.has(trimmedSerial)) {
        results.failed.push({ row: rowNum, serialNumber: trimmedSerial, reason: "Serial number already exists" });
        continue;
      }

      const modelMRP = Number(model.mrp) || 0;
      let finalReason = null;
      if (landingPrice > modelMRP && modelMRP > 0) {
        if (!landingPriceReason) { results.failed.push({ row: rowNum, serialNumber: trimmedSerial, reason: "Landing Price exceeds MRP. Reason required.", requiresReason: true }); continue; }
        finalReason = landingPriceReason;
      }

      const godownGuid = godownGuidValue ? String(godownGuidValue).trim() : null;
      if (godownGuid && !validGodowns.has(godownGuid)) {
        results.failed.push({ row: rowNum, serialNumber: trimmedSerial, reason: `Godown ${godownGuid} not found` });
        continue;
      }

      const serialGuid = randomUUID();
      seenInFile.add(trimmedSerial);
      toInsert.push([serialGuid, serialGuid, user.companyId, modelId, godownGuid, trimmedSerial, landingPrice, String(statusValue).trim() || "Available", finalReason]);
      results.success.push({ row: rowNum, id: serialGuid, serialNumber: trimmedSerial, modelId, modelName: model.name });
    }

    if (toInsert.length) {
      try {
        await mysqlPool.query(
          "INSERT INTO inventorystockinserial (serialId,guid,companyGuid,itemVariantId,godownGuid,serialNumber,landingPrice,serialStatus,landingPriceReason,isUsed,isDeleted,createdAt) VALUES ?",
          [toInsert.map((insertRow) => [...insertRow, 0, 0, new Date()])]
        );
      } catch (insertError) {
        // A dup-entry (or any other) failure here means the whole batch
        // insert didn't happen — reflect that in the results instead of
        // claiming success for rows that were never actually written.
        const failedSerials = new Set(toInsert.map((insertRow) => insertRow[5]));
        results.success = results.success.filter((successRow) => !failedSerials.has(successRow.serialNumber));
        toInsert.forEach((insertRow) => results.failed.push({ row: "-", serialNumber: insertRow[5], reason: insertError.code === "ER_DUP_ENTRY" ? "Serial number already exists" : insertError.message }));
      }
    }

    return NextResponse.json({ message: `Upload completed. Success: ${results.success.length}, Failed: ${results.failed.length}, Skipped: ${results.skipped.length}`, results });
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});
