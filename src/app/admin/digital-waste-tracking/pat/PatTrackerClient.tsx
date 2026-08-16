// src/app/admin/digital-waste-tracking/pat/PatTrackerClient.tsx

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { patTrackerAction } from "./actions";
import {
  initialPatActionState,
  type PatActionState,
} from "./pat-action-state";

/*
  IMPORTANT
  =========
  This is the existing PAT tracker interaction model with the admin visuals
  refreshed to Waste X Admin black / red / white.

  The action names, hidden field names, evidence fields and DEFRA-status
  workflow remain aligned with the existing PAT server action.
*/

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

type Filter =
  | "all"
  | "missing"
  | "review"
  | "suggested"
  | "attached"
  | "confirmed";

/* =========================================================
   MAIN CLIENT
========================================================= */

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
  const [filter, setFilter] = useState<Filter>("all");

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

  const rows = useMemo(
    () =>
      [...results]
        .sort((first, second) => first.scenarioOrder - second.scenarioOrder)
        .map((result) => ({
          result,
          suggestions: suggestionsByScenario.get(result.scenarioId) ?? [],
        })),
    [results, suggestionsByScenario],
  );

  const attachedCount = results.filter(
    (result) =>
      result.wasteTrackingId ||
      result.dwtSubmissionId ||
      result.errorMessage,
  ).length;

  const evidenceNeedsReviewCount = results.filter((result) =>
    Boolean(result.evidenceValidation && !result.evidenceValidation.valid),
  ).length;

  const suggestedCount = rows.filter(
    ({ result, suggestions: rowSuggestions }) =>
      !result.wasteTrackingId &&
      !result.dwtSubmissionId &&
      rowSuggestions.length > 0,
  ).length;

  const missingCount = rows.filter(
    ({ result, suggestions: rowSuggestions }) =>
      !result.wasteTrackingId &&
      !result.dwtSubmissionId &&
      !result.errorMessage &&
      rowSuggestions.length === 0,
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

  const filteredRows = rows.filter(({ result, suggestions: rowSuggestions }) => {
    const hasEvidence =
      Boolean(result.wasteTrackingId) ||
      Boolean(result.dwtSubmissionId) ||
      Boolean(result.errorMessage);

    if (filter === "missing") return !hasEvidence && rowSuggestions.length === 0;
    if (filter === "review") {
      return Boolean(
        result.evidenceValidation && !result.evidenceValidation.valid,
      );
    }
    if (filter === "suggested") {
      return !hasEvidence && rowSuggestions.length > 0;
    }
    if (filter === "attached") return hasEvidence;
    if (filter === "confirmed") {
      return result.defraStatus === "confirmed_by_defra";
    }

    return true;
  });

  const emailTable = useMemo(() => buildDefraEmailTable(results), [results]);

  return (
    <div className="space-y-7">
      <section className="rounded-[1.75rem] border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-600">
              Evidence Scanner
            </p>
            <h2 className="mt-2 text-xl font-black text-black">
              Waste X scans existing evidence first
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-black/50">
              The existing PAT evidence workflow is unchanged. Waste X scans
              DWT submissions, keeps evidence tied to the correct PAT scenario,
              and flags anything that needs review before it is sent to DEFRA.
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
            helper="Scenarios with evidence"
          />
          <ScannerStat
            label="Needs review"
            value={evidenceNeedsReviewCount}
            helper="Attached evidence mismatch"
            danger={evidenceNeedsReviewCount > 0}
          />
          <ScannerStat
            label="Suggested"
            value={suggestedCount}
            helper="Can be attached now"
          />
          <ScannerStat
            label="Missing tests"
            value={missingCount}
            helper="Need a PAT run"
            danger={missingCount > 0}
          />
          <ScannerStat
            label="Confirmed"
            value={confirmedCount}
            helper="Confirmed by DEFRA"
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Expected" value={14} helper="DEFRA scenarios" />
        <Metric label="Recorded" value={results.length} helper="Rows in tracker" />
        <Metric label="Ready" value={readyCount} helper="Ready to email" />
        <Metric label="Submitted" value={submittedCount} helper="Sent to DEFRA" />
        <Metric
          label="Confirmed"
          value={confirmedCount}
          helper="DEFRA confirmed"
          danger={confirmedCount < 14}
        />
        <Metric
          label="Remaining"
          value={Math.max(14 - attachedCount, 0)}
          helper="No evidence yet"
          danger={attachedCount < 14}
        />
      </section>

      <section className="rounded-[1.75rem] border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-600">
              Work Queue
            </p>
            <h2 className="mt-2 text-lg font-black text-black">
              Focus on what needs doing
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["suggested", "Suggested"],
                ["review", "Needs review"],
                ["missing", "Missing"],
                ["attached", "Attached"],
                ["confirmed", "Confirmed"],
              ] as [Filter, string][]
            ).map(([value, label]) => (
              <FilterButton
                key={value}
                active={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </FilterButton>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-black/10 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-600">
              DEFRA Submission Table
            </p>
            <h2 className="mt-2 text-lg font-black text-black">
              Copy into your email
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
              This is the existing PAT evidence summary generated from the
              tracker records.
            </p>
          </div>

          <CopyEmailTableButton value={emailTable} />
        </div>

        <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black p-5 text-xs leading-6 text-white/70">
          {emailTable}
        </pre>
      </section>

      <section className="rounded-[1.75rem] border border-black/10 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-black/10 pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-600">
            Scenario Register
          </p>
          <h2 className="mt-2 text-lg font-black text-black">
            Suggested evidence and missing tests
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
            Attach suggested submissions, review mismatches, or record manual
            evidence using the same PAT fields and actions as before.
          </p>
        </div>

        {results.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-5">
            {filteredRows.map(({ result, suggestions: rowSuggestions }) => (
              <ScenarioCard
                key={result.id}
                result={result}
                suggestions={rowSuggestions}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================================================
   SCENARIO
========================================================= */

function ScenarioCard({
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

  const needsReview = Boolean(
    result.evidenceValidation && !result.evidenceValidation.valid,
  );

  return (
    <article className="rounded-[1.5rem] border border-black/10 bg-black/[0.025] p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-black px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
              {result.scenarioId}
            </span>

            <StatusBadge status={result.defraStatus} />

            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                result.expectedResult === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-black/10 bg-white text-black/60"
              }`}
            >
              Expected {result.expectedResult === "error" ? "Error" : "WTID"}
            </span>

            {hasEvidence ? (
              <span className="rounded-full border border-black bg-black px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                Evidence attached
              </span>
            ) : suggestions.length > 0 ? (
              <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black/60">
                {suggestions.length} suggestion
                {suggestions.length === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-red-700">
                Missing test
              </span>
            )}

            {needsReview ? (
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-red-700">
                Evidence needs review
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-sm font-black text-black">
            {result.scenarioDescription}
          </h3>
          <p className="mt-2 text-xs leading-5 text-black/45">
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
          <QuickActionForm id={result.id} intent="confirmed" primary>
            Mark confirmed
          </QuickActionForm>

          {result.listingId ? (
            <Link
              href={`/admin/audit/chain/${result.listingId}`}
              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-black/65 transition hover:border-red-300 hover:text-red-600"
            >
              Chain
            </Link>
          ) : null}
        </div>
      </div>

      {hasEvidence ? (
        <>
          <AttachedEvidence result={result} />

          {needsReview && suggestions.length > 0 ? (
            <Suggestions suggestions={suggestions} />
          ) : null}
        </>
      ) : suggestions.length > 0 ? (
        <Suggestions suggestions={suggestions} />
      ) : (
        <MissingScenario result={result} />
      )}

      <details
        open={needsReview}
        className="mt-5 rounded-2xl border border-black/10 bg-white p-5"
      >
        <summary className="cursor-pointer text-sm font-black text-black">
          {needsReview ? "Fix / replace evidence" : "Manual evidence override"}
        </summary>
        <p className="mt-2 text-sm leading-6 text-black/50">
          Use the existing manual fields when automatic evidence is unavailable
          or DEFRA asks for specific details.
        </p>

        <ManualEvidenceForm result={result} />
      </details>
    </article>
  );
}

function AttachedEvidence({ result }: { result: PatResult }) {
  return (
    <section className="mt-5 rounded-[1.35rem] border border-black/10 bg-white p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">
        Attached Evidence
      </p>

      {result.evidenceValidation &&
      !result.evidenceValidation.valid ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-black text-red-800">
            {result.evidenceValidation.message ??
              "Attached evidence needs review."}
          </p>
          <div className="mt-2 space-y-1 text-sm text-red-700">
            {result.evidenceValidation.scenarioReference ? (
              <p>
                Payload scenario reference:{" "}
                <strong>
                  {result.evidenceValidation.scenarioReference}
                </strong>
              </p>
            ) : null}
            {result.evidenceValidation.warnings.map((warning) => (
              <p key={warning}>• {warning}</p>
            ))}
          </div>
        </div>
      ) : null}

      {result.evidenceValidation?.valid ? (
        <div className="mt-4 rounded-2xl border border-black/10 bg-black/[0.025] p-4 text-sm text-black/65">
          {result.evidenceValidation.message}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-black/10 bg-black/[0.025] p-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm leading-6 text-black/55">
          Remove linked evidence if it belongs to the wrong PAT scenario, then
          attach the correct evidence or save a manual override.
        </p>
        <ClearEvidenceForm result={result} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

      {result.evidenceSummary ? (
        <EvidenceBreakdown summary={result.evidenceSummary} />
      ) : null}

      {result.reason ? (
        <div className="mt-4 rounded-2xl border border-black/10 bg-black/[0.025] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-600">
            Reason
          </p>
          <p className="mt-2 text-sm leading-6 text-black/60">
            {result.reason}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Suggestions({
  suggestions,
}: {
  suggestions: DwtEvidenceSuggestion[];
}) {
  return (
    <section className="mt-5 rounded-[1.35rem] border border-black/10 bg-white p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">
        Suggested Evidence
      </p>
      <h4 className="mt-2 text-sm font-black text-black">
        Matching DWT submissions
      </h4>

      <div className="mt-4 space-y-3">
        {suggestions.map((suggestion) => (
          <div
            key={`${suggestion.scenarioId}-${suggestion.dwtSubmissionId}`}
            className="rounded-2xl border border-black/10 bg-black/[0.025] p-4"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <ConfidenceBadge confidence={suggestion.confidence} />
                  <Pill>{suggestion.status || "Unknown status"}</Pill>
                  {suggestion.httpStatus ? (
                    <Pill>HTTP {suggestion.httpStatus}</Pill>
                  ) : null}
                </div>

                <p className="mt-3 text-sm font-black text-black">
                  {suggestion.wasteTrackingId
                    ? `WTID ${suggestion.wasteTrackingId}`
                    : "Expected error evidence"}
                </p>
                <p className="mt-1 text-xs text-black/45">
                  Submission: {shortId(suggestion.dwtSubmissionId)} · Tested{" "}
                  {formatDateTime(suggestion.testedAt)}
                </p>

                {suggestion.payloadScenarioId ? (
                  <p className="mt-2 text-xs font-bold text-black/65">
                    Payload PAT reference: {suggestion.payloadScenarioId}
                  </p>
                ) : null}

                <ul className="mt-3 space-y-1 text-xs leading-5 text-black/55">
                  {suggestion.matchReasons.map((reason) => (
                    <li key={reason}>✓ {reason}</li>
                  ))}
                </ul>

                {suggestion.evidenceSummary ? (
                  <EvidenceBreakdown
                    summary={suggestion.evidenceSummary}
                    compact
                  />
                ) : null}
              </div>

              <AttachSuggestionForm suggestion={suggestion} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EvidenceBreakdown({
  summary,
  compact = false,
}: {
  summary: EvidenceSummary;
  compact?: boolean;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-600">
            Payload Evidence
          </p>
          <p className="mt-2 text-sm font-bold text-black">
            {summary.wasteItemCount} waste item
            {summary.wasteItemCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {summary.brokerDealerIncluded ? <Pill>Broker/dealer</Pill> : null}
          {summary.containsPops ? (
            <Pill>{summary.popsComponentCount} POPs</Pill>
          ) : null}
          {summary.containsHazardous ? (
            <Pill>{summary.hazardousComponentCount} hazardous</Pill>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <EvidenceItem label="All EWC codes" value={joinValues(summary.ewcCodes)} />
        <EvidenceItem
          label="D/R codes"
          value={joinValues(summary.disposalOrRecoveryCodes)}
        />
        <EvidenceItem
          label="POPs"
          value={joinValues(summary.popsComponents)}
        />
        <EvidenceItem
          label="Hazardous"
          value={joinValues([
            ...summary.hazardousPropertyCodes,
            ...summary.hazardousComponents,
          ])}
        />
        <EvidenceItem label="Transport" value={summary.meansOfTransport ?? "—"} />
        <EvidenceItem
          label="Carrier registration"
          value={summary.carrierRegistrationNumber ?? "—"}
        />
        <EvidenceItem
          label="Broker/dealer"
          value={
            summary.brokerOrDealer?.organisationName ??
            (summary.brokerDealerIncluded ? "Included" : "—")
          }
        />
        <EvidenceItem
          label="Broker/dealer reg"
          value={summary.brokerOrDealer?.registrationNumber ?? "—"}
        />
      </div>

      {!compact && summary.wasteItems.length > 0 ? (
        <div className="mt-4 space-y-3">
          {summary.wasteItems.map((item) => (
            <div
              key={item.index}
              className="rounded-2xl border border-black/10 bg-black/[0.025] p-4"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-600">
                Waste item {item.index}
              </p>
              <p className="mt-2 text-sm font-bold text-black">
                {item.wasteDescription || "No description captured"}
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <EvidenceItem label="EWC" value={joinValues(item.ewcCodes)} />
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
                  value={joinValues(item.disposalOrRecoveryCodes)}
                />
                <EvidenceItem label="POPs" value={joinValues(item.popsComponents)} />
                <EvidenceItem
                  label="Haz codes"
                  value={joinValues(item.hazardousPropertyCodes)}
                />
                <EvidenceItem
                  label="Haz components"
                  value={joinValues(item.hazardousComponents)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MissingScenario({ result }: { result: PatResult }) {
  return (
    <section className="mt-5 rounded-[1.35rem] border border-red-200 bg-red-50 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-700">
        Missing Test
      </p>
      <h4 className="mt-2 text-sm font-black text-red-800">
        No existing DWT submission currently satisfies {result.scenarioId}.
      </h4>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-red-700/80">
        Run the required DWT PAT scenario, then return here. The evidence
        scanner will check the latest submissions again.
      </p>
      <div className="mt-4 rounded-2xl border border-red-200 bg-white p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-700">
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
   ACTION FORMS
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
    <form action={formAction} className="space-y-2">
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
  primary = false,
}: {
  id: string;
  intent: "ready" | "sent" | "confirmed";
  children: string;
  primary?: boolean;
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
      <MiniSubmitButton primary={primary}>{children}</MiniSubmitButton>
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
    <form action={formAction} className="shrink-0 space-y-2">
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
      <input
        type="hidden"
        name="testedAt"
        value={suggestion.testedAt ?? ""}
      />
      <input type="hidden" name="ewcCodes" value={suggestion.ewcCodes} />
      <input type="hidden" name="reason" value={suggestion.reason} />
      <input
        type="hidden"
        name="errorMessage"
        value={suggestion.errorMessage ?? ""}
      />

      <MiniSubmitButton primary>Attach evidence</MiniSubmitButton>
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

  /*
    This intentionally preserves the original client behaviour:
    clear_evidence is submitted to the existing server action, which falls
    through to the existing save path and clears omitted evidence fields.
  */
  return (
    <form action={formAction} className="shrink-0 space-y-2">
      <input type="hidden" name="intent" value="clear_evidence" />
      <input type="hidden" name="id" value={result.id} />
      <DangerSubmitButton>Remove wrong evidence</DangerSubmitButton>
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
          placeholder={
            result.expectedResult === "error"
              ? "No WTID expected"
              : "26K5L36X7"
          }
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
        placeholder="For expected-error scenarios, record the API error."
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
   UI
========================================================= */

function Metric({
  label,
  value,
  helper,
  danger = false,
}: {
  label: string;
  value: string | number;
  helper: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-[1.5rem] border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-black/45">{label}</p>
      <p
        className={`mt-3 text-3xl font-black tracking-tight ${
          danger ? "text-red-600" : "text-black"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-black/35">{helper}</p>
    </div>
  );
}

function ScannerStat({
  label,
  value,
  helper,
  danger = false,
}: {
  label: string;
  value: string | number;
  helper: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-black/[0.025] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-black ${danger ? "text-red-600" : "text-black"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-black/45">{helper}</p>
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
      className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
        active
          ? "border-black bg-black text-white"
          : "border-black/10 bg-white text-black/60 hover:border-red-300 hover:text-red-600"
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
    <div className="rounded-2xl border border-black/10 bg-black/[0.025] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-bold text-black">
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
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-black/40">
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
        className="mt-2 min-h-[3rem] w-full rounded-2xl border border-black/15 bg-white px-4 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-red-500"
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
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-black/40">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue ?? "not_started"}
        className="mt-2 min-h-[3rem] w-full rounded-2xl border border-black/15 bg-white px-4 text-sm text-black outline-none transition focus:border-red-500"
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
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-black/40">
        {label}
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={3}
        className="mt-2 w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-red-500"
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
      className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Working..." : children}
    </button>
  );
}

function MiniSubmitButton({
  children,
  primary = false,
}: {
  children: React.ReactNode;
  primary?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-full border px-3 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
          : "border-black/10 bg-white text-black/65 hover:border-red-300 hover:text-red-600"
      }`}
    >
      {pending ? "Working..." : children}
    </button>
  );
}

function DangerSubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:opacity-50"
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
      className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
        compact ? "max-w-[15rem] text-xs" : ""
      } ${
        state.ok
          ? "border-black bg-black text-white"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {state.ok ? "✓" : "⚠"} {state.message}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const danger =
    status === "needs_more_info" ||
    status === "unable_to_run" ||
    status === "failed";

  const confirmed = status === "confirmed_by_defra";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
        danger
          ? "border-red-200 bg-red-50 text-red-700"
          : confirmed
            ? "border-black bg-black text-white"
            : "border-black/10 bg-white text-black/60"
      }`}
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
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
        confidence === "high"
          ? "border-black bg-black text-white"
          : "border-black/10 bg-white text-black/60"
      }`}
    >
      {confidence} confidence
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black/55">
      {children}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-black/[0.025] p-8">
      <p className="text-sm font-black text-black">No PAT scenarios found.</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
        Use “Seed / refresh scenarios” to create the DEFRA PAT tracker rows.
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
      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-black text-black/65 transition hover:border-red-300 hover:text-red-600"
    >
      {copied ? "Copied ✓" : "Copy table"}
    </button>
  );
}

/* =========================================================
   REFRESH + HELPERS
========================================================= */

function useRefreshAfterAction(state: PatActionState) {
  const router = useRouter();

  useEffect(() => {
    if (!state.timestamp || !state.ok) return;

    const timeout = window.setTimeout(() => {
      router.refresh();
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [state.timestamp, state.ok, router]);
}

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
      const needsReview = Boolean(
        result.evidenceValidation && !result.evidenceValidation.valid,
      );

      const reviewText = needsReview
        ? `CHECK EVIDENCE: ${
            result.evidenceValidation?.warnings.join(" ") ??
            "Attached evidence needs review."
          }`
        : null;

      const wtid = needsReview
        ? `CHECK EVIDENCE - ${
            result.wasteTrackingId ??
            result.errorMessage ??
            result.dwtSubmissionId ??
            "attached record"
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
        reviewText,
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
        result.ewcCodes ||
        result.evidenceSummary?.ewcCodes.join(", ") ||
        "—"
      } | ${details || "—"}`;
    })
    .join("\n");

  return `${header}\n${divider}\n${body}`;
}

function buildEmailEvidenceSummary(summary: EvidenceSummary) {
  const parts = [
    `${summary.wasteItemCount} waste item${
      summary.wasteItemCount === 1 ? "" : "s"
    }`,
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

  return (
    requirements[scenarioId] ??
    "Run a DWT submission that satisfies this DEFRA PAT scenario."
  );
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

function joinValues(values: string[]) {
  return values.length > 0 ? values.join(", ") : "—";
}
