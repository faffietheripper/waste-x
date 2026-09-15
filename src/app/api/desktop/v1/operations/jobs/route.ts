import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { jobCommercialLines } from "@/db/commercial-schema";
import { syncEntityVersions } from "@/db/client-sync-schema";
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
  jobLoads,
  jobLoadWasteItems,
  jobs,
  materialProfiles,
  rates,
  sitePermits,
  sites,
  vehicles,
} from "@/db/schema";
import {
  bookingCommercialLines,
  parseIncomingBookingPricing,
  parseOutgoingBookingPricing,
} from "@/modules/commercial/bookingPricing";
import { resolvePermitEwcAcceptance } from "@/modules/permits/core/resolvePermitEwcAcceptance";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import { recordSyncChange } from "@/lib/client-api/change-feed";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

/* WASTE_X_DESKTOP_CLIENT_STABLE_JOB_IDS_V1 */

const optionalText = z.string().trim().max(4000).nullable().optional();

const createJobSchema = z.object({
  direction: z.enum(["incoming", "outgoing"]),
  jobDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedLoads: z.number().int().min(1).max(100),

  purchaseOrder: optionalText,
  customerReference: optionalText,
  notes: optionalText,

  clientId: z.string().trim().min(1).nullable().optional(),
  clientSiteId: z.string().trim().min(1).nullable().optional(),
  destinationSiteId: z.string().trim().min(1).nullable().optional(),

  transportMode: z.enum(["own", "external"]),
  haulierId: z.string().trim().min(1).nullable().optional(),
  driverId: z.string().trim().min(1).nullable().optional(),
  vehicleId: z.string().trim().min(1).nullable().optional(),

  materialProfileId: z.string().trim().min(1),
  materialProfileIds: z
    .array(z.string().trim().min(1))
    .max(8)
    .optional(),

  // Optional for compatibility with older online Desktop builds.
  clientJobId: z.string().uuid().optional(),
  clientJobNumber: z.string().trim().min(1).max(80).optional(),
  clientLoadIds: z.array(z.string().uuid()).max(100).optional(),
  clientWasteItemIds: z
    .array(z.array(z.string().uuid()).max(8))
    .max(100)
    .optional(),

  pricing: z.record(z.string(), z.string().max(500)).default({}),
});

function parseJobDate(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

async function generateJobNumber(
  organisationId: string,
  jobDate: Date,
  direction: "incoming" | "outgoing",
) {
  const datePart = jobDate.toISOString().slice(0, 10).replaceAll("-", "");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = crypto
      .randomUUID()
      .replaceAll("-", "")
      .slice(0, 6)
      .toUpperCase();

    const candidate =
      direction === "outgoing"
        ? `WX-OUT-${datePart}-${suffix}`
        : `WX-${datePart}-${suffix}`;

    const existing = await database.query.jobs.findFirst({
      where: and(
        eq(jobs.organisationId, organisationId),
        eq(jobs.jobNumber, candidate),
      ),
      columns: { id: true },
    });

    if (!existing) return candidate;
  }

  throw new Error("Unable to generate a unique Waste X Job number.");
}

async function readEntityVersions(
  organisationId: string,
  entityIds: string[],
) {
  if (entityIds.length === 0) return [];

  return database
    .select({
      entityType: syncEntityVersions.entityType,
      entityId: syncEntityVersions.entityId,
      version: syncEntityVersions.version,
    })
    .from(syncEntityVersions)
    .where(
      and(
        eq(syncEntityVersions.organisationId, organisationId),
        inArray(syncEntityVersions.entityId, entityIds),
      ),
    );
}

