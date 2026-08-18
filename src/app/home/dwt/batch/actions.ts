"use server";

import crypto from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { database } from "@/db/database";
import {
  auditEvents,
  jobLoads,
  wasteReceiptItems,
  wasteReceipts,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";
import { prepareJobLoadWasteReceipt } from "@/modules/digital-waste-tracking/data-access/prepareJobLoadWasteReceipt";

const MAX_BATCH_SIZE = 50;

type ReasonForNoConsignmentCode =
  | "NON_HAZ_WASTE_TRANSFER"
  | "NO_DOC_WITH_WASTE"
  | "HWRC_RECEIPT";

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: FormDataEntryValue[]) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function booleanFromForm(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function isReasonForNoConsignmentCode(
  value: string,
): value is ReasonForNoConsignmentCode {
  return [
    "NON_HAZ_WASTE_TRANSFER",
    "NO_DOC_WITH_WASTE",
    "HWRC_RECEIPT",
  ].includes(value);
}

function validEmail(value: string) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function batchRedirect(
  params: Record<string, string | number | undefined>,
): never {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }

  redirect(`/home/dwt/batch?${search.toString()}`);
}

/* =========================================================
   PREPARE MANY MISSING DRAFTS

   This deliberately calls the existing single-load draft preparer.
   That function already:
   - tenant-scopes the Job Load
   - requires completed incoming work
   - refuses to overwrite an existing receipt
   - snapshots the load into a Waste Receipt
========================================================= */

export async function prepareBatchDwtDraftsAction(formData: FormData) {
  const context = await requireSoloPermission("dwt:review");

  const jobLoadIds = uniqueStrings(formData.getAll("jobLoadId")).slice(
    0,
    MAX_BATCH_SIZE,
  );

  if (jobLoadIds.length === 0) {
    batchRedirect({ error: "select_loads_to_prepare" });
  }

  const validLoads = await database.query.jobLoads.findMany({
    where: and(
      eq(jobLoads.organisationId, context.organisationId),
      inArray(jobLoads.id, jobLoadIds),
      eq(jobLoads.direction, "incoming"),
      eq(jobLoads.status, "completed"),
    ),
    columns: {
      id: true,
    },
  });

  const validIds = new Set(validLoads.map((load) => load.id));

  let prepared = 0;
  let failed = 0;

  for (const jobLoadId of jobLoadIds) {
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
    newState: JSON.stringify({
      requestedJobLoadIds: jobLoadIds,
      prepared,
      failed,
    }),
    createdAt: new Date(),
  });

  revalidatePath("/home/dwt");
  revalidatePath("/home/dwt/batch");
  revalidatePath("/home/dwt/intake");

  batchRedirect({
    prepared,
    failed: failed || undefined,
  });
}

/* =========================================================
   APPLY SAFE COMMON FIELDS

   IMPORTANT:
   - no Defra API call
   - no WTID mutation
   - no EWC mutation
   - no weight mutation
   - no receivedAt mutation
   - no permit mutation
   - no vehicle/carrier-reg mutation
   - no Waste Receipt Item mutation

   We also refuse to batch-edit any receipt that has ANY DWT
   submission history. Once a movement has entered the government
   submission lifecycle, it returns to the existing single-record
   review/update workflow.
========================================================= */

