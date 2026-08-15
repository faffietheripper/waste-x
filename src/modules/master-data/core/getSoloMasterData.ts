// src/modules/master-data/core/getSoloMasterData.ts

import {
  and,
  asc,
  eq,
  inArray,
} from "drizzle-orm";

import { database } from "@/db/database";

import {
  counterparties,
  counterpartyRoles,
  counterpartySiteAuthorisations,
  counterpartySiteEwcCodes,
  counterpartySites,
  disposalRecoveryCodes,
  drivers,
  ewcCodes,
  materialProfiles,
  permitEwcCodes,
  rates,
  sitePermits,
  sites,
  vehicles,
} from "@/db/schema";

/* =========================================================
   SOLO MASTER DATA LOADER
   ---------------------------------------------------------
   Stage 2.8 has two jobs:

   1. Prove the reusable database hangs together.
   2. Give Stage 3 (Book a Job) one consistent master-data
      loader instead of rebuilding the same queries again.

   This does NOT create jobs or mutate any data.
========================================================= */

export async function getSoloMasterData(
  organisationId: string,
) {
  /* =======================================================
     RECEIVING SITE + PRIMARY PERMIT
  ======================================================= */

  const receivingSiteRows =
    await database
      .select({
        id: sites.id,
        name: sites.name,
        fullAddress: sites.fullAddress,
        postcode: sites.postcode,
        siteType: sites.siteType,
      })
      .from(sites)
      .where(
        and(
          eq(
            sites.organisationId,
            organisationId,
          ),
          eq(
            sites.status,
            "active",
          ),
          eq(
            sites.isDefault,
            true,
          ),
        ),
      )
      .limit(1);

  const receivingSite =
    receivingSiteRows[0] ?? null;

  const primaryPermitRows =
    receivingSite
      ? await database
          .select({
            id: sitePermits.id,
            permitNumber:
              sitePermits.permitNumber,
            regulator:
              sitePermits.regulator,
            authorisationType:
              sitePermits.authorisationType,
            status:
              sitePermits.status,
            validFrom:
              sitePermits.validFrom,
            expiresAt:
              sitePermits.expiresAt,
          })
          .from(sitePermits)
          .where(
            and(
              eq(
                sitePermits.organisationId,
                organisationId,
              ),
              eq(
                sitePermits.siteId,
                receivingSite.id,
              ),
              eq(
                sitePermits.isPrimary,
                true,
              ),
              eq(
                sitePermits.status,
                "active",
              ),
            ),
          )
          .limit(1)
      : [];

  const primaryPermit =
    primaryPermitRows[0] ?? null;

  const permittedEwcCodes =
    primaryPermit
      ? await database
          .select({
            id: ewcCodes.id,
            code: ewcCodes.code,
            description:
              ewcCodes.description,
            isHazardous:
              ewcCodes.isHazardous,
          })
          .from(permitEwcCodes)
          .innerJoin(
            ewcCodes,
            eq(
              permitEwcCodes.ewcCodeId,
              ewcCodes.id,
            ),
          )
          .where(
            and(
              eq(
                permitEwcCodes.organisationId,
                organisationId,
              ),
              eq(
                permitEwcCodes.permitId,
                primaryPermit.id,
              ),
              eq(
                permitEwcCodes.isActive,
                true,
              ),
              eq(
                ewcCodes.isActive,
                true,
              ),
            ),
          )
          .orderBy(
            asc(ewcCodes.code),
          )
      : [];

  /* =======================================================
     CLIENTS + CLIENT SITES
  ======================================================= */

  const clients =
    await database
      .select({
        id: counterparties.id,
        name: counterparties.name,
        accountReference:
          counterparties.accountReference,
        email: counterparties.email,
        telephone:
          counterparties.telephone,
        fullAddress:
          counterparties.fullAddress,
        postcode:
          counterparties.postcode,
        paymentTermsDays:
          counterparties.paymentTermsDays,
      })
      .from(counterparties)
      .innerJoin(
        counterpartyRoles,
        and(
          eq(
            counterpartyRoles.counterpartyId,
            counterparties.id,
          ),
          eq(
            counterpartyRoles.role,
            "client",
          ),
        ),
      )
      .where(
        and(
          eq(
            counterparties.organisationId,
            organisationId,
          ),
          eq(
            counterparties.isActive,
            true,
          ),
        ),
      )
      .orderBy(
        asc(counterparties.name),
      );

  const clientIds =
    clients.map(
      (client) => client.id,
    );

  const clientSites =
    clientIds.length > 0
      ? await database
          .select({
            id:
              counterpartySites.id,
            counterpartyId:
              counterpartySites.counterpartyId,
            name:
              counterpartySites.name,
            fullAddress:
              counterpartySites.fullAddress,
            postcode:
              counterpartySites.postcode,
            contactName:
              counterpartySites.contactName,
            contactEmail:
              counterpartySites.contactEmail,
            contactTelephone:
              counterpartySites.contactTelephone,
            isDefault:
              counterpartySites.isDefault,
            siteType:
              counterpartySites.siteType,
          })
          .from(
            counterpartySites,
          )
          .where(
            and(
              eq(
                counterpartySites.organisationId,
                organisationId,
              ),
              eq(
                counterpartySites.isActive,
                true,
              ),
              inArray(
                counterpartySites.counterpartyId,
                clientIds,
              ),
            ),
          )
          .orderBy(
            asc(
              counterpartySites.name,
            ),
          )
      : [];

  /* =======================================================
     HAULIERS + DRIVERS + VEHICLES
  ======================================================= */

  const hauliers =
    await database
      .select({
        id: counterparties.id,
        name: counterparties.name,
        carrierRegistrationNumber:
          counterparties.carrierRegistrationNumber,
        email: counterparties.email,
        telephone:
          counterparties.telephone,
      })
      .from(counterparties)
      .innerJoin(
        counterpartyRoles,
        and(
          eq(
            counterpartyRoles.counterpartyId,
            counterparties.id,
          ),
          eq(
            counterpartyRoles.role,
            "haulier",
          ),
        ),
      )
      .where(
        and(
          eq(
            counterparties.organisationId,
            organisationId,
          ),
          eq(
            counterparties.isActive,
            true,
          ),
        ),
      )
      .orderBy(
        asc(counterparties.name),
      );

  const activeDrivers =
    await database
      .select({
        id: drivers.id,
        name: drivers.name,
        telephone:
          drivers.telephone,
        email: drivers.email,
        haulierCounterpartyId:
          drivers.haulierCounterpartyId,
        defaultVehicleId:
          drivers.defaultVehicleId,
      })
      .from(drivers)
      .where(
        and(
          eq(
            drivers.organisationId,
            organisationId,
          ),
          eq(
            drivers.isActive,
            true,
          ),
        ),
      )
      .orderBy(
        asc(drivers.name),
      );

  const activeVehicles =
    await database
      .select({
        id: vehicles.id,
        registrationNumber:
          vehicles.registrationNumber,
        vehicleType:
          vehicles.vehicleType,
        tareWeightKg:
          vehicles.tareWeightKg,
        haulierCounterpartyId:
          vehicles.haulierCounterpartyId,
      })
      .from(vehicles)
      .where(
        and(
          eq(
            vehicles.organisationId,
            organisationId,
          ),
          eq(
            vehicles.isActive,
            true,
          ),
        ),
      )
      .orderBy(
        asc(
          vehicles.registrationNumber,
        ),
      );

  /* =======================================================
     MATERIAL PROFILES
  ======================================================= */

  const materials =
    await database
      .select({
        id: materialProfiles.id,
        name: materialProfiles.name,
        siteId:
          materialProfiles.siteId,
        ewcCodeId:
          materialProfiles.ewcCodeId,
        ewcCode: ewcCodes.code,
        ewcDescription:
          ewcCodes.description,
        ewcIsHazardous:
          ewcCodes.isHazardous,
        wasteDescription:
          materialProfiles.wasteDescription,
        physicalForm:
          materialProfiles.physicalForm,
        defaultNumberOfContainers:
          materialProfiles.defaultNumberOfContainers,
        defaultContainerType:
          materialProfiles.defaultContainerType,
        containsPops:
          materialProfiles.containsPops,
        containsHazardous:
          materialProfiles.containsHazardous,
        defaultWeightMetric:
          materialProfiles.defaultWeightMetric,
        isFavourite:
          materialProfiles.isFavourite,
        disposalRecoveryCodeId:
          materialProfiles.defaultDisposalRecoveryCodeId,
        disposalRecoveryCode:
          disposalRecoveryCodes.code,
        disposalRecoveryDescription:
          disposalRecoveryCodes.description,
      })
      .from(materialProfiles)
      .innerJoin(
        ewcCodes,
        eq(
          materialProfiles.ewcCodeId,
          ewcCodes.id,
        ),
      )
      .leftJoin(
        disposalRecoveryCodes,
        eq(
          materialProfiles.defaultDisposalRecoveryCodeId,
          disposalRecoveryCodes.id,
        ),
      )
      .where(
        and(
          eq(
            materialProfiles.organisationId,
            organisationId,
          ),
          eq(
            materialProfiles.isActive,
            true,
          ),
        ),
      )
      .orderBy(
        asc(
          materialProfiles.name,
        ),
      );

  /* =======================================================
     THIRD-PARTY FACILITIES
  ======================================================= */

  const externalFacilities =
    await database
      .select({
        id: counterpartySites.id,
        counterpartyId:
          counterpartySites.counterpartyId,
        operatorName:
          counterparties.name,
        facilityName:
          counterpartySites.name,
        fullAddress:
          counterpartySites.fullAddress,
        postcode:
          counterpartySites.postcode,
        legacyAuthorisationNumber:
          counterpartySites.authorisationNumber,
      })
      .from(counterpartySites)
      .innerJoin(
        counterparties,
        eq(
          counterpartySites.counterpartyId,
          counterparties.id,
        ),
      )
      .innerJoin(
        counterpartyRoles,
        and(
          eq(
            counterpartyRoles.counterpartyId,
            counterparties.id,
          ),
          eq(
            counterpartyRoles.role,
            "third_party_tip",
          ),
        ),
      )
      .where(
        and(
          eq(
            counterpartySites.organisationId,
            organisationId,
          ),
          eq(
            counterparties.organisationId,
            organisationId,
          ),
          eq(
            counterparties.isActive,
            true,
          ),
          eq(
            counterpartySites.isActive,
            true,
          ),
          eq(
            counterpartySites.siteType,
            "third_party_tip",
          ),
        ),
      )
      .orderBy(
        asc(
          counterpartySites.name,
        ),
      );

  const externalFacilityIds =
    externalFacilities.map(
      (facility) => facility.id,
    );

  const externalAuthorisations =
    externalFacilityIds.length > 0
      ? await database
          .select({
            id:
              counterpartySiteAuthorisations.id,
            counterpartySiteId:
              counterpartySiteAuthorisations.counterpartySiteId,
            authorisationNumber:
              counterpartySiteAuthorisations.authorisationNumber,
            regulator:
              counterpartySiteAuthorisations.regulator,
            authorisationType:
              counterpartySiteAuthorisations.authorisationType,
            status:
              counterpartySiteAuthorisations.status,
            isPrimary:
              counterpartySiteAuthorisations.isPrimary,
            validFrom:
              counterpartySiteAuthorisations.validFrom,
            expiresAt:
              counterpartySiteAuthorisations.expiresAt,
            verificationSource:
              counterpartySiteAuthorisations.verificationSource,
            verifiedAt:
              counterpartySiteAuthorisations.verifiedAt,
          })
          .from(
            counterpartySiteAuthorisations,
          )
          .where(
            and(
              eq(
                counterpartySiteAuthorisations.organisationId,
                organisationId,
              ),
              inArray(
                counterpartySiteAuthorisations.counterpartySiteId,
                externalFacilityIds,
              ),
            ),
          )
          .orderBy(
            asc(
              counterpartySiteAuthorisations.authorisationNumber,
            ),
          )
      : [];

  const authorisationIds =
    externalAuthorisations.map(
      (authorisation) =>
        authorisation.id,
    );

  const externalFacilityEwcCodes =
    authorisationIds.length > 0
      ? await database
          .select({
            authorisationId:
              counterpartySiteEwcCodes.authorisationId,
            ewcCodeId:
              ewcCodes.id,
            code:
              ewcCodes.code,
            description:
              ewcCodes.description,
            isHazardous:
              ewcCodes.isHazardous,
          })
          .from(
            counterpartySiteEwcCodes,
          )
          .innerJoin(
            ewcCodes,
            eq(
              counterpartySiteEwcCodes.ewcCodeId,
              ewcCodes.id,
            ),
          )
          .where(
            and(
              eq(
                counterpartySiteEwcCodes.organisationId,
                organisationId,
              ),
              eq(
                counterpartySiteEwcCodes.isActive,
                true,
              ),
              eq(
                ewcCodes.isActive,
                true,
              ),
              inArray(
                counterpartySiteEwcCodes.authorisationId,
                authorisationIds,
              ),
            ),
          )
          .orderBy(
            asc(ewcCodes.code),
          )
      : [];

  /* =======================================================
     COMMERCIAL RATES
  ======================================================= */

  const activeRates =
    await database
      .select({
        id: rates.id,
        rateType: rates.rateType,
        unit: rates.unit,
        amount: rates.amount,
        currency: rates.currency,
        counterpartyId:
          rates.counterpartyId,
        counterpartySiteId:
          rates.counterpartySiteId,
        ownSiteId:
          rates.ownSiteId,
        materialProfileId:
          rates.materialProfileId,
        effectiveFrom:
          rates.effectiveFrom,
        effectiveTo:
          rates.effectiveTo,
      })
      .from(rates)
      .where(
        and(
          eq(
            rates.organisationId,
            organisationId,
          ),
          eq(
            rates.isActive,
            true,
          ),
        ),
      );

  return {
    receivingSite,
    primaryPermit,
    permittedEwcCodes,

    clients,
    clientSites,

    hauliers,
    drivers: activeDrivers,
    vehicles: activeVehicles,

    materials,

    externalFacilities,
    externalAuthorisations,
    externalFacilityEwcCodes,

    rates: activeRates,
  };
}

export type SoloMasterData =
  Awaited<
    ReturnType<
      typeof getSoloMasterData
    >
  >;
