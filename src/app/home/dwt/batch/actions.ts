"use server";

import crypto from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { database } from "@/db/database";
import {
  auditEvents,
  ewcCodes,
  jobLoads,
  permitEwcCodes,
  wasteReceiptItems,
  wasteReceipts,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { submitJobLoadReceiveMovementAction } from "@/modules/digital-waste-tracking/actions/submitJobLoadReceiveMovementAction";
import { getJobLoadReceiveMovementDraft } from "@/modules/digital-waste-tracking/core/getJobLoadReceiveMovementDraft";
import { validateReceiveMovementInput } from "@/modules/digital-waste-tracking/core/validateReceiveMovementInput";
import { getWasteTrackingOrganisationSettings } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings";
import { getWasteTrackingReferenceData } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingReferenceData";
import { prepareJobLoadWasteReceipt } from "@/modules/digital-waste-tracking/data-access/prepareJobLoadWasteReceipt";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

import type {
  BatchSubmissionItem,
  BatchSubmissionResult,
  BatchValidationIssue,
  BatchValidationItem,
  BatchValidationResult,
} from "./types";

const MAX_BATCH_SIZE = 50;
const SUBMISSION_CONCURRENCY = 3;

const CONSIGNMENT_REASONS = [
  "NON_HAZ_WASTE_TRANSFER",
  "NO_DOC_WITH_WASTE",
  "HWRC_RECEIPT",
] as const;

const CARRIER_REASONS = ["ON_SITE", "HOUSEHOLD", "ONE_OFF", "MARINE"] as const;
const MEANS_OF_TRANSPORT = [
  "Road",
  "Rail",
  "Air",
  "Sea",
  "Inland Waterway",
  "Piped",
  "Other",
] as const;

function clean(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normaliseIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(
    0,
    MAX_BATCH_SIZE,
  );
}

function normaliseEwc(value: string) {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

function issue(
  key: string,
  message: string,
  errorType = "BusinessRuleViolation",
): BatchValidationIssue {
  return { key, message, errorType };
}

function parseIssues(value: string | null | undefined): BatchValidationIssue[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as Array<{
      key?: unknown;
      message?: unknown;
      errorType?: unknown;
    }>;

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        key: typeof item.key === "string" ? item.key : "submission",
        message:
          typeof item.message === "string"
            ? item.message
            : "The previous submission was not accepted.",
        errorType:
          typeof item.errorType === "string" ? item.errorType : undefined,
      }))
      .filter((item) => item.message);
  } catch {
    return [];
  }
}

function revalidateDwt() {
  revalidatePath("/home/dwt");
  revalidatePath("/home/dwt/batch");
  revalidatePath("/home/dwt/intake");
  revalidatePath("/home/dwt/submissions");
  revalidatePath("/home/movements/incoming");
  revalidatePath("/home/worksheet");
}

