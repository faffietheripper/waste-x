import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, wasteTrackingSubmissions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  type Capability,
  type DepartmentType,
  hasOperationalPermissionForOrganisation,
} from "@/modules/auth/core/permissions";

import type { DefraValidationResult } from "@/modules/digital-waste-tracking/types/receiveMovement.types";
import { resolveSiteFilterForOrganisation } from "@/modules/sites/data-access/resolveSiteFilterForOrganisation";

/* =========================================================
   TYPES
========================================================= */

type PageProps = {
  searchParams?: {
    siteId?: string;
  };
};

type StatusTone = "muted" | "success" | "warning" | "danger" | "info";

type ParsedResponseSnapshot = {
  ok?: boolean;
  statusCode?: number;
  method?: string;
  endpoint?: string;
  responseBody?: unknown;
  error?: string;
};

type SubmissionAttemptForDisplay = {
  id: string;
  status: string;
  method: "POST" | "PUT" | null;
  endpoint: string | null;
  wasteTrackingId: string | null;
  submittedAt: Date | null;
  lastAttemptedAt: Date | null;
  responseSnapshot: string | null;
  validationWarnings: string | null;
  validationErrors: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseValidationResults(
  value: string | null | undefined,
): DefraValidationResult[] {
  const parsed = parseJson<DefraValidationResult[]>(value);

  if (!Array.isArray(parsed)) return [];

  return parsed;
}

function getStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return "muted";

  if (status === "accepted") return "success";
  if (status === "accepted_with_warnings") return "warning";
  if (status === "rejected" || status === "failed") return "danger";
  if (status === "submitted") return "info";

  return "muted";
}

function getStatusDescription(status: string | null | undefined) {
  if (status === "accepted") {
    return "The latest receive movement attempt was accepted by the Waste Tracking Service.";
  }

  if (status === "accepted_with_warnings") {
    return "The latest receive movement attempt was accepted, but warnings were returned.";
  }

  if (status === "rejected") {
    return "The latest receive movement attempt was rejected. Previous attempts are kept in the audit history.";
  }

  if (status === "failed") {
    return "The latest receive movement attempt failed before it could be completed.";
  }

  if (status === "submitted") {
    return "Waste X created a submission attempt and tried to send it.";
  }

  return "Submission status is unknown.";
}

function getGroupKey(submission: {
  assignmentId: string | null;
  listingId: string | number | null;
  wasteTrackingId: string | null;
  id: string;
}) {
  if (submission.assignmentId) {
    return `assignment:${submission.assignmentId}`;
  }

  if (submission.listingId) {
    return `listing:${submission.listingId}`;
  }

  if (submission.wasteTrackingId) {
    return `tracking:${submission.wasteTrackingId}`;
  }

  return `submission:${submission.id}`;
}

function countRejectedOrFailedAttempts(
  attempts: SubmissionAttemptForDisplay[],
) {
  return attempts.filter((attempt) =>
    ["rejected", "failed"].includes(attempt.status),
  ).length;
}

function countWarningAttempts(attempts: SubmissionAttemptForDisplay[]) {
  return attempts.filter(
    (attempt) => attempt.status === "accepted_with_warnings",
  ).length;
}

function getHttpStatus(submission: {
  responseSnapshot: string | null;
}): number | string {
  const snapshot = parseJson<ParsedResponseSnapshot>(
    submission.responseSnapshot,
  );

  return snapshot?.statusCode ?? "Not recorded";
}

