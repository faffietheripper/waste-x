// src/app/admin/digital-waste-tracking/pat/page.tsx

import Link from "next/link";
import { desc } from "drizzle-orm";

import { database } from "@/db/database";
import { wasteTrackingSubmissions } from "@/db/schema";

import { getPatResultsAction } from "./actions";
import PatTrackerClient, {
  type DwtEvidenceSuggestion,
  type EvidencePartySummary,
  type EvidenceSummary,
  type EvidenceValidation,
  type EvidenceWasteItemSummary,
  type PatResult,
} from "./PatTrackerClient";

/*
  PAT BUSINESS LOGIC
  ==================
  The evidence-scanning and scenario-matching logic below is preserved from
  the existing admin PAT implementation. This pass changes the admin header
  and presentation only.
*/

export default async function DigitalWasteTrackingPatPage() {
  const [patResults, submissions] = await Promise.all([
    getPatResultsAction(),
    database
      .select()
      .from(wasteTrackingSubmissions)
      .orderBy(desc(wasteTrackingSubmissions.lastAttemptedAt))
      .limit(250),
  ]);

  const baseResults: PatResult[] = patResults.map((result) => ({
    id: result.id,
    scenarioId: result.scenarioId,
    scenarioOrder: result.scenarioOrder,
    scenarioDescription: result.scenarioDescription,
    feature: result.feature,
    expectedResult: result.expectedResult,

    wasteTrackingId: result.wasteTrackingId,
    ewcCodes: result.ewcCodes,
    reason: result.reason,

    assignmentId: result.assignmentId,
    listingId: result.listingId,
    receiptId: result.receiptId,
    dwtSubmissionId: result.dwtSubmissionId,

    httpStatus: result.httpStatus,
    errorMessage: result.errorMessage,
    testedAt: toIso(result.testedAt),

    evidenceSummary: null,
    evidenceValidation: null,

    defraStatus: result.defraStatus,
    defraSentAt: toIso(result.defraSentAt),
    defraConfirmedAt: toIso(result.defraConfirmedAt),

    unableToRunReason: result.unableToRunReason,
    additionalDetails: result.additionalDetails,
    notes: result.notes,

    createdAt: toIso(result.createdAt),
    updatedAt: toIso(result.updatedAt),
  }));

  const safeResults = baseResults.map((result) => ({
    ...result,
    evidenceSummary: buildAttachedEvidenceSummary(result, submissions),
    evidenceValidation: buildAttachedEvidenceValidation(result, submissions),
  }));

  const suggestions = buildEvidenceSuggestions(safeResults, submissions);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-black text-white shadow-2xl shadow-black/20">
        <div className="border-t-4 border-red-600 p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-red-500">
                Digital Waste Tracking
              </p>

              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                DEFRA PAT Evidence Scanner
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Existing PAT evidence scanning, scenario matching and DEFRA
                evidence controls — now presented inside the Waste X Admin
                black, red and white control environment.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/digital-waste-tracking"
                className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition hover:border-red-500 hover:text-red-400"
              >
                ← DWT Control
              </Link>

              <Link
                href="/admin/audit/compliance"
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
              >
                Compliance audit
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PatTrackerClient
        initialResults={safeResults}
        initialSuggestions={suggestions}
        scannedSubmissionCount={submissions.length}
      />
    </div>
  );
}

/* =========================================================
   EVIDENCE SCANNER
========================================================= */

function buildEvidenceSuggestions(
  patResults: PatResult[],
  submissions: unknown[],
): DwtEvidenceSuggestion[] {
  const suggestions: DwtEvidenceSuggestion[] = [];

  const protectedAttachedSubmissionIds = new Set(
    patResults
      .filter((result) => {
        if (!result.dwtSubmissionId) return false;

        /*
          Only valid attached evidence should reserve a DWT submission.
          If a row has a mismatch warning, the same submission can still be
          suggested to the correct scenario instead of being trapped forever.
        */
        return result.evidenceValidation?.valid !== false;
      })
      .map((result) => result.dwtSubmissionId)
      .filter((value): value is string => Boolean(value)),
  );

  for (const result of patResults) {
    const hasValidAttachedEvidence = Boolean(
      result.dwtSubmissionId && result.evidenceValidation?.valid !== false,
    );

    if (hasValidAttachedEvidence) continue;

    const scenarioSuggestions = submissions
      .map((submission) => matchSubmissionToScenario(result, submission))
      .filter((suggestion): suggestion is DwtEvidenceSuggestion => {
        if (!suggestion) return false;

        /*
          Important PAT safety rule:
          one valid DWT submission should not be offered as evidence for
          multiple PAT scenarios.
        */
        return !protectedAttachedSubmissionIds.has(suggestion.dwtSubmissionId);
      });

    const sorted = scenarioSuggestions.sort((first, second) => {
      const confidenceDiff =
        getConfidenceRank(second.confidence) -
        getConfidenceRank(first.confidence);

      if (confidenceDiff !== 0) return confidenceDiff;

      const firstTime = first.testedAt
        ? new Date(first.testedAt).getTime()
        : 0;
      const secondTime = second.testedAt
        ? new Date(second.testedAt).getTime()
        : 0;

      return secondTime - firstTime;
    });

    suggestions.push(...sorted.slice(0, 3));
  }

  return suggestions;
}

