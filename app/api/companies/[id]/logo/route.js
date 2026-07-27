import fs from "fs";
import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireRoles, ApiError } from "@/lib/auth";
import { uploadDir, saveUploadedFile } from "@/lib/upload";
import { withErrorHandling } from "@/lib/apiResponse";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can change company logos.");

  const { id } = await params;
  const [existing] = await mysqlPool.query("SELECT guid, logoFilename FROM companies WHERE guid = ?", [id]);
  if (existing.length === 0) throw new ApiError(404, "Company not found.");

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");
  if (!ALLOWED_TYPES.includes(file.type)) throw new ApiError(400, "Logo must be a PNG, JPG, or WEBP image.");
  if (file.size > 2 * 1024 * 1024) throw new ApiError(413, "Logo image too large (max 2 MB)");

  const saved = await saveUploadedFile(file, { prefix: `company-logo-${id}` });
  await mysqlPool.query("UPDATE companies SET logoFilename = ? WHERE guid = ?", [saved.filename, id]);

  const oldFilename = existing[0].logoFilename;
  if (oldFilename) fs.unlink(`${uploadDir}/${oldFilename}`, () => {});

  return NextResponse.json({ message: "Logo updated successfully.", logoFilename: saved.filename });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can change company logos.");

  const { id } = await params;
  const [existing] = await mysqlPool.query("SELECT logoFilename FROM companies WHERE guid = ?", [id]);
  if (existing.length === 0) throw new ApiError(404, "Company not found.");

  await mysqlPool.query("UPDATE companies SET logoFilename = NULL WHERE guid = ?", [id]);
  const oldFilename = existing[0].logoFilename;
  if (oldFilename) fs.unlink(`${uploadDir}/${oldFilename}`, () => {});

  return NextResponse.json({ message: "Logo removed." });
});
