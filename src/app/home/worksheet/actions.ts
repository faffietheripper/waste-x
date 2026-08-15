"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterpartySiteAuthorisations,
  counterpartySiteEwcCodes,
  counterpartySites,
  drivers,
  jobLoads,
  jobs,
  permitEwcCodes,
  sitePermits,
  users,
  vehicles,
} from "@/db/schema";
import { syncJobStatus } from "@/modules/jobs/core/syncJobStatus";
import { prepareJobLoadWasteReceipt } from "@/modules/digital-waste-tracking/data-access/prepareJobLoadWasteReceipt";

type OperationsContext = {
  userId: string;
  organisationId: string;
};

async function requireOperationsAccess(): Promise<OperationsContext> {
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

  const canOperate =
    currentUser.role === "administrator" ||
    currentUser.role === "operations" ||
    currentUser.role === "seniorManagement" ||
    currentUser.role === "employee";

  if (!canOperate) {
    redirect("/home/worksheet?error=unauthorised");
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
  const cleaned = cleanString(value);
  return cleaned || null;
}

function validDateParam(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getReturnDate(formData: FormData) {
  const value = cleanString(formData.get("returnDate"));
  return validDateParam(value) ? value : "";
}

function worksheetRedirect(
  returnDate: string,
  key: "success" | "error",
  code: string,
): never {
  const params = new URLSearchParams();

  if (returnDate) {
    params.set("date", returnDate);
  }

  params.set(key, code);
  redirect(`/home/worksheet?${params.toString()}`);
}

function parseOptionalDecimal(
  raw: FormDataEntryValue | null,
  field: string,
) {
  const cleaned = cleanString(raw);

  if (!cleaned) {
    return null;
  }

  const value = Number(cleaned);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`invalid_${field}`);
  }

  return value;
}

function toDbDecimal(value: number | null, scale = 3) {
  return value === null ? null : value.toFixed(scale);
}

function appendOperationalNote(
  existing: string | null,
  heading: string,
  detail: string,
) {
  const timestamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const entry = `[${heading} · ${timestamp}] ${detail}`;
  return existing?.trim() ? `${existing.trim()}\n${entry}` : entry;
}

async function getLoadOrRedirect(
  loadId: string,
  organisationId: string,
  returnDate: string,
) {
  if (!loadId) {
    worksheetRedirect(returnDate, "error", "load_required");
  }

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, loadId),
      eq(jobLoads.organisationId, organisationId),
    ),
    columns: {
      id: true,
      jobId: true,
      status: true,
      direction: true,
      receivedAt: true,
      movementAt: true,
      ownSiteId: true,
      sitePermitId: true,
      thirdPartyDestinationSiteId: true,
      haulierCounterpartyId: true,
      driverId: true,
      vehicleId: true,
      ewcCodeId: true,
      ewcCodeSnapshot: true,
      wasteDescriptionSnapshot: true,
      grossWeight: true,
      tareWeight: true,
      netWeight: true,
      weightMetric: true,
      ticketNumber: true,
      notes: true,
    },
  });

  if (!load) {
    worksheetRedirect(returnDate, "error", "load_not_found");
  }

  const parentJob = await database.query.jobs.findFirst({
    where: and(
      eq(jobs.id, load.jobId),
      eq(jobs.organisationId, organisationId),
    ),
    columns: { status: true },
  });

  if (!parentJob || parentJob.status === "cancelled" || parentJob.status === "draft") {
    worksheetRedirect(returnDate, "error", "job_not_operational");
  }

  return load;
}

async function validateDriver(
  driverId: string | null,
  organisationId: string,
  haulierCounterpartyId: string | null,
) {
  if (!driverId) {
    return null;
  }

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

  if (!driver) {
    return "invalid_driver";
  }

  if (driver.haulierCounterpartyId !== haulierCounterpartyId) {
    return haulierCounterpartyId
      ? "driver_not_for_haulier"
      : "driver_not_for_own_transport";
  }

  return null;
}