/* =========================================================
   UI HELPERS
========================================================= */

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  const classes: Record<StatusTone, string> = {
    muted: "border-black/10 bg-black/5 text-black/45",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-orange-200 bg-orange-50 text-orange-700",
    danger: "border-red-200 bg-red-50 text-red-700",
    info: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${classes[tone]}`}
    >
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper?: string;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-black/40">{label}</p>

      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>

      {helper && (
        <p className="mt-2 text-xs text-black/40">
          {helper}
        </p>
      )}
    </div>
  );
}

function ValidationList({
  title,
  items,
  tone,
}: {
  title: string;
  items: DefraValidationResult[];
  tone: "warning" | "danger";
}) {
  if (items.length === 0) return null;

  const classes =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-orange-200 bg-orange-50 text-orange-800";

  return (
    <div className={`rounded-3xl border p-5 ${classes}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em]">
        {title}
      </p>

      <ul className="mt-3 space-y-2 text-sm leading-6">
        {items.map((item, index) => (
          <li key={`${item.key}-${index}`}>
            <span className="font-semibold">
              {item.key}
            </span>
            : {item.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LatestIssueDetails({
  warnings,
  errors,
}: {
  warnings: DefraValidationResult[];
  errors: DefraValidationResult[];
}) {
  if (warnings.length === 0 && errors.length === 0) {
    return null;
  }

  return (
    <details className="mt-5 rounded-3xl border border-black/10 bg-white/70 p-5">
      <summary className="cursor-pointer text-sm font-semibold text-black">
        View latest issues{" "}
        <span className="text-black/45">
          ({errors.length} error
          {errors.length === 1 ? "" : "s"},{" "}
          {warnings.length} warning
          {warnings.length === 1 ? "" : "s"})
        </span>
      </summary>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ValidationList
          title="Warnings"
          items={warnings}
          tone="warning"
        />

        <ValidationList
          title="Errors"
          items={errors}
          tone="danger"
        />
      </div>
    </details>
  );
}

function AttemptHistory({
  attempts,
}: {
  attempts: SubmissionAttemptForDisplay[];
}) {
  if (attempts.length <= 1) {
    return null;
  }

  const previousAttempts = attempts.slice(1);

  const failedCount =
    countRejectedOrFailedAttempts(previousAttempts);

  const warningCount =
    countWarningAttempts(previousAttempts);

  return (
    <details className="mt-5 rounded-3xl border border-black/10 bg-white/60 p-5">
      <summary className="cursor-pointer text-sm font-semibold text-black">
        Previous attempts hidden{" "}
        <span className="text-black/45">
          ({previousAttempts.length} previous attempt
          {previousAttempts.length === 1 ? "" : "s"}
          {failedCount > 0
            ? `, ${failedCount} failed/rejected`
            : ""}
          {warningCount > 0
            ? `, ${warningCount} with warnings`
            : ""}
          )
        </span>
      </summary>

      <div className="mt-5 overflow-hidden rounded-2xl border border-black/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
                Status
              </th>

              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
                Method
              </th>

              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
                HTTP
              </th>

              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
                Attempted
              </th>

              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
                Issues
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-black/10 bg-[#f7f3ed]">
            {previousAttempts.map((attempt) => {
              const warnings =
                parseValidationResults(
                  attempt.validationWarnings,
                );

              const errors =
                parseValidationResults(
                  attempt.validationErrors,
                );

              return (
                <tr key={attempt.id}>
                  <td className="px-4 py-3">
                    <StatusPill
                      label={formatStatus(attempt.status)}
                      tone={getStatusTone(attempt.status)}
                    />
                  </td>

                  <td className="px-4 py-3 text-black/55">
                    {attempt.method ?? "Not recorded"}
                  </td>

                  <td className="px-4 py-3 text-black/55">
                    {getHttpStatus(attempt)}
                  </td>

                  <td className="px-4 py-3 text-black/55">
                    {formatDate(attempt.lastAttemptedAt)}
                  </td>

                  <td className="px-4 py-3 text-black/55">
                    {errors.length} error
                    {errors.length === 1 ? "" : "s"},{" "}
                    {warnings.length} warning
                    {warnings.length === 1 ? "" : "s"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function ReceivingSubmissionsPage({
  searchParams,
}: PageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser =
    await database.query.users.findFirst({
      where: eq(users.id, session.user.id),

      with: {
        organisation: true,
        department: true,
      },
    });

  if (
    !currentUser?.organisationId ||
    !currentUser.organisation
  ) {
    redirect(
      "/home/settings/organisation?reason=no-organisation",
    );
  }

  const currentOrganisation =
    currentUser.organisation;

  const currentDepartment =
    currentUser.department ?? null;

  const organisationId =
    currentUser.organisationId;

  /* =========================================================
     SITE FILTER
  ========================================================= */

  const siteFilter =
    await resolveSiteFilterForOrganisation({
      organisationId,
      requestedSiteId: searchParams?.siteId,
      createDefaultIfMissing: true,
    });

  const submissionsWhere =
    siteFilter.selectedSiteId
      ? and(
          eq(
            wasteTrackingSubmissions.organisationId,
            organisationId,
          ),
          eq(
            wasteTrackingSubmissions.siteId,
            siteFilter.selectedSiteId,
          ),
        )
      : eq(
          wasteTrackingSubmissions.organisationId,
          organisationId,
        );

  /* =========================================================
     ACCESS
  ========================================================= */

  const capabilities =
    (currentOrganisation.capabilities as Capability[] | null) ??
    [];

  const departmentType =
    (currentDepartment?.type as
      | DepartmentType
      | undefined) ?? null;

  const canViewReceiving =
    hasOperationalPermissionForOrganisation({
      capabilities,
      departmentType,
      permission: "receiving:view",
      operatingMode:
        currentOrganisation.operatingMode,
    });

  const canViewDwt =
    hasOperationalPermissionForOrganisation({
      capabilities,
      departmentType,
      permission: "dwt:view",
      operatingMode:
        currentOrganisation.operatingMode,
    });

  const canSubmitDwt =
    hasOperationalPermissionForOrganisation({
      capabilities,
      departmentType,
      permission:
        "dwt:submit_receive_movement",
      operatingMode:
        currentOrganisation.operatingMode,
    });

  if (
    !canViewReceiving &&
    !canViewDwt &&
    !canSubmitDwt
  ) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pb-10 pl-[22vw] pr-8 pt-[calc(13vh+2rem)] text-black">
        <section className="rounded-3xl border border-black/10 bg-white p-10 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
            DWT Submissions
          </p>

          <h1 className="mt-3 text-3xl font-semibold text-black">
            Access unavailable
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-black/55">
            Your current workspace does not currently have
            permission to view Digital Waste Tracking
            submissions.
          </p>
        </section>
      </main>
    );
  }

  /* =========================================================
     LOAD SUBMISSIONS
  ========================================================= */

  const submissions =
    await database.query.wasteTrackingSubmissions.findMany({
      where: submissionsWhere,

      with: {
        assignment: {
          with: {
            listing: true,
            organisation: true,
            carrierOrganisation: true,
            managerOrganisation: true,
            assignedByOrganisation: true,
          },
        },

        listing: true,
        receipt: true,
        submittedByUser: true,
      },

      orderBy: [
        desc(wasteTrackingSubmissions.createdAt),
      ],

      limit: 100,
    });

  type SubmissionRecord =
    (typeof submissions)[number];

  /* =========================================================
     GROUP ATTEMPTS
  ========================================================= */

  const groupedSubmissions =
    new Map<string, SubmissionRecord[]>();

  for (const submission of submissions) {
    const key = getGroupKey({
      assignmentId: submission.assignmentId,
      listingId: submission.listingId,
      wasteTrackingId:
        submission.wasteTrackingId,
      id: submission.id,
    });

    const existing =
      groupedSubmissions.get(key);

    if (existing) {
      existing.push(submission);
    } else {
      groupedSubmissions.set(key, [
        submission,
      ]);
    }
  }

  const submissionGroups: {
    key: string;
    latest: SubmissionRecord;
    attempts: SubmissionRecord[];
    previousAttempts: SubmissionRecord[];
  }[] = [];

  groupedSubmissions.forEach(
    (attempts, key) => {
      const latest = attempts[0];

      if (!latest) return;

      submissionGroups.push({
        key,
        latest,
        attempts,
        previousAttempts: attempts.slice(1),
      });
    },
  );

  /* =========================================================
     METRICS
  ========================================================= */

  const movementCount =
    submissionGroups.length;

  const attemptCount =
    submissions.length;

  const acceptedCount =
    submissionGroups.filter(
      (group) =>
        group.latest.status === "accepted",
    ).length;

  const warningCount =
    submissionGroups.filter(
      (group) =>
        group.latest.status ===
        "accepted_with_warnings",
    ).length;

  const needsAttentionCount =
    submissionGroups.filter((group) =>
      ["rejected", "failed"].includes(
        group.latest.status,
      ),
    ).length;

  const latestGroup =
    submissionGroups[0] ?? null;

  /* =========================================================
     PAGE
  ========================================================= */

  return (
    <main className="min-h-screen bg-[#f7f3ed] pb-24 pl-[22vw] pr-8 pt-[calc(13vh+2rem)] text-black">
      <div className="mx-auto max-w-7xl space-y-8">

        {/* ===================================================
            HEADER
        =================================================== */}

        <section className="rounded-[2rem] bg-black p-8 text-white shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
            Receiving
          </p>

          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">
                DWT Submissions
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                One card is shown per assignment or receive
                movement. Rejected retries are kept in the
                attempt history so the page stays clear while
                still preserving the audit trail.
              </p>

              <p className="mt-4 inline-flex rounded-full border border-orange-400/20 bg-orange-500/10 px-4 py-2 text-xs font-semibold text-orange-300">
                Showing: {siteFilter.label}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/receiving/intake"
                className="inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Intake queue →
              </Link>

              <Link
                href="/home/compliance/digital-waste-tracking"
                className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Compliance dashboard
              </Link>
            </div>
          </div>
        </section>

        {/* ===================================================
            METRICS
        =================================================== */}

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Tracked movements"
            value={movementCount}
            helper="Grouped by assignment"
          />

          <MetricCard
            label="Accepted"
            value={acceptedCount}
            helper="Latest status accepted"
          />

          <MetricCard
            label="Warnings"
            value={warningCount}
            helper="Latest status has warnings"
          />

          <MetricCard
            label="Needs attention"
            value={needsAttentionCount}
            helper={`${attemptCount} total API attempt${
              attemptCount === 1 ? "" : "s"
            }`}
          />
        </section>

        {/* ===================================================
            LATEST SUMMARY
        =================================================== */}

        {latestGroup && (
          <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                  Latest Movement
                </p>

                <h2 className="mt-2 text-xl font-semibold text-black">
                  {latestGroup.latest.listing?.name ??
                    latestGroup.latest.assignment
                      ?.listing?.name ??
                    "Receive movement"}
                </h2>

                <p className="mt-2 text-sm leading-6 text-black/50">
                  {getStatusDescription(
                    latestGroup.latest.status,
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={formatStatus(
                    latestGroup.latest.status,
                  )}
                  tone={getStatusTone(
                    latestGroup.latest.status,
                  )}
                />

                {latestGroup.latest
                  .wasteTrackingId && (
                  <StatusPill
                    label={`Tracking ID: ${latestGroup.latest.wasteTrackingId}`}
                    tone="info"
                  />
                )}

                <StatusPill
                  label={`${
                    latestGroup.attempts.length
                  } attempt${
                    latestGroup.attempts.length ===
                    1
                      ? ""
                      : "s"
                  }`}
                  tone="muted"
                />
              </div>
            </div>
          </section>
        )}

        {/* ===================================================
            SUBMISSION REGISTER
        =================================================== */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-black/10 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                Submission Register
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                Digital Waste Tracking movements
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
                This view shows the latest result for each
                movement. Older failed or rejected attempts
                are collapsed under each card. Current site
                scope:{" "}
                <span className="font-semibold text-black">
                  {siteFilter.label}
                </span>
                .
              </p>
            </div>
          </div>

          {submissionGroups.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-black/15 bg-[#f7f3ed] p-8">
              <p className="text-sm font-semibold text-black">
                No submissions found for this site view.
              </p>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
                Once a receiving intake is submitted to the
                Waste Tracking Service, the latest result
                will appear here.
              </p>

              <Link
                href="/home/receiving/intake"
                className="mt-5 inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Open intake queue →
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {submissionGroups.map(
                (group) => {
                  const submission =
                    group.latest;

                  const warnings =
                    parseValidationResults(
                      submission.validationWarnings,
                    );

                  const errors =
                    parseValidationResults(
                      submission.validationErrors,
                    );

                  const responseSnapshot =
                    parseJson<ParsedResponseSnapshot>(
                      submission.responseSnapshot,
                    );

                  const listingName =
                    submission.listing?.name ??
                    submission.assignment?.listing
                      ?.name ??
                    "Receive movement";

                  const assignmentId =
                    submission.assignmentId ??
                    submission.assignment?.id;

                  const carrierName =
                    submission.assignment
                      ?.carrierOrganisation
                      ?.teamName ??
                    "Not recorded";

                  const managerName =
                    submission.assignment
                      ?.managerOrganisation
                      ?.teamName ??
                    "Not recorded";

                  const generatorName =
                    submission.assignment
                      ?.assignedByOrganisation
                      ?.teamName ??
                    submission.assignment
                      ?.organisation?.teamName ??
                    "Not recorded";

                  const failedPreviousAttempts =
                    countRejectedOrFailedAttempts(
                      group.previousAttempts,
                    );

                  const hasPreviousAttempts =
                    group.previousAttempts.length >
                    0;

                  return (
                    <article
                      key={group.key}
                      className={`rounded-[1.75rem] border p-5 ${
                        submission.status ===
                        "accepted"
                          ? "border-emerald-200 bg-emerald-50/45"
                          : submission.status ===
                              "accepted_with_warnings"
                            ? "border-orange-200 bg-orange-50/45"
                            : submission.status ===
                                  "rejected" ||
                                submission.status ===
                                  "failed"
                              ? "border-red-200 bg-red-50/40"
                              : "border-black/10 bg-[#f7f3ed]"
                      }`}
                    >
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill
                              label={formatStatus(
                                submission.status,
                              )}
                              tone={getStatusTone(
                                submission.status,
                              )}
                            />

                            <StatusPill
                              label={
                                submission.method ??
                                "Not recorded"
                              }
                              tone="muted"
                            />

                            {submission.wasteTrackingId && (
                              <StatusPill
                                label={`Tracking ID: ${submission.wasteTrackingId}`}
                                tone="info"
                              />
                            )}

                            {hasPreviousAttempts && (
                              <StatusPill
                                label={`${
                                  group.attempts
                                    .length
                                } attempts`}
                                tone="muted"
                              />
                            )}

                            {failedPreviousAttempts >
                              0 &&
                              submission.status ===
                                "accepted" && (
                                <StatusPill
                                  label={`${failedPreviousAttempts} previous failed`}
                                  tone="warning"
                                />
                              )}
                          </div>

                          <h3 className="mt-3 text-lg font-semibold text-black">
                            {listingName}
                          </h3>

                          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
                            {getStatusDescription(
                              submission.status,
                            )}
                          </p>

                          <div className="mt-4 grid gap-2 text-sm text-black/55 md:grid-cols-2">
                            <p>
                              <span className="font-medium text-black/70">
                                Assignment:
                              </span>{" "}
                              {assignmentId ??
                                "Not linked"}
                            </p>

                            <p>
                              <span className="font-medium text-black/70">
                                Listing:
                              </span>{" "}
                              {submission.listingId
                                ? `#${submission.listingId}`
                                : "Not linked"}
                            </p>

                            <p>
                              <span className="font-medium text-black/70">
                                Generator:
                              </span>{" "}
                              {generatorName}
                            </p>

                            <p>
                              <span className="font-medium text-black/70">
                                Carrier:
                              </span>{" "}
                              {carrierName}
                            </p>

                            <p>
                              <span className="font-medium text-black/70">
                                Submitted:
                              </span>{" "}
                              {formatDate(
                                submission.submittedAt,
                              )}
                            </p>

                            <p>
                              <span className="font-medium text-black/70">
                                HTTP status:
                              </span>{" "}
                              {responseSnapshot
                                ?.statusCode ??
                                "Not recorded"}
                            </p>

                            <p>
                              <span className="font-medium text-black/70">
                                Manager:
                              </span>{" "}
                              {managerName}
                            </p>

                            <p>
                              <span className="font-medium text-black/70">
                                Submitted by:
                              </span>{" "}
                              {submission
                                .submittedByUser
                                ?.name ??
                                "Unknown user"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                          {assignmentId && (
                            <>
                              <Link
                                href={`/home/receiving/intake/${assignmentId}`}
                                className="inline-flex justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                              >
                                Open intake →
                              </Link>

                              <Link
                                href={`/home/operations/assignments/${assignmentId}`}
                                className="inline-flex justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
                              >
                                View assignment
                              </Link>
                            </>
                          )}
                        </div>
                      </div>

                      <LatestIssueDetails
                        warnings={warnings}
                        errors={errors}
                      />

                      {responseSnapshot?.error && (
                        <details className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-5 text-red-800">
                          <summary className="cursor-pointer text-sm font-semibold">
                            View request failure
                          </summary>

                          <p className="mt-3 text-sm leading-6">
                            {
                              responseSnapshot.error
                            }
                          </p>
                        </details>
                      )}

                      <AttemptHistory
                        attempts={group.attempts}
                      />
                    </article>
                  );
                },
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}