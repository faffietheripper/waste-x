"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { wasteTrackingPatResults } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { DEFRA_PAT_SCENARIOS } from "@/modules/digital-waste-tracking/pat/pat-scenarios";

import type {
  PatActionIntent,
  PatActionState,
} from "./pat-action-state";

type DefraStatus =
  | "not_started"
  | "ready_to_send"
  | "submitted_to_defra"
  | "confirmed_by_defra"
  | "needs_more_info"
  | "unable_to_run"
  | "failed";

const PAT_PATH = "/admin/digital-waste-tracking/pat";
/* =========================================================
   QUERIES
========================================================= */

export async function getPatResultsAction() {
  await requirePlatformAdmin();

  return await database
    .select()
    .from(wasteTrackingPatResults)
    .orderBy(asc(wasteTrackingPatResults.scenarioOrder));
}

/* =========================================================
   MAIN SERVER ACTION
========================================================= */

export async function patTrackerAction(
  _previousState: PatActionState,
  formData: FormData,
): Promise<PatActionState> {
  await requirePlatformAdmin();

  const intent = normaliseIntent(formData.get("intent"));

  try {
    if (intent === "seed") {
      return await seedPatScenarios();
    }

    const id = cleanRequiredString(formData.get("id"), "PAT result ID");

    if (intent === "ready") {
      return await markScenarioReady(id);
    }

    if (intent === "sent") {
      return await markScenarioSent(id);
    }

    if (intent === "confirmed") {
      return await markScenarioConfirmed(id);
    }

    if (intent === "attach_submission") {
      return await attachSubmissionEvidence(id, formData);
    }

    return await saveScenarioEvidence(id, formData);
  } catch (error) {
    console.error("[PAT_TRACKER_ACTION_FAILED]", error);

    return {
      ok: false,
      message: getActionErrorMessage(error),
      intent,
      timestamp: Date.now(),
    };
  }
}

/* =========================================================
   ACTION IMPLEMENTATIONS
========================================================= */

async function seedPatScenarios(): Promise<PatActionState> {
  const session = await auth();

  let created = 0;
  let updated = 0;

  for (const scenario of DEFRA_PAT_SCENARIOS) {
    const existing = await database
      .select()
      .from(wasteTrackingPatResults)
      .where(eq(wasteTrackingPatResults.scenarioId, scenario.scenarioId))
      .limit(1);

    if (existing.length > 0) {
      await database
        .update(wasteTrackingPatResults)
        .set({
          scenarioOrder: scenario.scenarioOrder,
          scenarioDescription: scenario.scenarioDescription,
          feature: scenario.feature,
          expectedResult: scenario.expectedResult,
          ewcCodes: existing[0].ewcCodes ?? scenario.defaultEwcCodes ?? null,
          reason: existing[0].reason ?? scenario.defaultReason ?? null,
          updatedByUserId: session?.user?.id ?? null,
          updatedAt: new Date(),
        })
        .where(eq(wasteTrackingPatResults.scenarioId, scenario.scenarioId));

      updated += 1;
      continue;
    }

    await database.insert(wasteTrackingPatResults).values({
      scenarioId: scenario.scenarioId,
      scenarioOrder: scenario.scenarioOrder,
      scenarioDescription: scenario.scenarioDescription,
      feature: scenario.feature,
      expectedResult: scenario.expectedResult,
      ewcCodes: scenario.defaultEwcCodes ?? null,
      reason: scenario.defaultReason ?? null,
      createdByUserId: session?.user?.id ?? null,
      updatedByUserId: session?.user?.id ?? null,
    });

    created += 1;
  }

  revalidatePatPages();

  return {
    ok: true,
    message: `PAT scenarios refreshed. ${created} created, ${updated} updated.`,
    intent: "seed",
    timestamp: Date.now(),
  };
}