async function validateVehicle(
  vehicleId: string | null,
  organisationId: string,
  haulierCounterpartyId: string | null,
) {
  if (!vehicleId) {
    return null;
  }

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

  if (!vehicle) {
    return "invalid_vehicle";
  }

  if (vehicle.haulierCounterpartyId !== haulierCounterpartyId) {
    return haulierCounterpartyId
      ? "vehicle_not_for_haulier"
      : "vehicle_not_for_own_transport";
  }

  return null;
}

async function incomingPermitAllowsLoad({
  organisationId,
  permitId,
  siteId,
  ewcCodeId,
}: {
  organisationId: string;
  permitId: string | null;
  siteId: string | null;
  ewcCodeId: string | null;
}) {
  if (!permitId || !siteId || !ewcCodeId) {
    return false;
  }

  const [permit] = await database
    .select({ id: sitePermits.id })
    .from(sitePermits)
    .where(
      and(
        eq(sitePermits.id, permitId),
        eq(sitePermits.organisationId, organisationId),
        eq(sitePermits.siteId, siteId),
        eq(sitePermits.status, "active"),
      ),
    )
    .limit(1);

  if (!permit) {
    return false;
  }

  const [match] = await database
    .select({ ewcCodeId: permitEwcCodes.ewcCodeId })
    .from(permitEwcCodes)
    .where(
      and(
        eq(permitEwcCodes.organisationId, organisationId),
        eq(permitEwcCodes.permitId, permitId),
        eq(permitEwcCodes.ewcCodeId, ewcCodeId),
        eq(permitEwcCodes.isActive, true),
      ),
    )
    .limit(1);

  return Boolean(match);
}

async function externalFacilityAllowsLoad({
  organisationId,
  siteId,
  ewcCodeId,
}: {
  organisationId: string;
  siteId: string | null;
  ewcCodeId: string | null;
}) {
  if (!siteId || !ewcCodeId) {
    return false;
  }

  const [match] = await database
    .select({
      authorisationId: counterpartySiteAuthorisations.id,
    })
    .from(counterpartySiteAuthorisations)
    .innerJoin(
      counterpartySites,
      eq(counterpartySites.id, counterpartySiteAuthorisations.counterpartySiteId),
    )
    .innerJoin(
      counterpartySiteEwcCodes,
      eq(
        counterpartySiteEwcCodes.authorisationId,
        counterpartySiteAuthorisations.id,
      ),
    )
    .where(
      and(
        eq(counterpartySiteAuthorisations.organisationId, organisationId),
        eq(counterpartySiteAuthorisations.counterpartySiteId, siteId),
        eq(counterpartySiteAuthorisations.status, "active"),
        eq(counterpartySites.organisationId, organisationId),
        eq(counterpartySites.siteType, "third_party_tip"),
        eq(counterpartySites.isActive, true),
        eq(counterpartySiteEwcCodes.organisationId, organisationId),
        eq(counterpartySiteEwcCodes.ewcCodeId, ewcCodeId),
        eq(counterpartySiteEwcCodes.isActive, true),
      ),
    )
    .orderBy(desc(counterpartySiteAuthorisations.isPrimary))
    .limit(1);

  return Boolean(match);
}

function revalidateOperations(jobId: string) {
  revalidatePath("/home/worksheet");
  revalidatePath("/home/jobs");
  revalidatePath(`/home/jobs/${jobId}`);
  revalidatePath("/home/movements/incoming");
  revalidatePath("/home/movements/outgoing");
  revalidatePath("/home/dwt");
  revalidatePath("/home/dwt/intake");
}

