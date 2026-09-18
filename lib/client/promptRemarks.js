"use client";
import Swal from "sweetalert2";

// Shared "delete with a required remark" confirm dialog — used everywhere a
// delete action now needs a reason on record (Item Master items/variants/
// serials, Contracts) so the Admin "Deleted Items" screen has something to
// show besides "who" and "when". Returns the trimmed remark string, or null
// if the user cancelled or left it blank.
export async function promptDeleteRemarks({ title, text, confirmButtonText = "Yes, Delete", confirmButtonColor = "#dc2626" }) {
  const result = await Swal.fire({
    title,
    html: `<p style="color:#64748b;font-size:14px;margin-bottom:12px">${text}</p>`,
    icon: "warning",
    input: "textarea",
    inputPlaceholder: "Why is this being deleted? (required)",
    inputAttributes: { "aria-label": "Delete remarks" },
    showCancelButton: true,
    confirmButtonText,
    confirmButtonColor,
    cancelButtonText: "Cancel",
    inputValidator: (value) => (!value || !value.trim() ? "A remark is required to delete." : undefined),
  });
  if (!result.isConfirmed) return null;
  return result.value.trim();
}
