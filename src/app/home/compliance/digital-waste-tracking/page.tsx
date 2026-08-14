import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  users,
  wasteTrackingOrganisationSettings,
  wasteTrackingReferenceData,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  type Capability,
  type DepartmentType,
  hasOperationalPermissionForOrganisation,
} from "@/modules/auth/core/permissions";

import type { DefraValidationResult } from "@/modules/digital-waste-tracking/types/receiveMovement.types";

import type {
  WasteTrackingEnvironment,
  WasteTrackingReferenceDataType,
} from "@/modules/digital-waste-tracking/types/referenceData.types";

/* =========================================================
   TYPES
========================================================= */

type StatusTone = "muted" | "success" | "warning" | "danger" | "info";

type ParsedResponseSnapshot = {
  ok?: boolean;
  statusCode?: number;
  method?: string;
  endpoint?: string;
  responseBody?: unknown;
  error?: string;
};

type ReferenceDataSummary = {
  type: WasteTrackingReferenceDataType;
  label: string;
  count: number;
  activeCount: number;
  latestSyncedAt: Date | null;
};

/* =========================================================
   HELPERS
========================================================= */

function formatDate(value: Date | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatReferenceDataType(type: WasteTrackingReferenceDataType) {
  if (type === "ewc_codes") return "EWC codes";
  if (type === "hazardous_property_codes") return "Hazardous properties";
  if (type === "disposal_or_recovery_codes") return "Disposal / recovery";
  if (type === "container_types") return "Container types";
  if (type === "pop_names") return "POP names";

  return type;
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

function getDashboardHealth(params: {
  isEnabled: boolean;
  hasApiCode: boolean;
  referenceDataCount: number;
  failedCount: number;
}) {
  if (!params.isEnabled) {
    return {
      label: "Not enabled",
      tone: "warning" as StatusTone,
      message:
        "Digital Waste Tracking settings exist, but submissions are not enabled for this organisation.",
    };
  }

  if (!params.hasApiCode) {
    return {
      label: "Setup required",
      tone: "danger" as StatusTone,
      message:
        "The organisation is missing its Waste Tracking Service API code.",
    };
  }

  if (params.referenceDataCount === 0) {
    return {
      label: "Reference data missing",
      tone: "warning" as StatusTone,
      message:
        "No synced reference data was found for the selected environment.",
    };
  }

  if (params.failedCount > 0) {
    return {
      label: "Needs review",
      tone: "warning" as StatusTone,
      message:
        "Some receive movement submissions were rejected or failed and need review.",
    };
  }

  return {
    label: "Operational",
    tone: "success" as StatusTone,
    message:
      "Digital Waste Tracking appears ready for receive movement submissions.",
  };
}

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
  tone = "muted",
}: {
  label: string;
  value: number | string;
  helper?: string;
  tone?: StatusTone;
}) {
  const accentClasses: Record<StatusTone, string> = {
    muted: "text-black",
    success: "text-emerald-700",
    warning: "text-orange-700",
    danger: "text-red-700",
    info: "text-blue-700",
  };

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-black/40">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${accentClasses[tone]}`}>
        {value}
      </p>
      {helper && <p className="mt-2 text-xs leading-5 text-black/40">{helper}</p>}
    </div>
  );
}

