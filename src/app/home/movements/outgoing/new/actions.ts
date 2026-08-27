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
  counterpartySiteAuthorisations,
  counterpartySiteEwcCodes,
  counterpartySites,
  disposalRecoveryCodes,
  drivers,
  ewcCodes,
  jobLoads,
  jobs,
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
  parseOutgoingBookingPricing,
} from "@/modules/commercial/bookingPricing";

async function requireOperationsAccess() {
  const session = await auth();

  if (!session?.user?.id) redirect("/login");

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

  if (!currentUser?.organisationId || !currentUser.isActive || currentUser.isSuspended) {
    redirect("/home");
  }

  const allowed =
    currentUser.role === "administrator" ||
    currentUser.role === "operations" ||
    currentUser.role === "seniorManagement" ||
    currentUser.role === "employee";

  if (!allowed) redirect("/home/movements/outgoing?error=unauthorised");

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
  return valueString || null;
}

function parsePositiveInt(value: FormDataEntryValue | null, min: number, max: number) {
  const parsed = Number(cleanString(value));
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function parseDate(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null;

  const parsed = new Date(`${cleaned}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fail(code: string): never {
  redirect(`/home/movements/outgoing/new?error=${encodeURIComponent(code)}`);
}

async function generateJobNumber(organisationId: string, jobDate: Date) {
  const datePart = jobDate.toISOString().slice(0, 10).replaceAll("-", "");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
    const candidate = `WX-OUT-${datePart}-${suffix}`;

    const existing = await database.query.jobs.findFirst({
      where: and(
        eq(jobs.organisationId, organisationId),
        eq(jobs.jobNumber, candidate),
      ),
      columns: { id: true },
    });

    if (!existing) return candidate;
  }

  throw new Error("Unable to generate outgoing job number.");
}

export async function createOutgoingJobAction(formData: FormData) {
  const { userId, organisationId } = await requireOperationsAccess();

  const jobDate = parseDate(formData.get("jobDate"));
  const destinationSiteId = cleanString(formData.get("destinationSiteId"));
  const materialProfileId = cleanString(formData.get("materialProfileId"));
  const transportMode = cleanString(formData.get("transportMode"));
  const haulierId = cleanString(formData.get("haulierId"));
  const driverId = optionalString(formData.get("driverId"));
  const vehicleId = optionalString(formData.get("vehicleId"));
  const plannedLoads = parsePositiveInt(formData.get("plannedLoads"), 1, 100);
  const purchaseOrder = optionalString(formData.get("purchaseOrder"));
  const customerReference = optionalString(formData.get("customerReference"));
  const notes = optionalString(formData.get("notes"));

  const pricingResult = parseOutgoingBookingPricing(formData);
  if (!pricingResult.ok) fail(pricingResult.error);
  const pricing = pricingResult.data;

  if (!jobDate) fail("invalid_job_date");
  if (!destinationSiteId) fail("destination_required");
  if (!materialProfileId) fail("material_required");
  if (transportMode !== "own" && transportMode !== "external") {
    fail("transport_mode_required");
  }
  if (transportMode === "external" && !haulierId) fail("haulier_required");
  if (!plannedLoads) fail("invalid_load_count");

  const resolvedHaulierId = transportMode === "external" ? haulierId : null;

  const [ownSite] = await database
    .select({ id: sites.id })
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

  if (!ownSite) fail("own_site_missing");

  const [primaryPermit] = await database
    .select({ id: sitePermits.id })
    .from(sitePermits)
    .where(
      and(
        eq(sitePermits.organisationId, organisationId),
        eq(sitePermits.siteId, ownSite.id),
        eq(sitePermits.status, "active"),
        eq(sitePermits.isPrimary, true),
      ),
    )
    .limit(1);

  if (!primaryPermit) fail("own_permit_missing");

  const [destination] = await database
    .select({ id: counterpartySites.id })
    .from(counterpartySites)
    .where(
      and(
        eq(counterpartySites.id, destinationSiteId),
        eq(counterpartySites.organisationId, organisationId),
        eq(counterpartySites.siteType, "third_party_tip"),
        eq(counterpartySites.isActive, true),
      ),
    )
    .limit(1);

  if (!destination) fail("invalid_destination");

  if (resolvedHaulierId) {
    const [haulier] = await database
      .select({ id: counterparties.id })
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
          eq(counterparties.id, resolvedHaulierId),
          eq(counterparties.organisationId, organisationId),
          eq(counterparties.isActive, true),
        ),
      )
      .limit(1);

    if (!haulier) fail("invalid_haulier");
  }

  if (driverId) {
    const driver = await database.query.drivers.findFirst({
      where: and(
        eq(drivers.id, driverId),
        eq(drivers.organisationId, organisationId),
        eq(drivers.isActive, true),
      ),
      columns: {
        id: true,
        haulierCounterpartyId: true,
      },
    });

    if (!driver) fail("invalid_driver");
    if (driver.haulierCounterpartyId !== resolvedHaulierId) {
      fail(resolvedHaulierId ? "driver_not_for_haulier" : "driver_not_for_own_transport");
    }
  }

  if (vehicleId) {
    const vehicle = await database.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, vehicleId),
        eq(vehicles.organisationId, organisationId),
        eq(vehicles.isActive, true),
      ),
      columns: {
        id: true,
        haulierCounterpartyId: true,
      },
    });

    if (!vehicle) fail("invalid_vehicle");
    if (vehicle.haulierCounterpartyId !== resolvedHaulierId) {
      fail(resolvedHaulierId ? "vehicle_not_for_haulier" : "vehicle_not_for_own_transport");
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
      defaultDisposalRecoveryCodeId: materialProfiles.defaultDisposalRecoveryCodeId,
      defaultWeightMetric: materialProfiles.defaultWeightMetric,
      disposalRecoveryCode: disposalRecoveryCodes.code,
    })
    .from(materialProfiles)
    .innerJoin(ewcCodes, eq(materialProfiles.ewcCodeId, ewcCodes.id))
    .leftJoin(
      disposalRecoveryCodes,
      eq(materialProfiles.defaultDisposalRecoveryCodeId, disposalRecoveryCodes.id),
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

  if (!material) fail("invalid_material");

  const [ownPermitMatch] = await database
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

  if (!ownPermitMatch) fail("material_not_permitted_at_own_site");

  const [facilityPermitMatch] = await database
    .select({ authorisationId: counterpartySiteAuthorisations.id })
    .from(counterpartySiteAuthorisations)
    .innerJoin(
      counterpartySiteEwcCodes,
      eq(counterpartySiteEwcCodes.authorisationId, counterpartySiteAuthorisations.id),
    )
    .where(
      and(
        eq(counterpartySiteAuthorisations.organisationId, organisationId),
        eq(counterpartySiteAuthorisations.counterpartySiteId, destinationSiteId),
        eq(counterpartySiteAuthorisations.status, "active"),
        eq(counterpartySiteEwcCodes.organisationId, organisationId),
        eq(counterpartySiteEwcCodes.ewcCodeId, material.ewcCodeId),
        eq(counterpartySiteEwcCodes.isActive, true),
      ),
    )
    .limit(1);

  if (!facilityPermitMatch) fail("destination_not_permitted_for_material");

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

  const jobId = crypto.randomUUID();
  const jobNumber = await generateJobNumber(organisationId, jobDate);
  const now = new Date();

  await database.transaction(async (tx) => {
    await tx.insert(jobs).values({
      id: jobId,
      organisationId,
      jobNumber,
      source: "manual",
      direction: "outgoing",
      status: "booked",
      jobDate,
      clientCounterpartyId: null,
      clientSiteId: null,
      ownSiteId: ownSite.id,
      sitePermitId: primaryPermit.id,
      thirdPartyDestinationSiteId: destinationSiteId,
      haulierCounterpartyId: resolvedHaulierId,
      driverId,
      vehicleId,
      materialProfileId,
      plannedLoads,
      purchaseOrder,
      customerReference,
      /*
        Optional legacy/reference pointer only. Job commercial lines below are
        the actual agreed terms.
      */
      rateId: sourceRate?.id ?? null,
      notes,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(jobLoads).values(
      Array.from({ length: plannedLoads }, (_, index) => ({
        id: crypto.randomUUID(),
        organisationId,
        jobId,
        loadNumber: index + 1,
        status: "planned" as const,
        direction: "outgoing" as const,
        clientCounterpartyId: null,
        clientSiteId: null,
        ownSiteId: ownSite.id,
        sitePermitId: primaryPermit.id,
        thirdPartyDestinationSiteId: destinationSiteId,
        haulierCounterpartyId: resolvedHaulierId,
        driverId,
        vehicleId,
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
        /*
          Compatibility snapshots. The authoritative pricing is the Job-level
          commercial lines inserted below.
        */
        customerChargeAmount: pricing.primaryRevenue?.amount ?? null,
        customerChargeUnit: pricing.primaryRevenue?.unit ?? null,
        haulageCostAmount: pricing.haulageCost?.amount ?? null,
        haulageCostUnit: pricing.haulageCost?.unit ?? null,
        tippingCostAmount: pricing.tippingCost?.amount ?? null,
        tippingCostUnit: pricing.tippingCost?.unit ?? null,
        currency: "GBP",
        createdByUserId: userId,
        createdAt: now,
        updatedAt: now,
      })),
    );

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
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  });

  revalidatePath("/home/jobs");
  revalidatePath("/home/worksheet");
  revalidatePath("/home/movements/outgoing");

  revalidatePath("/home/commercial");
  revalidatePath("/home/accounts");
  revalidatePath("/home/reports");

  const date = jobDate.toISOString().slice(0, 10);
  redirect(`/home/worksheet?date=${date}&success=outgoing_job_booked`);
}
