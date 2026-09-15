import { and, asc, eq, inArray } from "drizzle-orm";

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
  sitePermits,
  sites,
  vehicles,
} from "@/db/schema";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";
import { listPermitEwcAcceptances } from "@/modules/permits/core/resolvePermitEwcAcceptance";

export const dynamic = "force-dynamic";

/* WASTE_X_DESKTOP_OFFLINE_JOB_OPTIONS_V1 */

export async function GET(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    if (!context.defaultSiteId) {
      return clientApiError(
        "DESKTOP_SITE_REQUIRED",
        409,
        "This Waste X Desktop must be assigned to a site before it can create Jobs.",
      );
    }

    const ownSite = await database.query.sites.findFirst({
      where: and(
        eq(sites.id, context.defaultSiteId),
        eq(sites.organisationId, context.organisationId),
        eq(sites.status, "active"),
        eq(sites.siteType, "waste_receiving_site"),
      ),
      columns: {
        id: true,
        name: true,
        siteType: true,
      },
    });

    if (!ownSite) {
      return clientApiError(
        "DESKTOP_SITE_UNAVAILABLE",
        409,
        "The site assigned to this Waste X Desktop is not an active receiving site.",
      );
    }

    const primaryPermit = await database.query.sitePermits.findFirst({
      where: and(
        eq(sitePermits.organisationId, context.organisationId),
        eq(sitePermits.siteId, ownSite.id),
        eq(sitePermits.isPrimary, true),
        eq(sitePermits.status, "active"),
      ),
      columns: {
        id: true,
        permitNumber: true,
      },
    });

    if (!primaryPermit) {
      return clientApiError(
        "DESKTOP_SITE_PERMIT_REQUIRED",
        409,
        "This receiving site needs an active primary permit before Desktop can create Jobs.",
      );
    }

    const [
      clients,
      clientSites,
      hauliers,
      driverRows,
      vehicleRows,
      materials,
      ownPermitEwcs,
      facilities,
    ] = await Promise.all([
      database
        .select({
          id: counterparties.id,
          name: counterparties.name,
          accountReference: counterparties.accountReference,
        })
        .from(counterparties)
        .innerJoin(
          counterpartyRoles,
          and(
            eq(counterpartyRoles.counterpartyId, counterparties.id),
            eq(counterpartyRoles.organisationId, context.organisationId),
            eq(counterpartyRoles.role, "client"),
          ),
        )
        .where(
          and(
            eq(counterparties.organisationId, context.organisationId),
            eq(counterparties.isActive, true),
          ),
        )
        .orderBy(asc(counterparties.name)),

      database
        .select({
          id: counterpartySites.id,
          counterpartyId: counterpartySites.counterpartyId,
          name: counterpartySites.name,
          fullAddress: counterpartySites.fullAddress,
          postcode: counterpartySites.postcode,
          isDefault: counterpartySites.isDefault,
        })
        .from(counterpartySites)
        .where(
          and(
            eq(counterpartySites.organisationId, context.organisationId),
            eq(counterpartySites.siteType, "producer_site"),
            eq(counterpartySites.isActive, true),
          ),
        )
        .orderBy(asc(counterpartySites.name)),

      database
        .select({
          id: counterparties.id,
          name: counterparties.name,
          carrierRegistrationNumber: counterparties.carrierRegistrationNumber,
        })
        .from(counterparties)
        .innerJoin(
          counterpartyRoles,
          and(
            eq(counterpartyRoles.counterpartyId, counterparties.id),
            eq(counterpartyRoles.organisationId, context.organisationId),
            eq(counterpartyRoles.role, "haulier"),
          ),
        )
        .where(
          and(
            eq(counterparties.organisationId, context.organisationId),
            eq(counterparties.isActive, true),
          ),
        )
        .orderBy(asc(counterparties.name)),

      database
        .select({
          id: drivers.id,
          name: drivers.name,
          telephone: drivers.telephone,
          email: drivers.email,
          haulierCounterpartyId: drivers.haulierCounterpartyId,
          defaultVehicleId: drivers.defaultVehicleId,
        })
        .from(drivers)
        .where(
          and(
            eq(drivers.organisationId, context.organisationId),
            eq(drivers.isActive, true),
          ),
        )
        .orderBy(asc(drivers.name)),

      database
        .select({
          id: vehicles.id,
          registrationNumber: vehicles.registrationNumber,
          vehicleType: vehicles.vehicleType,
          tareWeightKg: vehicles.tareWeightKg,
          haulierCounterpartyId: vehicles.haulierCounterpartyId,
        })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.organisationId, context.organisationId),
            eq(vehicles.isActive, true),
          ),
        )
        .orderBy(asc(vehicles.registrationNumber)),

      database
        .select({
          id: materialProfiles.id,
          name: materialProfiles.name,
          ewcCodeId: materialProfiles.ewcCodeId,
          ewcCode: ewcCodes.code,
          wasteDescription: materialProfiles.wasteDescription,
          physicalForm: materialProfiles.physicalForm,
          defaultNumberOfContainers:
            materialProfiles.defaultNumberOfContainers,
          defaultContainerType: materialProfiles.defaultContainerType,
          containsPops: materialProfiles.containsPops,
          popsSourceOfComponents: materialProfiles.popsSourceOfComponents,
          popsComponents: materialProfiles.popsComponents,
          containsHazardous: materialProfiles.containsHazardous,
          hazardousSourceOfComponents:
            materialProfiles.hazardousSourceOfComponents,
          hazardousHazCodes: materialProfiles.hazardousHazCodes,
          hazardousComponents: materialProfiles.hazardousComponents,
          defaultDisposalRecoveryCodeId:
            materialProfiles.defaultDisposalRecoveryCodeId,
          disposalRecoveryCode: disposalRecoveryCodes.code,
          defaultWeightMetric: materialProfiles.defaultWeightMetric,
          isFavourite: materialProfiles.isFavourite,
        })
        .from(materialProfiles)
        .innerJoin(ewcCodes, eq(materialProfiles.ewcCodeId, ewcCodes.id))
        .leftJoin(
          disposalRecoveryCodes,
          eq(
            materialProfiles.defaultDisposalRecoveryCodeId,
            disposalRecoveryCodes.id,
          ),
        )
        .where(
          and(
            eq(materialProfiles.organisationId, context.organisationId),
            eq(materialProfiles.isActive, true),
            eq(ewcCodes.isActive, true),
            eq(ewcCodes.classificationUsable, true),
          ),
        )
        .orderBy(asc(materialProfiles.name)),

      database
        .select({
          ewcCodeId: permitEwcCodes.ewcCodeId,
        })
        .from(permitEwcCodes)
        .where(
          and(
            eq(permitEwcCodes.organisationId, context.organisationId),
            eq(permitEwcCodes.permitId, primaryPermit.id),
            eq(permitEwcCodes.isActive, true),
          ),
        ),

      database
        .select({
          id: counterpartySites.id,
          counterpartyId: counterpartySites.counterpartyId,
          name: counterpartySites.name,
          operatorName: counterparties.name,
          postcode: counterpartySites.postcode,
          fullAddress: counterpartySites.fullAddress,
          authorisationNumber: counterpartySites.authorisationNumber,
        })
        .from(counterpartySites)
        .innerJoin(
          counterparties,
          eq(counterparties.id, counterpartySites.counterpartyId),
        )
        .where(
          and(
            eq(counterpartySites.organisationId, context.organisationId),
            eq(counterpartySites.siteType, "third_party_tip"),
            eq(counterpartySites.isActive, true),
            eq(counterparties.isActive, true),
          ),
        )
        .orderBy(asc(counterparties.name), asc(counterpartySites.name)),
    ]);

    const facilityIds = facilities.map((facility) => facility.id);

    const activeAuthorisations =
      facilityIds.length > 0
        ? await database
            .select({
              id: counterpartySiteAuthorisations.id,
              counterpartySiteId:
                counterpartySiteAuthorisations.counterpartySiteId,
            })
            .from(counterpartySiteAuthorisations)
            .where(
              and(
                eq(
                  counterpartySiteAuthorisations.organisationId,
                  context.organisationId,
                ),
                inArray(
                  counterpartySiteAuthorisations.counterpartySiteId,
                  facilityIds,
                ),
                eq(counterpartySiteAuthorisations.status, "active"),
              ),
            )
        : [];

    const authorisationIds = activeAuthorisations.map((row) => row.id);

    const facilityEwcs =
      authorisationIds.length > 0
        ? await database
            .select({
              authorisationId: counterpartySiteEwcCodes.authorisationId,
              ewcCodeId: counterpartySiteEwcCodes.ewcCodeId,
            })
            .from(counterpartySiteEwcCodes)
            .where(
              and(
                eq(
                  counterpartySiteEwcCodes.organisationId,
                  context.organisationId,
                ),
                inArray(
                  counterpartySiteEwcCodes.authorisationId,
                  authorisationIds,
                ),
                eq(counterpartySiteEwcCodes.isActive, true),
              ),
            )
        : [];

    const authorisationToSite = new Map(
      activeAuthorisations.map((row) => [row.id, row.counterpartySiteId]),
    );

    const permittedByFacility = new Map<string, Set<string>>();

    for (const row of facilityEwcs) {
      const facilityId = authorisationToSite.get(row.authorisationId);
      if (!facilityId) continue;

      const current = permittedByFacility.get(facilityId) ?? new Set<string>();
      current.add(row.ewcCodeId);
      permittedByFacility.set(facilityId, current);
    }

    const permitAcceptances = await listPermitEwcAcceptances({
      organisationId: context.organisationId,
      siteId: ownSite.id,
      permitId: primaryPermit.id,
    });

    const effectivePermitEwcCodeIds = Array.from(
      new Set([
        ...permitAcceptances.exactEwcCodeIds,
        ...permitAcceptances.regulatory.map(
          (row) => row.acceptedEwcCodeId,
        ),
      ]),
    );

    return clientApiJson({
      ok: true,
      offlineCreateSchemaVersion: 1,
      ownSite,
      primaryPermit,
      permittedEwcCodeIds: effectivePermitEwcCodeIds,
      exactPermittedEwcCodeIds: permitAcceptances.exactEwcCodeIds,
      regulatoryAcceptanceAuthorities: permitAcceptances.regulatory,
      clients,
      clientSites,
      hauliers,
      drivers: driverRows,
      vehicles: vehicleRows,
      materials,
      facilities: facilities.map((facility) => ({
        ...facility,
        permittedEwcCodeIds: Array.from(
          permittedByFacility.get(facility.id) ?? new Set<string>(),
        ),
      })),
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