function ValidationPreview({
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
        {items.slice(0, 4).map((item, index) => (
          <li key={`${item.key}-${index}`}>
            <span className="font-semibold">{item.key}</span>: {item.message}
          </li>
        ))}
      </ul>

      {items.length > 4 && (
        <p className="mt-3 text-xs font-medium opacity-70">
          +{items.length - 4} more
        </p>
      )}
    </div>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function DigitalWasteTrackingDashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  });

  if (!currentUser?.organisationId || !currentUser.organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const capabilities =
    (currentUser.organisation.capabilities as Capability[] | null) ?? [];

  const departmentType =
    (currentUser.department?.type as DepartmentType | undefined) ?? null;

  const canViewDwt = hasOperationalPermissionForOrganisation({
    capabilities,
    departmentType,
    permission: "dwt:view",
    operatingMode: currentUser.organisation.operatingMode,
  });

  const canViewCompliance = hasOperationalPermissionForOrganisation({
    capabilities,
    departmentType,
    permission: "compliance:view",
    operatingMode: currentUser.organisation.operatingMode,
  });

  const canViewReferenceData = hasOperationalPermissionForOrganisation({
    capabilities,
    departmentType,
    permission: "dwt:reference_data:view",
    operatingMode: currentUser.organisation.operatingMode,
  });

  const canSyncReferenceData = hasOperationalPermissionForOrganisation({
    capabilities,
    departmentType,
    permission: "dwt:reference_data:sync",
    operatingMode: currentUser.organisation.operatingMode,
  });

  if (!canViewDwt && !canViewCompliance) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-[17vh] text-black">
        <section className="rounded-3xl border border-black/10 bg-white p-10 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
            Digital Waste Tracking
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-black">
            Access unavailable
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-black/55">
            Your current workspace does not currently have permission to view
            the Digital Waste Tracking compliance dashboard.
          </p>
        </section>
      </main>
    );
  }

  const organisationSettings =
    await database.query.wasteTrackingOrganisationSettings.findFirst({
      where: eq(
        wasteTrackingOrganisationSettings.organisationId,
        currentUser.organisationId,
      ),
    });

  const environment =
    (organisationSettings?.environment as WasteTrackingEnvironment | null) ??
    "test";

  const submissions =
    await database.query.wasteTrackingSubmissions.findMany({
      where: eq(
        wasteTrackingSubmissions.organisationId,
        currentUser.organisationId,
      ),
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
        submittedByUser: true,
      },
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
      limit: 100,
    });

  const referenceDataRows =
    await database.query.wasteTrackingReferenceData.findMany({
      where: eq(wasteTrackingReferenceData.environment, environment),
      orderBy: [desc(wasteTrackingReferenceData.syncedAt)],
    });

  const totalSubmissions = submissions.length;

  const acceptedCount = submissions.filter(
    (submission) => submission.status === "accepted",
  ).length;

  const warningCount = submissions.filter(
    (submission) => submission.status === "accepted_with_warnings",
  ).length;

  const rejectedCount = submissions.filter(
    (submission) => submission.status === "rejected",
  ).length;

  const failedCount = submissions.filter(
    (submission) => submission.status === "failed",
  ).length;

  const submittedCount = submissions.filter(
    (submission) => submission.status === "submitted",
  ).length;

  const rejectedOrFailedCount = rejectedCount + failedCount;

  const submissionsWithTrackingId = submissions.filter(
    (submission) => submission.wasteTrackingId,
  ).length;

  const latestSubmission = submissions[0] ?? null;

  const recentProblemSubmissions = submissions
    .filter((submission) =>
      ["accepted_with_warnings", "rejected", "failed"].includes(
        submission.status,
      ),
    )
    .slice(0, 5);

  const latestReferenceSync =
    referenceDataRows
      .map((row) => row.syncedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const referenceTypes: WasteTrackingReferenceDataType[] = [
    "ewc_codes",
    "hazardous_property_codes",
    "disposal_or_recovery_codes",
    "container_types",
    "pop_names",
  ];

  const referenceDataSummary: ReferenceDataSummary[] = referenceTypes.map(
    (type) => {
      const rows = referenceDataRows.filter((row) => row.type === type);
      const activeRows = rows.filter((row) => row.isActive);
      const latestSyncedAt =
        rows
          .map((row) => row.syncedAt)
          .filter((value): value is Date => Boolean(value))
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      return {
        type,
        label: formatReferenceDataType(type),
        count: rows.length,
        activeCount: activeRows.length,
        latestSyncedAt,
      };
    },
  );

  const dashboardHealth = getDashboardHealth({
    isEnabled: Boolean(organisationSettings?.isEnabled),
    hasApiCode: Boolean(organisationSettings?.apiCode),
    referenceDataCount: referenceDataRows.length,
    failedCount: rejectedOrFailedCount,
  });

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-[17vh] text-black">
      {/* ================= HEADER ================= */}
      <section className="rounded-[2rem] bg-black p-8 text-white shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
          Compliance
        </p>

        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-tight">
                Digital Waste Tracking
              </h1>

              <StatusPill
                label={dashboardHealth.label}
                tone={dashboardHealth.tone}
              />
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Compliance overview for Waste Tracking Service receive movements,
              reference data, validation outcomes and issued waste tracking IDs.
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
              href="/home/receiving/submissions"
              className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Submission log
            </Link>
          </div>
        </div>
      </section>

      {/* ================= HEALTH NOTICE ================= */}
      <section
        className={`mt-8 rounded-3xl border p-6 ${
          dashboardHealth.tone === "danger"
            ? "border-red-200 bg-red-50 text-red-800"
            : dashboardHealth.tone === "warning"
              ? "border-orange-200 bg-orange-50 text-orange-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        <p className="text-sm font-semibold">{dashboardHealth.label}</p>
        <p className="mt-2 max-w-4xl text-sm leading-6 opacity-80">
          {dashboardHealth.message}
        </p>
      </section>

      {/* ================= METRICS ================= */}
      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Total submissions"
          value={totalSubmissions}
          helper="Latest 100 organisation records"
          tone="info"
        />

        <MetricCard
          label="Accepted"
          value={acceptedCount}
          helper={`${submissionsWithTrackingId} with tracking IDs`}
          tone="success"
        />

        <MetricCard
          label="Warnings"
          value={warningCount}
          helper="Accepted but needs review"
          tone="warning"
        />

        <MetricCard
          label="Rejected / failed"
          value={rejectedOrFailedCount}
          helper={`${rejectedCount} rejected · ${failedCount} failed`}
          tone={rejectedOrFailedCount > 0 ? "danger" : "muted"}
        />
      </section>

      {/* ================= SETTINGS + REFERENCE DATA ================= */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                Organisation Settings
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                Waste Tracking setup
              </h2>
            </div>

            <StatusPill
              label={organisationSettings?.isEnabled ? "Enabled" : "Disabled"}
              tone={organisationSettings?.isEnabled ? "success" : "warning"}
            />
          </div>

          <div className="mt-6 space-y-4 text-sm text-black/55">
            <div className="rounded-3xl border border-black/10 bg-[#f7f3ed] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/35">
                Environment
              </p>
              <p className="mt-2 text-lg font-semibold capitalize text-black">
                {environment}
              </p>
            </div>

            <div className="rounded-3xl border border-black/10 bg-[#f7f3ed] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/35">
                Receiver API code
              </p>
              <p className="mt-2 break-all text-sm font-semibold text-black">
                {organisationSettings?.apiCode ?? "Not configured"}
              </p>
            </div>

            <div className="rounded-3xl border border-black/10 bg-[#f7f3ed] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/35">
                Last reference sync
              </p>
              <p className="mt-2 text-sm font-semibold text-black">
                {formatDate(latestReferenceSync)}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/home/settings/organisation"
              className="inline-flex rounded-full border border-black/10 bg-[#f7f3ed] px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
            >
              Organisation settings
            </Link>

            {canSyncReferenceData && (
              <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-5 py-3 text-sm font-semibold text-orange-700">
                Sync action coming next
              </span>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-black/10 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                Reference Data
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                Synced Defra lookup data
              </h2>
            </div>

            <StatusPill
              label={`${referenceDataRows.length} records`}
              tone={referenceDataRows.length > 0 ? "success" : "warning"}
            />
          </div>

          {!canViewReferenceData ? (
            <div className="mt-6 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6">
              <p className="text-sm font-semibold text-black">
                Reference data is restricted
              </p>
              <p className="mt-2 text-sm leading-6 text-black/50">
                Your current workspace can view the DWT dashboard but does not
                have permission to view reference data details.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {referenceDataSummary.map((summary) => (
                <div
                  key={summary.type}
                  className="flex flex-col gap-3 rounded-3xl border border-black/10 bg-[#f7f3ed] p-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-black">
                      {summary.label}
                    </p>
                    <p className="mt-1 text-sm text-black/45">
                      Last synced: {formatDate(summary.latestSyncedAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <StatusPill
                      label={`${summary.activeCount} active`}
                      tone={summary.activeCount > 0 ? "success" : "warning"}
                    />
                    <StatusPill
                      label={`${summary.count} total`}
                      tone="muted"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ================= SUBMISSION ACTIVITY ================= */}
      <section className="mt-8 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-black/10 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
              Submission Activity
            </p>
            <h2 className="mt-2 text-xl font-semibold text-black">
              Recent receive movement records
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusPill label={`${submittedCount} submitted`} tone="info" />
            <StatusPill
              label={`${recentProblemSubmissions.length} to review`}
              tone={recentProblemSubmissions.length > 0 ? "warning" : "muted"}
            />
          </div>
        </div>

        {submissions.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-black/15 bg-[#f7f3ed] p-8">
            <p className="text-sm font-semibold text-black">
              No DWT submissions yet.
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
              When receive movements are submitted from the intake workflow,
              they will appear here for compliance review.
            </p>

            <Link
              href="/home/receiving/intake"
              className="mt-5 inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Open intake queue →
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {submissions.slice(0, 8).map((submission) => {
              const warnings = parseValidationResults(
                submission.validationWarnings,
              );

              const errors = parseValidationResults(
                submission.validationErrors,
              );

              const responseSnapshot =
                parseJson<ParsedResponseSnapshot>(
                  submission.responseSnapshot,
                );

              const listingName =
                submission.listing?.name ??
                submission.assignment?.listing?.name ??
                "Receive movement";

              const assignmentId =
                submission.assignmentId ?? submission.assignment?.id;

              return (
                <article
                  key={submission.id}
                  className="rounded-[1.75rem] border border-black/10 bg-[#f7f3ed] p-5"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          label={formatStatus(submission.status)}
                          tone={getStatusTone(submission.status)}
                        />

                        <StatusPill label={submission.method} tone="muted" />

                        {submission.wasteTrackingId && (
                          <StatusPill
                            label={`Tracking ID: ${submission.wasteTrackingId}`}
                            tone="info"
                          />
                        )}
                      </div>

                      <h3 className="mt-3 text-lg font-semibold text-black">
                        {listingName}
                      </h3>

                      <div className="mt-4 grid gap-2 text-sm text-black/55 md:grid-cols-2">
                        <p>
                          <span className="font-medium text-black/70">
                            Assignment:
                          </span>{" "}
                          {assignmentId}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Submitted:
                          </span>{" "}
                          {formatDate(submission.submittedAt)}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Submitted by:
                          </span>{" "}
                          {submission.submittedByUser?.name ?? "Unknown user"}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            HTTP status:
                          </span>{" "}
                          {responseSnapshot?.statusCode ?? "Not recorded"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                      <Link
                        href="/home/receiving/submissions"
                        className="inline-flex justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                      >
                        View log →
                      </Link>

                      <Link
                        href={`/home/receiving/intake/${assignmentId}`}
                        className="inline-flex justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
                      >
                        Open intake
                      </Link>
                    </div>
                  </div>

                  {(warnings.length > 0 || errors.length > 0) && (
                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <ValidationPreview
                        title="Warnings"
                        items={warnings}
                        tone="warning"
                      />

                      <ValidationPreview
                        title="Errors"
                        items={errors}
                        tone="danger"
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ================= REVIEW QUEUE ================= */}
      {recentProblemSubmissions.length > 0 && (
        <section className="mt-8 rounded-[2rem] border border-orange-200 bg-orange-50 p-6 text-orange-900 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em]">
            Review Queue
          </p>

          <h2 className="mt-2 text-xl font-semibold">
            Submissions requiring compliance attention
          </h2>

          <div className="mt-6 space-y-3">
            {recentProblemSubmissions.map((submission) => (
              <div
                key={submission.id}
                className="flex flex-col gap-3 rounded-3xl border border-orange-200 bg-white/60 p-5 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold">
                    {submission.listing?.name ??
                      submission.assignment?.listing?.name ??
                      "Receive movement"}
                  </p>
                  <p className="mt-1 text-sm opacity-75">
                    {formatStatus(submission.status)} ·{" "}
                    {formatDate(submission.submittedAt)}
                  </p>
                </div>

                <Link
                  href={`/home/receiving/intake/${submission.assignmentId}`}
                  className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                >
                  Review intake →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ================= LATEST TRACKING ID ================= */}
      {latestSubmission?.wasteTrackingId && (
        <section className="mt-8 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
            Latest Tracking ID
          </p>

          <h2 className="mt-3 break-all text-2xl font-semibold text-black">
            {latestSubmission.wasteTrackingId}
          </h2>

          <p className="mt-3 text-sm leading-6 text-black/50">
            Issued from the latest accepted receive movement submission.
          </p>
        </section>
      )}
    </main>
  );
}