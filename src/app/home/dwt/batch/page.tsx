import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  jobLoads,
  wasteReceiptItems,
  wasteReceipts,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

import BatchDwtReviewClient from "./BatchDwtReviewClient";

type PageProps = {
  searchParams?: {
    prepared?: string;
    failed?: string;
    updated?: string;
    batchId?: string;
    next?: string;
    error?: string;
  };
};

export type BatchDraftRow = {
  jobLoadId: string;
  jobNumber: string;
  loadNumber: number;
  receivedAt: string | null;
  clientName: string;
  originName: string;
  ewcCode: string;
  wasteDescription: string;
  weightLabel: string;
  vehicleRegistration: string;
};

export type BatchReviewRow = BatchDraftRow & {
  receiptId: string;
  containsHazardous: boolean;
  specialHandlingRequirements: string;
  reasonForNoConsignmentCode: string;
  brokerDealerOrganisationName: string;
};

export type BatchLockedRow = BatchDraftRow & {
  receiptId: string | null;
  reason: string;
  wasteTrackingId: string | null;
};

function formatWeight(
  amount: string | null,
  metric: string,
) {
  const numeric = Number(amount ?? "0");

  if (!Number.isFinite(numeric)) {
    return "Not recorded";
  }

  return `${numeric.toLocaleString("en-GB", {
    maximumFractionDigits: 3,
  })} ${metric}`;
}

function errorMessage(value: string | undefined) {
  if (!value) return null;

  const messages: Record<string, string> = {
    select_loads_to_prepare:
      "Select at least one completed incoming load to prepare.",
    select_receipts_to_update:
      "Select at least one prepared receipt to batch review.",
    choose_fields_to_apply:
      "Choose at least one common field before applying the batch update.",
    receipt_scope_mismatch:
      "One or more selected receipts no longer belong to this organisation. Nothing was changed.",
    submitted_receipt_locked:
      "A selected receipt is already marked submitted. Submitted movements cannot be batch edited.",
    submission_history_locked:
      "A selected movement already has DWT submission history. Open it individually to review or update it.",
    special_handling_too_long:
      "Special handling requirements must be 5,000 characters or fewer.",
    invalid_no_consignment_reason:
      "Choose a valid reason for no hazardous consignment code.",
    hazardous_receipts_need_single_review:
      "At least one selected receipt contains hazardous waste. Hazardous consignment details must be reviewed individually.",
    broker_name_required:
      "Broker/dealer organisation name is required when applying broker/dealer details.",
    broker_postcode_required:
      "Broker/dealer postcode is required when a broker/dealer address is supplied.",
    broker_email_invalid:
      "Broker/dealer email address is not valid.",
  };

  return (
    messages[value] ??
    "Waste X could not apply that batch operation. Nothing unsafe was submitted to Defra."
  );
}

