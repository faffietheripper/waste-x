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
    tab?: string;
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

  if (!Number.isFinite(amount)) {
    return "Not recorded";
  }

  return `${amount.toLocaleString("en-GB", {
    maximumFractionDigits: 3,
  })} ${metric}`;
}

function queueStatusLabel(status: DwtQueueStatus) {
  if (status === "needs_draft") {
    return "Prepare draft";
  }

  if (status === "ready_for_review") {
    return "Ready for review";
  }

  if (status === "needs_attention") {
    return "Needs attention";
  }

  if (status === "submitted_with_warnings") {
    return "Submitted · warnings";
  }

  return "Submitted";
}

function queueStatusClasses(status: DwtQueueStatus) {
  if (status === "needs_draft") {
    return "border-black/10 bg-black/[0.04] text-black/50";
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

export default async function DwtCentrePage({
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
      orderBy: [
        desc(jobLoads.receivedAt),
        desc(jobLoads.completedAt),
      ],
      limit: 150,
    }),

    database.query.wasteReceipts.findMany({
      where: eq(
        wasteReceipts.organisationId,
        organisationId,
      ),
      orderBy: [desc(wasteReceipts.createdAt)],
    }),

    database.query.wasteTrackingSubmissions.findMany({
      where: eq(
        wasteTrackingSubmissions.organisationId,
        organisationId,
      ),
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
      limit: 500,
    }),

    getWasteTrackingOrganisationSettings({
      organisationId,
    }),
  ]);

  /*
   * -------------------------------------------------------
   * RECEIPTS BY JOB LOAD
   * -------------------------------------------------------
   */

  const receiptByLoad = new Map<
    string,
    (typeof receipts)[number]
  >();

  for (const receipt of receipts) {
    if (
      receipt.jobLoadId &&
      !receiptByLoad.has(receipt.jobLoadId)
    ) {
      receiptByLoad.set(
        receipt.jobLoadId,
        receipt,
      );
    }
  }

  /*
   * -------------------------------------------------------
   * LATEST SUBMISSION BY JOB LOAD
   * -------------------------------------------------------
   */

  const latestSubmissionByLoad = new Map<
    string,
    (typeof submissions)[number]
  >();

  for (const submission of submissions) {
    if (
      submission.jobLoadId &&
      !latestSubmissionByLoad.has(
        submission.jobLoadId,
      )
    ) {
      latestSubmissionByLoad.set(
        submission.jobLoadId,
        submission,
      );
    }
  }

  /*
   * -------------------------------------------------------
   * BUILD DWT QUEUE
   * -------------------------------------------------------
   */

  const queue = loads.map((load) => {
    const receipt =
      receiptByLoad.get(load.id) ?? null;

    const latestSubmission =
      latestSubmissionByLoad.get(load.id) ?? null;

    let status: DwtQueueStatus = receipt
      ? "ready_for_review"
      : "needs_draft";

    if (latestSubmission) {
      if (
        latestSubmission.status === "accepted"
      ) {
        status = "submitted";
      }

      if (
        latestSubmission.status ===
        "accepted_with_warnings"
      ) {
        status = "submitted_with_warnings";
      }

      if (
        latestSubmission.status === "rejected" ||
        latestSubmission.status === "failed"
      ) {
        status = "needs_attention";
      }
    }

    return {
      load,
      receipt,
      latestSubmission,
      status,
    };
  });

  /*
   * -------------------------------------------------------
   * SPLIT ACTIVE AND FINISHED
   * -------------------------------------------------------
   */

  const incomingQueue = queue.filter(
    (item) =>
      item.status === "needs_draft" ||
      item.status === "ready_for_review" ||
      item.status === "needs_attention",
  );

  const submittedQueue = queue.filter(
    (item) =>
      item.status === "submitted" ||
      item.status ===
        "submitted_with_warnings",
  );

  const needsDraft = incomingQueue.filter(
    (item) =>
      item.status === "needs_draft",
  ).length;

  const readyForReview =
    incomingQueue.filter(
      (item) =>
        item.status === "ready_for_review",
    ).length;

  const needsAttention =
    incomingQueue.filter(
      (item) =>
        item.status === "needs_attention",
    ).length;

  const submitted = submittedQueue.length;

  /*
   * -------------------------------------------------------
   * DWT CONFIG
   * -------------------------------------------------------
   */

  const dwtConfigured = Boolean(
    settings?.apiCode,
  );

  const dwtEnabled = Boolean(
    settings?.isEnabled,
  );

  const ownCarrierConfigured = Boolean(
    settings?.ownCarrierRegistrationNumber ||
      settings?.ownCarrierReasonForNoRegistrationNumber,
  );

  /*
   * -------------------------------------------------------
   * ACTIVE TAB
   * -------------------------------------------------------
   */

  const activeTab =
    searchParams?.tab === "submitted"
      ? "submitted"
      : "incoming";

  return (
    <main className="min-h-screen bg-[#f4f1eb] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        {/*
         * ===================================================
         * HERO
         * ===================================================
         */}

        <section className="relative overflow-hidden rounded-[34px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-28 -top-32 size-[360px] rounded-full bg-orange-500/20 blur-3xl" />

          <div className="absolute -bottom-36 left-1/3 size-[300px] rounded-full bg-white/[0.04] blur-3xl" />

          <div className="relative z-10 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Compliance · Receipt of Waste
              </p>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                DWT Centre
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
                Review completed incoming
                movements, prepare digital waste
                tracking receipts and keep submitted
                records separate from work that still
                requires action.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/dwt/batch"
                className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Batch review
              </Link>

              <Link
                href="/home/dwt/submissions"
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Submission history
              </Link>

              <Link
                href="/home/settings/digital-waste-tracking"
                className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                DWT settings
              </Link>
            </div>
          </div>
        </section>

        {/*
         * ===================================================
         * ERROR
         * ===================================================
         */}

        {searchParams?.error && (
          <section className="mt-6 rounded-[26px] border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="text-sm font-semibold">
              Draft could not be prepared
            </p>

            <p className="mt-2 text-sm leading-6">
              {searchParams.error}

              {searchParams.missing
                ? ` · Missing: ${searchParams.missing.replaceAll(
                    ",",
                    ", ",
                  )}`
                : ""}
            </p>
          </section>
        )}

        {/*
         * ===================================================
         * TOP METRICS
         * ===================================================
         */}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Incoming"
            value={incomingQueue.length}
            highlight
          />

          <Metric
            label="Prepare draft"
            value={needsDraft}
          />

          <Metric
            label="Ready for review"
            value={readyForReview}
          />

          <Metric
            label="Needs attention"
            value={needsAttention}
          />

          <Metric
            label="Submitted"
            value={submitted}
          />
        </section>

        {/*
         * ===================================================
         * CONFIG STATUS
         * ===================================================
         */}

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <ConfigCard
            label="Receiver API Code"
            ready={dwtConfigured}
            detail={
              dwtConfigured
                ? "Configured and available"
                : "Required before submission"
            }
          />

          <ConfigCard
            label="DWT submissions"
            ready={dwtEnabled}
            detail={
              dwtEnabled
                ? "Submission service enabled"
                : "Disabled in DWT settings"
            }
          />

          <ConfigCard
            label="Own transport"
            ready={ownCarrierConfigured}
            detail={
              ownCarrierConfigured
                ? "Carrier details available"
                : "Only required for self-haulage"
            }
          />
        </section>

        {/*
         * ===================================================
         * MAIN DWT WORKSPACE
         * ===================================================
         */}

        <section className="mt-8 overflow-hidden rounded-[34px] border border-black/[0.08] bg-white shadow-sm">
          {/*
           * -------------------------------------------------
           * TAB HEADER
           * -------------------------------------------------
           */}

          <div className="border-b border-black/[0.07] bg-[#fbfaf7] p-3">
            <div className="grid grid-cols-2 gap-2 rounded-[24px] bg-black/[0.04] p-1.5">
              {/*
               * INCOMING TAB
               */}

              <Link
                href="/home/dwt?tab=incoming"
                className={`group relative flex items-center justify-between rounded-[19px] px-6 py-4 transition ${
                  activeTab === "incoming"
                    ? "bg-black text-white shadow-sm"
                    : "text-black/45 hover:bg-white hover:text-black"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-9 items-center justify-center rounded-full text-sm font-semibold ${
                      activeTab === "incoming"
                        ? "bg-orange-500 text-black"
                        : "bg-black/[0.05] text-black/45"
                    }`}
                  >
                    {incomingQueue.length}
                  </div>

                  <div className="text-left">
                    <p className="text-sm font-semibold">
                      Incoming
                    </p>

                    <p
                      className={`mt-0.5 text-[11px] ${
                        activeTab === "incoming"
                          ? "text-white/45"
                          : "text-black/35"
                      }`}
                    >
                      Requires DWT action
                    </p>
                  </div>
                </div>

                {needsAttention > 0 && (
                  <span className="rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
                    {needsAttention} issue
                    {needsAttention === 1
                      ? ""
                      : "s"}
                  </span>
                )}
              </Link>

              {/*
               * SUBMITTED TAB
               */}

              <Link
                href="/home/dwt?tab=submitted"
                className={`group relative flex items-center justify-between rounded-[19px] px-6 py-4 transition ${
                  activeTab === "submitted"
                    ? "bg-black text-white shadow-sm"
                    : "text-black/45 hover:bg-white hover:text-black"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-9 items-center justify-center rounded-full text-sm font-semibold ${
                      activeTab === "submitted"
                        ? "bg-emerald-400 text-black"
                        : "bg-black/[0.05] text-black/45"
                    }`}
                  >
                    {submittedQueue.length}
                  </div>

                  <div className="text-left">
                    <p className="text-sm font-semibold">
                      Submitted
                    </p>

                    <p
                      className={`mt-0.5 text-[11px] ${
                        activeTab === "submitted"
                          ? "text-white/45"
                          : "text-black/35"
                      }`}
                    >
                      Successfully processed
                    </p>
                  </div>
                </div>

                {activeTab === "submitted" && (
                  <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-300">
                    Complete
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/*
           * -------------------------------------------------
           * INCOMING TAB CONTENT
           * -------------------------------------------------
           */}

          {activeTab === "incoming" && (
            <div>
              <div className="flex flex-col gap-4 border-b border-black/[0.06] px-7 py-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                    Action queue
                  </p>

                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    Incoming loads
                  </h2>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-black/40">
                    These completed incoming loads
                    still require preparation,
                    review, correction or
                    submission.
                  </p>
                </div>

                <Link
                  href="/home/dwt/batch"
                  className="inline-flex rounded-full border border-black/10 bg-black px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                >
                  Open batch review
                </Link>
              </div>

              {incomingQueue.length === 0 ? (
                <div className="px-7 py-14">
                  <div className="mx-auto max-w-lg rounded-[28px] border border-dashed border-black/10 bg-[#faf8f4] p-10 text-center">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-xl font-semibold text-emerald-600">
                      ✓
                    </div>

                    <h3 className="mt-5 text-xl font-semibold">
                      Incoming queue clear
                    </h3>

                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-black/40">
                      There are no completed
                      incoming loads waiting for DWT
                      action.
                    </p>

                    <Link
                      href="/home/worksheet"
                      className="mt-6 inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                    >
                      Open Daily Worksheet
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-black/[0.06]">
                  {incomingQueue.map(
                    ({
                      load,
                      receipt,
                      latestSubmission,
                      status,
                    }) => (
                      <article
                        key={load.id}
                        className="px-7 py-6 transition hover:bg-[#faf8f4]"
                      >
                        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${queueStatusClasses(
                                  status,
                                )}`}
                              >
                                {queueStatusLabel(
                                  status,
                                )}
                              </span>

                              <span className="text-xs text-black/30">
                                Received{" "}
                                {formatDate(
                                  load.receivedAt,
                                )}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                              <h3 className="text-lg font-semibold">
                                {
                                  load.job
                                    .jobNumber
                                }
                              </h3>

                              <span className="hidden text-black/20 sm:block">
                                /
                              </span>

                              <span className="text-sm font-medium text-black/45">
                                Load{" "}
                                {load.loadNumber}
                              </span>
                            </div>

                            <p className="mt-1 text-sm text-black/50">
                              {load.client
                                ?.name ??
                                "Client not recorded"}
                              {" · "}
                              {load.clientSite
                                ?.name ??
                                "Origin not recorded"}
                            </p>

                            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <InfoItem
                                label="Waste"
                                value={
                                  <>
                                    {load.ewcCodeSnapshot ??
                                      "EWC missing"}
                                    <span className="mx-1 text-black/20">
                                      ·
                                    </span>
                                    {load.wasteDescriptionSnapshot ??
                                      "Description missing"}
                                  </>
                                }
                              />

                              <InfoItem
                                label="Net weight"
                                value={formatWeight(
                                  load.netWeight,
                                  load.weightMetric,
                                )}
                              />

                              <InfoItem
                                label="Vehicle"
                                value={
                                  load.vehicle
                                    ?.registrationNumber ??
                                  "Not recorded"
                                }
                              />

                              <InfoItem
                                label="Receipt"
                                value={
                                  receipt
                                    ? "Prepared"
                                    : "Not prepared"
                                }
                              />
                            </div>

                            {latestSubmission?.wasteTrackingId && (
                              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-xs text-red-700">
                                Previous WTID:{" "}
                                <span className="break-all font-semibold">
                                  {
                                    latestSubmission.wasteTrackingId
                                  }
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-3">
                            <Link
                              href={`/home/jobs/${load.jobId}`}
                              className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-black/50 transition hover:border-black/20 hover:text-black"
                            >
                              View job
                            </Link>

                            {receipt ? (
                              <Link
                                href={`/home/dwt/intake/${load.id}`}
                                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                                  status ===
                                  "needs_attention"
                                    ? "bg-red-600 text-white hover:bg-red-700"
                                    : "bg-black text-white hover:bg-orange-500 hover:text-black"
                                }`}
                              >
                                {status ===
                                "needs_attention"
                                  ? "Fix & retry"
                                  : "Review receipt"}
                              </Link>
                            ) : (
                              <form
                                action={
                                  prepareJobLoadDwtDraftAction
                                }
                              >
                                <input
                                  type="hidden"
                                  name="jobLoadId"
                                  value={load.id}
                                />

                                <button className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-orange-400">
                                  Prepare draft
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      </article>
                    ),
                  )}
                </div>
              )}
            </div>
          )}

          {/*
           * -------------------------------------------------
           * SUBMITTED TAB CONTENT
           * -------------------------------------------------
           */}

          {activeTab === "submitted" && (
            <div>
              <div className="flex flex-col gap-4 border-b border-black/[0.06] px-7 py-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-600">
                    Completed movements
                  </p>

                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    Submitted
                  </h2>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-black/40">
                    Successfully submitted Digital
                    Waste Tracking movements are kept
                    here and removed from the active
                    incoming queue.
                  </p>
                </div>

                <Link
                  href="/home/dwt/submissions"
                  className="inline-flex rounded-full border border-black/10 bg-white px-5 py-2.5 text-xs font-semibold text-black/60 transition hover:bg-black hover:text-white"
                >
                  Full submission history
                </Link>
              </div>

              {submittedQueue.length === 0 ? (
                <div className="px-7 py-14">
                  <div className="mx-auto max-w-lg rounded-[28px] border border-dashed border-black/10 bg-[#faf8f4] p-10 text-center">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-black/[0.04] text-xl font-semibold text-black/30">
                      —
                    </div>

                    <h3 className="mt-5 text-xl font-semibold">
                      Nothing submitted yet
                    </h3>

                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-black/40">
                      Once a DWT movement is
                      successfully submitted, it will
                      automatically move from Incoming
                      to this tab.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-black/[0.06]">
                  {submittedQueue.map(
                    ({
                      load,
                      receipt,
                      latestSubmission,
                      status,
                    }) => (
                      <article
                        key={load.id}
                        className="px-7 py-6 transition hover:bg-emerald-50/30"
                      >
                        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${queueStatusClasses(
                                  status,
                                )}`}
                              >
                                {queueStatusLabel(
                                  status,
                                )}
                              </span>

                              <span className="text-xs text-black/30">
                                Submitted{" "}
                                {formatDate(
                                  latestSubmission?.createdAt,
                                )}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                              <h3 className="text-lg font-semibold">
                                {
                                  load.job
                                    .jobNumber
                                }
                              </h3>

                              <span className="hidden text-black/20 sm:block">
                                /
                              </span>

                              <span className="text-sm font-medium text-black/45">
                                Load{" "}
                                {load.loadNumber}
                              </span>
                            </div>

                            <p className="mt-1 text-sm text-black/50">
                              {load.client
                                ?.name ??
                                "Client not recorded"}
                              {" · "}
                              {load.clientSite
                                ?.name ??
                                "Origin not recorded"}
                            </p>

                            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <InfoItem
                                label="Waste"
                                value={
                                  <>
                                    {load.ewcCodeSnapshot ??
                                      "EWC missing"}
                                    <span className="mx-1 text-black/20">
                                      ·
                                    </span>
                                    {load.wasteDescriptionSnapshot ??
                                      "Description missing"}
                                  </>
                                }
                              />

                              <InfoItem
                                label="Net weight"
                                value={formatWeight(
                                  load.netWeight,
                                  load.weightMetric,
                                )}
                              />

                              <InfoItem
                                label="Vehicle"
                                value={
                                  load.vehicle
                                    ?.registrationNumber ??
                                  "Not recorded"
                                }
                              />

                              <InfoItem
                                label="Receipt"
                                value={
                                  receipt
                                    ? "Prepared"
                                    : "Not recorded"
                                }
                              />
                            </div>

                            {latestSubmission?.wasteTrackingId && (
                              <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs text-emerald-700">
                                <span className="font-medium">
                                  WTID
                                </span>

                                <span className="break-all font-semibold">
                                  {
                                    latestSubmission.wasteTrackingId
                                  }
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-3">
                            <Link
                              href={`/home/jobs/${load.jobId}`}
                              className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-black/50 transition hover:border-black/20 hover:text-black"
                            >
                              View job
                            </Link>

                            <Link
                              href={`/home/dwt/intake/${load.id}`}
                              className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                            >
                              View submission
                            </Link>
                          </div>
                        </div>
                      </article>
                    ),
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/*
         * ===================================================
         * SAFETY NOTE
         * ===================================================
         */}

        <section className="mt-6 flex flex-col gap-3 rounded-[26px] border border-blue-200 bg-blue-50 px-6 py-5 text-blue-900 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold">
              Submission safety
            </p>

            <p className="mt-1 max-w-4xl text-xs leading-5 text-blue-800/70">
              Waste X may prepare receipt data
              automatically, but the operator still
              reviews the movement before explicit DWT
              submission. Failed or rejected
              submissions remain in the Incoming tab
              until resolved.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

/*
 * =========================================================
 * METRIC
 * =========================================================
 */

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
      className={`rounded-[26px] border p-5 shadow-sm ${
        highlight
          ? "border-orange-200 bg-orange-50"
          : "border-black/[0.08] bg-white"
      }`}
    >
      <p className="text-xs text-black/40">
        {label}
      </p>

      <p className="mt-3 text-2xl font-semibold tracking-tight text-black">
        {value}
      </p>
    </div>
  );
}

/*
 * =========================================================
 * CONFIG CARD
 * =========================================================
 */

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
    <div className="rounded-[26px] border border-black/[0.08] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold">
          {label}
        </p>

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

      <p className="mt-2 text-xs leading-5 text-black/40">
        {detail}
      </p>
    </div>
  );
}

/*
 * =========================================================
 * INFORMATION ITEM
 * =========================================================
 */

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-black/[0.025] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-black/30">
        {label}
      </p>

      <div className="mt-1.5 text-xs font-medium leading-5 text-black/65">
        {value}
      </div>
    </div>
  );
}