async function validateBatchInternal(params: {
  organisationId: string;
  jobLoadIds: string[];
}): Promise<BatchValidationResult> {
  const jobLoadIds = normaliseIds(params.jobLoadIds);

  if (jobLoadIds.length === 0) {
    return {
      success: false,
      items: [],
      globalErrors: ["Select at least one completed incoming load."],
    };
  }

  const [loads, receipts, submissions, settings] = await Promise.all([
    database.query.jobLoads.findMany({
      where: and(
        eq(jobLoads.organisationId, params.organisationId),
        inArray(jobLoads.id, jobLoadIds),
      ),
      columns: {
        id: true,
        direction: true,
        status: true,
        sitePermitId: true,
      },
    }),
    database.query.wasteReceipts.findMany({
      where: and(
        eq(wasteReceipts.organisationId, params.organisationId),
        inArray(wasteReceipts.jobLoadId, jobLoadIds),
      ),
    }),
    database.query.wasteTrackingSubmissions.findMany({
      where: and(
        eq(wasteTrackingSubmissions.organisationId, params.organisationId),
        inArray(wasteTrackingSubmissions.jobLoadId, jobLoadIds),
      ),
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
    }),
    getWasteTrackingOrganisationSettings({ organisationId: params.organisationId }),
  ]);

  const loadById = new Map(loads.map((load) => [load.id, load]));
  const receiptByLoad = new Map<string, (typeof receipts)[number]>();
  for (const receipt of receipts) {
    if (receipt.jobLoadId && !receiptByLoad.has(receipt.jobLoadId)) {
      receiptByLoad.set(receipt.jobLoadId, receipt);
    }
  }

  const latestSubmissionByLoad = new Map<
    string,
    (typeof submissions)[number]
  >();
  for (const submission of submissions) {
    if (submission.jobLoadId && !latestSubmissionByLoad.has(submission.jobLoadId)) {
      latestSubmissionByLoad.set(submission.jobLoadId, submission);
    }
  }

  const globalErrors: string[] = [];
  if (!settings?.isEnabled) {
    globalErrors.push("Digital Waste Tracking is disabled in organisation settings.");
  }
  if (!clean(settings?.apiCode)) {
    globalErrors.push("Receiver API Code is missing in Digital Waste Tracking settings.");
  }

  const referenceData = await getWasteTrackingReferenceData({
    environment: settings?.environment ?? "test",
    activeOnly: true,
  });

  const permitIds = Array.from(
    new Set(loads.map((load) => load.sitePermitId).filter((value): value is string => Boolean(value))),
  );

  const permittedRows =
    permitIds.length === 0
      ? []
      : await database
          .select({
            permitId: permitEwcCodes.permitId,
            code: ewcCodes.code,
          })
          .from(permitEwcCodes)
          .innerJoin(ewcCodes, eq(ewcCodes.id, permitEwcCodes.ewcCodeId))
          .where(
            and(
              eq(permitEwcCodes.organisationId, params.organisationId),
              inArray(permitEwcCodes.permitId, permitIds),
              eq(permitEwcCodes.isActive, true),
            ),
          );

  const permittedCodesByPermit = new Map<string, Set<string>>();
  for (const row of permittedRows) {
    const existing = permittedCodesByPermit.get(row.permitId) ?? new Set<string>();
    existing.add(normaliseEwc(row.code));
    permittedCodesByPermit.set(row.permitId, existing);
  }

  const items: BatchValidationItem[] = [];

  for (const jobLoadId of jobLoadIds) {
    const errors: BatchValidationIssue[] = [];
    const warnings: BatchValidationIssue[] = [];
    const load = loadById.get(jobLoadId);
    const receipt = receiptByLoad.get(jobLoadId);
    const latestSubmission = latestSubmissionByLoad.get(jobLoadId) ?? null;

    if (!load) {
      items.push({
        jobLoadId,
        ready: false,
        alreadySubmitted: false,
        errors: [issue("jobLoad.id", "Waste X could not find this load in your organisation.")],
        warnings,
      });
      continue;
    }

    if (load.direction !== "incoming" || load.status !== "completed") {
      items.push({
        jobLoadId,
        ready: false,
        alreadySubmitted: false,
        errors: [
          issue(
            "jobLoad.status",
            "Only completed incoming loads can enter DWT batch submission.",
          ),
        ],
        warnings,
      });
      continue;
    }

    if (!receipt) {
      items.push({
        jobLoadId,
        ready: false,
        alreadySubmitted: false,
        errors: [issue("receipt", "This load does not have a prepared DWT receipt draft yet.")],
        warnings,
      });
      continue;
    }

    const alreadySubmitted =
      receipt.status === "submitted" ||
      latestSubmission?.status === "accepted" ||
      latestSubmission?.status === "accepted_with_warnings";

    if (alreadySubmitted) {
      items.push({
        jobLoadId,
        ready: false,
        alreadySubmitted: true,
        errors: [],
        warnings: [],
      });
      continue;
    }

    if (latestSubmission?.status === "submitted") {
      items.push({
        jobLoadId,
        ready: false,
        alreadySubmitted: false,
        errors: [
          issue(
            "submission.pending",
            "A previous submission attempt is still recorded as in progress. Check submission history before retrying to avoid a duplicate movement.",
          ),
        ],
        warnings,
      });
      continue;
    }

    if (latestSubmission?.status === "rejected") {
      const attemptedAt = latestSubmission.lastAttemptedAt?.getTime() ?? 0;
      const receiptUpdatedAt = receipt.updatedAt?.getTime() ?? 0;

      if (receiptUpdatedAt <= attemptedAt) {
        const previousErrors = parseIssues(latestSubmission.validationErrors);
        items.push({
          jobLoadId,
          ready: false,
          alreadySubmitted: false,
          errors:
            previousErrors.length > 0
              ? previousErrors
              : [
                  issue(
                    "submission.rejected",
                    "The previous Defra submission was rejected. Quick-fix the receipt before retrying.",
                  ),
                ],
          warnings,
        });
        continue;
      }
    }

    const draft = await getJobLoadReceiveMovementDraft({
      organisationId: params.organisationId,
      jobLoadId,
    });

    if (!draft) {
      items.push({
        jobLoadId,
        ready: false,
        alreadySubmitted: false,
        errors: [issue("receipt", "Waste X could not build a DWT movement from this draft.")],
        warnings,
      });
      continue;
    }

    const validation = validateReceiveMovementInput(draft.receiveMovementInput, {
      referenceData,
    });

    warnings.push(
      ...validation.warnings.map((entry) => ({
        key: entry.key,
        message: entry.message,
        errorType: entry.errorType,
      })),
    );

    if (!validation.valid) {
      errors.push(
        ...validation.errors.map((entry) => ({
          key: entry.key,
          message: entry.message,
          errorType: entry.errorType,
        })),
      );
    }

    /*
     * DEFRA rejects malformed Environment Agency carrier registrations.
     * The core validator deliberately stays permissive across all UK nation
     * formats, but a CBDU value is unambiguous: CBDU + exactly six digits.
     * Catch that predictable failure during batch preflight so the row cannot
     * display as Ready and then immediately fail at submission time.
     */
    const carrierRegistration =
      draft.receiveMovementInput.carrier.registrationNumber
        ?.replace(/[\s-]+/g, "")
        .toUpperCase() ?? "";

    if (
      carrierRegistration.startsWith("CBDU") &&
      !/^CBDU\d{6}$/.test(carrierRegistration)
    ) {
      errors.push(
        issue(
          "carrier.registrationNumber",
          "England carrier registration numbers must use CBDU followed by exactly six digits.",
          "InvalidFormat",
        ),
      );
    }

    if (!load.sitePermitId) {
      errors.push(
        issue(
          "receiver.authorisationNumber",
          "The completed load is not linked to a receiving-site permit.",
        ),
      );
    } else {
      const permittedCodes = permittedCodesByPermit.get(load.sitePermitId) ?? new Set<string>();
      const submittedCodes = Array.from(
        new Set(
          draft.receiveMovementInput.wasteItems
            .flatMap((item) => item.ewcCodes ?? [])
            .map(normaliseEwc)
            .filter(Boolean),
        ),
      );

      for (const code of submittedCodes) {
        if (!permittedCodes.has(code)) {
          errors.push(
            issue(
              "wasteItems.ewcCodes",
              `EWC ${code} is not active on the receiving permit linked to this load.`,
            ),
          );
        }
      }
    }

    items.push({
      jobLoadId,
      ready: errors.length === 0,
      alreadySubmitted: false,
      errors,
      warnings,
    });
  }

  return {
    success: true,
    items,
    globalErrors,
  };
}

