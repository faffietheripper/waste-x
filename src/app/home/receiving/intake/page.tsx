import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  carrierAssignments,
  incidents,
  users,
  wasteReceipts,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  type Capability,
  type DepartmentType,
  hasOperationalPermission,
} from "@/modules/auth/core/permissions";

/* =========================================================
   TYPES
========================================================= */

type Tone = "muted" | "success" | "warning" | "danger";

type QueueState = {
  label: string;
  tone: Tone;
  helper: string;
};

type AssignmentForReadiness = {
  status: string;
  collectedAt: Date | null;
  codeUsedAt: Date | null;
  completedAt?: Date | null;
  listing?: {
    status: string | null;
  } | null;
};

/* =========================================================
   HELPERS
========================================================= */

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function isCollectionVerified(assignment: {
  status: string;
  collectedAt: Date | null;
  codeUsedAt: Date | null;
}) {
  return (
    Boolean(assignment.collectedAt) ||
    Boolean(assignment.codeUsedAt) ||
    assignment.status === "in_progress" ||
    assignment.status === "completed"
  );
}

function isAssignmentOperationallyComplete(assignment: {
  status: string;
  completedAt?: Date | null;
  listing?: {
    status: string | null;
  } | null;
}) {
  return (
    assignment.status === "completed" ||
    Boolean(assignment.completedAt) ||
    assignment.listing?.status === "completed"
  );
}

function isReceiptConfirmed(
  receipt:
    | {
        status: string;
      }
    | null
    | undefined,
  assignment?: {
    status: string;
    completedAt?: Date | null;
    listing?: {
      status: string | null;
    } | null;
  },
) {
  return (
    receipt?.status === "confirmed" ||
    receipt?.status === "submitted" ||
    Boolean(assignment && isAssignmentOperationallyComplete(assignment))
  );
}

function isDwtAccepted(
  submission:
    | {
        status: string;
      }
    | null
    | undefined,
) {
  return (
    submission?.status === "accepted" ||
    submission?.status === "accepted_with_warnings"
  );
}

function isDwtFailedOrRejected(
  submission:
    | {
        status: string;
      }
    | null
    | undefined,
) {
  return submission?.status === "failed" || submission?.status === "rejected";
}

function getQueueState(params: {
  assignment: AssignmentForReadiness;
  receipt:
    | {
        status: string;
      }
    | null
    | undefined;
  submission:
    | {
        status: string;
      }
    | null
    | undefined;
  unresolvedIncidentCount: number;
}): QueueState {
  const { assignment, receipt, submission, unresolvedIncidentCount } = params;

  const collectionVerified = isCollectionVerified(assignment);
  const operationallyComplete = isAssignmentOperationallyComplete(assignment);
  const receiptConfirmed = isReceiptConfirmed(receipt, assignment);
  const dwtAccepted = isDwtAccepted(submission);
  const dwtFailedOrRejected = isDwtFailedOrRejected(submission);

  if (dwtAccepted) {
    return {
      label: "DWT submitted",
      tone:
        submission?.status === "accepted_with_warnings" ? "warning" : "success",
      helper:
        submission?.status === "accepted_with_warnings"
          ? "The receive movement was accepted with warnings. Compliance should review it."
          : "The receive movement has been accepted by the Waste Tracking Service.",
    };
  }

  if (unresolvedIncidentCount > 0) {
    return {
      label: "Blocked by incident",
      tone: "danger",
      helper:
        "This assignment has unresolved incidents. Resolve them before DWT submission.",
    };
  }

  if (receiptConfirmed && dwtFailedOrRejected) {
    return {
      label: "Ready to retry DWT",
      tone: "danger",
      helper:
        "The job is complete, but the latest DWT submission failed or was rejected. Review and resubmit.",
    };
  }

  if (receiptConfirmed) {
    return {
      label: "Ready for DWT",
      tone: "success",
      helper:
        receipt?.status === "confirmed" || receipt?.status === "submitted"
          ? "The manager/receiver has confirmed the received waste. This can now move to DWT submission."
          : "The assignment or listing is completed. Waste X can now move this into DWT submission.",
    };
  }

  if (!collectionVerified && !operationallyComplete) {
    return {
      label: "Waiting for collection",
      tone: "muted",
      helper:
        "The carrier has not verified collection yet. The receiver cannot submit DWT until collection is verified or the job is completed.",
    };
  }

  if (!receipt) {
    return {
      label: "Collected — awaiting completion",
      tone: "warning",
      helper:
        "The carrier has collected the waste, but the job has not been completed by the manager/receiver yet.",
    };
  }

  if (receipt.status === "draft") {
    return {
      label: "Draft receipt",
      tone: "warning",
      helper:
        "A receipt draft exists, but it must be confirmed before DWT submission.",
    };
  }

  return {
    label: "Waiting",
    tone: "muted",
    helper:
      "This assignment is not ready for DWT submission yet. Check collection, completion and incident status.",
  };
}

