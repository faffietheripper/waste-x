"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  ewcCodes,
  jobLoads,
  permitEwcCodes,
  users,
  wasteReceipts,
  wasteTrackingOrganisationSettings,
} from "@/db/schema";
import {
  type Capability,
  type DepartmentType,
  hasOperationalPermissionForOrganisation,
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
  validateReceiveMovementInput,
} from "../core/validateReceiveMovementInput";
import { createJobLoadWasteTrackingSubmission } from "../data-access/createJobLoadWasteTrackingSubmission";
import { getWasteTrackingReferenceData } from "../data-access/getWasteTrackingReferenceData";
import { getLatestWasteTrackingSubmissionByJobLoad } from "../data-access/getWasteTrackingSubmissionByJobLoad";
import { updateWasteTrackingSubmission } from "../data-access/updateWasteTrackingSubmission";

import type {
  DefraValidationResult,
  ReceiveMovementInput,
  ReceiveMovementSubmissionMethod,
  ReceiveMovementSubmissionStatus,
} from "../types/receiveMovement.types";
import type { WasteTrackingEnvironment } from "../types/referenceData.types";

export type SubmitJobLoadReceiveMovementActionInput = {
  jobLoadId: string;
  receiptId: string;
  wasteTrackingId?: string | null;
  receiveMovementInput: ReceiveMovementInput;
};

export type SubmitJobLoadReceiveMovementActionResult =
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
      submissionId?: string;
      status?: ReceiveMovementSubmissionStatus;
      errors?: DefraValidationResult[];
      flattenedErrors?: string[];
      warnings?: DefraValidationResult[];
    };

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

function canSubmitReceiveMovement(params: {
  capabilities: Capability[];
  departmentType: DepartmentType | null;
  operatingMode?: string | null;
}) {
  return hasOperationalPermissionForOrganisation({
    capabilities: params.capabilities,
    departmentType: params.departmentType,
    permission: "dwt:submit_receive_movement",
    operatingMode: params.operatingMode,
  });
}

type LocalValidation = ReturnType<typeof validateReceiveMovementInput>;

function localErrors(validation: LocalValidation): DefraValidationResult[] {
  return "errors" in validation && Array.isArray(validation.errors)
    ? validation.errors
    : [];
}

function localWarnings(validation: LocalValidation): DefraValidationResult[] {
  return "warnings" in validation && Array.isArray(validation.warnings)
    ? validation.warnings
    : [];
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
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

  return {
    ok: response.ok,
    statusCode: response.status,
    responseBody: await readResponseBody(response),
  };
}

function revalidateDwtPaths(jobLoadId: string, jobId: string) {
  revalidatePath("/home/dwt");
  revalidatePath("/home/dwt/intake");
  revalidatePath(`/home/dwt/intake/${jobLoadId}`);
  revalidatePath("/home/dwt/submissions");
  revalidatePath("/home/movements/incoming");
  revalidatePath("/home/worksheet");
  revalidatePath(`/home/jobs/${jobId}`);

  // Keep the approved legacy monitoring screens current while they remain as
  // a fallback/regression path.
  revalidatePath("/home/receiving/submissions");
  revalidatePath("/home/compliance/digital-waste-tracking");
  revalidatePath("/admin/digital-waste-tracking");
}