function matchSubmissionToScenario(
  result: PatResult,
  submission: unknown,
): DwtEvidenceSuggestion | null {
  const payload = parseJsonValue(getField(submission, "payloadSnapshot"));
  const response = parseJsonValue(getField(submission, "responseSnapshot"));

  if (!isRecord(payload)) return null;

  const declaredScenarioId = getPatScenarioIdFromPayload(payload);

  /*
    Strict PAT evidence matching:
    The old scanner matched by broad payload features, so one successful
    payload could appear suitable for several scenarios. DEFRA PAT evidence
    needs to prove the specific scenario that was run, so automatic suggestions
    require the payload reference to say WX-PAT-<scenarioId>.
  */
  if (declaredScenarioId !== result.scenarioId) return null;

  const evidenceSummary = buildEvidenceSummaryFromPayload(payload);
  const status = getString(getField(submission, "status"));
  const httpStatus = getResponseStatusCode(response);

  const evaluation = evaluateScenarioRequirement({
    result,
    payload,
    evidenceSummary,
    status,
    httpStatus,
  });

  if (!evaluation.matched) return null;

  const responseError = getErrorMessageFromResponse(response);
  const submissionId = getString(getField(submission, "id"));
  const wasteTrackingId = getString(
    getField(submission, "wasteTrackingId"),
  );

  const confidence =
    result.expectedResult === "error"
      ? evaluation.isRejected
        ? "high"
        : "medium"
      : evaluation.isAccepted && wasteTrackingId
        ? "high"
        : "medium";

  const matchReasons = [
    `Payload reference ${declaredScenarioId}`,
    ...evaluation.matchReasons,
  ];

  return {
    scenarioId: result.scenarioId,
    patResultId: result.id,

    dwtSubmissionId: submissionId,
    wasteTrackingId:
      result.expectedResult === "error" ? null : wasteTrackingId,

    assignmentId:
      getString(getField(submission, "assignmentId")) || null,
    listingId: getNumberOrNull(getField(submission, "listingId")),
    receiptId: getString(getField(submission, "receiptId")) || null,

    status,
    httpStatus: typeof httpStatus === "number" ? httpStatus : null,
    endpoint: getString(getField(submission, "endpoint")),
    method: getString(getField(submission, "method")),
    testedAt:
      toIso(getField(submission, "submittedAt")) ??
      toIso(getField(submission, "lastAttemptedAt")) ??
      toIso(getField(submission, "createdAt")),

    ewcCodes: evidenceSummary.ewcCodes.join(", "),
    reason: buildSuggestionReason(result.scenarioId, matchReasons),
    errorMessage:
      result.expectedResult === "error" ? responseError : null,
    evidenceSummary,
    payloadScenarioId: declaredScenarioId,

    confidence,
    matchReasons,
  };
}

type ScenarioRequirementEvaluation = {
  matched: boolean;
  matchReasons: string[];
  isAccepted: boolean;
  isRejected: boolean;
};

