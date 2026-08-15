import { and, desc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { wasteTrackingSubmissions } from "@/db/schema";

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

export type JobLoadWasteTrackingSubmissionView =
  typeof wasteTrackingSubmissions.$inferSelect & {
    parsedPayloadSnapshot: ReceiveMovementPayload | null;
    parsedResponseSnapshot: Record<string, unknown> | null;
    parsedValidationWarnings: DefraValidationResult[];
    parsedValidationErrors: DefraValidationResult[];
  };

function mapForView(
  submission: typeof wasteTrackingSubmissions.$inferSelect,
): JobLoadWasteTrackingSubmissionView {
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

export async function getLatestWasteTrackingSubmissionByJobLoad(params: {
  organisationId: string;
  jobLoadId: string;
}) {
  const row = await database.query.wasteTrackingSubmissions.findFirst({
    where: and(
      eq(wasteTrackingSubmissions.organisationId, params.organisationId),
      eq(wasteTrackingSubmissions.jobLoadId, params.jobLoadId),
    ),
    orderBy: [desc(wasteTrackingSubmissions.createdAt)],
  });

  return row ? mapForView(row) : null;
}

export async function getWasteTrackingSubmissionsByJobLoad(params: {
  organisationId: string;
  jobLoadId: string;
}) {
  const rows = await database.query.wasteTrackingSubmissions.findMany({
    where: and(
      eq(wasteTrackingSubmissions.organisationId, params.organisationId),
      eq(wasteTrackingSubmissions.jobLoadId, params.jobLoadId),
    ),
    orderBy: [desc(wasteTrackingSubmissions.createdAt)],
  });

  return rows.map(mapForView);
}
