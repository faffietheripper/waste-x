// src/app/home/operations/jobs/[assignmentId]/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  carrierAssignments,
  incidents,
  sites,
  users,
  wasteReceiptItems,
  wasteReceipts,
  wasteTrackingOrganisationSettings,
  wasteTrackingSubmissions,
  type OrganisationOperatingMode,
} from "@/db/schema";
import {
  shouldShowExternalJobs,
  type OrganisationCapability,
} from "@/modules/organisations/core/operatingModes";

import AssignmentIncidentModal from "@/components/app/Assignments/AssignmentIncidentModal";
import { completeExternalCarrierJobAction } from "../actions";

type PageProps = {
  params:
    | Promise<{
        assignmentId: string;
      }>
    | {
        assignmentId: string;
      };
  searchParams?:
    | Promise<{
        success?: string;
      }>
    | {
        success?: string;
      };
};

type Tone = "muted" | "warning" | "success" | "danger";

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
    in_progress: "In progress",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
    draft: "Draft",
    confirmed: "Confirmed",
    submitted: "Submitted",
    accepted_with_warnings: "Accepted with warnings",
    failed: "Failed",
    open: "Open",
    under_review: "Under review",
    resolved: "Resolved",
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

function getStatusClass(status: string | null | undefined) {
  if (status === "completed" || status === "confirmed" || status === "accepted") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "in_progress" || status === "draft" || status === "submitted") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (status === "rejected" || status === "cancelled" || status === "failed") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-black/10 bg-[#f7f3ed] text-black/50";
}

function getIncidentStatusClass(status: string | null | undefined) {
  if (status === "open") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "under_review") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (status === "resolved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-black/10 bg-[#f7f3ed] text-black/50";
}

function toneClass(tone: Tone) {
  const classes: Record<Tone, string> = {
    muted: "border-black/10 bg-[#f7f3ed] text-black/50",
    warning: "border-orange-200 bg-orange-50 text-orange-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-red-200 bg-red-50 text-red-700",
  };

  return classes[tone];
}

function getJobTitle(job: typeof carrierAssignments.$inferSelect) {
  return (
    job.externalCustomerName ||
    job.externalWasteDescription ||
    job.externalReference ||
    "External job"
  );
}

function getPickup(job: typeof carrierAssignments.$inferSelect) {
  return (
    [job.externalPickupAddress, job.externalPickupPostcode]
      .filter(Boolean)
      .join(", ") || "Not set"
  );
}

