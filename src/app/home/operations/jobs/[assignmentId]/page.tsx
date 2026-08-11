// src/app/home/operations/jobs/[assignmentId]/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  carrierAssignments,
  sites,
  users,
  wasteListings,
  type OrganisationOperatingMode,
} from "@/db/schema";
import {
  shouldShowExternalJobs,
  type OrganisationCapability,
} from "@/modules/organisations/core/operatingModes";

type PageProps = {
  params: {
    assignmentId: string;
  };
  searchParams?: {
    success?: string;
  };
};

type DetailRow = {
  id: string;
  listingId: number;
  siteId: string | null;
  status: string | null;
  jobSource: string | null;

  externalCustomerName: string | null;
  externalCustomerEmail: string | null;
  externalCustomerPhone: string | null;
  externalReference: string | null;

  externalPickupAddress: string | null;
  externalPickupPostcode: string | null;

  externalDestinationName: string | null;
  externalDestinationAddress: string | null;
  externalDestinationPostcode: string | null;

  externalWasteDescription: string | null;
  externalEwcCode: string | null;
  externalEstimatedWeight: string | null;
  externalCollectionDate: Date | null;
  externalNotes: string | null;

  assignedAt: Date | null;
  respondedAt: Date | null;
  collectedAt: Date | null;
  completedAt: Date | null;

  siteName: string | null;
  listingName: string | null;
  listingLocation: string | null;
  listingStatus: string | null;
};

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

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

function getJobTitle(job: DetailRow) {
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

function getPickup(job: DetailRow) {
  if (job.jobSource === "external_manual") {
    return (
      [job.externalPickupAddress, job.externalPickupPostcode]
        .filter(Boolean)
        .join(", ") || "Not set"
    );
  }

  return job.listingLocation || "Listing location not set";
}

function getDestination(job: DetailRow) {
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

export default async function CarrierJobDetailPage({
  params,
  searchParams,
}: PageProps) {
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

  const [job] = await database
    .select({
      id: carrierAssignments.id,
      listingId: carrierAssignments.listingId,
      siteId: carrierAssignments.siteId,
      status: carrierAssignments.status,
      jobSource: carrierAssignments.jobSource,

      externalCustomerName: carrierAssignments.externalCustomerName,
      externalCustomerEmail: carrierAssignments.externalCustomerEmail,
      externalCustomerPhone: carrierAssignments.externalCustomerPhone,
      externalReference: carrierAssignments.externalReference,

      externalPickupAddress: carrierAssignments.externalPickupAddress,
      externalPickupPostcode: carrierAssignments.externalPickupPostcode,

      externalDestinationName: carrierAssignments.externalDestinationName,
      externalDestinationAddress: carrierAssignments.externalDestinationAddress,
      externalDestinationPostcode:
        carrierAssignments.externalDestinationPostcode,

      externalWasteDescription: carrierAssignments.externalWasteDescription,
      externalEwcCode: carrierAssignments.externalEwcCode,
      externalEstimatedWeight:
        carrierAssignments.externalEstimatedWeight,
      externalCollectionDate:
        carrierAssignments.externalCollectionDate,
      externalNotes: carrierAssignments.externalNotes,

      assignedAt: carrierAssignments.assignedAt,
      respondedAt: carrierAssignments.respondedAt,
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
        eq(carrierAssignments.id, params.assignmentId),
        eq(
          carrierAssignments.carrierOrganisationId,
          currentUser.organisationId,
        ),
      ),
    );

  if (!job) {
    notFound();
  }

  const successMessage =
    searchParams?.success === "created"
      ? "External job created successfully."
      : null;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pb-10 pl-[22vw] pr-8 pt-[16vh]">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                Carrier job
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-black">
                  {getJobTitle(job)}
                </h1>

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

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
                View the operational details for this job. Collection,
                completion and receipt actions will be connected in the next
                operational flow step.
              </p>
            </div>

            <Link
              href="/home/operations/jobs"
              className="inline-flex rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/60 transition hover:border-orange-300 hover:text-orange-600"
            >
              Back to jobs
            </Link>
          </div>

          {successMessage && (
            <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800">
              {successMessage}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Site" value={job.siteName ?? "Main Site"} />
          <SummaryCard
            label="Collection date"
            value={formatDate(job.externalCollectionDate ?? job.assignedAt)}
          />
          <SummaryCard label="Pickup" value={getPickup(job)} />
          <SummaryCard label="Destination" value={getDestination(job)} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Panel eyebrow="Waste" title="Waste details">
              <InfoRow
                label="Description"
                value={
                  job.externalWasteDescription ||
                  job.listingName ||
                  "No waste description added."
                }
              />
              <InfoRow label="EWC code" value={job.externalEwcCode} />
              <InfoRow
                label="Estimated weight"
                value={
                  job.externalEstimatedWeight
                    ? `${job.externalEstimatedWeight} tonnes`
                    : null
                }
              />
              <InfoRow label="Listing status" value={job.listingStatus} />
            </Panel>

            <Panel eyebrow="Movement" title="Pickup and destination">
              <InfoRow label="Pickup" value={getPickup(job)} />
              <InfoRow label="Destination" value={getDestination(job)} />
              <InfoRow
                label="Collection date"
                value={formatDate(job.externalCollectionDate)}
              />
              <InfoRow label="Notes" value={job.externalNotes} />
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel eyebrow="Customer" title="Customer details">
              <InfoRow label="Name" value={job.externalCustomerName} />
              <InfoRow label="Email" value={job.externalCustomerEmail} />
              <InfoRow label="Phone" value={job.externalCustomerPhone} />
              <InfoRow label="Reference" value={job.externalReference} />
            </Panel>

            <Panel eyebrow="Timeline" title="Operational timeline">
              <InfoRow label="Assigned" value={formatDateTime(job.assignedAt)} />
              <InfoRow
                label="Accepted"
                value={formatDateTime(job.respondedAt)}
              />
              <InfoRow
                label="Collected"
                value={formatDateTime(job.collectedAt)}
              />
              <InfoRow
                label="Completed"
                value={formatDateTime(job.completedAt)}
              />
            </Panel>

            <div className="rounded-[2rem] border border-black/10 bg-black p-6 text-white shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
                Next operational step
              </p>

              <h2 className="mt-2 text-lg font-semibold">
                Collection workflow
              </h2>

              <p className="mt-2 text-sm leading-6 text-white/60">
                Next we can add status controls: mark in progress, mark
                collected, complete job, report incident and generate receipt.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>

      <p className="mt-2 line-clamp-2 text-sm font-semibold text-black/70">
        {value || "Not set"}
      </p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-xl font-semibold text-black">{title}</h2>

      <div className="mt-5 divide-y divide-black/10">{children}</div>
    </section>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[180px_1fr]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/35">
        {label}
      </p>

      <p className="text-sm leading-6 text-black/65">
        {value || "Not set"}
      </p>
    </div>
  );
}