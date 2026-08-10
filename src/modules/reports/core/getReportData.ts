import { sql, type SQL } from "drizzle-orm";

import { database } from "@/db/database";
import type { ReportFilters, ReportType } from "./reportTypes";

export type ReportRow = Record<string, unknown>;

export type ReportDataset = {
  columns: string[];
  rows: ReportRow[];
  rowCount: number;
};

type RunRowsResult<Row> = {
  rows?: Row[];
};

export async function getReportDataset({
  organisationId,
  reportType,
  filters,
}: {
  organisationId: string;
  reportType: ReportType;
  filters: ReportFilters;
}): Promise<ReportDataset> {
  switch (reportType) {
    case "assignment_summary":
      return buildDataset(await getAssignmentSummaryRows(organisationId, filters));

    case "chain_of_custody":
      return buildDataset(await getChainOfCustodyRows(organisationId, filters));

    case "incident_log":
      return buildDataset(await getIncidentLogRows(organisationId, filters));

    case "dwt_submissions":
      return buildDataset(await getDwtSubmissionRows(organisationId, filters));

    case "waste_receipts":
      return buildDataset(await getWasteReceiptRows(organisationId, filters));

    case "listing_activity":
      return buildDataset(await getListingActivityRows(organisationId, filters));

    case "carrier_performance":
      return buildDataset(await getCarrierPerformanceRows(organisationId, filters));

    case "user_access_audit":
      return buildDataset(await getUserAccessAuditRows(organisationId, filters));

    case "compliance_audit_pack":
      return buildDataset(await getComplianceAuditPackRows(organisationId, filters));

    default:
      return {
        columns: [],
        rows: [],
        rowCount: 0,
      };
  }
}

async function runRows<Row extends ReportRow>(query: SQL) {
  const result = (await database.execute(query)) as unknown as RunRowsResult<Row>;
  return result.rows ?? [];
}

function buildDataset(rows: ReportRow[]): ReportDataset {
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  return {
    columns,
    rows,
    rowCount: rows.length,
  };
}

function buildWhere(conditions: SQL[]) {
  if (!conditions.length) return sql``;
  return sql`WHERE ${sql.join(conditions, sql` AND `)}`;
}

function buildDateFilters(filters: ReportFilters, dateExpression: SQL) {
  const conditions: SQL[] = [];

  if (filters.dateFrom) {
    conditions.push(sql`${dateExpression} >= ${new Date(`${filters.dateFrom}T00:00:00.000Z`)}`);
  }

  if (filters.dateTo) {
    conditions.push(sql`${dateExpression} <= ${new Date(`${filters.dateTo}T23:59:59.999Z`)}`);
  }

  return conditions;
}

function buildStatusFilter(filters: ReportFilters, statusExpression: SQL) {
  if (!filters.status || filters.status === "all") return [];
  return [sql`${statusExpression} = ${filters.status}`];
}

function assignmentOrganisationCondition(organisationId: string) {
  return sql`(
    ca."organisationId" = ${organisationId}
    OR ca."assignedByOrganisationId" = ${organisationId}
    OR ca."managerOrganisationId" = ${organisationId}
    OR ca."carrierOrganisationId" = ${organisationId}
  )`;
}

async function getAssignmentSummaryRows(
  organisationId: string,
  filters: ReportFilters,
) {
  const conditions = [
    assignmentOrganisationCondition(organisationId),
    ...buildDateFilters(filters, sql`ca."assignedAt"`),
    ...buildStatusFilter(filters, sql`ca.status`),
  ];

  return runRows(sql`
    SELECT
      ca.id AS "Assignment ID",
      wl.id AS "Listing ID",
      wl.name AS "Listing Name",
      wl.location AS "Location",
      generator."teamName" AS "Generator Organisation",
      manager."teamName" AS "Manager Organisation",
      carrier."teamName" AS "Carrier Organisation",
      ca."assignmentMethod" AS "Assignment Method",
      ca.status AS "Assignment Status",
      ca."verificationCode" AS "Verification Code",
      ca."assignedAt" AS "Assigned At",
      ca."managerAcceptedAt" AS "Manager Accepted At",
      ca."carrierAssignedAt" AS "Carrier Assigned At",
      ca."respondedAt" AS "Responded At",
      ca."collectedAt" AS "Collected At",
      ca."completedAt" AS "Completed At"
    FROM bb_carrier_assignment ca
    LEFT JOIN bb_waste_listing wl
      ON wl.id = ca."listingId"
    LEFT JOIN bb_organisation generator
      ON generator.id = ca."assignedByOrganisationId"
    LEFT JOIN bb_organisation manager
      ON manager.id = ca."managerOrganisationId"
    LEFT JOIN bb_organisation carrier
      ON carrier.id = ca."carrierOrganisationId"
    ${buildWhere(conditions)}
    ORDER BY ca."assignedAt" DESC NULLS LAST
    LIMIT 1000
  `);
}

