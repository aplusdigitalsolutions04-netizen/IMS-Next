// Ported verbatim from Backend4/routes/warranty.js — OOXML theme-color
// resolution and header/HTML block-splitting helpers used by the DOCX
// template pipeline (docxtemplater fill -> mammoth HTML preview).

import sanitizeHtml from "sanitize-html";

// This HTML comes from a user-uploaded .docx/.html file (any user with
// warranty-write access), gets stored verbatim, and is later interpolated
// into generated warranty certificates/emails — so it's stored-XSS-capable
// content until sanitized. Keeps the formatting/image tags Word conversion
// actually produces (mammoth embeds images as base64 data: URIs, and inline
// `style` carries the letterhead's visual formatting) while stripping
// script vectors: <script>, event handler attributes (onerror, onload,
// etc.), and javascript:/data:text/html URLs are all removed by default.
const SANITIZE_OPTIONS = {
  allowedTags: [
    "p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "sub", "sup",
    "table", "thead", "tbody", "tr", "td", "th", "img", "a", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "hr",
  ],
  allowedAttributes: {
    "*": ["style", "class", "align", "colspan", "rowspan", "width", "height"],
    img: ["src", "alt", "width", "height", "style"],
    a: ["href", "title"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["data", "http", "https"] },
};

export function sanitizeWarrantyHeaderHtml(html) {
  return sanitizeHtml(html || "", SANITIZE_OPTIONS);
}

export function parseThemeColors(admZip) {
  const colorMap = {};
  try {
    const entry = admZip.getEntry("word/theme/theme1.xml");
    if (!entry) return colorMap;
    const xml = admZip.readAsText(entry);
    const slots = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
    for (const slot of slots) {
      const m1 = xml.match(new RegExp(`<a:${slot}>\\s*<a:srgbClr[^>]+val="([0-9A-Fa-f]{6})"`, "i"));
      if (m1) { colorMap[slot] = m1[1].toUpperCase(); continue; }
      const m2 = xml.match(new RegExp(`<a:${slot}>\\s*<a:sysClr[^>]+lastClr="([0-9A-Fa-f]{6})"`, "i"));
      if (m2) colorMap[slot] = m2[1].toUpperCase();
    }
  } catch (e) {
    console.warn("[warranty] parseThemeColors:", e.message);
  }
  return colorMap;
}

// tintByte 0xFF = full white, 0x00 = no tint (original)
function hexTint(hex, tintByte) {
  const t = tintByte / 255;
  return [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16);
    return Math.min(255, Math.round(c + (255 - c) * t)).toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

// shadeByte 0xFF = original, 0x00 = full black
function hexShade(hex, shadeByte) {
  const s = shadeByte / 255;
  return [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16);
    return Math.min(255, Math.round(c * s)).toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

export function resolveThemeColorsInXml(xml, colorMap) {
  xml = xml.replace(/<w:shd(\s[^>]*?)(\/?>)/g, (full, attrs, end) => {
    let a = attrs;

    const themeFill = (a.match(/w:themeFill="([^"]+)"/) || [])[1];
    if (themeFill && colorMap[themeFill]) {
      const fillMatch = a.match(/w:fill="([^"]+)"/);
      if (!fillMatch || !/^[0-9A-Fa-f]{6}$/.test(fillMatch[1])) {
        let hex = colorMap[themeFill];
        const tint = (a.match(/w:themeFillTint="([^"]+)"/) || [])[1];
        const shade = (a.match(/w:themeFillShade="([^"]+)"/) || [])[1];
        if (tint) hex = hexTint(hex, parseInt(tint, 16));
        else if (shade) hex = hexShade(hex, parseInt(shade, 16));
        a = fillMatch
          ? a.replace(/w:fill="[^"]*"/, `w:fill="${hex}"`)
          : a + ` w:fill="${hex}"`;
      }
    }

    const themeColor = (a.match(/w:themeColor="([^"]+)"/) || [])[1];
    if (themeColor && colorMap[themeColor]) {
      const colorMatch = a.match(/w:color="([^"]+)"/);
      if (!colorMatch || !/^[0-9A-Fa-f]{6}$/.test(colorMatch[1])) {
        let hex = colorMap[themeColor];
        const tint = (a.match(/w:themeTint="([^"]+)"/) || [])[1];
        const shade = (a.match(/w:themeShade="([^"]+)"/) || [])[1];
        if (tint) hex = hexTint(hex, parseInt(tint, 16));
        else if (shade) hex = hexShade(hex, parseInt(shade, 16));
        a = colorMatch
          ? a.replace(/w:color="[^"]*"/, `w:color="${hex}"`)
          : a + ` w:color="${hex}"`;
      }
    }

    return `<w:shd${a}${end}`;
  });

  xml = xml.replace(/<w:color(\s[^>]*?)(\/?>)/g, (full, attrs, end) => {
    const themeColor = (attrs.match(/w:themeColor="([^"]+)"/) || [])[1];
    if (!themeColor || !colorMap[themeColor]) return full;
    const valMatch = attrs.match(/w:val="([^"]+)"/);
    if (valMatch && /^[0-9A-Fa-f]{6}$/.test(valMatch[1])) return full;
    let hex = colorMap[themeColor];
    const tint = (attrs.match(/w:themeTint="([^"]+)"/) || [])[1];
    const shade = (attrs.match(/w:themeShade="([^"]+)"/) || [])[1];
    if (tint) hex = hexTint(hex, parseInt(tint, 16));
    else if (shade) hex = hexShade(hex, parseInt(shade, 16));
    const a = valMatch
      ? attrs.replace(/w:val="[^"]*"/, `w:val="${hex}"`)
      : attrs + ` w:val="${hex}"`;
    return `<w:color${a}${end}`;
  });

  return xml;
}

