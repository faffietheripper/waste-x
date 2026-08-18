// src/app/home/operations/jobs/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, or } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  carrierAssignments,
  sites,
  users,
  wasteListings,
  wasteReceiptItems,
  wasteReceipts,
  type OrganisationOperatingMode,
} from "@/db/schema";
import {
  shouldShowExternalJobs,
  type OrganisationCapability,
} from "@/modules/organisations/core/operatingModes";
import { resolveSiteFilterForOrganisation } from "@/modules/sites/data-access/resolveSiteFilterForOrganisation";

type PageProps = {
  searchParams?:
    | Promise<{
        siteId?: string;
        error?: string;
      }>
    | {
        siteId?: string;
        error?: string;
      };
};

type Tone = "muted" | "warning" | "success" | "danger";

type JobRow = {
  id: string;
  listingId: number;
  siteId: string | null;
  status: string | null;
  jobSource: string | null;

  externalCustomerName: string | null;
  externalReference: string | null;
  externalPickupAddress: string | null;
  externalPickupPostcode: string | null;
  externalDestinationName: string | null;
  externalDestinationAddress: string | null;
  externalDestinationPostcode: string | null;
  externalWasteDescription: string | null;
  externalEwcCode: string | null;
  externalCollectionDate: Date | null;

  assignedAt: Date | null;
  collectedAt: Date | null;
  completedAt: Date | null;

  siteName: string | null;
  listingName: string | null;
  listingLocation: string | null;
  listingStatus: string | null;
};

