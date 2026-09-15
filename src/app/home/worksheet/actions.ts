/* WASTE_X_WORKSHEET_RECEIVING_FLOW_V2 */
/* WASTE_X_ACTUAL_EWC_AT_RECEIPT_V1 */
"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobLoadFieldStates } from "@/db/mobile-field-schema";
import {
  auditEvents,
  counterpartySiteAuthorisations,
  counterpartySiteEwcCodes,
  counterpartySites,
  drivers,
  ewcCodes,
  jobLoads,
  jobLoadWasteItems,
  jobs,
  users,
  vehicles,
} from "@/db/schema";
import { prepareJobLoadWasteReceipt } from "@/modules/digital-waste-tracking/data-access/prepareJobLoadWasteReceipt";
import { syncJobStatus } from "@/modules/jobs/core/syncJobStatus";
import { resolvePermitEwcAcceptance } from "@/modules/permits/core/resolvePermitEwcAcceptance";

type OperationsContext = {
  userId: string;
  organisationId: string;
};

const MANUAL_SITE_ARRIVAL_REASONS = {
  DRIVER_NO_MOBILE_ACCESS: "Driver has no Mobile access",
  DRIVER_DEVICE_UNAVAILABLE: "Driver phone / device unavailable",
  CONNECTIVITY_ISSUE: "Connectivity issue",
  SITE_CONFIRMED_PHYSICAL_ARRIVAL: "Site confirmed physical arrival",
  OTHER: "Other",
} as const;

type ManualSiteArrivalReason = keyof typeof MANUAL_SITE_ARRIVAL_REASONS;

function isManualSiteArrivalReason(
  value: string,
): value is ManualSiteArrivalReason {
  return value in MANUAL_SITE_ARRIVAL_REASONS;
}

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
      permitEwcMatchType: true,
      regulatoryAuthorityActivationId: true,
      permitEwcBasis: true,
      permitEwcReference: true,
      permitEwcCodeSnapshot: true,
      permitEwcCheckedAt: true,
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

  if (
    !parentJob ||
    parentJob.status === "cancelled" ||
    parentJob.status === "draft"
  ) {
    worksheetRedirect(returnDate, "error", "job_not_operational");
  }

  return load;
}

/**
 * Driver Mobile remains the normal own-transport hand-off. If Mobile cannot be
 * used, an authorised receiving-site operator may confirm the physical arrival.
 * That fallback is stored as a site audit event; it never fabricates Driver
 * COLLECTED / IN_TRANSIT / ARRIVED_DESTINATION milestones.
 */
async function manualSiteArrivalExists(
  loadId: string,
  organisationId: string,
) {
  const [manualArrival] = await database
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organisationId, organisationId),
        eq(auditEvents.entityType, "job_load"),
        eq(auditEvents.entityId, loadId),
        eq(auditEvents.action, "MANUAL_SITE_ARRIVAL_CONFIRMED"),
      ),
    )
    .limit(1);

  return Boolean(manualArrival);
}

async function ownTransportArrivalIsAuthorised(
  load: {
    id: string;
    driverId: string | null;
    haulierCounterpartyId: string | null;
  },
  organisationId: string,
) {
  if (!load.driverId || load.haulierCounterpartyId) {
    return true;
  }

  const fieldState = await database.query.jobLoadFieldStates.findFirst({
    where: and(
      eq(jobLoadFieldStates.jobLoadId, load.id),
      eq(jobLoadFieldStates.organisationId, organisationId),
    ),
    columns: { step: true },
  });

  // DELIVERED is accepted only as a legacy development-state alias while old
  // test data is migrated into the streamlined ARRIVED_DESTINATION model.
  const step = fieldState?.step as string | undefined;
  if (step === "ARRIVED_DESTINATION" || step === "DELIVERED") {
    return true;
  }

  return manualSiteArrivalExists(load.id, organisationId);
}

