// src/modules/digital-waste-tracking/actions/submitReceiveMovementAction.ts

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  carrierAssignments,
  incidents,
  users,
  wasteReceipts,
  wasteTrackingOrganisationSettings,
} from "@/db/schema";

import { and, eq, inArray } from "drizzle-orm";

import {
  type Capability,
  type DepartmentType,
  hasOperationalPermission,
} from "@/modules/auth/core/permissions";

import {
  buildReceiveMovementPayload,
  getReceiveMovementEndpoint,
  getReceiveMovementMethod,
} from "../core/buildReceiveMovementPayload";

import { getDefraAccessToken } from "../core/getDefraAccessToken";

import {
  buildDefraFailureError,
  buildDefraResponseSnapshot,
  getSubmissionStatusFromDefraResponse,
  parseDefraErrors,
  parseDefraWarnings,
  parseDefraWasteTrackingId,
} from "../core/parseDefraValidationErrors";

import {
  flattenValidationResults,
  getReceiveMovementValidationMessage,
  validateReceiveMovementInput,
} from "../core/validateReceiveMovementInput";

import { createWasteTrackingSubmission } from "../data-access/createWasteTrackingSubmission";
import { getWasteTrackingReferenceData } from "../data-access/getWasteTrackingReferenceData";
import { getLatestWasteTrackingSubmissionByAssignment } from "../data-access/getWasteTrackingSubmissionByAssignment";
import { updateWasteTrackingSubmission } from "../data-access/updateWasteTrackingSubmission";

import type {
  DefraValidationResult,
  ReceiveMovementInput,
  ReceiveMovementSubmissionMethod,
  ReceiveMovementSubmissionStatus,
} from "../types/receiveMovement.types";

import type { WasteTrackingEnvironment } from "../types/referenceData.types";

/* =========================================================
   ACTION TYPES
========================================================= */

export type SubmitReceiveMovementActionInput = {
  assignmentId: string;
  receiptId?: string | null;

  /*
    Optional override used if you already know the existing
    Defra wasteTrackingId. If omitted, the action looks for
    the latest stored submission for the assignment.
  */
  wasteTrackingId?: string | null;

  receiveMovementInput: ReceiveMovementInput;
};

export type SubmitReceiveMovementActionResult =
  | {
      success: true;
      message: string;
      submissionId: string;
      wasteTrackingId?: string;
      status: ReceiveMovementSubmissionStatus;
      warnings: DefraValidationResult[];
    }
  | {
      success: false;
      message: string;
      errors?: DefraValidationResult[];
      flattenedErrors?: string[];
      warnings?: DefraValidationResult[];
    };

/* =========================================================
   SMALL HELPERS
========================================================= */

function cleanString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function getBaseUrl(): string {
  const baseUrl =
    cleanString(process.env.DEFRA_WASTE_TRACKING_BASE_URL) ??
    "https://waste-tracking.integration.api.defra.gov.uk";

  return baseUrl.replace(/\/+$/, "");
}

function isUserInvolvedInAssignment(params: {
  organisationId: string;
  assignment: typeof carrierAssignments.$inferSelect;
}) {
  const { organisationId, assignment } = params;

  return (
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId ||
    assignment.managerOrganisationId === organisationId ||
    assignment.carrierOrganisationId === organisationId
  );
}

function canSubmitReceiveMovement(params: {
  capabilities: Capability[];
  departmentType: DepartmentType | null;
}) {
  return hasOperationalPermission({
    capabilities: params.capabilities,
    departmentType: params.departmentType,
    permission: "dwt:submit_receive_movement",
  });
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

async function callDefraReceiveMovement(params: {
  payload: unknown;
  method: ReceiveMovementSubmissionMethod;
  endpoint: string;
  accessToken: string;
}) {
  const response = await fetch(`${getBaseUrl()}${params.endpoint}`, {
    method: params.method,
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.payload),
    cache: "no-store",
  });

  const responseBody = await readResponseBody(response);

  return {
    ok: response.ok,
    statusCode: response.status,
    responseBody,
  };
}

function revalidateDwtPaths(assignmentId: string) {
  revalidatePath("/home/receiving/submissions");
  revalidatePath("/home/compliance/digital-waste-tracking");
  revalidatePath(`/home/receiving/intake/${assignmentId}`);
  revalidatePath("/home/operations/assignments");
  revalidatePath(`/home/operations/assignments/${assignmentId}`);
}

/* =========================================================
   MAIN ACTION
========================================================= */

