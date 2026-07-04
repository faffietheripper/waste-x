// src/app/admin/audit/compliance/page.tsx

import Link from "next/link";

import { database } from "@/db/database";
import {
  carrierAssignments,
  incidents,
  organisations,
  wasteListings,
  wasteReceipts,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import { ExportButton } from "./ExportButton";

/* =========================================================
   PAGE
========================================================= */

export default async function CompliancePage() {
  await requirePlatformAdmin();

  const listings = await database.select().from(wasteListings);
  const allIncidents = await database.select().from(incidents);
  const assignments = await database.select().from(carrierAssignments);
  const orgs = await database.select().from(organisations);
  const receipts = await database.select().from(wasteReceipts);
  const dwtSubmissions = await database.select().from(wasteTrackingSubmissions);

  const totalListings = listings.length;

  const completedListings = listings.filter(
    (listing) => listing.status === "completed",
  ).length;

  const incompleteListings = listings.filter(
    (listing) =>
      listing.status !== "completed" && listing.status !== "cancelled",
  ).length;

  const totalAssignments = assignments.length;

  const completedAssignments = assignments.filter(
    (assignment) => assignment.status === "completed" || assignment.completedAt,
  ).length;

  const activeAssignments = assignments.filter((assignment) =>
    ["accepted", "in_progress", "assigned"].includes(assignment.status),
  ).length;

  const unresolvedIncidents = allIncidents.filter((incident) =>
    ["open", "under_review"].includes(incident.status),
  ).length;

  const resolvedIncidents = allIncidents.filter(
    (incident) => incident.status === "resolved",
  ).length;

  const verificationUsed = assignments.filter(
    (assignment) => assignment.codeUsedAt !== null,
  ).length;

  const confirmedReceipts = receipts.filter((receipt) =>
    ["confirmed", "submitted"].includes(receipt.status),
  ).length;

  const dwtAccepted = dwtSubmissions.filter((submission) =>
    ["accepted", "accepted_with_warnings"].includes(submission.status),
  ).length;

  const dwtNeedsAttention = dwtSubmissions.filter((submission) =>
    ["rejected", "failed"].includes(submission.status),
  ).length;

  const dwtPending = dwtSubmissions.filter(
    (submission) => submission.status === "pending",
  ).length;

  const verificationRate = calculateRate(verificationUsed, totalAssignments);
  const completionRate = calculateRate(completedListings, totalListings);
  const assignmentCompletionRate = calculateRate(
    completedAssignments,
    totalAssignments,
  );
  const receiptConfirmationRate = calculateRate(confirmedReceipts, receipts.length);
  const dwtSuccessRate = calculateRate(dwtAccepted, dwtSubmissions.length);
  const incidentResolutionRate = calculateRate(
    resolvedIncidents,
    allIncidents.length,
  );

  const orgStats = orgs
    .map((org) => {
      const orgListings = listings.filter(
        (listing) => listing.organisationId === org.id,
      );

      const orgIncidents = allIncidents.filter(
        (incident) => incident.organisationId === org.id,
      );

      const orgAssignments = assignments.filter((assignment) =>
        assignmentBelongsToOrganisation(assignment, org.id),
      );

      const orgReceipts = receipts.filter(
        (receipt) => receipt.organisationId === org.id,
      );

      const orgDwtSubmissions = dwtSubmissions.filter(
        (submission) => submission.organisationId === org.id,
      );

      const orgCompletedListings = orgListings.filter(
        (listing) => listing.status === "completed",
      ).length;

      const orgCompletedAssignments = orgAssignments.filter(
        (assignment) =>
          assignment.status === "completed" || Boolean(assignment.completedAt),
      ).length;

      const orgVerificationUsed = orgAssignments.filter(
        (assignment) => assignment.codeUsedAt !== null,
      ).length;

      const orgConfirmedReceipts = orgReceipts.filter((receipt) =>
        ["confirmed", "submitted"].includes(receipt.status),
      ).length;

      const orgAcceptedDwt = orgDwtSubmissions.filter((submission) =>
        ["accepted", "accepted_with_warnings"].includes(submission.status),
      ).length;

      const orgRejectedDwt = orgDwtSubmissions.filter((submission) =>
        ["rejected", "failed"].includes(submission.status),
      ).length;

      const orgUnresolvedIncidents = orgIncidents.filter((incident) =>
        ["open", "under_review"].includes(incident.status),
      ).length;

      const orgListingCompletionRate = calculateRate(
        orgCompletedListings,
        orgListings.length,
      );

      const orgAssignmentCompletionRate = calculateRate(
        orgCompletedAssignments,
        orgAssignments.length,
      );

      const orgVerificationRate = calculateRate(
        orgVerificationUsed,
        orgAssignments.length,
      );

      const orgReceiptRate = calculateRate(
        orgConfirmedReceipts,
        orgReceipts.length,
      );

      const orgDwtSuccessRate = calculateRate(
        orgAcceptedDwt,
        orgDwtSubmissions.length,
      );

      const incidentPenalty =
        orgListings.length > 0
          ? Math.min(30, Math.round((orgUnresolvedIncidents / orgListings.length) * 30))
          : orgUnresolvedIncidents > 0
            ? 20
            : 0;

      const dwtPenalty =
        orgRejectedDwt > 0
          ? Math.min(15, orgRejectedDwt * 5)
          : 0;

      const trustScore = clampScore(
        Math.round(
          orgListingCompletionRate * 0.25 +
            orgAssignmentCompletionRate * 0.25 +
            orgVerificationRate * 0.15 +
            orgReceiptRate * 0.15 +
            orgDwtSuccessRate * 0.2 -
            incidentPenalty -
            dwtPenalty,
        ),
      );

      const riskScore = 100 - trustScore;

      return {
        id: org.id,
        name: org.teamName ?? "Unnamed organisation",
        status: org.status,
        capabilities: Array.isArray(org.capabilities) ? org.capabilities : [],
        trustScore,
        riskScore,
        listings: orgListings.length,
        assignments: orgAssignments.length,
        receipts: orgReceipts.length,
        dwtSubmissions: orgDwtSubmissions.length,
        incidents: orgIncidents.length,
        unresolvedIncidents: orgUnresolvedIncidents,
        completionRate: orgListingCompletionRate,
        assignmentCompletionRate: orgAssignmentCompletionRate,
        verificationRate: orgVerificationRate,
        receiptRate: orgReceiptRate,
        dwtSuccessRate: orgDwtSuccessRate,
      };
    })
    .sort((first, second) => second.riskScore - first.riskScore);

  const highRiskOrgs = orgStats
    .filter((org) => org.riskScore >= 60 || org.unresolvedIncidents > 0)
    .slice(0, 6);

  const strongestOrgs = [...orgStats]
    .sort((first, second) => second.trustScore - first.trustScore)
    .slice(0, 6);

  const complianceScore = clampScore(
    Math.round(
      completionRate * 0.2 +
        assignmentCompletionRate * 0.2 +
        verificationRate * 0.15 +
        receiptConfirmationRate * 0.15 +
        dwtSuccessRate * 0.2 +
        incidentResolutionRate * 0.1,
    ),
  );

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
              Compliance & Audit Intelligence
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              System-wide chain integrity, verification usage, incident risk,
              receipt confirmation and Digital Waste Tracking visibility.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/audit/chain"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Chain of custody
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

      {/* ================= TOP SCORE ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm xl:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Compliance Score
          </p>

          <div className="mt-5 flex items-end gap-3">
            <p className="text-5xl font-black tracking-tight text-gray-950">
              {complianceScore}
            </p>

            <p className="pb-2 text-sm font-semibold text-gray-400">/ 100</p>
          </div>

          <p className="mt-4 text-sm leading-6 text-gray-500">
            A combined platform signal based on completed chains, assignment
            completion, verification, receipts, DWT success and incident
            resolution.
          </p>

          <div className="mt-6">
            <ScoreBar value={complianceScore} />
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:col-span-2">
          <Metric
            label="Chain Completion"
            value={`${completionRate}%`}
            helper={`${completedListings} of ${totalListings} listings completed`}
          />

          <Metric
            label="Assignment Completion"
            value={`${assignmentCompletionRate}%`}
            helper={`${completedAssignments} of ${totalAssignments} assignments completed`}
          />

          <Metric
            label="Verification Usage"
            value={`${verificationRate}%`}
            helper={`${verificationUsed} verification codes used`}
          />

          <Metric
            label="Receipt Confirmation"
            value={`${receiptConfirmationRate}%`}
            helper={`${confirmedReceipts} confirmed/submitted receipts`}
          />
        </section>
      </section>

      {/* ================= RISK SUMMARY ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Incomplete Chains"
          value={incompleteListings}
          helper="Open operational custody chains"
        />

        <Metric
          label="Unresolved Incidents"
          value={unresolvedIncidents}
          helper="Open or under review incidents"
          tone={unresolvedIncidents > 0 ? "danger" : "default"}
        />

        <Metric
          label="DWT Success Rate"
          value={`${dwtSuccessRate}%`}
          helper={`${dwtAccepted} accepted from ${dwtSubmissions.length} attempts`}
        />

        <Metric
          label="DWT Needs Attention"
          value={dwtNeedsAttention + dwtPending}
          helper={`${dwtNeedsAttention} rejected/failed, ${dwtPending} pending`}
          tone={dwtNeedsAttention > 0 ? "danger" : "default"}
        />
      </section>

      {/* ================= DWT + INCIDENT VISIBILITY ================= */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          eyebrow="Digital Waste Tracking"
          title="DWT compliance visibility"
          description="Tracks whether DWT submissions are being accepted or need admin review."
          actionHref="/admin/digital-waste-tracking"
          actionLabel="Open DWT"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <MiniStat
              label="Total attempts"
              value={dwtSubmissions.length}
              helper="All recorded DWT API attempts"
            />

            <MiniStat
              label="Accepted"
              value={dwtAccepted}
              helper="Accepted or accepted with warnings"
            />

            <MiniStat
              label="Rejected / failed"
              value={dwtNeedsAttention}
              helper="Requires investigation"
            />

            <MiniStat
              label="Success rate"
              value={`${dwtSuccessRate}%`}
              helper="Accepted / total attempts"
            />
          </div>
        </Panel>

        <Panel
          eyebrow="Incidents"
          title="Incident posture"
          description="Shows whether the platform has unresolved incident risk."
          actionHref="/admin/incidents"
          actionLabel="Manage incidents"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <MiniStat
              label="Total incidents"
              value={allIncidents.length}
              helper="All incident records"
            />

            <MiniStat
              label="Unresolved"
              value={unresolvedIncidents}
              helper="Open or under review"
            />

            <MiniStat
              label="Resolved"
              value={resolvedIncidents}
              helper="Closed compliance issues"
            />

            <MiniStat
              label="Resolution rate"
              value={`${incidentResolutionRate}%`}
              helper="Resolved / total incidents"
            />
          </div>
        </Panel>
      </section>

      {/* ================= ORGANISATION TRUST SCORES ================= */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          eyebrow="Trust Engine"
          title="Highest trust organisations"
          description="Organisations with stronger completion, verification, receipt and DWT performance."
          actionHref="/admin/organisations"
          actionLabel="View organisations"
        >
          {strongestOrgs.length === 0 ? (
            <EmptyState message="No organisations found yet." />
          ) : (
            <div className="space-y-3">
              {strongestOrgs.map((org) => (
                <OrganisationScoreCard
                  key={org.id}
                  org={org}
                  mode="trust"
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          eyebrow="Risk Engine"
          title="High risk organisations"
          description="Organisations with unresolved incidents, low trust score or failed DWT activity."
          actionHref="/admin/incidents"
          actionLabel="Incident management"
        >
          {highRiskOrgs.length === 0 ? (
            <EmptyState message="No high risk organisations found." />
          ) : (
            <div className="space-y-3">
              {highRiskOrgs.map((org) => (
                <OrganisationScoreCard key={org.id} org={org} mode="risk" />
              ))}
            </div>
          )}
        </Panel>
      </section>

      {/* ================= FULL ORG TABLE ================= */}
      <Panel
        eyebrow="Organisation Register"
        title="Compliance scoring by organisation"
        description="Full organisation-level view of trust, risk, incidents, assignments, receipts and DWT activity."
        actionHref="/admin/audit/entity"
        actionLabel="Entity explorer"
      >
        {orgStats.length === 0 ? (
          <EmptyState message="No organisations have been created yet." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trust</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Completion</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>DWT</TableHead>
                    <TableHead>Incidents</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {orgStats.map((org) => (
                    <tr key={org.id} className="transition hover:bg-gray-50">
                      <TableCell>
                        <div>
                          <p className="font-semibold text-gray-950">
                            {org.name}
                          </p>

                          <p className="mt-1 text-xs text-gray-400">
                            {org.capabilities.length > 0
                              ? org.capabilities.join(", ")
                              : "No capabilities"}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <StatusBadge status={org.status} />
                      </TableCell>

                      <TableCell>
                        <ScorePill value={org.trustScore} type="trust" />
                      </TableCell>

                      <TableCell>
                        <ScorePill value={org.riskScore} type="risk" />
                      </TableCell>

                      <TableCell>{org.completionRate}%</TableCell>
                      <TableCell>{org.verificationRate}%</TableCell>
                      <TableCell>{org.dwtSuccessRate}%</TableCell>

                      <TableCell>
                        <span
                          className={
                            org.unresolvedIncidents > 0
                              ? "font-semibold text-red-700"
                              : "font-semibold text-gray-700"
                          }
                        >
                          {org.unresolvedIncidents}
                        </span>{" "}
                        unresolved
                      </TableCell>

                      <TableCell>
                        <Link
                          href={`/admin/audit/entity?entityId=${encodeURIComponent(
                            org.id,
                          )}`}
                          className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                        >
                          Investigate
                        </Link>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      {/* ================= EXPORT ================= */}
      <Panel
        eyebrow="Reports"
        title="Audit reports"
        description="Generate audit-ready documentation for platform compliance and investor review."
      >
        <div className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-gray-50 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-gray-950">
              Export full compliance report
            </p>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Includes chain completion, incidents, verification, organisation
              trust scoring, DWT visibility and platform compliance indicators.
            </p>
          </div>

          <ExportButton />
        </div>
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
  children: React.ReactNode;
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

function MiniStat({
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
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-gray-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function OrganisationScoreCard({
  org,
  mode,
}: {
  org: OrganisationComplianceStats;
  mode: "trust" | "risk";
}) {
  const score = mode === "trust" ? org.trustScore : org.riskScore;

  return (
    <div className="rounded-[1.35rem] border border-gray-200 bg-gray-50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={org.status} />

            {org.unresolvedIncidents > 0 && (
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
                {org.unresolvedIncidents} unresolved
              </span>
            )}
          </div>

          <h3 className="mt-3 text-sm font-bold text-gray-950">{org.name}</h3>

          <p className="mt-2 text-xs leading-5 text-gray-500">
            Completion {org.completionRate}% • Verification{" "}
            {org.verificationRate}% • DWT {org.dwtSuccessRate}% • Incidents{" "}
            {org.incidents}
          </p>
        </div>

        <div className="text-left md:text-right">
          <ScorePill value={score} type={mode} />

          <div className="mt-3">
            <Link
              href={`/admin/audit/entity?entityId=${encodeURIComponent(org.id)}`}
              className="text-xs font-semibold text-gray-700 underline underline-offset-4 hover:text-gray-950"
            >
              Investigate
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-gray-950"
        style={{ width: `${clampScore(value)}%` }}
      />
    </div>
  );
}

function ScorePill({
  value,
  type,
}: {
  value: number;
  type: "trust" | "risk";
}) {
  const isRisk = type === "risk";

  const className = isRisk
    ? value >= 60
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-gray-200 bg-gray-50 text-gray-700"
    : value >= 70
      ? "border-gray-900 bg-gray-950 text-white"
      : value >= 40
        ? "border-gray-300 bg-gray-100 text-gray-800"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${className}`}
    >
      {value}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const formatted = formatStatus(status);

  const className =
    status === "ACTIVE" || status === "active"
      ? "border-gray-900 bg-gray-950 text-white"
      : status === "PENDING" || status === "pending"
        ? "border-gray-300 bg-gray-100 text-gray-800"
        : status === "SUSPENDED" ||
            status === "suspended" ||
            status === "REJECTED" ||
            status === "rejected"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-gray-200 bg-white text-gray-600";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {formatted}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
      <p className="text-sm font-semibold text-gray-950">{message}</p>

      <p className="mt-2 text-sm leading-6 text-gray-500">
        Compliance information will appear here once the platform has enough
        operational records.
      </p>
    </div>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
      {children}
    </th>
  );
}

function TableCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-4 align-middle text-sm text-gray-600">
      {children}
    </td>
  );
}

/* =========================================================
   HELPERS
========================================================= */

type OrganisationComplianceStats = {
  id: string;
  name: string;
  status: string | null;
  capabilities: string[];
  trustScore: number;
  riskScore: number;
  listings: number;
  assignments: number;
  receipts: number;
  dwtSubmissions: number;
  incidents: number;
  unresolvedIncidents: number;
  completionRate: number;
  assignmentCompletionRate: number;
  verificationRate: number;
  receiptRate: number;
  dwtSuccessRate: number;
};

function calculateRate(value: number, total: number) {
  if (!total || total <= 0) return 0;

  return Math.round((value / total) * 100);
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(100, value));
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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