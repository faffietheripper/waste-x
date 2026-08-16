// src/app/admin/digital-waste-tracking/page.tsx

import Link from "next/link";
import type { ReactNode } from "react";
import { desc } from "drizzle-orm";

import { database } from "@/db/database";
import {
  carrierAssignments,
  incidents,
  organisations,
  users,
  wasteListings,
  wasteReceipts,
  wasteTrackingOrganisationSettings,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

/*
  DWT CONTROL ROOM
  ================
  The existing platform DWT queries, readiness checks, movement grouping,
  submission inspection and audit links are retained.

  This rebuild changes the admin presentation to black / red / white and adds
  a direct PAT Tracker link. It does NOT submit, edit or mutate DWT records.
*/

export default async function AdminDigitalWasteTrackingPage() {
  await requirePlatformAdmin();

  const [
    submissions,
    settings,
    organisationRows,
    userRows,
    listingRows,
    assignmentRows,
    receiptRows,
    incidentRows,
  ] = await Promise.all([
    database
      .select()
      .from(wasteTrackingSubmissions)
      .orderBy(desc(wasteTrackingSubmissions.lastAttemptedAt)),

    database.select().from(wasteTrackingOrganisationSettings),
    database.select().from(organisations),
    database.select().from(users),
    database.select().from(wasteListings),
    database.select().from(carrierAssignments),
    database.select().from(wasteReceipts),
    database.select().from(incidents),
  ]);

  const organisationById = new Map(
    organisationRows.map((organisation) => [
      organisation.id,
      organisation,
    ]),
  );

  const userById = new Map(
    userRows.map((user) => [user.id, user]),
  );

  const listingById = new Map(
    listingRows.map((listing) => [String(listing.id), listing]),
  );

  const settingsByOrganisationId = new Map(
    settings.map((setting) => [setting.organisationId, setting]),
  );

  const acceptedStatuses = ["accepted", "accepted_with_warnings"];

  const totalAttempts = submissions.length;

  const acceptedSubmissions = submissions.filter((submission) =>
    acceptedStatuses.includes(submission.status),
  );

  const rejectedOrFailedSubmissions = submissions.filter((submission) =>
    ["rejected", "failed"].includes(submission.status),
  );

  const awaitingFinalStatusSubmissions = submissions.filter((submission) =>
    ["draft", "submitted"].includes(submission.status),
  );

  const acceptedWithWarnings = submissions.filter(
    (submission) => submission.status === "accepted_with_warnings",
  );

  const dwtSuccessRate = calculateRate(
    acceptedSubmissions.length,
    totalAttempts,
  );

  const enabledSettings = settings.filter((setting) => setting.isEnabled);

  const settingsMissingApiCode = settings.filter(
    (setting) =>
      setting.isEnabled && !cleanString(setting.apiCode),
  );

  const latestSubmission = submissions[0] ?? null;

  const latestAcceptedSubmission =
    submissions.find((submission) =>
      acceptedStatuses.includes(submission.status),
    ) ?? null;

  const latestProblemSubmission =
    submissions.find((submission) =>
      ["rejected", "failed"].includes(submission.status),
    ) ?? null;

  const movementGroups = buildMovementGroups(submissions);

  const trackedMovements = movementGroups.length;

  const acceptedMovementGroups = movementGroups.filter((group) =>
    acceptedStatuses.includes(group.latest.status),
  );

  const movementGroupsNeedingAttention = movementGroups.filter(
    (group) =>
      ["rejected", "failed"].includes(group.latest.status),
  );

  const acceptedByAssignmentId = new Set(
    acceptedSubmissions
      .map((submission) => cleanString(submission.assignmentId))
      .filter(isNonEmptyString),
  );

  const acceptedByListingId = new Set(
    acceptedSubmissions
      .map((submission) =>
        submission.listingId === null ||
        submission.listingId === undefined
          ? null
          : String(submission.listingId),
      )
      .filter(isNonEmptyString),
  );

  const unresolvedIncidentRows = incidentRows.filter((incident) =>
    ["open", "under_review"].includes(incident.status),
  );

  const unresolvedIncidentByAssignmentId = new Set(
    unresolvedIncidentRows
      .map((incident) =>
        cleanString(getUnknownField(incident, "assignmentId")),
      )
      .filter(isNonEmptyString),
  );

  const unresolvedIncidentByListingId = new Set(
    unresolvedIncidentRows
      .map((incident) => {
        const listingId = getUnknownField(incident, "listingId");

        return listingId === null || listingId === undefined
          ? null
          : String(listingId);
      })
      .filter(isNonEmptyString),
  );

  const completedAssignmentById = new Set(
    assignmentRows
      .filter(
        (assignment) =>
          assignment.status === "completed" ||
          Boolean(assignment.completedAt),
      )
      .map((assignment) => assignment.id),
  );

  const confirmedReceipts = receiptRows.filter((receipt) =>
    ["confirmed", "submitted"].includes(receipt.status),
  );

  const readyForDwtReceipts = confirmedReceipts
    .filter((receipt) => {
      const assignmentId = cleanString(receipt.assignmentId);

      const listingId =
        receipt.listingId === null ||
        receipt.listingId === undefined
          ? null
          : String(receipt.listingId);

      const assignmentComplete = assignmentId
        ? completedAssignmentById.has(assignmentId)
        : false;

      const listingComplete = listingId
        ? listingById.get(listingId)?.status === "completed"
        : false;

      const alreadySubmitted =
        (assignmentId
          ? acceptedByAssignmentId.has(assignmentId)
          : false) ||
        (listingId ? acceptedByListingId.has(listingId) : false);

      const hasUnresolvedIncident =
        (assignmentId
          ? unresolvedIncidentByAssignmentId.has(assignmentId)
          : false) ||
        (listingId
          ? unresolvedIncidentByListingId.has(listingId)
          : false);

      return (
        (assignmentComplete || listingComplete) &&
        !alreadySubmitted &&
        !hasUnresolvedIncident
      );
    })
    .slice(0, 8);

  const organisationReadiness = organisationRows
    .map((organisation) => {
      const setting = settingsByOrganisationId.get(organisation.id);

      const orgSubmissions = submissions.filter(
        (submission) =>
          submission.organisationId === organisation.id,
      );

      const orgAccepted = orgSubmissions.filter((submission) =>
        acceptedStatuses.includes(submission.status),
      );

      const orgProblems = orgSubmissions.filter((submission) =>
        ["rejected", "failed"].includes(submission.status),
      );

      const hasApiCode = Boolean(cleanString(setting?.apiCode));

      return {
        id: organisation.id,
        name: organisation.teamName ?? "Unnamed organisation",
        status: getUnknownField(
          organisation,
          "status",
        ) as string | null,
        environment: setting?.environment ?? "test",
        enabled: Boolean(setting?.isEnabled),
        hasApiCode,
        submissions: orgSubmissions.length,
        accepted: orgAccepted.length,
        problems: orgProblems.length,
        successRate: calculateRate(
          orgAccepted.length,
          orgSubmissions.length,
        ),
      };
    })
    .sort((first, second) => {
      if (first.enabled !== second.enabled) {
        return first.enabled ? -1 : 1;
      }

      return second.submissions - first.submissions;
    });

  const submissionViews = submissions
    .slice(0, 30)
    .map((submission) => {
      const organisation = organisationById.get(
        submission.organisationId,
      );

      const submittedBy = submission.submittedByUserId
        ? userById.get(submission.submittedByUserId)
        : null;

      const listing =
        submission.listingId === null ||
        submission.listingId === undefined
          ? null
          : listingById.get(String(submission.listingId));

      const payloadSummary = getPayloadSummary(
        submission.payloadSnapshot,
      );

      return {
        id: submission.id,
        status: submission.status,
        method: submission.method,
        endpoint: submission.endpoint,
        wasteTrackingId: submission.wasteTrackingId,
        submissionType: submission.submissionType,
        organisationName:
          organisation?.teamName ?? "Unknown organisation",
        submittedByName:
          submittedBy?.name ??
          submittedBy?.email ??
          "System",
        listingName: listing?.name ?? null,
        listingId: submission.listingId,
        assignmentId: submission.assignmentId,
        submittedAt: submission.submittedAt,
        lastAttemptedAt: submission.lastAttemptedAt,
        statusCode: getResponseStatusCode(
          submission.responseSnapshot,
        ),
        warningsCount: getJsonArrayLength(
          submission.validationWarnings,
        ),
        errorsCount: getJsonArrayLength(
          submission.validationErrors,
        ),
        description: payloadSummary.description,
        ewcCodes: payloadSummary.ewcCodes,
        carrierName: payloadSummary.carrierName,
        receiverName: payloadSummary.receiverName,
        weight: payloadSummary.weight,
      };
    });

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-black text-white shadow-2xl shadow-black/20">
        <div className="border-t-4 border-red-600 p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-red-500">
                Compliance Infrastructure
              </p>

              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Digital Waste Tracking
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Platform-wide DWT control, organisation readiness,
                receive-movement submissions, Waste Tracking IDs and
                failed or rejected API attempts.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/digital-waste-tracking/pat"
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-red-700"
              >
                PAT Tracker
              </Link>

              <Link
                href="/admin/audit/compliance"
                className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition hover:border-red-500 hover:text-red-400"
              >
                Compliance audit
              </Link>

              <Link
                href="/admin/audit/live"
                className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition hover:border-red-500 hover:text-red-400"
              >
                Live activity
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="API attempts"
          value={totalAttempts}
          helper="All DWT submission attempts"
        />
        <Metric
          label="Tracked movements"
          value={trackedMovements}
          helper="Grouped movement records"
        />
        <Metric
          label="Accepted"
          value={acceptedSubmissions.length}
          helper="Including accepted with warnings"
        />
        <Metric
          label="Needs attention"
          value={rejectedOrFailedSubmissions.length}
          helper="Rejected or failed attempts"
          danger={rejectedOrFailedSubmissions.length > 0}
        />
        <Metric
          label="Success rate"
          value={`${dwtSuccessRate}%`}
          helper="Accepted attempts / total attempts"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Panel
          eyebrow="Latest Result"
          title="Latest DWT submission"
          description="Most recent API attempt recorded by Waste X."
        >
          {latestSubmission ? (
            <LatestSubmissionCard
              submission={latestSubmission}
              organisationName={
                organisationById.get(
                  latestSubmission.organisationId,
                )?.teamName ?? "Unknown organisation"
              }
            />
          ) : (
            <EmptyState message="No DWT submissions have been recorded yet." />
          )}
        </Panel>

        <Panel
          eyebrow="Last Accepted"
          title="Latest accepted movement"
          description="Most recent successful DWT response with a tracking ID."
        >
          {latestAcceptedSubmission ? (
            <LatestSubmissionCard
              submission={latestAcceptedSubmission}
              organisationName={
                organisationById.get(
                  latestAcceptedSubmission.organisationId,
                )?.teamName ?? "Unknown organisation"
              }
            />
          ) : (
            <EmptyState message="No accepted DWT movement has been recorded yet." />
          )}
        </Panel>

        <Panel
          eyebrow="Attention"
          title="Latest problem"
          description="Most recent rejected or failed DWT submission."
        >
          {latestProblemSubmission ? (
            <LatestSubmissionCard
              submission={latestProblemSubmission}
              organisationName={
                organisationById.get(
                  latestProblemSubmission.organisationId,
                )?.teamName ?? "Unknown organisation"
              }
            />
          ) : (
            <EmptyState message="No rejected or failed DWT attempts found." />
          )}
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          eyebrow="Organisation Setup"
          title="DWT organisation readiness"
          description="Shows DWT enablement, receiver API code configuration and submission performance."
          actionHref="/admin/organisations"
          actionLabel="View organisations"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <MiniStat
              label="DWT enabled"
              value={enabledSettings.length}
              helper="Organisations switched on"
            />
            <MiniStat
              label="Missing API code"
              value={settingsMissingApiCode.length}
              helper="Enabled with no receiver API code"
              danger={settingsMissingApiCode.length > 0}
            />
            <MiniStat
              label="Configured orgs"
              value={settings.length}
              helper="Organisations with DWT settings"
            />
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-black/10 text-sm">
                <thead className="bg-black text-white">
                  <tr>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>API Code</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead>Success</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>

                <tbody className="divide-y divide-black/10 bg-white">
                  {organisationReadiness
                    .slice(0, 12)
                    .map((organisation) => (
                      <tr
                        key={organisation.id}
                        className="transition hover:bg-red-50/30"
                      >
                        <TableCell>
                          <div>
                            <p className="font-black text-black">
                              {organisation.name}
                            </p>
                            <p className="mt-1 text-xs text-black/35">
                              {organisation.id}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell>
                          <StatusBadge status={organisation.status} />
                        </TableCell>

                        <TableCell>
                          {formatStatus(
                            organisation.environment,
                          )}
                        </TableCell>

                        <TableCell>
                          {organisation.hasApiCode ? (
                            <Pill dark>Stored</Pill>
                          ) : (
                            <Pill danger>Missing</Pill>
                          )}
                        </TableCell>

                        <TableCell>
                          {organisation.submissions}
                        </TableCell>

                        <TableCell>
                          {organisation.successRate}%
                        </TableCell>

                        <TableCell>
                          <Link
                            href={`/admin/organisations/${encodeURIComponent(
                              organisation.id,
                            )}`}
                            className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white transition hover:bg-red-600"
                          >
                            Open
                          </Link>
                        </TableCell>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Ready Queue"
          title="Ready for DWT"
          description="Confirmed receipts that appear ready for DWT but do not yet have an accepted submission."
          actionHref="/home/receiving/intake"
          actionLabel="Receiving queue"
        >
          <div className="space-y-3">
            <MiniStat
              label="Ready receipts"
              value={readyForDwtReceipts.length}
              helper="Top records shown below"
            />
            <MiniStat
              label="Awaiting final status"
              value={awaitingFinalStatusSubmissions.length}
              helper="Draft or submitted records"
            />

            {readyForDwtReceipts.length === 0 ? (
              <EmptyState message="No ready receipts found." />
            ) : (
              <div className="space-y-3">
                {readyForDwtReceipts.map((receipt) => (
                  <ReadyReceiptCard
                    key={receipt.id}
                    receipt={receipt}
                    organisationName={
                      organisationById.get(
                        receipt.organisationId,
                      )?.teamName ?? "Unknown organisation"
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>
      </section>

      <Panel
        eyebrow="Movement Register"
        title="DWT movement groups"
        description="One movement can have multiple attempts. Attempts remain grouped for audit visibility."
        actionHref="/admin/audit/chain"
        actionLabel="Chain of custody"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <MiniStat
            label="Accepted movements"
            value={acceptedMovementGroups.length}
            helper="Latest attempt accepted"
          />
          <MiniStat
            label="Needs attention"
            value={movementGroupsNeedingAttention.length}
            helper="Latest attempt rejected/failed"
            danger={movementGroupsNeedingAttention.length > 0}
          />
          <MiniStat
            label="Accepted with warnings"
            value={acceptedWithWarnings.length}
            helper="Accepted but review warnings"
          />
        </div>

        {movementGroups.length === 0 ? (
          <div className="mt-6">
            <EmptyState message="No DWT movement groups have been recorded yet." />
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {movementGroups.slice(0, 10).map((group) => {
              const submission = group.latest;
              const organisation = organisationById.get(
                submission.organisationId,
              );

              return (
                <div
                  key={group.key}
                  className="rounded-[1.5rem] border border-black/10 bg-black/[0.025] p-5"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={submission.status} />
                        <Pill>
                          {group.attempts.length} attempt
                          {group.attempts.length === 1
                            ? ""
                            : "s"}
                        </Pill>
                        {submission.wasteTrackingId ? (
                          <Pill>
                            ID: {submission.wasteTrackingId}
                          </Pill>
                        ) : null}
                      </div>

                      <h3 className="mt-3 text-sm font-black text-black">
                        {organisation?.teamName ??
                          "Unknown organisation"}
                      </h3>

                      <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
                        {submission.method ?? "—"}{" "}
                        {submission.endpoint ?? "—"} • Latest
                        attempt{" "}
                        {formatDateTime(
                          submission.lastAttemptedAt,
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {submission.listingId ? (
                        <Link
                          href={`/admin/audit/chain/${submission.listingId}`}
                          className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-black/60 transition hover:border-red-300 hover:text-red-600"
                        >
                          Chain
                        </Link>
                      ) : null}

                      <Link
                        href={`/admin/audit/entity?entityId=${encodeURIComponent(
                          group.entityId,
                        )}`}
                        className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-black/60 transition hover:border-red-300 hover:text-red-600"
                      >
                        Audit
                      </Link>
                    </div>
                  </div>

                  {group.attempts.length > 1 ? (
                    <details className="mt-5 rounded-2xl border border-black/10 bg-white p-4">
                      <summary className="cursor-pointer text-sm font-black text-black">
                        Previous attempts hidden
                      </summary>

                      <div className="mt-4 space-y-2">
                        {group.attempts
                          .slice(1)
                          .map((attempt) => (
                            <div
                              key={attempt.id}
                              className="flex flex-col gap-2 rounded-2xl border border-black/10 bg-black/[0.025] px-4 py-3 text-sm md:flex-row md:items-center md:justify-between"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge
                                  status={attempt.status}
                                />
                                <span className="text-black/50">
                                  {attempt.method ?? "—"}{" "}
                                  {attempt.endpoint ?? "—"}
                                </span>
                              </div>

                              <span className="text-black/35">
                                {formatDateTime(
                                  attempt.lastAttemptedAt,
                                )}
                              </span>
                            </div>
                          ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        eyebrow="Submission Register"
        title="Latest DWT API attempts"
        description="Latest individual DWT submissions including status, payload summary and API response code."
      >
        {submissionViews.length === 0 ? (
          <EmptyState message="No DWT submissions found." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="min-w-[1250px] w-full divide-y divide-black/10 text-sm">
                <thead className="bg-black text-white">
                  <tr>
                    <TableHead>Status</TableHead>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Waste</TableHead>
                    <TableHead>Tracking ID</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Warnings</TableHead>
                    <TableHead>Errors</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </tr>
                </thead>

                <tbody className="divide-y divide-black/10 bg-white">
                  {submissionViews.map((submission) => (
                    <tr
                      key={submission.id}
                      className="transition hover:bg-red-50/30"
                    >
                      <TableCell>
                        <StatusBadge
                          status={submission.status}
                        />
                      </TableCell>

                      <TableCell>
                        <div>
                          <p className="font-black text-black">
                            {submission.organisationName}
                          </p>
                          <p className="mt-1 text-xs text-black/35">
                            By {submission.submittedByName}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="max-w-[20rem]">
                          <p className="truncate font-bold text-black">
                            {submission.description ||
                              "No description"}
                          </p>
                          <p className="mt-1 text-xs text-black/35">
                            EWC:{" "}
                            {submission.ewcCodes || "—"} •{" "}
                            {submission.weight || "No weight"}
                          </p>
                          <p className="mt-1 text-xs text-black/35">
                            {submission.carrierName ||
                              "Carrier not recorded"}{" "}
                            →{" "}
                            {submission.receiverName ||
                              "Receiver not recorded"}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="font-bold text-black/70">
                          {submission.wasteTrackingId ?? "—"}
                        </span>
                      </TableCell>

                      <TableCell>
                        {submission.statusCode ?? "—"}
                      </TableCell>

                      <TableCell>
                        {submission.warningsCount}
                      </TableCell>

                      <TableCell>
                        <span
                          className={
                            submission.errorsCount > 0
                              ? "font-black text-red-600"
                              : "text-black/60"
                          }
                        >
                          {submission.errorsCount}
                        </span>
                      </TableCell>

                      <TableCell>
                        {formatDateTime(
                          submission.submittedAt ??
                            submission.lastAttemptedAt,
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          {submission.listingId ? (
                            <Link
                              href={`/admin/audit/chain/${submission.listingId}`}
                              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-black/60 transition hover:border-red-300 hover:text-red-600"
                            >
                              Chain
                            </Link>
                          ) : null}

                          <Link
                            href={`/admin/audit/entity?entityId=${encodeURIComponent(
                              submission.assignmentId ??
                                String(
                                  submission.listingId ??
                                    submission.id,
                                ),
                            )}`}
                            className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white transition hover:bg-red-600"
                          >
                            Audit
                          </Link>
                        </div>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* =========================================================
   COMPONENTS
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
      <p className="mt-2 text-xs leading-5 text-black/35">
        {helper}
      </p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  className = "",
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-[1.75rem] border border-black/10 bg-white p-6 shadow-sm ${className}`}
    >
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow ? (
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-600">
              {eyebrow}
            </p>
          ) : null}

          <h2 className="mt-2 text-lg font-black text-black">
            {title}
          </h2>

          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
              {description}
            </p>
          ) : null}
        </div>

        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-bold text-black/60 transition hover:border-red-300 hover:text-red-600"
          >
            {actionLabel} →
          </Link>
        ) : null}
      </div>

      {children}
    </section>
  );
}

function MiniStat({
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
      <p className="text-sm text-black/45">{label}</p>
      <p
        className={`mt-2 truncate text-xl font-black ${
          danger ? "text-red-600" : "text-black"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-black/35">
        {helper}
      </p>
    </div>
  );
}

function LatestSubmissionCard({
  submission,
  organisationName,
}: {
  submission: {
    id: string;
    status: string;
    method: string | null;
    endpoint: string | null;
    wasteTrackingId: string | null;
    submittedAt: Date | null;
    lastAttemptedAt: Date | null;
    responseSnapshot: string | null;
    validationWarnings: string | null;
    validationErrors: string | null;
  };
  organisationName: string;
}) {
  const statusCode = getResponseStatusCode(
    submission.responseSnapshot,
  );

  return (
    <div className="rounded-[1.5rem] border border-black/10 bg-black/[0.025] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={submission.status} />

        {submission.wasteTrackingId ? (
          <Pill>ID: {submission.wasteTrackingId}</Pill>
        ) : null}
      </div>

      <h3 className="mt-4 text-sm font-black text-black">
        {organisationName}
      </h3>

      <div className="mt-4 space-y-3">
        <InfoRow
          label="Endpoint"
          value={`${submission.method ?? "—"} ${
            submission.endpoint ?? "—"
          }`}
        />
        <InfoRow
          label="HTTP status"
          value={statusCode ? String(statusCode) : "—"}
        />
        <InfoRow
          label="Warnings"
          value={String(
            getJsonArrayLength(submission.validationWarnings),
          )}
        />
        <InfoRow
          label="Errors"
          value={String(
            getJsonArrayLength(submission.validationErrors),
          )}
        />
        <InfoRow
          label="Submitted"
          value={formatDateTime(
            submission.submittedAt ??
              submission.lastAttemptedAt,
          )}
        />
      </div>
    </div>
  );
}

function ReadyReceiptCard({
  receipt,
  organisationName,
}: {
  receipt: {
    id: string;
    organisationId: string;
    assignmentId: string | null;
    listingId: number | null;
    status: string;
    receivedAt: Date | null;
  };
  organisationName: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-black/[0.025] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={receipt.status} />
        <Pill>Ready</Pill>
      </div>

      <p className="mt-3 text-sm font-black text-black">
        {organisationName}
      </p>

      <p className="mt-2 break-all text-xs leading-5 text-black/50">
        Assignment: {receipt.assignmentId ?? "—"}
      </p>

      <p className="mt-1 text-xs leading-5 text-black/50">
        Listing: {receipt.listingId ?? "—"} • Received{" "}
        {formatDateTime(receipt.receivedAt)}
      </p>

      {receipt.assignmentId ? (
        <Link
          href={`/admin/audit/entity?entityId=${encodeURIComponent(
            receipt.assignmentId,
          )}`}
          className="mt-3 inline-flex rounded-full bg-black px-3 py-1.5 text-xs font-black text-white transition hover:bg-red-600"
        >
          Inspect →
        </Link>
      ) : null}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  const positive =
    status === "accepted" ||
    status === "ACTIVE" ||
    status === "active" ||
    status === "confirmed" ||
    status === "submitted";

  const danger =
    status === "rejected" ||
    status === "failed" ||
    status === "REJECTED" ||
    status === "SUSPENDED";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
        danger
          ? "border-red-200 bg-red-50 text-red-700"
          : positive
            ? "border-black bg-black text-white"
            : "border-black/10 bg-white text-black/60"
      }`}
    >
      {formatStatus(status)}
    </span>
  );
}

function Pill({
  children,
  dark = false,
  danger = false,
}: {
  children: ReactNode;
  dark?: boolean;
  danger?: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
        danger
          ? "border-red-200 bg-red-50 text-red-700"
          : dark
            ? "border-black bg-black text-white"
            : "border-black/10 bg-white text-black/55"
      }`}
    >
      {children}
    </span>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
      <p className="text-xs font-medium text-black/35">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-black">
        {value}
      </p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-black/[0.025] p-6">
      <p className="text-sm font-black text-black">{message}</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
        Digital Waste Tracking records will appear here as
        organisations use the existing Waste X DWT workflow.
      </p>
    </div>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-black uppercase tracking-[0.14em] text-white/55">
      {children}
    </th>
  );
}

function TableCell({ children }: { children: ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-4 align-middle text-sm text-black/60">
      {children}
    </td>
  );
}

/* =========================================================
   HELPERS — EXISTING DWT VIEW LOGIC
========================================================= */

type SubmissionRow = typeof wasteTrackingSubmissions.$inferSelect;

function buildMovementGroups(submissions: SubmissionRow[]) {
  const groups = new Map<
    string,
    {
      key: string;
      entityId: string;
      latest: SubmissionRow;
      attempts: SubmissionRow[];
    }
  >();

  for (const submission of submissions) {
    const key = getMovementKey(submission);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        entityId:
          submission.assignmentId ??
          String(
            submission.listingId ??
              submission.wasteTrackingId ??
              submission.id,
          ),
        latest: submission,
        attempts: [submission],
      });

      continue;
    }

    existing.attempts.push(submission);

    const existingTime = getSubmissionTime(existing.latest);
    const currentTime = getSubmissionTime(submission);

    if (currentTime > existingTime) {
      existing.latest = submission;
    }
  }

  return Array.from(groups.values()).sort(
    (first, second) =>
      getSubmissionTime(second.latest) -
      getSubmissionTime(first.latest),
  );
}

function getMovementKey(submission: SubmissionRow) {
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

function getSubmissionTime(submission: SubmissionRow) {
  const value =
    submission.lastAttemptedAt ?? submission.submittedAt;

  return value ? new Date(value).getTime() : 0;
}

function calculateRate(value: number, total: number) {
  if (!total || total <= 0) return 0;

  return Math.round((value / total) * 100);
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getUnknownField(row: unknown, key: string) {
  if (!row || typeof row !== "object") return null;

  return (row as Record<string, unknown>)[key] ?? null;
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

function getJsonArrayLength(value: unknown) {
  const parsed = parseJsonValue(value);

  if (Array.isArray(parsed)) return parsed.length;

  return 0;
}

function getResponseStatusCode(value: unknown) {
  const parsed = parseJsonValue(value);

  if (!isRecord(parsed)) return null;

  const statusCode = parsed.statusCode;

  if (typeof statusCode === "number") return statusCode;
  if (typeof statusCode === "string") return statusCode;

  return null;
}

function getPayloadSummary(value: unknown) {
  const parsed = parseJsonValue(value);

  if (!isRecord(parsed)) {
    return {
      description: null,
      ewcCodes: null,
      carrierName: null,
      receiverName: null,
      weight: null,
    };
  }

  const wasteItems = parsed.wasteItems;

  const firstWasteItem =
    Array.isArray(wasteItems) && isRecord(wasteItems[0])
      ? wasteItems[0]
      : null;

  const ewcCodes = firstWasteItem?.ewcCodes;
  const weight = firstWasteItem?.weight;

  const carrier = isRecord(parsed.carrier)
    ? parsed.carrier
    : null;

  const receiver = isRecord(parsed.receiver)
    ? parsed.receiver
    : null;

  return {
    description:
      typeof firstWasteItem?.wasteDescription === "string"
        ? firstWasteItem.wasteDescription
        : null,

    ewcCodes: Array.isArray(ewcCodes)
      ? ewcCodes.join(", ")
      : null,

    carrierName:
      typeof carrier?.organisationName === "string"
        ? carrier.organisationName
        : null,

    receiverName:
      typeof receiver?.siteName === "string"
        ? receiver.siteName
        : null,

    weight: formatPayloadWeight(weight),
  };
}

function formatPayloadWeight(value: unknown) {
  if (!isRecord(value)) return null;

  const amount = value.amount;
  const metric = value.metric;

  if (
    typeof amount !== "number" &&
    typeof amount !== "string"
  ) {
    return null;
  }

  if (typeof metric !== "string") {
    return String(amount);
  }

  return `${amount} ${metric}`;
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(
  date: Date | string | null | undefined,
) {
  if (!date) return "—";

  const parsed = new Date(date);

  if (!Number.isFinite(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}
