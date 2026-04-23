import { database } from "@/db/database";
import { departments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function getCarrierDepartments(organisationId: string) {
  return database
    .select({
      id: departments.id,
      name: departments.name,
    })
    .from(departments)
    .where(
      and(
        eq(departments.organisationId, organisationId),
        eq(departments.type, "carrier"),
      ),
    );
}
