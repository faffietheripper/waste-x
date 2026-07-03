import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  carrierAssignments,
  users,
  wasteReceipts,
  wasteTrackingOrganisationSettings,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  type Capability,
  type DepartmentType,
  hasOperationalPermission,
} from "@/modules/auth/core/permissions";

import { getLatestWasteTrackingSubmissionByAssignment } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingSubmissionByAssignment";

import ReceiveMovementForm from "./ReceiveMovementForm";

/* =========================================================
   HELPERS
========================================================= */

function formatDate(value: Date | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function isOrganisationInvolved(params: {
  organisationId: string;
  assignment: typeof carrierAssignments.$inferSelect;
}) {
  return (
    params.assignment.organisationId === params.organisationId ||
    params.assignment.assignedByOrganisationId === params.organisationId ||
    params.assignment.managerOrganisationId === params.organisationId ||
    params.assignment.carrierOrganisationId === params.organisationId
  );
}

function isAssignmentOperationallyComplete(params: {
  status: string;
  completedAt: Date | null;
  listingStatus?: string | null;
}) {
  return (
    params.status === "completed" ||
    Boolean(params.completedAt) ||
    params.listingStatus === "completed"
  );
}

function isReceiptConfirmed(
  receipt:
    | {
        status: string;
      }
    | null
    | undefined,
) {
  return receipt?.status === "confirmed" || receipt?.status === "submitted";
}

function getBlockReason(params: {
  assignmentComplete: boolean;
}) {
  if (!params.assignmentComplete) {
    return {
      title: "DWT intake is not available yet",
      message:
        "This assignment has not been fully completed operationally. The DWT receive movement page is locked until the job is complete.",
      detail:
        "Collection alone is not enough. The assignment or linked listing must be completed before it can move into Digital Waste Tracking submission.",
    };
  }

  return {
    title: "DWT intake is locked",
    message:
      "This assignment is not currently eligible for DWT receive movement submission.",
    detail:
      "Check the assignment status, listing status, incidents and organisation DWT settings.",
  };
}

/* =========================================================
   PAGE
========================================================= */

export default async function ReceivingIntakeDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;

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

  const capabilities =
    (currentUser.organisation.capabilities as Capability[] | null) ?? [];

  const departmentType =
    (currentUser.department.type as DepartmentType | undefined) ?? null;

  const canViewReceiving = hasOperationalPermission({
    capabilities,
    departmentType,
    permission: "receiving:view",
  });

  const canSubmitDwt = hasOperationalPermission({
    capabilities,
    departmentType,
    permission: "dwt:submit_receive_movement",
  });

  if (!canViewReceiving) {
    redirect("/home/receiving/intake");
  }

  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, assignmentId),
    with: {
      listing: true,
      organisation: true,
      carrierOrganisation: true,
      managerOrganisation: true,
      assignedByOrganisation: true,
      incidents: true,
    },
  });

  if (!assignment) {
    notFound();
  }

  if (
    !isOrganisationInvolved({
      organisationId: currentUser.organisationId,
      assignment,
    })
  ) {
    notFound();
  }

  const assignmentComplete = isAssignmentOperationallyComplete({
    status: assignment.status,
    completedAt: assignment.completedAt,
    listingStatus: assignment.listing?.status ?? null,
  });

  const latestReceipt = await database.query.wasteReceipts.findFirst({
    where: eq(wasteReceipts.assignmentId, assignment.id),
    orderBy: [desc(wasteReceipts.updatedAt)],
  });

  const receiptConfirmed = isReceiptConfirmed(latestReceipt);

  const unresolvedIncidents = assignment.incidents.filter((incident) =>
    ["open", "under_review"].includes(incident.status),
  );

  const organisationSettings =
    await database.query.wasteTrackingOrganisationSettings.findFirst({
      where: eq(
        wasteTrackingOrganisationSettings.organisationId,
        currentUser.organisationId,
      ),
    });

  const latestSubmission =
    await getLatestWasteTrackingSubmissionByAssignment({
      organisationId: currentUser.organisationId,
      assignmentId: assignment.id,
    });

  /*
    IMPORTANT:
    This page is now unlocked by operational completion.

    A separate wasteReceipts row is useful when it exists, but it is not required
    because the ManagerReceiptPanel completion step already confirms receipt in
    the operational assignment flow.
  */
  if (!assignmentComplete) {
    const blockReason = getBlockReason({
      assignmentComplete,
    });

    return (
      <BlockedDwtIntakePage
        title={blockReason.title}
        message={blockReason.message}
        detail={blockReason.detail}
        assignmentId={assignment.id}
        assignmentName={assignment.listing?.name ?? "Assignment intake"}
        assignmentStatus={assignment.status}
        listingStatus={assignment.listing?.status ?? null}
        collectedAt={assignment.collectedAt}
        completedAt={assignment.completedAt}
        receiptStatus={latestReceipt?.status ?? null}
        receivedAt={latestReceipt?.receivedAt ?? null}
      />
    );
  }

  const dwtEnabled = Boolean(organisationSettings?.isEnabled);

  const canSubmit =
    canSubmitDwt &&
    assignmentComplete &&
    unresolvedIncidents.length === 0 &&
    dwtEnabled;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-[17vh] text-black">
      {/* ================= HEADER ================= */}
      <section className="rounded-[2rem] bg-black p-8 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
              Receiving Intake
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              {assignment.listing?.name ?? "Assignment intake"}
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              This assignment is complete operationally. You can now submit or
              update the Digital Waste Tracking receive movement.
            </p>
          </div>

          <Link
            href="/home/receiving/intake"
            className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            ← Intake queue
          </Link>
        </div>
      </section>

      {/* ================= READY NOTE ================= */}
      <section className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
        <p className="text-sm font-semibold">
          Ready for Digital Waste Tracking submission
        </p>

        <p className="mt-2 text-sm leading-6">
          This assignment or linked listing has been completed operationally.
          Waste X can now use the confirmed operational information for the DWT
          receive movement.
        </p>
      </section>

      {/* ================= SUMMARY ================= */}
      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Assignment
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            Operational context
          </h2>

          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-medium text-black/70">Assignment:</span>{" "}
              {assignment.id}
            </p>

            <p>
              <span className="font-medium text-black/70">Listing:</span> #
              {assignment.listingId}
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
              <span className="font-medium text-black/70">Collected:</span>{" "}
              {formatDate(assignment.collectedAt)}
            </p>

            <p>
              <span className="font-medium text-black/70">Completed:</span>{" "}
              {formatDate(assignment.completedAt)}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Receipt
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            Manager confirmation
          </h2>

          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-medium text-black/70">Receipt status:</span>{" "}
              {latestReceipt
                ? formatStatus(latestReceipt.status)
                : "Operational completion confirmed"}
            </p>

            <p>
              <span className="font-medium text-black/70">Received at:</span>{" "}
              {formatDate(latestReceipt?.receivedAt ?? assignment.completedAt)}
            </p>

            <p>
              <span className="font-medium text-black/70">Receipt ID:</span>{" "}
              {latestReceipt?.id ?? "No separate receipt record"}
            </p>

            <p>
              <span className="font-medium text-black/70">Receiver org:</span>{" "}
              {assignment.managerOrganisation?.teamName ??
                currentUser.organisation.teamName ??
                "Not recorded"}
            </p>

            {receiptConfirmed && (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
                A confirmed receipt record exists for this assignment.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Digital Waste Tracking
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            Submission status
          </h2>

          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-medium text-black/70">Enabled:</span>{" "}
              {organisationSettings?.isEnabled ? "Yes" : "No"}
            </p>

            <p>
              <span className="font-medium text-black/70">Environment:</span>{" "}
              {organisationSettings?.environment ?? "test"}
            </p>

            <p>
              <span className="font-medium text-black/70">Latest status:</span>{" "}
              {latestSubmission
                ? formatStatus(latestSubmission.status)
                : "No submission yet"}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Waste tracking ID:
              </span>{" "}
              {latestSubmission?.wasteTrackingId ?? "Not issued yet"}
            </p>
          </div>
        </div>
      </section>

      {/* ================= BLOCKERS ================= */}
      {unresolvedIncidents.length > 0 && (
        <section className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-800">
            Submission blocked by unresolved incident
          </p>

          <p className="mt-2 text-sm leading-6 text-red-700/80">
            Resolve all open or under-review incidents before submitting this
            receive movement.
          </p>
        </section>
      )}

      {!dwtEnabled && (
        <section className="mt-8 rounded-3xl border border-orange-200 bg-orange-50 p-6">
          <p className="text-sm font-semibold text-orange-800">
            Digital Waste Tracking is disabled
          </p>

          <p className="mt-2 text-sm leading-6 text-orange-700/80">
            Enable Digital Waste Tracking in organisation settings and save the
            Receiver API Code before submitting.
          </p>

          <Link
            href="/home/settings/digital-waste-tracking"
            className="mt-4 inline-flex rounded-full bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500"
          >
            Open DWT settings →
          </Link>
        </section>
      )}

      {!canSubmitDwt && (
        <section className="mt-8 rounded-3xl border border-black/10 bg-white p-6">
          <p className="text-sm font-semibold text-black">
            View-only Digital Waste Tracking access
          </p>

          <p className="mt-2 text-sm leading-6 text-black/55">
            Your active department can view this receiving intake, but cannot
            submit the receive movement.
          </p>
        </section>
      )}

      {/* ================= FORM ================= */}
      <section className="mt-8">
        <ReceiveMovementForm
          assignmentId={assignment.id}
          listingId={assignment.listingId}
          listingName={assignment.listing?.name ?? "Waste movement"}
          listingLocation={assignment.listing?.location ?? ""}
          canSubmit={canSubmit}
          existingWasteTrackingId={latestSubmission?.wasteTrackingId ?? null}
          defaultReceiverApiCode={organisationSettings?.apiCode ?? ""}
          defaultCarrier={{
            organisationName:
              assignment.carrierOrganisation?.teamName ?? "Unknown carrier",
            fullAddress:
              assignment.carrierOrganisation?.streetAddress ??
              assignment.carrierOrganisation?.city ??
              "",
            postcode: assignment.carrierOrganisation?.postCode ?? "",
            emailAddress: assignment.carrierOrganisation?.emailAddress ?? "",
            phoneNumber: assignment.carrierOrganisation?.telephone ?? "",
          }}
          defaultReceiver={{
            siteName:
              currentUser.organisation.teamName ??
              assignment.managerOrganisation?.teamName ??
              "Receiving site",
            emailAddress: currentUser.organisation.emailAddress ?? "",
            phoneNumber: currentUser.organisation.telephone ?? "",
            fullAddress: [
              currentUser.organisation.streetAddress,
              currentUser.organisation.city,
              currentUser.organisation.region,
              currentUser.organisation.country,
            ]
              .filter(Boolean)
              .join(", "),
            postcode: currentUser.organisation.postCode ?? "",
          }}
        />
      </section>
    </main>
  );
}