async function requireOwnTransportDriverArrival(
  load: {
    id: string;
    driverId: string | null;
    haulierCounterpartyId: string | null;
  },
  organisationId: string,
  returnDate: string,
) {
  if (!(await ownTransportArrivalIsAuthorised(load, organisationId))) {
    worksheetRedirect(returnDate, "error", "driver_destination_arrival_required");
  }
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

async function incomingPermitAcceptance({
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
    return null;
  }

  const acceptance = await resolvePermitEwcAcceptance({
    organisationId,
    permitId,
    siteId,
    ewcCodeId,
  });

  return acceptance.allowed ? acceptance : null;
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
  const { organisationId, userId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const arrivalMode = cleanString(formData.get("arrivalMode"));
  const load = await getLoadOrRedirect(loadId, organisationId, returnDate);

  if (load.direction !== "incoming") {
    worksheetRedirect(returnDate, "error", "incoming_only_action");
  }

  if (load.status !== "planned") {
    worksheetRedirect(returnDate, "error", "load_not_planned");
  }

  const ownTransport = !load.haulierCounterpartyId;
  const manualSiteFallback =
    ownTransport && arrivalMode === "manual_site_fallback";
  const manualReasonRaw = cleanString(formData.get("manualArrivalReason"));
  const manualNote = optionalString(formData.get("manualArrivalNote"));
  const physicalArrivalConfirmed =
    cleanString(formData.get("physicalArrivalConfirmed")) === "on";

  if (ownTransport && !manualSiteFallback) {
    worksheetRedirect(returnDate, "error", "driver_destination_arrival_required");
  }

  if (manualSiteFallback) {
    if (!physicalArrivalConfirmed) {
      worksheetRedirect(
        returnDate,
        "error",
        "manual_arrival_confirmation_required",
      );
    }

    if (!isManualSiteArrivalReason(manualReasonRaw)) {
      worksheetRedirect(returnDate, "error", "manual_arrival_reason_required");
    }

    if (manualReasonRaw === "OTHER" && (!manualNote || manualNote.length < 3)) {
      worksheetRedirect(returnDate, "error", "manual_arrival_note_required");
    }

    if (manualNote && manualNote.length > 2000) {
      worksheetRedirect(returnDate, "error", "manual_arrival_note_too_long");
    }
  }

  const now = new Date();
  const arrivalTime = load.receivedAt ?? now;
  const movementTime = load.movementAt ?? now;
  const manualReason = manualSiteFallback
    ? (manualReasonRaw as ManualSiteArrivalReason)
    : null;
  const manualReasonLabel = manualReason
    ? MANUAL_SITE_ARRIVAL_REASONS[manualReason]
    : null;
  const resolvedNotes =
    manualSiteFallback && manualReasonLabel
      ? appendOperationalNote(
          load.notes,
          "MANUAL SITE ARRIVAL",
          [
            "Channel: Web",
            `Reason: ${manualReasonLabel}`,
            manualNote ? `Note: ${manualNote}` : null,
          ]
            .filter((value): value is string => Boolean(value))
            .join(" · "),
        )
      : load.notes;

  await database.transaction(async (tx) => {
    await tx
      .update(jobLoads)
      .set({
        status: "arrived",
        receivedAt: arrivalTime,
        movementAt: movementTime,
        notes: resolvedNotes,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobLoads.id, load.id),
          eq(jobLoads.organisationId, organisationId),
        ),
      );

    if (manualSiteFallback && manualReason && manualReasonLabel) {
      await tx.insert(auditEvents).values({
        organisationId,
        userId,
        entityType: "job_load",
        entityId: load.id,
        action: "MANUAL_SITE_ARRIVAL_CONFIRMED",
        previousState: JSON.stringify({
          status: load.status,
          receivedAt: load.receivedAt?.toISOString() ?? null,
          movementAt: load.movementAt?.toISOString() ?? null,
          driverId: load.driverId,
          vehicleId: load.vehicleId,
        }),
        newState: JSON.stringify({
          status: "arrived",
          receivedAt: arrivalTime.toISOString(),
          movementAt: movementTime.toISOString(),
          driverId: load.driverId,
          vehicleId: load.vehicleId,
          channel: "WEB",
          physicalArrivalConfirmed: true,
          reasonCode: manualReason,
          reason: manualReasonLabel,
          note: manualNote,
        }),
      });
    }
  });

  await syncJobStatus(load.jobId, organisationId);
  revalidateOperations(load.jobId);
  worksheetRedirect(
    returnDate,
    "success",
    manualSiteFallback ? "load_arrived_manually" : "load_arrived",
  );
}

/* WASTE_X_MULTI_WASTE_ITEM_LOAD_V1 */
async function getOperationalWasteItems(
  organisationId: string,
  jobLoadId: string,
) {
  return database.query.jobLoadWasteItems.findMany({
    where: and(
      eq(jobLoadWasteItems.organisationId, organisationId),
      eq(jobLoadWasteItems.jobLoadId, jobLoadId),
    ),
    orderBy: (item, { asc }) => [asc(item.itemNumber)],
  });
}

function wasteAllocationTolerance(
  metric: "Grams" | "Kilograms" | "Tonnes",
) {
  if (metric === "Grams") return 1;
  if (metric === "Kilograms") return 0.01;
  return 0.001;
}

async function saveWasteItemAllocationsFromForm(params: {
  formData: FormData;
  organisationId: string;
  loadId: string;
  metric: "Grams" | "Kilograms" | "Tonnes";
  netWeight: number | null;
}) {
  const items = await getOperationalWasteItems(
    params.organisationId,
    params.loadId,
  );

  if (items.length === 0) return;

  const hasAllocationInput = items.some((item) =>
    params.formData.has(`wasteItemWeight:${item.id}`),
  );

  if (!hasAllocationInput) {
    if (
      items.length === 1 &&
      params.netWeight !== null &&
      params.netWeight > 0
    ) {
      await database
        .update(jobLoadWasteItems)
        .set({
          weightAmount: params.netWeight.toFixed(3),
          weightMetric: params.metric,
          weightIsEstimate: false,
          weightSource: "allocation",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobLoadWasteItems.id, items[0].id),
            eq(
              jobLoadWasteItems.organisationId,
              params.organisationId,
            ),
          ),
        );
    }
    return;
  }

  const allocations = items.map((item) => {
    const raw = cleanString(
      params.formData.get(`wasteItemWeight:${item.id}`),
    );
    const amount = raw ? Number(raw) : NaN;

    return {
      item,
      amount,
      isEstimate:
        cleanString(
          params.formData.get(`wasteItemEstimated:${item.id}`),
        ) === "on",
    };
  });

  if (
    allocations.some(
      ({ amount }) => !Number.isFinite(amount) || amount <= 0,
    )
  ) {
    throw new Error("waste_item_weights_required");
  }

  if (
    params.netWeight !== null &&
    Number.isFinite(params.netWeight) &&
    params.netWeight > 0
  ) {
    const allocated = allocations.reduce(
      (total, row) => total + row.amount,
      0,
    );

    if (
      Math.abs(allocated - params.netWeight) >
      wasteAllocationTolerance(params.metric)
    ) {
      throw new Error("waste_item_weights_do_not_match_net");
    }
  }

  await database.transaction(async (tx) => {
    for (const { item, amount, isEstimate } of allocations) {
      await tx
        .update(jobLoadWasteItems)
        .set({
          weightAmount: amount.toFixed(3),
          weightMetric: params.metric,
          weightIsEstimate: isEstimate,
          weightSource: "allocation",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobLoadWasteItems.id, item.id),
            eq(
              jobLoadWasteItems.organisationId,
              params.organisationId,
            ),
          ),
        );
    }
  });
}

