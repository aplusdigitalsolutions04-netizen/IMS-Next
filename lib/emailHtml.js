// Helpers for email bodies that are written in the rich-text editor (stored/sent as HTML) but may still be
// plain text in older templates. Safe to import from both the browser and the server.
export const looksLikeHtml = (text) =>
  /<\/?(b|strong|i|em|u|p|br|div|span|ul|ol|li|a|img|h[1-6]|table|tr|td|font)\b[^>]*>/i.test(String(text || ""));

export const escapeHtml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const plainToHtml = (text) => escapeHtml(text).replace(/\r?\n/g, "<br>");

// Whatever a template/body holds -> HTML the rich-text editor can show.
export const bodyAsHtml = (text) => (looksLikeHtml(text) ? String(text) : plainToHtml(text));

export const htmlToText = (html) =>
  String(html || "")
    .replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();

// true when there is nothing visible (no text and no image)
export const htmlIsEmpty = (html) => !/<img\b/i.test(String(html || "")) && htmlToText(html) === "";