export async function submitJobLoadReceiveMovementAction(
  input: SubmitJobLoadReceiveMovementActionInput,
): Promise<SubmitJobLoadReceiveMovementActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      success: false,
      message: "You must be signed in to submit a waste tracking movement.",
    };
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: { organisation: true, department: true },
  });

  if (!currentUser?.organisationId || !currentUser.organisation) {
    return {
      success: false,
      message: "Your account is not linked to an organisation.",
    };
  }

  const capabilities =
    (currentUser.organisation.capabilities as Capability[] | null) ?? [];
  const departmentType =
    (currentUser.department?.type as DepartmentType | undefined) ?? null;

  if (
    !canSubmitReceiveMovement({
      capabilities,
      departmentType,
      operatingMode: currentUser.organisation.operatingMode,
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
            "Your current workspace does not have dwt:submit_receive_movement permission.",
        },
      ],
    };
  }

  const organisationId = currentUser.organisationId;

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, input.jobLoadId),
      eq(jobLoads.organisationId, organisationId),
    ),
    columns: {
      id: true,
      jobId: true,
      direction: true,
      status: true,
      ownSiteId: true,
      sitePermitId: true,
      receivedAt: true,
    },
  });

  if (!load) {
    return {
      success: false,
      message: "Job Load not found.",
      errors: [
        {
          key: "jobLoad.id",
          errorType: "NotProvided",
          message: "Waste X could not find this Job Load in your organisation.",
        },
      ],
    };
  }

  if (load.direction !== "incoming" || load.status !== "completed") {
    return {
      success: false,
      message:
        "Only completed incoming Job Loads can be submitted as Receipt of Waste movements.",
      errors: [
        {
          key: "jobLoad.status",
          errorType: "BusinessRuleViolation",
          message:
            "Complete the incoming load in the Daily Worksheet before DWT review/submission.",
        },
      ],
    };
  }

  const receipt = await database.query.wasteReceipts.findFirst({
    where: and(
      eq(wasteReceipts.id, input.receiptId),
      eq(wasteReceipts.organisationId, organisationId),
      eq(wasteReceipts.jobLoadId, load.id),
    ),
  });

  if (!receipt) {
    return {
      success: false,
      message: "The DWT receipt draft for this Job Load could not be found.",
      errors: [
        {
          key: "receipt.id",
          errorType: "NotProvided",
          message: "Prepare a DWT receipt draft before submitting.",
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
        "Missing Receiver API Code. Add it in Digital Waste Tracking settings before submitting.",
      errors: [
        {
          key: "apiCode",
          errorType: "NotProvided",
          message: "Receiver API Code is required.",
        },
      ],
    };
  }

  if (organisationSettings && !organisationSettings.isEnabled) {
    return {
      success: false,
      message: "Digital Waste Tracking is disabled for this organisation.",
      errors: [
        {
          key: "organisation.digitalWasteTracking",
          errorType: "BusinessRuleViolation",
          message: "Enable DWT in organisation settings before submitting.",
        },
      ],
    };
  }

  /*
    Solo safety check outside the approved Defra payload engine.

    The legacy /home/receiving action is intentionally untouched. For the new
    Job Load workflow we additionally verify that every EWC the reviewer is
    about to submit is still on the permit linked to the completed load. This
    prevents a manual DWT edit from bypassing the permit check that happened in
    operations.
  */
  if (!load.sitePermitId) {
    return {
      success: false,
      message: "This Job Load is not linked to a receiving-site permit.",
      errors: [
        {
          key: "receiver.authorisationNumber",
          errorType: "BusinessRuleViolation",
          message:
            "Link the Job Load to the correct receiving permit before submitting DWT.",
        },
      ],
    };
  }

  const normaliseEwc = (value: string) =>
    value.replace(/\s+/g, "").trim().toUpperCase();

  const submittedEwcCodes = Array.from(
    new Set(
      input.receiveMovementInput.wasteItems
        .flatMap((item) => item.ewcCodes ?? [])
        .map(normaliseEwc)
        .filter(Boolean),
    ),
  );

  const permittedRows = await database
    .select({ code: ewcCodes.code })
    .from(permitEwcCodes)
    .innerJoin(ewcCodes, eq(ewcCodes.id, permitEwcCodes.ewcCodeId))
    .where(
      and(
        eq(permitEwcCodes.organisationId, organisationId),
        eq(permitEwcCodes.permitId, load.sitePermitId),
        eq(permitEwcCodes.isActive, true),
      ),
    );

  const permittedCodes = new Set(
    permittedRows.map((row) => normaliseEwc(row.code)),
  );

  const unpermittedCodes = submittedEwcCodes.filter(
    (code) => !permittedCodes.has(code),
  );

  if (unpermittedCodes.length > 0) {
    const permitErrors: DefraValidationResult[] = unpermittedCodes.map(
      (code) => ({
        key: "wasteItems.ewcCodes",
        errorType: "BusinessRuleViolation",
        message: `EWC ${code} is not configured as permitted on the receiving permit linked to this load.`,
      }),
    );

    return {
      success: false,
      message:
        "The reviewed waste classification does not match the receiving permit.",
      errors: permitErrors,
      flattenedErrors: flattenValidationResults(permitErrors),
      warnings: [],
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

  const validation = validateReceiveMovementInput(receiveMovementInput, {
    referenceData,
  });
  const errors = localErrors(validation);
  const warnings = localWarnings(validation);

  if (errors.length > 0) {
    return {
      success: false,
      message:
        errors[0]?.message ??
        "Waste X found validation issues before contacting the Waste Tracking Service.",
      errors,
      flattenedErrors: flattenValidationResults(errors),
      warnings,
    };
  }

  /*
    IMPORTANT REGRESSION BOUNDARY:
    This uses the same approved payload builder and POST/PUT helpers as the
    legacy /home/receiving workflow. We are changing only the Waste X source
    identity from carrierAssignment -> jobLoad.
  */
  const payload = buildReceiveMovementPayload(receiveMovementInput);

  const latestSubmission = await getLatestWasteTrackingSubmissionByJobLoad({
    organisationId,
    jobLoadId: load.id,
  });

  const existingWasteTrackingId =
    cleanString(input.wasteTrackingId) ??
    cleanString(latestSubmission?.wasteTrackingId);

  const method = getReceiveMovementMethod(existingWasteTrackingId);
  const endpoint = getReceiveMovementEndpoint(existingWasteTrackingId);

  const draftSubmission = await createJobLoadWasteTrackingSubmission({
    organisationId,
    jobLoadId: load.id,
    siteId: load.ownSiteId,
    receiptId: receipt.id,
    submittedByUserId: currentUser.id,
    wasteTrackingId: existingWasteTrackingId ?? null,
    submissionType: "receive",
    status: "submitted",
    method,
    endpoint,
    payloadSnapshot: payload,
    validationWarnings: warnings,
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

    const defraWarnings = parseDefraWarnings(defraResponse.responseBody);
    const defraErrors = parseDefraErrors(defraResponse.responseBody);
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
        defraErrors.length > 0
          ? undefined
          : buildDefraFailureError({ statusCode: defraResponse.statusCode });
      const finalErrors = fallbackError ? [fallbackError] : defraErrors;

      await updateWasteTrackingSubmission({
        id: draftSubmission.id,
        organisationId,
        wasteTrackingId: wasteTrackingId ?? null,
        status,
        responseSnapshot,
        validationWarnings: defraWarnings,
        validationErrors: finalErrors,
        submittedAt: new Date(),
        lastAttemptedAt: new Date(),
      });

      revalidateDwtPaths(load.id, load.jobId);

      return {
        success: false,
        message:
          finalErrors[0]?.message ??
          "The Waste Tracking Service rejected the receive movement.",
        submissionId: draftSubmission.id,
        status,
        errors: finalErrors,
        flattenedErrors: flattenValidationResults(finalErrors),
        warnings: defraWarnings,
      };
    }

    await updateWasteTrackingSubmission({
      id: draftSubmission.id,
      organisationId,
      wasteTrackingId: wasteTrackingId ?? null,
      status,
      responseSnapshot,
      validationWarnings: defraWarnings,
      validationErrors: [],
      submittedAt: new Date(),
      lastAttemptedAt: new Date(),
    });

    await database
      .update(wasteReceipts)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(
        and(
          eq(wasteReceipts.id, receipt.id),
          eq(wasteReceipts.organisationId, organisationId),
          eq(wasteReceipts.jobLoadId, load.id),
        ),
      );

    revalidateDwtPaths(load.id, load.jobId);

    return {
      success: true,
      message:
        status === "accepted_with_warnings"
          ? "Receive movement submitted successfully with warnings. Review the warnings in the audit history."
          : "Receive movement submitted successfully. Waste X saved the Defra response and Waste Tracking ID.",
      submissionId: draftSubmission.id,
      wasteTrackingId,
      status,
      warnings: defraWarnings,
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
      validationWarnings: warnings,
      validationErrors: [finalError],
      submittedAt: null,
      lastAttemptedAt: new Date(),
    });

    revalidateDwtPaths(load.id, load.jobId);

    return {
      success: false,
      message,
      submissionId: draftSubmission.id,
      status: "failed",
      errors: [finalError],
      flattenedErrors: flattenValidationResults([finalError]),
      warnings,
    };
  }
}
