"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  prepareMissingDwtDraftsAction,
  submitBatchDwtAction,
  validateBatchDwtAction,
} from "./actions";
import type {
  BatchQueueRow,
  BatchSubmissionResult,
  BatchValidationItem,
  MissingDraftRow,
  SubmittedBatchRow,
} from "./types";

type Props = {
  candidateRows: BatchQueueRow[];
  missingDrafts: MissingDraftRow[];
  submittedRows: SubmittedBatchRow[];
  batchOverflow: number;
  missingOverflow: number;
  canSubmit: boolean;
  dwtEnabled: boolean;
  receiverApiCodeConfigured: boolean;
  maxBatchSize: number;
  initialValidationItems: BatchValidationItem[];
  initialValidationErrors: string[];
};

type Notice = {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
} | null;

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function shortIssue(message: string) {
  return message.length > 150 ? `${message.slice(0, 147)}...` : message;
}

export default function BatchDwtSubmissionClient({
  candidateRows,
  missingDrafts,
  submittedRows,
  batchOverflow,
  missingOverflow,
  canSubmit,
  dwtEnabled,
  receiverApiCodeConfigured,
  maxBatchSize,
  initialValidationItems,
  initialValidationErrors,
}: Props) {
  const router = useRouter();
  const [validationItems, setValidationItems] =
    useState<BatchValidationItem[]>(initialValidationItems);
  const [validationErrors, setValidationErrors] =
    useState<string[]>(initialValidationErrors);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () =>
      new Set(
        initialValidationItems
          .filter((item) => item.ready)
          .map((item) => item.jobLoadId),
      ),
  );
  const [notice, setNotice] = useState<Notice>(null);
  const [lastSubmission, setLastSubmission] = useState<BatchSubmissionResult | null>(null);
  const [isValidating, startValidation] = useTransition();
  const [isPreparing, startPreparing] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();

  const validationById = useMemo(
    () => new Map(validationItems.map((item) => [item.jobLoadId, item])),
    [validationItems],
  );

  const readyRows = useMemo(
    () => candidateRows.filter((row) => validationById.get(row.jobLoadId)?.ready),
    [candidateRows, validationById],
  );

  const exceptionRows = useMemo(
    () =>
      candidateRows.filter((row) => {
        const validation = validationById.get(row.jobLoadId);
        return validation && !validation.ready && !validation.alreadySubmitted;
      }),
    [candidateRows, validationById],
  );

  const selectedReadyCount = useMemo(
    () => readyRows.filter((row) => selectedIds.has(row.jobLoadId)).length,
    [readyRows, selectedIds],
  );

  const settingsReady = dwtEnabled && receiverApiCodeConfigured;

  /*
   * router.refresh() can replace the server-rendered queue without remounting
   * this Client Component. Keep local UI state aligned with the new server
   * preflight result after draft preparation or a completed submission.
   * This does NOT contact Defra and does NOT run a second validation request.
   */
  useEffect(() => {
    setValidationItems(initialValidationItems);
    setValidationErrors(initialValidationErrors);
    setSelectedIds(
      new Set(
        initialValidationItems
          .filter((item) => item.ready)
          .map((item) => item.jobLoadId),
      ),
    );
  }, [initialValidationItems, initialValidationErrors]);

  function runValidation(showNotice = false) {
    if (candidateRows.length === 0) {
      setValidationItems([]);
      setValidationErrors([]);
      setSelectedIds(new Set());
      return;
    }

    startValidation(async () => {
      const result = await validateBatchDwtAction(candidateRows.map((row) => row.jobLoadId));
      setValidationItems(result.items);
      setValidationErrors(result.globalErrors);

      const readyIds = result.items
        .filter((item) => item.ready)
        .map((item) => item.jobLoadId);
      setSelectedIds(new Set(readyIds));

      if (showNotice) {
        const exceptionCount = result.items.filter(
          (item) => !item.ready && !item.alreadySubmitted,
        ).length;
        setNotice({
          tone: exceptionCount > 0 ? "warning" : "success",
          title: "Batch validation complete",
          message:
            exceptionCount > 0
              ? `${readyIds.length} ready. ${exceptionCount} movement(s) need a quick fix.`
              : `${readyIds.length} movement(s) are ready to submit.`,
        });
      }
    });
  }

  function toggleRow(jobLoadId: string) {
    const validation = validationById.get(jobLoadId);
    if (!validation?.ready) return;

    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(jobLoadId)) next.delete(jobLoadId);
      else next.add(jobLoadId);
      return next;
    });
  }

  function selectAllReady() {
    setSelectedIds(new Set(readyRows.map((row) => row.jobLoadId)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function prepareMissingDrafts() {
    if (missingDrafts.length === 0) return;

    setNotice({
      tone: "info",
      title: "Preparing receipt drafts",
      message: `Waste X is preparing ${missingDrafts.length} completed load(s).`,
    });

    startPreparing(async () => {
      const result = await prepareMissingDwtDraftsAction(
        missingDrafts.map((row) => row.jobLoadId),
      );

      setNotice({
        tone: result.failed > 0 ? "warning" : "success",
        title: result.failed > 0 ? "Draft preparation finished with exceptions" : "Drafts prepared",
        message: result.message,
      });

      router.refresh();
    });
  }

  function submitIds(ids: string[], label: string) {
    if (ids.length === 0 || !canSubmit || !settingsReady) return;

    setNotice({
      tone: "info",
      title: label,
      message: `Waste X is submitting ${ids.length} separate DWT movement${ids.length === 1 ? "" : "s"}. Exceptions are excluded automatically.`,
    });
    setLastSubmission(null);

    startSubmitting(async () => {
      // The server re-runs the full preflight immediately before each batch
      // submission. A row that is no longer valid is NOT sent to Defra.
      const result = await submitBatchDwtAction(ids);
      setLastSubmission(result);
      setSelectedIds(new Set());

      setNotice({
        tone: result.failed > 0 ? "warning" : "success",
        title: result.failed > 0 ? "Batch completed with exceptions" : "Batch submitted",
        message:
          result.failed > 0
            ? `${result.submitted} submitted. ${result.failed} need attention.`
            : `${result.submitted} movement${result.submitted === 1 ? "" : "s"} submitted successfully.`,
      });

      router.refresh();
    });
  }

  function submitSelected() {
    submitIds(
      readyRows
        .filter((row) => selectedIds.has(row.jobLoadId))
        .map((row) => row.jobLoadId),
      "Submitting selected movements",
    );
  }

  function submitAllReady() {
    submitIds(
      readyRows.map((row) => row.jobLoadId),
      "Submitting all ready movements",
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {!settingsReady ? (
        <section className="rounded-[28px] border border-orange-200 bg-orange-50 p-5 text-orange-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">DWT connection is not ready</p>
              <p className="mt-1 text-sm text-orange-900/70">
                {!dwtEnabled ? "Enable Digital Waste Tracking. " : ""}
                {!receiverApiCodeConfigured ? "Add the Receiver API Code. " : ""}
                You can still prepare and validate drafts, but submission is blocked until settings are complete.
              </p>
            </div>
            <Link
              href="/home/settings/digital-waste-tracking"
              className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white"
            >
              Open DWT settings
            </Link>
          </div>
        </section>
      ) : null}

      {validationErrors.length > 0 ? (
        <section className="rounded-[28px] border border-orange-200 bg-orange-50 p-5 text-orange-900">
          <p className="text-sm font-semibold">Batch submission blocked by DWT settings</p>
          <div className="mt-2 space-y-1 text-sm text-orange-900/70">
            {validationErrors.map((error) => (
              <p key={error}>• {error}</p>
            ))}
          </div>
        </section>
      ) : null}

      {notice ? <NoticeCard notice={notice} /> : null}

      {lastSubmission ? <SubmissionResultCard result={lastSubmission} rows={candidateRows} /> : null}

      {missingDrafts.length > 0 ? (
        <section className="rounded-[30px] border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">
                Step 2 · Draft preparation
              </p>
              <h2 className="mt-2 text-xl font-semibold">{missingDrafts.length} completed load(s) need a receipt draft</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-900/65">
                Normal worksheet completion already attempts this automatically. These are exceptions where the draft does not exist yet.
              </p>
              {missingOverflow > 0 ? (
                <p className="mt-2 text-xs font-semibold text-orange-800">
                  + {missingOverflow} more will appear after this group is prepared.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={prepareMissingDrafts}
              disabled={isPreparing}
              className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-wait disabled:opacity-50"
            >
              {isPreparing ? "Preparing drafts..." : `Prepare ${missingDrafts.length} draft${missingDrafts.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Ready" value={isValidating ? "…" : readyRows.length} tone="ready" />
        <Metric label="Exceptions" value={isValidating ? "…" : exceptionRows.length} tone={exceptionRows.length > 0 ? "danger" : "plain"} />
        <Metric label="Selected" value={selectedReadyCount} tone="selected" />
        <Metric label="Recently submitted" value={submittedRows.length} tone="plain" />
      </section>

      <section className="overflow-hidden rounded-[34px] border border-black/[0.08] bg-white shadow-sm">
        <div className="border-b border-black/[0.07] bg-[#fbfaf7] px-7 py-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                Steps 3–5 · Validate → Fix → Submit
              </p>
              <h2 className="mt-1 text-2xl font-semibold">Current batch</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/40">
                Waste X server-validates up to {maxBatchSize} movements before this list is shown. Only rows that pass preflight can ever display as Ready; exceptions stay outside submission until fixed.
              </p>
              {batchOverflow > 0 ? (
                <p className="mt-2 text-xs font-semibold text-orange-700">
                  + {batchOverflow} more movement(s) will roll into the next batch after this one.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runValidation(true)}
                disabled={isValidating || candidateRows.length === 0}
                className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-semibold text-black/60 transition hover:border-black/20 hover:text-black disabled:opacity-40"
              >
                {isValidating ? "Validating..." : "↻ Revalidate"}
              </button>
              <button
                type="button"
                onClick={selectAllReady}
                disabled={readyRows.length === 0 || isSubmitting}
                className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-semibold text-black/60 transition hover:border-black/20 hover:text-black disabled:opacity-40"
              >
                Select all ready
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedIds.size === 0 || isSubmitting}
                className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-semibold text-black/60 transition hover:border-black/20 hover:text-black disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={submitSelected}
                disabled={
                  isSubmitting ||
                  isValidating ||
                  selectedReadyCount === 0 ||
                  !canSubmit ||
                  !settingsReady ||
                  validationErrors.length > 0
                }
                className="rounded-full border border-black bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-black/10 disabled:text-black/30"
              >
                {isSubmitting
                  ? "Submitting..."
                  : `Submit selected (${selectedReadyCount})`}
              </button>
              <button
                type="button"
                onClick={submitAllReady}
                disabled={
                  isSubmitting ||
                  isValidating ||
                  readyRows.length === 0 ||
                  !canSubmit ||
                  !settingsReady ||
                  validationErrors.length > 0
                }
                className="rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/30"
              >
                {isSubmitting
                  ? "Submitting ready..."
                  : `Submit all ready (${readyRows.length})`}
              </button>
            </div>
          </div>
        </div>

        {!canSubmit ? (
          <div className="border-b border-orange-200 bg-orange-50 px-7 py-4 text-sm text-orange-800">
            You can review and fix DWT movements, but your Waste X permissions do not include DWT submission.
          </div>
        ) : null}

        {candidateRows.length === 0 ? (
          <div className="px-7 py-16 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-50 text-2xl font-semibold text-emerald-600">✓</div>
            <h3 className="mt-5 text-xl font-semibold">Nothing waiting to submit</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-black/40">
              All prepared incoming movements in the current queue are complete. New completed loads will appear here automatically.
            </p>
          </div>
        ) : (
          <div>
            {isValidating && validationItems.length === 0 ? (
              <div className="border-b border-blue-100 bg-blue-50 px-7 py-4 text-sm text-blue-700">
                Checking DWT fields, reference data and permit/EWC compatibility…
              </div>
            ) : null}

            <div className="divide-y divide-black/[0.06]">
              {[...candidateRows]
                .sort((a, b) => {
                  const aValidation = validationById.get(a.jobLoadId);
                  const bValidation = validationById.get(b.jobLoadId);
                  const aRank = aValidation?.ready ? 0 : 1;
                  const bRank = bValidation?.ready ? 0 : 1;
                  return aRank - bRank;
                })
                .map((row) => {
                  const validation = validationById.get(row.jobLoadId);
                  const ready = Boolean(validation?.ready);
                  const waiting = !validation && isValidating;
                  const selected = selectedIds.has(row.jobLoadId);

                  return (
                    <article
                      key={row.jobLoadId}
                      className={`px-7 py-6 transition ${
                        ready ? "hover:bg-emerald-50/25" : "hover:bg-red-50/20"
                      }`}
                    >
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex min-w-0 flex-1 gap-4">
                          <div className="pt-1">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!ready || isSubmitting}
                              onChange={() => toggleRow(row.jobLoadId)}
                              aria-label={`Select ${row.jobNumber} load ${row.loadNumber}`}
                              className="size-5 accent-black disabled:opacity-30"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {waiting ? (
                                <Badge tone="checking">Checking</Badge>
                              ) : ready ? (
                                <Badge tone="ready">✓ Ready</Badge>
                              ) : (
                                <Badge tone="danger">! Exception</Badge>
                              )}

                              {validation && validation.warnings.length > 0 ? (
                                <Badge tone="warning">
                                  {validation.warnings.length} warning{validation.warnings.length === 1 ? "" : "s"}
                                </Badge>
                              ) : null}

                              {row.previousSubmissionStatus ? (
                                <span className="text-[11px] text-black/30">
                                  Previous: {row.previousSubmissionStatus.replaceAll("_", " ")}
                                </span>
                              ) : null}
                            </div>

                            <h3 className="mt-3 text-lg font-semibold">
                              {row.jobNumber} · Load {row.loadNumber}
                            </h3>
                            <p className="mt-1 text-sm text-black/50">
                              {row.clientName} · {row.originName}
                            </p>

                            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              <Info label="Waste" value={`${row.ewcCode} · ${row.wasteDescription}`} />
                              <Info label="Weight" value={row.weightLabel} />
                              <Info label="Vehicle" value={row.vehicleRegistration} />
                              <Info label="Received" value={formatDate(row.receivedAt)} />
                            </div>

                            {validation && validation.errors.length > 0 ? (
                              <div className="mt-4 rounded-[20px] border border-red-100 bg-red-50 p-4">
                                <p className="text-xs font-semibold text-red-800">
                                  {validation.errors.length} issue{validation.errors.length === 1 ? "" : "s"} to fix
                                </p>
                                <div className="mt-2 space-y-1.5">
                                  {validation.errors.slice(0, 3).map((entry, index) => (
                                    <p key={`${entry.key}-${index}`} className="text-xs leading-5 text-red-700/80">
                                      • {shortIssue(entry.message)}
                                    </p>
                                  ))}
                                  {validation.errors.length > 3 ? (
                                    <p className="text-xs font-semibold text-red-700">
                                      + {validation.errors.length - 3} more
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          {!ready && validation ? (
                            <Link
                              href={`/home/dwt/batch/fix/${row.jobLoadId}`}
                              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                            >
                              Quick fix
                            </Link>
                          ) : null}

                          <Link
                            href={`/home/dwt/intake/${row.jobLoadId}`}
                            className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-black/55 transition hover:border-black/20 hover:text-black"
                          >
                            Full review
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
            </div>
          </div>
        )}
      </section>

      {submittedRows.length > 0 ? (
        <section className="overflow-hidden rounded-[30px] border border-black/[0.08] bg-white shadow-sm">
          <div className="flex items-end justify-between gap-4 border-b border-black/[0.06] px-6 py-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">Done</p>
              <h2 className="mt-1 text-xl font-semibold">Recently submitted</h2>
            </div>
            <Link href="/home/dwt/submissions" className="text-xs font-semibold text-black/45 hover:text-black">
              Full history →
            </Link>
          </div>
          <div className="divide-y divide-black/[0.06]">
            {submittedRows.slice(0, 5).map((row) => (
              <div key={row.jobLoadId} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">{row.jobNumber} · Load {row.loadNumber}</p>
                  <p className="mt-1 text-xs text-black/40">{row.clientName} · {formatDate(row.submittedAt)}</p>
                </div>
                <div className="text-right">
                  <Badge tone={row.submissionStatus === "accepted_with_warnings" ? "warning" : "ready"}>
                    {row.submissionStatus === "accepted_with_warnings" ? "Submitted · warnings" : "Submitted"}
                  </Badge>
                  {row.previousWasteTrackingId ? (
                    <p className="mt-2 max-w-sm break-all text-xs font-semibold text-emerald-700">{row.previousWasteTrackingId}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function NoticeCard({ notice }: { notice: NonNullable<Notice> }) {
  const classes = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-orange-200 bg-orange-50 text-orange-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  }[notice.tone];

  return (
    <section className={`rounded-[26px] border p-5 ${classes}`}>
      <p className="text-sm font-semibold">{notice.title}</p>
      <p className="mt-1 text-sm opacity-75">{notice.message}</p>
    </section>
  );
}

function SubmissionResultCard({
  result,
  rows,
}: {
  result: BatchSubmissionResult;
  rows: BatchQueueRow[];
}) {
  const rowById = new Map(rows.map((row) => [row.jobLoadId, row]));

  return (
    <section className={`rounded-[30px] border p-6 ${result.failed > 0 ? "border-orange-200 bg-orange-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-60">Batch result</p>
          <h2 className="mt-2 text-xl font-semibold">
            {result.submitted} submitted · {result.failed} need attention
          </h2>
          <p className="mt-1 text-sm opacity-70">One failed movement does not roll back the successful submissions.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 lg:grid-cols-2">
        {result.items.map((item) => {
          const row = rowById.get(item.jobLoadId);
          return (
            <div key={item.jobLoadId} className="rounded-[20px] border border-black/[0.06] bg-white/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {row ? `${row.jobNumber} · Load ${row.loadNumber}` : item.jobLoadId}
                  </p>
                  <p className="mt-1 text-xs text-black/45">{item.message}</p>
                  {item.wasteTrackingId ? (
                    <p className="mt-2 break-all text-xs font-semibold text-emerald-700">WTID: {item.wasteTrackingId}</p>
                  ) : null}
                </div>
                <Badge tone={item.success ? "ready" : "danger"}>{item.success ? "✓ Done" : "! Fix"}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "ready" | "danger" | "selected" | "plain";
}) {
  const className =
    tone === "ready"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "danger"
        ? "border-red-200 bg-red-50"
        : tone === "selected"
          ? "border-orange-200 bg-orange-50"
          : "border-black/[0.08] bg-white";

  return (
    <div className={`rounded-[26px] border p-5 shadow-sm ${className}`}>
      <p className="text-xs text-black/40">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "ready" | "danger" | "warning" | "checking";
}) {
  const className =
    tone === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-700"
        : tone === "warning"
          ? "border-orange-200 bg-orange-50 text-orange-700"
          : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}>
      {children}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.025] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-black/30">{label}</p>
      <p className="mt-1.5 text-xs font-medium leading-5 text-black/65">{value}</p>
    </div>
  );
}