async function getChainOfCustodyRows(
  organisationId: string,
  filters: ReportFilters,
) {
  const conditions = [
    assignmentOrganisationCondition(organisationId),
    ...buildDateFilters(filters, sql`ca."assignedAt"`),
    ...buildStatusFilter(filters, sql`ca.status`),
  ];

  return runRows(sql`
    SELECT
      wl.id AS "Listing ID",
      wl.name AS "Listing Name",
      wl.status AS "Listing Status",
      ca.id AS "Assignment ID",
      ca.status AS "Assignment Status",
      generator."teamName" AS "Generator",
      manager."teamName" AS "Manager",
      carrier."teamName" AS "Carrier",
      ca."verificationCode" AS "Verification Code",
      ca."assignedAt" AS "Assigned At",
      ca."respondedAt" AS "Carrier Responded At",
      ca."collectedAt" AS "Collected At",
      wr."receivedAt" AS "Received At",
      ca."completedAt" AS "Completed At",
      dwt."wasteTrackingId" AS "Waste Tracking ID",
      dwt.status AS "DWT Status"
    FROM bb_carrier_assignment ca
    LEFT JOIN bb_waste_listing wl
      ON wl.id = ca."listingId"
    LEFT JOIN bb_organisation generator
      ON generator.id = ca."assignedByOrganisationId"
    LEFT JOIN bb_organisation manager
      ON manager.id = ca."managerOrganisationId"
    LEFT JOIN bb_organisation carrier
      ON carrier.id = ca."carrierOrganisationId"
    LEFT JOIN bb_waste_receipt wr
      ON wr."assignmentId" = ca.id
    LEFT JOIN bb_waste_tracking_submission dwt
      ON dwt."assignmentId" = ca.id
    ${buildWhere(conditions)}
    ORDER BY ca."assignedAt" DESC NULLS LAST
    LIMIT 1000
  `);
}

async function getIncidentLogRows(
  organisationId: string,
  filters: ReportFilters,
) {
  const conditions = [
    sql`(
      i."organisationId" = ${organisationId}
      OR i."reportedByOrganisationId" = ${organisationId}
    )`,
    ...buildDateFilters(filters, sql`COALESCE(i."incidentDate", i."createdAt")`),
    ...buildStatusFilter(filters, sql`i.status`),
  ];

  return runRows(sql`
    SELECT
      i.id AS "Incident ID",
      wl.id AS "Listing ID",
      wl.name AS "Listing Name",
      i."assignmentId" AS "Assignment ID",
      reporter."teamName" AS "Reported By Organisation",
      u.name AS "Reported By User",
      i.type AS "Incident Type",
      i.status AS "Incident Status",
      i.summary AS "Summary",
      i."immediateAction" AS "Immediate Action",
      i."investigationFindings" AS "Investigation Findings",
      i."correctiveActions" AS "Corrective Actions",
      i."preventativeMeasures" AS "Preventative Measures",
      i."complianceReview" AS "Compliance Review",
      i."responsiblePerson" AS "Responsible Person",
      i."incidentDate" AS "Incident Date",
      i."dateClosed" AS "Date Closed",
      i."createdAt" AS "Created At",
      i."resolvedAt" AS "Resolved At"
    FROM bb_incident i
    LEFT JOIN bb_waste_listing wl
      ON wl.id = i."listingId"
    LEFT JOIN bb_user u
      ON u.id = i."reportedByUserId"
    LEFT JOIN bb_organisation reporter
      ON reporter.id = i."reportedByOrganisationId"
    ${buildWhere(conditions)}
    ORDER BY COALESCE(i."incidentDate", i."createdAt") DESC NULLS LAST
    LIMIT 1000
  `);
}

