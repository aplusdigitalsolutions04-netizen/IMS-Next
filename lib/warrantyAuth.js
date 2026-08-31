import { authorizeReadWrite } from "@/lib/auth";

export const authorizeWarranty = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "warranty",
    editColumnName: "allow_edit_warranty",
    adminOnlyDelete: true,
    deleteFlag: "allow_delete_warranty",
    denyMessage: "You do not have permission to manage warranty templates and certificates.",
  });
