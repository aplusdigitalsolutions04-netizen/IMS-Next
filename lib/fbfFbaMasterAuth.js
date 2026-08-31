import { authorizeReadWrite } from "@/lib/auth";

export const authorizeFbfFbaMaster = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "fbfFbaMaster",
    editColumnName: "allow_edit_fbf_fba",
    adminOnlyDelete: true,
    deleteFlag: "allow_delete_fbfFbaMaster",
    denyMessage: "You do not have permission to manage FBF/FBA Master data.",
  });
