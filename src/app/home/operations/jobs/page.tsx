// src/app/home/operations/jobs/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  carrierAssignments,
  sites,
  users,
  wasteListings,
  type OrganisationOperatingMode,
} from "@/db/schema";
import { getDefaultSiteForOrganisation } from "@/modules/sites/data-access/getDefaultSiteForOrganisation";
import {
  shouldShowExternalJobs,
  type OrganisationCapability,
} from "@/modules/organisations/core/operatingModes";

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
    carrier_pending: "Carrier pending",
    in_progress: "In progress",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
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

function formatJobSource(source: string | null | undefined) {
  const labels: Record<string, string> = {
    wastex_marketplace: "Waste X marketplace",
    external_manual: "External/private job",
    internal_operation: "Internal operation",
  };

  return labels[source ?? ""] ?? "Job";
}

function isClosedJob(status: string | null | undefined) {
  return (
    status === "completed" ||
    status === "cancelled" ||
    status === "rejected"
  );
}

function getJobTitle(job: JobRow) {
  if (job.jobSource === "external_manual") {
    return (
      job.externalCustomerName ||
      job.externalWasteDescription ||
      job.externalReference ||
      "External job"
    );
  }

  return job.listingName || "Waste X marketplace job";
}

function getWasteDescription(job: JobRow) {
  if (job.jobSource === "external_manual") {
    return job.externalWasteDescription || "No waste description added yet.";
  }

  return job.listingName || "Marketplace listing";
}

function getPickupValue(job: JobRow) {
  if (job.jobSource === "external_manual") {
    return (
      [job.externalPickupAddress, job.externalPickupPostcode]
        .filter(Boolean)
        .join(", ") || "Not set"
    );
  }

  return job.listingLocation || "Listing location not set";
}

function getDestinationValue(job: JobRow) {
  if (job.jobSource === "external_manual") {
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

  return "Handled through Waste X assignment";
}

export default async function CarrierJobsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

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

  await getDefaultSiteForOrganisation({
    organisationId: currentUser.organisationId,
    createIfMissing: true,
  });

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
    .where(
      and(
        eq(
          carrierAssignments.carrierOrganisationId,
          currentUser.organisationId,
        ),
      ),
    )
    .orderBy(
      desc(carrierAssignments.externalCollectionDate),
      desc(carrierAssignments.assignedAt),
    );

  const activeJobs = jobs.filter((job) => !isClosedJob(job.status));

  const completedJobs = jobs.filter((job) => job.status === "completed");

  const externalJobs = jobs.filter(
    (job) => job.jobSource === "external_manual",
  );

  return (
    <main className="space-y-8 min-h-screen bg-[#f7f3ed] px-8 py-10 pl-[22vw] text-black pt-[calc(13vh+2rem)]">
      <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
              Carrier operations
            </p>

            <h1 className="mt-2 text-2xl font-semibold text-black">
              Jobs
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
              Manage Waste X marketplace jobs and external/private carrier jobs
              from one operational view.
            </p>
          </div>

          <Link
            href="/home/operations/jobs/new"
            className="inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            Add external job
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Total jobs" value={jobs.length} />
          <Stat label="Active jobs" value={activeJobs.length} />
          <Stat label="External jobs" value={externalJobs.length} />
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
              Job queue
            </p>

            <h2 className="mt-2 text-xl font-semibold text-black">
              Current carrier jobs
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
              const title = getJobTitle(job);

              return (
                <article
                  key={job.id}
                  className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm"
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

                        <span className="rounded-full border border-black/10 bg-[#f7f3ed] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/45">
                          {formatJobSource(job.jobSource)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm leading-6 text-black/55">
                        {getWasteDescription(job)}
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
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
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

      <p className="mt-1 line-clamp-2 font-medium text-black/70">
        {value}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[2rem] border border-dashed border-black/15 bg-white p-10 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
        No jobs yet
      </p>

      <h3 className="mt-2 text-xl font-semibold text-black">
        Start by adding an external carrier job
      </h3>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
        This area will show external/private jobs and Waste X marketplace jobs
        assigned to your carrier operation.
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