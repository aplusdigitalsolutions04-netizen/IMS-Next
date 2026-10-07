import { NextResponse } from "next/server";
import { authenticateRequest, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { authorizeGroups, scopeCompanyGuids, loadCompanyNames, loadUngroupedContracts, isValidMatchFields, fieldValue } from "@/lib/contractGroupsHelpers";

// Finds combinations: contracts (not yet in any group) that share the SAME
// value for every chosen field, keeping only combinations with 2+ contracts.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { fields } = await parseJsonBody(request);
  if (!isValidMatchFields(fields)) throw new ApiError(400, "Choose at least one matching field.");

  const contracts = await loadUngroupedContracts(scopeCompanyGuids(user));
  const names = await loadCompanyNames();

  const clusters = new Map();
  for (const c of contracts) {
    const values = fields.map((f) => fieldValue(c, f));
    if (values.some((v) => !v)) continue;
    const key = values.join("||");
    if (!clusters.has(key)) clusters.set(key, { matchValues: Object.fromEntries(fields.map((f, i) => [f, values[i]])), contracts: [] });
    clusters.get(key).contracts.push(c);
  }

  const result = [...clusters.values()]
    .filter((cl) => cl.contracts.length > 1)
    .map((cl) => {
      const c0 = cl.contracts[0];
      return {
        matchValues: cl.matchValues,
        label: c0.organisation || c0.department || c0.buyerGstin || c0.contractNumber,
        sample: Object.fromEntries(fields.map((f) => [f, c0[f] || ""])),
        contracts: cl.contracts.map((c) => ({ guid: c.guid, contractNumber: c.contractNumber, companyName: names.get(c.companyGuid) || "", generatedDate: c.generatedDate })),
      };
    })
    .sort((a, b) => b.contracts.length - a.contracts.length);

  return NextResponse.json({ clusters: result });
});
