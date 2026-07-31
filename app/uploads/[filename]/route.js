import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { uploadDir } from "@/lib/upload";

// Mirrors Backend4's `app.use('/uploads', express.static(uploadDir))`.
const MIME_TYPES = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
};

export async function GET(request, { params }) {
  const { filename } = await params;
  const safeName = path.basename(filename); // prevent path traversal
  const filePath = path.join(uploadDir, safeName);

  if (!filePath.startsWith(uploadDir) || !fs.existsSync(filePath)) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }

  const buffer = await fs.promises.readFile(filePath);
  const ext = path.extname(safeName).toLowerCase();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      // Without this, some browsers force-download instead of previewing
      // (e.g. clicking "View" on a saved contract PDF) — inline tells the
      // browser to render it in the tab when it's a viewable type.
      "Content-Disposition": `inline; filename="${safeName.replace(/"/g, "")}"`,
    },
  });
}
