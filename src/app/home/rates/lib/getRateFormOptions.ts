// src/app/home/rates/_lib/getRateFormOptions.ts

import { and, asc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  counterpartySites,
  ewcCodes,
  materialProfiles,
  sites,
} from "@/db/schema";

export async function getRateFormOptions(organisationId: string) {
  const [clients, hauliers, externalFacilities, allCounterparties, materials, ownSites] =
    await Promise.all([
      database
        .select({
          id: counterparties.id,
          name: counterparties.name,
        })
        .from(counterparties)
        .innerJoin(
          counterpartyRoles,
          and(
            eq(counterpartyRoles.counterpartyId, counterparties.id),
            eq(counterpartyRoles.role, "client"),
          ),
        )
        .where(
          and(
            eq(counterparties.organisationId, organisationId),
            eq(counterparties.isActive, true),
          ),
        )
        .orderBy(asc(counterparties.name)),

      database
        .select({
          id: counterparties.id,
          name: counterparties.name,
        })
        .from(counterparties)
        .innerJoin(
          counterpartyRoles,
          and(
            eq(counterpartyRoles.counterpartyId, counterparties.id),
            eq(counterpartyRoles.role, "haulier"),
          ),
        )
        .where(
          and(
            eq(counterparties.organisationId, organisationId),
            eq(counterparties.isActive, true),
          ),
        )
        .orderBy(asc(counterparties.name)),

      database
        .select({
          id: counterpartySites.id,
          counterpartyId: counterpartySites.counterpartyId,
          name: counterpartySites.name,
          postcode: counterpartySites.postcode,
        })
        .from(counterpartySites)
        .innerJoin(
          counterparties,
          eq(counterpartySites.counterpartyId, counterparties.id),
        )
        .innerJoin(
          counterpartyRoles,
          and(
            eq(counterpartyRoles.counterpartyId, counterparties.id),
            eq(counterpartyRoles.role, "third_party_tip"),
          ),
        )
        .where(
          and(
            eq(counterpartySites.organisationId, organisationId),
            eq(counterpartySites.siteType, "third_party_tip"),
            eq(counterpartySites.isActive, true),
            eq(counterparties.isActive, true),
          ),
        )
        .orderBy(asc(counterpartySites.name)),

      database
        .select({
          id: counterparties.id,
          name: counterparties.name,
        })
        .from(counterparties)
        .where(
          and(
            eq(counterparties.organisationId, organisationId),
            eq(counterparties.isActive, true),
          ),
        )
        .orderBy(asc(counterparties.name)),

      database
        .select({
          id: materialProfiles.id,
          name: materialProfiles.name,
          ewcCode: ewcCodes.code,
        })
        .from(materialProfiles)
        .innerJoin(ewcCodes, eq(materialProfiles.ewcCodeId, ewcCodes.id))
        .where(
          and(
            eq(materialProfiles.organisationId, organisationId),
            eq(materialProfiles.isActive, true),
          ),
        )
        .orderBy(asc(materialProfiles.name)),

      database
        .select({
          id: sites.id,
          name: sites.name,
        })
        .from(sites)
        .where(
          and(
            eq(sites.organisationId, organisationId),
            eq(sites.status, "active"),
          ),
        )
        .orderBy(asc(sites.name)),
    ]);

  const clientSites = await database
    .select({
      id: counterpartySites.id,
      counterpartyId: counterpartySites.counterpartyId,
      name: counterpartySites.name,
      postcode: counterpartySites.postcode,
    })
    .from(counterpartySites)
    .where(
      and(
        eq(counterpartySites.organisationId, organisationId),
        eq(counterpartySites.siteType, "producer_site"),
        eq(counterpartySites.isActive, true),
      ),
    )
    .orderBy(asc(counterpartySites.name));

  return {
    clients,
    clientSites,
    hauliers,
    externalFacilities,
    allCounterparties,
    materials,
    ownSites,
  };
}