async function saveScenarioEvidence(
  id: string,
  formData: FormData,
): Promise<PatActionState> {
  const session = await auth();

  const listingId = parseOptionalInteger(formData.get("listingId"), "Listing ID");
  const httpStatus = parseOptionalInteger(
    formData.get("httpStatus"),
    "HTTP status",
  );

  const defraStatus = normaliseDefraStatus(formData.get("defraStatus"));

  const [existing] = await database
    .select()
    .from(wasteTrackingPatResults)
    .where(eq(wasteTrackingPatResults.id, id))
    .limit(1);

  if (!existing) {
    throw new Error("PAT scenario not found.");
  }

  await database
    .update(wasteTrackingPatResults)
    .set({
      wasteTrackingId: cleanOptionalString(formData.get("wasteTrackingId")),
      ewcCodes: cleanOptionalString(formData.get("ewcCodes")),
      reason: cleanOptionalString(formData.get("reason")),

      assignmentId: cleanOptionalString(formData.get("assignmentId")),
      listingId,
      receiptId: cleanOptionalString(formData.get("receiptId")),
      dwtSubmissionId: cleanOptionalString(formData.get("dwtSubmissionId")),

      httpStatus,
      errorMessage: cleanOptionalString(formData.get("errorMessage")),
      testedAt: parseOptionalDate(formData.get("testedAt")),

      defraStatus,

      defraSentAt: parseOptionalDate(formData.get("defraSentAt")),
      defraConfirmedAt: parseOptionalDate(formData.get("defraConfirmedAt")),

      unableToRunReason: cleanOptionalString(formData.get("unableToRunReason")),
      additionalDetails: cleanOptionalString(formData.get("additionalDetails")),
      notes: cleanOptionalString(formData.get("notes")),

      updatedByUserId: session?.user?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(wasteTrackingPatResults.id, id));

  revalidatePatPages();

  return {
    ok: true,
    message: `${existing.scenarioId} evidence saved successfully.`,
    intent: "save",
    scenarioId: existing.scenarioId,
    timestamp: Date.now(),
  };
}

async function attachSubmissionEvidence(
  id: string,
  formData: FormData,
): Promise<PatActionState> {
  const session = await auth();

  const [existing] = await database
    .select()
    .from(wasteTrackingPatResults)
    .where(eq(wasteTrackingPatResults.id, id))
    .limit(1);

  if (!existing) {
    throw new Error("PAT scenario not found.");
  }

  const listingId = parseOptionalInteger(formData.get("listingId"), "Listing ID");
  const httpStatus = parseOptionalInteger(
    formData.get("httpStatus"),
    "HTTP status",
  );

  await database
    .update(wasteTrackingPatResults)
    .set({
      wasteTrackingId: cleanOptionalString(formData.get("wasteTrackingId")),
      ewcCodes: cleanOptionalString(formData.get("ewcCodes")),
      reason: cleanOptionalString(formData.get("reason")),

      assignmentId: cleanOptionalString(formData.get("assignmentId")),
      listingId,
      receiptId: cleanOptionalString(formData.get("receiptId")),
      dwtSubmissionId: cleanOptionalString(formData.get("dwtSubmissionId")),

      httpStatus,
      errorMessage: cleanOptionalString(formData.get("errorMessage")),
      testedAt: parseOptionalDate(formData.get("testedAt")),

      defraStatus: "ready_to_send",

      updatedByUserId: session?.user?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(wasteTrackingPatResults.id, id));

  revalidatePatPages();

  return {
    ok: true,
    message: `${existing.scenarioId} attached to matching DWT evidence.`,
    intent: "attach_submission",
    scenarioId: existing.scenarioId,
    timestamp: Date.now(),
  };
}

async function markScenarioReady(id: string): Promise<PatActionState> {
  const existing = await getExistingPatResult(id);

  await database
    .update(wasteTrackingPatResults)
    .set({
      defraStatus: "ready_to_send",
      updatedAt: new Date(),
    })
    .where(eq(wasteTrackingPatResults.id, id));

  revalidatePatPages();

  return {
    ok: true,
    message: `${existing.scenarioId} marked as ready to send.`,
    intent: "ready",
    scenarioId: existing.scenarioId,
    timestamp: Date.now(),
  };
}

async function markScenarioSent(id: string): Promise<PatActionState> {
  const existing = await getExistingPatResult(id);

  await database
    .update(wasteTrackingPatResults)
    .set({
      defraStatus: "submitted_to_defra",
      defraSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(wasteTrackingPatResults.id, id));

  revalidatePatPages();

  return {
    ok: true,
    message: `${existing.scenarioId} marked as submitted to DEFRA.`,
    intent: "sent",
    scenarioId: existing.scenarioId,
    timestamp: Date.now(),
  };
}

async function markScenarioConfirmed(id: string): Promise<PatActionState> {
  const existing = await getExistingPatResult(id);

  await database
    .update(wasteTrackingPatResults)
    .set({
      defraStatus: "confirmed_by_defra",
      defraConfirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(wasteTrackingPatResults.id, id));

  revalidatePatPages();

  return {
    ok: true,
    message: `${existing.scenarioId} marked as confirmed by DEFRA.`,
    intent: "confirmed",
    scenarioId: existing.scenarioId,
    timestamp: Date.now(),
  };
}

/* =========================================================
   HELPERS
========================================================= */

async function getExistingPatResult(id: string) {
  const [existing] = await database
    .select()
    .from(wasteTrackingPatResults)
    .where(eq(wasteTrackingPatResults.id, id))
    .limit(1);

  if (!existing) {
    throw new Error("PAT scenario not found.");
  }

  return existing;
}

function revalidatePatPages() {
  revalidatePath(PAT_PATH);
  revalidatePath("/admin/digital-waste-tracking");
}

function normaliseIntent(value: FormDataEntryValue | null): PatActionIntent {
  if (
    value === "seed" ||
    value === "save" ||
    value === "ready" ||
    value === "sent" ||
    value === "confirmed" ||
    value === "attach_submission"
  ) {
    return value;
  }

  return "save";
}

function normaliseDefraStatus(value: FormDataEntryValue | null): DefraStatus {
  if (
    value === "not_started" ||
    value === "ready_to_send" ||
    value === "submitted_to_defra" ||
    value === "confirmed_by_defra" ||
    value === "needs_more_info" ||
    value === "unable_to_run" ||
    value === "failed"
  ) {
    return value;
  }

  return "not_started";
}

function cleanRequiredString(value: FormDataEntryValue | null, label: string) {
  if (typeof value !== "string") {
    throw new Error(`${label} is required.`);
  }

  const cleaned = value.trim();

  if (!cleaned) {
    throw new Error(`${label} is required.`);
  }

  return cleaned;
}

function cleanOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : null;
}

function parseOptionalInteger(
  value: FormDataEntryValue | null,
  label: string,
): number | null {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();

  if (!cleaned) return null;

  const parsed = Number(cleaned);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return parsed;
}

function parseOptionalDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();

  if (!cleaned) return null;

  const date = new Date(cleaned);

  if (!Number.isFinite(date.getTime())) {
    throw new Error("One of the date fields is invalid.");
  }

  return date;
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (
      error.message.includes("violates foreign key constraint") ||
      error.message.includes("insert or update on table")
    ) {
      return "Could not save because one of the linked IDs does not exist. Check assignment ID, listing ID, receipt ID or DWT submission ID.";
    }

    return error.message;
  }

  return "Something went wrong while updating the PAT tracker.";
}