async function requireReconciledWasteItems(params: {
  organisationId: string;
  loadId: string;
  netWeight: number;
  metric: "Grams" | "Kilograms" | "Tonnes";
}) {
  const items = await getOperationalWasteItems(
    params.organisationId,
    params.loadId,
  );

  if (items.length === 0) return;

  if (items.length === 1 && !items[0].weightAmount) {
    await database
      .update(jobLoadWasteItems)
      .set({
        weightAmount: params.netWeight.toFixed(3),
        weightMetric: params.metric,
        weightIsEstimate: false,
        weightSource: "allocation",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobLoadWasteItems.id, items[0].id),
          eq(
            jobLoadWasteItems.organisationId,
            params.organisationId,
          ),
        ),
      );
    return;
  }

  const amounts = items.map((item) => Number(item.weightAmount ?? "0"));

  if (
    amounts.some(
      (amount) => !Number.isFinite(amount) || amount <= 0,
    )
  ) {
    throw new Error("waste_item_weights_required");
  }

  const allocated = amounts.reduce(
    (total, amount) => total + amount,
    0,
  );

  if (
    Math.abs(allocated - params.netWeight) >
    wasteAllocationTolerance(params.metric)
  ) {
    throw new Error("waste_item_weights_do_not_match_net");
  }
}

