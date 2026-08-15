import { database } from "@/db/database";
import { wasteTrackingSubmissions } from "@/db/schema";

import type {
  DefraValidationResult,
  ReceiveMovementPayload,
  ReceiveMovementSubmissionMethod,
  ReceiveMovementSubmissionStatus,
  ReceiveMovementSubmissionType,
} from "../types/receiveMovement.types";

type JsonLike = Record<string, unknown> | unknown[] | null;

function serialiseJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export type CreateJobLoadWasteTrackingSubmissionInput = {
  organisationId: string;
  jobLoadId: string;
  siteId?: string | null;
  receiptId?: string | null;
  submittedByUserId?: string | null;
  wasteTrackingId?: string | null;
  submissionType?: ReceiveMovementSubmissionType;
  status?: ReceiveMovementSubmissionStatus;
  method: ReceiveMovementSubmissionMethod;
  endpoint: string;
  payloadSnapshot: ReceiveMovementPayload | JsonLike | string;
  responseSnapshot?: JsonLike | string;
  validationWarnings?: DefraValidationResult[] | null;
  validationErrors?: DefraValidationResult[] | null;
  attemptNumber?: number;
  submittedAt?: Date | null;
  lastAttemptedAt?: Date | null;
};

/*
  Job Load-specific audit writer.

  This intentionally exists beside the legacy createWasteTrackingSubmission
  helper rather than replacing it. The approved assignment/PAT workflow keeps
  using its original data-access function unchanged.
*/
export async function createJobLoadWasteTrackingSubmission(
  input: CreateJobLoadWasteTrackingSubmissionInput,
) {
  const now = new Date();

  const payloadSnapshot =
    typeof input.payloadSnapshot === "string"
      ? input.payloadSnapshot
      : serialiseJson(input.payloadSnapshot);

  if (!payloadSnapshot) {
    throw new Error("Waste tracking submission payload snapshot is required.");
  }

  const [createdSubmission] = await database
    .insert(wasteTrackingSubmissions)
    .values({
      organisationId: input.organisationId,
      jobLoadId: input.jobLoadId,
      assignmentId: null,
      listingId: null,
      siteId: input.siteId ?? null,
      receiptId: input.receiptId ?? null,
      submittedByUserId: input.submittedByUserId ?? null,
      wasteTrackingId: input.wasteTrackingId ?? null,
      submissionType: input.submissionType ?? "receive",
      status: input.status ?? "draft",
      method: input.method,
      endpoint: input.endpoint,
      payloadSnapshot,
      responseSnapshot:
        typeof input.responseSnapshot === "string"
          ? input.responseSnapshot
          : serialiseJson(input.responseSnapshot),
      validationWarnings: serialiseJson(input.validationWarnings ?? null),
      validationErrors: serialiseJson(input.validationErrors ?? null),
      attemptNumber: input.attemptNumber ?? 1,
      submittedAt: input.submittedAt ?? null,
      lastAttemptedAt: input.lastAttemptedAt ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return createdSubmission;
}