export default async function BatchDwtReviewPage({
  searchParams,
}: PageProps) {
  const context = await requireSoloPermission("dwt:review");
  const organisationId = context.organisationId;

  const [loads, receipts, receiptItems, submissions] =
    await Promise.all([
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
        orderBy: [
          desc(jobLoads.receivedAt),
          desc(jobLoads.completedAt),
        ],
        limit: 150,
      }),

      database.query.wasteReceipts.findMany({
        where: eq(wasteReceipts.organisationId, organisationId),
        orderBy: [desc(wasteReceipts.createdAt)],
      }),

      database.query.wasteReceiptItems.findMany({
        where: eq(
          wasteReceiptItems.organisationId,
          organisationId,
        ),
        columns: {
          receiptId: true,
          containsHazardous: true,
        },
      }),

      database.query.wasteTrackingSubmissions.findMany({
        where: eq(
          wasteTrackingSubmissions.organisationId,
          organisationId,
        ),
        orderBy: [desc(wasteTrackingSubmissions.createdAt)],
        limit: 500,
      }),
    ]);

  const receiptByLoad = new Map<
    string,
    (typeof receipts)[number]
  >();

  for (const receipt of receipts) {
    if (
      receipt.jobLoadId &&
      !receiptByLoad.has(receipt.jobLoadId)
    ) {
      receiptByLoad.set(receipt.jobLoadId, receipt);
    }
  }

  const hazardousReceiptIds = new Set(
    receiptItems
      .filter((item) => item.containsHazardous)
      .map((item) => item.receiptId),
  );

  const submissionsByLoad = new Map<
    string,
    (typeof submissions)[number][]
  >();

  for (const submission of submissions) {
    if (!submission.jobLoadId) continue;

    const existing =
      submissionsByLoad.get(submission.jobLoadId) ?? [];

    existing.push(submission);
    submissionsByLoad.set(
      submission.jobLoadId,
      existing,
    );
  }

  const baseRow = (
    load: (typeof loads)[number],
  ): BatchDraftRow => ({
    jobLoadId: load.id,
    jobNumber: load.job.jobNumber,
    loadNumber: load.loadNumber,
    receivedAt: load.receivedAt
      ? load.receivedAt.toISOString()
      : null,
    clientName: load.client?.name ?? "Client not recorded",
    originName:
      load.clientSite?.name ?? "Origin not recorded",
    ewcCode: load.ewcCodeSnapshot ?? "EWC missing",
    wasteDescription:
      load.wasteDescriptionSnapshot ??
      "Description missing",
    weightLabel: formatWeight(
      load.netWeight,
      load.weightMetric,
    ),
    vehicleRegistration:
      load.vehicle?.registrationNumber ??
      "Not recorded",
  });

  const missingDrafts: BatchDraftRow[] = [];
  const reviewRows: BatchReviewRow[] = [];
  const lockedRows: BatchLockedRow[] = [];

  for (const load of loads) {
    const receipt = receiptByLoad.get(load.id) ?? null;
    const loadSubmissions =
      submissionsByLoad.get(load.id) ?? [];

    if (!receipt) {
      missingDrafts.push(baseRow(load));
      continue;
    }

    if (
      receipt.status === "submitted" ||
      loadSubmissions.length > 0
    ) {
      const latest = loadSubmissions[0] ?? null;

      lockedRows.push({
        ...baseRow(load),
        receiptId: receipt.id,
        reason:
          loadSubmissions.length > 0
            ? "Submission history exists"
            : "Receipt already submitted",
        wasteTrackingId:
          latest?.wasteTrackingId ?? null,
      });
      continue;
    }

    reviewRows.push({
      ...baseRow(load),
      receiptId: receipt.id,
      containsHazardous:
        hazardousReceiptIds.has(receipt.id),
      specialHandlingRequirements:
        receipt.specialHandlingRequirements ?? "",
      reasonForNoConsignmentCode:
        receipt.reasonForNoConsignmentCode ?? "",
      brokerDealerOrganisationName:
        receipt.brokerDealerOrganisationName ?? "",
    });
  }

  const messageError = errorMessage(searchParams?.error);

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-24 -top-24 size-80 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Digital Waste Tracking · Batch Review
              </p>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                Batch DWT Review
              </h1>

              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/55">
                Prepare many receipt drafts, apply genuinely common
                fields once, then review each movement individually
                before any government submission.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/dwt"
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
              >
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

        <section className="mt-6 rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-900">
          <p className="text-sm font-semibold">
            Batch review does not batch-submit to Defra
          </p>

          <p className="mt-2 max-w-5xl text-sm leading-6 text-blue-800/80">
            Waste X keeps one Job Load → one Receipt → one DWT
            movement. Batch review only prepares local receipt data.
            Any movement with submission history is locked out of
            batch editing and returns to the existing individual
            review/update flow.
          </p>
        </section>

        {messageError ? (
          <section className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="text-sm font-semibold">
              Batch operation was not applied
            </p>
            <p className="mt-2 text-sm">{messageError}</p>
          </section>
        ) : null}

        {searchParams?.prepared ? (
          <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            <p className="text-sm font-semibold">
              Draft preparation finished
            </p>
            <p className="mt-2 text-sm">
              Prepared / confirmed{" "}
              {searchParams.prepared} selected load(s).
              {searchParams.failed
                ? ` ${searchParams.failed} could not be prepared and were left unchanged.`
                : ""}
            </p>
          </section>
        ) : null}

        {searchParams?.updated ? (
          <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  Batch fields applied
                </p>
                <p className="mt-2 text-sm">
                  Updated {searchParams.updated} prepared
                  receipt(s). Nothing was submitted to Defra.
                </p>
              </div>

              {searchParams.next ? (
                <Link
                  href={`/home/dwt/intake/${searchParams.next}`}
                  className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Review first receipt →
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <Metric
            label="Missing drafts"
            value={missingDrafts.length}
          />
          <Metric
            label="Ready for batch review"
            value={reviewRows.length}
            highlight
          />
          <Metric
            label="Locked / submission history"
            value={lockedRows.length}
          />
        </section>

        <BatchDwtReviewClient
          missingDrafts={missingDrafts}
          reviewRows={reviewRows}
          lockedRows={lockedRows}
        />
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
  value: number;
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
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}
