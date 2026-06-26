import { notFound } from "next/navigation";
import Link from "next/link";

import { database } from "@/db/database";
import { organisations } from "@/db/schema";

import { getAssignmentById } from "@/modules/assignments/queries/getAssignmentById";

import AssignmentActions from "@/components/app/Assignments/AssignmentActions";
import VerificationPanel from "@/components/app/Assignments/VerificationPanel";
import AssignmentCompliancePanel from "@/components/app/Assignments/AssignmentCompliancePanel";
import AssignmentIncidentModal from "@/components/app/Assignments/AssignmentIncidentModal";
import AssignCarrierPanel from "@/components/app/Assignments/AssignCarrierPanel";
import ManagerReceiptPanel from "@/components/app/Assignments/ManagerReceiptPanel";

import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";
import {
  type DepartmentType,
  hasOperationalPermission,
} from "@/modules/auth/core/permissions";

/* =========================================================
   TYPES
========================================================= */

type AssignmentPerspective = "generator" | "manager" | "carrier" | "compliance";

type CarrierOption = {
  id: string;
  teamName: string;
  capabilities: ("generator" | "carrier" | "manager")[];
};

/* =========================================================
   FORMATTERS
========================================================= */

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getOrganisationName(org: any, fallback = "Unknown") {
  return org?.teamName ?? org?.name ?? fallback;
}