async function snapshotIncomingWasteItemAcceptances(params: {
  organisationId: string;
  load: Awaited<ReturnType<typeof getLoadOrRedirect>>;
}) {
  const items = await getOperationalWasteItems(
    params.organisationId,
    params.load.id,
  );

  if (items.length === 0) {
    const legacyAcceptance = await incomingPermitAcceptance({
      organisationId: params.organisationId,
      permitId: params.load.sitePermitId,
      siteId: params.load.ownSiteId,
      ewcCodeId: params.load.ewcCodeId,
    });

    return legacyAcceptance
      ? [{ item: null, acceptance: legacyAcceptance }]
      : [];
  }

  const resolved: Array<{
    item: (typeof items)[number];
    acceptance: Extract<
      Awaited<ReturnType<typeof resolvePermitEwcAcceptance>>,
      { allowed: true }
    >;
  }> = [];

  for (const item of items) {
    if (!item.ewcCodeId || !item.wasteDescriptionSnapshot.trim()) {
      return [];
    }

    const acceptance = await incomingPermitAcceptance({
      organisationId: params.organisationId,
      permitId: params.load.sitePermitId,
      siteId: params.load.ownSiteId,
      ewcCodeId: item.ewcCodeId,
    });

    if (!acceptance) return [];

    resolved.push({ item, acceptance });
  }

  await database.transaction(async (tx) => {
    for (const { item, acceptance } of resolved) {
      await tx
        .update(jobLoadWasteItems)
        .set({
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
            acceptance.permittedEwcCode || item.ewcCodeSnapshot,
          permitEwcCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobLoadWasteItems.id, item.id),
            eq(
              jobLoadWasteItems.organisationId,
              params.organisationId,
            ),
          ),
        );
    }
  });

  return resolved;
}