async function getDwtSubmissionRows(
  organisationId: string,
  filters: ReportFilters,
) {
  const conditions = [
    sql`dwt."organisationId" = ${organisationId}`,
    ...buildDateFilters(filters, sql`COALESCE(dwt."submittedAt", dwt."createdAt")`),
    ...buildStatusFilter(filters, sql`dwt.status`),
  ];

  return runRows(sql`
    SELECT
      dwt.id AS "Submission ID",
      dwt."wasteTrackingId" AS "Waste Tracking ID",
      dwt.status AS "Submission Status",
      dwt.method AS "Method",
      dwt.endpoint AS "Endpoint",
      wl.id AS "Listing ID",
      wl.name AS "Listing Name",
      dwt."assignmentId" AS "Assignment ID",
      dwt."receiptId" AS "Receipt ID",
      u.name AS "Submitted By",
      dwt."validationWarnings" AS "Validation Warnings",
      dwt."validationErrors" AS "Validation Errors",
      dwt."submittedAt" AS "Submitted At",
      dwt."lastAttemptedAt" AS "Last Attempted At",
      dwt."createdAt" AS "Created At"
    FROM bb_waste_tracking_submission dwt
    LEFT JOIN bb_waste_listing wl
      ON wl.id = dwt."listingId"
    LEFT JOIN bb_user u
      ON u.id = dwt."submittedByUserId"
    ${buildWhere(conditions)}
    ORDER BY COALESCE(dwt."submittedAt", dwt."createdAt") DESC NULLS LAST
    LIMIT 1000
  `);
}

async function getWasteReceiptRows(
  organisationId: string,
  filters: ReportFilters,
) {
  const conditions = [
    sql`(
      wr."organisationId" = ${organisationId}
      OR wr."carrierOrganisationId" = ${organisationId}
      OR wr."receiverOrganisationId" = ${organisationId}
    )`,
    ...buildDateFilters(filters, sql`COALESCE(wr."receivedAt", wr."createdAt")`),
    ...buildStatusFilter(filters, sql`wr.status`),
  ];

  return runRows(sql`
    SELECT
      wr.id AS "Receipt ID",
      wr.status AS "Receipt Status",
      wl.id AS "Listing ID",
      wl.name AS "Listing Name",
      wr."assignmentId" AS "Assignment ID",
      receiver."teamName" AS "Receiver Organisation",
      carrier."teamName" AS "Carrier Organisation",
      u.name AS "Received By",
      wr."receivedAt" AS "Received At",
      item.id AS "Receipt Item ID",
      item."ewcCodes" AS "EWC Codes",
      item."wasteDescription" AS "Waste Description",
      item."physicalForm" AS "Physical Form",
      item."numberOfContainers" AS "Number Of Containers",
      item."typeOfContainers" AS "Container Type",
      item."weightMetric" AS "Weight Metric",
      item."weightAmount" AS "Weight Amount",
      item."weightIsEstimate" AS "Weight Is Estimate",
      item."disposalOrRecoveryCodes" AS "Disposal Or Recovery Codes",
      wr."yourUniqueReference" AS "Unique Reference",
      wr."receiverAuthorisationNumber" AS "Receiver Authorisation Number"
    FROM bb_waste_receipt wr
    LEFT JOIN bb_waste_receipt_item item
      ON item."receiptId" = wr.id
    LEFT JOIN bb_waste_listing wl
      ON wl.id = wr."listingId"
    LEFT JOIN bb_user u
      ON u.id = wr."receivedByUserId"
    LEFT JOIN bb_organisation receiver
      ON receiver.id = wr."receiverOrganisationId"
    LEFT JOIN bb_organisation carrier
      ON carrier.id = wr."carrierOrganisationId"
    ${buildWhere(conditions)}
    ORDER BY COALESCE(wr."receivedAt", wr."createdAt") DESC NULLS LAST
    LIMIT 1000
  `);
}

