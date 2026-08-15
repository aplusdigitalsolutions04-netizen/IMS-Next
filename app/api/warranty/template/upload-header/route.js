import path from "path";
import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import mammoth from "mammoth";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { saveUploadedFile, saveBufferToDrive } from "@/lib/upload";
import { logUserActivity } from "@/lib/helpers";
import { cleanHeaderHtml } from "@/lib/warrantyDocx";
import { withErrorHandling } from "@/lib/apiResponse";

// Accepts: image files → saves as image path
//          .docx files → converts to HTML via mammoth
//          .html files → reads raw HTML content
//          .pdf files  → renders first page to PNG via Puppeteer
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "POST");

  const [existingTpl] = await mysqlPool.query("SELECT id FROM warranty_template WHERE companyGuid=? LIMIT 1", [user.companyId]);
  if (existingTpl.length === 0) await mysqlPool.query("INSERT INTO warranty_template (companyGuid) VALUES (?)", [user.companyId]);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name).toLowerCase();
  const ip = request.headers.get("x-forwarded-for") || null;

  if (ext === ".docx") {
    let headerHtml = "";
    try {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      const headerEntries = entries.filter((e) => /^word\/header\d+\.xml$/.test(e.entryName));

      let mammothInput = { buffer };

      if (headerEntries.length > 0) {
        headerEntries.sort((a, b) => a.entryName.localeCompare(b.entryName));

        let targetHeader = headerEntries.find((e) => {
          const xml = zip.readAsText(e);
          return xml.includes("<w:t") || xml.includes("<w:drawing");
        });

        if (!targetHeader) {
          targetHeader = headerEntries[0];
        }

        const headerXml = zip.readAsText(targetHeader);

        let documentXml = headerXml;
        const hdrStartMatch = headerXml.match(/<w:hdr([\s\S]*?)>/);
        if (hdrStartMatch) {
          const fullStartTag = hdrStartMatch[0];
          const attributes = hdrStartMatch[1];
          const docStartTag = `<w:document${attributes}><w:body>`;
          documentXml = headerXml.replace(fullStartTag, docStartTag).replace(/<\/w:hdr>/g, "</w:body></w:document>");
        } else {
          documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${headerXml}
  </w:body>
</w:document>`;
        }

        zip.addFile("word/document.xml", Buffer.from(documentXml, "utf-8"));

        const headerRelsPath = `word/_rels/${targetHeader.name}.rels`;
        const headerRelsEntry = zip.getEntry(headerRelsPath);
        if (headerRelsEntry) {
          const relsXml = zip.readAsText(headerRelsEntry);
          zip.addFile("word/_rels/document.xml.rels", Buffer.from(relsXml, "utf-8"));
        }

        mammothInput = { buffer: zip.toBuffer() };
      }

      const result = await mammoth.convertToHtml(mammothInput, {
        convertImage: mammoth.images.imgElement(async (image) => {
          const buf = await image.read("base64");
          return { src: `data:${image.contentType};base64,${buf}` };
        }),
      });
      headerHtml = result.value || "";
      headerHtml = cleanHeaderHtml(headerHtml);
      if (result.messages && result.messages.length > 0) {
        console.warn("[warranty] Mammoth warnings during conversion:", result.messages);
      }
    } catch (mammothErr) {
      console.error("[warranty] mammoth error:", mammothErr);
      throw new ApiError(500, "Failed to convert Word file: " + mammothErr.message);
    }

    if (!headerHtml) {
      throw new ApiError(400, "Word file produced empty content. Please ensure your header content is designed within the main body or the header section of the document.");
    }

    await mysqlPool.query("UPDATE warranty_template SET headerHtml=?, headerImagePath=NULL WHERE companyGuid=?", [headerHtml, user.companyId]);
    await logUserActivity(mysqlPool, user, "Upload Warranty Header (DOCX)", [], ip);
    return NextResponse.json({ message: "Word header uploaded", type: "docx", headerHtml });
  } else if (ext === ".html" || ext === ".htm") {
    let headerHtml = buffer.toString("utf8");
    headerHtml = cleanHeaderHtml(headerHtml);
    await mysqlPool.query("UPDATE warranty_template SET headerHtml=?, headerImagePath=NULL WHERE companyGuid=?", [headerHtml || "", user.companyId]);
    await logUserActivity(mysqlPool, user, "Upload Warranty Header (HTML)", [], ip);
    return NextResponse.json({ message: "HTML header uploaded", type: "html", headerHtml });
  } else if (ext === ".pdf") {
    const pngFilename = `warranty-header-${Date.now()}.png`;

    try {
      const { renderPdfFirstPageToPng } = await import("@/lib/warrantyPdfRender");
      const pngBuffer = await renderPdfFirstPageToPng(buffer);
      await saveBufferToDrive(pngBuffer, pngFilename, "image/png", "warrantyTemplate");

      await mysqlPool.query("UPDATE warranty_template SET headerImagePath=?, headerHtml=NULL WHERE companyGuid=?", [pngFilename, user.companyId]);
      await logUserActivity(mysqlPool, user, "Upload Warranty Header (PDF)", [], ip);
      // Relative, not an absolute BACKEND_URI/localhost URL — the app serves
      // uploads from its own origin (no separate backend domain), and a
      // hardcoded localhost URL only ever resolved on whichever machine
      // BACKEND_URI happened to point at, breaking the preview <img> for
      // every other browser/deployment (broken-image icon).
      return NextResponse.json({ message: "PDF header uploaded and converted", type: "image", filePath: pngFilename, previewUrl: `/uploads/${pngFilename}` });
    } catch (pdfErr) {
      console.error("[warranty] PDF conversion error:", pdfErr);
      throw new ApiError(500, "Failed to convert PDF file: " + pdfErr.message);
    }
  } else {
    const saved = await saveUploadedFile(file, { prefix: `warranty-header-${Date.now()}`, folder: "warrantyTemplate" });
    const filename = saved.filename;
    await mysqlPool.query("UPDATE warranty_template SET headerImagePath=?, headerHtml=NULL WHERE companyGuid=?", [filename, user.companyId]);
    await logUserActivity(mysqlPool, user, "Upload Warranty Header (Image)", [], ip);
    return NextResponse.json({ message: "Header image uploaded", type: "image", filePath: filename, previewUrl: `/uploads/${filename}` });
  }
});
