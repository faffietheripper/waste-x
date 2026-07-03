// src/modules/digital-waste-tracking/data-access/getWasteTrackingSubmissionByAssignment.ts

import { database } from "@/db/database";
import { wasteTrackingSubmissions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

import type {
  DefraValidationResult,
  ReceiveMovementPayload,
} from "../types/receiveMovement.types";

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export type WasteTrackingSubmissionView = typeof wasteTrackingSubmissions.$inferSelect & {
  parsedPayloadSnapshot: ReceiveMovementPayload | null;
  parsedResponseSnapshot: Record<string, unknown> | null;
  parsedValidationWarnings: DefraValidationResult[];
  parsedValidationErrors: DefraValidationResult[];
};

function mapSubmissionForView(
  submission: typeof wasteTrackingSubmissions.$inferSelect,
): WasteTrackingSubmissionView {
  return {
    ...submission,

    parsedPayloadSnapshot: parseJson<ReceiveMovementPayload>(
      submission.payloadSnapshot,
    ),

    parsedResponseSnapshot: parseJson<Record<string, unknown>>(
      submission.responseSnapshot,
    ),

    parsedValidationWarnings:
      parseJson<DefraValidationResult[]>(submission.validationWarnings) ?? [],

    parsedValidationErrors:
      parseJson<DefraValidationResult[]>(submission.validationErrors) ?? [],
  };
}

export async function getLatestWasteTrackingSubmissionByAssignment(params: {
  organisationId: string;
  assignmentId: string;
}) {
  const submission = await database.query.wasteTrackingSubmissions.findFirst({
    where: and(
      eq(wasteTrackingSubmissions.organisationId, params.organisationId),
      eq(wasteTrackingSubmissions.assignmentId, params.assignmentId),
    ),
    orderBy: [desc(wasteTrackingSubmissions.createdAt)],
  });

  return submission ? mapSubmissionForView(submission) : null;
}

export async function getWasteTrackingSubmissionsByAssignment(params: {
  organisationId: string;
  assignmentId: string;
}) {
  const submissions = await database.query.wasteTrackingSubmissions.findMany({
    where: and(
      eq(wasteTrackingSubmissions.organisationId, params.organisationId),
      eq(wasteTrackingSubmissions.assignmentId, params.assignmentId),
    ),
    orderBy: [desc(wasteTrackingSubmissions.createdAt)],
  });

  return submissions.map(mapSubmissionForView);
}

export async function getWasteTrackingSubmissionById(params: {
  organisationId: string;
  submissionId: string;
}) {
  const submission = await database.query.wasteTrackingSubmissions.findFirst({
    where: and(
      eq(wasteTrackingSubmissions.organisationId, params.organisationId),
      eq(wasteTrackingSubmissions.id, params.submissionId),
    ),
  });

  return submission ? mapSubmissionForView(submission) : null;
}

export async function getWasteTrackingSubmissionsForOrganisation(params: {
  organisationId: string;
  limit?: number;
}) {
  const submissions = await database.query.wasteTrackingSubmissions.findMany({
    where: eq(wasteTrackingSubmissions.organisationId, params.organisationId),
    orderBy: [desc(wasteTrackingSubmissions.createdAt)],
    limit: params.limit ?? 50,
  });

  return submissions.map(mapSubmissionForView);
}