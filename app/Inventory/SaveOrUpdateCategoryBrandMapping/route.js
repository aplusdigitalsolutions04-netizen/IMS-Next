import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError, authorizeMasterWrite } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireAuth(user);

  const { MappingId, CategoryId, BrandId } = body;
  if (!CategoryId || !BrandId) throw new ApiError(400, "CategoryId and BrandId are required");

  const isCreate = !(MappingId && MappingId !== "0" && MappingId !== "");
  authorizeMasterWrite(user, "mapping", { isCreate });

  let finalMappingId = MappingId;
  if (MappingId && MappingId !== "0" && MappingId !== "") {
    await mysqlPool.execute("UPDATE inventorycategorybrandmapping SET categoryId = ?, brandId = ? WHERE mappingId = ?", [CategoryId, BrandId, MappingId]);
  } else {
    const [existing] = await mysqlPool.query("SELECT mappingId FROM inventorycategorybrandmapping WHERE categoryId = ? AND brandId = ? AND isDeleted = 0", [CategoryId, BrandId]);
    if (existing.length > 0) throw new ApiError(400, "This category-brand mapping already exists");
    finalMappingId = uuidv4();
    await mysqlPool.execute("INSERT INTO inventorycategorybrandmapping (mappingId, categoryId, brandId) VALUES (?, ?, ?)", [finalMappingId, CategoryId, BrandId]);
  }

  return NextResponse.json({ message: "Success", mappingId: finalMappingId });
});
