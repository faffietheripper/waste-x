import Link from "next/link";
import { notFound } from "next/navigation";
import { sql, type SQL } from "drizzle-orm";

import { database } from "@/db/database";
import { organisations } from "@/db/schema";
import AssignCarrierPanel from "@/components/app/Assignments/AssignCarrierPanel";

import { getAssignmentById } from "@/modules/assignments/queries/getAssignmentById";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";
import {
  type DepartmentType,
  hasOperationalPermission,
} from "@/modules/auth/core/permissions";

/* =========================================================
   TYPES
========================================================= */

type OrgCapability = "generator" | "carrier" | "manager";

type CarrierHubSearchParams = {
  assignmentId?: string | string[];
  q?: string | string[];
};

type CarrierOption = {
  id: string;
  teamName: string;
  capabilities: OrgCapability[];
};

type CarrierMetrics = {
  carrierOrganisationId: string;
  totalAssignments: number;
  activeAssignments: number;
  completedAssignments: number;
  openIncidents: number;
  lastAssignedAt: string | Date | null;
};

type CarrierCardData = CarrierOption & {
  emailAddress: string | null;
  telephone: string | null;
  address: string | null;
  industry: string | null;
  status: string | null;
  isInternalCarrier: boolean;
  metrics: CarrierMetrics;
  score: number;
  scoreLabel: string;
  scoreTone: "strong" | "good" | "watch";
  tags: string[];
};