function evaluateScenarioRequirement({
  result,
  payload,
  evidenceSummary,
  status,
  httpStatus,
}: {
  result: PatResult;
  payload: Record<string, unknown>;
  evidenceSummary: EvidenceSummary;
  status: string;
  httpStatus: number | null;
}): ScenarioRequirementEvaluation {
  const isAccepted =
    status === "accepted" ||
    status === "accepted_with_warnings" ||
    Number(httpStatus) === 201;

  const isRejected =
    status === "rejected" ||
    status === "failed" ||
    Number(httpStatus) >= 400;

  const carrier = isRecord(payload.carrier) ? payload.carrier : {};
  const carrierRegistration = getString(carrier.registrationNumber);
  const carrierNoRegistrationReason = getString(
    carrier.reasonForNoRegistrationNumber,
  );

  const hazardousConsignmentCode = getString(
    payload.hazardousWasteConsignmentCode,
  );

  const reasonForNoConsignmentCode = getString(
    payload.reasonForNoConsignmentCode,
  );

  const matchReasons: string[] = [];
  let matched = false;

  switch (result.scenarioId) {
    case "R01": {
      matched =
        isAccepted &&
        evidenceSummary.wasteItemCount === 1 &&
        evidenceSummary.disposalOrRecoveryCodes.length > 0 &&
        !evidenceSummary.containsPops &&
        !evidenceSummary.containsHazardous;

      if (matched) {
        matchReasons.push(
          "Accepted submission",
          "Single waste item",
          "Disposal/recovery code present",
          "No POPs or hazardous properties",
        );
      }

      break;
    }

    case "R02": {
      matched = isAccepted && evidenceSummary.wasteItemCount > 1;

      if (matched) {
        matchReasons.push("Accepted submission", "Multiple waste items");
      }

      break;
    }

    case "R03": {
      matched =
        isAccepted && evidenceSummary.meansOfTransport === "Road";

      if (matched) {
        matchReasons.push(
          "Accepted submission",
          "Means of transport is Road",
        );
      }

      break;
    }

    case "R04": {
      matched =
        isAccepted &&
        evidenceSummary.disposalOrRecoveryCodes.length === 0;

      if (matched) {
        matchReasons.push(
          "Accepted submission",
          "No disposal/recovery codes were included",
        );
      }

      break;
    }

    case "R05": {
      matched =
        isAccepted &&
        evidenceSummary.disposalOrRecoveryCodes.length > 1;

      if (matched) {
        matchReasons.push(
          "Accepted submission",
          "Multiple disposal/recovery codes",
        );
      }

      break;
    }

    case "R07": {
      matched = isAccepted && evidenceSummary.ewcCodes.length >= 2;

      if (matched) {
        matchReasons.push("Accepted submission", "Multiple EWC codes");
      }

      break;
    }

    case "C01": {
      matched =
        isRejected &&
        !carrierRegistration &&
        !carrierNoRegistrationReason;

      if (matched) {
        matchReasons.push(
          "Expected error submission",
          "No carrier registration number",
          "No reason for missing carrier registration",
        );
      }

      break;
    }

    case "C02": {
      matched =
        isAccepted &&
        !carrierRegistration &&
        Boolean(carrierNoRegistrationReason);

      if (matched) {
        matchReasons.push(
          "Accepted submission",
          "No carrier registration number",
          "Reason for missing carrier registration supplied",
        );
      }

      break;
    }

    case "B01": {
      matched = isAccepted && evidenceSummary.brokerDealerIncluded;

      if (matched) {
        matchReasons.push(
          "Accepted submission",
          "Broker/dealer details found",
        );
      }

      break;
    }

    case "P01": {
      matched =
        isAccepted &&
        evidenceSummary.containsPops &&
        evidenceSummary.popsComponentCount >= 2;

      if (matched) {
        matchReasons.push(
          "Accepted submission",
          "Multiple POPs components",
        );
      }

      break;
    }

    case "H01": {
      matched =
        isAccepted &&
        evidenceSummary.containsHazardous &&
        evidenceSummary.hazardousComponentCount >= 2;

      if (matched) {
        matchReasons.push(
          "Accepted submission",
          "Multiple hazardous components/properties",
        );
      }

      break;
    }

    case "H02": {
      matched =
        isRejected &&
        evidenceSummary.containsHazardous &&
        !hazardousConsignmentCode &&
        !reasonForNoConsignmentCode;

      if (matched) {
        matchReasons.push(
          "Expected error submission",
          "Hazardous waste present",
          "No consignment note code",
          "No reason for missing consignment note code",
        );
      }

      break;
    }

    case "H03": {
      matched =
        isAccepted &&
        evidenceSummary.containsHazardous &&
        !hazardousConsignmentCode &&
        Boolean(reasonForNoConsignmentCode);

      if (matched) {
        matchReasons.push(
          "Accepted submission",
          "Hazardous waste present",
          "No consignment note code",
          "Reason supplied",
        );
      }

      break;
    }

    case "X01": {
      matched =
        isAccepted &&
        evidenceSummary.containsHazardous &&
        evidenceSummary.containsPops;

      if (matched) {
        matchReasons.push(
          "Accepted submission",
          "Contains hazardous properties",
          "Contains POPs components",
        );
      }

      break;
    }

    default:
      matched = false;
  }

  return {
    matched,
    matchReasons,
    isAccepted,
    isRejected,
  };
}

