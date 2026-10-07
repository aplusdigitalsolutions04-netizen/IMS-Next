import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { authorizeGroups, loadCompanyNames, buildContractRows, insertRows, CONTRACT_COLS } from "@/lib/contractGroupsHelpers";
import { readSheetRows, cellOf, GROUP_COLUMNS } from "@/lib/contractGroupsExcel";

// Creates groups from an Excel file of "Group Name | Contract Number" lines, inside the company the
// user is working in. Nothing is written to the contracts themselves (groups hold snapshot copies).
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const { map, data, headers } = readSheetRows(Buffer.from(await file.arrayBuffer()), GROUP_COLUMNS, 2);
  if (!map) {
    throw new ApiError(400, `Could not find the columns. Expected "Group Name" and "Contract Number" (download the Template). Found: ${headers.join(", ") || "(nothing)"}`);
  }
  if (!data.length) throw new ApiError(400, "The file has no data rows.");

  // group name -> [{ number, rowNum }]
  const wanted = new Map();
  for (const entry of data) {
    const name = String(cellOf(entry, map, "groupName") ?? "").trim();
    const number = String(cellOf(entry, map, "contractNumber") ?? "").trim();
    if (!name || !number) continue;
    if (!wanted.has(name)) wanted.set(name, []);
    wanted.get(name).push({ number, rowNum: entry.rowNum });
  }
  if (!wanted.size) throw new ApiError(400, "No lines with both a Group Name and a Contract Number.");

  const allNumbers = [...new Set([...wanted.values()].flat().map((x) => x.number.toLowerCase()))];
  const [contracts] = await mysqlPool.query(
    `SELECT ${CONTRACT_COLS} FROM contracts WHERE isDeleted = 0 AND companyGuid = ? AND LOWER(TRIM(contractNumber)) IN (?)`,
    [user.companyId, allNumbers]
  );
  const byNumber = new Map(contracts.map((c) => [String(c.contractNumber).trim().toLowerCase(), c]));
  const [takenRows] = contracts.length
    ? await mysqlPool.query(
        `SELECT r.sourceGuid, g.guid AS groupGuid, g.name AS groupName FROM contract_group_rows r JOIN contract_groups g ON g.guid = r.groupGuid
          WHERE r.sourceType = 'contract' AND g.isDeleted = 0 AND r.sourceGuid IN (?)`,
        [contracts.map((c) => c.guid)]
      )
    : [[]];
  const taken = new Map(takenRows.map((t) => [t.sourceGuid, t]));
  const [existingGroups] = await mysqlPool.query("SELECT guid, name FROM contract_groups WHERE isDeleted = 0 AND companyGuid = ?", [user.companyId]);
  const existingByName = new Map(existingGroups.map((g) => [g.name.trim().toLowerCase(), g]));
  const names = await loadCompanyNames();

  const results = { created: [], extended: [], failed: [], totalLines: data.length };
  for (const [name, lines] of wanted) {
    const usable = [];
    const seen = new Set();
    for (const { number, rowNum } of lines) {
      const c = byNumber.get(number.toLowerCase());
      if (!c) { results.failed.push({ row: rowNum, item: number, reason: "Contract not found in this company" }); continue; }
      if (seen.has(c.guid)) continue;
      seen.add(c.guid);
      const t = taken.get(c.guid);
      if (t) {
        const sameGroup = existingByName.get(name.toLowerCase())?.guid === t.groupGuid;
        results.failed.push({ row: rowNum, item: number, reason: sameGroup ? "Already in this group" : `Already in group "${t.groupName}"` });
        continue;
      }
      usable.push(c);
    }
    if (!usable.length) continue;

    const existing = existingByName.get(name.toLowerCase());
    if (existing) {
      await insertRows(existing.guid, await buildContractRows(usable, names));
      await mysqlPool.query("DELETE FROM contract_group_removed WHERE groupGuid = ? AND sourceGuid IN (?)", [existing.guid, usable.map((c) => c.guid)]);
      results.extended.push({ group: name, contracts: usable.length });
      continue;
    }
    if (usable.length < 2) {
      for (const c of usable) results.failed.push({ row: lines.find((l) => l.number.toLowerCase() === String(c.contractNumber).trim().toLowerCase())?.rowNum, item: c.contractNumber, reason: `Group "${name}" needs at least 2 contracts` });
      continue;
    }
    const guid = randomUUID();
    await mysqlPool.query(
      "INSERT INTO contract_groups (guid, companyGuid, name, matchFields, matchValues, createdBy) VALUES (?, ?, ?, ?, ?, ?)",
      [guid, user.companyId, name.slice(0, 255), JSON.stringify([]), JSON.stringify({}), user.username || user.id || null]
    );
    await insertRows(guid, await buildContractRows(usable, names));
    existingByName.set(name.toLowerCase(), { guid, name });
    for (const c of usable) taken.set(c.guid, { sourceGuid: c.guid, groupGuid: guid, groupName: name });
    results.created.push({ group: name, contracts: usable.length });
  }

  return NextResponse.json({
    message: `Import completed. Groups created: ${results.created.length}, groups extended: ${results.extended.length}, lines skipped: ${results.failed.length}`,
    results,
  });
});