function getDestination(job: typeof carrierAssignments.$inferSelect) {
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

function getAddress(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ");
}

function isUserInvolved(params: {
  assignment: typeof carrierAssignments.$inferSelect;
  organisationId: string;
}) {
  const { assignment, organisationId } = params;

  return (
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId ||
    assignment.managerOrganisationId === organisationId ||
    assignment.carrierOrganisationId === organisationId
  );
}

function isUnresolvedIncidentStatus(status: string | null | undefined) {
  return status === "open" || status === "under_review";
}

function getReadiness(params: {
  job: typeof carrierAssignments.$inferSelect;
  receipt: typeof wasteReceipts.$inferSelect | null;
  itemCount: number;
  unresolvedIncidentCount: number;
  dwtEnabled: boolean;
  hasReceiverApiCode: boolean;
}) {
  const missing: string[] = [];

  if (params.unresolvedIncidentCount > 0) {
    missing.push("resolve incidents");
  }

  if (!params.dwtEnabled) {
    missing.push("enable DWT settings");
  }

  if (!params.hasReceiverApiCode) {
    missing.push("receiver API code");
  }

  if (params.job.status !== "completed") {
    missing.push("complete the external job");
  }

  if (!params.receipt) {
    missing.push("draft receipt");
  }

  if (params.receipt) {
    if (
      !params.receipt.carrierRegistrationNumber &&
      !params.receipt.carrierReasonForNoRegistrationNumber
    ) {
      missing.push("carrier registration or reason");
    }

    if (!params.receipt.carrierOrganisationName) {
      missing.push("carrier organisation name");
    }

    if (
      params.receipt.carrierMeansOfTransport === "Road" &&
      !params.receipt.carrierVehicleRegistration
    ) {
      missing.push("vehicle registration");
    }

    if (!params.receipt.receiverAuthorisationNumber) {
      missing.push("receiver permit / authorisation number");
    }

    if (!params.receipt.receiptFullAddress) {
      missing.push("receipt address");
    }

    if (!params.receipt.receiptPostcode) {
      missing.push("receipt postcode");
    }
  }

  if (params.itemCount === 0) {
    missing.push("at least one waste item");
  }

  if (missing.length === 0) {
    return {
      label: "Ready for DWT review",
      tone: "success" as const,
      description:
        "The job is complete and the DWT draft has enough information to review in receiving intake.",
      missing,
    };
  }

  if (params.unresolvedIncidentCount > 0) {
    return {
      label: "Blocked by incident",
      tone: "danger" as const,
      description:
        "This job has an unresolved incident. Resolve it before completing the external job or submitting DWT.",
      missing,
    };
  }

  if (params.receipt && params.itemCount > 0) {
    return {
      label: "Draft partially ready",
      tone: "warning" as const,
      description: `${missing.length} item${
        missing.length === 1 ? "" : "s"
      } still need attention before final submission.`,
      missing,
    };
  }

  return {
    label: "Draft needs information",
    tone: "muted" as const,
    description: `${missing.length} item${
      missing.length === 1 ? "" : "s"
    } missing before DWT submission.`,
    missing,
  };
}

export default async function CarrierJobDetailPage({
  params,
  searchParams,
}: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

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

  const job = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, resolvedParams.assignmentId),
    with: {
      listing: true,
      organisation: true,
      carrierOrganisation: true,
      managerOrganisation: true,
      assignedByOrganisation: true,
    },
  });

  if (!job || job.jobSource !== "external_manual") {
    notFound();
  }

  if (
    !isUserInvolved({
      assignment: job,
      organisationId: currentUser.organisationId,
    })
  ) {
    notFound();
  }

  const jobSite = job.siteId
    ? await database.query.sites.findFirst({
        where: eq(sites.id, job.siteId),
      })
    : null;

  const latestReceipt = await database.query.wasteReceipts.findFirst({
    where: and(
      eq(wasteReceipts.assignmentId, job.id),
      eq(wasteReceipts.organisationId, currentUser.organisationId),
    ),
    orderBy: [desc(wasteReceipts.updatedAt)],
  });

  const receiptItems = latestReceipt
    ? await database.query.wasteReceiptItems.findMany({
        where: and(
          eq(wasteReceiptItems.receiptId, latestReceipt.id),
          eq(wasteReceiptItems.organisationId, currentUser.organisationId),
        ),
      })
    : [];

  const jobIncidents = await database
    .select()
    .from(incidents)
    .where(eq(incidents.assignmentId, job.id))
    .orderBy(desc(incidents.incidentDate));

  const unresolvedIncidents = jobIncidents.filter((incident) =>
    isUnresolvedIncidentStatus(incident.status),
  );

  const hasUnresolvedIncident = unresolvedIncidents.length > 0;
  const hasAnyIncident = jobIncidents.length > 0;

  const dwtSettings =
    await database.query.wasteTrackingOrganisationSettings.findFirst({
      where: eq(
        wasteTrackingOrganisationSettings.organisationId,
        currentUser.organisationId,
      ),
    });

  const latestSubmission =
    await database.query.wasteTrackingSubmissions.findFirst({
      where: and(
        eq(wasteTrackingSubmissions.assignmentId, job.id),
        eq(wasteTrackingSubmissions.organisationId, currentUser.organisationId),
      ),
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
    });

  const readiness = getReadiness({
    job,
    receipt: latestReceipt ?? null,
    itemCount: receiptItems.length,
    unresolvedIncidentCount: unresolvedIncidents.length,
    dwtEnabled: Boolean(dwtSettings?.isEnabled),
    hasReceiverApiCode: Boolean(dwtSettings?.apiCode),
  });

  const successMessage =
    resolvedSearchParams?.success === "created"
      ? "External job and DWT draft created successfully."
      : resolvedSearchParams?.success === "completed"
        ? "External job completed. The DWT intake form is now available."
        : null;

  const jobIsCompleted = job.status === "completed";

  const canReportIncident =
    !jobIsCompleted &&
    !hasUnresolvedIncident &&
    ["accepted", "in_progress"].includes(job.status);

  const canCompleteExternalJob = !jobIsCompleted && !hasUnresolvedIncident;

  const firstUnresolvedIncident = unresolvedIncidents[0] ?? null;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pb-10 pl-[22vw] pr-8 pt-[16vh]">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                External job
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

                <span
                  className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneClass(
                    readiness.tone,
                  )}`}
                >
                  {readiness.label}
                </span>

                {hasUnresolvedIncident && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-700">
                    Completion blocked
                  </span>
                )}
              </div>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
                This is a private external job with a draft DWT receipt attached.
                Incidents now connect to the normal Waste X incident system and
                must be resolved before completion.
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
          <SummaryCard label="Site" value={jobSite?.name ?? "Main Site"} />
          <SummaryCard
            label="Collection date"
            value={formatDate(job.externalCollectionDate ?? job.assignedAt)}
          />
          <SummaryCard label="Pickup" value={getPickup(job)} />
          <SummaryCard label="Destination" value={getDestination(job)} />
        </section>

        <section
          className={`rounded-3xl border p-6 shadow-sm ${toneClass(
            readiness.tone,
          )}`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em]">
                DWT readiness
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                {readiness.label}
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6">
                {readiness.description}
              </p>

              {readiness.missing.length > 0 && (
                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-6">
                  {readiness.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-3">
              {jobIsCompleted ? (
                <Link
                  href={`/home/receiving/intake/${job.id}`}
                  className="rounded-full bg-black px-5 py-3 text-center text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                >
                  Open DWT intake →
                </Link>
              ) : hasUnresolvedIncident ? (
                <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                  <p className="font-semibold">Completion blocked</p>

                  <p className="mt-2 leading-6">
                    Resolve the open incident before marking this external job
                    completed.
                  </p>

                  <Link
                    href={
                      firstUnresolvedIncident
                        ? `/home/operations/incidents/${firstUnresolvedIncident.id}`
                        : "/home/operations/incidents"
                    }
                    className="mt-4 inline-flex rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
                  >
                    Resolve incident →
                  </Link>
                </div>
              ) : (
                <form action={completeExternalCarrierJobAction}>
                  <input type="hidden" name="assignmentId" value={job.id} />

                  <button
                    type="submit"
                    className="w-full rounded-full bg-black px-5 py-3 text-center text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                  >
                    Mark job completed
                  </button>
                </form>
              )}

              {canReportIncident && (
                <AssignmentIncidentModal
                  assignment={{
                    assignmentId: job.id,
                    listingId: job.listingId,
                    listingName: getJobTitle(job),
                    assignedAt: job.assignedAt,
                  }}
                  hasIncident={hasUnresolvedIncident}
                />
              )}

              <Link
                href={`/home/operations/assignments/${job.id}`}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-center text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
              >
                View assignment →
              </Link>
            </div>
          </div>
        </section>

        {jobIncidents.length > 0 && (
          <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                  Incidents
                </p>

                <h2 className="mt-2 text-xl font-semibold text-black">
                  Linked incident records
                </h2>

                <p className="mt-2 text-sm leading-6 text-black/50">
                  External jobs use the same incident records as normal Waste X
                  assignments.
                </p>
              </div>

              <Link
                href="/home/operations/incidents"
                className="rounded-full border border-black/10 bg-[#f7f3ed] px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
              >
                Open incident centre →
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {jobIncidents.map((incident) => (
                <Link
                  key={incident.id}
                  href={`/home/operations/incidents/${incident.id}`}
                  className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 transition hover:border-orange-300 hover:bg-orange-50"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-black">
                        {incident.type}
                      </p>

                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-black/50">
                        {incident.summary}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${getIncidentStatusClass(
                        incident.status,
                      )}`}
                    >
                      {formatStatus(incident.status)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Panel eyebrow="Waste" title="Waste details">
              <InfoRow
                label="Description"
                value={
                  job.externalWasteDescription ||
                  job.listing?.name ||
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
              <InfoRow label="Receipt item count" value={receiptItems.length} />
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

            <Panel eyebrow="DWT draft" title="Draft receipt">
              <InfoRow label="Receipt ID" value={latestReceipt?.id} />
              <InfoRow
                label="Receipt status"
                value={formatStatus(latestReceipt?.status)}
              />
              <InfoRow
                label="Received at"
                value={formatDateTime(latestReceipt?.receivedAt)}
              />
              <InfoRow
                label="Carrier registration"
                value={
                  latestReceipt?.carrierRegistrationNumber ??
                  latestReceipt?.carrierReasonForNoRegistrationNumber
                }
              />
              <InfoRow
                label="Carrier name"
                value={latestReceipt?.carrierOrganisationName}
              />
              <InfoRow
                label="Vehicle registration"
                value={latestReceipt?.carrierVehicleRegistration}
              />
              <InfoRow
                label="Receiver authorisation"
                value={latestReceipt?.receiverAuthorisationNumber}
              />
              <InfoRow
                label="Receipt address"
                value={
                  latestReceipt
                    ? getAddress([
                        latestReceipt.receiptFullAddress,
                        latestReceipt.receiptPostcode,
                      ])
                    : null
                }
              />
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
              <InfoRow label="Accepted" value={formatDateTime(job.respondedAt)} />
              <InfoRow
                label="Collected"
                value={formatDateTime(job.collectedAt)}
              />
              <InfoRow
                label="Completed"
                value={formatDateTime(job.completedAt)}
              />
            </Panel>

            <Panel eyebrow="DWT settings" title="Submission status">
              <InfoRow
                label="DWT enabled"
                value={dwtSettings?.isEnabled ? "Yes" : "No"}
              />
              <InfoRow
                label="Receiver API code"
                value={dwtSettings?.apiCode ? "Configured" : "Missing"}
              />
              <InfoRow
                label="Environment"
                value={dwtSettings?.environment ?? "test"}
              />
              <InfoRow
                label="Latest submission"
                value={formatStatus(latestSubmission?.status)}
              />
              <InfoRow
                label="Waste tracking ID"
                value={latestSubmission?.wasteTrackingId}
              />
            </Panel>

            {hasUnresolvedIncident && (
              <div className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm">
                <p className="text-sm font-semibold">
                  External job blocked by incident
                </p>

                <p className="mt-2 text-sm leading-6">
                  Resolve {unresolvedIncidents.length} unresolved incident
                  {unresolvedIncidents.length === 1 ? "" : "s"} before job
                  completion or DWT submission.
                </p>

                <Link
                  href={
                    firstUnresolvedIncident
                      ? `/home/operations/incidents/${firstUnresolvedIncident.id}`
                      : "/home/operations/incidents"
                  }
                  className="mt-4 inline-flex rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
                >
                  Resolve incident →
                </Link>
              </div>
            )}

            {!dwtSettings?.isEnabled && (
              <div className="rounded-[2rem] border border-orange-200 bg-orange-50 p-6 text-orange-800 shadow-sm">
                <p className="text-sm font-semibold">DWT settings required</p>

                <p className="mt-2 text-sm leading-6">
                  Enable Digital Waste Tracking and add the receiver API code in
                  organisation settings before final submission.
                </p>

                <Link
                  href="/home/settings/digital-waste-tracking"
                  className="mt-4 inline-flex rounded-full bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500"
                >
                  Open DWT settings →
                </Link>
              </div>
            )}
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
        {value || value === 0 ? value : "Not set"}
      </p>
    </div>
  );
}