function buildAttachedEvidenceValidation(
  result: PatResult,
  submissions: unknown[],
): EvidenceValidation | null {
  if (!result.dwtSubmissionId) return null;

  const matchingSubmission = submissions.find((submission) => {
    return (
      getString(getField(submission, "id")) === result.dwtSubmissionId
    );
  });

  if (!matchingSubmission) {
    return {
      valid: false,
      scenarioReference: null,
      message: "Attached evidence needs review.",
      warnings: [
        "The attached DWT submission could not be found in the scanned submissions.",
      ],
    };
  }

  const payload = parseJsonValue(
    getField(matchingSubmission, "payloadSnapshot"),
  );
  const response = parseJsonValue(
    getField(matchingSubmission, "responseSnapshot"),
  );

  if (!isRecord(payload)) {
    return {
      valid: false,
      scenarioReference: null,
      message: "Attached evidence needs review.",
      warnings: [
        "The attached DWT submission does not have a readable payload snapshot.",
      ],
    };
  }

  const scenarioReference = getPatScenarioIdFromPayload(payload);
  const evidenceSummary = buildEvidenceSummaryFromPayload(payload);
  const status = getString(getField(matchingSubmission, "status"));
  const httpStatus = getResponseStatusCode(response);

  const evaluation = evaluateScenarioRequirement({
    result,
    payload,
    evidenceSummary,
    status,
    httpStatus,
  });

  const warnings: string[] = [];

  if (!scenarioReference) {
    warnings.push(
      "The payload does not include a WX-PAT scenario reference, so it should be checked manually.",
    );
  } else if (scenarioReference !== result.scenarioId) {
    warnings.push(
      `The attached payload is labelled ${scenarioReference}, not ${result.scenarioId}. Do not send this row to DEFRA until corrected.`,
    );
  }

  if (!evaluation.matched) {
    warnings.push(
      `The attached payload contents do not satisfy the ${result.scenarioId} scenario rules.`,
    );
  }

  return {
    valid: warnings.length === 0,
    scenarioReference,
    message:
      warnings.length > 0
        ? "Attached evidence needs review."
        : "Attached evidence matches the scenario reference and payload rules.",
    warnings,
  };
}

/* =========================================================
   EVIDENCE SUMMARY
========================================================= */

function buildAttachedEvidenceSummary(
  result: PatResult,
  submissions: unknown[],
): EvidenceSummary | null {
  if (!result.dwtSubmissionId) return null;

  const matchingSubmission = submissions.find((submission) => {
    return (
      getString(getField(submission, "id")) === result.dwtSubmissionId
    );
  });

  if (!matchingSubmission) return null;

  const payload = parseJsonValue(
    getField(matchingSubmission, "payloadSnapshot"),
  );

  if (!isRecord(payload)) return null;

  return buildEvidenceSummaryFromPayload(payload);
}

function buildEvidenceSummaryFromPayload(
  payload: Record<string, unknown>,
): EvidenceSummary {
  const wasteItems = getWasteItems(payload);
  const carrier = isRecord(payload.carrier) ? payload.carrier : {};
  const brokerOrDealer = getBrokerOrDealer(payload);

  const wasteItemSummaries = wasteItems.map((item, index) =>
    buildWasteItemSummary(item, index),
  );

  const ewcCodes = unique(
    wasteItemSummaries.flatMap((item) => item.ewcCodes),
  );

  const disposalOrRecoveryCodes = wasteItemSummaries.flatMap(
    (item) => item.disposalOrRecoveryCodes,
  );

  const popsComponents = wasteItemSummaries.flatMap(
    (item) => item.popsComponents,
  );

  const hazardousPropertyCodes = unique(
    wasteItemSummaries.flatMap((item) => item.hazardousPropertyCodes),
  );

  const hazardousComponents = wasteItemSummaries.flatMap(
    (item) => item.hazardousComponents,
  );

  const containsPops = wasteItemSummaries.some(
    (item) => item.containsPops || item.popsComponents.length > 0,
  );

  const containsHazardous = wasteItemSummaries.some(
    (item) =>
      item.containsHazardous ||
      item.hazardousPropertyCodes.length > 0 ||
      item.hazardousComponents.length > 0,
  );

  return {
    wasteItemCount: wasteItemSummaries.length,
    ewcCodes,
    disposalOrRecoveryCodes,
    containsPops,
    popsComponentCount: popsComponents.length,
    popsComponents,
    containsHazardous,
    hazardousComponentCount:
      hazardousComponents.length > 0
        ? hazardousComponents.length
        : hazardousPropertyCodes.length,
    hazardousPropertyCodes,
    hazardousComponents,
    meansOfTransport: getString(carrier.meansOfTransport) || null,
    carrierRegistrationNumber:
      getString(carrier.registrationNumber) || null,
    brokerDealerIncluded: Boolean(brokerOrDealer),
    brokerOrDealer,
    wasteItems: wasteItemSummaries,
  };
}

