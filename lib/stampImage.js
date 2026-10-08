// Adds a dark strip with a line of text under a PNG/JPEG and returns the new PNG buffer.
//
// `sharp` is used when it works. On some hosts its native library (libvips) can't be loaded
// ("libvips-cpp.so ... cannot open shared object file") and can't be installed without shell access,
// so the same stamp is then drawn with `jimp`, which is pure JavaScript and needs no native library
// (slower on very large images, but always available). Set IMAGE_STAMP_ENGINE=jimp to force it.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function stampWithSharp(buffer, label) {
  const sharp = (await import("sharp")).default;
  const img = sharp(buffer);
  const { width = 1280, height = 720 } = await img.metadata();
  const barH = Math.max(34, Math.round(height * 0.045));
  const fontSize = Math.round(barH * 0.5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${barH}">
    <rect width="100%" height="100%" fill="#0f172a"/>
    <text x="14" y="${Math.round(barH * 0.68)}" font-size="${fontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="#ffffff">${esc(label)}</text>
  </svg>`;
  // The stamp goes in a NEW strip added below the picture — drawing it over the picture hid the last row of the table.
  const extended = await img.extend({ bottom: barH, background: "#0f172a" }).png().toBuffer();
  return sharp(extended).composite([{ input: Buffer.from(svg), gravity: "south" }]).png().toBuffer();
}

async function stampWithJimp(buffer, label) {
  const { Jimp, loadFont } = await import("jimp");
  const fonts = await import("jimp/fonts");
  const img = await Jimp.read(buffer);
  const width = img.width;
  const height = img.height;
  const barH = Math.max(34, Math.round(height * 0.045));
  // the built-in bitmap fonts are Latin only — keep the text to characters they can draw
  const text = String(label).replace(/[•·]/g, "-").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
  // nearest built-in size to ~45% of the strip height
  const [fontData, fontPx] =
    barH >= 180 ? [fonts.SANS_128_WHITE, 128] : barH >= 90 ? [fonts.SANS_64_WHITE, 64] : barH >= 46 ? [fonts.SANS_32_WHITE, 32] : [fonts.SANS_16_WHITE, 16];
  const font = await loadFont(fontData);
  const canvas = new Jimp({ width, height: height + barH, color: 0x0f172aff });
  canvas.composite(img, 0, 0);
  canvas.print({ font, x: 14, y: height + Math.max(0, Math.round((barH - fontPx) / 2)), text });
  return canvas.getBuffer("image/png");
}

export async function stampImage(buffer, label) {
  if (process.env.IMAGE_STAMP_ENGINE === "jimp") return stampWithJimp(buffer, label);
  try {
    return await stampWithSharp(buffer, label);
  } catch (err) {
    // The picture itself being bad is the user's problem; sharp not loading is the server's — fall back for that.
    const msg = String(err?.message || err);
    const sharpBroken = /sharp|libvips|dlopen|Cannot find (module|package)|runtime|shared object/i.test(msg) && !/Input buffer|unsupported image format|corrupt|truncated/i.test(msg);
    if (!sharpBroken) throw err;
    console.error("[stampImage] sharp unavailable, using the JavaScript fallback:", msg.slice(0, 200));
    return stampWithJimp(buffer, label);
  }
}