export async function applyBatchDwtReviewAction(formData: FormData) {
  const context = await requireSoloPermission("dwt:review");

  const receiptIds = uniqueStrings(formData.getAll("receiptId")).slice(
    0,
    MAX_BATCH_SIZE,
  );

  if (receiptIds.length === 0) {
    batchRedirect({ error: "select_receipts_to_update" });
  }

  const applySpecialHandling = booleanFromForm(
    formData,
    "applySpecialHandling",
  );
  const applyNoConsignmentReason = booleanFromForm(
    formData,
    "applyNoConsignmentReason",
  );
  const applyBrokerDealer = booleanFromForm(
    formData,
    "applyBrokerDealer",
  );

  if (
    !applySpecialHandling &&
    !applyNoConsignmentReason &&
    !applyBrokerDealer
  ) {
    batchRedirect({ error: "choose_fields_to_apply" });
  }

  const selectedReceipts = await database.query.wasteReceipts.findMany({
    where: and(
      eq(wasteReceipts.organisationId, context.organisationId),
      inArray(wasteReceipts.id, receiptIds),
    ),
    columns: {
      id: true,
      jobLoadId: true,
      status: true,
      specialHandlingRequirements: true,
      reasonForNoConsignmentCode: true,
      brokerDealerOrganisationName: true,
      brokerDealerFullAddress: true,
      brokerDealerPostcode: true,
      brokerDealerEmailAddress: true,
      brokerDealerPhoneNumber: true,
      brokerDealerRegistrationNumber: true,
    },
  });

  if (selectedReceipts.length !== receiptIds.length) {
    batchRedirect({ error: "receipt_scope_mismatch" });
  }

  if (selectedReceipts.some((receipt) => receipt.status === "submitted")) {
    batchRedirect({ error: "submitted_receipt_locked" });
  }

  const existingSubmissions =
    await database.query.wasteTrackingSubmissions.findMany({
      where: and(
        eq(
          wasteTrackingSubmissions.organisationId,
          context.organisationId,
        ),
        inArray(wasteTrackingSubmissions.receiptId, receiptIds),
      ),
      columns: {
        id: true,
        receiptId: true,
        status: true,
        wasteTrackingId: true,
      },
    });

  if (existingSubmissions.length > 0) {
    batchRedirect({ error: "submission_history_locked" });
  }

  const specialHandlingRequirements = clean(
    formData.get("specialHandlingRequirements"),
  );

  if (
    applySpecialHandling &&
    specialHandlingRequirements.length > 5000
  ) {
    batchRedirect({ error: "special_handling_too_long" });
  }

 const rawReasonForNoConsignmentCode = clean(
  formData.get("reasonForNoConsignmentCode"),
);

let reasonForNoConsignmentCode:
  | ReasonForNoConsignmentCode
  | null = null;

if (applyNoConsignmentReason) {
  if (
    !isReasonForNoConsignmentCode(
      rawReasonForNoConsignmentCode,
    )
  ) {
    batchRedirect({
      error: "invalid_no_consignment_reason",
    });
  }

  reasonForNoConsignmentCode =
    rawReasonForNoConsignmentCode;
}

  /*
    A reason for no consignment code can be used by Defra in more than one
    scenario, including hazardous movements where no code accompanied the load.

    We do NOT guess that scenario here.

    For the MVP batch workflow we make the conservative choice:
    batch-applying a reason is only allowed where every selected receipt item
    is currently marked non-hazardous.

    Hazardous movements remain in the exact single-record review flow.
  */
  if (applyNoConsignmentReason) {
    const items = await database.query.wasteReceiptItems.findMany({
      where: and(
        eq(
          wasteReceiptItems.organisationId,
          context.organisationId,
        ),
        inArray(wasteReceiptItems.receiptId, receiptIds),
      ),
      columns: {
        receiptId: true,
        containsHazardous: true,
      },
    });

    if (items.some((item) => item.containsHazardous)) {
      batchRedirect({ error: "hazardous_receipts_need_single_review" });
    }
  }

  const brokerDealerOrganisationName = clean(
    formData.get("brokerDealerOrganisationName"),
  );
  const brokerDealerFullAddress = clean(
    formData.get("brokerDealerFullAddress"),
  );
  const brokerDealerPostcode = clean(
    formData.get("brokerDealerPostcode"),
  );
  const brokerDealerEmailAddress = clean(
    formData.get("brokerDealerEmailAddress"),
  );
  const brokerDealerPhoneNumber = clean(
    formData.get("brokerDealerPhoneNumber"),
  );
  const brokerDealerRegistrationNumber = clean(
    formData.get("brokerDealerRegistrationNumber"),
  );

  if (applyBrokerDealer && !brokerDealerOrganisationName) {
    batchRedirect({ error: "broker_name_required" });
  }

  if (
    applyBrokerDealer &&
    brokerDealerFullAddress &&
    !brokerDealerPostcode
  ) {
    batchRedirect({ error: "broker_postcode_required" });
  }

  if (
    applyBrokerDealer &&
    !validEmail(brokerDealerEmailAddress)
  ) {
    batchRedirect({ error: "broker_email_invalid" });
  }

  const now = new Date();

  const updateValues: Partial<typeof wasteReceipts.$inferInsert> = {
    updatedAt: now,
  };

  if (applySpecialHandling) {
    updateValues.specialHandlingRequirements =
      specialHandlingRequirements || null;
  }

  if (applyNoConsignmentReason) {
    updateValues.reasonForNoConsignmentCode =
      reasonForNoConsignmentCode;
  }

  if (applyBrokerDealer) {
    updateValues.brokerDealerOrganisationName =
      brokerDealerOrganisationName || null;
    updateValues.brokerDealerFullAddress =
      brokerDealerFullAddress || null;
    updateValues.brokerDealerPostcode =
      brokerDealerPostcode || null;
    updateValues.brokerDealerEmailAddress =
      brokerDealerEmailAddress || null;
    updateValues.brokerDealerPhoneNumber =
      brokerDealerPhoneNumber || null;
    updateValues.brokerDealerRegistrationNumber =
      brokerDealerRegistrationNumber || null;
  }

  const batchId = crypto.randomUUID();

  await database.transaction(async (tx) => {
    await tx
      .update(wasteReceipts)
      .set(updateValues)
      .where(
        and(
          eq(wasteReceipts.organisationId, context.organisationId),
          inArray(wasteReceipts.id, receiptIds),
        ),
      );

    await tx.insert(auditEvents).values({
      organisationId: context.organisationId,
      userId: context.userId,
      entityType: "dwt_batch",
      entityId: batchId,
      action: "DWT_BATCH_FIELDS_APPLIED",
      previousState: JSON.stringify(
        selectedReceipts.map((receipt) => ({
          receiptId: receipt.id,
          specialHandlingRequirements:
            receipt.specialHandlingRequirements,
          reasonForNoConsignmentCode:
            receipt.reasonForNoConsignmentCode,
          brokerDealer: {
            organisationName:
              receipt.brokerDealerOrganisationName,
            fullAddress:
              receipt.brokerDealerFullAddress,
            postcode:
              receipt.brokerDealerPostcode,
            emailAddress:
              receipt.brokerDealerEmailAddress,
            phoneNumber:
              receipt.brokerDealerPhoneNumber,
            registrationNumber:
              receipt.brokerDealerRegistrationNumber,
          },
        })),
      ),
      newState: JSON.stringify({
        receiptIds,
        appliedFields: {
          specialHandlingRequirements: applySpecialHandling,
          reasonForNoConsignmentCode: applyNoConsignmentReason,
          brokerDealer: applyBrokerDealer,
        },
      }),
      createdAt: now,
    });
  });

  revalidatePath("/home/dwt");
  revalidatePath("/home/dwt/batch");

  for (const receipt of selectedReceipts) {
    if (receipt.jobLoadId) {
      revalidatePath(`/home/dwt/intake/${receipt.jobLoadId}`);
    }
  }

  const nextJobLoadId =
    selectedReceipts.find((receipt) => receipt.jobLoadId)?.jobLoadId ??
    undefined;

  batchRedirect({
    updated: receiptIds.length,
    batchId,
    next: nextJobLoadId,
  });
}
