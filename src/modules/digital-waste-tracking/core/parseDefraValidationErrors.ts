// src/modules/digital-waste-tracking/core/parseDefraValidationErrors.ts

import type {
  DefraValidationResult,
  ReceiveMovementSubmissionMethod,
  ReceiveMovementSubmissionStatus,
} from "../types/receiveMovement.types";

/* =========================================================
   TYPES
========================================================= */

type UnknownObject = Record<string, unknown>;

type DefraResponseSnapshot = {
  ok: boolean;
  statusCode: number;
  method: ReceiveMovementSubmissionMethod;
  endpoint: string;
  responseBody: unknown;
};

/* =========================================================
   SMALL HELPERS
========================================================= */

function isObject(value: unknown): value is UnknownObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNestedValue(source: unknown, path: string[]): unknown {
  let current = source;

  for (const key of path) {
    if (!isObject(current)) return undefined;

    current = current[key];
  }

  return current;
}

function normaliseValidationResult(value: unknown): DefraValidationResult | null {
  if (!isObject(value)) return null;

  const key =
    typeof value.key === "string"
      ? value.key
      : typeof value.field === "string"
        ? value.field
        : typeof value.path === "string"
          ? value.path
          : "defraWasteTrackingService";

  const errorType =
    typeof value.errorType === "string"
      ? value.errorType
      : typeof value.type === "string"
        ? value.type
        : "BusinessRuleViolation";

  const message =
    typeof value.message === "string"
      ? value.message
      : typeof value.detail === "string"
        ? value.detail
        : typeof value.error === "string"
          ? value.error
          : "The Waste Tracking Service returned a validation issue.";

  return {
    key,
    errorType,
    message,
  };
}

function normaliseValidationResults(value: unknown): DefraValidationResult[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normaliseValidationResult(item))
    .filter((item): item is DefraValidationResult => item !== null);
}

function firstNonEmptyValidationArray(
  responseBody: unknown,
  paths: string[][],
): DefraValidationResult[] {
  for (const path of paths) {
    const value = getNestedValue(responseBody, path);
    const results = normaliseValidationResults(value);

    if (results.length > 0) return results;
  }

  return [];
}

/* =========================================================
   PUBLIC PARSERS
========================================================= */

export function parseDefraWarnings(
  responseBody: unknown,
): DefraValidationResult[] {
  return firstNonEmptyValidationArray(responseBody, [
    ["validation", "warnings"],
    ["warnings"],
    ["validationWarnings"],
  ]);
}

export function parseDefraErrors(
  responseBody: unknown,
): DefraValidationResult[] {
  const errors = firstNonEmptyValidationArray(responseBody, [
    ["validation", "errors"],
    ["errors"],
    ["validationErrors"],
  ]);

  if (errors.length > 0) return errors;

  /*
    Some failed API responses may not return an array of errors.
    This fallback turns a simple error/detail/message response into
    one user-friendly validation result.
  */
  if (isObject(responseBody)) {
    const message =
      typeof responseBody.message === "string"
        ? responseBody.message
        : typeof responseBody.detail === "string"
          ? responseBody.detail
          : typeof responseBody.error_description === "string"
            ? responseBody.error_description
            : typeof responseBody.error === "string"
              ? responseBody.error
              : undefined;

    if (message) {
      return [
        {
          key: "defraWasteTrackingService",
          errorType: "BusinessRuleViolation",
          message,
        },
      ];
    }
  }

  return [];
}

export function parseDefraWasteTrackingId(
  responseBody: unknown,
): string | undefined {
  if (!isObject(responseBody)) return undefined;

  if (typeof responseBody.wasteTrackingId === "string") {
    return responseBody.wasteTrackingId;
  }

  if (typeof responseBody.waste_tracking_id === "string") {
    return responseBody.waste_tracking_id;
  }

  if (typeof responseBody.id === "string") {
    return responseBody.id;
  }

  return undefined;
}

export function getSubmissionStatusFromDefraResponse(params: {
  ok: boolean;
  statusCode?: number;
  responseBody: unknown;
}): ReceiveMovementSubmissionStatus {
  if (!params.ok) {
    if (params.statusCode && params.statusCode >= 500) {
      return "failed";
    }

    return "rejected";
  }

  const warnings = parseDefraWarnings(params.responseBody);

  if (warnings.length > 0) {
    return "accepted_with_warnings";
  }

  return "accepted";
}

export function buildDefraResponseSnapshot(
  params: DefraResponseSnapshot,
): DefraResponseSnapshot {
  return {
    ok: params.ok,
    statusCode: params.statusCode,
    method: params.method,
    endpoint: params.endpoint,
    responseBody: params.responseBody ?? null,
  };
}

export function buildDefraFailureError(params: {
  key?: string;
  statusCode?: number;
  message?: string;
}): DefraValidationResult {
  return {
    key: params.key ?? "defraWasteTrackingService",
    errorType: "BusinessRuleViolation",
    message:
      params.message ??
      `The Waste Tracking Service request failed${
        params.statusCode ? ` with status ${params.statusCode}` : ""
      }.`,
  };
}