export async function submitReceiveMovementAction(
  input: SubmitReceiveMovementActionInput,
): Promise<SubmitReceiveMovementActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      success: false,
      message: "You must be signed in to submit a waste tracking movement.",
    };
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  });

  if (!currentUser?.organisationId || !currentUser.organisation) {
    return {
      success: false,
      message:
        "Your account is not linked to an organisation. Please complete organisation setup first.",
    };
  }

  if (!currentUser.department) {
    return {
      success: false,
      message:
        "You need an active department before submitting Digital Waste Tracking records.",
    };
  }

  const organisationId = currentUser.organisationId;

  const capabilities =
    (currentUser.organisation.capabilities as Capability[] | null) ?? [];

  const departmentType =
    (currentUser.department.type as DepartmentType | undefined) ?? null;

  if (
    !canSubmitReceiveMovement({
      capabilities,
      departmentType,
    })
  ) {
    return {
      success: false,
      message:
        "You do not have permission to submit Digital Waste Tracking receive movements.",
      errors: [
        {
          key: "submission.permission",
          errorType: "BusinessRuleViolation",
          message:
            "Your active department does not have dwt:submit_receive_movement permission.",
        },
      ],
    };
  }

  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, input.assignmentId),
  });

  if (!assignment) {
    return {
      success: false,
      message: "Assignment not found.",
      errors: [
        {
          key: "assignment.id",
          errorType: "NotProvided",
          message: "Waste X could not find the assignment linked to this intake.",
        },
      ],
    };
  }

  if (
    !isUserInvolvedInAssignment({
      organisationId,
      assignment,
    })
  ) {
    return {
      success: false,
      message:
        "You cannot submit a Digital Waste Tracking record for an assignment outside your organisation.",
      errors: [
        {
          key: "assignment.organisation",
          errorType: "BusinessRuleViolation",
          message:
            "This assignment is not linked to your organisation as generator, manager, carrier or assigned organisation.",
        },
      ],
    };
  }

  const collectionVerified =
    Boolean(assignment.collectedAt) ||
    Boolean(assignment.codeUsedAt) ||
    assignment.status === "in_progress" ||
    assignment.status === "completed";

  if (!collectionVerified) {
    return {
      success: false,
      message:
        "This assignment has not reached the collection/receiving stage yet.",
      errors: [
        {
          key: "assignment.collectionVerified",
          errorType: "BusinessRuleViolation",
          message:
            "The carrier must verify collection before a receive movement can be submitted.",
        },
      ],
    };
  }

  const unresolvedIncidents = await database.query.incidents.findMany({
    where: and(
      eq(incidents.assignmentId, assignment.id),
      inArray(incidents.status, ["open", "under_review"]),
    ),
    columns: {
      id: true,
      status: true,
    },
  });

  if (unresolvedIncidents.length > 0) {
    return {
      success: false,
      message:
        "This assignment has unresolved incidents. Resolve them before submitting the Digital Waste Tracking receive movement.",
      errors: [
        {
          key: "assignment.incidents",
          errorType: "BusinessRuleViolation",
          message:
            "Unresolved incidents block Digital Waste Tracking submission.",
        },
      ],
    };
  }

  const organisationSettings =
    await database.query.wasteTrackingOrganisationSettings.findFirst({
      where: eq(
        wasteTrackingOrganisationSettings.organisationId,
        organisationId,
      ),
    });

  const environment =
    (organisationSettings?.environment as WasteTrackingEnvironment | null) ??
    "test";

  const receiverApiCode =
    cleanString(organisationSettings?.apiCode) ??
    cleanString(input.receiveMovementInput.receiverApiCode);

  if (!receiverApiCode) {
    return {
      success: false,
      message:
        "Missing receiver API code. Add the organisation Waste Tracking Service API code before submitting.",
      errors: [
        {
          key: "apiCode",
          errorType: "NotProvided",
          message:
            "Receiver API code is required. This is the code Defra gives to the receiving operator/site.",
        },
      ],
    };
  }

  if (organisationSettings && !organisationSettings.isEnabled) {
    return {
      success: false,
      message:
        "Digital Waste Tracking is not enabled for this organisation yet.",
      errors: [
        {
          key: "organisation.digitalWasteTracking",
          errorType: "BusinessRuleViolation",
          message:
            "Enable Digital Waste Tracking in organisation settings before submitting.",
        },
      ],
    };
  }

  const referenceData = await getWasteTrackingReferenceData({
    environment,
    activeOnly: true,
  });

  const receiveMovementInput: ReceiveMovementInput = {
    ...input.receiveMovementInput,
    receiverApiCode,
  };

  const localValidation = validateReceiveMovementInput(receiveMovementInput, {
    referenceData,
  });

  if (!localValidation.valid) {
    return {
      success: false,
      message: getReceiveMovementValidationMessage(localValidation),
      errors: localValidation.errors,
      flattenedErrors: flattenValidationResults(localValidation.errors),
      warnings: localValidation.warnings,
    };
  }

  const payload = buildReceiveMovementPayload(receiveMovementInput);

  const latestSubmission =
    await getLatestWasteTrackingSubmissionByAssignment({
      organisationId,
      assignmentId: assignment.id,
    });

  const existingWasteTrackingId =
    cleanString(input.wasteTrackingId) ??
    cleanString(latestSubmission?.wasteTrackingId);

  const method = getReceiveMovementMethod(existingWasteTrackingId);
  const endpoint = getReceiveMovementEndpoint(existingWasteTrackingId);

  const draftSubmission = await createWasteTrackingSubmission({
    organisationId,
    assignmentId: assignment.id,
    listingId: assignment.listingId,
    receiptId: input.receiptId ?? null,
    submittedByUserId: currentUser.id,
    wasteTrackingId: existingWasteTrackingId ?? null,
    submissionType: "receive",
    status: "submitted",
    method,
    endpoint,
    payloadSnapshot: payload,
    validationWarnings: localValidation.warnings,
    validationErrors: null,
    submittedAt: null,
    lastAttemptedAt: new Date(),
  });

  try {
    const accessToken = await getDefraAccessToken();

    const defraResponse = await callDefraReceiveMovement({
      payload,
      method,
      endpoint,
      accessToken,
    });

    const warnings = parseDefraWarnings(defraResponse.responseBody);
    const errors = parseDefraErrors(defraResponse.responseBody);

    const returnedWasteTrackingId = parseDefraWasteTrackingId(
      defraResponse.responseBody,
    );

    const wasteTrackingId =
      returnedWasteTrackingId ?? existingWasteTrackingId ?? undefined;

    const status = getSubmissionStatusFromDefraResponse({
      ok: defraResponse.ok,
      statusCode: defraResponse.statusCode,
      responseBody: defraResponse.responseBody,
    });

    const responseSnapshot = buildDefraResponseSnapshot({
      ok: defraResponse.ok,
      statusCode: defraResponse.statusCode,
      method,
      endpoint,
      responseBody: defraResponse.responseBody,
    });

    if (!defraResponse.ok) {
      const fallbackError =
        errors.length > 0
          ? undefined
          : buildDefraFailureError({
              statusCode: defraResponse.statusCode,
            });

      const finalErrors = fallbackError ? [fallbackError] : errors;

      await updateWasteTrackingSubmission({
        id: draftSubmission.id,
        organisationId,
        wasteTrackingId: wasteTrackingId ?? null,
        status,
        responseSnapshot,
        validationWarnings: warnings,
        validationErrors: finalErrors,
        submittedAt: new Date(),
        lastAttemptedAt: new Date(),
      });

      revalidateDwtPaths(assignment.id);

      return {
        success: false,
        message:
          finalErrors[0]?.message ??
          "The Waste Tracking Service rejected the receive movement.",
        errors: finalErrors,
        flattenedErrors: flattenValidationResults(finalErrors),
        warnings,
      };
    }

    await updateWasteTrackingSubmission({
      id: draftSubmission.id,
      organisationId,
      wasteTrackingId: wasteTrackingId ?? null,
      status,
      responseSnapshot,
      validationWarnings: warnings,
      validationErrors: [],
      submittedAt: new Date(),
      lastAttemptedAt: new Date(),
    });

    if (input.receiptId) {
      await database
        .update(wasteReceipts)
        .set({
          status: "submitted",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(wasteReceipts.id, input.receiptId),
            eq(wasteReceipts.organisationId, organisationId),
          ),
        );
    }

    revalidateDwtPaths(assignment.id);

    return {
      success: true,
      message:
        status === "accepted_with_warnings"
          ? "Receive movement submitted successfully with warnings. Review the warnings before treating the record as clean."
          : "Receive movement submitted successfully. Waste X saved the submission response and tracking details.",
      submissionId: draftSubmission.id,
      wasteTrackingId,
      status,
      warnings,
    };
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "The Waste Tracking Service request failed unexpectedly.";

    const finalError = buildDefraFailureError({
      key: message.toLowerCase().includes("auth")
        ? "defraAuthentication"
        : "defraWasteTrackingService",
      message,
    });

    await updateWasteTrackingSubmission({
      id: draftSubmission.id,
      organisationId,
      status: "failed",
      responseSnapshot: {
        ok: false,
        method,
        endpoint,
        error: message,
      },
      validationWarnings: localValidation.warnings,
      validationErrors: [finalError],
      submittedAt: null,
      lastAttemptedAt: new Date(),
    });

    revalidateDwtPaths(assignment.id);

    return {
      success: false,
      message,
      errors: [finalError],
      flattenedErrors: flattenValidationResults([finalError]),
      warnings: localValidation.warnings,
    };
  }
}

