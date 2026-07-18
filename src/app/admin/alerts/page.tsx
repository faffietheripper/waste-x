// src/app/admin/alerts/page.tsx

import Link from "next/link";

import { database } from "@/db/database";
import {
  carrierAssignments,
  incidents,
  organisations,
  wasteListings,
  wasteReceipts,
  wasteTrackingOrganisationSettings,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

type AlertSeverity = "critical" | "high" | "medium" | "low";

type PlatformAlert = {
  id: string;
  severity: AlertSeverity;
  category:
    | "Incident"
    | "Operations"
    | "Organisation"
    | "Digital Waste Tracking"
    | "Verification"
    | "Receipt";
  title: string;
  message: string;
  organisationName?: string;
  entityId?: string;
  createdAt?: Date | string | null;
  actionHref?: string;
  actionLabel?: string;
};

export default async function AlertsPage() {
  await requirePlatformAdmin();

  const [
    orgs,
    incidentsData,
    listings,
    assignments,
    receipts,
    dwtSubmissions,
    dwtSettings,
  ] = await Promise.all([
    database.select().from(organisations),
    database.select().from(incidents),
    database.select().from(wasteListings),
    database.select().from(carrierAssignments),
    database.select().from(wasteReceipts),
    database.select().from(wasteTrackingSubmissions),
    database.select().from(wasteTrackingOrganisationSettings),
  ]);

  const alerts: PlatformAlert[] = [];

  const dwtSettingsByOrgId = new Map(
    dwtSettings.map((setting) => [setting.organisationId, setting]),
  );

  const acceptedDwtAssignmentIds = new Set(
    dwtSubmissions
      .filter((submission) =>
        ["accepted", "accepted_with_warnings"].includes(submission.status),
      )
      .map((submission) => submission.assignmentId)
      .filter(Boolean),
  );

  const acceptedDwtListingIds = new Set(
    dwtSubmissions
      .filter((submission) =>
        ["accepted", "accepted_with_warnings"].includes(submission.status),
      )
      .map((submission) =>
        submission.listingId === null || submission.listingId === undefined
          ? null
          : String(submission.listingId),
      )
      .filter(Boolean),
  );

  for (const org of orgs) {
    const organisationName = org.teamName ?? "Unnamed organisation";

    const orgListings = listings.filter(
      (listing) => listing.organisationId === org.id,
    );

    const orgIncidents = incidentsData.filter(
      (incident) => incident.organisationId === org.id,
    );

    const unresolvedIncidents = orgIncidents.filter((incident) =>
      ["open", "under_review"].includes(incident.status),
    );

    const orgAssignments = assignments.filter((assignment) =>
      assignmentBelongsToOrganisation(assignment, org.id),
    );

    const activeAssignments = orgAssignments.filter((assignment) =>
      ["assigned", "accepted", "in_progress", "pending"].includes(
        assignment.status,
      ),
    );

    const stuckAssignments = activeAssignments.filter((assignment) =>
      isOlderThanDays(assignment.assignedAt, 7),
    );

    const orgReceipts = receipts.filter(
      (receipt) => receipt.organisationId === org.id,
    );

    const readyReceiptsWithoutAcceptedDwt = orgReceipts.filter((receipt) => {
      if (!["confirmed", "submitted"].includes(receipt.status)) return false;

      const assignmentId = cleanString(receipt.assignmentId);
      const listingId =
        receipt.listingId === null || receipt.listingId === undefined
          ? null
          : String(receipt.listingId);

      const alreadyAccepted =
        (assignmentId ? acceptedDwtAssignmentIds.has(assignmentId) : false) ||
        (listingId ? acceptedDwtListingIds.has(listingId) : false);

      return !alreadyAccepted;
    });

    const orgDwtSubmissions = dwtSubmissions.filter(
      (submission) => submission.organisationId === org.id,
    );

    const failedDwtSubmissions = orgDwtSubmissions.filter((submission) =>
      ["rejected", "failed"].includes(submission.status),
    );

    const pendingDwtSubmissions = orgDwtSubmissions.filter(
  (submission) =>
    submission.status === "draft" || submission.status === "submitted",
);
    const dwtSetting = dwtSettingsByOrgId.get(org.id);

    const verificationUsed = orgAssignments.filter(
      (assignment) => assignment.codeUsedAt !== null,
    ).length;

    const verificationRate = calculateRate(
      verificationUsed,
      orgAssignments.length,
    );

    if (org.status === "PENDING") {
      alerts.push({
        id: `org-pending-${org.id}`,
        severity: "medium",
        category: "Organisation",
        title: "Organisation awaiting approval",
        message: `${organisationName} is waiting for platform admin approval.`,
        organisationName,
        entityId: org.id,
        createdAt: org.createdAt,
        actionHref: `/admin/organisations/${org.id}`,
        actionLabel: "Review organisation",
      });
    }

    if (org.status === "SUSPENDED") {
      alerts.push({
        id: `org-suspended-${org.id}`,
        severity: "high",
        category: "Organisation",
        title: "Organisation suspended",
        message: `${organisationName} is currently suspended.`,
        organisationName,
        entityId: org.id,
        createdAt: org.createdAt,
        actionHref: `/admin/organisations/${org.id}`,
        actionLabel: "Open organisation",
      });
    }

    if (unresolvedIncidents.length > 0) {
      alerts.push({
        id: `incidents-unresolved-${org.id}`,
        severity: unresolvedIncidents.length >= 3 ? "critical" : "high",
        category: "Incident",
        title: "Unresolved incidents",
        message: `${organisationName} has ${unresolvedIncidents.length} unresolved incident${
          unresolvedIncidents.length === 1 ? "" : "s"
        }.`,
        organisationName,
        entityId: org.id,
        createdAt: unresolvedIncidents[0]?.createdAt,
        actionHref: "/admin/incidents",
        actionLabel: "View incidents",
      });
    }

    if (stuckAssignments.length > 0) {
      alerts.push({
        id: `stuck-assignments-${org.id}`,
        severity: stuckAssignments.length >= 3 ? "high" : "medium",
        category: "Operations",
        title: "Assignments appear stuck",
        message: `${organisationName} has ${stuckAssignments.length} active assignment${
          stuckAssignments.length === 1 ? "" : "s"
        } older than 7 days.`,
        organisationName,
        entityId: org.id,
        createdAt: stuckAssignments[0]?.assignedAt,
        actionHref: `/admin/audit/entity?entityId=${encodeURIComponent(org.id)}`,
        actionLabel: "Investigate",
      });
    }

    if (orgAssignments.length >= 3 && verificationRate < 50) {
      alerts.push({
        id: `low-verification-${org.id}`,
        severity: "medium",
        category: "Verification",
        title: "Low verification usage",
        message: `${organisationName} has only ${verificationRate}% verification usage across assignments.`,
        organisationName,
        entityId: org.id,
        actionHref: `/admin/organisations/${org.id}`,
        actionLabel: "Open organisation",
      });
    }

    if (dwtSetting?.isEnabled && !cleanString(dwtSetting.apiCode)) {
      alerts.push({
        id: `dwt-missing-api-code-${org.id}`,
        severity: "high",
        category: "Digital Waste Tracking",
        title: "DWT enabled but receiver API code missing",
        message: `${organisationName} has Digital Waste Tracking enabled but no receiver API code stored.`,
        organisationName,
        entityId: org.id,
        createdAt: dwtSetting.updatedAt,
        actionHref: `/admin/organisations/${org.id}`,
        actionLabel: "Review DWT setup",
      });
    }

    if (failedDwtSubmissions.length > 0) {
      alerts.push({
        id: `dwt-failed-${org.id}`,
        severity: failedDwtSubmissions.length >= 3 ? "critical" : "high",
        category: "Digital Waste Tracking",
        title: "DWT submissions need attention",
        message: `${organisationName} has ${failedDwtSubmissions.length} rejected or failed DWT submission${
          failedDwtSubmissions.length === 1 ? "" : "s"
        }.`,
        organisationName,
        entityId: org.id,
        createdAt: failedDwtSubmissions[0]?.lastAttemptedAt,
        actionHref: "/admin/digital-waste-tracking",
        actionLabel: "Open DWT",
      });
    }

   if (pendingDwtSubmissions.length > 0) {
  alerts.push({
    id: `dwt-awaiting-final-status-${org.id}`,
    severity: "medium",
    category: "Digital Waste Tracking",
    title: "DWT submissions awaiting final status",
    message: `${organisationName} has ${pendingDwtSubmissions.length} DWT submission${
      pendingDwtSubmissions.length === 1 ? "" : "s"
    } in draft or submitted state.`,
    organisationName,
    entityId: org.id,
    createdAt: pendingDwtSubmissions[0]?.lastAttemptedAt,
    actionHref: "/admin/digital-waste-tracking",
    actionLabel: "Open DWT",
  });
}

    if (readyReceiptsWithoutAcceptedDwt.length > 0) {
      alerts.push({
        id: `receipt-ready-dwt-${org.id}`,
        severity: "medium",
        category: "Receipt",
        title: "Receipts ready for DWT submission",
        message: `${organisationName} has ${readyReceiptsWithoutAcceptedDwt.length} confirmed receipt${
          readyReceiptsWithoutAcceptedDwt.length === 1 ? "" : "s"
        } without an accepted DWT submission.`,
        organisationName,
        entityId: org.id,
        createdAt: readyReceiptsWithoutAcceptedDwt[0]?.receivedAt,
        actionHref: "/admin/digital-waste-tracking",
        actionLabel: "Open DWT",
      });
    }

    const assignedListings = orgListings.filter(
      (listing) => listing.status === "assigned",
    );

    if (assignedListings.length > 2) {
      alerts.push({
        id: `assigned-listings-${org.id}`,
        severity: "medium",
        category: "Operations",
        title: "Multiple assigned listings not completed",
        message: `${organisationName} has ${assignedListings.length} listings still sitting at assigned status.`,
        organisationName,
        entityId: org.id,
        createdAt: assignedListings[0]?.createdAt,
        actionHref: `/admin/audit/entity?entityId=${encodeURIComponent(org.id)}`,
        actionLabel: "Investigate",
      });
    }
  }

  const sortedAlerts = alerts.sort((first, second) => {
    const severityDifference =
      getSeverityRank(second.severity) - getSeverityRank(first.severity);

    if (severityDifference !== 0) return severityDifference;

    const firstDate = first.createdAt ? new Date(first.createdAt).getTime() : 0;
    const secondDate = second.createdAt
      ? new Date(second.createdAt).getTime()
      : 0;

    return secondDate - firstDate;
  });

  const criticalAlerts = sortedAlerts.filter(
    (alert) => alert.severity === "critical",
  ).length;

  const highAlerts = sortedAlerts.filter(
    (alert) => alert.severity === "high",
  ).length;

  const mediumAlerts = sortedAlerts.filter(
    (alert) => alert.severity === "medium",
  ).length;

  const lowAlerts = sortedAlerts.filter(
    (alert) => alert.severity === "low",
  ).length;

  const topAlerts = sortedAlerts.slice(0, 12);

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Platform Monitoring
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              System Alerts
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Admin alerts for unresolved incidents, stuck operations, Digital
              Waste Tracking problems, organisation approval, verification usage
              and receipt readiness.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/audit/compliance"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Compliance audit
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

      {/* ================= KPI GRID ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Active Alerts"
          value={sortedAlerts.length}
          helper="All current platform alerts"
          tone={sortedAlerts.length > 0 ? "danger" : "default"}
        />

        <Metric
          label="Critical"
          value={criticalAlerts}
          helper="Needs urgent attention"
          tone={criticalAlerts > 0 ? "danger" : "default"}
        />

        <Metric
          label="High"
          value={highAlerts}
          helper="Important admin review"
          tone={highAlerts > 0 ? "danger" : "default"}
        />

        <Metric
          label="Medium"
          value={mediumAlerts}
          helper="Operational follow-up"
        />

        <Metric label="Low" value={lowAlerts} helper="Low priority notices" />
      </section>

      {/* ================= HEALTH SUMMARY ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Alert Health
          </p>

          <div className="mt-5 flex items-end gap-3">
            <p
              className={`text-5xl font-black tracking-tight ${
                sortedAlerts.length > 0 ? "text-red-700" : "text-gray-950"
              }`}
            >
              {sortedAlerts.length > 0 ? "Review" : "Clear"}
            </p>
          </div>

          <p className="mt-4 text-sm leading-6 text-gray-500">
            Alerts are generated from platform data. They do not change records
            automatically, but they highlight where an admin should investigate.
          </p>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:col-span-2">
          <MiniMetric
            label="Organisations scanned"
            value={orgs.length}
            helper="Checked for onboarding and operational issues"
          />

          <MiniMetric
            label="Incidents scanned"
            value={incidentsData.length}
            helper="Open, under review, resolved and rejected"
          />

          <MiniMetric
            label="Assignments scanned"
            value={assignments.length}
            helper="Checked for stuck work and verification"
          />

          <MiniMetric
            label="DWT attempts scanned"
            value={dwtSubmissions.length}
            helper="Checked for rejected, failed and pending attempts"
          />
        </section>
      </section>

      {/* ================= ALERT FEED ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Alert Feed
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Current platform alerts
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Showing the highest priority alerts first. Use the action links to
              investigate the affected organisation, DWT record, incident or
              audit trail.
            </p>
          </div>

          <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
            Top {topAlerts.length} shown
          </span>
        </div>

        {sortedAlerts.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10">
            <p className="text-sm font-semibold text-gray-950">
              No active alerts.
            </p>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              The platform currently has no generated alerts from incidents,
              DWT submissions, organisation onboarding, stuck assignments or
              verification usage.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {topAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </section>

      {/* ================= CATEGORY SUMMARY ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Categories
          </p>

          <h2 className="mt-2 text-lg font-bold text-gray-950">
            Alert breakdown
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            A grouped view of where the alerts are coming from.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {getCategoryCounts(sortedAlerts).map((category) => (
            <MiniMetric
              key={category.category}
              label={category.category}
              value={category.count}
              helper="Generated alerts"
              tone={category.count > 0 ? "danger" : "default"}
            />
          ))}
        </div>
      </section>
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

function MiniMetric({
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
        className={`mt-3 text-2xl font-bold tracking-tight ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function AlertCard({ alert }: { alert: PlatformAlert }) {
  const tone = getAlertTone(alert.severity);

  return (
    <article
      className={`rounded-[1.5rem] border p-5 shadow-sm ${tone.container}`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.badge}`}
            >
              {alert.severity}
            </span>

            <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
              {alert.category}
            </span>
          </div>

          <h3 className="mt-3 text-sm font-bold text-gray-950">
            {alert.title}
          </h3>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-600">
            {alert.message}
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
            {alert.organisationName && (
              <span>
                Organisation:{" "}
                <span className="font-semibold text-gray-700">
                  {alert.organisationName}
                </span>
              </span>
            )}

            {alert.entityId && (
              <span className="break-all">
                Entity:{" "}
                <span className="font-semibold text-gray-700">
                  {alert.entityId}
                </span>
              </span>
            )}

            <span>{formatDateTime(alert.createdAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {alert.actionHref && alert.actionLabel && (
            <Link
              href={alert.actionHref}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              {alert.actionLabel}
            </Link>
          )}

          {alert.entityId && (
            <Link
              href={`/admin/audit/entity?entityId=${encodeURIComponent(
                alert.entityId,
              )}`}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Audit
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function assignmentBelongsToOrganisation(
  assignment: unknown,
  organisationId: string,
) {
  const row = assignment as Record<string, unknown>;

  return (
    row.organisationId === organisationId ||
    row.generatorOrganisationId === organisationId ||
    row.carrierOrganisationId === organisationId ||
    row.managerOrganisationId === organisationId ||
    row.assignedByOrganisationId === organisationId
  );
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : null;
}

function calculateRate(value: number, total: number) {
  if (!total || total <= 0) return 0;

  return Math.round((value / total) * 100);
}

function isOlderThanDays(value: Date | string | null | undefined, days: number) {
  if (!value) return false;

  const date = new Date(value).getTime();

  if (!Number.isFinite(date)) return false;

  const ageMs = Date.now() - date;
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  return ageMs > thresholdMs;
}

function getSeverityRank(severity: AlertSeverity) {
  const rank: Record<AlertSeverity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  return rank[severity];
}

function getAlertTone(severity: AlertSeverity) {
  if (severity === "critical" || severity === "high") {
    return {
      container: "border-red-200 bg-red-50",
      badge: "border-red-200 bg-white text-red-700",
    };
  }

  if (severity === "medium") {
    return {
      container: "border-gray-200 bg-gray-50",
      badge: "border-gray-300 bg-white text-gray-800",
    };
  }

  return {
    container: "border-gray-200 bg-white",
    badge: "border-gray-200 bg-gray-50 text-gray-600",
  };
}

function getCategoryCounts(alerts: PlatformAlert[]) {
  const categories: PlatformAlert["category"][] = [
    "Incident",
    "Operations",
    "Organisation",
    "Digital Waste Tracking",
    "Verification",
    "Receipt",
  ];

  return categories.map((category) => ({
    category,
    count: alerts.filter((alert) => alert.category === category).length,
  }));
}

function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "No date recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}