function getReceiptDisplay(
  receipt:
    | {
        status: string;
      }
    | null
    | undefined,
  assignment: AssignmentForReadiness,
) {
  if (receipt) return formatStatus(receipt.status);

  if (isAssignmentOperationallyComplete(assignment)) {
    return "Operationally completed";
  }

  return "No receipt";
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: Tone;
}) {
  const classes = {
    muted: "border-black/10 bg-black/5 text-black/45",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-orange-200 bg-orange-50 text-orange-700",
    danger: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${classes[tone]}`}
    >
      {label}
    </span>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function ReceivingIntakePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  });

  if (!currentUser?.organisationId || !currentUser.organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  if (!currentUser.department) {
    redirect("/home/settings/departments?reason=no-active-department");
  }

  /*
    Keep narrowed values in constants.
    This prevents TypeScript from losing the null check inside nested JSX maps.
  */
  const currentOrganisation = currentUser.organisation;
  const currentDepartment = currentUser.department;

  const capabilities =
    (currentOrganisation.capabilities as Capability[] | null) ?? [];

  const departmentType =
    (currentDepartment.type as DepartmentType | undefined) ?? null;

  const canViewReceiving = hasOperationalPermission({
    capabilities,
    departmentType,
    permission: "receiving:view",
  });

  if (!canViewReceiving) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-[17vh] text-black">
        <section className="rounded-3xl border border-black/10 bg-white p-10 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
            Receiving Intake
          </p>

          <h1 className="mt-3 text-3xl font-semibold text-black">
            View-only access unavailable
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-black/55">
            Your active department does not currently have permission to view
            receiving intake records. Switch department or contact an
            administrator if this does not look right.
          </p>
        </section>
      </main>
    );
  }

  const organisationId = currentUser.organisationId;

  const assignments = await database.query.carrierAssignments.findMany({
    where: or(
      eq(carrierAssignments.organisationId, organisationId),
      eq(carrierAssignments.assignedByOrganisationId, organisationId),
      eq(carrierAssignments.managerOrganisationId, organisationId),
      eq(carrierAssignments.carrierOrganisationId, organisationId),
    ),
    with: {
      listing: true,
      carrierOrganisation: true,
      managerOrganisation: true,
      assignedByOrganisation: true,
    },
    orderBy: [desc(carrierAssignments.assignedAt)],
    limit: 80,
  });

  const assignmentIds = assignments.map((assignment) => assignment.id);

  const unresolvedIncidents =
    assignmentIds.length > 0
      ? await database.query.incidents.findMany({
          where: and(
            inArray(incidents.assignmentId, assignmentIds),
            inArray(incidents.status, ["open", "under_review"]),
          ),
          columns: {
            id: true,
            assignmentId: true,
            status: true,
          },
        })
      : [];

  const receipts =
    assignmentIds.length > 0
      ? await database.query.wasteReceipts.findMany({
          where: and(
            eq(wasteReceipts.organisationId, organisationId),
            inArray(wasteReceipts.assignmentId, assignmentIds),
          ),
          orderBy: [desc(wasteReceipts.updatedAt)],
        })
      : [];

  const latestSubmissions =
    assignmentIds.length > 0
      ? await database.query.wasteTrackingSubmissions.findMany({
          where: and(
            eq(wasteTrackingSubmissions.organisationId, organisationId),
            inArray(wasteTrackingSubmissions.assignmentId, assignmentIds),
          ),
          orderBy: [desc(wasteTrackingSubmissions.createdAt)],
        })
      : [];

  const latestReceiptByAssignment = new Map<string, (typeof receipts)[number]>();

  for (const receipt of receipts) {
    if (!latestReceiptByAssignment.has(receipt.assignmentId)) {
      latestReceiptByAssignment.set(receipt.assignmentId, receipt);
    }
  }

  const latestSubmissionByAssignment = new Map<
    string,
    (typeof latestSubmissions)[number]
  >();

  for (const submission of latestSubmissions) {
    if (!latestSubmissionByAssignment.has(submission.assignmentId)) {
      latestSubmissionByAssignment.set(submission.assignmentId, submission);
    }
  }

  const unresolvedIncidentCounts = new Map<string, number>();

  for (const incident of unresolvedIncidents) {
    unresolvedIncidentCounts.set(
      incident.assignmentId,
      (unresolvedIncidentCounts.get(incident.assignmentId) ?? 0) + 1,
    );
  }

  const submittedAssignments = assignments.filter((assignment) => {
    const submission = latestSubmissionByAssignment.get(assignment.id);

    return isDwtAccepted(submission);
  });

  const readyAssignments = assignments.filter((assignment) => {
    const receipt = latestReceiptByAssignment.get(assignment.id);
    const submission = latestSubmissionByAssignment.get(assignment.id);
    const unresolvedCount = unresolvedIncidentCounts.get(assignment.id) ?? 0;

    return (
      isReceiptConfirmed(receipt, assignment) &&
      !isDwtAccepted(submission) &&
      unresolvedCount === 0
    );
  });

  const waitingAssignments = assignments.filter((assignment) => {
    const receipt = latestReceiptByAssignment.get(assignment.id);
    const submission = latestSubmissionByAssignment.get(assignment.id);
    const unresolvedCount = unresolvedIncidentCounts.get(assignment.id) ?? 0;

    const isSubmitted = isDwtAccepted(submission);
    const isReady =
      isReceiptConfirmed(receipt, assignment) &&
      !isSubmitted &&
      unresolvedCount === 0;

    return !isSubmitted && !isReady;
  });

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-[17vh] text-black">
      {/* ================= HEADER ================= */}
      <section className="rounded-[2rem] bg-black p-8 text-white shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
          Receiving
        </p>

        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">
              Intake Queue
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Review assignments moving through operational completion and
              Digital Waste Tracking. A job becomes ready for DWT when the
              assignment or linked listing is completed and there are no
              unresolved incidents.
            </p>
          </div>

          <Link
            href="/home/receiving/submissions"
            className="inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            View DWT Submissions →
          </Link>
        </div>
      </section>

      {/* ================= WORKFLOW NOTE ================= */}
      <section className="mt-6 rounded-3xl border border-orange-200 bg-orange-50 p-5 text-orange-800">
        <p className="text-sm font-semibold">
          Operational completion unlocks DWT intake.
        </p>

        <p className="mt-2 text-sm leading-6">
          Carrier collection records pickup. Manager receipt completes the
          operational workflow. Once the assignment or listing is completed,
          Waste X can move the record into Digital Waste Tracking submission.
        </p>
      </section>

      {/* ================= METRICS ================= */}
      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-black/40">Total involved</p>

          <p className="mt-3 text-3xl font-semibold text-black">
            {assignments.length}
          </p>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-black/40">Ready for DWT</p>

          <p className="mt-3 text-3xl font-semibold text-black">
            {readyAssignments.length}
          </p>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-black/40">Waiting</p>

          <p className="mt-3 text-3xl font-semibold text-black">
            {waitingAssignments.length}
          </p>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-black/40">Submitted</p>

          <p className="mt-3 text-3xl font-semibold text-black">
            {submittedAssignments.length}
          </p>
        </div>
      </section>

      {/* ================= READY LIST ================= */}
      <section className="mt-8 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-black/10 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Ready
            </p>

            <h2 className="mt-2 text-xl font-semibold text-black">
              Assignments ready for DWT submission
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
              These assignments are operationally completed and have no
              unresolved incidents.
            </p>
          </div>
        </div>

        {readyAssignments.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-black/15 bg-[#f7f3ed] p-8">
            <p className="text-sm font-semibold text-black">
              No assignments are ready for DWT submission yet.
            </p>

            <p className="mt-2 text-sm leading-6 text-black/50">
              Once the operational assignment or listing is completed, it will
              appear here if there are no unresolved incidents.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {readyAssignments.map((assignment) => {
              const receipt = latestReceiptByAssignment.get(assignment.id);
              const submission = latestSubmissionByAssignment.get(
                assignment.id,
              );
              const unresolvedCount =
                unresolvedIncidentCounts.get(assignment.id) ?? 0;

              const state = getQueueState({
                assignment,
                receipt,
                submission,
                unresolvedIncidentCount: unresolvedCount,
              });

              return (
                <article
                  key={assignment.id}
                  className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill label={state.label} tone={state.tone} />

                        <StatusPill
                          label={`Receipt: ${getReceiptDisplay(
                            receipt,
                            assignment,
                          )}`}
                          tone={
                            isReceiptConfirmed(receipt, assignment)
                              ? "success"
                              : "warning"
                          }
                        />

                        {submission && (
                          <StatusPill
                            label={`DWT: ${formatStatus(submission.status)}`}
                            tone={
                              submission.status === "rejected" ||
                              submission.status === "failed"
                                ? "danger"
                                : submission.status ===
                                    "accepted_with_warnings"
                                  ? "warning"
                                  : "success"
                            }
                          />
                        )}
                      </div>

                      <h3 className="mt-3 text-lg font-semibold text-black">
                        {assignment.listing?.name ?? "Untitled assignment"}
                      </h3>

                      <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
                        {state.helper}
                      </p>

                      <div className="mt-3 grid gap-2 text-sm text-black/55 md:grid-cols-2">
                        <p>
                          <span className="font-medium text-black/70">
                            Assignment:
                          </span>{" "}
                          {assignment.id}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Listing:
                          </span>{" "}
                          #{assignment.listingId}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Assignment status:
                          </span>{" "}
                          {formatStatus(assignment.status)}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Listing status:
                          </span>{" "}
                          {formatStatus(assignment.listing?.status)}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Collected:
                          </span>{" "}
                          {formatDate(assignment.collectedAt)}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Completed:
                          </span>{" "}
                          {formatDate(assignment.completedAt)}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Receipt status:
                          </span>{" "}
                          {getReceiptDisplay(receipt, assignment)}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Received at:
                          </span>{" "}
                          {formatDate(receipt?.receivedAt)}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Manager:
                          </span>{" "}
                          {assignment.managerOrganisation?.teamName ??
                            currentOrganisation.teamName ??
                            "Not recorded"}
                        </p>

                        <p>
                          <span className="font-medium text-black/70">
                            Carrier:
                          </span>{" "}
                          {assignment.carrierOrganisation?.teamName ??
                            "Not assigned"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                      <Link
                        href={`/home/receiving/intake/${assignment.id}`}
                        className="inline-flex justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                      >
                        Open DWT intake →
                      </Link>

                      <Link
                        href={`/home/operations/assignments/${assignment.id}`}
                        className="inline-flex justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
                      >
                        View assignment
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ================= WAITING LIST ================= */}
      <section className="mt-8 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-black/10 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/35">
              Waiting
            </p>

            <h2 className="mt-2 text-xl font-semibold text-black">
              Waiting for operational completion
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
              These assignments are not ready for DWT yet. Some may be waiting
              for carrier collection, manager completion or incident resolution.
            </p>
          </div>
        </div>

        {waitingAssignments.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-black/15 bg-[#f7f3ed] p-8">
            <p className="text-sm font-semibold text-black">
              No waiting assignments.
            </p>

            <p className="mt-2 text-sm leading-6 text-black/50">
              Assignments will appear here when they are still waiting for
              collection, completion or incident resolution.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {waitingAssignments.map((assignment) => {
              const receipt = latestReceiptByAssignment.get(assignment.id);
              const submission = latestSubmissionByAssignment.get(
                assignment.id,
              );
              const unresolvedCount =
                unresolvedIncidentCounts.get(assignment.id) ?? 0;

              const collectionVerified = isCollectionVerified(assignment);

              const state = getQueueState({
                assignment,
                receipt,
                submission,
                unresolvedIncidentCount: unresolvedCount,
              });

              return (
                <div
                  key={assignment.id}
                  className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-[#f7f3ed] p-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill label={state.label} tone={state.tone} />

                      <StatusPill
                        label={`Receipt: ${getReceiptDisplay(
                          receipt,
                          assignment,
                        )}`}
                        tone={
                          isReceiptConfirmed(receipt, assignment)
                            ? "success"
                            : "warning"
                        }
                      />

                      {submission && (
                        <StatusPill
                          label={`DWT: ${formatStatus(submission.status)}`}
                          tone={
                            submission.status === "rejected" ||
                            submission.status === "failed"
                              ? "danger"
                              : submission.status === "accepted_with_warnings"
                                ? "warning"
                                : "success"
                          }
                        />
                      )}

                      {unresolvedCount > 0 && (
                        <StatusPill
                          label={`${unresolvedCount} unresolved incident${
                            unresolvedCount === 1 ? "" : "s"
                          }`}
                          tone="danger"
                        />
                      )}
                    </div>

                    <p className="mt-3 font-semibold text-black">
                      {assignment.listing?.name ?? "Untitled assignment"}
                    </p>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
                      {state.helper}
                    </p>

                    <div className="mt-3 grid gap-2 text-sm text-black/45 md:grid-cols-2">
                      <p>
                        Assignment {assignment.id} · Status{" "}
                        {formatStatus(assignment.status)}
                      </p>

                      <p>
                        Listing status:{" "}
                        {formatStatus(assignment.listing?.status)}
                      </p>

                      <p>
                        Collected: {formatDate(assignment.collectedAt)}
                      </p>

                      <p>
                        Completed: {formatDate(assignment.completedAt)}
                      </p>

                      <p>
                        Receipt: {getReceiptDisplay(receipt, assignment)}
                      </p>

                      <p>
                        Manager:{" "}
                        {assignment.managerOrganisation?.teamName ??
                          currentOrganisation.teamName ??
                          "Not recorded"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
                    {collectionVerified && unresolvedCount === 0 && (
                      <Link
                        href={`/home/operations/assignments/${assignment.id}`}
                        className="inline-flex justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                      >
                        Confirm completion →
                      </Link>
                    )}

                    <Link
                      href={`/home/operations/assignments/${assignment.id}`}
                      className="inline-flex justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
                    >
                      View assignment
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ================= SUBMITTED LIST ================= */}
      {submittedAssignments.length > 0 && (
        <section className="mt-8 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-black/10 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-600">
                Submitted
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                Submitted DWT receive movements
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
                These assignments already have an accepted DWT receive movement
                submission.
              </p>
            </div>

            <Link
              href="/home/receiving/submissions"
              className="inline-flex rounded-full border border-black/10 bg-[#f7f3ed] px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
            >
              View all submissions
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            {submittedAssignments.slice(0, 8).map((assignment) => {
              const receipt = latestReceiptByAssignment.get(assignment.id);
              const submission = latestSubmissionByAssignment.get(
                assignment.id,
              );
              const unresolvedCount =
                unresolvedIncidentCounts.get(assignment.id) ?? 0;

              const state = getQueueState({
                assignment,
                receipt,
                submission,
                unresolvedIncidentCount: unresolvedCount,
              });

              return (
                <div
                  key={assignment.id}
                  className="flex flex-col gap-4 rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill label={state.label} tone={state.tone} />

                      {submission && (
                        <StatusPill
                          label={`DWT: ${formatStatus(submission.status)}`}
                          tone={
                            submission.status === "accepted_with_warnings"
                              ? "warning"
                              : "success"
                          }
                        />
                      )}
                    </div>

                    <p className="mt-3 font-semibold text-black">
                      {assignment.listing?.name ?? "Untitled assignment"}
                    </p>

                    <div className="mt-3 grid gap-2 text-sm text-black/45 md:grid-cols-2">
                      <p>
                        Assignment {assignment.id} · Listing #
                        {assignment.listingId}
                      </p>

                      <p>
                        Receipt: {getReceiptDisplay(receipt, assignment)}
                      </p>

                      <p>
                        Waste tracking ID:{" "}
                        {submission?.wasteTrackingId ?? "Not recorded"}
                      </p>

                      <p>
                        Submitted: {formatDate(submission?.submittedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
                    <Link
                      href={`/home/receiving/intake/${assignment.id}`}
                      className="inline-flex justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                    >
                      View intake →
                    </Link>

                    <Link
                      href={`/home/operations/assignments/${assignment.id}`}
                      className="inline-flex justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
                    >
                      View assignment
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}