export async function validateBatchDwtAction(
  jobLoadIds: string[],
): Promise<BatchValidationResult> {
  const context = await requireSoloPermission("dwt:review");

  return validateBatchInternal({
    organisationId: context.organisationId,
    jobLoadIds,
  });
}

export async function prepareMissingDwtDraftsAction(jobLoadIds: string[]) {
  const context = await requireSoloPermission("dwt:review");
  const selectedIds = normaliseIds(jobLoadIds);

  if (selectedIds.length === 0) {
    return {
      success: false,
      prepared: 0,
      failed: 0,
      message: "Select at least one completed incoming load.",
    };
  }

  const validLoads = await database.query.jobLoads.findMany({
    where: and(
      eq(jobLoads.organisationId, context.organisationId),
      inArray(jobLoads.id, selectedIds),
      eq(jobLoads.direction, "incoming"),
      eq(jobLoads.status, "completed"),
    ),
    columns: { id: true },
  });

  const validIds = new Set(validLoads.map((load) => load.id));
  let prepared = 0;
  let failed = 0;

  for (const jobLoadId of selectedIds) {
    if (!validIds.has(jobLoadId)) {
      failed += 1;
      continue;
    }

    try {
      const result = await prepareJobLoadWasteReceipt({
        organisationId: context.organisationId,
        jobLoadId,
        receivedByUserId: context.userId,
      });

      if (result.success) prepared += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  await database.insert(auditEvents).values({
    organisationId: context.organisationId,
    userId: context.userId,
    entityType: "dwt_batch",
    entityId: crypto.randomUUID(),
    action: "DWT_BATCH_DRAFTS_PREPARED",
    previousState: null,
    newState: JSON.stringify({ requested: selectedIds.length, prepared, failed }),
    createdAt: new Date(),
  });

  revalidateDwt();

  return {
    success: failed === 0,
    prepared,
    failed,
    message:
      failed > 0
        ? `${prepared} draft(s) prepared. ${failed} need attention.`
        : `${prepared} draft(s) prepared and ready for validation.`,
  };
}

export async function submitBatchDwtAction(
  jobLoadIds: string[],
): Promise<BatchSubmissionResult> {
  const context = await requireSoloPermission("dwt:submit");
  const selectedIds = normaliseIds(jobLoadIds);

  if (selectedIds.length === 0) {
    return {
      success: false,
      requested: 0,
      submitted: 0,
      failed: 0,
      items: [],
    };
  }

  const validation = await validateBatchInternal({
    organisationId: context.organisationId,
    jobLoadIds: selectedIds,
  });

  if (validation.globalErrors.length > 0) {
    const message = validation.globalErrors.join(" ");
    return {
      success: false,
      requested: selectedIds.length,
      submitted: 0,
      failed: selectedIds.length,
      items: selectedIds.map((jobLoadId) => ({
        jobLoadId,
        success: false,
        status: null,
        message,
        wasteTrackingId: null,
        warnings: [],
        errors: validation.globalErrors.map((entry) => issue("dwt.settings", entry)),
      })),
    };
  }

  const validationById = new Map(validation.items.map((item) => [item.jobLoadId, item]));
  const readyIds = selectedIds.filter((id) => validationById.get(id)?.ready);
  const results: BatchSubmissionItem[] = [];

  for (const jobLoadId of selectedIds) {
    const preflight = validationById.get(jobLoadId);
    if (preflight?.ready) continue;

    results.push({
      jobLoadId,
      success: false,
      status: preflight?.alreadySubmitted ? "already_submitted" : null,
      message: preflight?.alreadySubmitted
        ? "This movement is already submitted."
        : preflight?.errors[0]?.message ?? "This movement did not pass batch validation.",
      wasteTrackingId: null,
      warnings: preflight?.warnings ?? [],
      errors: preflight?.errors ?? [issue("validation", "Batch validation failed.")],
    });
  }

  const queue = [...readyIds];

  async function worker() {
    while (queue.length > 0) {
      const jobLoadId = queue.shift();
      if (!jobLoadId) return;

      try {
        const draft = await getJobLoadReceiveMovementDraft({
          organisationId: context.organisationId,
          jobLoadId,
        });

        if (!draft) {
          results.push({
            jobLoadId,
            success: false,
            status: null,
            message: "The DWT receipt draft disappeared before submission.",
            wasteTrackingId: null,
            warnings: [],
            errors: [issue("receipt", "DWT receipt draft not found.")],
          });
          continue;
        }

        const result = await submitJobLoadReceiveMovementAction({
          jobLoadId,
          receiptId: draft.receiptId,
          receiveMovementInput: draft.receiveMovementInput,
        });

        if (result.success) {
          results.push({
            jobLoadId,
            success: true,
            status: result.status,
            message: result.message,
            wasteTrackingId: result.wasteTrackingId ?? null,
            warnings: result.warnings.map((entry) => ({
              key: entry.key,
              message: entry.message,
              errorType: entry.errorType,
            })),
            errors: [],
          });
        } else {
          results.push({
            jobLoadId,
            success: false,
            status: result.status ?? null,
            message: result.message,
            wasteTrackingId: null,
            warnings:
              result.warnings?.map((entry) => ({
                key: entry.key,
                message: entry.message,
                errorType: entry.errorType,
              })) ?? [],
            errors:
              result.errors?.map((entry) => ({
                key: entry.key,
                message: entry.message,
                errorType: entry.errorType,
              })) ?? [issue("submission", result.message)],
          });
        }
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Unexpected error during batch submission.";

        results.push({
          jobLoadId,
          success: false,
          status: "failed",
          message,
          wasteTrackingId: null,
          warnings: [],
          errors: [issue("submission", message)],
        });
      }
    }
  }

  const workerCount = Math.min(SUBMISSION_CONCURRENCY, readyIds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const submitted = results.filter((item) => item.success).length;
  const failed = results.filter((item) => !item.success && item.status !== "already_submitted").length;

  await database.insert(auditEvents).values({
    organisationId: context.organisationId,
    userId: context.userId,
    entityType: "dwt_batch",
    entityId: crypto.randomUUID(),
    action: "DWT_BATCH_SUBMITTED",
    previousState: null,
    newState: JSON.stringify({
      requestedJobLoadIds: selectedIds,
      submitted,
      failed,
      results: results.map((item) => ({
        jobLoadId: item.jobLoadId,
        success: item.success,
        status: item.status,
        wasteTrackingId: item.wasteTrackingId,
      })),
    }),
    createdAt: new Date(),
  });

  revalidateDwt();

  return {
    success: failed === 0,
    requested: selectedIds.length,
    submitted,
    failed,
    items: results,
  };
}

export async function saveDwtQuickFixAction(formData: FormData) {
  const context = await requireSoloPermission("dwt:review");
  const jobLoadId = clean(formData.get("jobLoadId"));
  const receiptId = clean(formData.get("receiptId"));

  if (!jobLoadId || !receiptId) {
    redirect("/home/dwt/batch?error=quick_fix_missing_identity");
  }

  const receipt = await database.query.wasteReceipts.findFirst({
    where: and(
      eq(wasteReceipts.id, receiptId),
      eq(wasteReceipts.organisationId, context.organisationId),
      eq(wasteReceipts.jobLoadId, jobLoadId),
    ),
  });

  if (!receipt || receipt.status === "submitted") {
    redirect("/home/dwt/batch?error=quick_fix_locked");
  }

  const latestSubmission = await database.query.wasteTrackingSubmissions.findFirst({
    where: and(
      eq(wasteTrackingSubmissions.organisationId, context.organisationId),
      eq(wasteTrackingSubmissions.jobLoadId, jobLoadId),
    ),
    orderBy: [desc(wasteTrackingSubmissions.createdAt)],
  });

  if (
    latestSubmission?.status === "accepted" ||
    latestSubmission?.status === "accepted_with_warnings"
  ) {
    redirect("/home/dwt/batch?error=quick_fix_already_submitted");
  }

  const item = await database.query.wasteReceiptItems.findFirst({
    where: and(
      eq(wasteReceiptItems.organisationId, context.organisationId),
      eq(wasteReceiptItems.receiptId, receipt.id),
    ),
  });

  const hazardousWasteConsignmentCode = clean(
    formData.get("hazardousWasteConsignmentCode"),
  );
  const rawConsignmentReason = clean(formData.get("reasonForNoConsignmentCode"));
  const reasonForNoConsignmentCode = CONSIGNMENT_REASONS.includes(
    rawConsignmentReason as (typeof CONSIGNMENT_REASONS)[number],
  )
    ? (rawConsignmentReason as (typeof CONSIGNMENT_REASONS)[number])
    : null;

  const carrierRegistrationNumber = clean(formData.get("carrierRegistrationNumber"));
  const rawCarrierReason = clean(formData.get("carrierReasonForNoRegistrationNumber"));
  const carrierReasonForNoRegistrationNumber = CARRIER_REASONS.includes(
    rawCarrierReason as (typeof CARRIER_REASONS)[number],
  )
    ? (rawCarrierReason as (typeof CARRIER_REASONS)[number])
    : null;

  const rawMeans = clean(formData.get("carrierMeansOfTransport"));
  const carrierMeansOfTransport = MEANS_OF_TRANSPORT.includes(
    rawMeans as (typeof MEANS_OF_TRANSPORT)[number],
  )
    ? (rawMeans as (typeof MEANS_OF_TRANSPORT)[number])
    : "Road";

  const now = new Date();

  await database.transaction(async (tx) => {
    await tx
      .update(wasteReceipts)
      .set({
        hazardousWasteConsignmentCode: hazardousWasteConsignmentCode || null,
        reasonForNoConsignmentCode: hazardousWasteConsignmentCode
          ? null
          : reasonForNoConsignmentCode,
        specialHandlingRequirements: clean(formData.get("specialHandlingRequirements")) || null,
        carrierRegistrationNumber: carrierRegistrationNumber || null,
        carrierReasonForNoRegistrationNumber: carrierRegistrationNumber
          ? null
          : carrierReasonForNoRegistrationNumber,
        carrierOrganisationName: clean(formData.get("carrierOrganisationName")) || null,
        carrierFullAddress: clean(formData.get("carrierFullAddress")) || null,
        carrierPostcode: clean(formData.get("carrierPostcode")) || null,
        carrierEmailAddress: clean(formData.get("carrierEmailAddress")) || null,
        carrierPhoneNumber: clean(formData.get("carrierPhoneNumber")) || null,
        carrierVehicleRegistration: clean(formData.get("carrierVehicleRegistration")) || null,
        carrierMeansOfTransport,
        receiverSiteName: clean(formData.get("receiverSiteName")) || null,
        receiverEmailAddress: clean(formData.get("receiverEmailAddress")) || null,
        receiverPhoneNumber: clean(formData.get("receiverPhoneNumber")) || null,
        receiverAuthorisationNumber: clean(formData.get("receiverAuthorisationNumber")) || null,
        receiptFullAddress: clean(formData.get("receiptFullAddress")) || null,
        receiptPostcode: clean(formData.get("receiptPostcode")) || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(wasteReceipts.id, receipt.id),
          eq(wasteReceipts.organisationId, context.organisationId),
        ),
      );

    if (item) {
      const numberOfContainersRaw = Number(clean(formData.get("numberOfContainers")) || "0");
      const numberOfContainers = Number.isInteger(numberOfContainersRaw)
        ? Math.max(0, numberOfContainersRaw)
        : item.numberOfContainers;
      const disposalRecoveryCode = clean(formData.get("disposalRecoveryCode"));

      await tx
        .update(wasteReceiptItems)
        .set({
          numberOfContainers,
          typeOfContainers: clean(formData.get("typeOfContainers")),
          disposalOrRecoveryCodes: disposalRecoveryCode
            ? JSON.stringify([
                {
                  code: disposalRecoveryCode,
                  weight: {
                    metric: item.weightMetric,
                    amount: Number(item.weightAmount),
                    isEstimate: item.weightIsEstimate,
                  },
                },
              ])
            : JSON.stringify([]),
          updatedAt: now,
        })
        .where(
          and(
            eq(wasteReceiptItems.id, item.id),
            eq(wasteReceiptItems.organisationId, context.organisationId),
          ),
        );
    }

    await tx.insert(auditEvents).values({
      organisationId: context.organisationId,
      userId: context.userId,
      entityType: "waste_receipt",
      entityId: receipt.id,
      action: "DWT_BATCH_QUICK_FIX_SAVED",
      previousState: JSON.stringify({
        jobLoadId,
        receiptUpdatedAt: receipt.updatedAt,
      }),
      newState: JSON.stringify({
        jobLoadId,
        savedAt: now.toISOString(),
      }),
      createdAt: now,
    });
  });

  revalidateDwt();
  revalidatePath(`/home/dwt/batch/fix/${jobLoadId}`);
  revalidatePath(`/home/dwt/intake/${jobLoadId}`);

  redirect(`/home/dwt/batch?fixed=${encodeURIComponent(jobLoadId)}`);
}
