"use client";
import React from "react";

// Renders text where every {{COMPANY_LOGO}} becomes the company's real logo
// (or a dashed "no logo uploaded" box). Used by the email previews so what you
// see is what the recipient gets; the actual mail embeds the same image.
export const LOGO_TOKEN = "{{COMPANY_LOGO}}";

export default function LogoText({ text, logoSrc }) {
  const parts = String(text || "").split(LOGO_TOKEN);
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="Company logo" className="block h-[60px] w-auto max-w-[260px] object-contain my-1" />
            ) : (
              <span className="inline-block my-1 px-3 py-2 border border-dashed border-slate-300 rounded text-[11px] text-slate-400">No logo uploaded for this company</span>
            )
          )}
        </React.Fragment>
      ))}
    </>
  );
}