export async function markLoadArrivedAction(formData: FormData) {
  const { organisationId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const load = await getLoadOrRedirect(loadId, organisationId, returnDate);

  if (load.direction !== "incoming") {
    worksheetRedirect(returnDate, "error", "incoming_only_action");
  }

  if (load.status !== "planned") {
    worksheetRedirect(returnDate, "error", "load_not_planned");
  }

  const now = new Date();

  await database
    .update(jobLoads)
    .set({
      status: "arrived",
      receivedAt: load.receivedAt ?? now,
      movementAt: load.movementAt ?? now,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  await syncJobStatus(load.jobId, organisationId);
  revalidateOperations(load.jobId);
  worksheetRedirect(returnDate, "success", "load_arrived");
}

export async function saveLoadDetailsAction(formData: FormData) {
  const { organisationId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const load = await getLoadOrRedirect(loadId, organisationId, returnDate);

  if (
    load.status === "completed" ||
    load.status === "rejected" ||
    load.status === "cancelled"
  ) {
    worksheetRedirect(returnDate, "error", "load_is_terminal");
  }

  const driverId = optionalString(formData.get("driverId"));
  const vehicleId = optionalString(formData.get("vehicleId"));
  const wasteDescription = optionalString(formData.get("wasteDescription"));
  const ticketNumber = optionalString(formData.get("ticketNumber"));
  const notes = optionalString(formData.get("notes"));
  const weightMetric = cleanString(formData.get("weightMetric"));

  if (!wasteDescription) {
    worksheetRedirect(returnDate, "error", "waste_description_required");
  }

  if (![
    "Grams",
    "Kilograms",
    "Tonnes",
  ].includes(weightMetric)) {
    worksheetRedirect(returnDate, "error", "invalid_weight_metric");
  }

  const driverError = await validateDriver(
    driverId,
    organisationId,
    load.haulierCounterpartyId,
  );

  if (driverError) {
    worksheetRedirect(returnDate, "error", driverError);
  }

  const vehicleError = await validateVehicle(
    vehicleId,
    organisationId,
    load.haulierCounterpartyId,
  );

  if (vehicleError) {
    worksheetRedirect(returnDate, "error", vehicleError);
  }

  let grossWeight: number | null;
  let tareWeight: number | null;
  let netWeight: number | null;

  try {
    grossWeight = parseOptionalDecimal(formData.get("grossWeight"), "gross_weight");
    tareWeight = parseOptionalDecimal(formData.get("tareWeight"), "tare_weight");
    netWeight = parseOptionalDecimal(formData.get("netWeight"), "net_weight");
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_weight";
    worksheetRedirect(returnDate, "error", code);
  }

  if (grossWeight !== null && tareWeight !== null) {
    if (grossWeight < tareWeight) {
      worksheetRedirect(returnDate, "error", "gross_below_tare");
    }

    netWeight = grossWeight - tareWeight;
  }

  await database
    .update(jobLoads)
    .set({
      driverId,
      vehicleId,
      wasteDescriptionSnapshot: wasteDescription,
      grossWeight: toDbDecimal(grossWeight),
      tareWeight: toDbDecimal(tareWeight),
      netWeight: toDbDecimal(netWeight),
      weightMetric: weightMetric as "Grams" | "Kilograms" | "Tonnes",
      weightIsEstimate: cleanString(formData.get("weightIsEstimate")) === "on",
      weightSource: "manual",
      ticketNumber,
      notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  revalidateOperations(load.jobId);
  worksheetRedirect(returnDate, "success", "load_details_saved");
}

export async function acceptLoadAction(formData: FormData) {
  const { organisationId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const load = await getLoadOrRedirect(loadId, organisationId, returnDate);

  if (load.direction !== "incoming") {
    worksheetRedirect(returnDate, "error", "incoming_only_action");
  }

  if (load.status !== "arrived") {
    worksheetRedirect(returnDate, "error", "load_must_be_arrived");
  }

  if (!load.wasteDescriptionSnapshot?.trim()) {
    worksheetRedirect(returnDate, "error", "waste_description_required");
  }

  const permitMatch = await incomingPermitAllowsLoad({
    organisationId,
    permitId: load.sitePermitId,
    siteId: load.ownSiteId,
    ewcCodeId: load.ewcCodeId,
  });

  if (!permitMatch) {
    worksheetRedirect(returnDate, "error", "permit_mismatch");
  }

  await database
    .update(jobLoads)
    .set({
      status: "accepted",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  await syncJobStatus(load.jobId, organisationId);
  revalidateOperations(load.jobId);
  worksheetRedirect(returnDate, "success", "load_accepted");
}

export async function rejectLoadAction(formData: FormData) {
  const { organisationId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const reason = cleanString(formData.get("reason"));
  const load = await getLoadOrRedirect(loadId, organisationId, returnDate);

  if (load.direction !== "incoming") {
    worksheetRedirect(returnDate, "error", "incoming_only_action");
  }

  if (load.status !== "arrived") {
    worksheetRedirect(returnDate, "error", "load_must_be_arrived");
  }

  if (reason.length < 3) {
    worksheetRedirect(returnDate, "error", "rejection_reason_required");
  }

  const now = new Date();

  await database
    .update(jobLoads)
    .set({
      status: "rejected",
      notes: appendOperationalNote(load.notes, "REJECTED", reason),
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  await syncJobStatus(load.jobId, organisationId);
  revalidateOperations(load.jobId);
  worksheetRedirect(returnDate, "success", "load_rejected");
}

export async function completeIncomingLoadAction(formData: FormData) {
  const { organisationId, userId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const load = await getLoadOrRedirect(loadId, organisationId, returnDate);

  if (load.direction !== "incoming") {
    worksheetRedirect(returnDate, "error", "incoming_only_action");
  }

  if (load.status !== "accepted") {
    worksheetRedirect(returnDate, "error", "load_must_be_accepted");
  }

  if (!load.receivedAt) {
    worksheetRedirect(returnDate, "error", "received_time_missing");
  }

  const netWeight = Number(load.netWeight ?? "0");

  if (!Number.isFinite(netWeight) || netWeight <= 0) {
    worksheetRedirect(returnDate, "error", "net_weight_required");
  }

  const now = new Date();

  await database
    .update(jobLoads)
    .set({
      status: "completed",
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  /*
    Stage 5 bridge:
    Prepare a DWT receipt draft from the factual Job Load, but never block
    yard operations if DWT configuration is incomplete. The DWT Centre can
    retry preparation and will surface missing fields for human review.
  */
  try {
    await prepareJobLoadWasteReceipt({
      organisationId,
      jobLoadId: load.id,
      receivedByUserId: userId,
    });
  } catch (error) {
    console.error("[DWT] Could not auto-prepare receipt draft", {
      jobLoadId: load.id,
      error,
    });
  }

  await syncJobStatus(load.jobId, organisationId);
  revalidateOperations(load.jobId);
  worksheetRedirect(returnDate, "success", "load_completed");
}

export async function completeOutgoingLoadAction(formData: FormData) {
  const { organisationId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const load = await getLoadOrRedirect(loadId, organisationId, returnDate);

  if (load.direction !== "outgoing") {
    worksheetRedirect(returnDate, "error", "outgoing_only_action");
  }

  if (
    load.status === "completed" ||
    load.status === "rejected" ||
    load.status === "cancelled"
  ) {
    worksheetRedirect(returnDate, "error", "load_is_terminal");
  }

  if (!load.wasteDescriptionSnapshot?.trim()) {
    worksheetRedirect(returnDate, "error", "waste_description_required");
  }

  const netWeight = Number(load.netWeight ?? "0");

  if (!Number.isFinite(netWeight) || netWeight <= 0) {
    worksheetRedirect(returnDate, "error", "net_weight_required");
  }

  const facilityMatch = await externalFacilityAllowsLoad({
    organisationId,
    siteId: load.thirdPartyDestinationSiteId,
    ewcCodeId: load.ewcCodeId,
  });

  if (!facilityMatch) {
    worksheetRedirect(returnDate, "error", "external_facility_permit_mismatch");
  }

  const now = new Date();

  await database
    .update(jobLoads)
    .set({
      status: "completed",
      movementAt: load.movementAt ?? now,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  await syncJobStatus(load.jobId, organisationId);
  revalidateOperations(load.jobId);
  worksheetRedirect(returnDate, "success", "outgoing_load_completed");
}

export async function cancelPlannedLoadAction(formData: FormData) {
  const { organisationId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const reason = cleanString(formData.get("reason")) || "Cancelled before movement";
  const load = await getLoadOrRedirect(loadId, organisationId, returnDate);

  if (load.status !== "planned") {
    worksheetRedirect(returnDate, "error", "only_planned_loads_can_cancel");
  }

  const now = new Date();

  await database
    .update(jobLoads)
    .set({
      status: "cancelled",
      notes: appendOperationalNote(load.notes, "CANCELLED", reason),
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  await syncJobStatus(load.jobId, organisationId);
  revalidateOperations(load.jobId);
  worksheetRedirect(returnDate, "success", "load_cancelled");
}

export async function addExtraLoadAction(formData: FormData) {
  const { userId, organisationId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const jobId = cleanString(formData.get("jobId"));

  if (!jobId) {
    worksheetRedirect(returnDate, "error", "job_required");
  }

  const job = await database.query.jobs.findFirst({
    where: and(
      eq(jobs.id, jobId),
      eq(jobs.organisationId, organisationId),
    ),
    columns: {
      id: true,
      status: true,
      direction: true,
      clientCounterpartyId: true,
      clientSiteId: true,
      ownSiteId: true,
      sitePermitId: true,
      thirdPartyDestinationSiteId: true,
      haulierCounterpartyId: true,
      driverId: true,
      vehicleId: true,
      materialProfileId: true,
      purchaseOrder: true,
      customerReference: true,
      plannedLoads: true,
    },
    with: {
      loads: {
        orderBy: (load, { desc: sortDesc }) => [sortDesc(load.loadNumber)],
        limit: 1,
      },
    },
  });

  if (!job || job.status === "cancelled") {
    worksheetRedirect(returnDate, "error", "job_not_available");
  }

  const previous = job.loads[0];

  if (!previous) {
    worksheetRedirect(returnDate, "error", "source_load_missing");
  }

  const nextLoadNumber = previous.loadNumber + 1;
  const now = new Date();

  await database.transaction(async (tx) => {
    await tx.insert(jobLoads).values({
      id: crypto.randomUUID(),
      organisationId,
      jobId: job.id,
      loadNumber: nextLoadNumber,
      status: "planned",
      direction: job.direction,
      clientCounterpartyId: job.clientCounterpartyId,
      clientSiteId: job.clientSiteId,
      ownSiteId: job.ownSiteId,
      sitePermitId: job.sitePermitId,
      thirdPartyDestinationSiteId: job.thirdPartyDestinationSiteId,
      haulierCounterpartyId: job.haulierCounterpartyId,
      driverId: job.driverId,
      vehicleId: job.vehicleId,
      materialProfileId: job.materialProfileId,
      ewcCodeId: previous.ewcCodeId,
      ewcCodeSnapshot: previous.ewcCodeSnapshot,
      wasteDescriptionSnapshot: previous.wasteDescriptionSnapshot,
      physicalFormSnapshot: previous.physicalFormSnapshot,
      numberOfContainers: previous.numberOfContainers,
      containerTypeSnapshot: previous.containerTypeSnapshot,
      containsPops: previous.containsPops,
      popsSourceOfComponents: previous.popsSourceOfComponents,
      popsComponents: previous.popsComponents,
      containsHazardous: previous.containsHazardous,
      hazardousSourceOfComponents: previous.hazardousSourceOfComponents,
      hazardousHazCodes: previous.hazardousHazCodes,
      hazardousComponents: previous.hazardousComponents,
      disposalRecoveryCodeId: previous.disposalRecoveryCodeId,
      disposalRecoveryCodeSnapshot: previous.disposalRecoveryCodeSnapshot,
      weightMetric: previous.weightMetric,
      weightIsEstimate: false,
      weightSource: "manual",
      purchaseOrder: job.purchaseOrder,
      customerReference: job.customerReference,
      customerChargeAmount: previous.customerChargeAmount,
      customerChargeUnit: previous.customerChargeUnit,
      haulageCostAmount: previous.haulageCostAmount,
      haulageCostUnit: previous.haulageCostUnit,
      tippingCostAmount: previous.tippingCostAmount,
      tippingCostUnit: previous.tippingCostUnit,
      currency: previous.currency,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(jobs)
      .set({
        plannedLoads: Math.max(job.plannedLoads, nextLoadNumber),
        status: job.status === "completed" ? "in_progress" : job.status,
        completedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, job.id),
          eq(jobs.organisationId, organisationId),
        ),
      );
  });

  await syncJobStatus(job.id, organisationId);
  revalidateOperations(job.id);
  worksheetRedirect(returnDate, "success", "extra_load_added");
}
