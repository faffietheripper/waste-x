// src/app/admin/digital-waste-tracking/pat/PatTrackerClient.tsx

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus, useFormState } from "react-dom";
import { useRouter } from "next/navigation";

import { patTrackerAction } from "./actions";

import {
  initialPatActionState,
  type PatActionState,
} from "./pat-action-state";

export type EvidenceWasteItemSummary = {
  index: number;
  ewcCodes: string[];
  wasteDescription: string;
  containerType: string | null;
  numberOfContainers: number | null;
  weightLabel: string | null;
  disposalOrRecoveryCodes: string[];
  containsPops: boolean;
  popsComponents: string[];
  containsHazardous: boolean;
  hazardousPropertyCodes: string[];
  hazardousComponents: string[];
};

export type EvidencePartySummary = {
  organisationName: string | null;
  registrationNumber: string | null;
  postcode: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
};

export type EvidenceValidation = {
  valid: boolean;
  scenarioReference: string | null;
  message: string | null;
  warnings: string[];
};

export type EvidenceSummary = {
  wasteItemCount: number;
  ewcCodes: string[];
  disposalOrRecoveryCodes: string[];
  containsPops: boolean;
  popsComponentCount: number;
  popsComponents: string[];
  containsHazardous: boolean;
  hazardousComponentCount: number;
  hazardousPropertyCodes: string[];
  hazardousComponents: string[];
  meansOfTransport: string | null;
  carrierRegistrationNumber: string | null;
  brokerDealerIncluded: boolean;
  brokerOrDealer: EvidencePartySummary | null;
  wasteItems: EvidenceWasteItemSummary[];
};

export type PatResult = {
  id: string;
  scenarioId: string;
  scenarioOrder: number;
  scenarioDescription: string;
  feature: string | null;
  expectedResult: "success" | "error";

  wasteTrackingId: string | null;
  ewcCodes: string | null;
  reason: string | null;

  assignmentId: string | null;
  listingId: number | null;
  receiptId: string | null;
  dwtSubmissionId: string | null;

  httpStatus: number | null;
  errorMessage: string | null;
  testedAt: string | null;

  evidenceSummary: EvidenceSummary | null;
  evidenceValidation: EvidenceValidation | null;

  defraStatus:
    | "not_started"
    | "ready_to_send"
    | "submitted_to_defra"
    | "confirmed_by_defra"
    | "needs_more_info"
    | "unable_to_run"
    | "failed";

  defraSentAt: string | null;
  defraConfirmedAt: string | null;

  unableToRunReason: string | null;
  additionalDetails: string | null;
  notes: string | null;

  createdAt: string | null;
  updatedAt: string | null;
};

export type DwtEvidenceSuggestion = {
  scenarioId: string;
  patResultId: string;

  dwtSubmissionId: string;
  wasteTrackingId: string | null;

  assignmentId: string | null;
  listingId: number | null;
  receiptId: string | null;

  status: string;
  httpStatus: number | null;
  endpoint: string;
  method: string;
  testedAt: string | null;

  ewcCodes: string;
  reason: string;
  errorMessage: string | null;
  evidenceSummary: EvidenceSummary | null;
  payloadScenarioId: string | null;

  confidence: "high" | "medium" | "low";
  matchReasons: string[];
};

