import { eq, and } from "drizzle-orm";
import { isPlatformAdmin } from "./auth-utils";
import { AppUser } from "@/util/types";

export function buildOrgScope(
  table: any,
  idField: any,
  idValue: any,
  user?: AppUser | null,
) {
  if (!user) {
    throw new Error("User not authenticated.");
  }

  if (isPlatformAdmin(user)) {
    return eq(idField, idValue);
  }

  if (!user.organisationId) {
    throw new Error("Organisation context missing.");
  }

  return and(
    eq(idField, idValue),
    eq((table as any).organisationId, user.organisationId),
  );
}