function getStatusClass(status: string | null | undefined) {
  switch (status) {
    case "pending":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "accepted":
      return "border-green-300 bg-green-100 text-green-700";

    case "in_progress":
      return "border-blue-300 bg-blue-100 text-blue-700";

    case "completed":
      return "border-black bg-black text-white";

    case "rejected":
    case "cancelled":
      return "border-red-300 bg-red-100 text-red-700";

    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

function getCollectionStatus({
  verificationCode,
  codeGeneratedAt,
  codeUsedAt,
  collectedAt,
  status,
}: {
  verificationCode: string | null | undefined;
  codeGeneratedAt: Date | string | null | undefined;
  codeUsedAt: Date | string | null | undefined;
  collectedAt: Date | string | null | undefined;
  status: string | null | undefined;
}) {
  if (codeUsedAt || collectedAt || status === "in_progress" || status === "completed") {
    return "Collection verified";
  }

  if (codeGeneratedAt || verificationCode) {
    return "Collection code generated";
  }

  return "Collection code missing";
}

function getCollectionStatusClass(status: string) {
  switch (status) {
    case "Collection verified":
      return "border-green-300 bg-green-100 text-green-700";

    case "Collection code generated":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "Collection code missing":
      return "border-red-300 bg-red-100 text-red-700";

    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

/* =========================================================
   PERSPECTIVE / WORKFLOW
========================================================= */

function organisationIsInAssignment({
  assignment,
  organisationId,
}: {
  assignment: any;
  organisationId: string;
}) {
  return (
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId ||
    assignment.managerOrganisationId === organisationId ||
    assignment.carrierOrganisationId === organisationId
  );
}

function getPerspective({
  assignment,
  organisationId,
  departmentType,
}: {
  assignment: any;
  organisationId: string;
  departmentType: DepartmentType;
}): AssignmentPerspective {
  if (departmentType === "compliance") return "compliance";

  if (
    departmentType === "generator" &&
    (assignment.organisationId === organisationId ||
      assignment.assignedByOrganisationId === organisationId)
  ) {
    return "generator";
  }

  /*
    IMPORTANT:
    Internal jobs may not have managerOrganisationId populated.
    If the active department is manager and the organisation is involved in
    the assignment, treat the user as the manager-side operator.
  */
  if (
    departmentType === "manager" &&
    (assignment.managerOrganisationId === organisationId ||
      organisationIsInAssignment({ assignment, organisationId }))
  ) {
    return "manager";
  }

  /*
    Carrier department should control collection-side actions.
    This covers external carrier orgs and internal same-org carrier departments.
  */
  if (
    departmentType === "carrier" &&
    (assignment.carrierOrganisationId === organisationId ||
      organisationIsInAssignment({ assignment, organisationId }))
  ) {
    return "carrier";
  }

  return "compliance";
}

function getWorkflowMessage({
  assignment,
  perspective,
  collectionVerified,
  hasUnresolvedIncident,
}: {
  assignment: any;
  perspective: AssignmentPerspective;
  collectionVerified: boolean;
  hasUnresolvedIncident: boolean;
}) {
  const managerAccepted = Boolean(assignment.managerAcceptedAt);
  const carrierAssigned = Boolean(assignment.carrierOrganisationId);

  if (hasUnresolvedIncident) {
    return "This assignment has an unresolved incident. Completion is blocked until the incident has been reviewed and resolved.";
  }

  if (assignment.status === "cancelled") {
    return "This assignment has been cancelled. Operational actions are locked.";
  }

  if (assignment.status === "rejected") {
    return "This assignment has been rejected. Operational actions are locked.";
  }

  if (assignment.status === "completed") {
    return "The manager has confirmed receipt and this assignment is complete.";
  }

  if (assignment.status === "in_progress" || collectionVerified) {
    if (perspective === "manager") {
      return "The carrier has verified collection. You can now confirm receipt using the verification code.";
    }

    if (perspective === "carrier") {
      return "Collection has been verified. Deliver the waste to the manager. If something goes wrong, report an incident.";
    }

    if (perspective === "generator") {
      return "The carrier has collected the waste. Cancellation is now locked. Any issue must go through the incident workflow.";
    }

    return "Collection has been recorded. Compliance can review the chain-of-custody evidence.";
  }

  if (assignment.status === "accepted") {
    if (perspective === "carrier") {
      return "You have accepted this job. Verify collection using the code when the waste is collected.";
    }

    if (perspective === "manager") {
      return "The job has been accepted and is waiting for carrier collection verification.";
    }

    if (perspective === "generator") {
      return "The job has been accepted. You can only cancel before collection is verified.";
    }

    return "The job has been accepted and is waiting for collection.";
  }

  if (assignment.status === "pending" && perspective === "manager") {
    if (!managerAccepted && !carrierAssigned) {
      return "This job is waiting for the manager to accept or reject.";
    }

    if (managerAccepted && !carrierAssigned) {
      return "Manager accepted. A carrier now needs to be assigned.";
    }

    if (managerAccepted && carrierAssigned) {
      return "Carrier has been assigned. Waiting for carrier response.";
    }
  }

  if (assignment.status === "pending" && perspective === "carrier") {
    return "This carrier job is waiting for your response.";
  }

  if (assignment.status === "pending" && perspective === "generator") {
    if (!managerAccepted) {
      return "Waiting for the manager to accept or reject the job.";
    }

    if (managerAccepted && !carrierAssigned) {
      return "Manager accepted. Waiting for carrier assignment.";
    }

    return "Carrier assigned. Waiting for carrier response.";
  }

  return "Assignment is pending.";
}

function getCollectionCodeDisplay({
  assignment,
  perspective,
}: {
  assignment: any;
  perspective: AssignmentPerspective;
}) {
  if (!assignment.verificationCode) return "Not generated";

  if (perspective === "generator") {
    return assignment.verificationCode;
  }

  if (perspective === "carrier") {
    return assignment.codeUsedAt || assignment.collectedAt
      ? "Used"
      : "Required for collection";
  }

  if (perspective === "manager") {
    return assignment.codeUsedAt || assignment.collectedAt
      ? "Required for receipt confirmation"
      : "Awaiting carrier collection";
  }

  if (perspective === "compliance") {
    return assignment.codeUsedAt || assignment.collectedAt ? "Used" : "Generated";
  }

  return "Protected";
}

/* =========================================================
   PAGE
========================================================= */

export default async function AssignmentDetailPage({
  params,
}: {
  params: { assignmentId: string };
}) {
  const context = await requireOperationalPermission("assignment:view");

  const organisationId = context.user.organisationId!;
  const departmentType = context.departmentType as DepartmentType;

  const assignment = await getAssignmentById(params.assignmentId);

  if (!assignment) {
    notFound();
  }

  if (!organisationIsInAssignment({ assignment, organisationId })) {
    notFound();
  }

  const perspective = getPerspective({
    assignment,
    organisationId,
    departmentType,
  });

  const isGeneratorForAssignment = perspective === "generator";
  const isManagerForAssignment = perspective === "manager";
  const isCarrierForAssignment = perspective === "carrier";

  const canAcceptAssignment = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType,
    permission: "assignment:accept",
  });

  const canRejectAssignment = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType,
    permission: "assignment:reject",
  });

  const canCancelAssignment = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType,
    permission: "assignment:cancel",
  });

  const canAssignCarrier = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType,
    permission: "assignment:assign_carrier",
  });

  const canVerifyCollection = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType,
    permission: "assignment:verify_collection",
  });

  const canReceiveWaste = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType,
    permission: "assignment:receive_waste",
  });

  const canCreateIncident = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType,
    permission: "incident:create",
  });

  const canViewCompliance = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType,
    permission: "compliance:view",
  });

  const hasUnresolvedIncident = Boolean(
    assignment.hasUnresolvedIncident ??
      assignment.hasOpenIncident ??
      (Number(assignment.unresolvedIncidentCount ?? 0) > 0),
  );

  const collectionVerified = Boolean(
    assignment.collectedAt ||
      assignment.codeUsedAt ||
      assignment.status === "in_progress" ||
      assignment.status === "completed",
  );

  const jobIsClosed =
    assignment.status === "completed" ||
    assignment.status === "cancelled" ||
    assignment.status === "rejected";

  /*
    Generator can only cancel before collection.
  */
  const generatorCanCancelAssignment =
    isGeneratorForAssignment &&
    canCancelAssignment &&
    !collectionVerified &&
    ["pending", "accepted"].includes(assignment.status);

  /*
    Manager accepts/rejects the original manager-side assignment.
  */
  const managerCanRespondToAssignment =
    isManagerForAssignment &&
    assignment.status === "pending" &&
    !assignment.managerAcceptedAt &&
    (canAcceptAssignment || canRejectAssignment);

  /*
    Carrier accepts/rejects once carrier is assigned.
  */
  const carrierCanRespondToAssignment =
    isCarrierForAssignment &&
    assignment.status === "pending" &&
    Boolean(assignment.managerAcceptedAt) &&
    Boolean(assignment.carrierOrganisationId) &&
    (canAcceptAssignment || canRejectAssignment);

  /*
    Manager assigns carrier after manager has accepted.
  */
  const managerCanAssignCarrier =
    isManagerForAssignment &&
    canAssignCarrier &&
    assignment.status === "pending" &&
    Boolean(assignment.managerAcceptedAt) &&
    !assignment.carrierOrganisationId;

  /*
    Carrier verifies collection before collection has been recorded.
    This is the form that should show on the accepted carrier page.
  */
  const carrierCanVerifyCollection =
    isCarrierForAssignment &&
    canVerifyCollection &&
    !collectionVerified &&
    !jobIsClosed &&
    assignment.status === "accepted" &&
    Boolean(assignment.verificationCode);

  const carrierVerifyBlockedByMissingCode =
    isCarrierForAssignment &&
    canVerifyCollection &&
    !collectionVerified &&
    !jobIsClosed &&
    assignment.status === "accepted" &&
    !assignment.verificationCode;

  /*
    Carrier reports incident after collection has been verified.
    This is the button that should show on the in-progress carrier page.
  */
  const carrierCanReportIncident =
    isCarrierForAssignment &&
    canCreateIncident &&
    collectionVerified &&
    !jobIsClosed &&
    assignment.status === "in_progress";

  /*
    Manager confirms receipt after carrier collection verification.
    This is the form that should show on the in-progress manager page.
  */
  const managerCanConfirmReceipt =
    isManagerForAssignment &&
    canReceiveWaste &&
    collectionVerified &&
    assignment.status === "in_progress" &&
    !assignment.completedAt &&
    !hasUnresolvedIncident &&
    Boolean(assignment.verificationCode);

  const managerReceiptBlockedByIncident =
    isManagerForAssignment &&
    canReceiveWaste &&
    collectionVerified &&
    assignment.status === "in_progress" &&
    !assignment.completedAt &&
    hasUnresolvedIncident;

  const managerReceiptBlockedByMissingCode =
    isManagerForAssignment &&
    canReceiveWaste &&
    collectionVerified &&
    assignment.status === "in_progress" &&
    !assignment.completedAt &&
    !hasUnresolvedIncident &&
    !assignment.verificationCode;

  const showCompliancePanel = perspective === "compliance" && canViewCompliance;

  const showAssignmentActions =
    generatorCanCancelAssignment ||
    managerCanRespondToAssignment ||
    carrierCanRespondToAssignment;

  const showNoActions =
    !showAssignmentActions &&
    !managerCanAssignCarrier &&
    !carrierCanVerifyCollection &&
    !carrierVerifyBlockedByMissingCode &&
    !managerCanConfirmReceipt &&
    !managerReceiptBlockedByIncident &&
    !managerReceiptBlockedByMissingCode &&
    !carrierCanReportIncident &&
    !showCompliancePanel;

  const workflowMessage = getWorkflowMessage({
    assignment,
    perspective,
    collectionVerified,
    hasUnresolvedIncident,
  });

  const collectionStatus = getCollectionStatus({
    verificationCode: assignment.verificationCode,
    codeGeneratedAt: assignment.codeGeneratedAt,
    codeUsedAt: assignment.codeUsedAt,
    collectedAt: assignment.collectedAt,
    status: assignment.status,
  });

  let carrierOptions: CarrierOption[] = [];

  if (managerCanAssignCarrier) {
    const allOrganisations = await database.select().from(organisations);

    carrierOptions = allOrganisations
      .filter((org) => {
        const caps = (org.capabilities ?? []) as (
          | "generator"
          | "carrier"
          | "manager"
        )[];

        return org.status === "ACTIVE" && caps.includes("carrier");
      })
      .map((org) => ({
        id: org.id,
        teamName: org.teamName,
        capabilities: org.capabilities as (
          | "generator"
          | "carrier"
          | "manager"
        )[],
      }));
  }

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-12 py-32">
      <div className="space-y-8">
        {/* BACK */}
        <Link
          href="/home/operations/assignments/active"
          className="text-sm font-medium text-black/45 transition hover:text-orange-600"
        >
          ← Back to assignments
        </Link>

        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Assignment
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                {assignment.listing?.name ?? "Assignment"}
              </h1>

              <p className="mt-2 text-sm text-white/50">
                {assignment.listing?.location ?? "Unknown location"}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <HeaderPill>Department: {context.department.name}</HeaderPill>
                <HeaderPill>Perspective: {formatLabel(perspective)}</HeaderPill>
                <HeaderPill>Permission: assignment:view</HeaderPill>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${getStatusClass(
                  assignment.status,
                )}`}
              >
                {formatLabel(assignment.status)}
              </span>

              <span
                className={`rounded-full border px-4 py-2 text-xs font-semibold ${getCollectionStatusClass(
                  collectionStatus,
                )}`}
              >
                {collectionStatus}
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-orange-400/20 bg-orange-500/10 p-4 text-sm leading-6 text-orange-100">
            {workflowMessage}
          </div>
        </section>

        {/* PERMISSION / ACTION SUMMARY */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
          <PermissionCard
            label="Verify Collection"
            allowed={carrierCanVerifyCollection}
            note={
              carrierVerifyBlockedByMissingCode
                ? "Collection code missing"
                : "Carrier only before collection"
            }
          />

          <PermissionCard
            label="Confirm Receipt"
            allowed={managerCanConfirmReceipt}
            note={
              managerReceiptBlockedByIncident
                ? "Blocked by unresolved incident"
                : managerReceiptBlockedByMissingCode
                  ? "Verification code missing"
                  : "Manager only after collection"
            }
          />

          <PermissionCard
            label="Cancel Assignment"
            allowed={generatorCanCancelAssignment}
            note={
              isGeneratorForAssignment && collectionVerified
                ? "Locked after collection"
                : "Generator only before collection"
            }
          />

          <PermissionCard
            label="Report Incident"
            allowed={carrierCanReportIncident}
            note={
              isCarrierForAssignment && !collectionVerified
                ? "Available after collection verification"
                : "Carrier-side issue reporting"
            }
          />
        </section>

        {/* GRID */}
        <div className="grid grid-cols-6 gap-8">
          {/* LEFT */}
          <section className="col-span-4 space-y-8">
            {/* PARTIES */}
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-black">
                Assignment Parties
              </h2>

              <p className="mt-2 text-sm text-black/45">
                Organisations involved in this assignment.
              </p>

              <div className="mt-6 grid grid-cols-3 gap-5 text-sm">
                <InfoCard
                  label="Generator"
                  value={getOrganisationName(assignment.generatorOrg)}
                />

                <InfoCard
                  label="Manager"
                  value={getOrganisationName(
                    assignment.managerOrg,
                    "Not assigned",
                  )}
                />

                <InfoCard
                  label="Carrier"
                  value={getOrganisationName(
                    assignment.carrierOrg,
                    "Not assigned yet",
                  )}
                />
              </div>
            </div>

            {/* ASSIGNMENT INFO */}
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-black">
                Assignment Details
              </h2>

              <p className="mt-2 text-sm text-black/45">
                Assignment lifecycle, timestamps and verification evidence.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                <Detail label="Assignment ID" value={assignment.id} breakAll />

                <Detail
                  label="Listing ID"
                  value={String(assignment.listingId)}
                />

                <Detail
                  label="Assignment Method"
                  value={formatLabel(assignment.assignmentMethod)}
                />

                <Detail
                  label="Assigned At"
                  value={formatDate(assignment.assignedAt)}
                />

                <Detail
                  label="Manager Accepted At"
                  value={formatDate(assignment.managerAcceptedAt)}
                />

                <Detail
                  label="Carrier Assigned At"
                  value={formatDate(assignment.carrierAssignedAt)}
                />

                <Detail
                  label="Carrier Responded At"
                  value={formatDate(assignment.respondedAt)}
                />

                <Detail
                  label="Collected At"
                  value={formatDate(assignment.collectedAt)}
                />

                <Detail
                  label="Completed At"
                  value={formatDate(assignment.completedAt)}
                />

                <Detail
                  label="Verification Code"
                  value={getCollectionCodeDisplay({
                    assignment,
                    perspective,
                  })}
                  breakAll={perspective === "generator"}
                />

                <Detail
                  label="Code Generated At"
                  value={formatDate(assignment.codeGeneratedAt)}
                />

                <Detail
                  label="Code Used At"
                  value={formatDate(assignment.codeUsedAt)}
                />
              </div>

              {isGeneratorForAssignment && collectionVerified && (
                <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-800">
                  <p className="font-semibold">Cancellation locked</p>
                  <p className="mt-1">
                    The carrier has already verified collection or the job is in
                    progress. This assignment can no longer be cancelled by the
                    generator. If something has gone wrong, the carrier should
                    report an incident.
                  </p>
                </div>
              )}

              {carrierCanVerifyCollection && (
                <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-800">
                  <p className="font-semibold">Collection verification needed</p>
                  <p className="mt-1">
                    Enter the verification code when collecting the waste. This
                    records collection and moves the assignment into progress.
                  </p>
                </div>
              )}

              {carrierCanReportIncident && (
                <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-800">
                  <p className="font-semibold">Incident reporting available</p>
                  <p className="mt-1">
                    Collection has been verified. If there is an accident,
                    issue, contamination problem, access problem or delivery
                    concern, report it as an incident.
                  </p>
                </div>
              )}

              {managerCanConfirmReceipt && (
                <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5 text-sm leading-6 text-green-800">
                  <p className="font-semibold">
                    Manager receipt confirmation available
                  </p>
                  <p className="mt-1">
                    The carrier has verified collection. Enter the verification
                    code to confirm receipt and complete the job.
                  </p>
                </div>
              )}

              {managerReceiptBlockedByIncident && (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-800">
                  <p className="font-semibold">Completion blocked</p>
                  <p className="mt-1">
                    This assignment has an unresolved incident. The manager
                    cannot confirm receipt or complete the job until the incident
                    has been resolved.
                  </p>
                </div>
              )}

              {managerReceiptBlockedByMissingCode && (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-800">
                  <p className="font-semibold">Verification code missing</p>
                  <p className="mt-1">
                    This assignment cannot be completed because no verification
                    code exists on the assignment.
                  </p>
                </div>
              )}
            </div>

            {/* OPERATIONAL TIMELINE */}
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-black">
                Operational Timeline
              </h2>

              <p className="mt-2 text-sm leading-6 text-black/45">
                This timeline is generated from assignment lifecycle fields. The
                true audit log lives in the compliance audit area.
              </p>

              <div className="mt-6 space-y-5 text-sm">
                <TimelineItem
                  title="Assignment Created"
                  date={formatDate(assignment.assignedAt)}
                  active={Boolean(assignment.assignedAt)}
                />

                <TimelineItem
                  title="Manager Accepted"
                  date={formatDate(assignment.managerAcceptedAt)}
                  active={Boolean(assignment.managerAcceptedAt)}
                />

                <TimelineItem
                  title="Carrier Assigned"
                  date={formatDate(assignment.carrierAssignedAt)}
                  active={Boolean(assignment.carrierAssignedAt)}
                />

                <TimelineItem
                  title="Carrier Response"
                  date={formatDate(assignment.respondedAt)}
                  active={Boolean(assignment.respondedAt)}
                />

                <TimelineItem
                  title="Verification Code Generated"
                  date={formatDate(assignment.codeGeneratedAt)}
                  active={Boolean(assignment.codeGeneratedAt)}
                />

                <TimelineItem
                  title="Carrier Verified Collection"
                  date={formatDate(assignment.collectedAt)}
                  active={Boolean(assignment.collectedAt || assignment.codeUsedAt)}
                />

                <TimelineItem
                  title="Verification Code Used"
                  date={formatDate(assignment.codeUsedAt)}
                  active={Boolean(assignment.codeUsedAt)}
                />

                <TimelineItem
                  title="Manager Confirmed Receipt"
                  date={formatDate(assignment.completedAt)}
                  active={Boolean(assignment.completedAt)}
                />
              </div>
            </div>
          </section>

          {/* RIGHT */}
          <aside className="col-span-2 space-y-6">
            {showAssignmentActions && (
              <AssignmentActions
                assignmentId={assignment.id}
                status={assignment.status}
                departmentType={departmentType}
                perspective={perspective}
                managerAcceptedAt={assignment.managerAcceptedAt}
                carrierOrganisationId={assignment.carrierOrganisationId}
                viewerOrganisationId={organisationId}
              />
            )}

            {managerCanAssignCarrier && (
              <AssignCarrierPanel
                assignmentId={assignment.id}
                carriers={carrierOptions}
                currentOrganisationId={organisationId}
              />
            )}

            {carrierCanVerifyCollection && (
              <VerificationPanel assignmentId={assignment.id} />
            )}

            {carrierVerifyBlockedByMissingCode && (
              <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
                <p className="font-semibold">Collection code missing</p>
                <p className="mt-2 leading-6">
                  This carrier cannot verify collection because no verification
                  code has been generated for the assignment.
                </p>
              </div>
            )}

            {managerCanConfirmReceipt && (
              <ManagerReceiptPanel assignmentId={assignment.id} />
            )}

            {managerReceiptBlockedByIncident && (
              <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
                <p className="font-semibold">Receipt blocked</p>
                <p className="mt-2 leading-6">
                  Resolve the linked incident before confirming receipt or
                  completing this assignment.
                </p>
              </div>
            )}

            {managerReceiptBlockedByMissingCode && (
              <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
                <p className="font-semibold">Receipt blocked</p>
                <p className="mt-2 leading-6">
                  This assignment does not have a verification code, so manager
                  receipt cannot be confirmed.
                </p>
              </div>
            )}

            {showCompliancePanel && (
              <AssignmentCompliancePanel assignment={assignment} />
            )}

            {carrierCanReportIncident && (
              <AssignmentIncidentModal
                assignment={{
                  assignmentId: assignment.id,
                  listingId: assignment.listingId,
                  listingName: assignment.listing?.name ?? "Assignment",
                  assignedAt: assignment.assignedAt,
                }}
                hasIncident={assignment.hasIncident}
              />
            )}

            {showNoActions && (
              <div className="rounded-3xl border border-black/10 bg-white p-6 text-sm text-black/50 shadow-sm">
                <p className="font-semibold text-black">
                  No direct actions available
                </p>

                <p className="mt-2 leading-6">
                  Your active department can view this assignment, but there are
                  no operational actions available for the current status and
                  permission context.
                </p>
              </div>
            )}

            {/* QUICK LINKS */}
            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Related Records
              </p>

              <div className="mt-5 space-y-3">
                <Link
                  href={`/home/marketplace/browse/${assignment.listingId}`}
                  className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm font-semibold text-black transition hover:border-orange-300 hover:text-orange-600"
                >
                  View Listing →
                </Link>

                {canViewCompliance && (
                  <Link
                    href="/home/compliance/reports"
                    className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm font-semibold text-black transition hover:border-orange-300 hover:text-orange-600"
                  >
                    View Compliance Reports →
                  </Link>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function HeaderPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
      {children}
    </span>
  );
}

function PermissionCard({
  label,
  allowed,
  note,
}: {
  label: string;
  allowed: boolean;
  note: string;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>

      <p
        className={`mt-3 text-lg font-semibold ${
          allowed ? "text-green-700" : "text-black"
        }`}
      >
        {allowed ? "Available" : "Locked"}
      </p>

      <p className="mt-2 text-xs leading-5 text-black/45">{note}</p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5">
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>
      <p className="mt-2 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function Detail({
  label,
  value,
  breakAll = false,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-black/35">{label}</p>
      <p
        className={`mt-2 text-sm font-medium text-black ${
          breakAll ? "break-all" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TimelineItem({
  title,
  date,
  active,
}: {
  title: string;
  date: string;
  active: boolean;
}) {
  return (
    <div
      className={`border-l-2 pl-4 ${
        active ? "border-orange-500" : "border-black/10"
      }`}
    >
      <p className={`font-medium ${active ? "text-black" : "text-black/35"}`}>
        {title}
      </p>
      <p className="mt-1 text-black/45">{date}</p>
    </div>
  );
}