type ReceiptRow = typeof wasteReceipts.$inferSelect;

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  const labels: Record<string, string> = {
    pending: "Pending",
    accepted: "Accepted",
    in_progress: "In progress",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
    draft: "Draft",
    confirmed: "Confirmed",
    submitted: "Submitted",
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

function getStatusClass(status: string | null | undefined) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "in_progress" || status === "accepted") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (status === "rejected" || status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-black/10 bg-[#f7f3ed] text-black/50";
}

function getReadinessClass(tone: Tone) {
  const classes: Record<Tone, string> = {
    muted: "border-black/10 bg-[#f7f3ed] text-black/50",
    warning: "border-orange-200 bg-orange-50 text-orange-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-red-200 bg-red-50 text-red-700",
  };

  return classes[tone];
}

function isClosedJob(status: string | null | undefined) {
  return (
    status === "completed" ||
    status === "cancelled" ||
    status === "rejected"
  );
}

function getJobTitle(job: JobRow) {
  return (
    job.externalCustomerName ||
    job.externalWasteDescription ||
    job.externalReference ||
    "External job"
  );
}

function getWasteDescription(job: JobRow) {
  return job.externalWasteDescription || "No waste description added yet.";
}

function getPickupValue(job: JobRow) {
  return (
    [job.externalPickupAddress, job.externalPickupPostcode]
      .filter(Boolean)
      .join(", ") || "Not set"
  );
}

function getDestinationValue(job: JobRow) {
  return (
    [
      job.externalDestinationName,
      job.externalDestinationAddress,
      job.externalDestinationPostcode,
    ]
      .filter(Boolean)
      .join(", ") || "Not set"
  );
}

function getDraftReadiness(params: {
  job: JobRow;
  receipt: ReceiptRow | undefined;
  itemCount: number;
}) {
  const missing: string[] = [];

  if (!params.receipt) {
    missing.push("DWT draft receipt");
  }

  if (params.receipt) {
    if (
      !params.receipt.carrierRegistrationNumber &&
      !params.receipt.carrierReasonForNoRegistrationNumber
    ) {
      missing.push("carrier registration or reason");
    }

    if (!params.receipt.carrierOrganisationName) {
      missing.push("carrier name");
    }

    if (!params.receipt.receiverAuthorisationNumber) {
      missing.push("receiver permit/authorisation");
    }

    if (!params.receipt.receiptFullAddress) {
      missing.push("receipt address");
    }

    if (!params.receipt.receiptPostcode) {
      missing.push("receipt postcode");
    }
  }

  if (!params.job.externalEwcCode) {
    missing.push("EWC code");
  }

  if (params.itemCount === 0) {
    missing.push("waste item details");
  }

  if (params.job.status !== "completed") {
    missing.push("operational completion");
  }

  if (missing.length === 0) {
    return {
      label: "Ready for DWT review",
      tone: "success" as const,
      detail: "Draft is complete enough to review in the DWT intake form.",
      missing,
    };
  }

  if (params.receipt && params.itemCount > 0) {
    return {
      label: "Draft partially ready",
      tone: "warning" as const,
      detail: `${missing.length} item${missing.length === 1 ? "" : "s"} still needed.`,
      missing,
    };
  }

  return {
    label: "Draft needs info",
    tone: "muted" as const,
    detail: `${missing.length} item${missing.length === 1 ? "" : "s"} missing.`,
    missing,
  };
}

export default async function CarrierJobsPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
    columns: {
      id: true,
      organisationId: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (
    !currentUser?.organisationId ||
    !currentUser.organisation ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect("/home");
  }

  const organisationContext = {
    operatingMode:
      currentUser.organisation.operatingMode as OrganisationOperatingMode | null,
    capabilities:
      (currentUser.organisation.capabilities as OrganisationCapability[] | null) ??
      [],
  };

  if (!shouldShowExternalJobs(organisationContext)) {
    redirect("/home");
  }

  const siteFilter = await resolveSiteFilterForOrganisation({
    organisationId: currentUser.organisationId,
    requestedSiteId: resolvedSearchParams?.siteId,
    createDefaultIfMissing: true,
  });

  const orgInvolvementWhere =
    or(
      eq(carrierAssignments.organisationId, currentUser.organisationId),
      eq(carrierAssignments.assignedByOrganisationId, currentUser.organisationId),
      eq(carrierAssignments.managerOrganisationId, currentUser.organisationId),
      eq(carrierAssignments.carrierOrganisationId, currentUser.organisationId),
    ) ?? eq(carrierAssignments.organisationId, currentUser.organisationId);

  const jobsWhere = siteFilter.selectedSiteId
    ? and(
        eq(carrierAssignments.jobSource, "external_manual"),
        orgInvolvementWhere,
        eq(carrierAssignments.siteId, siteFilter.selectedSiteId),
      )
    : and(eq(carrierAssignments.jobSource, "external_manual"), orgInvolvementWhere);

  const jobs = await database
    .select({
      id: carrierAssignments.id,
      listingId: carrierAssignments.listingId,
      siteId: carrierAssignments.siteId,
      status: carrierAssignments.status,
      jobSource: carrierAssignments.jobSource,

      externalCustomerName: carrierAssignments.externalCustomerName,
      externalReference: carrierAssignments.externalReference,

      externalPickupAddress: carrierAssignments.externalPickupAddress,
      externalPickupPostcode: carrierAssignments.externalPickupPostcode,

      externalDestinationName: carrierAssignments.externalDestinationName,
      externalDestinationAddress: carrierAssignments.externalDestinationAddress,
      externalDestinationPostcode:
        carrierAssignments.externalDestinationPostcode,

      externalWasteDescription: carrierAssignments.externalWasteDescription,
      externalEwcCode: carrierAssignments.externalEwcCode,
      externalCollectionDate: carrierAssignments.externalCollectionDate,

      assignedAt: carrierAssignments.assignedAt,
      collectedAt: carrierAssignments.collectedAt,
      completedAt: carrierAssignments.completedAt,

      siteName: sites.name,

      listingName: wasteListings.name,
      listingLocation: wasteListings.location,
      listingStatus: wasteListings.status,
    })
    .from(carrierAssignments)
    .leftJoin(wasteListings, eq(carrierAssignments.listingId, wasteListings.id))
    .leftJoin(sites, eq(carrierAssignments.siteId, sites.id))
    .where(jobsWhere)
    .orderBy(
      desc(carrierAssignments.externalCollectionDate),
      desc(carrierAssignments.assignedAt),
    );

  const assignmentIds = jobs.map((job) => job.id);

  const receipts =
    assignmentIds.length > 0
      ? await database.query.wasteReceipts.findMany({
          where: and(
            eq(wasteReceipts.organisationId, currentUser.organisationId),
            inArray(wasteReceipts.assignmentId, assignmentIds),
          ),
          orderBy: [desc(wasteReceipts.updatedAt)],
        })
      : [];
const latestReceiptByAssignment = new Map<string, ReceiptRow>();

for (const receipt of receipts) {
  if (!receipt.assignmentId) {
    continue;
  }

  if (!latestReceiptByAssignment.has(receipt.assignmentId)) {
    latestReceiptByAssignment.set(
      receipt.assignmentId,
      receipt,
    );
  }
}

  const receiptIds = receipts.map((receipt) => receipt.id);

  const receiptItems =
    receiptIds.length > 0
      ? await database.query.wasteReceiptItems.findMany({
          where: and(
            eq(wasteReceiptItems.organisationId, currentUser.organisationId),
            inArray(wasteReceiptItems.receiptId, receiptIds),
          ),
        })
      : [];

  const itemCountByReceipt = new Map<string, number>();

  for (const item of receiptItems) {
    itemCountByReceipt.set(
      item.receiptId,
      (itemCountByReceipt.get(item.receiptId) ?? 0) + 1,
    );
  }

  const activeJobs = jobs.filter((job) => !isClosedJob(job.status));
  const completedJobs = jobs.filter((job) => job.status === "completed");

  const readyForReview = jobs.filter((job) => {
    const receipt = latestReceiptByAssignment.get(job.id);
    const itemCount = receipt ? itemCountByReceipt.get(receipt.id) ?? 0 : 0;

    const readiness = getDraftReadiness({
      job,
      receipt,
      itemCount,
    });

    return readiness.tone === "success";
  });

  return (
    <main className="min-h-screen bg-[#f7f3ed] pb-10 pl-[22vw] pr-8 pt-[calc(13vh+2rem)] text-black">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                External operations
              </p>

              <h1 className="mt-2 text-2xl font-semibold text-black">
                External Jobs
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
                Manage private external jobs only. Each external job can carry a
                DWT draft receipt so your team can complete missing data later
                and submit from the receiving intake flow.
              </p>

              <p className="mt-3 inline-flex rounded-full border border-black/10 bg-[#f7f3ed] px-4 py-2 text-xs font-semibold text-black/50">
                Showing: {siteFilter.label}
              </p>
            </div>

            <Link
              href="/home/operations/jobs/new"
              className="inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Add external job
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <Stat label="External jobs" value={jobs.length} />
            <Stat label="Active" value={activeJobs.length} />
            <Stat label="Completed" value={completedJobs.length} />
            <Stat label="DWT review ready" value={readyForReview.length} />
          </div>
        </section>

        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 text-orange-800">
          <p className="text-sm font-semibold">External job draft system</p>

          <p className="mt-2 text-sm leading-6">
            Create the job with whatever information you know now. Waste X will
            keep a DWT draft receipt behind the scenes and show what is missing
            before the final DEFRA submission.
          </p>
        </section>

        <section className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                Job queue
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                External/private jobs
              </h2>
            </div>

            <p className="text-sm text-black/40">
              {completedJobs.length} completed
            </p>
          </div>

          {jobs.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => {
                const receipt = latestReceiptByAssignment.get(job.id);
                const itemCount = receipt
                  ? itemCountByReceipt.get(receipt.id) ?? 0
                  : 0;

                const readiness = getDraftReadiness({
                  job,
                  receipt,
                  itemCount,
                });

                const title = getJobTitle(job);

                return (
                  <article
                    key={job.id}
                    className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-semibold text-black">
                            {title}
                          </h3>

                          <span
                            className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getStatusClass(
                              job.status,
                            )}`}
                          >
                            {formatStatus(job.status)}
                          </span>

                          <span
                            className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getReadinessClass(
                              readiness.tone,
                            )}`}
                          >
                            {readiness.label}
                          </span>
                        </div>

                        <p className="mt-2 text-sm leading-6 text-black/55">
                          {getWasteDescription(job)}
                        </p>

                        <p className="mt-1 text-xs text-black/35">
                          {readiness.detail}
                        </p>

                        <div className="mt-4 grid gap-3 text-sm text-black/55 md:grid-cols-2 xl:grid-cols-4">
                          <Detail
                            label="Collection date"
                            value={formatDate(
                              job.externalCollectionDate ?? job.assignedAt,
                            )}
                          />

                          <Detail
                            label="Site"
                            value={job.siteName ?? "Main Site"}
                          />

                          <Detail label="Pickup" value={getPickupValue(job)} />

                          <Detail
                            label="Destination"
                            value={getDestinationValue(job)}
                          />
                        </div>

                        {readiness.missing.length > 0 && (
                          <div className="mt-4 rounded-2xl border border-black/10 bg-[#f7f3ed] p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
                              Missing before DWT
                            </p>

                            <p className="mt-2 text-sm leading-6 text-black/55">
                              {readiness.missing.slice(0, 5).join(", ")}
                              {readiness.missing.length > 5 ? "…" : ""}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col gap-2 lg:items-end">
                        {job.externalReference && (
                          <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-black/45">
                            Ref: {job.externalReference}
                          </span>
                        )}

                        <Link
                          href={`/home/operations/jobs/${job.id}`}
                          className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-orange-400 transition hover:bg-black/80"
                        >
                          View job
                        </Link>

                        {job.status === "completed" && (
                          <Link
                            href={`/home/receiving/intake/${job.id}`}
                            className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 transition hover:border-orange-400"
                          >
                            Open DWT intake
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-[#f7f3ed] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold text-black">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#f7f3ed] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>

      <p className="mt-1 line-clamp-2 font-medium text-black/70">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[2rem] border border-dashed border-black/15 bg-white p-10 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
        No external jobs yet
      </p>

      <h3 className="mt-2 text-xl font-semibold text-black">
        Start by adding an external job
      </h3>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
        External jobs are private jobs created outside the Waste X marketplace.
        Waste X will create the job and start a DWT draft receipt for later.
      </p>

      <Link
        href="/home/operations/jobs/new"
        className="mt-6 inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
      >
        Add external job
      </Link>
    </div>
  );
}