export async function updateLoadWasteItemAction(formData: FormData) {
  const { organisationId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const itemId = cleanString(formData.get("itemId"));
  const requestedEwcCodeId = cleanString(formData.get("ewcCodeId"));
  const reason = cleanString(formData.get("reason"));
  const load = await getLoadOrRedirect(
    loadId,
    organisationId,
    returnDate,
  );

  if (load.direction !== "incoming") {
    worksheetRedirect(returnDate, "error", "incoming_only_action");
  }

  if (load.status !== "arrived") {
    worksheetRedirect(
      returnDate,
      "error",
      "ewc_change_before_acceptance_only",
    );
  }

  const item = await database.query.jobLoadWasteItems.findFirst({
    where: and(
      eq(jobLoadWasteItems.id, itemId),
      eq(jobLoadWasteItems.jobLoadId, load.id),
      eq(jobLoadWasteItems.organisationId, organisationId),
    ),
  });

  if (!item) {
    worksheetRedirect(returnDate, "error", "waste_item_not_found");
  }

  const actualEwc = await database.query.ewcCodes.findFirst({
    where: and(
      eq(ewcCodes.id, requestedEwcCodeId),
      eq(ewcCodes.isActive, true),
      eq(ewcCodes.classificationUsable, true),
    ),
    columns: {
      id: true,
      code: true,
    },
  });

  if (!actualEwc) {
    worksheetRedirect(returnDate, "error", "invalid_ewc");
  }

  const changed = actualEwc.id !== item.ewcCodeId;

  if (changed && reason.trim().length < 3) {
    worksheetRedirect(
      returnDate,
      "error",
      "ewc_change_reason_required",
    );
  }

  const acceptance = await incomingPermitAcceptance({
    organisationId,
    permitId: load.sitePermitId,
    siteId: load.ownSiteId,
    ewcCodeId: actualEwc.id,
  });

  if (!acceptance) {
    worksheetRedirect(returnDate, "error", "permit_mismatch");
  }

  const now = new Date();

  await database.transaction(async (tx) => {
    await tx
      .update(jobLoadWasteItems)
      .set({
        ewcCodeId: actualEwc.id,
        ewcCodeSnapshot: actualEwc.code,
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
          acceptance.permittedEwcCode || actualEwc.code,
        permitEwcCheckedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobLoadWasteItems.id, item.id),
          eq(jobLoadWasteItems.organisationId, organisationId),
        ),
      );

    /*
      Legacy Job Load fields mirror Waste Item 1 during the compatibility
      phase so old screens/integrations do not silently disagree.
    */
    if (item.itemNumber === 1) {
      await tx
        .update(jobLoads)
        .set({
          ewcCodeId: actualEwc.id,
          ewcCodeSnapshot: actualEwc.code,
          permitEwcMatchType: acceptance.matchType,
          permitEwcEquivalenceId: null,
          regulatoryAuthorityActivationId:
            acceptance.matchType === "regulatory_authority"
              ? acceptance.activationId
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
            acceptance.permittedEwcCode || actualEwc.code,
          permitEwcCheckedAt: now,
          notes:
            changed && reason
              ? appendOperationalNote(
                  load.notes,
                  "ACTUAL WASTE ITEM EWC UPDATED",
                  `Item ${item.itemNumber}: ${item.ewcCodeSnapshot} → ${actualEwc.code}. ${reason}`,
                )
              : load.notes,
          updatedAt: now,
        })
        .where(
          and(
            eq(jobLoads.id, load.id),
            eq(jobLoads.organisationId, organisationId),
          ),
        );
    }
  });

  revalidateOperations(load.jobId);
  worksheetRedirect(returnDate, "success", "waste_item_updated");
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
  const notes = optionalString(formData.get("notes"));
  const weightMetric = cleanString(formData.get("weightMetric"));

  if (!wasteDescription) {
    worksheetRedirect(returnDate, "error", "waste_description_required");
  }

  if (!["Grams", "Kilograms", "Tonnes"].includes(weightMetric)) {
    worksheetRedirect(returnDate, "error", "invalid_weight_metric");
  }

  const requestedEwcCodeId =
    optionalString(formData.get("ewcCodeId")) ?? load.ewcCodeId;
  const ewcChangeReason = optionalString(
    formData.get("ewcChangeReason"),
  );

  let actualEwcCodeId = load.ewcCodeId;
  let actualEwcCodeSnapshot = load.ewcCodeSnapshot;
  let permitEwcMatchType = load.permitEwcMatchType;
  let regulatoryAuthorityActivationId = load.regulatoryAuthorityActivationId;
  let permitEwcBasis = load.permitEwcBasis;
  let permitEwcReference = load.permitEwcReference;
  let permitEwcCodeSnapshot = load.permitEwcCodeSnapshot;
  let permitEwcCheckedAt = load.permitEwcCheckedAt;
  let resolvedNotes = notes;

  if (load.direction === "incoming" && requestedEwcCodeId) {
    const actualEwc = await database.query.ewcCodes.findFirst({
      where: and(
        eq(ewcCodes.id, requestedEwcCodeId),
        eq(ewcCodes.isActive, true),
      ),
      columns: {
        id: true,
        code: true,
      },
    });

    if (!actualEwc) {
      worksheetRedirect(returnDate, "error", "invalid_ewc");
    }

    const ewcChanged =
      requestedEwcCodeId !== load.ewcCodeId;

    if (ewcChanged && load.status !== "arrived") {
      worksheetRedirect(
        returnDate,
        "error",
        "ewc_change_before_acceptance_only",
      );
    }

    if (
      ewcChanged &&
      (!ewcChangeReason || ewcChangeReason.trim().length < 3)
    ) {
      worksheetRedirect(
        returnDate,
        "error",
        "ewc_change_reason_required",
      );
    }

    const acceptance = await incomingPermitAcceptance({
      organisationId,
      permitId: load.sitePermitId,
      siteId: load.ownSiteId,
      ewcCodeId: actualEwc.id,
    });

    if (!acceptance) {
      worksheetRedirect(returnDate, "error", "permit_mismatch");
    }

    actualEwcCodeId = actualEwc.id;
    actualEwcCodeSnapshot = actualEwc.code;
    permitEwcMatchType = acceptance.matchType;
    regulatoryAuthorityActivationId =
      acceptance.matchType === "regulatory_authority"
        ? acceptance.equivalenceId
        : null;
    permitEwcBasis =
      acceptance.matchType === "regulatory_authority"
        ? acceptance.basis
        : null;
    permitEwcReference =
      acceptance.matchType === "regulatory_authority"
        ? acceptance.reference
        : null;
    permitEwcCodeSnapshot =
      acceptance.permittedEwcCode || actualEwc.code;
    permitEwcCheckedAt = new Date();

    if (ewcChanged && ewcChangeReason) {
      resolvedNotes = appendOperationalNote(
        resolvedNotes,
        "ACTUAL EWC UPDATED",
        `${load.ewcCodeSnapshot ?? "Not recorded"} → ${actualEwc.code}. ${ewcChangeReason}`,
      );
    }
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

  const isWeightEntry =
    grossWeight !== null || tareWeight !== null || netWeight !== null;

  if (isWeightEntry && load.direction === "incoming") {
    if (load.status !== "arrived" && load.status !== "accepted") {
      worksheetRedirect(returnDate, "error", "weight_after_arrival_only");
    }
    await requireOwnTransportDriverArrival(load, organisationId, returnDate);
  }

  if (grossWeight !== null && tareWeight !== null) {
    if (grossWeight < tareWeight) {
      worksheetRedirect(returnDate, "error", "gross_below_tare");
    }
    netWeight = grossWeight - tareWeight;
  }

  try {
    await saveWasteItemAllocationsFromForm({
      formData,
      organisationId,
      loadId: load.id,
      metric: weightMetric as "Grams" | "Kilograms" | "Tonnes",
      netWeight,
    });
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "invalid_waste_item_weights";
    worksheetRedirect(returnDate, "error", code);
  }

  await database
    .update(jobLoads)
    .set({
      driverId,
      vehicleId,
      ewcCodeId: actualEwcCodeId,
      ewcCodeSnapshot: actualEwcCodeSnapshot,
      permitEwcMatchType,
      permitEwcEquivalenceId: null,
      regulatoryAuthorityActivationId,
      permitEwcBasis,
      permitEwcReference,
      permitEwcCodeSnapshot,
      permitEwcCheckedAt,
      wasteDescriptionSnapshot: wasteDescription,
      grossWeight: toDbDecimal(grossWeight),
      tareWeight: toDbDecimal(tareWeight),
      netWeight: toDbDecimal(netWeight),
      weightMetric: weightMetric as "Grams" | "Kilograms" | "Tonnes",
      weightIsEstimate: cleanString(formData.get("weightIsEstimate")) === "on",
      weightSource: "manual",
      // Ticket number is intentionally not accepted from this form. It is
      // created by the receiving-site ticket authority after completion.
      notes: resolvedNotes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  if (load.direction === "incoming" && actualEwcCodeId) {
    await database
      .update(jobLoadWasteItems)
      .set({
        ewcCodeId: actualEwcCodeId,
        ewcCodeSnapshot: actualEwcCodeSnapshot ?? "NOT_RECORDED",
        wasteDescriptionSnapshot: wasteDescription,
        permitEwcMatchType,
        regulatoryAuthorityActivationId,
        permitEwcBasis,
        permitEwcReference,
        permitEwcCodeSnapshot,
        permitEwcCheckedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobLoadWasteItems.jobLoadId, load.id),
          eq(jobLoadWasteItems.organisationId, organisationId),
          eq(jobLoadWasteItems.itemNumber, 1),
        ),
      );
  }

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

  await requireOwnTransportDriverArrival(load, organisationId, returnDate);

  if (!load.wasteDescriptionSnapshot?.trim()) {
    worksheetRedirect(returnDate, "error", "waste_description_required");
  }

  const acceptedWasteItems = await snapshotIncomingWasteItemAcceptances({
    organisationId,
    load,
  });
  const permitAcceptance = acceptedWasteItems[0]?.acceptance ?? null;

  if (!permitAcceptance || acceptedWasteItems.length === 0) {
    worksheetRedirect(returnDate, "error", "permit_mismatch");
  }

  const regulatoryItems = acceptedWasteItems.filter(
    ({ acceptance }) =>
      acceptance.matchType === "regulatory_authority",
  );

  const acceptanceNote =
    regulatoryItems.length > 0
      ? appendOperationalNote(
          load.notes,
          "REGULATORY ACCEPTANCE AUTHORITY",
          regulatoryItems
            .map(({ item, acceptance }) =>
              `Item ${item?.itemNumber ?? 1}: actual EWC ${
                item?.ewcCodeSnapshot ??
                load.ewcCodeSnapshot ??
                "Not recorded"
              } accepted against permit EWC ${
                acceptance.permittedEwcCode ||
                "configured activity authority"
              } · ${acceptance.basis} · ${acceptance.reference}`,
            )
            .join(" | "),
        )
      : load.notes;

  await database
    .update(jobLoads)
    .set({
      status: "accepted",
      permitEwcMatchType: permitAcceptance.matchType,
      permitEwcEquivalenceId: null,
      regulatoryAuthorityActivationId:
        permitAcceptance.matchType === "regulatory_authority"
          ? permitAcceptance.activationId
          : null,
      permitEwcBasis:
        permitAcceptance.matchType === "regulatory_authority"
          ? permitAcceptance.basis
          : null,
      permitEwcReference:
        permitAcceptance.matchType === "regulatory_authority"
          ? permitAcceptance.reference
          : null,
      permitEwcCodeSnapshot:
        permitAcceptance.permittedEwcCode ||
        load.ewcCodeSnapshot,
      permitEwcCheckedAt: new Date(),
      notes: acceptanceNote,
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

  await requireOwnTransportDriverArrival(load, organisationId, returnDate);

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

  await requireOwnTransportDriverArrival(load, organisationId, returnDate);

  if (!load.receivedAt) {
    worksheetRedirect(returnDate, "error", "received_time_missing");
  }

  const netWeight = Number(load.netWeight ?? "0");
  if (!Number.isFinite(netWeight) || netWeight <= 0) {
    worksheetRedirect(returnDate, "error", "net_weight_required");
  }

  try {
    await requireReconciledWasteItems({
      organisationId,
      loadId: load.id,
      netWeight,
      metric: load.weightMetric,
    });
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "invalid_waste_item_weights";
    worksheetRedirect(returnDate, "error", code);
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
    DWT is downstream compliance, not a yard gate. Prepare from the completed
    factual receipt, but leave physical operations complete if the reporting
    service or configuration is unavailable. The DWT Centre can retry.
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
  const nextLoadId = crypto.randomUUID();
  const now = new Date();
  const previousWasteItems = await getOperationalWasteItems(
    organisationId,
    previous.id,
  );

  await database.transaction(async (tx) => {
    await tx.insert(jobLoads).values({
      id: nextLoadId,
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

    if (previousWasteItems.length > 0) {
      await tx.insert(jobLoadWasteItems).values(
        previousWasteItems.map((item) => ({
          id: crypto.randomUUID(),
          organisationId,
          jobLoadId: nextLoadId,
          itemNumber: item.itemNumber,
          materialProfileId: item.materialProfileId,
          ewcCodeId: item.ewcCodeId,
          ewcCodeSnapshot: item.ewcCodeSnapshot,
          wasteDescriptionSnapshot: item.wasteDescriptionSnapshot,
          physicalFormSnapshot: item.physicalFormSnapshot,
          numberOfContainers: item.numberOfContainers,
          containerTypeSnapshot: item.containerTypeSnapshot,
          containsPops: item.containsPops,
          popsSourceOfComponents: item.popsSourceOfComponents,
          popsComponents: item.popsComponents,
          containsHazardous: item.containsHazardous,
          hazardousSourceOfComponents:
            item.hazardousSourceOfComponents,
          hazardousHazCodes: item.hazardousHazCodes,
          hazardousComponents: item.hazardousComponents,
          disposalRecoveryCodeId: item.disposalRecoveryCodeId,
          disposalRecoveryCodeSnapshot:
            item.disposalRecoveryCodeSnapshot,
          weightMetric: item.weightMetric,
          weightAmount: null,
          weightIsEstimate: false,
          weightSource: "allocation" as const,
          permitEwcMatchType: item.permitEwcMatchType,
          regulatoryAuthorityActivationId:
            item.regulatoryAuthorityActivationId,
          regulatoryAcceptanceRuleId:
            item.regulatoryAcceptanceRuleId,
          regulatoryRuleKeySnapshot:
            item.regulatoryRuleKeySnapshot,
          regulatoryRuleScopeSnapshot:
            item.regulatoryRuleScopeSnapshot,
          qualifyingAuthorisationRefSnapshot:
            item.qualifyingAuthorisationRefSnapshot,
          permitEwcBasis: item.permitEwcBasis,
          permitEwcReference: item.permitEwcReference,
          permitEwcCodeSnapshot: item.permitEwcCodeSnapshot,
          permitEwcCheckedAt: item.permitEwcCheckedAt,
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

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
