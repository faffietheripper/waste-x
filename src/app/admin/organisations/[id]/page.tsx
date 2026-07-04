// src/app/admin/organisations/[id]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  auditEvents,
  carrierAssignments,
  incidents,
  users,
  wasteListings,
  wasteReceipts,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import { getOrganisationById } from "../actions";
import { ExportOrgButton } from "./ExportButton";

type AdminOrganisationParams =
  | {
      id: string;
    }
  | Promise<{
      id: string;
    }>;

type OptionalOrganisationFields = {
  status?: string | null;
  capabilities?: string[] | null;
  email?: string | null;
  emailAddress?: string | null;
  telephone?: string | null;
  streetAddress?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  county?: string | null;
  country?: string | null;
  postcode?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
};

export default async function AdminOrganisationPage({
  params,
}: {
  params: AdminOrganisationParams;
}) {
  await requirePlatformAdmin();

  const resolvedParams = await params;
  const orgId = resolvedParams.id;

  const org = await getOrganisationById(orgId);

  if (!org) {
    notFound();
  }

  const orgFields = org as typeof org & OptionalOrganisationFields;

  const listings = await database.select().from(wasteListings);
  const allIncidents = await database.select().from(incidents);
  const assignments = await database.select().from(carrierAssignments);
  const receipts = await database.select().from(wasteReceipts);
  const dwtSubmissions = await database.select().from(wasteTrackingSubmissions);

  const orgListings = listings.filter((listing) => listing.organisationId === orgId);

  const orgIncidents = allIncidents.filter(
    (incident) => incident.organisationId === orgId,
  );

  const orgAssignments = assignments.filter((assignment) =>
    assignmentBelongsToOrganisation(assignment, orgId),
  );

  const orgReceipts = receipts.filter((receipt) => receipt.organisationId === orgId);

  const orgDwtSubmissions = dwtSubmissions.filter(
    (submission) => submission.organisationId === orgId,
  );

  const completedListings = orgListings.filter(
    (listing) => listing.status === "completed",
  ).length;

  const incompleteListings = orgListings.filter(
    (listing) =>
      listing.status !== "completed" && listing.status !== "cancelled",
  ).length;

  const completedAssignments = orgAssignments.filter(
    (assignment) => assignment.status === "completed" || assignment.completedAt,
  ).length;

  const activeAssignments = orgAssignments.filter((assignment) =>
    ["accepted", "assigned", "in_progress"].includes(assignment.status),
  ).length;

  const unresolvedIncidents = orgIncidents.filter((incident) =>
    ["open", "under_review"].includes(incident.status),
  ).length;

  const resolvedIncidents = orgIncidents.filter(
    (incident) => incident.status === "resolved",
  ).length;

  const verificationUsed = orgAssignments.filter(
    (assignment) => assignment.codeUsedAt !== null,
  ).length;

  const confirmedReceipts = orgReceipts.filter((receipt) =>
    ["confirmed", "submitted"].includes(receipt.status),
  ).length;

  const dwtAccepted = orgDwtSubmissions.filter((submission) =>
    ["accepted", "accepted_with_warnings"].includes(submission.status),
  ).length;

  const dwtNeedsAttention = orgDwtSubmissions.filter((submission) =>
    ["rejected", "failed"].includes(submission.status),
  ).length;

  const completionRate = calculateRate(completedListings, orgListings.length);
  const assignmentCompletionRate = calculateRate(
    completedAssignments,
    orgAssignments.length,
  );
  const verificationRate = calculateRate(verificationUsed, orgAssignments.length);
  const receiptRate = calculateRate(confirmedReceipts, orgReceipts.length);
  const dwtSuccessRate = calculateRate(dwtAccepted, orgDwtSubmissions.length);
  const incidentResolutionRate = calculateRate(
    resolvedIncidents,
    orgIncidents.length,
  );

  const incidentPenalty =
    orgListings.length > 0
      ? Math.min(30, Math.round((unresolvedIncidents / orgListings.length) * 30))
      : unresolvedIncidents > 0
        ? 20
        : 0;

  const dwtPenalty = dwtNeedsAttention > 0 ? Math.min(15, dwtNeedsAttention * 5) : 0;

  const trustScore = clampScore(
    Math.round(
      completionRate * 0.25 +
        assignmentCompletionRate * 0.25 +
        verificationRate * 0.15 +
        receiptRate * 0.15 +
        dwtSuccessRate * 0.2 -
        incidentPenalty -
        dwtPenalty,
    ),
  );

  const riskScore = 100 - trustScore;

  const riskFlags = buildRiskFlags({
    riskScore,
    unresolvedIncidents,
    completionRate,
    verificationRate,
    dwtNeedsAttention,
    receiptRate,
    orgListingsCount: orgListings.length,
    orgAssignmentsCount: orgAssignments.length,
    orgReceiptsCount: orgReceipts.length,
  });

  const activity = await database
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      createdAt: auditEvents.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.userId, users.id))
    .where(eq(auditEvents.organisationId, orgId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(20);

  const latestDwtSubmission = orgDwtSubmissions
    .sort((first, second) => {
      const firstTime = first.createdAt ? new Date(first.createdAt).getTime() : 0;
      const secondTime = second.createdAt ? new Date(second.createdAt).getTime() : 0;

      return secondTime - firstTime;
    })
    .at(0);

  const orgEmail = orgFields.email ?? orgFields.emailAddress ?? "—";

  const addressParts = [
    orgFields.streetAddress ?? orgFields.addressLine1,
    orgFields.city,
    orgFields.county,
    orgFields.postcode,
    orgFields.country,
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Organisation Profile
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              {org.teamName}
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              {org.industry || "No industry recorded"} • {orgEmail}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge status={orgFields.status} />

              {Array.isArray(orgFields.capabilities) &&
                orgFields.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600"
                  >
                    {formatLabel(capability)}
                  </span>
                ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/organisations"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              ← Organisations
            </Link>

            <Link
              href={`/admin/audit/entity?entityId=${encodeURIComponent(orgId)}`}
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              View audit
            </Link>

            <ExportOrgButton orgId={orgId} />
          </div>
        </div>
      </section>

      {/* ================= SCORE SUMMARY ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Trust Score
          </p>

          <div className="mt-5 flex items-end gap-3">
            <p className="text-5xl font-black tracking-tight text-gray-950">
              {trustScore}
            </p>

            <p className="pb-2 text-sm font-semibold text-gray-400">/ 100</p>
          </div>

          <p className="mt-4 text-sm leading-6 text-gray-500">
            Based on listing completion, assignment completion, verification,
            receipt confirmation, DWT success and incident posture.
          </p>

          <div className="mt-6">
            <ScoreBar value={trustScore} />
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:col-span-2">
          <Metric
            label="Risk Score"
            value={riskScore}
            helper="Inverse of trust score"
            tone={riskScore >= 60 ? "danger" : "default"}
          />

          <Metric
            label="Completion Rate"
            value={`${completionRate}%`}
            helper={`${completedListings} of ${orgListings.length} listings completed`}
          />

          <Metric
            label="Verification Usage"
            value={`${verificationRate}%`}
            helper={`${verificationUsed} verification codes used`}
          />

          <Metric
            label="DWT Success"
            value={`${dwtSuccessRate}%`}
            helper={`${dwtAccepted} accepted submissions`}
          />
        </section>
      </section>

      {/* ================= OPERATIONAL METRICS ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Listings"
          value={orgListings.length}
          helper={`${incompleteListings} incomplete chains`}
        />

        <Metric
          label="Assignments"
          value={orgAssignments.length}
          helper={`${activeAssignments} active, ${completedAssignments} completed`}
        />

        <Metric
          label="Receipts"
          value={orgReceipts.length}
          helper={`${confirmedReceipts} confirmed/submitted`}
        />

        <Metric
          label="Incidents"
          value={orgIncidents.length}
          helper={`${unresolvedIncidents} unresolved`}
          tone={unresolvedIncidents > 0 ? "danger" : "default"}
        />
      </section>

      {/* ================= DETAILS + RISK ================= */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          eyebrow="Details"
          title="Organisation information"
          description="Core registration, contact and account information for this organisation."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <DetailCard label="Email" value={orgEmail} />
            <DetailCard label="Telephone" value={orgFields.telephone ?? "—"} />
            <DetailCard
              label="Address"
              value={addressParts.length > 0 ? addressParts.join(", ") : "—"}
            />
            <DetailCard label="Industry" value={org.industry ?? "—"} />
            <DetailCard label="Members" value={String(org.memberCount ?? 0)} />
            <DetailCard label="Joined" value={formatDate(org.createdAt)} />
            <DetailCard
              label="Subscription"
              value={orgFields.subscriptionPlan ?? "Not recorded"}
            />
            <DetailCard
              label="Subscription status"
              value={orgFields.subscriptionStatus ?? "Not recorded"}
            />
          </div>
        </Panel>

        <Panel
          eyebrow="Risk Flags"
          title="Risk and moderation signals"
          description="A simple admin view of the issues that may require review."
        >
          {riskFlags.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm font-semibold text-gray-950">
                Healthy organisation
              </p>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                No major risk flags were detected from the current records.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {riskFlags.map((flag) => (
                <RiskFlag key={flag.title} {...flag} />
              ))}
            </div>
          )}
        </Panel>
      </section>

      {/* ================= COMPLIANCE + DWT ================= */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          eyebrow="Compliance"
          title="Operational compliance"
          description="Tracks assignment completion, verification, receipt confirmation and incident resolution."
          actionHref="/admin/audit/compliance"
          actionLabel="Compliance view"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <MiniStat
              label="Assignment completion"
              value={`${assignmentCompletionRate}%`}
              helper={`${completedAssignments} completed`}
            />

            <MiniStat
              label="Receipt confirmation"
              value={`${receiptRate}%`}
              helper={`${confirmedReceipts} confirmed/submitted`}
            />

            <MiniStat
              label="Incident resolution"
              value={`${incidentResolutionRate}%`}
              helper={`${resolvedIncidents} resolved`}
            />

            <MiniStat
              label="Unresolved incidents"
              value={unresolvedIncidents}
              helper="Open or under review"
            />
          </div>
        </Panel>

        <Panel
          eyebrow="Digital Waste Tracking"
          title="DWT activity"
          description="Digital Waste Tracking submission performance for this organisation."
          actionHref="/admin/digital-waste-tracking"
          actionLabel="DWT control room"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <MiniStat
              label="DWT submissions"
              value={orgDwtSubmissions.length}
              helper="All submission attempts"
            />

            <MiniStat
              label="Accepted"
              value={dwtAccepted}
              helper="Accepted or accepted with warnings"
            />

            <MiniStat
              label="Needs attention"
              value={dwtNeedsAttention}
              helper="Rejected or failed submissions"
            />

            <MiniStat
              label="Latest tracking ID"
              value={latestDwtSubmission?.wasteTrackingId ?? "—"}
              helper={latestDwtSubmission?.status ?? "No latest submission"}
            />
          </div>
        </Panel>
      </section>

      {/* ================= RECENT ACTIVITY ================= */}
      <Panel
        eyebrow="Activity"
        title="Recent organisation activity"
        description="Latest audit events linked to this organisation."
        actionHref={`/admin/audit/entity?entityId=${encodeURIComponent(orgId)}`}
        actionLabel="Open entity audit"
      >
        {activity.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
            <p className="text-sm font-semibold text-gray-950">
              No recent activity found.
            </p>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Organisation audit events will appear here once actions are
              recorded.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <div className="divide-y divide-gray-200 bg-white">
              {activity.map((event) => (
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
                      {event.userName ?? event.userEmail ?? "System"}
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

function DetailCard({ label, value }: { label: string; value: string }) {
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

      <p className="mt-2 truncate text-xl font-bold text-gray-950">{value}</p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function RiskFlag({
  title,
  message,
  tone,
}: {
  title: string;
  message: string;
  tone: "danger" | "warning";
}) {
  const className =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-gray-300 bg-gray-100 text-gray-800";

  return (
    <div className={`rounded-2xl border p-4 ${className}`}>
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-sm leading-6">{message}</p>
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

function StatusBadge({ status }: { status: string | null | undefined }) {
  const className =
    status === "ACTIVE" || status === "active"
      ? "border-gray-900 bg-gray-950 text-white"
      : status === "PENDING" || status === "pending"
        ? "border-gray-300 bg-gray-100 text-gray-800"
        : status === "REJECTED" ||
            status === "rejected" ||
            status === "SUSPENDED" ||
            status === "suspended"
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

/* =========================================================
   HELPERS
========================================================= */

function calculateRate(value: number, total: number) {
  if (!total || total <= 0) return 0;

  return Math.round((value / total) * 100);
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(100, value));
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(new Date(date));
}

function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
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

function buildRiskFlags(params: {
  riskScore: number;
  unresolvedIncidents: number;
  completionRate: number;
  verificationRate: number;
  dwtNeedsAttention: number;
  receiptRate: number;
  orgListingsCount: number;
  orgAssignmentsCount: number;
  orgReceiptsCount: number;
}) {
  const flags: {
    title: string;
    message: string;
    tone: "danger" | "warning";
  }[] = [];

  if (params.riskScore >= 60) {
    flags.push({
      title: "High risk organisation",
      message:
        "This organisation has a high risk score based on completion, verification, DWT or incident signals.",
      tone: "danger",
    });
  }

  if (params.unresolvedIncidents > 0) {
    flags.push({
      title: "Unresolved incidents",
      message: `${params.unresolvedIncidents} incident record(s) are still open or under review.`,
      tone: "danger",
    });
  }

  if (params.orgListingsCount > 0 && params.completionRate < 50) {
    flags.push({
      title: "Low listing completion",
      message:
        "Less than half of this organisation's listings are completed.",
      tone: "warning",
    });
  }

  if (params.orgAssignmentsCount > 0 && params.verificationRate < 50) {
    flags.push({
      title: "Low verification usage",
      message:
        "Less than half of this organisation's assignments have used the verification code flow.",
      tone: "warning",
    });
  }

  if (params.orgReceiptsCount > 0 && params.receiptRate < 50) {
    flags.push({
      title: "Low receipt confirmation",
      message:
        "Receipt confirmation is low for this organisation's receiving records.",
      tone: "warning",
    });
  }

  if (params.dwtNeedsAttention > 0) {
    flags.push({
      title: "DWT submissions need attention",
      message: `${params.dwtNeedsAttention} Digital Waste Tracking submission(s) were rejected or failed.`,
      tone: "danger",
    });
  }

  return flags;
}