async function getListingActivityRows(
  organisationId: string,
  filters: ReportFilters,
) {
  const conditions = [
    sql`(
      wl."organisationId" = ${organisationId}
      OR wl."assignedByOrganisationId" = ${organisationId}
      OR wl."assignedCarrierOrganisationId" = ${organisationId}
    )`,
    ...buildDateFilters(filters, sql`wl."createdAt"`),
    ...buildStatusFilter(filters, sql`wl.status`),
  ];

  return runRows(sql`
    SELECT
      wl.id AS "Listing ID",
      wl.name AS "Listing Name",
      wl.location AS "Location",
      owner."teamName" AS "Owner Organisation",
      wl."participationMode" AS "Participation Mode",
      wl."market_mode" AS "Market Mode",
      wl."listing_type" AS "Listing Type",
      wl.visibility AS "Visibility",
      wl."assignmentMethod" AS "Assignment Method",
      wl.status AS "Listing Status",
      wl."startingPrice" AS "Starting Price",
      wl."currentBid" AS "Current Bid",
      wl."winner_bid_id" AS "Winner Bid ID",
      COUNT(b.id) AS "Total Bids",
      wl."endDate" AS "End Date",
      wl."assignedAt" AS "Assigned At",
      wl."createdAt" AS "Created At"
    FROM bb_waste_listing wl
    LEFT JOIN bb_organisation owner
      ON owner.id = wl."organisationId"
    LEFT JOIN bb_bids b
      ON b."listingId" = wl.id
    ${buildWhere(conditions)}
    GROUP BY wl.id, owner."teamName"
    ORDER BY wl."createdAt" DESC
    LIMIT 1000
  `);
}

async function getCarrierPerformanceRows(
  organisationId: string,
  filters: ReportFilters,
) {
  const conditions = [
    sql`(
      ca."managerOrganisationId" = ${organisationId}
      OR ca."carrierOrganisationId" = ${organisationId}
      OR ca."organisationId" = ${organisationId}
    )`,
    ...buildDateFilters(filters, sql`ca."assignedAt"`),
  ];

  return runRows(sql`
    SELECT
      carrier.id AS "Carrier Organisation ID",
      COALESCE(carrier."teamName", 'Unassigned Carrier') AS "Carrier Organisation",
      COUNT(ca.id) AS "Total Assignments",
      COUNT(ca.id) FILTER (WHERE ca.status = 'pending') AS "Pending",
      COUNT(ca.id) FILTER (WHERE ca.status = 'accepted') AS "Accepted",
      COUNT(ca.id) FILTER (WHERE ca.status = 'in_progress') AS "In Progress",
      COUNT(ca.id) FILTER (WHERE ca.status = 'completed') AS "Completed",
      COUNT(ca.id) FILTER (WHERE ca.status = 'cancelled') AS "Cancelled",
      COUNT(i.id) AS "Incidents",
      MIN(ca."assignedAt") AS "First Assigned At",
      MAX(ca."completedAt") AS "Latest Completed At"
    FROM bb_carrier_assignment ca
    LEFT JOIN bb_organisation carrier
      ON carrier.id = ca."carrierOrganisationId"
    LEFT JOIN bb_incident i
      ON i."assignmentId" = ca.id
    ${buildWhere(conditions)}
    GROUP BY carrier.id, carrier."teamName"
    ORDER BY COUNT(ca.id) DESC
    LIMIT 1000
  `);
}

async function getUserAccessAuditRows(
  organisationId: string,
  filters: ReportFilters,
) {
  const conditions = [
    sql`u."organisationId" = ${organisationId}`,
    ...buildDateFilters(filters, sql`u."createdAt"`),
    ...buildStatusFilter(filters, sql`u.status`),
  ];

  return runRows(sql`
    SELECT
      u.id AS "User ID",
      u.name AS "Name",
      u.email AS "Email",
      u.role AS "Role",
      u.status AS "User Status",
      u."isActive" AS "Is Active",
      u."isSuspended" AS "Is Suspended",
      d.name AS "Department",
      d.type AS "Department Type",
      u."lastLoginAt" AS "Last Login At",
      u."createdAt" AS "Created At"
    FROM bb_user u
    LEFT JOIN bb_departments d
      ON d.id = u."departmentId"
    ${buildWhere(conditions)}
    ORDER BY u."createdAt" DESC
    LIMIT 1000
  `);
}

