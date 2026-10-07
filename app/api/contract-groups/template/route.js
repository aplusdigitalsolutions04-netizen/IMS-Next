import * as xlsx from "xlsx";
import { authenticateRequest } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { authorizeGroups } from "@/lib/contractGroupsHelpers";
import { sheetFromObjects, sheetFromLines, workbookResponse } from "@/lib/contractGroupsExcel";

// Import template for creating groups in bulk: one line per contract, repeating the group name.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);

  const headers = ["Group Name", "Contract Number"];
  const sample = [
    { "Group Name": "Example Department A", "Contract Number": "GEMC-511687700000001" },
    { "Group Name": "Example Department A", "Contract Number": "GEMC-511687700000002" },
    { "Group Name": "Example Department B", "Contract Number": "GEMC-511687700000003" },
    { "Group Name": "Example Department B", "Contract Number": "GEMC-511687700000004" },
  ];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, sheetFromObjects(sample, headers, [44, 28]), "Groups");
  xlsx.utils.book_append_sheet(wb, sheetFromLines([
    "Import template - create Contract Groups from Excel",
    "",
    "1. One line per contract: the Group Name, and the Contract Number to put in it. Repeat the group name on every line of that group.",
    "2. Delete the example lines and add your own, then use Import on the Contract Groups page.",
    "3. Groups are created in the company selected in the top bar. Only that company's contracts are used.",
    "4. A new group needs at least 2 contracts. If a group with the same name already exists, the contracts are added to it.",
    "5. A contract can be in only one group - contracts that are already grouped, or not found, are listed as failed and skipped.",
    "6. To change numbers of a group's rows (landing price, delivered qty, commission...), open the group and use its own Template / Import.",
  ]), "Instructions");
  return workbookResponse(wb, "contract_groups_import_template.xlsx");
});
