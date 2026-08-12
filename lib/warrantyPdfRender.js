// Ported verbatim from Backend4/routes/warranty.js's inline PDF→PNG conversion:
// renders page 1 via pdf.js inside a headless Puppeteer tab, then auto-crops
// the trailing white space so only the header band is kept.
// Takes and returns Buffers — no disk I/O — since the source PDF and the
// resulting PNG both live in Google Drive now, not on local disk.
export async function renderPdfFirstPageToPng(pdfBuffer) {
  const puppeteer = (await import("puppeteer")).default;
  const pdfBase64 = pdfBuffer.toString("base64");

  const browser = await puppeteer.launch({
    headless: true,
    // --disable-dev-shm-usage: shared/containerized hosts give Chromium a
    // tiny /dev/shm by default — without this flag Chromium either overflows
    // it (crash) or falls back to a much heavier memory footprint per launch.
    // The other two flags trim GPU/rasterizer overhead we never use headless.
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
    ],
  });
  try {
    const page = await browser.newPage();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
        <style>
          body { margin: 0; padding: 0; background: transparent; }
          canvas { display: block; width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <canvas id="pdf-canvas"></canvas>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

          async function renderPdf(base64Data) {
            try {
              const binData = atob(base64Data);
              const uint8Data = new Uint8Array(binData.length);
              for (let i = 0; i < binData.length; i++) {
                uint8Data[i] = binData.charCodeAt(i);
              }

              const loadingTask = pdfjsLib.getDocument({ data: uint8Data });
              const pdf = await loadingTask.promise;
              const page = await pdf.getPage(1);

              const viewport = page.getViewport({ scale: 2.0 }); // 2.0 scale for crisp resolution
              const canvas = document.getElementById('pdf-canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              await page.render({
                canvasContext: context,
                viewport: viewport
              }).promise;

              // Auto-crop white space from bottom
              cropCanvas(canvas);

              window.renderingComplete = true;
            } catch (err) {
              window.renderingError = err.message || err.toString();
            }
          }

          function cropCanvas(canvas) {
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            const imgData = ctx.getImageData(0, 0, width, height).data;

            // Analyze content presence for each row, ignoring the outer 6% margins to bypass page borders
            const rowHasContent = [];
            const startX = Math.floor(width * 0.06);
            const endX = Math.floor(width * 0.94);

            for (let y = 0; y < height; y++) {
              let hasContent = false;
              for (let x = startX; x < endX; x++) {
                const idx = (y * width + x) * 4;
                const r = imgData[idx];
                const g = imgData[idx + 1];
                const b = imgData[idx + 2];
                const a = imgData[idx + 3];

                // Check if pixel is not white (threshold of 250) and has some opacity
                if (a > 10 && (r < 250 || g < 250 || b < 250)) {
                  hasContent = true;
                  break;
                }
              }
              rowHasContent.push(hasContent);
            }

            // Find where the header content starts
            let headerStart = 0;
            for (let y = 0; y < height; y++) {
              if (rowHasContent[y]) {
                headerStart = y;
                break;
              }
            }

            // Find the first significant white gap after the header starts
            let headerEnd = height;
            let consecutiveWhiteRows = 0;
            // A gap is defined as at least 70 consecutive white rows (approx. 35 CSS pixels at scale 2.0)
            const GAP_THRESHOLD = 70;

            for (let y = headerStart; y < height; y++) {
              if (!rowHasContent[y]) {
                consecutiveWhiteRows++;
                if (consecutiveWhiteRows >= GAP_THRESHOLD) {
                  // The header ends where the gap started, plus 15px margin for aesthetics
                  headerEnd = y - consecutiveWhiteRows + 15;
                  break;
                }
              } else {
                consecutiveWhiteRows = 0;
              }
            }

            // Fallback: Cap the header height to 28% of page height if no gap or if gap is too low
            const maxHeaderHeight = Math.round(height * 0.28);
            let cropHeight = headerEnd;

            if (cropHeight > maxHeaderHeight) {
              cropHeight = maxHeaderHeight;
            }

            // Minimum safety height
            if (cropHeight < 150) {
              cropHeight = Math.min(height, 350);
            }

            if (cropHeight < height) {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = width;
              tempCanvas.height = cropHeight;
              const tempCtx = tempCanvas.getContext('2d');
              tempCtx.drawImage(canvas, 0, 0);
              canvas.parentNode.replaceChild(tempCanvas, canvas);
              tempCanvas.id = 'pdf-canvas';
              console.log('Cropped canvas from height ' + height + ' to ' + cropHeight);
            }
          }
        </script>
      </body>
      </html>
    `;

    await page.setContent(htmlContent);
    await page.evaluate((b64) => window.renderPdf(b64), pdfBase64);

    await page.waitForFunction(() => window.renderingComplete || window.renderingError, { timeout: 30000 });

    const errorMsg = await page.evaluate(() => window.renderingError);
    if (errorMsg) {
      throw new Error("PDF.js render error: " + errorMsg);
    }

    const canvasElement = await page.$("#pdf-canvas");
    return await canvasElement.screenshot();
  } finally {
    await browser.close();
  }
}
