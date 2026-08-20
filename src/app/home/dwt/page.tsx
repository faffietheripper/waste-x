import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  jobLoads,
  wasteReceipts,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { getWasteTrackingOrganisationSettings } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

import { prepareJobLoadDwtDraftAction } from "./actions";

type PageProps = {
  searchParams?: {
    tab?: string;
    error?: string;
    missing?: string;
  };
};

type QueueStatus =
  | "draft_missing"
  | "prepared"
  | "attention"
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
  return `${amount.toLocaleString("en-GB", { maximumFractionDigits: 3 })} ${metric}`;
}

function statusLabel(status: QueueStatus) {
  if (status === "draft_missing") return "Draft missing";
  if (status === "prepared") return "Prepared for validation";
  if (status === "attention") return "Needs attention";
  if (status === "submitted_with_warnings") return "Submitted · warnings";
  return "Submitted";
}

function statusClass(status: QueueStatus) {
  if (status === "draft_missing") return "border-black/10 bg-black/[0.04] text-black/50";
  if (status === "prepared") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "attention") return "border-red-200 bg-red-50 text-red-700";
  if (status === "submitted_with_warnings") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default async function DwtCentrePage({ searchParams }: PageProps) {
  const context = await requireSoloPermission("dwt:view");
  const organisationId = context.organisationId;

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
        vehicle: true,
      },
      orderBy: [desc(jobLoads.receivedAt), desc(jobLoads.completedAt)],
      limit: 200,
    }),
    database.query.wasteReceipts.findMany({
      where: eq(wasteReceipts.organisationId, organisationId),
      orderBy: [desc(wasteReceipts.createdAt)],
    }),
    database.query.wasteTrackingSubmissions.findMany({
      where: eq(wasteTrackingSubmissions.organisationId, organisationId),
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
      limit: 1000,
    }),
    getWasteTrackingOrganisationSettings({ organisationId }),
  ]);

  const receiptByLoad = new Map<string, (typeof receipts)[number]>();
  for (const receipt of receipts) {
    if (receipt.jobLoadId && !receiptByLoad.has(receipt.jobLoadId)) {
      receiptByLoad.set(receipt.jobLoadId, receipt);
    }
  }

  const latestSubmissionByLoad = new Map<string, (typeof submissions)[number]>();
  for (const submission of submissions) {
    if (submission.jobLoadId && !latestSubmissionByLoad.has(submission.jobLoadId)) {
      latestSubmissionByLoad.set(submission.jobLoadId, submission);
    }
  }

  const rows = loads.map((load) => {
    const receipt = receiptByLoad.get(load.id) ?? null;
    const latestSubmission = latestSubmissionByLoad.get(load.id) ?? null;

    // A prepared receipt is NOT automatically "ready".
    // Final Ready status belongs only to the batch preflight screen.
    let status: QueueStatus = receipt ? "prepared" : "draft_missing";

    if (
      receipt?.status === "submitted" ||
      latestSubmission?.status === "accepted"
    ) {
      status = "submitted";
    } else if (latestSubmission?.status === "accepted_with_warnings") {
      status = "submitted_with_warnings";
    } else if (
      latestSubmission?.status === "rejected" ||
      latestSubmission?.status === "failed" ||
      latestSubmission?.status === "submitted"
    ) {
      status = "attention";
    }

    return { load, receipt, latestSubmission, status };
  });

  const activeRows = rows.filter(
    (row) => row.status !== "submitted" && row.status !== "submitted_with_warnings",
  );
  const submittedRows = rows.filter(
    (row) => row.status === "submitted" || row.status === "submitted_with_warnings",
  );
  const attentionCount = activeRows.filter((row) => row.status === "attention").length;
  const activeTab = searchParams?.tab === "submitted" ? "submitted" : "incoming";
  const dwtReady = Boolean(settings?.isEnabled && settings?.apiCode);

  return (
    <main className="min-h-screen bg-[#f4f1eb] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <section className="relative overflow-hidden rounded-[34px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-28 -top-32 size-[360px] rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Compliance · Digital Waste Tracking
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">DWT Centre</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Completed incoming loads flow into one batch queue. Waste X prepares the
                receipt, then the batch screen validates the movement, isolates exceptions
                and lets you submit all genuinely ready movements together.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/dwt/batch"
                className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Batch submission
              </Link>
              <Link
                href="/home/dwt/submissions"
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
              >
                Full history
              </Link>
              <Link
                href="/home/settings/digital-waste-tracking"
                className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white"
              >
                DWT settings
              </Link>
            </div>
          </div>
        </section>

        {searchParams?.error ? (
          <section className="mt-6 rounded-[26px] border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="text-sm font-semibold">DWT action needs attention</p>
            <p className="mt-2 text-sm">
              {searchParams.error}
              {searchParams.missing
                ? ` · Missing: ${searchParams.missing.replaceAll(",", ", ")}`
                : ""}
            </p>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Incoming queue" value={activeRows.length} highlight />
          <Metric label="Needs attention" value={attentionCount} />
          <Metric label="Submitted" value={submittedRows.length} />
          <Metric label="DWT connection" value={dwtReady ? "Ready" : "Check settings"} />
        </section>

        <section className="mt-8 overflow-hidden rounded-[34px] border border-black/[0.08] bg-white shadow-sm">
          <div className="border-b border-black/[0.07] bg-[#fbfaf7] p-3">
            <div className="grid grid-cols-2 gap-2 rounded-[24px] bg-black/[0.04] p-1.5">
              <Link
                href="/home/dwt?tab=incoming"
                className={`flex items-center justify-between rounded-[19px] px-6 py-4 transition ${
                  activeTab === "incoming"
                    ? "bg-black text-white shadow-sm"
                    : "text-black/45 hover:bg-white hover:text-black"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex size-9 items-center justify-center rounded-full text-sm font-semibold ${
                      activeTab === "incoming"
                        ? "bg-orange-500 text-black"
                        : "bg-black/[0.05] text-black/45"
                    }`}
                  >
                    {activeRows.length}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Incoming</p>
                    <p className={`mt-0.5 text-[11px] ${activeTab === "incoming" ? "text-white/45" : "text-black/35"}`}>
                      Still needs DWT action
                    </p>
                  </div>
                </div>
                {attentionCount > 0 ? (
                  <span className="rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
                    {attentionCount} issue{attentionCount === 1 ? "" : "s"}
                  </span>
                ) : null}
              </Link>

              <Link
                href="/home/dwt?tab=submitted"
                className={`flex items-center justify-between rounded-[19px] px-6 py-4 transition ${
                  activeTab === "submitted"
                    ? "bg-black text-white shadow-sm"
                    : "text-black/45 hover:bg-white hover:text-black"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex size-9 items-center justify-center rounded-full text-sm font-semibold ${
                      activeTab === "submitted"
                        ? "bg-emerald-400 text-black"
                        : "bg-black/[0.05] text-black/45"
                    }`}
                  >
                    {submittedRows.length}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Submitted</p>
                    <p className={`mt-0.5 text-[11px] ${activeTab === "submitted" ? "text-white/45" : "text-black/35"}`}>
                      Finished movements
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {activeTab === "incoming" ? (
            <div>
              <div className="flex flex-col gap-4 border-b border-black/[0.06] px-7 py-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                    Work queue
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">Incoming DWT movements</h2>
                  <p className="mt-2 text-sm text-black/40">
                    Normal loads should go through batch submission. Open a single receipt only when an exception needs detailed correction.
                  </p>
                </div>
                <Link
                  href="/home/dwt/batch"
                  className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                >
                  Open batch submission →
                </Link>
              </div>

              {activeRows.length === 0 ? (
                <EmptyState
                  title="Incoming queue clear"
                  body="There are no completed incoming loads waiting for DWT action."
                />
              ) : (
                <div className="divide-y divide-black/[0.06]">
                  {activeRows.map(({ load, receipt, latestSubmission, status }) => (
                    <article key={load.id} className="px-7 py-6 transition hover:bg-[#faf8f4]">
                      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClass(status)}`}>
                              {statusLabel(status)}
                            </span>
                            <span className="text-xs text-black/30">Received {formatDate(load.receivedAt)}</span>
                          </div>

                          <h3 className="mt-3 text-lg font-semibold">
                            {load.job.jobNumber} · Load {load.loadNumber}
                          </h3>
                          <p className="mt-1 text-sm text-black/50">
                            {load.client?.name ?? "Client not recorded"} · {load.clientSite?.name ?? "Origin not recorded"}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-black/45">
                            <span>{load.ewcCodeSnapshot ?? "EWC missing"} · {load.wasteDescriptionSnapshot ?? "Description missing"}</span>
                            <span>{formatWeight(load.netWeight, load.weightMetric)}</span>
                            <span>{load.vehicle?.registrationNumber ?? "Vehicle not recorded"}</span>
                            {latestSubmission?.wasteTrackingId ? (
                              <span className="break-all">WTID: {latestSubmission.wasteTrackingId}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-3">
                          <Link
                            href={`/home/jobs/${load.jobId}`}
                            className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold text-black/55"
                          >
                            Job
                          </Link>

                          {!receipt ? (
                            <form action={prepareJobLoadDwtDraftAction}>
                              <input type="hidden" name="jobLoadId" value={load.id} />
                              <button className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-black">
                                Prepare draft
                              </button>
                            </form>
                          ) : status === "attention" ? (
                            <Link
                              href={`/home/dwt/batch/fix/${load.id}`}
                              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white"
                            >
                              Quick fix
                            </Link>
                          ) : (
                            <Link
                              href="/home/dwt/batch"
                              className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                            >
                              Batch submit
                            </Link>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex flex-col gap-4 border-b border-black/[0.06] px-7 py-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-600">
                    Completed
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">Submitted movements</h2>
                  <p className="mt-2 text-sm text-black/40">
                    Submitted DWT movements are removed from the active incoming queue.
                  </p>
                </div>
                <Link
                  href="/home/dwt/submissions"
                  className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-black/60"
                >
                  Full history
                </Link>
              </div>

              {submittedRows.length === 0 ? (
                <EmptyState title="Nothing submitted yet" body="Successful DWT submissions will appear here automatically." />
              ) : (
                <div className="divide-y divide-black/[0.06]">
                  {submittedRows.map(({ load, latestSubmission, status }) => (
                    <article key={load.id} className="px-7 py-6 transition hover:bg-emerald-50/30">
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClass(status)}`}>
                              {statusLabel(status)}
                            </span>
                            <span className="text-xs text-black/30">
                              {formatDate(latestSubmission?.submittedAt ?? latestSubmission?.createdAt)}
                            </span>
                          </div>
                          <h3 className="mt-3 text-lg font-semibold">{load.job.jobNumber} · Load {load.loadNumber}</h3>
                          <p className="mt-1 text-sm text-black/50">
                            {load.client?.name ?? "Client not recorded"} · {load.clientSite?.name ?? "Origin not recorded"}
                          </p>
                          {latestSubmission?.wasteTrackingId ? (
                            <p className="mt-3 break-all text-xs font-semibold text-emerald-700">
                              WTID: {latestSubmission.wasteTrackingId}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex gap-3">
                          <Link
                            href={`/home/jobs/${load.jobId}`}
                            className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold text-black/55"
                          >
                            Job
                          </Link>
                          <Link
                            href={`/home/dwt/intake/${load.id}`}
                            className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white"
                          >
                            View record
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
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
    <div className={`rounded-[26px] border p-5 shadow-sm ${highlight ? "border-orange-200 bg-orange-50" : "border-black/[0.08] bg-white"}`}>
      <p className="text-xs text-black/40">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-7 py-14">
      <div className="mx-auto max-w-lg rounded-[28px] border border-dashed border-black/10 bg-[#faf8f4] p-10 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-xl font-semibold text-emerald-600">✓</div>
        <h3 className="mt-5 text-xl font-semibold">{title}</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-black/40">{body}</p>
      </div>
    </div>
  );
}
