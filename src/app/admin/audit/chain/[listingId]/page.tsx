// src/app/admin/audit/chain/[listingId]/page.tsx

import Link from "next/link";
import type { ReactNode } from "react";
import { desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { database } from "@/db/database";
import {
  auditEvents,
  carrierAssignments,
  incidents,
  organisations,
  users,
  wasteListings,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

/* =========================================================
   TYPES
========================================================= */

type ChainPageParams =
  | {
      listingId: string;
    }
  | Promise<{
      listingId: string;
    }>;

type TimelineTone = "default" | "success" | "warning" | "danger" | "dwt";

type TimelineEvent = {
  id: string;
  type:
    | "listing"
    | "assignment"
    | "verification"
    | "collection"
    | "completion"
    | "incident"
    | "dwt"
    | "audit";
  title: string;
  description: string;
  timestamp: unknown;
  tone: TimelineTone;
  actor?: string | null;
  organisation?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/* =========================================================
   PAGE
========================================================= */

export default async function AdminChainDetailPage({
  params,
}: {
  params: ChainPageParams;
}) {
  await requirePlatformAdmin();

  const resolvedParams = await params;
  const listingId = Number(resolvedParams.listingId);

  if (!Number.isFinite(listingId)) {
    notFound();
  }

  const [listing] = await database
    .select()
    .from(wasteListings)
    .where(eq(wasteListings.id, listingId))
    .limit(1);

  if (!listing) {
    notFound();
  }

  /*
    We fetch these broadly and filter in JS so the page can still build a
    chain even when records are linked by assignmentId, listingId, DWT ID,
    incident ID, or audit entity ID.
  */
  const [assignmentRows, incidentRows, dwtRows, organisationRows] =
    await Promise.all([
      database.select().from(carrierAssignments),
      database.select().from(incidents),
      database.select().from(wasteTrackingSubmissions),
      database.select().from(organisations),
    ]);

  const organisationById = new Map(
    organisationRows.map((organisation) => [organisation.id, organisation]),
  );

  const listingOrganisationName =
    organisationById.get(listing.organisationId)?.teamName ??
    "Unknown organisation";

  const linkedAssignments = assignmentRows.filter((assignment) => {
    const assignmentListingId = getField(assignment, "listingId");
    return String(assignmentListingId) === String(listingId);
  });

  const assignmentIds = linkedAssignments
    .map((assignment) => cleanString(getField(assignment, "id")))
    .filter(isNonEmptyString);

  const linkedDwtSubmissions = dwtRows.filter((submission) => {
    const submissionListingId = getField(submission, "listingId");
    const submissionAssignmentId = cleanString(
      getField(submission, "assignmentId"),
    );

    return (
      String(submissionListingId) === String(listingId) ||
      Boolean(
        submissionAssignmentId && assignmentIds.includes(submissionAssignmentId),
      )
    );
  });

  const dwtSubmissionIds = linkedDwtSubmissions
    .map((submission) => cleanString(getField(submission, "id")))
    .filter(isNonEmptyString);

  const linkedIncidents = incidentRows.filter((incident) => {
    const incidentListingId = getField(incident, "listingId");
    const incidentAssignmentId = cleanString(getField(incident, "assignmentId"));

    return (
      String(incidentListingId) === String(listingId) ||
      Boolean(
        incidentAssignmentId && assignmentIds.includes(incidentAssignmentId),
      )
    );
  });

  const incidentIds = linkedIncidents
    .map((incident) => cleanString(getField(incident, "id")))
    .filter(isNonEmptyString);

  const relatedEntityIds = Array.from(
    new Set(
      [
        String(listingId),
        cleanString(getField(listing, "id")),
        ...assignmentIds,
        ...dwtSubmissionIds,
        ...incidentIds,
      ].filter(isNonEmptyString),
    ),
  );

  const auditRows =
    relatedEntityIds.length > 0
      ? await database
          .select({
            id: auditEvents.id,
            action: auditEvents.action,
            entityType: auditEvents.entityType,
            entityId: auditEvents.entityId,
            createdAt: auditEvents.createdAt,
            previousState: auditEvents.previousState,
            newState: auditEvents.newState,
            userName: users.name,
            userEmail: users.email,
            organisationName: organisations.teamName,
          })
          .from(auditEvents)
          .leftJoin(users, eq(auditEvents.userId, users.id))
          .leftJoin(
            organisations,
            eq(auditEvents.organisationId, organisations.id),
          )
          .where(inArray(auditEvents.entityId, relatedEntityIds))
          .orderBy(desc(auditEvents.createdAt))
      : [];

  const latestDwtSubmission = [...linkedDwtSubmissions]
    .sort((first, second) => getRowTime(second) - getRowTime(first))
    .at(0);

  const acceptedDwtSubmissions = linkedDwtSubmissions.filter((submission) =>
    ["accepted", "accepted_with_warnings"].includes(
      String(getField(submission, "status")),
    ),
  );

  const failedDwtSubmissions = linkedDwtSubmissions.filter((submission) =>
    ["rejected", "failed"].includes(String(getField(submission, "status"))),
  );

  const awaitingDwtSubmissions = linkedDwtSubmissions.filter((submission) =>
    ["draft", "submitted"].includes(String(getField(submission, "status"))),
  );

  const unresolvedIncidents = linkedIncidents.filter((incident) =>
    ["open", "under_review"].includes(String(getField(incident, "status"))),
  );

  const completedAssignments = linkedAssignments.filter((assignment) => {
    return (
      getField(assignment, "status") === "completed" ||
      Boolean(getField(assignment, "completedAt"))
    );
  });

  const timelineEvents = buildTimelineEvents({
    listing,
    listingOrganisationName,
    assignments: linkedAssignments,
    dwtSubmissions: linkedDwtSubmissions,
    incidents: linkedIncidents,
    auditRows,
    organisationById,
  });

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Audit Intelligence
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Chain of Custody
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Listing #{listing.id} — {listing.name}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge status={listing.status} />

              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                {listingOrganisationName}
              </span>

              {latestDwtSubmission && (
                <span className="rounded-full border border-gray-900 bg-gray-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                  DWT{" "}
                  {formatLabel(String(getField(latestDwtSubmission, "status")))}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/audit/chain"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              ← Chain register
            </Link>

            <Link
              href={`/admin/audit/entity?entityId=${encodeURIComponent(
                String(listingId),
              )}`}
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Entity audit
            </Link>

            <Link
              href="/admin/digital-waste-tracking"
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              DWT control room
            </Link>
          </div>
        </div>
      </section>

      {/* ================= SUMMARY ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Assignments"
          value={linkedAssignments.length}
          helper={`${completedAssignments.length} completed`}
        />

        <Metric
          label="DWT submissions"
          value={linkedDwtSubmissions.length}
          helper={`${acceptedDwtSubmissions.length} accepted`}
        />

        <Metric
          label="Incidents"
          value={linkedIncidents.length}
          helper={`${unresolvedIncidents.length} unresolved`}
          tone={unresolvedIncidents.length > 0 ? "danger" : "default"}
        />

        <Metric
          label="Audit events"
          value={auditRows.length}
          helper="Linked by listing, assignment, DWT or incident ID"
        />

        <Metric
          label="Timeline events"
          value={timelineEvents.length}
          helper="Generated custody events"
        />
      </section>

      {/* ================= SOURCE COVERAGE ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Source Coverage
          </p>

          <h2 className="mt-2 text-lg font-bold text-gray-950">
            Records found for listing #{listingId}
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            This panel confirms exactly which tables are feeding the chain. If
            this shows data, the timeline below can still be generated even when
            the audit event table has limited records.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SourceCard
            label="Carrier assignments"
            value={linkedAssignments.length}
            helper={assignmentIds.length > 0 ? assignmentIds.join(", ") : "None"}
          />

          <SourceCard
            label="DWT submissions"
            value={linkedDwtSubmissions.length}
            helper={
              latestDwtSubmission
                ? getDisplayValue(latestDwtSubmission, "wasteTrackingId") ||
                  "No tracking ID"
                : "None"
            }
          />

          <SourceCard
            label="Incidents"
            value={linkedIncidents.length}
            helper={
              unresolvedIncidents.length > 0
                ? `${unresolvedIncidents.length} unresolved`
                : "No unresolved incidents"
            }
          />

          <SourceCard
            label="Related entity IDs"
            value={relatedEntityIds.length}
            helper={relatedEntityIds.slice(0, 3).join(", ") || "None"}
          />
        </div>
      </section>

      {/* ================= CONTEXT + DWT ================= */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          eyebrow="Listing Context"
          title="Listing overview"
          description="The original waste listing connected to this custody chain."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard label="Listing ID" value={String(listing.id)} />
            <InfoCard label="Name" value={listing.name ?? "—"} />
            <InfoCard label="Location" value={listing.location ?? "—"} />
            <InfoCard label="Status" value={formatLabel(listing.status)} />
            <InfoCard label="Organisation" value={listingOrganisationName} />
            <InfoCard
              label="Created"
              value={formatDateTime(listing.createdAt)}
            />
          </div>
        </Panel>

        <Panel
          eyebrow="Digital Waste Tracking"
          title="Latest DWT receive movement"
          description="The most recent Digital Waste Tracking submission connected to this listing or its assignment."
          actionHref="/admin/digital-waste-tracking"
          actionLabel="Open DWT"
        >
          {latestDwtSubmission ? (
            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard
                label="Status"
                value={formatLabel(
                  getDisplayValue(latestDwtSubmission, "status"),
                )}
              />

              <InfoCard
                label="Waste Tracking ID"
                value={
                  getDisplayValue(latestDwtSubmission, "wasteTrackingId") ||
                  "—"
                }
              />

              <InfoCard
                label="Endpoint"
                value={`${getDisplayValue(latestDwtSubmission, "method") || "—"} ${
                  getDisplayValue(latestDwtSubmission, "endpoint") || ""
                }`}
              />

              <InfoCard
                label="HTTP status"
                value={String(
                  getResponseStatusCode(
                    getField(latestDwtSubmission, "responseSnapshot"),
                  ) ?? "—",
                )}
              />

              <InfoCard
                label="Submitted"
                value={formatDateTime(
                  getField(latestDwtSubmission, "submittedAt") ??
                    getField(latestDwtSubmission, "lastAttemptedAt"),
                )}
              />

              <InfoCard
                label="Warnings / Errors"
                value={`${getJsonArrayLength(
                  getField(latestDwtSubmission, "validationWarnings"),
                )} warnings, ${getJsonArrayLength(
                  getField(latestDwtSubmission, "validationErrors"),
                )} errors`}
              />
            </div>
          ) : (
            <EmptyState message="No DWT submission found for this listing yet." />
          )}
        </Panel>
      </section>

      {/* ================= DWT STATUS SUMMARY ================= */}
      {linkedDwtSubmissions.length > 0 && (
        <section className="grid gap-5 md:grid-cols-3">
          <Metric
            label="Accepted DWT"
            value={acceptedDwtSubmissions.length}
            helper="Accepted or accepted with warnings"
          />

          <Metric
            label="Awaiting final status"
            value={awaitingDwtSubmissions.length}
            helper="Draft or submitted"
          />

          <Metric
            label="Failed / rejected"
            value={failedDwtSubmissions.length}
            helper="Needs review"
            tone={failedDwtSubmissions.length > 0 ? "danger" : "default"}
          />
        </section>
      )}

      {/* ================= ASSIGNMENTS ================= */}
      <Panel
        eyebrow="Assignments"
        title="Linked assignments"
        description="Assignments are the main operational source for chain-of-custody lifecycle events."
      >
        {linkedAssignments.length === 0 ? (
          <EmptyState message="No assignments were found for this listing." />
        ) : (
          <div className="space-y-4">
            {linkedAssignments.map((assignment) => (
              <AssignmentCard
                key={String(getField(assignment, "id"))}
                assignment={assignment}
                organisationById={organisationById}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* ================= TIMELINE ================= */}
      <Panel
        eyebrow="Custody Timeline"
        title="Generated chain timeline"
        description="Generated from listing, assignment lifecycle fields, DWT submissions, incidents and audit events."
      >
        {timelineEvents.length === 0 ? (
          <EmptyState message="No timeline events could be generated for this listing." />
        ) : (
          <div className="relative space-y-4">
            <div className="absolute bottom-4 left-5 top-4 w-px bg-gray-200" />

            {timelineEvents.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </Panel>

      {/* ================= RAW AUDIT ================= */}
      <Panel
        eyebrow="Audit Rows"
        title="Raw linked audit events"
        description="Audit events directly linked to the listing, assignments, DWT submissions or incidents."
        actionHref={`/admin/audit/entity?entityId=${encodeURIComponent(
          String(listingId),
        )}`}
        actionLabel="Entity explorer"
      >
        {auditRows.length === 0 ? (
          <EmptyState message="No raw audit events were found for the linked entity IDs. The timeline above can still be generated from operational lifecycle records." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <div className="divide-y divide-gray-200 bg-white">
              {auditRows.map((event) => (
                <div
                  key={event.id}
                  className="flex flex-col gap-3 px-5 py-4 transition hover:bg-gray-50 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                        {formatLabel(event.action)}
                      </span>

                      {event.entityType && (
                        <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                          {formatLabel(event.entityType)}
                        </span>
                      )}
                    </div>

                    <p className="mt-3 text-sm font-semibold text-gray-950">
                      {formatLabel(event.action)}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      {event.userName ?? event.userEmail ?? "System"} ·{" "}
                      {event.organisationName ?? "No organisation"}
                    </p>
                  </div>

                  <div className="text-sm text-gray-500 md:text-right">
                    <p>{formatDateTime(event.createdAt)}</p>

                    {event.entityId && (
                      <p className="mt-1 max-w-[18rem] truncate text-xs text-gray-400">
                        {event.entityId}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* =========================================================
   TIMELINE BUILDING
========================================================= */

function buildTimelineEvents({
  listing,
  listingOrganisationName,
  assignments,
  dwtSubmissions,
  incidents,
  auditRows,
  organisationById,
}: {
  listing: typeof wasteListings.$inferSelect;
  listingOrganisationName: string;
  assignments: unknown[];
  dwtSubmissions: unknown[];
  incidents: unknown[];
  auditRows: {
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    createdAt: Date | null;
    userName: string | null;
    userEmail: string | null;
    organisationName: string | null;
  }[];
  organisationById: Map<string, typeof organisations.$inferSelect>;
}) {
  const events: TimelineEvent[] = [];

  events.push({
    id: `listing-created-${listing.id}`,
    type: "listing",
    title: "Listing Created",
    description: `Waste listing created by ${listingOrganisationName}.`,
    timestamp: listing.createdAt,
    tone: "default",
    organisation: listingOrganisationName,
    entityId: String(listing.id),
    metadata: {
      status: listing.status,
      location: listing.location,
    },
  });

  for (const assignment of assignments) {
    const assignmentId = getDisplayValue(assignment, "id");
    const status = getDisplayValue(assignment, "status");

    const generatorOrg = organisationById.get(
      getDisplayValue(assignment, "generatorOrganisationId"),
    );

    const carrierOrg = organisationById.get(
      getDisplayValue(assignment, "carrierOrganisationId"),
    );

    const managerOrg = organisationById.get(
      getDisplayValue(assignment, "managerOrganisationId"),
    );

    const assignedByOrg = organisationById.get(
      getDisplayValue(assignment, "assignedByOrganisationId"),
    );

    const fallbackOrg = organisationById.get(
      getDisplayValue(assignment, "organisationId"),
    );

    const organisationName =
      carrierOrg?.teamName ??
      managerOrg?.teamName ??
      generatorOrg?.teamName ??
      assignedByOrg?.teamName ??
      fallbackOrg?.teamName ??
      null;

    pushIfDate(events, {
      id: `assignment-created-${assignmentId}`,
      type: "assignment",
      title: "Assignment Created",
      description: "Carrier assignment was created for this listing.",
      timestamp: getField(assignment, "assignedAt"),
      tone: "default",
      organisation: organisationName,
      entityId: assignmentId,
      metadata: {
        status,
        assignmentId,
        generator: generatorOrg?.teamName,
        carrier: carrierOrg?.teamName,
        manager: managerOrg?.teamName,
      },
    });

    pushIfDate(events, {
      id: `carrier-response-${assignmentId}`,
      type: "assignment",
      title: "Carrier Response",
      description: "Carrier responded to the assignment.",
      timestamp: getField(assignment, "respondedAt"),
      tone: "default",
      organisation: carrierOrg?.teamName ?? organisationName,
      entityId: assignmentId,
      metadata: {
        status,
      },
    });

    pushIfDate(events, {
      id: `verification-generated-${assignmentId}`,
      type: "verification",
      title: "Verification Code Generated",
      description: "Verification code was generated for collection evidence.",
      timestamp: getField(assignment, "codeGeneratedAt"),
      tone: "default",
      organisation: organisationName,
      entityId: assignmentId,
      metadata: {
        verificationCode: maskVerificationCode(
          getDisplayValue(assignment, "verificationCode"),
        ),
      },
    });

    pushIfDate(events, {
      id: `collected-${assignmentId}`,
      type: "collection",
      title: "Waste Collected",
      description: "Carrier collected the waste for this assignment.",
      timestamp: getField(assignment, "collectedAt"),
      tone: "success",
      organisation: carrierOrg?.teamName ?? organisationName,
      entityId: assignmentId,
      metadata: {
        status,
      },
    });

    pushIfDate(events, {
      id: `verification-used-${assignmentId}`,
      type: "verification",
      title: "Verification Code Used",
      description: "Collection verification code was used.",
      timestamp: getField(assignment, "codeUsedAt"),
      tone: "success",
      organisation: carrierOrg?.teamName ?? organisationName,
      entityId: assignmentId,
      metadata: {
        verification: getField(assignment, "codeUsedAt") ? "Used" : "Not used",
      },
    });

    pushIfDate(events, {
      id: `completed-${assignmentId}`,
      type: "completion",
      title: "Movement Completed",
      description:
        "Assignment was completed and the custody chain was closed operationally.",
      timestamp: getField(assignment, "completedAt"),
      tone: "success",
      organisation: managerOrg?.teamName ?? organisationName,
      entityId: assignmentId,
      metadata: {
        status,
      },
    });
  }

  for (const incident of incidents) {
    const incidentId = getDisplayValue(incident, "id");
    const incidentOrg = organisationById.get(
      getDisplayValue(incident, "organisationId"),
    );

    events.push({
      id: `incident-${incidentId}`,
      type: "incident",
      title: "Incident Reported",
      description:
        getDisplayValue(incident, "summary") ||
        getDisplayValue(incident, "immediateAction") ||
        "Incident was reported against this custody chain.",
      timestamp:
        getField(incident, "incidentDate") ?? getField(incident, "createdAt"),
      tone:
        getDisplayValue(incident, "status") === "resolved"
          ? "warning"
          : "danger",
      organisation: incidentOrg?.teamName ?? null,
      entityId: incidentId,
      metadata: {
        status: getDisplayValue(incident, "status"),
        type: getDisplayValue(incident, "type"),
        assignmentId: getDisplayValue(incident, "assignmentId"),
      },
    });
  }

  for (const submission of dwtSubmissions) {
    const submissionId = getDisplayValue(submission, "id");
    const status = getDisplayValue(submission, "status");
    const trackingId = getDisplayValue(submission, "wasteTrackingId");

    const submissionOrg = organisationById.get(
      getDisplayValue(submission, "organisationId"),
    );

    events.push({
      id: `dwt-${submissionId}`,
      type: "dwt",
      title: "DWT Receive Movement",
      description:
        trackingId && ["accepted", "accepted_with_warnings"].includes(status)
          ? `Digital Waste Tracking receive movement accepted. Tracking ID: ${trackingId}.`
          : "Digital Waste Tracking receive movement submission was attempted.",
      timestamp:
        getField(submission, "submittedAt") ??
        getField(submission, "lastAttemptedAt") ??
        getField(submission, "createdAt"),
      tone:
        status === "accepted" || status === "accepted_with_warnings"
          ? "dwt"
          : status === "rejected" || status === "failed"
            ? "danger"
            : "warning",
      organisation: submissionOrg?.teamName ?? null,
      entityId: submissionId,
      metadata: {
        status,
        wasteTrackingId: trackingId,
        endpoint: `${getDisplayValue(submission, "method")} ${getDisplayValue(
          submission,
          "endpoint",
        )}`,
        httpStatus: getResponseStatusCode(
          getField(submission, "responseSnapshot"),
        ),
        warnings: getJsonArrayLength(
          getField(submission, "validationWarnings"),
        ),
        errors: getJsonArrayLength(getField(submission, "validationErrors")),
      },
    });
  }

  for (const audit of auditRows) {
    events.push({
      id: `audit-${audit.id}`,
      type: "audit",
      title: formatLabel(audit.action),
      description: `Audit event recorded for ${formatLabel(
        audit.entityType ?? "entity",
      )}.`,
      timestamp: audit.createdAt,
      tone: "default",
      actor: audit.userName ?? audit.userEmail ?? "System",
      organisation: audit.organisationName,
      entityId: audit.entityId,
      metadata: {
        action: audit.action,
        entityType: audit.entityType,
      },
    });
  }

  return events
    .filter((event) => Boolean(event.timestamp))
    .sort((first, second) => {
      return (
        getUnknownDateTime(first.timestamp) -
        getUnknownDateTime(second.timestamp)
      );
    });
}

function pushIfDate(events: TimelineEvent[], event: TimelineEvent) {
  if (!event.timestamp) return;
  events.push(event);
}

/* =========================================================
   COMPONENTS
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

function Panel({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              {eyebrow}
            </p>
          )}

          <h2 className="mt-2 text-lg font-bold text-gray-950">{title}</h2>

          {description && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              {description}
            </p>
          )}
        </div>

        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
          >
            {actionLabel} →
          </Link>
        )}
      </div>

      {children}
    </section>
  );
}

function SourceCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold text-gray-950">{value}</p>

      <p className="mt-2 line-clamp-2 break-all text-xs leading-5 text-gray-500">
        {helper || "—"}
      </p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-semibold text-gray-950">
        {value || "—"}
      </p>
    </div>
  );
}

function AssignmentCard({
  assignment,
  organisationById,
}: {
  assignment: unknown;
  organisationById: Map<string, typeof organisations.$inferSelect>;
}) {
  const assignmentId = getDisplayValue(assignment, "id");

  const generatorOrg = organisationById.get(
    getDisplayValue(assignment, "generatorOrganisationId"),
  );

  const carrierOrg = organisationById.get(
    getDisplayValue(assignment, "carrierOrganisationId"),
  );

  const managerOrg = organisationById.get(
    getDisplayValue(assignment, "managerOrganisationId"),
  );

  const fallbackOrg = organisationById.get(
    getDisplayValue(assignment, "organisationId"),
  );

  return (
    <article className="rounded-[1.5rem] border border-gray-200 bg-gray-50 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={getDisplayValue(assignment, "status")} />

            <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              Assignment
            </span>
          </div>

          <h3 className="mt-3 text-sm font-bold text-gray-950">
            {assignmentId || "Unknown assignment"}
          </h3>

          <p className="mt-2 text-sm leading-6 text-gray-500">
            Generator: {generatorOrg?.teamName ?? fallbackOrg?.teamName ?? "—"}{" "}
            · Carrier: {carrierOrg?.teamName ?? "—"} · Manager:{" "}
            {managerOrg?.teamName ?? "—"}
          </p>
        </div>

        {assignmentId && (
          <Link
            href={`/admin/audit/entity?entityId=${encodeURIComponent(
              assignmentId,
            )}`}
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Audit
          </Link>
        )}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          label="Assigned"
          value={formatDateTime(getField(assignment, "assignedAt"))}
        />

        <InfoCard
          label="Responded"
          value={formatDateTime(getField(assignment, "respondedAt"))}
        />

        <InfoCard
          label="Collected"
          value={formatDateTime(getField(assignment, "collectedAt"))}
        />

        <InfoCard
          label="Completed"
          value={formatDateTime(getField(assignment, "completedAt"))}
        />

        <InfoCard
          label="Code generated"
          value={formatDateTime(getField(assignment, "codeGeneratedAt"))}
        />

        <InfoCard
          label="Code used"
          value={formatDateTime(getField(assignment, "codeUsedAt"))}
        />

        <InfoCard
          label="Verification"
          value={getField(assignment, "codeUsedAt") ? "Used" : "Not used"}
        />

        <InfoCard
          label="Incident flag"
          value={getField(assignment, "hasIncident") ? "Yes" : "No"}
        />
      </div>
    </article>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const tone = getTimelineTone(event.tone);

  return (
    <article className="relative flex gap-4">
      <div
        className={`relative z-10 mt-1 flex size-10 shrink-0 items-center justify-center rounded-2xl border text-xs font-bold ${tone.dot}`}
      >
        {getTimelineIcon(event.type)}
      </div>

      <div className={`flex-1 rounded-[1.5rem] border p-5 ${tone.card}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.badge}`}
              >
                {formatLabel(event.type)}
              </span>

              {event.entityId && (
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  {shortId(event.entityId)}
                </span>
              )}
            </div>

            <h3 className="mt-3 text-sm font-bold text-gray-950">
              {event.title}
            </h3>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-600">
              {event.description}
            </p>

            {(event.actor || event.organisation) && (
              <p className="mt-3 text-xs text-gray-500">
                {event.actor && <>Actor: {event.actor}</>}
                {event.actor && event.organisation && " · "}
                {event.organisation && <>Organisation: {event.organisation}</>}
              </p>
            )}
          </div>

          <p className="shrink-0 text-sm font-medium text-gray-500">
            {formatDateTime(event.timestamp)}
          </p>
        </div>

        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(event.metadata).map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3"
              >
                <p className="text-xs font-medium text-gray-400">
                  {formatLabel(key)}
                </p>

                <p className="mt-1 break-words text-sm font-semibold text-gray-900">
                  {value === null || value === undefined || value === ""
                    ? "—"
                    : String(value)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = String(status ?? "").toLowerCase();

  const className =
    value === "completed" ||
    value === "accepted" ||
    value === "accepted_with_warnings"
      ? "border-gray-900 bg-gray-950 text-white"
      : value === "assigned" ||
          value === "draft" ||
          value === "submitted" ||
          value === "in_progress" ||
          value === "open"
        ? "border-gray-300 bg-gray-100 text-gray-800"
        : value === "rejected" ||
            value === "failed" ||
            value === "cancelled" ||
            value === "under_review"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-gray-200 bg-white text-gray-600";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {formatLabel(status)}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
      <p className="text-sm font-semibold text-gray-950">{message}</p>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
        This does not always mean the operation has no activity. Check the
        source coverage panel above to see which tables have linked records.
      </p>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getField(row: unknown, key: string): unknown {
  if (!row || typeof row !== "object") return null;

  return (row as Record<string, unknown>)[key] ?? null;
}

function getDisplayValue(row: unknown, key: string) {
  const value = getField(row, key);

  if (value === null || value === undefined) return "";

  return String(value);
}

function cleanString(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const cleaned = String(value).trim();

  return cleaned.length > 0 ? cleaned : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getUnknownDateTime(value: unknown) {
  if (!value) return 0;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : 0;
  }

  if (typeof value === "string" || typeof value === "number") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  return 0;
}

function getRowTime(row: unknown) {
  const value =
    getField(row, "lastAttemptedAt") ??
    getField(row, "submittedAt") ??
    getField(row, "createdAt") ??
    getField(row, "updatedAt");

  return getUnknownDateTime(value);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function maskVerificationCode(value: string) {
  if (!value) return "—";

  if (value.length <= 2) return "**";

  return `${value.slice(0, 2)}****`;
}

function formatDateTime(value: unknown) {
  if (!value) return "—";

  const time = getUnknownDateTime(value);

  if (!time) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(time));
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

function getTimelineIcon(type: TimelineEvent["type"]) {
  const icons: Record<TimelineEvent["type"], string> = {
    listing: "L",
    assignment: "A",
    verification: "V",
    collection: "C",
    completion: "✓",
    incident: "!",
    dwt: "D",
    audit: "•",
  };

  return icons[type];
}

function getTimelineTone(tone: TimelineTone) {
  if (tone === "success") {
    return {
      dot: "border-gray-900 bg-gray-950 text-white",
      card: "border-gray-200 bg-gray-50",
      badge: "border-gray-900 bg-gray-950 text-white",
    };
  }

  if (tone === "dwt") {
    return {
      dot: "border-gray-900 bg-gray-950 text-white",
      card: "border-gray-200 bg-gray-50",
      badge: "border-gray-900 bg-gray-950 text-white",
    };
  }

  if (tone === "danger") {
    return {
      dot: "border-red-200 bg-red-50 text-red-700",
      card: "border-red-200 bg-red-50",
      badge: "border-red-200 bg-white text-red-700",
    };
  }

  if (tone === "warning") {
    return {
      dot: "border-gray-300 bg-gray-100 text-gray-800",
      card: "border-gray-200 bg-gray-50",
      badge: "border-gray-300 bg-white text-gray-800",
    };
  }

  return {
    dot: "border-gray-200 bg-white text-gray-600",
    card: "border-gray-200 bg-gray-50",
    badge: "border-gray-200 bg-white text-gray-600",
  };
}