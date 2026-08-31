import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { uploadDir } from "@/lib/upload";
import { mysqlPool } from "@/lib/db";
import { downloadDriveFile } from "@/lib/googleDrive";

// Mirrors Backend4's `app.use('/uploads', express.static(uploadDir))`.
//
// Detected from the file's actual bytes rather than its extension — some
// uploaded files (e.g. contracts) have no extension at all, which used to
// fall back to application/octet-stream and force-download instead of
// opening in a new tab.
function detectMimeType(buffer) {
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "%PDF") return "application/pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return "image/png";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return "application/octet-stream";
}

export async function GET(request, { params }) {
  const { filename } = await params;
  const safeName = path.basename(filename); // prevent path traversal
  const filePath = path.join(uploadDir, safeName);

  // Pre-migration uploads still live on local disk — serve those directly.
  if (filePath.startsWith(uploadDir) && fs.existsSync(filePath)) {
    const buffer = await fs.promises.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": detectMimeType(buffer),
        "Cache-Control": "public, max-age=3600",
        // Without this, some browsers force-download instead of previewing
        // (e.g. clicking "View" on a saved contract PDF) — inline tells the
        // browser to render it in the tab when it's a viewable type.
        "Content-Disposition": `inline; filename="${safeName.replace(/"/g, "")}"`,
      },
    });
  }

  // Everything uploaded since the Google Drive migration is looked up here.
  const [rows] = await mysqlPool.query("SELECT driveFileId, mimetype FROM drive_files WHERE filename=?", [safeName]);
  if (!rows.length) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }

  const buffer = await downloadDriveFile(rows[0].driveFileId);

  // Write-through cache to local disk: Drive stays the source of truth (and
  // the off-server backup), but every request after the first one for this
  // filename hits the fast local-disk path above instead of round-tripping
  // to the Drive API again. Filenames are unique per upload, so a file's
  // bytes never change after this point — safe to cache indefinitely.
  fs.promises
    .mkdir(uploadDir, { recursive: true })
    .then(() => fs.promises.writeFile(filePath, buffer))
    .catch((err) => {
      console.error(`Failed to cache Drive file "${safeName}" to disk:`, err);
    });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": rows[0].mimetype || detectMimeType(buffer),
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": `inline; filename="${safeName.replace(/"/g, "")}"`,
    },
  });
}
