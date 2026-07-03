// src/modules/digital-waste-tracking/data-access/updateWasteTrackingSubmission.ts

import { database } from "@/db/database";
import { wasteTrackingSubmissions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

import type {
  DefraValidationResult,
  ReceiveMovementPayload,
  ReceiveMovementSubmissionStatus,
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

export type UpdateWasteTrackingSubmissionInput = {
  id: string;

  organisationId: string;

  wasteTrackingId?: string | null;

  status?: ReceiveMovementSubmissionStatus;

  payloadSnapshot?: ReceiveMovementPayload | JsonLike | string;

  responseSnapshot?: JsonLike | string | null;

  validationWarnings?: DefraValidationResult[] | null;

  validationErrors?: DefraValidationResult[] | null;

  submittedAt?: Date | null;

  lastAttemptedAt?: Date | null;
};

export async function updateWasteTrackingSubmission(
  input: UpdateWasteTrackingSubmissionInput,
) {
  const updateValues: Partial<typeof wasteTrackingSubmissions.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.wasteTrackingId !== undefined) {
    updateValues.wasteTrackingId = input.wasteTrackingId;
  }

  if (input.status !== undefined) {
    updateValues.status = input.status;
  }

  if (input.payloadSnapshot !== undefined) {
    updateValues.payloadSnapshot =
      typeof input.payloadSnapshot === "string"
        ? input.payloadSnapshot
        : serialiseJson(input.payloadSnapshot) ?? "";
  }

  if (input.responseSnapshot !== undefined) {
    updateValues.responseSnapshot =
      typeof input.responseSnapshot === "string"
        ? input.responseSnapshot
        : serialiseJson(input.responseSnapshot);
  }

  if (input.validationWarnings !== undefined) {
    updateValues.validationWarnings = serialiseJson(input.validationWarnings);
  }

  if (input.validationErrors !== undefined) {
    updateValues.validationErrors = serialiseJson(input.validationErrors);
  }

  if (input.submittedAt !== undefined) {
    updateValues.submittedAt = input.submittedAt;
  }

  if (input.lastAttemptedAt !== undefined) {
    updateValues.lastAttemptedAt = input.lastAttemptedAt;
  }

  const [updatedSubmission] = await database
    .update(wasteTrackingSubmissions)
    .set(updateValues)
    .where(
      and(
        eq(wasteTrackingSubmissions.id, input.id),
        eq(wasteTrackingSubmissions.organisationId, input.organisationId),
      ),
    )
    .returning();

  return updatedSubmission ?? null;
}