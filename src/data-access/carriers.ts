import { database } from "@/db/database";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getInternalCarriers(organisationId: string) {
  return database
    .select({
      id: organisations.id,
      name: organisations.teamName,
    })
    .from(organisations)
    .where(eq(organisations.parentOrganisationId, organisationId));
}