/* =========================================================
   BLOCKED PAGE
========================================================= */

function BlockedDwtIntakePage({
  title,
  message,
  detail,
  assignmentId,
  assignmentName,
  assignmentStatus,
  listingStatus,
  collectedAt,
  completedAt,
  receiptStatus,
  receivedAt,
}: {
  title: string;
  message: string;
  detail: string;
  assignmentId: string;
  assignmentName: string;
  assignmentStatus: string;
  listingStatus: string | null;
  collectedAt: Date | null;
  completedAt: Date | null;
  receiptStatus: string | null;
  receivedAt: Date | null;
}) {
  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-[17vh] text-black">
      <section className="rounded-[2rem] bg-black p-8 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
              Receiving Intake Locked
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              {title}
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              {message}
            </p>
          </div>

          <Link
            href="/home/receiving/intake"
            className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            ← Intake queue
          </Link>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-orange-200 bg-orange-50 p-6 text-orange-800">
        <p className="text-sm font-semibold">Why this page is locked</p>

        <p className="mt-2 max-w-4xl text-sm leading-6">{detail}</p>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Assignment
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            {assignmentName}
          </h2>

          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-medium text-black/70">Assignment:</span>{" "}
              {assignmentId}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Assignment status:
              </span>{" "}
              {formatStatus(assignmentStatus)}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Listing status:
              </span>{" "}
              {formatStatus(listingStatus)}
            </p>

            <p>
              <span className="font-medium text-black/70">Collected:</span>{" "}
              {formatDate(collectedAt)}
            </p>

            <p>
              <span className="font-medium text-black/70">Completed:</span>{" "}
              {formatDate(completedAt)}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Receipt
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            Receiver confirmation
          </h2>

          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-medium text-black/70">Receipt status:</span>{" "}
              {receiptStatus ? formatStatus(receiptStatus) : "No receipt"}
            </p>

            <p>
              <span className="font-medium text-black/70">Received at:</span>{" "}
              {formatDate(receivedAt)}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Required before DWT
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            Completion rules
          </h2>

          <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-6 text-black/55">
            <li>Assignment or linked listing must be completed.</li>
            <li>There must be no unresolved incidents.</li>
            <li>DWT must be enabled for the organisation.</li>
          </ul>
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-3 rounded-3xl border border-black/10 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-black">
            Continue from the operational assignment
          </p>

          <p className="mt-2 text-sm leading-6 text-black/50">
            Complete the operational workflow first, then return to the intake
            queue for DWT submission.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/home/operations/assignments/${assignmentId}`}
            className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
          >
            View assignment →
          </Link>

          <Link
            href="/home/receiving/intake"
            className="inline-flex rounded-full border border-black/10 bg-[#f7f3ed] px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
          >
            Back to intake queue
          </Link>
        </div>
      </section>
    </main>
  );
}