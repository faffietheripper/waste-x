import { database } from "@/db/database";
import { organisations } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

export type CarrierOrganisationOption = {
  id: string;
  name: string;
  emailAddress: string | null;
  isInternal: boolean;
};

export async function getInternalCarriers(
  organisationId: string,
): Promise<CarrierOrganisationOption[]> {
  if (!organisationId) return [];

  const carrierOrganisations = await database
    .select({
      id: organisations.id,
      name: organisations.teamName,
      emailAddress: organisations.emailAddress,
      status: organisations.status,
    })
    .from(organisations)
    .where(
      and(
        eq(organisations.status, "ACTIVE"),
        sql`${organisations.capabilities} @> ARRAY['carrier']::text[]`,
      ),
    )
    .orderBy(asc(organisations.teamName));

  return carrierOrganisations.map((organisation) => ({
    id: organisation.id,
    name: organisation.name,
    emailAddress: organisation.emailAddress,
    isInternal: organisation.id === organisationId,
  }));
}