function pricingFormData(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

export async function POST(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const parsed = createJobSchema.safeParse(await request.json());

    if (!parsed.success) {
      return clientApiError(
        "INVALID_DESKTOP_JOB",
        400,
        "The Desktop Job details are invalid.",
        parsed.error.flatten(),
      );
    }

    if (!context.defaultSiteId) {
      return clientApiError(
        "DESKTOP_SITE_REQUIRED",
        409,
        "This Waste X Desktop must be assigned to a site before it can create Jobs.",
      );
    }

    const input = parsed.data;

    const identityParts = [
      input.clientJobId,
      input.clientJobNumber,
      input.clientLoadIds,
      input.clientWasteItemIds,
    ];
    const hasAnyClientIdentity = identityParts.some((value) => value !== undefined);
    const hasFullClientIdentity = identityParts.every((value) => value !== undefined);

    if (hasAnyClientIdentity && !hasFullClientIdentity) {
      return clientApiError(
        "INCOMPLETE_DESKTOP_JOB_IDENTITY",
        400,
        "Waste X Desktop must supply the complete offline Job identity bundle.",
      );
    }

    /* Response-loss idempotency for locally-generated Job identities. */
    if (input.clientJobId) {
      const existingJob = await database.query.jobs.findFirst({
        where: eq(jobs.id, input.clientJobId),
      });

      if (existingJob) {
        if (existingJob.organisationId !== context.organisationId) {
          return clientApiError(
            "DESKTOP_JOB_ID_COLLISION",
            409,
            "That Desktop Job identity is not available.",
          );
        }

        const existingLoads = await database
          .select()
          .from(jobLoads)
          .where(
            and(
              eq(jobLoads.organisationId, context.organisationId),
              eq(jobLoads.jobId, existingJob.id),
            ),
          )
          .orderBy(asc(jobLoads.loadNumber));

        const expectedLoadIds = input.clientLoadIds ?? [];
        const idsMatch =
          expectedLoadIds.length === existingLoads.length &&
          existingLoads.every(
            (load, index) => load.id === expectedLoadIds[index],
          );

        if (
          existingLoads.length !== input.plannedLoads ||
          !idsMatch ||
          existingJob.jobNumber !== input.clientJobNumber
        ) {
          return clientApiError(
            "DESKTOP_JOB_REPLAY_MISMATCH",
            409,
            "The stored Cloud Job does not match this Desktop replay identity.",
          );
        }

        const entityVersions = await readEntityVersions(
          context.organisationId,
          [existingJob.id, ...existingLoads.map((load) => load.id)],
        );

        return clientApiJson({
          ok: true,
          duplicate: true,
          job: existingJob,
          jobLoads: existingLoads,
          firstLoadId: existingLoads[0]?.id ?? null,
          syncFeedWarning: false,
          entityVersions,
        });
      }
    }

    if (
      input.clientLoadIds &&
      (input.clientLoadIds.length !== input.plannedLoads ||
        new Set(input.clientLoadIds).size !== input.clientLoadIds.length)
    ) {
      return clientApiError(
        "INVALID_DESKTOP_LOAD_IDENTITIES",
        400,
        "Desktop supplied invalid planned Load identities.",
      );
    }

    const materialProfileIds = Array.from(
      new Set([
        input.materialProfileId,
        ...(input.materialProfileIds ?? []),
      ]),
    );

    if (input.clientWasteItemIds) {
      const correctShape =
        input.clientWasteItemIds.length === input.plannedLoads &&
        input.clientWasteItemIds.every(
          (row) => row.length === materialProfileIds.length,
        );
      const flatWasteItemIds = input.clientWasteItemIds.flat();

      if (
        !correctShape ||
        new Set(flatWasteItemIds).size !== flatWasteItemIds.length
      ) {
        return clientApiError(
          "INVALID_DESKTOP_WASTE_ITEM_IDENTITIES",
          400,
          "Desktop supplied invalid Waste Item identities.",
        );
      }
    }

    if (
      input.direction === "outgoing" &&
      materialProfileIds.length > 1
    ) {
      return clientApiError(
        "MULTI_ITEM_INCOMING_ONLY",
        400,
        "This pilot enables multiple Waste Items on one physical Load for incoming receiving Jobs.",
      );
    }

    const jobDate = parseJobDate(input.jobDate);

    if (!jobDate) {
      return clientApiError(
        "INVALID_JOB_DATE",
        400,
        "Enter a valid Job date.",
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
        eq(sitePermits.status, "active"),
        eq(sitePermits.isPrimary, true),
      ),
      columns: {
        id: true,
        permitNumber: true,
      },
    });

    if (!primaryPermit) {
      return clientApiError(
        "SITE_PERMIT_REQUIRED",
        409,
        "This site needs an active primary permit before Desktop can create Jobs.",
      );
    }

    const resolvedHaulierId =
      input.transportMode === "external" ? input.haulierId ?? null : null;
    const resolvedDriverId = input.driverId ?? null;
    const resolvedVehicleId = input.vehicleId ?? null;

    if (input.transportMode === "external" && !resolvedHaulierId) {
      return clientApiError(
        "HAULIER_REQUIRED",
        400,
        "Choose an external haulier.",
      );
    }

    if (resolvedHaulierId) {
      const haulier = await database
        .select({ id: counterparties.id })
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
            eq(counterparties.id, resolvedHaulierId),
            eq(counterparties.organisationId, context.organisationId),
            eq(counterparties.isActive, true),
          ),
        )
        .limit(1);

      if (!haulier[0]) {
        return clientApiError(
          "INVALID_HAULIER",
          400,
          "That haulier is no longer available.",
        );
      }
    }

    if (resolvedDriverId) {
      const driver = await database.query.drivers.findFirst({
        where: and(
          eq(drivers.id, resolvedDriverId),
          eq(drivers.organisationId, context.organisationId),
          eq(drivers.isActive, true),
        ),
        columns: {
          id: true,
          haulierCounterpartyId: true,
        },
      });

      if (!driver) {
        return clientApiError(
          "INVALID_DRIVER",
          400,
          "That Driver is no longer available.",
        );
      }

      if (driver.haulierCounterpartyId !== resolvedHaulierId) {
        return clientApiError(
          resolvedHaulierId
            ? "DRIVER_NOT_FOR_HAULIER"
            : "DRIVER_NOT_FOR_OWN_TRANSPORT",
          400,
          resolvedHaulierId
            ? "The selected Driver does not belong to that haulier."
            : "The selected Driver is not an own-fleet Driver.",
        );
      }
    }

    if (resolvedVehicleId) {
      const vehicle = await database.query.vehicles.findFirst({
        where: and(
          eq(vehicles.id, resolvedVehicleId),
          eq(vehicles.organisationId, context.organisationId),
          eq(vehicles.isActive, true),
        ),
        columns: {
          id: true,
          haulierCounterpartyId: true,
        },
      });

      if (!vehicle) {
        return clientApiError(
          "INVALID_VEHICLE",
          400,
          "That Vehicle is no longer available.",
        );
      }

      if (vehicle.haulierCounterpartyId !== resolvedHaulierId) {
        return clientApiError(
          resolvedHaulierId
            ? "VEHICLE_NOT_FOR_HAULIER"
            : "VEHICLE_NOT_FOR_OWN_TRANSPORT",
          400,
          resolvedHaulierId
            ? "The selected Vehicle does not belong to that haulier."
            : "The selected Vehicle is not an own-fleet Vehicle.",
        );
      }
    }

    const materialRows = await database
      .select({
        id: materialProfiles.id,
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
        defaultWeightMetric: materialProfiles.defaultWeightMetric,
        disposalRecoveryCode: disposalRecoveryCodes.code,
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
          inArray(materialProfiles.id, materialProfileIds),
          eq(materialProfiles.organisationId, context.organisationId),
          eq(materialProfiles.isActive, true),
          eq(ewcCodes.isActive, true),
          eq(ewcCodes.classificationUsable, true),
        ),
      );

    const materialById = new Map(
      materialRows.map((row) => [row.id, row]),
    );
    const selectedMaterials = materialProfileIds
      .map((id) => materialById.get(id))
      .filter(
        (row): row is (typeof materialRows)[number] => Boolean(row),
      );

    if (selectedMaterials.length !== materialProfileIds.length) {
      return clientApiError(
        "INVALID_MATERIAL",
        400,
        "One or more selected Material / waste profiles are no longer available.",
      );
    }

    const material = selectedMaterials[0];

    if (!material) {
      return clientApiError(
        "INVALID_MATERIAL",
        400,
        "Choose at least one Material / waste profile.",
      );
    }

    const materialAcceptances: Array<{
      material: (typeof materialRows)[number];
      acceptance: Extract<
        Awaited<ReturnType<typeof resolvePermitEwcAcceptance>>,
        { allowed: true }
      >;
    }> = [];

    for (const selectedMaterial of selectedMaterials) {
      const acceptance = await resolvePermitEwcAcceptance({
        organisationId: context.organisationId,
        siteId: ownSite.id,
        permitId: primaryPermit.id,
        ewcCodeId: selectedMaterial.ewcCodeId,
        at: jobDate,
      });

      if (!acceptance.allowed) {
        return clientApiError(
          "MATERIAL_NOT_PERMITTED_AT_SITE",
          400,
          `${selectedMaterial.ewcCode} has neither an exact permit match nor an enabled regulatory acceptance rule for this site.`,
        );
      }

      materialAcceptances.push({
        material: selectedMaterial,
        acceptance,
      });
    }

    const ownPermitAcceptance = materialAcceptances[0]!.acceptance;

    let clientId: string | null = null;
    let clientSiteId: string | null = null;
    let destinationSiteId: string | null = null;

    if (input.direction === "incoming") {
      clientId = input.clientId ?? null;
      clientSiteId = input.clientSiteId ?? null;

      if (!clientId) {
        return clientApiError(
          "CLIENT_REQUIRED",
          400,
          "Choose the source company / client for this incoming Job.",
        );
      }

      if (!clientSiteId) {
        return clientApiError(
          "CLIENT_SITE_REQUIRED",
          400,
          "Choose the source site / project for this incoming Job.",
        );
      }

      const client = await database
        .select({ id: counterparties.id })
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
            eq(counterparties.id, clientId),
            eq(counterparties.organisationId, context.organisationId),
            eq(counterparties.isActive, true),
          ),
        )
        .limit(1);

      if (!client[0]) {
        return clientApiError(
          "INVALID_CLIENT",
          400,
          "That source company / client is no longer available.",
        );
      }

      const clientSite = await database.query.counterpartySites.findFirst({
        where: and(
          eq(counterpartySites.id, clientSiteId),
          eq(counterpartySites.organisationId, context.organisationId),
          eq(counterpartySites.counterpartyId, clientId),
          eq(counterpartySites.isActive, true),
        ),
        columns: { id: true },
      });

      if (!clientSite) {
        return clientApiError(
          "INVALID_CLIENT_SITE",
          400,
          "That source site does not belong to the selected company.",
        );
      }
    } else {
      destinationSiteId = input.destinationSiteId ?? null;

      if (!destinationSiteId) {
        return clientApiError(
          "DESTINATION_REQUIRED",
          400,
          "Choose the third-party destination facility.",
        );
      }

      const destination = await database.query.counterpartySites.findFirst({
        where: and(
          eq(counterpartySites.id, destinationSiteId),
          eq(counterpartySites.organisationId, context.organisationId),
          eq(counterpartySites.siteType, "third_party_tip"),
          eq(counterpartySites.isActive, true),
        ),
        columns: { id: true },
      });

      if (!destination) {
        return clientApiError(
          "INVALID_DESTINATION",
          400,
          "That third-party destination is no longer available.",
        );
      }

      const facilityPermitMatch = await database
        .select({ authorisationId: counterpartySiteAuthorisations.id })
        .from(counterpartySiteAuthorisations)
        .innerJoin(
          counterpartySiteEwcCodes,
          eq(
            counterpartySiteEwcCodes.authorisationId,
            counterpartySiteAuthorisations.id,
          ),
        )
        .where(
          and(
            eq(
              counterpartySiteAuthorisations.organisationId,
              context.organisationId,
            ),
            eq(
              counterpartySiteAuthorisations.counterpartySiteId,
              destinationSiteId,
            ),
            eq(counterpartySiteAuthorisations.status, "active"),
            eq(
              counterpartySiteEwcCodes.organisationId,
              context.organisationId,
            ),
            eq(counterpartySiteEwcCodes.ewcCodeId, material.ewcCodeId),
            eq(counterpartySiteEwcCodes.isActive, true),
          ),
        )
        .limit(1);

      if (!facilityPermitMatch[0]) {
        return clientApiError(
          "DESTINATION_NOT_PERMITTED_FOR_MATERIAL",
          400,
          `${material.ewcCode} is not configured on the selected facility's active authorisation.`,
        );
      }
    }

    const pricingInput = pricingFormData(input.pricing);
    const pricingResult =
      input.direction === "incoming"
        ? parseIncomingBookingPricing(pricingInput)
        : parseOutgoingBookingPricing(pricingInput);

    if (!pricingResult.ok) {
      return clientApiError(
        "INVALID_JOB_PRICING",
        400,
        `The Job-specific pricing is invalid: ${pricingResult.error}`,
      );
    }

    const pricing = pricingResult.data;

    const sourceRate =
      pricing.sourceRateId
        ? await database.query.rates.findFirst({
            where: and(
              eq(rates.id, pricing.sourceRateId),
              eq(rates.organisationId, context.organisationId),
              eq(rates.isActive, true),
            ),
            columns: { id: true },
          })
        : null;

    const jobId = input.clientJobId ?? crypto.randomUUID();
    const jobNumber =
      input.clientJobNumber ??
      (await generateJobNumber(
        context.organisationId,
        jobDate,
        input.direction,
      ));

    if (input.clientJobNumber) {
      const sameNumber = await database.query.jobs.findFirst({
        where: and(
          eq(jobs.organisationId, context.organisationId),
          eq(jobs.jobNumber, input.clientJobNumber),
        ),
        columns: { id: true },
      });

      if (sameNumber && sameNumber.id !== jobId) {
        return clientApiError(
          "DESKTOP_JOB_NUMBER_COLLISION",
          409,
          "That Waste X Job reference already exists.",
        );
      }
    }

    const now = new Date();

    await database.transaction(async (tx) => {
      await tx.insert(jobs).values({
        id: jobId,
        organisationId: context.organisationId,
        jobNumber,
        source: "manual",
        direction: input.direction,
        status: "booked",
        jobDate,

        clientCounterpartyId: clientId,
        clientSiteId,
        ownSiteId: ownSite.id,
        sitePermitId: primaryPermit.id,
        thirdPartyDestinationSiteId: destinationSiteId,

        haulierCounterpartyId: resolvedHaulierId,
        driverId: resolvedDriverId,
        vehicleId: resolvedVehicleId,
        materialProfileId: input.materialProfileId,

        plannedLoads: input.plannedLoads,
        purchaseOrder: input.purchaseOrder ?? null,
        customerReference: input.customerReference ?? null,
        rateId: sourceRate?.id ?? null,
        notes: input.notes ?? null,

        createdByUserId: context.userId,
        createdAt: now,
        updatedAt: now,
      });

      const loadRows = Array.from(
        { length: input.plannedLoads },
        (_, index) => ({
          id: input.clientLoadIds?.[index] ?? crypto.randomUUID(),
          organisationId: context.organisationId,
          jobId,
          loadNumber: index + 1,
          status: "planned" as const,
          direction: input.direction,

          clientCounterpartyId: clientId,
          clientSiteId,
          ownSiteId: ownSite.id,
          sitePermitId: primaryPermit.id,
          permitEwcMatchType: ownPermitAcceptance.matchType,
          permitEwcEquivalenceId: null,
      regulatoryAuthorityActivationId:
        ownPermitAcceptance.matchType === "regulatory_authority"
          ? ownPermitAcceptance.activationId
          : null,
          permitEwcBasis:
            ownPermitAcceptance.matchType === "regulatory_authority"
              ? ownPermitAcceptance.basis
              : null,
          permitEwcReference:
            ownPermitAcceptance.matchType === "regulatory_authority"
              ? ownPermitAcceptance.reference
              : null,
          permitEwcCodeSnapshot:
            ownPermitAcceptance.permittedEwcCode || material.ewcCode,
          permitEwcCheckedAt: now,
          thirdPartyDestinationSiteId: destinationSiteId,

          haulierCounterpartyId: resolvedHaulierId,
          driverId: resolvedDriverId,
          vehicleId: resolvedVehicleId,
          materialProfileId: input.materialProfileId,

          ewcCodeId: material.ewcCodeId,
          ewcCodeSnapshot: material.ewcCode,
          wasteDescriptionSnapshot: material.wasteDescription,
          physicalFormSnapshot: material.physicalForm,
          numberOfContainers: material.defaultNumberOfContainers,
          containerTypeSnapshot: material.defaultContainerType,

          containsPops: material.containsPops,
          popsSourceOfComponents: material.popsSourceOfComponents,
          popsComponents: material.popsComponents,

          containsHazardous: material.containsHazardous,
          hazardousSourceOfComponents:
            material.hazardousSourceOfComponents,
          hazardousHazCodes: material.hazardousHazCodes,
          hazardousComponents: material.hazardousComponents,

          disposalRecoveryCodeId:
            material.defaultDisposalRecoveryCodeId,
          disposalRecoveryCodeSnapshot: material.disposalRecoveryCode,

          weightMetric: material.defaultWeightMetric,
          weightIsEstimate: false,
          weightSource: "manual" as const,

          purchaseOrder: input.purchaseOrder ?? null,
          customerReference: input.customerReference ?? null,

          customerChargeAmount:
            pricing.primaryRevenue?.amount ?? null,
          customerChargeUnit:
            pricing.primaryRevenue?.unit ?? null,
          haulageCostAmount: pricing.haulageCost?.amount ?? null,
          haulageCostUnit: pricing.haulageCost?.unit ?? null,
          tippingCostAmount: pricing.tippingCost?.amount ?? null,
          tippingCostUnit: pricing.tippingCost?.unit ?? null,
          currency: "GBP",

          createdByUserId: context.userId,
          createdAt: now,
          updatedAt: now,
        }),
      );

      await tx.insert(jobLoads).values(loadRows);

      await tx.insert(jobLoadWasteItems).values(
        loadRows.flatMap((loadRow, loadIndex) =>
          materialAcceptances.map(
            ({ material: itemMaterial, acceptance }, itemIndex) => ({
              id:
                input.clientWasteItemIds?.[loadIndex]?.[itemIndex] ??
                crypto.randomUUID(),
              organisationId: context.organisationId,
              jobLoadId: loadRow.id,
              itemNumber: itemIndex + 1,
              materialProfileId: itemMaterial.id,
              ewcCodeId: itemMaterial.ewcCodeId,
              ewcCodeSnapshot: itemMaterial.ewcCode,
              wasteDescriptionSnapshot: itemMaterial.wasteDescription,
              physicalFormSnapshot: itemMaterial.physicalForm,
              numberOfContainers:
                itemMaterial.defaultNumberOfContainers,
              containerTypeSnapshot:
                itemMaterial.defaultContainerType,
              containsPops: itemMaterial.containsPops,
              popsSourceOfComponents:
                itemMaterial.popsSourceOfComponents,
              popsComponents: itemMaterial.popsComponents,
              containsHazardous: itemMaterial.containsHazardous,
              hazardousSourceOfComponents:
                itemMaterial.hazardousSourceOfComponents,
              hazardousHazCodes: itemMaterial.hazardousHazCodes,
              hazardousComponents: itemMaterial.hazardousComponents,
              disposalRecoveryCodeId:
                itemMaterial.defaultDisposalRecoveryCodeId,
              disposalRecoveryCodeSnapshot:
                itemMaterial.disposalRecoveryCode,
              weightMetric: itemMaterial.defaultWeightMetric,
              weightAmount: null,
              weightIsEstimate: false,
              weightSource: "allocation" as const,
              permitEwcMatchType: acceptance.matchType,
              regulatoryAuthorityActivationId:
                acceptance.matchType === "regulatory_authority"
                  ? acceptance.activationId
                  : null,
              regulatoryAcceptanceRuleId:
                acceptance.matchType === "regulatory_authority"
                  ? acceptance.authority.ruleId
                  : null,
              regulatoryRuleKeySnapshot:
                acceptance.matchType === "regulatory_authority"
                  ? acceptance.authority.ruleKey
                  : null,
              regulatoryRuleScopeSnapshot:
                acceptance.matchType === "regulatory_authority"
                  ? acceptance.authority.ruleScope
                  : null,
              qualifyingAuthorisationRefSnapshot:
                acceptance.matchType === "regulatory_authority"
                  ? acceptance.authority.qualifyingAuthorisationRef
                  : null,
              permitEwcBasis:
                acceptance.matchType === "regulatory_authority"
                  ? acceptance.basis
                  : null,
              permitEwcReference:
                acceptance.matchType === "regulatory_authority"
                  ? acceptance.reference
                  : null,
              permitEwcCodeSnapshot:
                acceptance.permittedEwcCode || itemMaterial.ewcCode,
              permitEwcCheckedAt: now,
              createdByUserId: context.userId,
              createdAt: now,
              updatedAt: now,
            }),
          ),
        ),
      );

      const commercialLines = bookingCommercialLines(pricing);

      if (commercialLines.length > 0) {
        await tx.insert(jobCommercialLines).values(
          commercialLines.map((line) => ({
            organisationId: context.organisationId,
            jobId,
            kind: line.kind,
            category: line.category,
            description: line.description,
            amount: line.amount,
            unit: line.unit,
            currency: "GBP",
            vatRate: line.vatRate,
            sortOrder: line.sortOrder,
            isActive: true,
            createdByUserId: context.userId,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
    });

    const createdJob = await database.query.jobs.findFirst({
      where: and(
        eq(jobs.id, jobId),
        eq(jobs.organisationId, context.organisationId),
      ),
    });

    const createdLoads = await database
      .select()
      .from(jobLoads)
      .where(
        and(
          eq(jobLoads.jobId, jobId),
          eq(jobLoads.organisationId, context.organisationId),
        ),
      )
      .orderBy(asc(jobLoads.loadNumber));

    const createdLoadIds = createdLoads.map((load) => load.id);
    const createdWasteItems =
      createdLoadIds.length > 0
        ? await database
            .select()
            .from(jobLoadWasteItems)
            .where(
              and(
                eq(
                  jobLoadWasteItems.organisationId,
                  context.organisationId,
                ),
                inArray(jobLoadWasteItems.jobLoadId, createdLoadIds),
              ),
            )
            .orderBy(
              asc(jobLoadWasteItems.jobLoadId),
              asc(jobLoadWasteItems.itemNumber),
            )
        : [];

    if (!createdJob || createdLoads.length !== input.plannedLoads) {
      throw new Error(
        "Waste X created the Job but could not verify its planned Load rows.",
      );
    }

    /*
      Job creation is Cloud-authoritative. Publish normal change-feed rows for
      connected clients. A change-feed problem must not roll back a Job that
      was already committed successfully; Desktop refreshes bootstrap next.
    */
    let syncFeedWarning = false;

    try {
      await recordSyncChange({
        organisationId: context.organisationId,
        siteId: ownSite.id,
        entityType: "job",
        entityId: createdJob.id,
        payload: createdJob,
      });

      for (const load of createdLoads) {
        await recordSyncChange({
          organisationId: context.organisationId,
          siteId: ownSite.id,
          entityType: "job_load",
          entityId: load.id,
          payload: {
            ...load,
            wasteItems: createdWasteItems.filter(
              (item) => item.jobLoadId === load.id,
            ),
          },
        });
      }
    } catch (error) {
      syncFeedWarning = true;

      console.error(
        "[DESKTOP_JOB_CREATE] Job saved but change-feed publication failed",
        {
          jobId,
          error,
        },
      );
    }

    const entityVersions = await readEntityVersions(
      context.organisationId,
      [createdJob.id, ...createdLoadIds],
    );

    return clientApiJson(
      {
        ok: true,
        job: createdJob,
        jobLoads: createdLoads,
        firstLoadId: createdLoads[0]?.id ?? null,
        syncFeedWarning,
        entityVersions,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleClientApiError(error);
  }
}