async function getComplianceAuditPackRows(
  organisationId: string,
  filters: ReportFilters,
) {
  const outerConditions = [
    ...buildDateFilters(filters, sql`pack."Date"`),
    ...buildStatusFilter(filters, sql`pack."Status"`),
  ];

  return runRows(sql`
    SELECT *
    FROM (
      SELECT
        'Assignment' AS "Section",
        ca.id AS "Record ID",
        wl.name AS "Listing",
        ca.status AS "Status",
        COALESCE(manager."teamName", carrier."teamName", generator."teamName") AS "Organisation",
        ca."assignedAt" AS "Date",
        CONCAT('Assignment method: ', ca."assignmentMethod", ', verification: ', COALESCE(ca."verificationCode", 'none')) AS "Summary"
      FROM bb_carrier_assignment ca
      LEFT JOIN bb_waste_listing wl
        ON wl.id = ca."listingId"
      LEFT JOIN bb_organisation generator
        ON generator.id = ca."assignedByOrganisationId"
      LEFT JOIN bb_organisation manager
        ON manager.id = ca."managerOrganisationId"
      LEFT JOIN bb_organisation carrier
        ON carrier.id = ca."carrierOrganisationId"
      WHERE ${assignmentOrganisationCondition(organisationId)}

      UNION ALL

      SELECT
        'Incident' AS "Section",
        i.id AS "Record ID",
        wl.name AS "Listing",
        i.status AS "Status",
        reporter."teamName" AS "Organisation",
        COALESCE(i."incidentDate", i."createdAt") AS "Date",
        i.summary AS "Summary"
      FROM bb_incident i
      LEFT JOIN bb_waste_listing wl
        ON wl.id = i."listingId"
      LEFT JOIN bb_organisation reporter
        ON reporter.id = i."reportedByOrganisationId"
      WHERE (
        i."organisationId" = ${organisationId}
        OR i."reportedByOrganisationId" = ${organisationId}
      )

      UNION ALL

      SELECT
        'Waste Receipt' AS "Section",
        wr.id AS "Record ID",
        wl.name AS "Listing",
        wr.status AS "Status",
        receiver."teamName" AS "Organisation",
        COALESCE(wr."receivedAt", wr."createdAt") AS "Date",
        CONCAT('Receipt reference: ', COALESCE(wr."yourUniqueReference", 'none')) AS "Summary"
      FROM bb_waste_receipt wr
      LEFT JOIN bb_waste_listing wl
        ON wl.id = wr."listingId"
      LEFT JOIN bb_organisation receiver
        ON receiver.id = wr."receiverOrganisationId"
      WHERE (
        wr."organisationId" = ${organisationId}
        OR wr."carrierOrganisationId" = ${organisationId}
        OR wr."receiverOrganisationId" = ${organisationId}
      )

      UNION ALL

      SELECT
        'DWT Submission' AS "Section",
        dwt.id AS "Record ID",
        wl.name AS "Listing",
        dwt.status AS "Status",
        org."teamName" AS "Organisation",
        COALESCE(dwt."submittedAt", dwt."createdAt") AS "Date",
        CONCAT('WTID: ', COALESCE(dwt."wasteTrackingId", 'none'), ', method: ', dwt.method) AS "Summary"
      FROM bb_waste_tracking_submission dwt
      LEFT JOIN bb_waste_listing wl
        ON wl.id = dwt."listingId"
      LEFT JOIN bb_organisation org
        ON org.id = dwt."organisationId"
      WHERE dwt."organisationId" = ${organisationId}
    ) pack
    ${buildWhere(outerConditions)}
    ORDER BY pack."Date" DESC NULLS LAST
    LIMIT 1500
  `);
}