function splitHtmlBlocks(html) {
  const blocks = [];
  let currentBlock = "";
  let depth = 0;
  let pos = 0;

  while (pos < html.length) {
    if (html[pos] === "<") {
      const tagMatch = html.slice(pos).match(/^<\/?([a-zA-Z1-6]+)/);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        const isClosing = html[pos + 1] === "/";
        const tagLength = html.slice(pos).indexOf(">") + 1;

        if (tagLength > 0) {
          const tagMarkup = html.slice(pos, pos + tagLength);
          currentBlock += tagMarkup;
          pos += tagLength;

          const isBlockTag = ["p", "table", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "div"].includes(tagName);
          if (isBlockTag) {
            if (isClosing) {
              depth--;
              if (depth <= 0) {
                blocks.push(currentBlock);
                currentBlock = "";
                depth = 0;
              }
            } else {
              const isSelfClosing = tagMarkup.endsWith("/>") || ["img", "br", "hr"].includes(tagName);
              if (!isSelfClosing) {
                depth++;
              } else if (depth === 0) {
                blocks.push(currentBlock);
                currentBlock = "";
              }
            }
          }
          continue;
        }
      }
    }

    currentBlock += html[pos];
    pos++;
  }

  if (currentBlock.trim()) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function getPlainText(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Clean HTML to extract only the header section (removes any letter body starting keywords)
export function cleanHeaderHtml(html) {
  const blocks = splitHtmlBlocks(html);
  const headerBlocks = [];

  const BODY_START_PATTERNS = [
    /^(ref(erence)?\.?\s*no|contract\s*no)/i,
    /^date\s*:/i,
    /^subject\s*:/i,
    /^warranty\s*certificate/i,
    /^to$/i,
    /^to\s*,/i,
    /^respected\s*sir/i,
    /^respected\s*madam/i,
    /^dear\s*sir/i,
    /^dear\s*madam/i,
    /^consignee/i,
  ];

  for (const block of blocks) {
    const text = getPlainText(block);

    let isBodyStart = false;
    for (const pattern of BODY_START_PATTERNS) {
      if (pattern.test(text)) {
        isBodyStart = true;
        break;
      }
    }

    if (isBodyStart) {
      console.log(`[warranty-header-cleaner] Block starts with body keyword: "${text}". Stopping extraction.`);
      break;
    }

    headerBlocks.push(block);
  }

  return sanitizeWarrantyHeaderHtml(headerBlocks.join("").trim());
}
