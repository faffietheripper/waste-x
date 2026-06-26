import { NextRequest } from "next/server";
import { eq, inArray, or } from "drizzle-orm";

import { database } from "@/db/database";
import {
  auditEvents,
  carrierAssignments,
  incidents,
  wasteEvents,
  wasteListings,
} from "@/db/schema";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

/* =========================================================
   TYPES
========================================================= */

type ReportType =
  | "summary"
  | "assignments"
  | "incidents"
  | "chain-of-custody"
  | "audit";

/* =========================================================
   HELPERS
========================================================= */

function normaliseReportType(value: string | null): ReportType {
  if (
    value === "summary" ||
    value === "assignments" ||
    value === "incidents" ||
    value === "chain-of-custody" ||
    value === "audit"
  ) {
    return value;
  }

  return "summary";
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "";
  return new Date(date).toISOString();
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";

  const stringValue =
    typeof value === "string" ? value : JSON.stringify(value);

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

function filenameFor(type: ReportType) {
  const date = new Date().toISOString().slice(0, 10);
  return `waste-x-${type}-report-${date}.csv`;
}

/* =========================================================
   ROUTE
========================================================= */

export async function GET(request: NextRequest) {
  const context = await requireOperationalPermission("compliance:reports");

  const organisationId = context.user.organisationId!;

  const type = normaliseReportType(request.nextUrl.searchParams.get("type"));

  const assignmentRows = await database.query.carrierAssignments.findMany({
    where: or(
      eq(carrierAssignments.organisationId, organisationId),
      eq(carrierAssignments.assignedByOrganisationId, organisationId),
      eq(carrierAssignments.carrierOrganisationId, organisationId),
      eq(carrierAssignments.managerOrganisationId, organisationId),
    ),
    with: {
      listing: true,
      carrierOrganisation: true,
      managerOrganisation: true,
      assignedByOrganisation: true,
      bid: true,
    },
    orderBy: (rows, { desc }) => [desc(rows.assignedAt)],
  });

  const assignmentIds = assignmentRows.map((assignment) => assignment.id);

  const incidentWhere =
    assignmentIds.length > 0
      ? or(
          eq(incidents.organisationId, organisationId),
          eq(incidents.reportedByOrganisationId, organisationId),
          inArray(incidents.assignmentId, assignmentIds),
        )
      : or(
          eq(incidents.organisationId, organisationId),
          eq(incidents.reportedByOrganisationId, organisationId),
        );

  const [incidentRows, eventRows, listingRows, auditRows] = await Promise.all([
    database.query.incidents.findMany({
      where: incidentWhere,
      with: {
        listing: true,
        assignment: true,
        reportedByUser: true,
        reportedByOrganisation: true,
      },
      orderBy: (rows, { desc }) => [desc(rows.createdAt)],
    }),

    database.query.wasteEvents.findMany({
      where: or(
        eq(wasteEvents.organisationId, organisationId),
        eq(wasteEvents.actorOrganisationId, organisationId),
        eq(wasteEvents.targetOrganisationId, organisationId),
      ),
      with: {
        listing: true,
        user: true,
      },
      orderBy: (rows, { desc }) => [desc(rows.createdAt)],
    }),

    database.query.wasteListings.findMany({
      where: eq(wasteListings.organisationId, organisationId),
      orderBy: (rows, { desc }) => [desc(rows.createdAt)],
    }),

    database.query.auditEvents.findMany({
      where: eq(auditEvents.organisationId, organisationId),
      with: {
        user: true,
      },
      orderBy: (rows, { desc }) => [desc(rows.createdAt)],
      limit: 1000,
    }),
  ]);

  const unresolvedIncidents = incidentRows.filter(
    (incident) =>
      incident.status === "open" || incident.status === "under_review",
  );

  const completedAssignments = assignmentRows.filter(
    (assignment) => assignment.status === "completed",
  );

  const missingVerificationCodes = assignmentRows.filter(
    (assignment) =>
      !assignment.verificationCode &&
      assignment.status !== "cancelled" &&
      assignment.status !== "rejected",
  );

  const completedWithoutCodeUsed = assignmentRows.filter(
    (assignment) => assignment.status === "completed" && !assignment.codeUsedAt,
  );

  let csv = "";

  if (type === "summary") {
    csv = toCsv(
      ["Metric", "Value"],
      [
        ["Generated At", new Date().toISOString()],
        ["Organisation ID", organisationId],
        ["Generated By User ID", context.user.id],
        ["Generated By Department", context.department.name],
        ["Total Assignments", assignmentRows.length],
        ["Completed Assignments", completedAssignments.length],
        ["Total Incidents", incidentRows.length],
        ["Unresolved Incidents", unresolvedIncidents.length],
        ["Waste Events", eventRows.length],
        ["Listings", listingRows.length],
        ["Audit Events", auditRows.length],
        ["Missing Verification Codes", missingVerificationCodes.length],
        ["Completed Without Code Used", completedWithoutCodeUsed.length],
      ],
    );
  }

  if (type === "assignments") {
    csv = toCsv(
      [
        "Assignment ID",
        "Listing ID",
        "Listing Name",
        "Status",
        "Assignment Method",
        "Generator Organisation",
        "Manager Organisation",
        "Carrier Organisation",
        "Bid ID",
        "Verification Code Present",
        "Code Generated At",
        "Code Used At",
        "Manager Accepted At",
        "Carrier Assigned At",
        "Assigned At",
        "Responded At",
        "Collected At",
        "Completed At",
      ],
      assignmentRows.map((assignment) => [
        assignment.id,
        assignment.listingId,
        assignment.listing?.name,
        assignment.status,
        assignment.assignmentMethod,
        assignment.assignedByOrganisation?.teamName,
        assignment.managerOrganisation?.teamName,
        assignment.carrierOrganisation?.teamName,
        assignment.bidId,
        assignment.verificationCode ? "Yes" : "No",
        formatDate(assignment.codeGeneratedAt),
        formatDate(assignment.codeUsedAt),
        formatDate(assignment.managerAcceptedAt),
        formatDate(assignment.carrierAssignedAt),
        formatDate(assignment.assignedAt),
        formatDate(assignment.respondedAt),
        formatDate(assignment.collectedAt),
        formatDate(assignment.completedAt),
      ]),
    );
  }

  if (type === "incidents") {
    csv = toCsv(
      [
        "Incident ID",
        "Status",
        "Type",
        "Summary",
        "Listing ID",
        "Listing Name",
        "Assignment ID",
        "Reported By User",
        "Reported By Organisation",
        "Incident Date",
        "Incident Location",
        "Immediate Action",
        "Investigation Findings",
        "Corrective Actions",
        "Preventative Measures",
        "Compliance Review",
        "Responsible Person",
        "Date Closed",
        "Resolved By User ID",
        "Created At",
        "Resolved At",
      ],
      incidentRows.map((incident) => [
        incident.id,
        incident.status,
        incident.type,
        incident.summary,
        incident.listingId,
        incident.listing?.name,
        incident.assignmentId,
        incident.reportedByUser?.name,
        incident.reportedByOrganisation?.teamName,
        formatDate(incident.incidentDate),
        incident.incidentLocation,
        incident.immediateAction,
        incident.investigationFindings,
        incident.correctiveActions,
        incident.preventativeMeasures,
        incident.complianceReview,
        incident.responsiblePerson,
        formatDate(incident.dateClosed),
        incident.resolvedByUserId,
        formatDate(incident.createdAt),
        formatDate(incident.resolvedAt),
      ]),
    );
  }

  if (type === "chain-of-custody") {
    csv = toCsv(
      [
        "Waste Event ID",
        "Event Type",
        "Listing ID",
        "Listing Name",
        "Carrier Assignment ID",
        "Performed By User",
        "Actor Organisation ID",
        "Actor Role",
        "Target Organisation ID",
        "Site ID",
        "Waste Type",
        "Waste Quantity",
        "Metadata",
        "Created At",
      ],
      eventRows.map((event) => [
        event.id,
        event.eventType,
        event.listingId,
        event.listing?.name,
        event.carrierAssignmentId,
        event.user?.name,
        event.actorOrganisationId,
        event.actorRole,
        event.targetOrganisationId,
        event.siteId,
        event.wasteType,
        event.wasteQuantity,
        event.metadata,
        formatDate(event.createdAt),
      ]),
    );
  }

  if (type === "audit") {
    csv = toCsv(
      [
        "Audit Event ID",
        "Entity Type",
        "Entity ID",
        "Action",
        "User ID",
        "User Name",
        "IP Address",
        "Previous State",
        "New State",
        "Created At",
      ],
      auditRows.map((event) => [
        event.id,
        event.entityType,
        event.entityId,
        event.action,
        event.userId,
        event.user?.name,
        event.ipAddress,
        event.previousState,
        event.newState,
        formatDate(event.createdAt),
      ]),
    );
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameFor(type)}"`,
      "Cache-Control": "no-store",
    },
  });
}