"use client";
import React, { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Link2, Image as ImageIcon, Smile, PenLine } from "lucide-react";

// A minimal rich-text body editor for email compose/signature — bold,
// italic, underline, lists, links, inline images (via cid attachments so
// they actually render in real email clients instead of being stripped
// as data: URIs), and an emoji picker. Built on contentEditable +
// document.execCommand rather than a library — deprecated APIs, but still
// broadly supported for exactly this basic formatting set in every
// browser this app targets, without adding a new dependency for it.
const EMOJI_SET = [
  "😀","😁","😂","🙂","😉","😊","😍","🤔","😐","😕","😢","😡","👍","👎","👏","🙏",
  "🎉","✅","❌","⚠️","📌","📎","📧","📞","🚀","💡","🔥","⭐","❤️","💯","🕐","📅",
];

export default function RichTextEditor({ value, onChange, onInsertInlineImage, placeholder, minHeight = 200 }) {
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const [showEmoji, setShowEmoji] = useState(false);
  // Distinguishes "this DOM mutation came from the user typing/toolbar
  // action inside this editor" from "the parent handed us a new value"
  // (picking a template, applying a pending variable, inserting a
  // signature) — the sync effect below only needs to touch the DOM for
  // the latter; doing it for the former would fight the browser's own
  // cursor position mid-keystroke.
  const selfChange = useRef(false);

  const focusEditor = () => editorRef.current?.focus();

  const emitChange = () => {
    selfChange.current = true;
    onChange(editorRef.current?.innerHTML || "");
  };

  const exec = (command, arg) => {
    focusEditor();
    document.execCommand(command, false, arg);
    emitChange();
  };

  const handleInput = () => emitChange();

  const insertLink = () => {
    const url = window.prompt("Link URL (include https://)");
    if (!url) return;
    exec("createLink", url);
  };

  const insertEmoji = (emoji) => {
    focusEditor();
    document.execCommand("insertText", false, emoji);
    emitChange();
    setShowEmoji(false);
  };

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(",")[1];
      // A cid: reference is what actually survives in Gmail/Outlook/etc —
      // a data: URI src gets stripped by most real-world email clients.
      const cid = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      onInsertInlineImage?.({ cid, filename: file.name, content: base64, contentType: file.type });
      focusEditor();
      document.execCommand("insertImage", false, `cid:${cid}`);
      emitChange();
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (selfChange.current) { selfChange.current = false; return; }
    if (editorRef.current && editorRef.current.innerHTML !== (value || "")) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-50 border-b border-slate-200 relative">
        <button type="button" title="Bold" onClick={() => exec("bold")} className="p-1.5 hover:bg-slate-200 rounded text-slate-600"><Bold size={14} /></button>
        <button type="button" title="Italic" onClick={() => exec("italic")} className="p-1.5 hover:bg-slate-200 rounded text-slate-600"><Italic size={14} /></button>
        <button type="button" title="Underline" onClick={() => exec("underline")} className="p-1.5 hover:bg-slate-200 rounded text-slate-600"><Underline size={14} /></button>
        <span className="w-px h-4 bg-slate-300 mx-1" />
        <button type="button" title="Bullet list" onClick={() => exec("insertUnorderedList")} className="p-1.5 hover:bg-slate-200 rounded text-slate-600"><List size={14} /></button>
        <button type="button" title="Numbered list" onClick={() => exec("insertOrderedList")} className="p-1.5 hover:bg-slate-200 rounded text-slate-600"><ListOrdered size={14} /></button>
        <span className="w-px h-4 bg-slate-300 mx-1" />
        <button type="button" title="Insert link" onClick={insertLink} className="p-1.5 hover:bg-slate-200 rounded text-slate-600"><Link2 size={14} /></button>
        <button type="button" title="Insert image" onClick={() => imageInputRef.current?.click()} className="p-1.5 hover:bg-slate-200 rounded text-slate-600"><ImageIcon size={14} /></button>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
        <button type="button" title="Emoji" onClick={() => setShowEmoji((s) => !s)} className="p-1.5 hover:bg-slate-200 rounded text-slate-600"><Smile size={14} /></button>

        {showEmoji && (
          <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-slate-200 rounded-xl shadow-lg p-2 grid grid-cols-8 gap-1 w-64">
            {EMOJI_SET.map((e) => (
              <button key={e} type="button" onClick={() => insertEmoji(e)} className="text-lg hover:bg-slate-100 rounded p-1">{e}</button>
            ))}
          </div>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={() => setShowEmoji(false)}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className="w-full px-3 py-2 text-sm outline-none font-sans [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-slate-400 overflow-y-auto"
      />
    </div>
  );
}

// Small helper so callers can offer a one-click "Insert Signature" the same
// way regardless of where the signature came from.
export const insertHtmlAtEnd = (currentHtml, htmlToAppend) => {
  if (!htmlToAppend) return currentHtml;
  return `${currentHtml || ""}<br>${htmlToAppend}`;
};

export const PenIcon = PenLine;
