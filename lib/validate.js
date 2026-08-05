import { ApiError } from "@/lib/auth";

// Thin wrapper around zod's `safeParse` that turns a failed validation into
// the same `ApiError(400, ...)` shape every route already throws for
// hand-rolled `if (!x) throw ...` checks — so adopting a schema here doesn't
// change the error contract routes/clients already expect.
export function validateBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first.path.join(".") || "body";
    throw new ApiError(400, `${field}: ${first.message}`);
  }
  return result.data;
}
