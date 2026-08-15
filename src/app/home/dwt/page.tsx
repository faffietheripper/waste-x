import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  jobLoads,
  users,
  wasteReceipts,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { getWasteTrackingOrganisationSettings } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings";
import { prepareJobLoadDwtDraftAction } from "./actions";

type PageProps = {
  searchParams?: {
    error?: string;
    missing?: string;
  };
};

type DwtQueueStatus =
  | "needs_draft"
  | "ready_for_review"
  | "needs_attention"
  | "submitted"
  | "submitted_with_warnings";

function formatDate(value: Date | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatWeight(value: string | null, metric: string) {
  const amount = Number(value ?? "0");
  if (!Number.isFinite(amount)) return "Not recorded";
  return `${amount.toLocaleString("en-GB", {
    maximumFractionDigits: 3,
  })} ${metric}`;
}

function queueStatusLabel(status: DwtQueueStatus) {
  if (status === "needs_draft") return "Prepare draft";
  if (status === "ready_for_review") return "Ready for review";
  if (status === "needs_attention") return "Needs attention";
  if (status === "submitted_with_warnings") return "Submitted · warnings";
  return "Submitted";
}

function queueStatusClasses(status: DwtQueueStatus) {
  if (status === "needs_draft") {
    return "border-black/10 bg-black/5 text-black/55";
  }
  if (status === "ready_for_review") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (status === "needs_attention") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (status === "submitted_with_warnings") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default async function DwtCentrePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: { organisation: true },
  });

  if (!currentUser?.organisationId || !currentUser.organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const organisationId = currentUser.organisationId;

  const [loads, receipts, submissions, settings] = await Promise.all([
    database.query.jobLoads.findMany({
      where: and(
        eq(jobLoads.organisationId, organisationId),
        eq(jobLoads.direction, "incoming"),
        eq(jobLoads.status, "completed"),
      ),
      with: {
        job: true,
        client: true,
        clientSite: true,
        ownSite: true,
        vehicle: true,
        materialProfile: true,
      },
      orderBy: [desc(jobLoads.receivedAt), desc(jobLoads.completedAt)],
      limit: 150,
    }),
    database.query.wasteReceipts.findMany({
      where: eq(wasteReceipts.organisationId, organisationId),
      orderBy: [desc(wasteReceipts.createdAt)],
    }),
    database.query.wasteTrackingSubmissions.findMany({
      where: eq(wasteTrackingSubmissions.organisationId, organisationId),
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
      limit: 500,
    }),
    getWasteTrackingOrganisationSettings({ organisationId }),
  ]);

  const receiptByLoad = new Map<string, (typeof receipts)[number]>();
  for (const receipt of receipts) {
    if (receipt.jobLoadId && !receiptByLoad.has(receipt.jobLoadId)) {
      receiptByLoad.set(receipt.jobLoadId, receipt);
    }
  }

  const latestSubmissionByLoad = new Map<
    string,
    (typeof submissions)[number]
  >();
  for (const submission of submissions) {
    if (submission.jobLoadId && !latestSubmissionByLoad.has(submission.jobLoadId)) {
      latestSubmissionByLoad.set(submission.jobLoadId, submission);
    }
  }

  const queue = loads.map((load) => {
    const receipt = receiptByLoad.get(load.id) ?? null;
    const latestSubmission = latestSubmissionByLoad.get(load.id) ?? null;

    let status: DwtQueueStatus = receipt
      ? "ready_for_review"
      : "needs_draft";

    if (latestSubmission) {
      if (latestSubmission.status === "accepted") status = "submitted";
      if (latestSubmission.status === "accepted_with_warnings") {
        status = "submitted_with_warnings";
      }
      if (
        latestSubmission.status === "rejected" ||
        latestSubmission.status === "failed"
      ) {
        status = "needs_attention";
      }
    }

    return { load, receipt, latestSubmission, status };
  });

  const needsReview = queue.filter((item) =>
    ["needs_draft", "ready_for_review"].includes(item.status),
  ).length;
  const needsAttention = queue.filter(
    (item) => item.status === "needs_attention",
  ).length;
  const submitted = queue.filter((item) =>
    ["submitted", "submitted_with_warnings"].includes(item.status),
  ).length;

  const dwtConfigured = Boolean(settings?.apiCode);
  const dwtEnabled = Boolean(settings?.isEnabled);
  const ownCarrierConfigured = Boolean(
    settings?.ownCarrierRegistrationNumber ||
      settings?.ownCarrierReasonForNoRegistrationNumber,
  );

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-24 -top-24 size-80 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Compliance · Receipt of Waste
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                DWT Centre
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Completed incoming loads automatically become receipt drafts.
                Review the prefilled movement before using the existing Defra
                Receipt API submission engine.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/dwt/submissions"
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
              >
                Submission history
              </Link>
              <Link
                href="/home/settings/digital-waste-tracking"
                className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black"
              >
                DWT settings
              </Link>
            </div>
          </div>
        </section>

        {searchParams?.error && (
          <section className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="text-sm font-semibold">Draft could not be prepared</p>
            <p className="mt-2 text-sm leading-6">
              {searchParams.error}
              {searchParams.missing
                ? ` · Missing: ${searchParams.missing.replaceAll(",", ", ")}`
                : ""}
            </p>
          </section>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Completed incoming loads" value={loads.length} />
          <Metric label="To review" value={needsReview} highlight />
          <Metric label="Needs attention" value={needsAttention} />
          <Metric label="Submitted" value={submitted} />
          <Metric
            label="DWT connection"
            value={dwtEnabled && dwtConfigured ? "Ready" : "Check settings"}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <ConfigCard
            label="Receiver API Code"
            ready={dwtConfigured}
            detail={dwtConfigured ? "Configured" : "Required before submission"}
          />
          <ConfigCard
            label="DWT submissions"
            ready={dwtEnabled}
            detail={dwtEnabled ? "Enabled" : "Disabled in settings"}
          />
          <ConfigCard
            label="Own transport carrier details"
            ready={ownCarrierConfigured}
            detail={
              ownCarrierConfigured
                ? "Available for self-haulage"
                : "Needed only when your organisation is the carrier"
            }
          />
        </section>

        <section className="mt-8 rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-900">
          <p className="text-sm font-semibold">Safety boundary</p>
          <p className="mt-2 max-w-5xl text-sm leading-6 text-blue-800/80">
            Waste X prepares the receipt automatically; it does not submit it
            automatically. The operator still opens the load, reviews the exact
            Defra fields and explicitly submits. The existing legacy
            /home/receiving workflow and PAT tooling remain untouched as a
            regression/fallback path.
          </p>
        </section>

        <section className="mt-9">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                Receipt queue
              </p>
              <h2 className="mt-1 text-2xl font-semibold">Incoming Job Loads</h2>
            </div>
            <p className="text-xs text-black/40">Newest receipts first</p>
          </div>

          {queue.length === 0 ? (
            <div className="mt-5 rounded-[30px] border border-dashed border-black/15 bg-white p-12 text-center">
              <h3 className="text-xl font-semibold">No completed incoming loads yet</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
                Complete an incoming load from the Daily Worksheet. It will
                appear here ready for DWT receipt preparation and review.
              </p>
              <Link
                href="/home/worksheet"
                className="mt-5 inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-white"
              >
                Open Daily Worksheet
              </Link>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {queue.map(({ load, receipt, latestSubmission, status }) => (
                <article
                  key={load.id}
                  className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${queueStatusClasses(
                            status,
                          )}`}
                        >
                          {queueStatusLabel(status)}
                        </span>
                        <span className="text-xs text-black/35">
                          {formatDate(load.receivedAt)}
                        </span>
                      </div>

                      <h3 className="mt-3 text-lg font-semibold">
                        {load.job.jobNumber} · Load {load.loadNumber}
                      </h3>
                      <p className="mt-1 text-sm text-black/55">
                        {load.client?.name ?? "Client not recorded"} ·{" "}
                        {load.clientSite?.name ?? "Origin not recorded"}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-black/45">
                        <span>
                          Waste: {load.ewcCodeSnapshot ?? "EWC missing"} ·{" "}
                          {load.wasteDescriptionSnapshot ?? "Description missing"}
                        </span>
                        <span>
                          Weight: {formatWeight(load.netWeight, load.weightMetric)}
                        </span>
                        <span>
                          Vehicle: {load.vehicle?.registrationNumber ?? "Not recorded"}
                        </span>
                        {latestSubmission?.wasteTrackingId && (
                          <span className="break-all">
                            WTID: {latestSubmission.wasteTrackingId}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-3">
                      <Link
                        href={`/home/jobs/${load.jobId}`}
                        className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold text-black/55"
                      >
                        Job
                      </Link>

                      {receipt ? (
                        <Link
                          href={`/home/dwt/intake/${load.id}`}
                          className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                        >
                          {status === "submitted" ||
                          status === "submitted_with_warnings"
                            ? "Review / update"
                            : status === "needs_attention"
                              ? "Fix & retry"
                              : "Review receipt"}
                        </Link>
                      ) : (
                        <form action={prepareJobLoadDwtDraftAction}>
                          <input type="hidden" name="jobLoadId" value={load.id} />
                          <button className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-black">
                            Prepare DWT draft
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 shadow-sm ${
        highlight
          ? "border-orange-200 bg-orange-50"
          : "border-black/10 bg-white"
      }`}
    >
      <p className="text-xs text-black/40">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-black">{value}</p>
    </div>
  );
}

function ConfigCard({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold">{label}</p>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
            ready
              ? "bg-emerald-50 text-emerald-700"
              : "bg-orange-50 text-orange-700"
          }`}
        >
          {ready ? "Ready" : "Check"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-black/40">{detail}</p>
    </div>
  );
}