function buildWasteItemSummary(
  item: Record<string, unknown>,
  index: number,
): EvidenceWasteItemSummary {
  const ewcCodes = getStringArray(item.ewcCodes);
  const disposalOrRecoveryCodes = getDisposalOrRecoveryCodes(item);
  const popsComponents = getPopsComponents(item);
  const hazardousPropertyCodes = unique([
    ...getStringArray(item.hazCodes),
    ...getStringArray(getField(item, "hazardous.hazCodes")),
  ]);
  const hazardousComponents = getHazardousComponents(item);

  return {
    index: index + 1,
    ewcCodes,
    wasteDescription: getString(item.wasteDescription),
    containerType: getString(item.typeOfContainers) || null,
    numberOfContainers: getNumberOrNull(item.numberOfContainers),
    weightLabel: formatWeight(item.weight),
    disposalOrRecoveryCodes,
    containsPops:
      item.containsPops === true ||
      getString(getField(item, "pops.containsPops")) === "true" ||
      popsComponents.length > 0,
    popsComponents,
    containsHazardous:
      item.containsHazardous === true ||
      getString(getField(item, "hazardous.containsHazardous")) ===
        "true" ||
      hazardousPropertyCodes.length > 0 ||
      hazardousComponents.length > 0,
    hazardousPropertyCodes,
    hazardousComponents,
  };
}

function getDisposalOrRecoveryCodes(item: Record<string, unknown>) {
  const rows = getRecordArray(item.disposalOrRecoveryCodes);

  return rows
    .map((row) => {
      const code = getString(row.code);
      const weight = formatWeight(row.weight);

      if (!code && !weight) return "";
      if (!weight) return code;
      if (!code) return weight;

      return `${code} (${weight})`;
    })
    .filter(Boolean);
}

function getPopsComponents(item: Record<string, unknown>) {
  const rows = [
    ...getRecordArray(item.popsComponents),
    ...getRecordArray(getField(item, "pops.components")),
  ];

  return rows
    .map((row) => {
      const code = getString(row.code) || getString(row.name);
      const concentration = getString(row.concentration);

      if (!code && !concentration) return "";
      if (!concentration) return code;
      if (!code) return concentration;

      return `${code} (${concentration})`;
    })
    .filter(Boolean);
}

function getHazardousComponents(item: Record<string, unknown>) {
  const rows = [
    ...getRecordArray(item.hazardousComponents),
    ...getRecordArray(getField(item, "hazardous.components")),
  ];

  return rows
    .map((row) => {
      const name = getString(row.name) || getString(row.code);
      const concentration = getString(row.concentration);

      if (!name && !concentration) return "";
      if (!concentration) return name;
      if (!name) return concentration;

      return `${name} (${concentration})`;
    })
    .filter(Boolean);
}

function getBrokerOrDealer(
  payload: Record<string, unknown>,
): EvidencePartySummary | null {
  const direct = firstRecord(
    payload.brokerOrDealer,
    payload.brokerDealer,
    payload.broker,
    payload.dealer,
  );

  const fromArray =
    getRecordArray(payload.brokers)[0] ??
    getRecordArray(payload.dealers)[0];

  const party = direct ?? fromArray;

  if (!party) return null;

  const address = isRecord(party.address) ? party.address : {};

  return {
    organisationName: getString(party.organisationName) || null,
    registrationNumber: getString(party.registrationNumber) || null,
    postcode:
      getString(address.postcode) || getString(party.postcode) || null,
    emailAddress: getString(party.emailAddress) || null,
    phoneNumber: getString(party.phoneNumber) || null,
  };
}

/* =========================================================
   SCANNER HELPERS
========================================================= */

