import { eq } from "drizzle-orm";
import { database } from "@/db/database";
import { isPlatformAdmin } from "@/lib/auth-utils";
import { AppUser } from "@/util/types";

export async function requireOrgAccess(
  table: any,
  idField: any,
  idValue: any,
  user: AppUser,
) {
  const query = database.query as any;

  const record = await query[table._.name].findFirst({
    where: (t: any, { eq }: any) => eq(idField, idValue),
  });
  if (!record) {
    throw new Error("Resource not found.");
  }

  if (isPlatformAdmin(user)) {
    return record;
  }

  if (!user.organisationId) {
    throw new Error("User organisation missing.");
  }

  if (record.organisationId !== user.organisationId) {
    throw new Error("Access denied.");
  }

  return record;
}