export default function PatTrackerClient({
  initialResults,
  initialSuggestions,
  scannedSubmissionCount,
}: {
  initialResults: PatResult[];
  initialSuggestions: DwtEvidenceSuggestion[];
  scannedSubmissionCount: number;
}) {
  const [results, setResults] = useState(initialResults);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [filter, setFilter] = useState<
    "all" | "missing" | "review" | "suggested" | "attached" | "confirmed"
  >("all");

  useEffect(() => {
    setResults(initialResults);
    setSuggestions(initialSuggestions);
  }, [initialResults, initialSuggestions]);

  const suggestionsByScenario = useMemo(() => {
    const map = new Map<string, DwtEvidenceSuggestion[]>();

    for (const suggestion of suggestions) {
      const existing = map.get(suggestion.scenarioId) ?? [];
      existing.push(suggestion);
      map.set(suggestion.scenarioId, existing);
    }

    return map;
  }, [suggestions]);

  const rows = useMemo(() => {
    return [...results]
      .sort((first, second) => first.scenarioOrder - second.scenarioOrder)
      .map((result) => ({
        result,
        suggestions: suggestionsByScenario.get(result.scenarioId) ?? [],
      }));
  }, [results, suggestionsByScenario]);

  const attachedCount = results.filter(
    (result) => result.wasteTrackingId || result.dwtSubmissionId || result.errorMessage,
  ).length;

  const evidenceNeedsReviewCount = results.filter(
    (result) => Boolean(result.evidenceValidation && !result.evidenceValidation.valid),
  ).length;

  const suggestedCount = rows.filter(
    (row) =>
      !row.result.wasteTrackingId &&
      !row.result.dwtSubmissionId &&
      row.suggestions.length > 0,
  ).length;

  const missingCount = rows.filter(
    (row) =>
      !row.result.wasteTrackingId &&
      !row.result.dwtSubmissionId &&
      !row.result.errorMessage &&
      row.suggestions.length === 0,
  ).length;

  const confirmedCount = results.filter(
    (result) => result.defraStatus === "confirmed_by_defra",
  ).length;

  const submittedCount = results.filter(
    (result) =>
      result.defraStatus === "submitted_to_defra" ||
      result.defraStatus === "confirmed_by_defra",
  ).length;

  const readyCount = results.filter(
    (result) => result.defraStatus === "ready_to_send",
  ).length;

  const filteredRows = rows.filter((row) => {
    const hasEvidence =
      Boolean(row.result.wasteTrackingId) ||
      Boolean(row.result.dwtSubmissionId) ||
      Boolean(row.result.errorMessage);

    if (filter === "missing") return !hasEvidence && row.suggestions.length === 0;
    if (filter === "review") {
      return Boolean(
        row.result.evidenceValidation && !row.result.evidenceValidation.valid,
      );
    }
    if (filter === "suggested") return !hasEvidence && row.suggestions.length > 0;
    if (filter === "attached") return hasEvidence;
    if (filter === "confirmed") {
      return row.result.defraStatus === "confirmed_by_defra";
    }

    return true;
  });

  const emailTable = useMemo(() => buildDefraEmailTable(results), [results]);

  return (
    <div className="space-y-8">
      {/* ================= NEW SCANNER SUMMARY ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Evidence Scanner
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Waste X scans existing evidence first
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-500">
              Instead of manually filling 14 scenario forms, Waste X checks your
              existing DWT submissions and suggests only records that are labelled
              for the correct PAT scenario. One DWT submission should not be reused
              across different scenarios.
            </p>
          </div>

          <SeedForm />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <ScannerStat
            label="Submissions scanned"
            value={scannedSubmissionCount}
            helper="Latest DWT records checked"
          />

          <ScannerStat
            label="Evidence attached"
            value={attachedCount}
            helper="Scenarios with WTID/error evidence"
          />

          <ScannerStat
            label="Needs review"
            value={evidenceNeedsReviewCount}
            helper="Attached evidence mismatch"
            tone={evidenceNeedsReviewCount > 0 ? "danger" : "default"}
          />

          <ScannerStat
            label="Suggested matches"
            value={suggestedCount}
            helper="Can be attached now"
            tone={suggestedCount > 0 ? "warning" : "default"}
          />

          <ScannerStat
            label="Missing tests"
            value={missingCount}
            helper="Need a new PAT run"
            tone={missingCount > 0 ? "danger" : "default"}
          />

          <ScannerStat
            label="Confirmed"
            value={confirmedCount}
            helper="Confirmed by DEFRA"
          />
        </div>
      </section>

      {/* ================= STATUS KPIS ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Expected" value={14} helper="DEFRA scenarios" />
        <Metric label="Recorded" value={results.length} helper="Rows in tracker" />
        <Metric label="Ready" value={readyCount} helper="Ready to email" />
        <Metric label="Submitted" value={submittedCount} helper="Sent to DEFRA" />
        <Metric
          label="Confirmed"
          value={confirmedCount}
          helper="DEFRA confirmed"
          tone={confirmedCount < 14 ? "danger" : "default"}
        />
        <Metric
          label="Remaining"
          value={Math.max(14 - attachedCount, 0)}
          helper="No evidence attached yet"
          tone={attachedCount < 14 ? "danger" : "default"}
        />
      </section>

      {/* ================= FILTERS ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Work Queue
            </p>
            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Focus on what needs doing
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </FilterButton>

            <FilterButton
              active={filter === "suggested"}
              onClick={() => setFilter("suggested")}
            >
              Suggested
            </FilterButton>

            <FilterButton
              active={filter === "review"}
              onClick={() => setFilter("review")}
            >
              Needs review
            </FilterButton>

            <FilterButton
              active={filter === "missing"}
              onClick={() => setFilter("missing")}
            >
              Missing
            </FilterButton>

            <FilterButton
              active={filter === "attached"}
              onClick={() => setFilter("attached")}
            >
              Attached
            </FilterButton>

            <FilterButton
              active={filter === "confirmed"}
              onClick={() => setFilter("confirmed")}
            >
              Confirmed
            </FilterButton>
          </div>
        </div>
      </section>

      {/* ================= DEFRA EMAIL TABLE ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              DEFRA Submission Table
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Copy into your email
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Once evidence is attached to the scenarios, this table is ready to
              send to DEFRA. Missing scenarios will show as pending.
            </p>
          </div>

          <CopyEmailTableButton value={emailTable} />
        </div>

        <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap rounded-2xl border border-gray-200 bg-gray-50 p-5 text-xs leading-6 text-gray-700">
          {emailTable}
        </pre>
      </section>

      {/* ================= SCENARIO SCANNER REGISTER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-gray-200 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Scenario Register
          </p>

          <h2 className="mt-2 text-lg font-bold text-gray-950">
            Suggested evidence and missing tests
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Attach suggested submissions where Waste X found a match. If a
            scenario has no suggestion, run a new DWT test that satisfies the
            requirements shown on the card.
          </p>
        </div>

        {results.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-5">
            {filteredRows.map(({ result, suggestions }) => (
              <ScenarioScannerCard
                key={result.id}
                result={result}
                suggestions={suggestions}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================================================
   SCENARIO CARD
========================================================= */

function ScenarioScannerCard({
  result,
  suggestions,
}: {
  result: PatResult;
  suggestions: DwtEvidenceSuggestion[];
}) {
  const hasEvidence =
    Boolean(result.wasteTrackingId) ||
    Boolean(result.dwtSubmissionId) ||
    Boolean(result.errorMessage);

  const expectedError = result.expectedResult === "error";
  const evidenceNeedsReview = Boolean(
    result.evidenceValidation && !result.evidenceValidation.valid,
  );

  return (
    <article className="rounded-[1.5rem] border border-gray-200 bg-gray-50 p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-gray-900 bg-gray-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
              {result.scenarioId}
            </span>

            <StatusBadge status={result.defraStatus} />

            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                expectedError
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              Expected {expectedError ? "Error" : "WTID"}
            </span>

            {hasEvidence ? (
              <>
                <span className="rounded-full border border-gray-900 bg-gray-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                  Evidence attached
                </span>

                {evidenceNeedsReview && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
                    Evidence needs review
                  </span>
                )}
              </>
            ) : suggestions.length > 0 ? (
              <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-700">
                {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
                Missing test
              </span>
            )}
          </div>

          <h3 className="mt-3 text-sm font-bold text-gray-950">
            {result.scenarioDescription}
          </h3>

          <p className="mt-2 text-xs leading-5 text-gray-500">
            Feature: {result.feature ?? "—"} · Scenario order:{" "}
            {result.scenarioOrder}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <QuickActionForm id={result.id} intent="ready">
            Mark ready
          </QuickActionForm>

          <QuickActionForm id={result.id} intent="sent">
            Mark sent
          </QuickActionForm>

          <QuickActionForm id={result.id} intent="confirmed" variant="primary">
            Mark confirmed
          </QuickActionForm>

          {result.listingId && (
            <Link
              href={`/admin/audit/chain/${result.listingId}`}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Chain
            </Link>
          )}
        </div>
      </div>

      {hasEvidence ? (
        <>
          <AttachedEvidencePanel result={result} />

          {evidenceNeedsReview && suggestions.length > 0 && (
            <SuggestedEvidencePanel suggestions={suggestions} />
          )}
        </>
      ) : suggestions.length > 0 ? (
        <SuggestedEvidencePanel suggestions={suggestions} />
      ) : (
        <MissingScenarioPanel result={result} />
      )}

      <details
        open={evidenceNeedsReview}
        className="mt-5 rounded-2xl border border-gray-200 bg-white p-5"
      >
        <summary className="cursor-pointer text-sm font-bold text-gray-950">
          {evidenceNeedsReview ? "Fix / replace evidence" : "Manual evidence override"}
        </summary>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          Use this only if the scanner cannot find the evidence automatically or
          DEFRA gives you specific manual details to record.
        </p>

        <ManualEvidenceForm result={result} />
      </details>
    </article>
  );
}

function AttachedEvidencePanel({ result }: { result: PatResult }) {
  const evidenceValidation = result.evidenceValidation;
  const evidenceNeedsReview = Boolean(
    evidenceValidation && !evidenceValidation.valid,
  );

  return (
    <section className="mt-5 rounded-[1.35rem] border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
        Attached Evidence
      </p>

      {evidenceNeedsReview && evidenceValidation && (
        <EvidenceValidationWarning validation={evidenceValidation} />
      )}

      {evidenceValidation?.valid && (
        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-800">
          {evidenceValidation.message}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm leading-6 text-gray-600">
          Remove this linked submission if it was attached to the wrong PAT
          scenario, then attach a correct suggestion or save corrected manual
          evidence below.
        </p>

        <ClearEvidenceForm result={result} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <EvidenceItem
          label="WTID / expected error"
          value={result.wasteTrackingId ?? result.errorMessage ?? "—"}
        />

        <EvidenceItem label="EWC codes" value={result.ewcCodes ?? "—"} />

        <EvidenceItem label="HTTP status" value={result.httpStatus ?? "—"} />

        <EvidenceItem label="Tested at" value={formatDateTime(result.testedAt)} />

        <EvidenceItem label="Assignment" value={result.assignmentId ?? "—"} />

        <EvidenceItem label="Listing" value={result.listingId ?? "—"} />

        <EvidenceItem label="Receipt" value={result.receiptId ?? "—"} />

        <EvidenceItem
          label="DWT submission"
          value={result.dwtSubmissionId ?? "—"}
        />
      </div>

      {result.evidenceSummary && (
        <EvidenceBreakdownPanel evidenceSummary={result.evidenceSummary} />
      )}

      {result.reason && (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
            Reason
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-600">{result.reason}</p>
        </div>
      )}
    </section>
  );
}


function EvidenceValidationWarning({
  validation,
}: {
  validation: EvidenceValidation;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
        Evidence mismatch warning
      </p>

      <p className="mt-2 text-sm font-semibold text-red-900">
        {validation.message ?? "Attached evidence needs review."}
      </p>

      <div className="mt-3 space-y-1 text-sm leading-6 text-red-800">
        {validation.scenarioReference && (
          <p>
            Payload scenario reference: <strong>{validation.scenarioReference}</strong>
          </p>
        )}

        {validation.warnings.map((warning) => (
          <p key={warning}>• {warning}</p>
        ))}
      </div>
    </div>
  );
}

function SuggestedEvidencePanel({
  suggestions,
}: {
  suggestions: DwtEvidenceSuggestion[];
}) {
  return (
    <section className="mt-5 rounded-[1.35rem] border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
        Suggested Evidence
      </p>

      <h4 className="mt-2 text-sm font-bold text-gray-950">
        Waste X found matching DWT submissions
      </h4>

      <div className="mt-4 space-y-3">
        {suggestions.map((suggestion) => (
          <SuggestionCard
            key={`${suggestion.scenarioId}-${suggestion.dwtSubmissionId}`}
            suggestion={suggestion}
          />
        ))}
      </div>
    </section>
  );
}

function SuggestionCard({ suggestion }: { suggestion: DwtEvidenceSuggestion }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <ConfidenceBadge confidence={suggestion.confidence} />

            <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
              {suggestion.status || "Unknown status"}
            </span>

            {suggestion.httpStatus && (
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                HTTP {suggestion.httpStatus}
              </span>
            )}

            {suggestion.evidenceSummary?.wasteItemCount ? (
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                {suggestion.evidenceSummary.wasteItemCount} waste item
                {suggestion.evidenceSummary.wasteItemCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          <p className="mt-3 text-sm font-bold text-gray-950">
            {suggestion.wasteTrackingId
              ? `WTID ${suggestion.wasteTrackingId}`
              : "Expected error evidence"}
          </p>

          <p className="mt-1 text-xs text-gray-500">
            Submission: {shortId(suggestion.dwtSubmissionId)} · Tested{" "}
            {formatDateTime(suggestion.testedAt)}
          </p>

          {suggestion.payloadScenarioId && (
            <p className="mt-1 text-xs font-semibold text-gray-700">
              Payload PAT reference: {suggestion.payloadScenarioId}
            </p>
          )}

          <ul className="mt-3 space-y-1 text-xs leading-5 text-gray-600">
            {suggestion.matchReasons.map((reason) => (
              <li key={reason}>✓ {reason}</li>
            ))}
          </ul>

          {suggestion.evidenceSummary && (
            <EvidenceBreakdownPanel
              evidenceSummary={suggestion.evidenceSummary}
              compact
            />
          )}
        </div>

        <AttachSuggestionForm suggestion={suggestion} />
      </div>
    </div>
  );
}

function EvidenceBreakdownPanel({
  evidenceSummary,
  compact = false,
}: {
  evidenceSummary: EvidenceSummary;
  compact?: boolean;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
            Payload evidence breakdown
          </p>

          <p className="mt-2 text-sm font-semibold text-gray-950">
            {evidenceSummary.wasteItemCount} waste item
            {evidenceSummary.wasteItemCount === 1 ? "" : "s"} in the submitted
            payload
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {evidenceSummary.brokerDealerIncluded && (
            <MiniBadge>Broker/dealer included</MiniBadge>
          )}

          {evidenceSummary.containsPops && (
            <MiniBadge>{evidenceSummary.popsComponentCount} POPs</MiniBadge>
          )}

          {evidenceSummary.containsHazardous && (
            <MiniBadge>
              {evidenceSummary.hazardousComponentCount} hazardous
            </MiniBadge>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <EvidenceItem
          label="All EWC codes"
          value={joinEvidenceValues(evidenceSummary.ewcCodes)}
        />

        <EvidenceItem
          label="Disposal/recovery"
          value={joinEvidenceValues(evidenceSummary.disposalOrRecoveryCodes)}
        />

        <EvidenceItem
          label="POPs components"
          value={joinEvidenceValues(evidenceSummary.popsComponents)}
        />

        <EvidenceItem
          label="Hazardous evidence"
          value={joinEvidenceValues([
            ...evidenceSummary.hazardousPropertyCodes,
            ...evidenceSummary.hazardousComponents,
          ])}
        />

        <EvidenceItem
          label="Transport"
          value={evidenceSummary.meansOfTransport ?? "—"}
        />

        <EvidenceItem
          label="Carrier registration"
          value={evidenceSummary.carrierRegistrationNumber ?? "—"}
        />

        <EvidenceItem
          label="Broker/dealer"
          value={
            evidenceSummary.brokerOrDealer?.organisationName ??
            (evidenceSummary.brokerDealerIncluded ? "Included" : "—")
          }
        />

        <EvidenceItem
          label="Broker/dealer reg"
          value={evidenceSummary.brokerOrDealer?.registrationNumber ?? "—"}
        />
      </div>

      {!compact && evidenceSummary.wasteItems.length > 0 && (
        <div className="mt-4 space-y-3">
          {evidenceSummary.wasteItems.map((item) => (
            <div
              key={item.index}
              className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                Waste item {item.index}
              </p>

              <p className="mt-2 text-sm font-semibold text-gray-950">
                {item.wasteDescription || "No description captured"}
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <EvidenceItem label="EWC" value={joinEvidenceValues(item.ewcCodes)} />
                <EvidenceItem
                  label="Container"
                  value={
                    [item.numberOfContainers, item.containerType]
                      .filter((value) => value !== null && value !== "")
                      .join(" × ") || "—"
                  }
                />
                <EvidenceItem label="Weight" value={item.weightLabel ?? "—"} />
                <EvidenceItem
                  label="D/R codes"
                  value={joinEvidenceValues(item.disposalOrRecoveryCodes)}
                />
                <EvidenceItem
                  label="POPs"
                  value={joinEvidenceValues(item.popsComponents)}
                />
                <EvidenceItem
                  label="Haz codes"
                  value={joinEvidenceValues(item.hazardousPropertyCodes)}
                />
                <EvidenceItem
                  label="Haz components"
                  value={joinEvidenceValues(item.hazardousComponents)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
      {children}
    </span>
  );
}

function joinEvidenceValues(values: string[]) {
  return values.length > 0 ? values.join(", ") : "—";
}


function MissingScenarioPanel({ result }: { result: PatResult }) {
  return (
    <section className="mt-5 rounded-[1.35rem] border border-red-200 bg-red-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">
        Missing Test
      </p>

      <h4 className="mt-2 text-sm font-bold text-red-800">
        No existing DWT submission currently satisfies {result.scenarioId}.
      </h4>

      <p className="mt-2 max-w-4xl text-sm leading-6 text-red-700/80">
        Run a new DWT test that satisfies this scenario, then return to this page.
        Waste X will scan the latest submissions and suggest the matching
        evidence automatically.
      </p>

      <div className="mt-4 rounded-2xl border border-red-200 bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
          What this scenario needs
        </p>

        <p className="mt-2 text-sm leading-6 text-red-800">
          {scenarioRequirement(result.scenarioId)}
        </p>
      </div>
    </section>
  );
}

/* =========================================================
   FORMS
========================================================= */

function SeedForm() {
  const router = useRouter();

  const [state, formAction] = useFormState(
    patTrackerAction,
    initialPatActionState,
  );

  useRefreshAfterAction(state);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="intent" value="seed" />

      <SubmitButton>Seed / refresh scenarios</SubmitButton>

      <ActionFeedback state={state} />
    </form>
  );
}

function QuickActionForm({
  id,
  intent,
  children,
  variant = "secondary",
}: {
  id: string;
  intent: "ready" | "sent" | "confirmed";
  children: string;
  variant?: "secondary" | "primary";
}) {
  const [state, formAction] = useFormState(
    patTrackerAction,
    initialPatActionState,
  );

  useRefreshAfterAction(state);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />

      <MiniSubmitButton variant={variant}>{children}</MiniSubmitButton>

      <ActionFeedback state={state} compact />
    </form>
  );
}

function AttachSuggestionForm({
  suggestion,
}: {
  suggestion: DwtEvidenceSuggestion;
}) {
  const [state, formAction] = useFormState(
    patTrackerAction,
    initialPatActionState,
  );

  useRefreshAfterAction(state);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="intent" value="attach_submission" />
      <input type="hidden" name="id" value={suggestion.patResultId} />

      <input
        type="hidden"
        name="dwtSubmissionId"
        value={suggestion.dwtSubmissionId}
      />
      <input
        type="hidden"
        name="wasteTrackingId"
        value={suggestion.wasteTrackingId ?? ""}
      />
      <input
        type="hidden"
        name="assignmentId"
        value={suggestion.assignmentId ?? ""}
      />
      <input
        type="hidden"
        name="listingId"
        value={suggestion.listingId ?? ""}
      />
      <input
        type="hidden"
        name="receiptId"
        value={suggestion.receiptId ?? ""}
      />
      <input
        type="hidden"
        name="httpStatus"
        value={suggestion.httpStatus ?? ""}
      />
      <input type="hidden" name="testedAt" value={suggestion.testedAt ?? ""} />
      <input type="hidden" name="ewcCodes" value={suggestion.ewcCodes} />
      <input type="hidden" name="reason" value={suggestion.reason} />
      <input
        type="hidden"
        name="errorMessage"
        value={suggestion.errorMessage ?? ""}
      />

      <MiniSubmitButton variant="primary">Attach evidence</MiniSubmitButton>

      <ActionFeedback state={state} compact />
    </form>
  );
}

function ClearEvidenceForm({ result }: { result: PatResult }) {
  const [state, formAction] = useFormState(
    patTrackerAction,
    initialPatActionState,
  );

  useRefreshAfterAction(state);

  return (
    <form action={formAction} className="shrink-0 space-y-2">
      <input type="hidden" name="intent" value="clear_evidence" />
      <input type="hidden" name="id" value={result.id} />

      <MiniSubmitButton variant="danger">Remove wrong evidence</MiniSubmitButton>

      <ActionFeedback state={state} compact />
    </form>
  );
}

function ManualEvidenceForm({ result }: { result: PatResult }) {
  const [state, formAction] = useFormState(
    patTrackerAction,
    initialPatActionState,
  );

  useRefreshAfterAction(state);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="id" value={result.id} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Waste Tracking ID"
          name="wasteTrackingId"
          defaultValue={result.wasteTrackingId}
          placeholder={result.expectedResult === "error" ? "No WTID expected" : "26K5L36X7"}
        />

        <Field
          label="EWC codes"
          name="ewcCodes"
          defaultValue={result.ewcCodes}
          placeholder="020101"
        />

        <Field
          label="HTTP status"
          name="httpStatus"
          type="number"
          defaultValue={result.httpStatus}
          placeholder={result.expectedResult === "error" ? "400" : "201"}
        />

        <Field
          label="Tested at"
          name="testedAt"
          type="datetime-local"
          defaultValue={toDateTimeLocalValue(result.testedAt)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Assignment ID"
          name="assignmentId"
          defaultValue={result.assignmentId}
        />

        <Field
          label="Listing ID"
          name="listingId"
          type="number"
          defaultValue={result.listingId}
        />

        <Field
          label="Receipt ID"
          name="receiptId"
          defaultValue={result.receiptId}
        />

        <Field
          label="DWT submission ID"
          name="dwtSubmissionId"
          defaultValue={result.dwtSubmissionId}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SelectField
          label="DEFRA status"
          name="defraStatus"
          defaultValue={result.defraStatus}
          options={[
            ["not_started", "Not started"],
            ["ready_to_send", "Ready to send"],
            ["submitted_to_defra", "Submitted to DEFRA"],
            ["confirmed_by_defra", "Confirmed by DEFRA"],
            ["needs_more_info", "Needs more info"],
            ["unable_to_run", "Unable to run"],
            ["failed", "Failed"],
          ]}
        />

        <Field
          label="DEFRA sent at"
          name="defraSentAt"
          type="datetime-local"
          defaultValue={toDateTimeLocalValue(result.defraSentAt)}
        />

        <Field
          label="DEFRA confirmed at"
          name="defraConfirmedAt"
          type="datetime-local"
          defaultValue={toDateTimeLocalValue(result.defraConfirmedAt)}
        />
      </div>

      <Textarea
        label="Reason"
        name="reason"
        defaultValue={result.reason}
        placeholder="Reason/details required by DEFRA."
      />

      <Textarea
        label="Error message"
        name="errorMessage"
        defaultValue={result.errorMessage}
        placeholder="For C01 and H02, paste the expected error returned by the API."
      />

      <Textarea
        label="Unable to run reason"
        name="unableToRunReason"
        defaultValue={result.unableToRunReason}
      />

      <Textarea
        label="Additional details"
        name="additionalDetails"
        defaultValue={result.additionalDetails}
      />

      <Textarea label="Notes" name="notes" defaultValue={result.notes} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <ActionFeedback state={state} />

        <SubmitButton>Save manual evidence</SubmitButton>
      </div>
    </form>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function Metric({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string | number;
  helper: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p
        className={`mt-3 text-3xl font-bold tracking-tight ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function ScannerStat({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string | number;
  helper: string;
  tone?: "default" | "danger" | "warning";
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-gray-950"
        : "text-gray-950";

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>

      <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>

      <p className="mt-1 text-xs leading-5 text-gray-500">{helper}</p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
        active
          ? "border-gray-900 bg-gray-950 text-white"
          : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}

function EvidenceItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-semibold text-gray-950">
        {value === null || value === "" ? "—" : String(value)}
      </p>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </span>

      <input
        name={name}
        type={type}
        defaultValue={
          defaultValue === null || defaultValue === undefined
            ? ""
            : String(defaultValue)
        }
        placeholder={placeholder}
        className="mt-2 min-h-[3rem] w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </span>

      <select
        name={name}
        defaultValue={defaultValue ?? "not_started"}
        className="mt-2 min-h-[3rem] w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-gray-400"
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Textarea({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </span>

      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={3}
        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400"
      />
    </label>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-2xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Working..." : children}
    </button>
  );
}

function MiniSubmitButton({
  children,
  variant = "secondary",
}: {
  children: React.ReactNode;
  variant?: "secondary" | "primary" | "danger";
}) {
  const { pending } = useFormStatus();

  const className =
    variant === "primary"
      ? "border-gray-900 bg-gray-950 text-white hover:bg-gray-800"
      : variant === "danger"
        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {pending ? "Working..." : children}
    </button>
  );
}

function ActionFeedback({
  state,
  compact = false,
}: {
  state: PatActionState;
  compact?: boolean;
}) {
  if (!state.message) return null;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
        compact ? "max-w-[14rem] text-xs" : ""
      } ${
        state.ok
          ? "border-gray-900 bg-gray-950 text-white"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {state.ok ? "✓" : "⚠"} {state.message}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "confirmed_by_defra"
      ? "border-gray-900 bg-gray-950 text-white"
      : status === "submitted_to_defra"
        ? "border-gray-300 bg-gray-100 text-gray-800"
        : status === "ready_to_send"
          ? "border-gray-200 bg-white text-gray-700"
          : status === "needs_more_info" ||
              status === "unable_to_run" ||
              status === "failed"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-gray-200 bg-white text-gray-500";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {formatLabel(status)}
    </span>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: DwtEvidenceSuggestion["confidence"];
}) {
  const className =
    confidence === "high"
      ? "border-gray-900 bg-gray-950 text-white"
      : confidence === "medium"
        ? "border-gray-300 bg-white text-gray-700"
        : "border-gray-200 bg-white text-gray-500";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {confidence} confidence
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
      <p className="text-sm font-semibold text-gray-950">
        No PAT scenarios found.
      </p>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
        Click “Seed / refresh scenarios” above to create the DEFRA PAT tracker
        rows.
      </p>
    </div>
  );
}

function CopyEmailTableButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-white"
    >
      {copied ? "Copied ✓" : "Copy table"}
    </button>
  );
}

/* =========================================================
   HOOKS
========================================================= */

function useRefreshAfterAction(state: PatActionState) {
  const router = useRouter();

  useEffect(() => {
    if (!state.timestamp) return;
    if (!state.ok) return;

    const timeout = window.setTimeout(() => {
      router.refresh();
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [state.timestamp, state.ok, router]);
}

/* =========================================================
   HELPERS
========================================================= */

function buildDefraEmailTable(results: PatResult[]) {
  if (results.length === 0) {
    return "No PAT scenario rows have been created yet.";
  }

  const rows = [...results].sort(
    (first, second) => first.scenarioOrder - second.scenarioOrder,
  );

  const header =
    "Scenario ID | Scenario description | WTID | EWC codes | Reason / details";

  const divider =
    "------------|----------------------|------|-----------|-----------------";

  const body = rows
    .map((result) => {
      const evidenceNeedsReview = Boolean(
        result.evidenceValidation && !result.evidenceValidation.valid,
      );

      const evidenceReviewText = evidenceNeedsReview
        ? `CHECK EVIDENCE: ${
            result.evidenceValidation?.warnings.join(" ") ??
            "Attached evidence needs review."
          }`
        : null;

      const wtid = evidenceNeedsReview
        ? `CHECK EVIDENCE - ${
            result.wasteTrackingId ?? result.errorMessage ?? result.dwtSubmissionId ?? "attached record"
          }`
        : result.expectedResult === "error"
          ? result.errorMessage
            ? `No WTID - expected error. Tested at ${formatDateTime(
                result.testedAt,
              )}. HTTP status: ${result.httpStatus ?? "—"}. Error: ${
                result.errorMessage
              }`
            : "Pending expected-error test"
          : result.wasteTrackingId || "Pending";

      const details = [
        evidenceReviewText,
        result.reason,
        result.evidenceSummary
          ? buildEmailEvidenceSummary(result.evidenceSummary)
          : null,
        result.additionalDetails,
        result.unableToRunReason
          ? `Unable to run: ${result.unableToRunReason}`
          : null,
      ]
        .filter(Boolean)
        .join(" ");

      return `${result.scenarioId} | ${result.scenarioDescription} | ${wtid} | ${
        result.ewcCodes || result.evidenceSummary?.ewcCodes.join(", ") || "—"
      } | ${details || "—"}`;
    })
    .join("\n");

  return `${header}\n${divider}\n${body}`;
}

function buildEmailEvidenceSummary(summary: EvidenceSummary) {
  const parts = [
    `${summary.wasteItemCount} waste item${summary.wasteItemCount === 1 ? "" : "s"}`,
    summary.disposalOrRecoveryCodes.length > 0
      ? `D/R codes: ${summary.disposalOrRecoveryCodes.join(", ")}`
      : null,
    summary.popsComponents.length > 0
      ? `POPs: ${summary.popsComponents.join(", ")}`
      : null,
    summary.hazardousPropertyCodes.length > 0
      ? `Hazard properties: ${summary.hazardousPropertyCodes.join(", ")}`
      : null,
    summary.hazardousComponents.length > 0
      ? `Haz components: ${summary.hazardousComponents.join(", ")}`
      : null,
    summary.brokerDealerIncluded
      ? `Broker/dealer: ${
          summary.brokerOrDealer?.organisationName ?? "included"
        }`
      : null,
  ].filter(Boolean);

  return parts.join(". ");
}


function scenarioRequirement(scenarioId: string) {
  const requirements: Record<string, string> = {
    R01: "Run a successful basic receipt with one waste item, disposal/recovery code present, no POPs and no hazardous properties.",
    R02: "Run a successful receipt with more than one waste item in the payload.",
    R03: "Run a successful receipt where carrier means of transport is Road.",
    R04: "Run a successful receipt with no disposal/recovery codes included.",
    R05: "Run a successful receipt with multiple disposal/recovery codes.",
    R07: "Run a successful receipt with at least two EWC codes.",
    C01: "Run an expected-error test with no carrier registration number and no reason for missing registration.",
    C02: "Run a successful receipt with no carrier registration number but with a valid reason.",
    B01: "Run a successful receipt that includes broker/dealer details.",
    P01: "Run a successful receipt with multiple POPs components.",
    H01: "Run a successful receipt with multiple hazardous components or hazardous property codes.",
    H02: "Run an expected-error hazardous receipt with no consignment note code and no reason.",
    H03: "Run a successful hazardous receipt with no consignment note code but with a valid reason.",
    X01: "Run a successful receipt containing both hazardous components and POPs components.",
  };

  return requirements[scenarioId] ?? "Run a DWT submission that satisfies this DEFRA PAT scenario.";
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "";

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - offsetMs);

  return localDate.toISOString().slice(0, 16);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(value: string) {
  if (!value) return "—";
  if (value.length <= 12) return value;

  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}