const PAT_SCENARIO_PATTERN =
  /\b(R01|R02|R03|R04|R05|R07|C01|C02|B01|P01|H01|H02|H03|X01)\b/i;

function getPatScenarioIdFromPayload(
  payload: Record<string, unknown>,
) {
  const directCandidates = [
    payload.scenarioId,
    payload.patScenarioId,
    payload.patScenario,
    payload.yourUniqueReference,
  ];

  for (const candidate of directCandidates) {
    const scenarioId = extractPatScenarioId(candidate);

    if (scenarioId) return scenarioId;
  }

  for (const reference of getRecordArray(
    payload.otherReferencesForMovement,
  )) {
    const fromLabel = extractPatScenarioId(reference.label);
    const fromReference = extractPatScenarioId(reference.reference);

    if (fromLabel) return fromLabel;
    if (fromReference) return fromReference;
  }

  return null;
}

function extractPatScenarioId(value: unknown) {
  const text = getString(value).toUpperCase();

  if (!text) return null;

  const explicitMatch = text.match(
    /WX[-_\s]?PAT[-_\s]?(R01|R02|R03|R04|R05|R07|C01|C02|B01|P01|H01|H02|H03|X01)/i,
  );

  if (explicitMatch?.[1]) return explicitMatch[1].toUpperCase();

  const looseMatch = text.match(PAT_SCENARIO_PATTERN);

  return looseMatch?.[1] ? looseMatch[1].toUpperCase() : null;
}

function buildSuggestionReason(
  scenarioId: string,
  reasons: string[],
) {
  return `Waste X matched this DWT submission to PAT scenario ${scenarioId}. ${reasons.join(
    ". ",
  )}.`;
}

function getConfidenceRank(
  value: DwtEvidenceSuggestion["confidence"],
) {
  const rank: Record<DwtEvidenceSuggestion["confidence"], number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  return rank[value];
}

function getWasteItems(
  payload: Record<string, unknown>,
): Record<string, unknown>[] {
  const value = payload.wasteItems;

  if (!Array.isArray(value)) return [];

  return value.filter(isRecord);
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") {
        return String(item).trim();
      }

      if (isRecord(item)) {
        return (
          getString(item.code) ||
          getString(item.name) ||
          getString(item.value)
        );
      }

      return "";
    })
    .filter(Boolean);
}

function firstRecord(...values: unknown[]) {
  return values.find(isRecord) as
    | Record<string, unknown>
    | undefined;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatWeight(value: unknown) {
  if (!isRecord(value)) return null;

  const amount = getString(value.amount);
  const metric = getString(value.metric);
  const isEstimate = value.isEstimate === true;

  if (!amount && !metric) return null;

  return `${amount || "—"} ${metric || ""}${
    isEstimate ? " estimated" : ""
  }`.trim();
}

function getField(row: unknown, key: string): unknown {
  if (!row || typeof row !== "object") return null;

  if (key.includes(".")) {
    const parts = key.split(".");
    let current: unknown = row;

    for (const part of parts) {
      if (!current || typeof current !== "object") return null;
      current = (current as Record<string, unknown>)[part];
    }

    return current ?? null;
  }

  return (row as Record<string, unknown>)[key] ?? null;
}

function getString(value: unknown) {
  if (value === null || value === undefined) return "";

  return String(value).trim();
}

function getNumberOrNull(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonValue(value: unknown): unknown {
  if (!value) return null;

  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function getResponseStatusCode(value: unknown) {
  const parsed = parseJsonValue(value);

  if (!isRecord(parsed)) return null;

  const statusCode = parsed.statusCode;

  if (typeof statusCode === "number") return statusCode;

  if (typeof statusCode === "string") {
    const parsedStatus = Number(statusCode);
    return Number.isFinite(parsedStatus) ? parsedStatus : null;
  }

  return null;
}

function getErrorMessageFromResponse(value: unknown) {
  const parsed = parseJsonValue(value);

  if (!isRecord(parsed)) return null;

  const responseBody = parsed.responseBody;

  if (typeof responseBody === "string") return responseBody;

  if (isRecord(responseBody)) {
    const message =
      responseBody.message ??
      responseBody.error ??
      responseBody.detail ??
      responseBody.title;

    if (message) return String(message);
  }

  return null;
}

function toIso(value: unknown) {
  if (!value) return null;

  const date = new Date(value as string | Date);

  if (!Number.isFinite(date.getTime())) return null;

  return date.toISOString();
}
