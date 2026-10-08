"use client";
import React from "react";

// Shows an email body (HTML from the rich-text editor) the way the recipient will see it:
// {{COMPANY_LOGO}} becomes the company's real logo (or a dashed "no logo" box).
export const LOGO_TOKEN = "{{COMPANY_LOGO}}";

export default function EmailHtmlPreview({ html, logoSrc, className = "" }) {
  const logo = logoSrc
    ? `<img src="${logoSrc}" alt="Company logo" style="display:block;height:60px;width:auto;max-width:260px;object-fit:contain;margin:4px 0">`
    : `<span style="display:inline-block;margin:4px 0;padding:8px 12px;border:1px dashed #cbd5e1;border-radius:4px;font-size:11px;color:#94a3b8">No logo uploaded for this company</span>`;
  const out = String(html || "").split(LOGO_TOKEN).join(logo);
  return (
    <div
      className={`text-sm text-slate-800 leading-relaxed break-words [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_a]:text-indigo-600 [&_a]:underline [&_img]:max-w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: out }}
    />
  );
}