type CarrierNeededJob = {
  assignmentId: string;
  listingId: number | string | null;
  assignmentStatus: string | null;
  managerAcceptedAt: string | Date | null;
  assignedAt: string | Date | null;
  listingName: string | null;
  listingLocation: string | null;
  generatorName: string | null;
  managerName: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function toSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getOrganisationName(org: any, fallback = "Unknown organisation") {
  return org?.teamName ?? org?.name ?? fallback;
}

function getStringFromRecord(record: unknown, keys: string[]) {
  const object = record as Record<string, unknown>;

  for (const key of keys) {
    const value = object[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getOrganisationAddress(org: unknown) {
  return getStringFromRecord(org, [
    "address",
    "registeredAddress",
    "siteAddress",
    "officeAddress",
    "businessAddress",
  ]);
}

function organisationIsInAssignment({
  assignment,
  organisationId,
}: {
  assignment: any;
  organisationId: string;
}) {
  return (
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId ||
    assignment.managerOrganisationId === organisationId ||
    assignment.carrierOrganisationId === organisationId
  );
}

function getCarrierSearchText(carrier: CarrierCardData) {
  return [
    carrier.teamName,
    carrier.emailAddress,
    carrier.telephone,
    carrier.address,
    carrier.industry,
    carrier.capabilities.join(" "),
    carrier.tags.join(" "),
    carrier.scoreLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getEmptyCarrierMetrics(carrierOrganisationId: string): CarrierMetrics {
  return {
    carrierOrganisationId,
    totalAssignments: 0,
    activeAssignments: 0,
    completedAssignments: 0,
    openIncidents: 0,
    lastAssignedAt: null,
  };
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseMetric(row: any): CarrierMetrics {
  return {
    carrierOrganisationId: String(row.carrierOrganisationId ?? ""),
    totalAssignments: toNumber(row.totalAssignments),
    activeAssignments: toNumber(row.activeAssignments),
    completedAssignments: toNumber(row.completedAssignments),
    openIncidents: toNumber(row.openIncidents),
    lastAssignedAt: row.lastAssignedAt ?? null,
  };
}

function getCarrierLoadLabel(activeAssignments: number) {
  if (activeAssignments <= 0) return "Low workload";
  if (activeAssignments <= 2) return "Manageable workload";
  return "Busy carrier";
}

function scoreCarrier({
  isInternalCarrier,
  metrics,
  hasEmail,
  hasPhone,
}: {
  isInternalCarrier: boolean;
  metrics: CarrierMetrics;
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  let score = 50;

  if (isInternalCarrier) score += 10;

  if (metrics.openIncidents === 0) score += 18;
  if (metrics.openIncidents > 0) score -= 25;

  if (metrics.activeAssignments === 0) score += 16;
  if (metrics.activeAssignments >= 1 && metrics.activeAssignments <= 2) score += 8;
  if (metrics.activeAssignments >= 3) score -= 12;

  if (metrics.completedAssignments > 0) score += 10;
  if (metrics.completedAssignments >= 5) score += 6;

  if (hasEmail) score += 3;
  if (hasPhone) score += 3;

  return Math.max(0, Math.min(100, score));
}

function getScoreTone(score: number): CarrierCardData["scoreTone"] {
  if (score >= 80) return "strong";
  if (score >= 60) return "good";
  return "watch";
}

function getScoreLabel(score: number) {
  if (score >= 80) return "Recommended";
  if (score >= 60) return "Good option";
  return "Review first";
}

function getCarrierTags({
  isInternalCarrier,
  metrics,
  hasEmail,
  hasPhone,
}: {
  isInternalCarrier: boolean;
  metrics: CarrierMetrics;
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  const tags: string[] = [];

  if (isInternalCarrier) tags.push("Internal option");
  else tags.push("External carrier");

  if (metrics.openIncidents === 0) tags.push("No open incidents");
  else tags.push(`${metrics.openIncidents} open incident${metrics.openIncidents === 1 ? "" : "s"}`);

  tags.push(getCarrierLoadLabel(metrics.activeAssignments));

  if (metrics.completedAssignments > 0) {
    tags.push("Used before");
  }

  if (hasEmail && hasPhone) tags.push("Contact ready");

  return tags;
}

function getScoreClass(tone: CarrierCardData["scoreTone"]) {
  if (tone === "strong") return "border-green-200 bg-green-50 text-green-700";
  if (tone === "good") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function getLoadClass(activeAssignments: number) {
  if (activeAssignments <= 0) return "border-green-200 bg-green-50 text-green-700";
  if (activeAssignments <= 2) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-red-200 bg-red-50 text-red-700";
}

async function executeRows<T>(query: SQL): Promise<T[]> {
  const result = (await database.execute(query)) as unknown;

  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

async function getCarrierMetricsRows() {
  try {
    return await executeRows<any>(sql`
      SELECT
        org.id AS "carrierOrganisationId",
        COUNT(ca.id)::int AS "totalAssignments",
        COUNT(ca.id) FILTER (
          WHERE ca.status IN ('pending', 'assigned', 'accepted', 'in_progress')
        )::int AS "activeAssignments",
        COUNT(ca.id) FILTER (
          WHERE ca.status = 'completed'
        )::int AS "completedAssignments",
        COUNT(DISTINCT incident.id) FILTER (
          WHERE incident.id IS NOT NULL
          AND COALESCE(incident.status, '') NOT IN ('resolved', 'closed', 'cancelled')
        )::int AS "openIncidents",
        MAX(ca."carrierAssignedAt") AS "lastAssignedAt"
      FROM bb_organisation org
      LEFT JOIN bb_carrier_assignment ca
        ON ca."carrierOrganisationId" = org.id
      LEFT JOIN bb_incident incident
        ON incident."assignmentId" = ca.id
      WHERE org.status = 'ACTIVE'
      AND org.capabilities @> ARRAY['carrier']::text[]
      GROUP BY org.id
    `);
  } catch (error) {
    console.error("[CARRIER_HUB_METRICS_ERROR]", error);
    return [];
  }
}

async function getJobsNeedingCarrier(organisationId: string) {
  try {
    return await executeRows<CarrierNeededJob>(sql`
      SELECT
        ca.id AS "assignmentId",
        ca."listingId" AS "listingId",
        ca.status AS "assignmentStatus",
        ca."managerAcceptedAt" AS "managerAcceptedAt",
        ca."assignedAt" AS "assignedAt",
        listing.name AS "listingName",
        listing.location AS "listingLocation",
        generator."teamName" AS "generatorName",
        manager."teamName" AS "managerName"
      FROM bb_carrier_assignment ca
      LEFT JOIN bb_waste_listing listing
        ON listing.id = ca."listingId"
      LEFT JOIN bb_organisation generator
        ON generator.id = ca."assignedByOrganisationId"
      LEFT JOIN bb_organisation manager
        ON manager.id = ca."managerOrganisationId"
      WHERE ca."managerOrganisationId" = ${organisationId}
      AND ca."carrierOrganisationId" IS NULL
      AND ca."managerAcceptedAt" IS NOT NULL
      AND ca.status IN ('pending', 'accepted')
      ORDER BY ca."managerAcceptedAt" DESC NULLS LAST, ca."assignedAt" DESC NULLS LAST
      LIMIT 8
    `);
  } catch (error) {
    console.error("[CARRIER_HUB_JOBS_ERROR]", error);
    return [];
  }
}

/* =========================================================
   PAGE
========================================================= */

export default async function CarrierHubPage({
  searchParams,
}: {
  searchParams?: CarrierHubSearchParams;
}) {
  const context = await requireOperationalPermission("assignment:view");

  const organisationId = context.user.organisationId!;
  const departmentType = context.departmentType as DepartmentType;

  const assignmentId = toSingleParam(searchParams?.assignmentId);
  const searchTerm = toSingleParam(searchParams?.q).trim().toLowerCase();

  const canAssignCarrier = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType,
    permission: "assignment:assign_carrier",
  });

  const assignment = assignmentId ? await getAssignmentById(assignmentId) : null;

  if (assignmentId && !assignment) {
    notFound();
  }

  if (
    assignment &&
    !organisationIsInAssignment({
      assignment,
      organisationId,
    })
  ) {
    notFound();
  }

  const managerNeedsCarrier = Boolean(
    assignment &&
      departmentType === "manager" &&
      !["completed", "cancelled", "rejected"].includes(assignment.status) &&
      Boolean(assignment.managerAcceptedAt) &&
      !assignment.carrierOrganisationId &&
      ["pending", "accepted"].includes(assignment.status),
  );

  const [allOrganisations, carrierMetricRows, jobsNeedingCarrier] =
    await Promise.all([
      database.select().from(organisations),
      getCarrierMetricsRows(),
      getJobsNeedingCarrier(organisationId),
    ]);

  const metricsByCarrierId = new Map<string, CarrierMetrics>();

  carrierMetricRows.forEach((row) => {
    const metric = normaliseMetric(row);
    if (metric.carrierOrganisationId) {
      metricsByCarrierId.set(metric.carrierOrganisationId, metric);
    }
  });

  const carriers: CarrierCardData[] = allOrganisations
    .filter((org) => {
      const capabilities = (org.capabilities ?? []) as OrgCapability[];

      return org.status === "ACTIVE" && capabilities.includes("carrier");
    })
    .map((org) => {
      const capabilities = (org.capabilities ?? []) as OrgCapability[];
      const metrics =
        metricsByCarrierId.get(org.id) ?? getEmptyCarrierMetrics(org.id);
      const emailAddress = org.emailAddress ?? null;
      const telephone = org.telephone ?? null;
      const isInternalCarrier = org.id === organisationId;
      const score = scoreCarrier({
        isInternalCarrier,
        metrics,
        hasEmail: Boolean(emailAddress),
        hasPhone: Boolean(telephone),
      });
      const scoreLabel = getScoreLabel(score);
      const scoreTone = getScoreTone(score);
      const tags = getCarrierTags({
        isInternalCarrier,
        metrics,
        hasEmail: Boolean(emailAddress),
        hasPhone: Boolean(telephone),
      });

      return {
        id: org.id,
        teamName: org.teamName ?? "Unnamed carrier",
        capabilities,
        emailAddress,
        telephone,
        address: getOrganisationAddress(org),
        industry: org.industry ?? null,
        status: org.status ?? null,
        isInternalCarrier,
        metrics,
        score,
        scoreLabel,
        scoreTone,
        tags,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.isInternalCarrier && !b.isInternalCarrier) return -1;
      if (!a.isInternalCarrier && b.isInternalCarrier) return 1;
      return a.teamName.localeCompare(b.teamName);
    });

  const filteredCarriers = searchTerm
    ? carriers.filter((carrier) =>
        getCarrierSearchText(carrier).includes(searchTerm),
      )
    : carriers;

  const recommendedCarriers = filteredCarriers.slice(0, 3);

  const carrierOptions: CarrierOption[] = carriers.map((carrier) => ({
    id: carrier.id,
    teamName: carrier.teamName,
    capabilities: carrier.capabilities,
  }));

  const internalCarrierCount = carriers.filter(
    (carrier) => carrier.isInternalCarrier,
  ).length;

  const lowWorkloadCount = carriers.filter(
    (carrier) => carrier.metrics.activeAssignments <= 1,
  ).length;

  const noIncidentCount = carriers.filter(
    (carrier) => carrier.metrics.openIncidents === 0,
  ).length;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-12 py-32">
      <div className="space-y-8">
        {/* BACK */}
        <Link
          href="/home/operations/assignments"
          className="text-sm font-medium text-black/45 transition hover:text-orange-600"
        >
          ← Back to operations
        </Link>

        {/* HEADER */}
        <section className="overflow-hidden rounded-3xl border border-black/10 bg-black text-white shadow-sm">
          <div className="grid gap-8 p-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Carrier Hub
              </p>

              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Carrier command centre
              </h1>

              <p className="mt-4 max-w-4xl text-sm leading-6 text-white/55">
                Turn carrier assignment from a plain dropdown into an operational
                decision. See jobs waiting for carriers, compare workload and
                incident signals, then assign the safest available carrier.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <HeaderPill>{carriers.length} active carriers</HeaderPill>
                <HeaderPill>{jobsNeedingCarrier.length} jobs need carrier</HeaderPill>
                <HeaderPill>{lowWorkloadCount} low-workload options</HeaderPill>
                <HeaderPill>Department: {formatLabel(departmentType)}</HeaderPill>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Decision Signal
              </p>

              <p className="mt-3 text-3xl font-semibold text-white">
                {recommendedCarriers[0]?.score ?? 0}%
              </p>

              <p className="mt-2 text-sm leading-6 text-white/50">
                Best current carrier match based on open incidents, active
                workload, completion history and contact readiness.
              </p>

              {recommendedCarriers[0] && (
                <div className="mt-4 rounded-2xl border border-orange-400/20 bg-orange-500/10 p-4">
                  <p className="text-sm font-semibold text-orange-100">
                    {recommendedCarriers[0].teamName}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-orange-100/60">
                    {recommendedCarriers[0].scoreLabel} · {getCarrierLoadLabel(recommendedCarriers[0].metrics.activeAssignments)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ACTION QUEUE */}
        <section className="grid gap-6 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            eyebrow="Action Queue"
            title="Jobs waiting for carrier assignment"
            description="Manager-accepted assignments that cannot move into collection until a carrier is selected."
            actionHref="/home/operations/assignments"
            actionLabel="All assignments"
          >
            {jobsNeedingCarrier.length === 0 ? (
              <EmptyPanel
                title="No jobs waiting for carriers"
                text="When a manager accepts a job and no carrier has been assigned, it will appear here automatically."
              />
            ) : (
              <div className="grid gap-3">
                {jobsNeedingCarrier.map((job) => (
                  <JobNeedsCarrierCard key={job.assignmentId} job={job} />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Carrier Health"
            title="Network readiness"
            description="A quick risk view of your available carrier network."
          >
            <div className="space-y-3">
              <StatusRow label="Active carriers" value={carriers.length} />
              <StatusRow label="Low workload" value={lowWorkloadCount} />
              <StatusRow label="No open incidents" value={noIncidentCount} />
              <StatusRow label="Internal options" value={internalCarrierCount} />
            </div>
          </Panel>
        </section>

        {/* ASSIGNMENT CONTEXT */}
        {assignment && (
          <section className="grid gap-6 xl:grid-cols-3">
            <div className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-700">
                Assignment Context
              </p>

              <h2 className="mt-3 text-2xl font-semibold text-black">
                {assignment.listing?.name ?? "Assignment"}
              </h2>

              <p className="mt-2 text-sm leading-6 text-orange-900/70">
                {assignment.listing?.location ?? "Unknown location"}
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <ContextCard
                  label="Generator"
                  value={getOrganisationName(assignment.generatorOrg)}
                />

                <ContextCard
                  label="Manager"
                  value={getOrganisationName(assignment.managerOrg)}
                />

                <ContextCard
                  label="Current carrier"
                  value={getOrganisationName(
                    assignment.carrierOrg,
                    "Not assigned yet",
                  )}
                />
              </div>

              {managerNeedsCarrier ? (
                <div className="mt-6 rounded-2xl border border-orange-200 bg-white p-5 text-sm leading-6 text-orange-900">
                  <p className="font-semibold">Carrier assignment required</p>

                  <p className="mt-1">
                    This job has been accepted by the manager. Review the
                    recommended carriers below, then use the assignment panel to
                    start the carrier workflow.
                  </p>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-black/10 bg-white p-5 text-sm leading-6 text-black/55">
                  <p className="font-semibold text-black">
                    Carrier assignment is not currently required
                  </p>

                  <p className="mt-1">
                    This assignment may already have a carrier, may not have
                    been accepted yet, or may be closed.
                  </p>
                </div>
              )}
            </div>

            <div id="assign-carrier" className="scroll-mt-32">
              {managerNeedsCarrier && canAssignCarrier ? (
                <AssignCarrierPanel
                  assignmentId={assignment.id}
                  carriers={carrierOptions}
                  currentOrganisationId={organisationId}
                />
              ) : (
                <div className="rounded-3xl border border-black/10 bg-white p-6 text-sm shadow-sm">
                  <p className="text-xs uppercase tracking-[0.24em] text-orange-600">
                    Assignment Panel
                  </p>

                  <h3 className="mt-3 text-lg font-semibold text-black">
                    Assignment unavailable
                  </h3>

                  <p className="mt-2 leading-6 text-black/50">
                    The carrier assignment panel only appears when the job has
                    been accepted by the manager, no carrier has been assigned,
                    and your department has permission to assign carriers.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* SEARCH + STATS */}
        <section className="grid gap-5 md:grid-cols-4">
          <StatCard
            label="Active carriers"
            value={carriers.length}
            helper="Organisations with carrier capability"
          />

          <StatCard
            label="Recommended"
            value={recommendedCarriers.length}
            helper="Top options after scoring"
          />

          <StatCard
            label="Low workload"
            value={lowWorkloadCount}
            helper="0–1 active carrier jobs"
          />

          <StatCard
            label="Visible results"
            value={filteredCarriers.length}
            helper={searchTerm ? "Filtered carrier list" : "Current directory"}
          />
        </section>

        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <form method="get" className="flex flex-col gap-4 md:flex-row">
            {assignmentId && (
              <input type="hidden" name="assignmentId" value={assignmentId} />
            )}

            <input
              name="q"
              defaultValue={searchTerm}
              placeholder="Search carrier name, location, email, phone, risk, workload or capability..."
              className="min-h-[3.25rem] flex-1 rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />

            <button
              type="submit"
              className="rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
            >
              Search carriers
            </button>

            {(searchTerm || assignmentId) && (
              <Link
                href={
                  assignmentId
                    ? `/home/operations/carriers?assignmentId=${assignmentId}`
                    : "/home/operations/carriers"
                }
                className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
              >
                Clear
              </Link>
            )}
          </form>
        </section>

        {/* RECOMMENDED CARRIERS */}
        <Panel
          eyebrow="Recommendations"
          title="Best carrier options right now"
          description="Ranked by workload, incident status, completion history, contact readiness and whether the carrier is internal."
        >
          {recommendedCarriers.length === 0 ? (
            <EmptyPanel
              title="No recommended carriers"
              text="Approve carrier-capable organisations before using the recommendation view."
            />
          ) : (
            <div className="grid gap-5 xl:grid-cols-3">
              {recommendedCarriers.map((carrier) => (
                <CarrierCard
                  key={carrier.id}
                  carrier={carrier}
                  assignmentId={assignment?.id ?? null}
                  canAssignFromContext={Boolean(
                    assignment && managerNeedsCarrier && canAssignCarrier,
                  )}
                  compact
                />
              ))}
            </div>
          )}
        </Panel>

        {/* CARRIER DIRECTORY */}
        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 border-b border-black/10 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Full Carrier Directory
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-black">
                Carrier organisations
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
                Use this directory to compare carrier organisations, check their
                current workload and review risk signals before assigning
                transport.
              </p>
            </div>

            {assignment && managerNeedsCarrier && (
              <a
                href="#assign-carrier"
                className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-5 py-3 text-sm font-semibold text-orange-700 transition hover:border-orange-400 hover:bg-orange-100"
              >
                Jump to assign panel →
              </a>
            )}
          </div>

          {filteredCarriers.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-semibold text-black">No carriers found</p>

              <p className="mt-2 text-sm leading-6 text-black/45">
                Try a different search term, or check that carrier organisations
                have been approved and given carrier capability.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {filteredCarriers.map((carrier) => (
                <CarrierCard
                  key={carrier.id}
                  carrier={carrier}
                  assignmentId={assignment?.id ?? null}
                  canAssignFromContext={Boolean(
                    assignment && managerNeedsCarrier && canAssignCarrier,
                  )}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function HeaderPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
      {children}
    </span>
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
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-3xl border border-black/10 bg-white p-6 shadow-sm ${className}`}
    >
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow && (
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              {eyebrow}
            </p>
          )}

          <h2 className="mt-2 text-2xl font-semibold text-black">{title}</h2>

          {description && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
              {description}
            </p>
          )}
        </div>

        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="inline-flex rounded-full border border-black/10 bg-[#fbfaf7] px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
          >
            {actionLabel} →
          </Link>
        )}
      </div>

      {children}
    </section>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
      <p className="font-semibold text-black">{title}</p>
      <p className="mt-2 text-sm leading-6 text-black/45">{text}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/35">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
      <p className="mt-2 text-sm leading-6 text-black/45">{helper}</p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3">
      <span className="text-sm text-black/55">{label}</span>
      <span className="text-sm font-semibold text-black">{value}</span>
    </div>
  );
}

function ContextCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-orange-200 bg-white p-5">
      <p className="text-xs uppercase tracking-widest text-orange-700/60">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function JobNeedsCarrierCard({ job }: { job: CarrierNeededJob }) {
  return (
    <article className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-black">
            {job.listingName ?? "Untitled assignment"}
          </p>

          <p className="mt-1 text-sm leading-6 text-orange-900/70">
            {job.listingLocation ?? "Unknown location"}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <SmallPill>Generator: {job.generatorName ?? "Unknown"}</SmallPill>
            <SmallPill>Status: {formatLabel(job.assignmentStatus)}</SmallPill>
            <SmallPill>Accepted: {formatDate(job.managerAcceptedAt)}</SmallPill>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`/home/operations/carriers?assignmentId=${job.assignmentId}`}
            className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
          >
            Choose carrier →
          </Link>

          <Link
            href={`/home/operations/assignments/${job.assignmentId}`}
            className="rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-semibold text-orange-700 transition hover:border-orange-400 hover:bg-orange-100"
          >
            Assignment →
          </Link>
        </div>
      </div>
    </article>
  );
}

function CarrierCard({
  carrier,
  assignmentId,
  canAssignFromContext,
  compact = false,
}: {
  carrier: CarrierCardData;
  assignmentId: string | null;
  canAssignFromContext: boolean;
  compact?: boolean;
}) {
  return (
    <article className="rounded-[1.5rem] border border-black/10 bg-[#fbfaf7] p-5 shadow-sm transition hover:border-orange-200 hover:bg-white hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-black">
            {carrier.teamName}
          </p>

          <p className="mt-2 text-sm leading-6 text-black/45">
            {carrier.address || carrier.industry || "Carrier organisation"}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${getScoreClass(
            carrier.scoreTone,
          )}`}
        >
          {carrier.scoreLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <MetricMini label="Score" value={`${carrier.score}%`} />
        <MetricMini label="Active" value={carrier.metrics.activeAssignments} />
        <MetricMini label="Done" value={carrier.metrics.completedAssignments} />
        <MetricMini label="Incidents" value={carrier.metrics.openIncidents} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {carrier.tags.map((tag) => (
          <span
            key={tag}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              tag.includes("workload")
                ? getLoadClass(carrier.metrics.activeAssignments)
                : "border-black/10 bg-white text-black/50"
            }`}
          >
            {tag}
          </span>
        ))}
      </div>

      {!compact && (
        <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <MiniDetail label="Status" value={formatLabel(carrier.status)} />

          <MiniDetail
            label="Last assigned"
            value={formatDate(carrier.metrics.lastAssignedAt)}
          />

          <MiniDetail
            label="Email"
            value={carrier.emailAddress ?? "No email recorded"}
          />

          <MiniDetail
            label="Telephone"
            value={carrier.telephone ?? "No phone recorded"}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {carrier.emailAddress && (
          <a
            href={`mailto:${carrier.emailAddress}`}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
          >
            Email
          </a>
        )}

        {carrier.telephone && (
          <a
            href={`tel:${carrier.telephone}`}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
          >
            Call
          </a>
        )}

        {assignmentId && canAssignFromContext && (
          <a
            href="#assign-carrier"
            className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
          >
            Assign via panel →
          </a>
        )}
      </div>
    </article>
  );
}

function SmallPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-800">
      {children}
    </span>
  );
}

function MetricMini({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function MiniDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-medium text-black/70">
        {value}
      </p>
    </div>
  );
}