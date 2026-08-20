import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { jobLoads, wasteReceipts, wasteTrackingSubmissions } from "@/db/schema";
import { getWasteTrackingOrganisationSettings } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

import BatchDwtSubmissionClient from "./BatchDwtSubmissionClient";
import { validateBatchDwtAction } from "./actions";
import type { BatchQueueRow, MissingDraftRow, SubmittedBatchRow } from "./types";

const MAX_BATCH_SIZE = 50;

type PageProps = {
  searchParams?: {
    fixed?: string;
    error?: string;
  };
};

function formatWeight(amount: string | null, metric: string) {
  const numeric = Number(amount ?? "0");
  if (!Number.isFinite(numeric)) return "Not recorded";
  return `${numeric.toLocaleString("en-GB", { maximumFractionDigits: 3 })} ${metric}`;
}

export default async function BatchDwtSubmissionPage({ searchParams }: PageProps) {
  const context = await requireSoloPermission("dwt:review");
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
      limit: 250,
    }),
    database.query.wasteReceipts.findMany({
      where: eq(wasteReceipts.organisationId, organisationId),
      orderBy: [desc(wasteReceipts.createdAt)],
    }),
    database.query.wasteTrackingSubmissions.findMany({
      where: eq(wasteTrackingSubmissions.organisationId, organisationId),
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
      limit: 1500,
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

  const baseRow = (load: (typeof loads)[number]) => ({
    jobLoadId: load.id,
    jobNumber: load.job.jobNumber,
    loadNumber: load.loadNumber,
    receivedAt: load.receivedAt?.toISOString() ?? null,
    clientName: load.client?.name ?? "Client not recorded",
    originName: load.clientSite?.name ?? "Origin not recorded",
    ewcCode: load.ewcCodeSnapshot ?? "EWC missing",
    wasteDescription: load.wasteDescriptionSnapshot ?? "Description missing",
    weightLabel: formatWeight(load.netWeight, load.weightMetric),
    vehicleRegistration: load.vehicle?.registrationNumber ?? "Not recorded",
  });

  const missingDrafts: MissingDraftRow[] = [];
  const candidates: BatchQueueRow[] = [];
  const submittedRows: SubmittedBatchRow[] = [];

  for (const load of loads) {
    const receipt = receiptByLoad.get(load.id) ?? null;
    const latestSubmission = latestSubmissionByLoad.get(load.id) ?? null;

    if (!receipt) {
      missingDrafts.push({
        ...baseRow(load),
        receiptId: null,
        previousSubmissionStatus: latestSubmission?.status ?? null,
        previousWasteTrackingId: latestSubmission?.wasteTrackingId ?? null,
      });
      continue;
    }

    const isSubmitted =
      receipt.status === "submitted" ||
      latestSubmission?.status === "accepted" ||
      latestSubmission?.status === "accepted_with_warnings";

    if (isSubmitted) {
      const submissionStatus: SubmittedBatchRow["submissionStatus"] =
        latestSubmission?.status === "accepted_with_warnings"
          ? "accepted_with_warnings"
          : latestSubmission?.status === "accepted"
            ? "accepted"
            : "submitted";

      submittedRows.push({
        ...baseRow(load),
        receiptId: receipt.id,
        previousSubmissionStatus: latestSubmission?.status ?? receipt.status,
        previousWasteTrackingId: latestSubmission?.wasteTrackingId ?? null,
        submittedAt:
          latestSubmission?.submittedAt?.toISOString() ??
          latestSubmission?.createdAt?.toISOString() ??
          receipt.updatedAt?.toISOString() ??
          null,
        submissionStatus,
      });
      continue;
    }

    candidates.push({
      ...baseRow(load),
      receiptId: receipt.id,
      previousSubmissionStatus: latestSubmission?.status ?? null,
      previousWasteTrackingId: latestSubmission?.wasteTrackingId ?? null,
    });
  }

  const batchRows = candidates.slice(0, MAX_BATCH_SIZE);
  const batchOverflow = Math.max(0, candidates.length - batchRows.length);
  const missingBatchRows = missingDrafts.slice(0, MAX_BATCH_SIZE);
  const missingOverflow = Math.max(0, missingDrafts.length - missingBatchRows.length);
  const canSubmit = context.permissions.has("dwt:submit");

  /*
   * IMPORTANT UX RULE:
   * A receipt is NEVER labelled Ready just because a draft exists.
   * The server runs the exact batch preflight before this page renders, so
   * invalid carrier/email/permit/reference data appears immediately as an
   * exception instead of briefly looking submit-ready in the browser.
   */
  const initialValidation =
    batchRows.length > 0
      ? await validateBatchDwtAction(batchRows.map((row) => row.jobLoadId))
      : { success: true, items: [], globalErrors: [] };

  return (
    <main className="min-h-screen bg-[#f4f1eb] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <section className="relative overflow-hidden rounded-[34px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-28 -top-32 size-[360px] rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Digital Waste Tracking · Batch Submission
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">Batch DWT Submission</h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/55">
                Drafts are prepared from completed loads, Waste X validates the batch,
                exceptions are isolated for a quick fix, and every ready movement can be
                submitted in one operator action.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/home/dwt" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black">
                ← DWT Centre
              </Link>
              <Link
                href="/home/dwt/submissions"
                className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white"
              >
                Submission history
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-5">
          <Step number="1" title="Complete jobs" done />
          <Step number="2" title="Drafts prepared" done={missingDrafts.length === 0} />
          <Step number="3" title="Batch validation" />
          <Step number="4" title="Quick fix exceptions" />
          <Step number="5" title="Submit ready" />
        </section>

        {searchParams?.fixed ? (
          <section className="mt-6 rounded-[26px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            <p className="text-sm font-semibold">Quick fix saved</p>
            <p className="mt-1 text-sm">Waste X will revalidate the updated movement in this batch.</p>
          </section>
        ) : null}

        {searchParams?.error ? (
          <section className="mt-6 rounded-[26px] border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="text-sm font-semibold">Batch action needs attention</p>
            <p className="mt-1 text-sm">{searchParams.error.replaceAll("_", " ")}</p>
          </section>
        ) : null}

        <BatchDwtSubmissionClient
          candidateRows={batchRows}
          missingDrafts={missingBatchRows}
          submittedRows={submittedRows.slice(0, 20)}
          batchOverflow={batchOverflow}
          missingOverflow={missingOverflow}
          canSubmit={canSubmit}
          dwtEnabled={Boolean(settings?.isEnabled)}
          receiverApiCodeConfigured={Boolean(settings?.apiCode)}
          maxBatchSize={MAX_BATCH_SIZE}
          initialValidationItems={initialValidation.items}
          initialValidationErrors={initialValidation.globalErrors}
        />
      </div>
    </main>
  );
}

function Step({
  number,
  title,
  done = false,
}: {
  number: string;
  title: string;
  done?: boolean;
}) {
  return (
    <div className={`rounded-[22px] border p-4 ${done ? "border-emerald-200 bg-emerald-50" : "border-black/[0.08] bg-white"}`}>
      <div className="flex items-center gap-3">
        <span className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-emerald-500 text-white" : "bg-black text-white"}`}>
          {done ? "✓" : number}
        </span>
        <p className="text-xs font-semibold">{title}</p>
      </div>
    </div>
  );
}
