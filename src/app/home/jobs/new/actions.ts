"use server";
/* WASTE_X_JOB_SPECIFIC_PRICING_V2 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  counterpartySites,
  disposalRecoveryCodes,
  drivers,
  ewcCodes,
  jobLoads,
  jobs,
  jobTemplates,
  materialProfiles,
  permitEwcCodes,
  rates,
  sitePermits,
  sites,
  users,
  vehicles,
} from "@/db/schema";
import { jobCommercialLines } from "@/db/commercial-schema";
import {
  bookingCommercialLines,
  parseIncomingBookingPricing,
} from "@/modules/commercial/bookingPricing";

type BookingContext = {
  userId: string;
  organisationId: string;
};

async function requireBookJobAccess(): Promise<BookingContext> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      id: true,
      organisationId: true,
      role: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (
    !currentUser?.organisationId ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect("/home?reason=account_unavailable");
  }

  const canBook =
    currentUser.role === "administrator" ||
    currentUser.role === "operations" ||
    currentUser.role === "seniorManagement" ||
    currentUser.role === "employee";

  if (!canBook) {
    redirect("/home/jobs?error=unauthorised");
  }

  return {
    userId: currentUser.id,
    organisationId: currentUser.organisationId,
  };
}

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null) {
  const valueString = cleanString(value);
  return valueString ? valueString : null;
}

function parsePositiveInt(
  value: FormDataEntryValue | null,
  min: number,
  max: number,
) {
  const parsed = Number(cleanString(value));

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function parseJobDate(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return null;
  }

  const [yearText, monthText, dayText] = cleaned.split("-");
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

function bookingError(code: string): never {
  redirect(`/home/jobs/new?error=${encodeURIComponent(code)}`);
}

async function generateJobNumber(organisationId: string, jobDate: Date) {
  const y = jobDate.getUTCFullYear();
  const m = String(jobDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jobDate.getUTCDate()).padStart(2, "0");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
    const candidate = `WX-${y}${m}${d}-${suffix}`;

    const existing = await database.query.jobs.findFirst({
      where: and(
        eq(jobs.organisationId, organisationId),
        eq(jobs.jobNumber, candidate),
      ),
      columns: { id: true },
    });

    if (!existing) return candidate;
  }

  throw new Error("Unable to generate a unique job number.");
}

export async function createJobAction(formData: FormData) {
  const { userId, organisationId } = await requireBookJobAccess();

  const jobDate = parseJobDate(formData.get("jobDate"));
  const clientId = cleanString(formData.get("clientId"));
  const clientSiteId = cleanString(formData.get("clientSiteId"));
  const transportMode = cleanString(formData.get("transportMode"));
  const haulierId = cleanString(formData.get("haulierId"));
  const driverId = cleanString(formData.get("driverId"));
  const vehicleId = cleanString(formData.get("vehicleId"));
  const materialProfileId = cleanString(formData.get("materialProfileId"));
  const plannedLoads = parsePositiveInt(formData.get("plannedLoads"), 1, 100);
  const purchaseOrder = optionalString(formData.get("purchaseOrder"));
  const customerReference = optionalString(formData.get("customerReference"));
  const notes = optionalString(formData.get("notes"));

  const pricingResult = parseIncomingBookingPricing(formData);
  if (!pricingResult.ok) bookingError(pricingResult.error);
  const pricing = pricingResult.data;

  const requestedSource = cleanString(formData.get("source"));
  const source =
    requestedSource === "template"
      ? "template"
      : requestedSource === "repeat"
        ? "repeat"
        : "manual";

  const requestedTemplateId = cleanString(formData.get("sourceTemplateId"));
  let sourceTemplateId: string | null = null;

  if (!jobDate) bookingError("invalid_job_date");
  if (!clientId) bookingError("client_required");
  if (!clientSiteId) bookingError("client_site_required");
  if (transportMode !== "own" && transportMode !== "external") {
    bookingError("transport_mode_required");
  }
  if (transportMode === "external" && !haulierId) {
    bookingError("haulier_required");
  }
  if (!materialProfileId) bookingError("material_required");
  if (!plannedLoads) bookingError("invalid_load_count");

  if (source === "template") {
    if (!requestedTemplateId) bookingError("invalid_template");

    const template = await database.query.jobTemplates.findFirst({
      where: and(
        eq(jobTemplates.id, requestedTemplateId),
        eq(jobTemplates.organisationId, organisationId),
        eq(jobTemplates.isActive, true),
      ),
      columns: { id: true },
    });

    if (!template) bookingError("invalid_template");
    sourceTemplateId = template.id;
  }

  const resolvedHaulierId = transportMode === "external" ? haulierId : null;
  const resolvedDriverId = driverId || null;
  const resolvedVehicleId = vehicleId || null;

  const [receivingSite] = await database
    .select({
      id: sites.id,
      name: sites.name,
    })
    .from(sites)
    .where(
      and(
        eq(sites.organisationId, organisationId),
        eq(sites.status, "active"),
        eq(sites.siteType, "waste_receiving_site"),
        eq(sites.isDefault, true),
      ),
    )
    .limit(1);

  if (!receivingSite) bookingError("receiving_site_missing");

  const [primaryPermit] = await database
    .select({
      id: sitePermits.id,
      permitNumber: sitePermits.permitNumber,
    })
    .from(sitePermits)
    .where(
      and(
        eq(sitePermits.organisationId, organisationId),
        eq(sitePermits.siteId, receivingSite.id),
        eq(sitePermits.isPrimary, true),
        eq(sitePermits.status, "active"),
      ),
    )
    .limit(1);

  if (!primaryPermit) bookingError("receiving_permit_missing");

  const [client] = await database
    .select({ id: counterparties.id })
    .from(counterparties)
    .innerJoin(
      counterpartyRoles,
      and(
        eq(counterpartyRoles.counterpartyId, counterparties.id),
        eq(counterpartyRoles.organisationId, organisationId),
        eq(counterpartyRoles.role, "client"),
      ),
    )
    .where(
      and(
        eq(counterparties.id, clientId),
        eq(counterparties.organisationId, organisationId),
        eq(counterparties.isActive, true),
      ),
    )
    .limit(1);

  if (!client) bookingError("invalid_client");

  const [clientSite] = await database
    .select({ id: counterpartySites.id })
    .from(counterpartySites)
    .where(
      and(
        eq(counterpartySites.id, clientSiteId),
        eq(counterpartySites.organisationId, organisationId),
        eq(counterpartySites.counterpartyId, clientId),
        eq(counterpartySites.isActive, true),
      ),
    )
    .limit(1);

  if (!clientSite) bookingError("invalid_client_site");

  if (transportMode === "external") {
    const [haulier] = await database
      .select({
        id: counterparties.id,
        carrierRegistrationNumber: counterparties.carrierRegistrationNumber,
      })
      .from(counterparties)
      .innerJoin(
        counterpartyRoles,
        and(
          eq(counterpartyRoles.counterpartyId, counterparties.id),
          eq(counterpartyRoles.organisationId, organisationId),
          eq(counterpartyRoles.role, "haulier"),
        ),
      )
      .where(
        and(
          eq(counterparties.id, haulierId),
          eq(counterparties.organisationId, organisationId),
          eq(counterparties.isActive, true),
        ),
      )
      .limit(1);

    if (!haulier) bookingError("invalid_haulier");
  }

  if (resolvedDriverId) {
    const [driver] = await database
      .select({
        id: drivers.id,
        haulierCounterpartyId: drivers.haulierCounterpartyId,
      })
      .from(drivers)
      .where(
        and(
          eq(drivers.id, resolvedDriverId),
          eq(drivers.organisationId, organisationId),
          eq(drivers.isActive, true),
        ),
      )
      .limit(1);

    if (!driver) bookingError("invalid_driver");

    if (transportMode === "own" && driver.haulierCounterpartyId !== null) {
      bookingError("driver_not_for_own_transport");
    }

    if (
      transportMode === "external" &&
      driver.haulierCounterpartyId !== resolvedHaulierId
    ) {
      bookingError("driver_not_for_haulier");
    }
  }

  if (resolvedVehicleId) {
    const [vehicle] = await database
      .select({
        id: vehicles.id,
        haulierCounterpartyId: vehicles.haulierCounterpartyId,
      })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.id, resolvedVehicleId),
          eq(vehicles.organisationId, organisationId),
          eq(vehicles.isActive, true),
        ),
      )
      .limit(1);

    if (!vehicle) bookingError("invalid_vehicle");

    if (transportMode === "own" && vehicle.haulierCounterpartyId !== null) {
      bookingError("vehicle_not_for_own_transport");
    }

    if (
      transportMode === "external" &&
      vehicle.haulierCounterpartyId !== resolvedHaulierId
    ) {
      bookingError("vehicle_not_for_haulier");
    }
  }

  const [material] = await database
    .select({
      id: materialProfiles.id,
      ewcCodeId: materialProfiles.ewcCodeId,
      ewcCode: ewcCodes.code,
      wasteDescription: materialProfiles.wasteDescription,
      physicalForm: materialProfiles.physicalForm,
      defaultNumberOfContainers: materialProfiles.defaultNumberOfContainers,
      defaultContainerType: materialProfiles.defaultContainerType,
      containsPops: materialProfiles.containsPops,
      popsSourceOfComponents: materialProfiles.popsSourceOfComponents,
      popsComponents: materialProfiles.popsComponents,
      containsHazardous: materialProfiles.containsHazardous,
      hazardousSourceOfComponents: materialProfiles.hazardousSourceOfComponents,
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
        eq(materialProfiles.id, materialProfileId),
        eq(materialProfiles.organisationId, organisationId),
        eq(materialProfiles.isActive, true),
        eq(ewcCodes.isActive, true),
      ),
    )
    .limit(1);

  if (!material) bookingError("invalid_material");

  const [permitMatch] = await database
    .select({ ewcCodeId: permitEwcCodes.ewcCodeId })
    .from(permitEwcCodes)
    .where(
      and(
        eq(permitEwcCodes.organisationId, organisationId),
        eq(permitEwcCodes.permitId, primaryPermit.id),
        eq(permitEwcCodes.ewcCodeId, material.ewcCodeId),
        eq(permitEwcCodes.isActive, true),
      ),
    )
    .limit(1);

  if (!permitMatch) bookingError("material_not_permitted_at_receiving_site");

  const sourceRate =
    pricing.sourceRateId
      ? await database.query.rates.findFirst({
          where: and(
            eq(rates.id, pricing.sourceRateId),
            eq(rates.organisationId, organisationId),
            eq(rates.isActive, true),
          ),
          columns: {
            id: true,
          },
        })
      : null;

  const jobNumber = await generateJobNumber(organisationId, jobDate);
  const jobId = crypto.randomUUID();

  await database.transaction(async (tx) => {
    await tx.insert(jobs).values({
      id: jobId,
      organisationId,
      jobNumber,
      source,
      direction: "incoming",
      status: "booked",
      jobDate,
      clientCounterpartyId: clientId,
      clientSiteId,
      ownSiteId: receivingSite.id,
      sitePermitId: primaryPermit.id,
      thirdPartyDestinationSiteId: null,
      haulierCounterpartyId: resolvedHaulierId,
      driverId: resolvedDriverId,
      vehicleId: resolvedVehicleId,
      materialProfileId,
      plannedLoads,
      purchaseOrder,
      customerReference,
      /*
        Legacy/reference pointer only. The actual commercial truth is stored in
        bb_job_commercial_line below.
      */
      rateId: sourceRate?.id ?? null,
      notes,
      sourceTemplateId,
      createdByUserId: userId,
      updatedAt: new Date(),
    });

    const loadRows = Array.from({ length: plannedLoads }, (_, index) => ({
      id: crypto.randomUUID(),
      organisationId,
      jobId,
      loadNumber: index + 1,
      status: "planned" as const,
      direction: "incoming" as const,
      clientCounterpartyId: clientId,
      clientSiteId,
      ownSiteId: receivingSite.id,
      sitePermitId: primaryPermit.id,
      thirdPartyDestinationSiteId: null,
      haulierCounterpartyId: resolvedHaulierId,
      driverId: resolvedDriverId,
      vehicleId: resolvedVehicleId,
      materialProfileId,
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
      hazardousSourceOfComponents: material.hazardousSourceOfComponents,
      hazardousHazCodes: material.hazardousHazCodes,
      hazardousComponents: material.hazardousComponents,
      disposalRecoveryCodeId: material.defaultDisposalRecoveryCodeId,
      disposalRecoveryCodeSnapshot: material.disposalRecoveryCode,
      weightMetric: material.defaultWeightMetric,
      weightIsEstimate: false,
      weightSource: "manual" as const,
      purchaseOrder,
      customerReference,
      customerChargeAmount: pricing.primaryRevenue?.amount ?? null,
      customerChargeUnit: pricing.primaryRevenue?.unit ?? null,
      haulageCostAmount: pricing.haulageCost?.amount ?? null,
      haulageCostUnit: pricing.haulageCost?.unit ?? null,
      tippingCostAmount: pricing.tippingCost?.amount ?? null,
      tippingCostUnit: pricing.tippingCost?.unit ?? null,
      currency: "GBP",
      createdByUserId: userId,
      updatedAt: new Date(),
    }));

    await tx.insert(jobLoads).values(loadRows);

    const commercialLines = bookingCommercialLines(pricing);

    if (commercialLines.length > 0) {
      await tx.insert(jobCommercialLines).values(
        commercialLines.map((line) => ({
          organisationId,
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
          createdByUserId: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    }

    if (sourceTemplateId) {
      await tx
        .update(jobTemplates)
        .set({
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobTemplates.id, sourceTemplateId),
            eq(jobTemplates.organisationId, organisationId),
          ),
        );
    }
  });

  revalidatePath("/home/jobs");
  revalidatePath("/home/worksheet");
  revalidatePath("/home/settings/data-readiness");

  revalidatePath("/home/commercial");
  revalidatePath("/home/accounts");
  revalidatePath("/home/reports");

  redirect(`/home/jobs/${jobId}?success=booked`);
}
