import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getAssignmentById } from "@/modules/assignments/queries/getAssignmentById";

import AssignmentActions from "@/components/app/Assignments/AssignmentActions";
import VerificationPanel from "@/components/app/Assignments/VerificationPanel";
import AssignmentCompliancePanel from "@/components/app/Assignments/AssignmentCompliancePanel";
import AssignmentIncidentModal from "@/components/app/Assignments/AssignmentIncidentModal";
import ManagerReceiptPanel from "@/components/app/Assignments/ManagerReceiptPanel";
import SoloManagerCompletionPanel from "@/components/app/Assignments/SoloManagerCompletionPanel";

import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";
import {
  type DepartmentType,
  type Permission,
  hasOperationalPermissionForOrganisation,
} from "@/modules/auth/core/permissions";

import { getLatestWasteTrackingSubmissionByAssignment } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingSubmissionByAssignment";

/* =========================================================
   TYPES
========================================================= */

type AssignmentPerspective = "generator" | "manager" | "carrier" | "compliance";

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

function getDwtStatusClass(status: string | null | undefined) {
  switch (status) {
    case "accepted":
      return "border-green-300 bg-green-100 text-green-700";

    case "accepted_with_warnings":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "submitted":
      return "border-blue-300 bg-blue-100 text-blue-700";

    case "rejected":
    case "failed":
      return "border-red-300 bg-red-100 text-red-700";

    case "draft":
      return "border-gray-300 bg-gray-100 text-gray-700";

    default:
      return "border-black/10 bg-[#fbfaf7] text-black/50";
  }
}

function getCollectionStatus({
  verificationCode,
  codeGeneratedAt,
  codeUsedAt,
  collectedAt,
  completedAt,
  status,
}: {
  verificationCode: string | null | undefined;
  codeGeneratedAt: Date | string | null | undefined;
  codeUsedAt: Date | string | null | undefined;
  collectedAt: Date | string | null | undefined;
  completedAt: Date | string | null | undefined;
  status: string | null | undefined;
}) {
  if (
    codeUsedAt ||
    collectedAt ||
    completedAt ||
    status === "in_progress" ||
    status === "completed"
  ) {
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

  if (
    departmentType === "manager" &&
    (assignment.managerOrganisationId === organisationId ||
      organisationIsInAssignment({ assignment, organisationId }))
  ) {
    return "manager";
  }

  if (
    departmentType === "carrier" &&
    (assignment.carrierOrganisationId === organisationId ||
      organisationIsInAssignment({ assignment, organisationId }))
  ) {
    return "carrier";
  }

  return "compliance";
}

function getSoloPerspective({
  assignment,
  organisationId,
}: {
  assignment: any;
  organisationId: string;
}): AssignmentPerspective {
  if (assignment.managerOrganisationId === organisationId) {
    return "manager";
  }

  if (assignment.carrierOrganisationId === organisationId) {
    return "carrier";
  }

  if (
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId
  ) {
    return "generator";
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
    return "The manager has confirmed receipt and this assignment is complete. If needed, review or update the Digital Waste Tracking receive movement record.";
  }

  if (
    managerAccepted &&
    !carrierAssigned &&
    ["pending", "accepted"].includes(assignment.status)
  ) {
    if (perspective === "manager") {
      return "You have accepted this job. Assign a carrier next so the collection workflow can begin.";
    }

    if (perspective === "generator") {
      return "The manager has accepted this job. Waiting for the manager to assign a carrier.";
    }

    if (perspective === "carrier") {
      return "This job is not ready for carrier response yet. A carrier still needs to be assigned.";
    }

    return "Manager accepted. Carrier assignment is still required.";
  }

  if (assignment.status === "in_progress" || collectionVerified) {
    if (perspective === "manager") {
      return "The carrier has verified collection. You can confirm operational receipt, then submit or review the Digital Waste Tracking receive movement.";
    }

    if (perspective === "carrier") {
      return "Collection has been verified. Deliver the waste to the manager. If something goes wrong, report an incident.";
    }

    if (perspective === "generator") {
      return "The carrier has collected the waste. Cancellation is now locked. Any issue must go through the incident workflow.";
    }

    return "Collection has been recorded. Compliance can review the chain-of-custody evidence and Digital Waste Tracking records.";
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
  isSoloOrganisation,
}: {
  assignment: any;
  perspective: AssignmentPerspective;
  isSoloOrganisation: boolean;
}) {
  if (isSoloOrganisation && assignment.status === "completed") {
    return "Not required for solo workflow";
  }

  if (isSoloOrganisation && !assignment.verificationCode) {
    return "Not required for solo workflow";
  }

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
    return assignment.codeUsedAt || assignment.collectedAt
      ? "Used"
      : "Generated";
  }

  return "Protected";
}

/* =========================================================
   PAGE
========================================================= */

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;

  const context = await requireOperationalPermission("assignment:view");

  const organisationId = context.user.organisationId!;
  const departmentType = context.departmentType as DepartmentType;
  const operatingMode = context.organisation?.operatingMode ?? null;
  const isSoloOrganisation = Boolean(context.isSoloOrganisation);

  function can(permission: Permission) {
    return hasOperationalPermissionForOrganisation({
      capabilities: context.capabilities,
      departmentType: context.storedDepartmentType ?? context.departmentType,
      permission,
      operatingMode,
    });
  }

  const assignment = await getAssignmentById(assignmentId);

  if (!assignment) {
    notFound();
  }

  if (!organisationIsInAssignment({ assignment, organisationId })) {
    notFound();
  }

  const basePerspective = getPerspective({
    assignment,
    organisationId,
    departmentType,
  });

  const perspective: AssignmentPerspective = isSoloOrganisation
    ? getSoloPerspective({
        assignment,
        organisationId,
      })
    : basePerspective;

  const isGeneratorForAssignment = perspective === "generator";

  const isManagerForAssignment = perspective === "manager";

  const isCarrierForAssignment = perspective === "carrier";

  const canAcceptAssignment = can("assignment:accept");

  const canRejectAssignment = can("assignment:reject");

  const canCancelAssignment = can("assignment:cancel");

  const canAssignCarrier = can("assignment:assign_carrier");

  const canVerifyCollection = can("assignment:verify_collection");

  const canReceiveWaste = can("assignment:receive_waste");

  const canViewReceiving = can("receiving:view");

  const canSubmitDwt = can("dwt:submit_receive_movement");

  const canViewDwt = can("dwt:view");

  const canCreateIncident = can("incident:create");

  const canViewCompliance = can("compliance:view");

  const latestDwtSubmission =
    await getLatestWasteTrackingSubmissionByAssignment({
      organisationId,
      assignmentId: assignment.id,
    });

  const hasUnresolvedIncident = Boolean(
    assignment.hasUnresolvedIncident ??
      assignment.hasOpenIncident ??
      Number(assignment.unresolvedIncidentCount ?? 0) > 0,
  );

  const collectionVerified = Boolean(
    assignment.collectedAt ||
      assignment.codeUsedAt ||
      assignment.completedAt ||
      assignment.status === "in_progress" ||
      assignment.status === "completed",
  );

  const jobIsClosed =
    assignment.status === "completed" ||
    assignment.status === "cancelled" ||
    assignment.status === "rejected";

  const soloGeneratorHasHandedOffAssignment =
    isSoloOrganisation &&
    perspective === "generator" &&
    Boolean(assignment.managerOrganisationId) &&
    assignment.managerOrganisationId !== organisationId;

  const generatorCanCancelAssignment =
    !soloGeneratorHasHandedOffAssignment &&
    isGeneratorForAssignment &&
    canCancelAssignment &&
    !collectionVerified &&
    ["pending", "accepted"].includes(assignment.status);

  const managerCanRespondToAssignment =
    isManagerForAssignment &&
    assignment.status === "pending" &&
    !assignment.managerAcceptedAt &&
    (canAcceptAssignment || canRejectAssignment);

  const carrierCanRespondToAssignment =
    !isSoloOrganisation &&
    isCarrierForAssignment &&
    assignment.status === "pending" &&
    Boolean(assignment.managerAcceptedAt) &&
    Boolean(assignment.carrierOrganisationId) &&
    (canAcceptAssignment || canRejectAssignment);

  const soloManagerCanOperateWithoutCarrier =
    isSoloOrganisation &&
    isManagerForAssignment &&
    assignment.managerOrganisationId === organisationId &&
    Boolean(assignment.managerAcceptedAt) &&
    !assignment.carrierOrganisationId &&
    assignment.status === "accepted" &&
    !jobIsClosed;

  const soloManagerCanCompleteJob =
    soloManagerCanOperateWithoutCarrier && !hasUnresolvedIncident;

  const soloManagerCanReportIncident =
    soloManagerCanOperateWithoutCarrier && canCreateIncident;

  const managerNeedsCarrier =
    !isSoloOrganisation &&
    isManagerForAssignment &&
    !jobIsClosed &&
    Boolean(assignment.managerAcceptedAt) &&
    !assignment.carrierOrganisationId &&
    ["pending", "accepted"].includes(assignment.status);

  const managerCanAssignCarrier = managerNeedsCarrier && canAssignCarrier;

  const carrierCanVerifyCollection =
    !isSoloOrganisation &&
    isCarrierForAssignment &&
    canVerifyCollection &&
    !collectionVerified &&
    !jobIsClosed &&
    assignment.status === "accepted" &&
    Boolean(assignment.verificationCode);

  const carrierVerifyBlockedByMissingCode =
    !isSoloOrganisation &&
    isCarrierForAssignment &&
    canVerifyCollection &&
    !collectionVerified &&
    !jobIsClosed &&
    assignment.status === "accepted" &&
    !assignment.verificationCode;

  const carrierCanReportIncident =
    !isSoloOrganisation &&
    isCarrierForAssignment &&
    canCreateIncident &&
    collectionVerified &&
    !jobIsClosed &&
    assignment.status === "in_progress";

  const managerCanConfirmReceipt =
    !isSoloOrganisation &&
    isManagerForAssignment &&
    canReceiveWaste &&
    collectionVerified &&
    assignment.status === "in_progress" &&
    !assignment.completedAt &&
    !hasUnresolvedIncident &&
    Boolean(assignment.verificationCode);

  const managerReceiptBlockedByIncident =
    !isSoloOrganisation &&
    isManagerForAssignment &&
    canReceiveWaste &&
    collectionVerified &&
    assignment.status === "in_progress" &&
    !assignment.completedAt &&
    hasUnresolvedIncident;

  const managerReceiptBlockedByMissingCode =
    !isSoloOrganisation &&
    isManagerForAssignment &&
    canReceiveWaste &&
    collectionVerified &&
    assignment.status === "in_progress" &&
    !assignment.completedAt &&
    !hasUnresolvedIncident &&
    !assignment.verificationCode;

  const showCompliancePanel =
    !soloGeneratorHasHandedOffAssignment &&
    perspective === "compliance" &&
    canViewCompliance;

  const showDigitalWasteTrackingPanel =
    !soloGeneratorHasHandedOffAssignment &&
    (canViewReceiving || canViewDwt || canSubmitDwt);

  const showAssignmentActions =
    generatorCanCancelAssignment ||
    managerCanRespondToAssignment ||
    carrierCanRespondToAssignment;

  const showNoActions =
    !soloGeneratorHasHandedOffAssignment &&
    !showAssignmentActions &&
    !managerNeedsCarrier &&
    !managerCanAssignCarrier &&
    !carrierCanVerifyCollection &&
    !carrierVerifyBlockedByMissingCode &&
    !managerCanConfirmReceipt &&
    !managerReceiptBlockedByIncident &&
    !managerReceiptBlockedByMissingCode &&
    !carrierCanReportIncident &&
    !soloManagerCanCompleteJob &&
    !soloManagerCanReportIncident &&
    !showCompliancePanel &&
    !showDigitalWasteTrackingPanel;

  const workflowMessage = soloGeneratorHasHandedOffAssignment
    ? "Generator handoff complete. Your solo workspace created the waste record and assigned the manager. The manager or receiving operator is now responsible for collection, receipt, DWT intake and completion."
    : soloManagerCanOperateWithoutCarrier
      ? hasUnresolvedIncident
        ? "This solo-managed assignment has an unresolved incident. Resolve the incident before completing the job or starting the Digital Waste Tracking receive movement."
        : "You have accepted this marketplace job as the manager. Because this is a solo workspace with carrier capability, you can report an incident or complete the job directly. After completion, Digital Waste Tracking intake will unlock."
      : getWorkflowMessage({
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
    completedAt: assignment.completedAt,
    status: assignment.status,
  });

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-12 py-32 pl-[24vw]">
      <div className="space-y-8">
        <Link
          href="/home/operations/assignments"
          className="text-sm font-medium text-black/45 transition hover:text-orange-600"
        >
          ← Back to assignments
        </Link>

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
                <HeaderPill>Workspace: {context.departmentLabel}</HeaderPill>
                <HeaderPill>Perspective: {formatLabel(perspective)}</HeaderPill>

                {isSoloOrganisation && (
                  <HeaderPill>Solo: full workflow access</HeaderPill>
                )}

                {soloGeneratorHasHandedOffAssignment && (
                  <HeaderPill>Generator handoff complete</HeaderPill>
                )}

                {showDigitalWasteTrackingPanel && (
                  <HeaderPill>
                    DWT:{" "}
                    {latestDwtSubmission
                      ? formatLabel(latestDwtSubmission.status)
                      : "Not submitted"}
                  </HeaderPill>
                )}
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
                className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                  soloGeneratorHasHandedOffAssignment
                    ? "border-blue-300 bg-blue-100 text-blue-700"
                    : getCollectionStatusClass(collectionStatus)
                }`}
              >
                {soloGeneratorHasHandedOffAssignment
                  ? "Generator handoff complete"
                  : isSoloOrganisation && assignment.status === "accepted"
                    ? "Solo completion available"
                    : collectionStatus}
              </span>

              {latestDwtSubmission && showDigitalWasteTrackingPanel && (
                <span
                  className={`rounded-full border px-4 py-2 text-xs font-semibold ${getDwtStatusClass(
                    latestDwtSubmission.status,
                  )}`}
                >
                  DWT: {formatLabel(latestDwtSubmission.status)}
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-orange-400/20 bg-orange-500/10 p-4 text-sm leading-6 text-orange-100">
            {workflowMessage}
          </div>
        </section>

        {managerNeedsCarrier && (
          <ManagerNeedsCarrierPanel listingId={assignment.listingId} />
        )}

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6">
          <PermissionCard
            label="Carrier Hub"
            allowed={managerCanAssignCarrier}
            note={
              soloGeneratorHasHandedOffAssignment
                ? "Manager responsibility now"
                : isSoloOrganisation
                  ? "Skipped in solo workflow"
                  : managerNeedsCarrier
                    ? canAssignCarrier
                      ? "Choose carrier in Carrier Hub"
                      : "No assign-carrier permission"
                    : "Only needed after manager accepts"
            }
          />

          <PermissionCard
            label="Verify Collection"
            allowed={carrierCanVerifyCollection}
            note={
              soloGeneratorHasHandedOffAssignment
                ? "Manager/carrier responsibility"
                : isSoloOrganisation
                  ? "Skipped in solo workflow"
                  : carrierVerifyBlockedByMissingCode
                    ? "Collection code missing"
                    : "Carrier only before collection"
            }
          />

          <PermissionCard
            label="Complete Job"
            allowed={soloManagerCanCompleteJob || managerCanConfirmReceipt}
            note={
              soloGeneratorHasHandedOffAssignment
                ? "Manager/receiver responsibility"
                : soloManagerCanCompleteJob
                  ? "Solo manager can complete directly"
                  : managerReceiptBlockedByIncident
                    ? "Blocked by unresolved incident"
                    : managerReceiptBlockedByMissingCode
                      ? "Verification code missing"
                      : "Available after collection"
            }
          />

          <PermissionCard
            label="DWT Intake"
            allowed={showDigitalWasteTrackingPanel && collectionVerified}
            note={
              soloGeneratorHasHandedOffAssignment
                ? "Handled by manager/receiver"
                : !showDigitalWasteTrackingPanel
                  ? "No DWT permission"
                  : !collectionVerified
                    ? "Available after completion"
                    : latestDwtSubmission
                      ? `Latest: ${formatLabel(latestDwtSubmission.status)}`
                      : "Ready for receive movement"
            }
          />

          <PermissionCard
            label="Cancel Assignment"
            allowed={generatorCanCancelAssignment}
            note={
              soloGeneratorHasHandedOffAssignment
                ? "Handoff already complete"
                : isSoloOrganisation
                  ? "Solo manager should complete or report incident"
                  : isGeneratorForAssignment && collectionVerified
                    ? "Locked after collection"
                    : "Generator only before collection"
            }
          />

          <PermissionCard
            label="Report Incident"
            allowed={carrierCanReportIncident || soloManagerCanReportIncident}
            note={
              soloGeneratorHasHandedOffAssignment
                ? "Manager/carrier-side only"
                : soloManagerCanReportIncident
                  ? "Available before solo completion"
                  : isCarrierForAssignment && !collectionVerified
                    ? "Available after collection verification"
                    : "Carrier-side issue reporting"
            }
          />
        </section>

        <div className="grid grid-cols-6 gap-8">
          <section className="col-span-4 space-y-8">
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
                  value={
                    isSoloOrganisation &&
                    assignment.managerOrganisationId === organisationId &&
                    !assignment.carrierOrg
                      ? "Handled by solo workspace"
                      : getOrganisationName(
                          assignment.carrierOrg,
                          "Not assigned yet",
                        )
                  }
                />
              </div>
            </div>

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
                  value={
                    isSoloOrganisation && !assignment.carrierAssignedAt
                      ? "Not required for solo workflow"
                      : formatDate(assignment.carrierAssignedAt)
                  }
                />

                <Detail
                  label="Carrier Responded At"
                  value={
                    isSoloOrganisation && !assignment.respondedAt
                      ? "Not required for solo workflow"
                      : formatDate(assignment.respondedAt)
                  }
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
                    isSoloOrganisation,
                  })}
                  breakAll={perspective === "generator"}
                />

                <Detail
                  label="Code Generated At"
                  value={
                    isSoloOrganisation && !assignment.codeGeneratedAt
                      ? "Not required for solo workflow"
                      : formatDate(assignment.codeGeneratedAt)
                  }
                />

                <Detail
                  label="Code Used At"
                  value={
                    isSoloOrganisation && !assignment.codeUsedAt
                      ? "Not required for solo workflow"
                      : formatDate(assignment.codeUsedAt)
                  }
                />
              </div>

              {soloGeneratorHasHandedOffAssignment && (
                <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-800">
                  <p className="font-semibold">Generator handoff complete</p>
                  <p className="mt-1">
                    Your part as the waste generator is complete. The assigned
                    manager is now responsible for operational movement,
                    collection/receipt records, DWT intake and completion.
                  </p>
                </div>
              )}

              {soloManagerCanOperateWithoutCarrier && (
                <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5 text-sm leading-6 text-green-800">
                  <p className="font-semibold">Solo workflow ready</p>
                  <p className="mt-1">
                    This job has been accepted by your solo workspace. You can
                    report an incident if something went wrong, or complete the
                    job directly and move into Digital Waste Tracking.
                  </p>
                </div>
              )}

              {isGeneratorForAssignment &&
                collectionVerified &&
                !isSoloOrganisation && (
                  <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-800">
                    <p className="font-semibold">Cancellation locked</p>
                    <p className="mt-1">
                      The carrier has already verified collection or the job is
                      in progress. This assignment can no longer be cancelled by
                      the generator. If something has gone wrong, the carrier
                      should report an incident.
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
                    cannot confirm receipt or complete the job until the
                    incident has been resolved.
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

            {showDigitalWasteTrackingPanel && (
              <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                      Digital Waste Tracking
                    </p>

                    <h2 className="mt-3 text-xl font-semibold text-black">
                      Receive movement record
                    </h2>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
                      Submit or review the formal Waste Tracking Service receive
                      movement connected to this assignment.
                    </p>
                  </div>

                  <span
                    className={`rounded-full border px-4 py-2 text-xs font-semibold ${getDwtStatusClass(
                      latestDwtSubmission?.status,
                    )}`}
                  >
                    {latestDwtSubmission
                      ? formatLabel(latestDwtSubmission.status)
                      : "Not submitted"}
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                  <Detail
                    label="Waste Tracking ID"
                    value={latestDwtSubmission?.wasteTrackingId ?? "Not issued"}
                    breakAll
                  />

                  <Detail
                    label="Submission Method"
                    value={latestDwtSubmission?.method ?? "Not submitted"}
                  />

                  <Detail
                    label="Submitted At"
                    value={formatDate(latestDwtSubmission?.submittedAt)}
                  />

                  <Detail
                    label="Last Attempted At"
                    value={formatDate(latestDwtSubmission?.lastAttemptedAt)}
                  />
                </div>

                {!collectionVerified && (
                  <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-800">
                    <p className="font-semibold">DWT intake not ready</p>
                    <p className="mt-1">
                      Complete the job before the receive movement can be
                      submitted.
                    </p>
                  </div>
                )}

                {hasUnresolvedIncident && (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-800">
                    <p className="font-semibold">DWT submission blocked</p>
                    <p className="mt-1">
                      Resolve the unresolved incident before submitting or
                      updating the receive movement.
                    </p>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  {canViewReceiving && (
                    <Link
                      href={`/home/receiving/intake/${assignment.id}`}
                      className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                    >
                      Open receiving intake →
                    </Link>
                  )}

                  {(canViewDwt || canSubmitDwt || canViewReceiving) && (
                    <Link
                      href="/home/receiving/submissions"
                      className="inline-flex rounded-full border border-black/10 bg-[#fbfaf7] px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
                    >
                      View DWT submissions
                    </Link>
                  )}
                </div>
              </div>
            )}

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
                  title={
                    isSoloOrganisation && isManagerForAssignment
                      ? "Carrier Assignment Skipped"
                      : "Carrier Assigned"
                  }
                  date={
                    isSoloOrganisation &&
                    isManagerForAssignment &&
                    !assignment.carrierAssignedAt
                      ? "Not required for solo workflow"
                      : formatDate(assignment.carrierAssignedAt)
                  }
                  active={Boolean(
                    assignment.carrierAssignedAt ||
                      (isSoloOrganisation && isManagerForAssignment),
                  )}
                />

                <TimelineItem
                  title={
                    isSoloOrganisation && isManagerForAssignment
                      ? "Carrier Response Skipped"
                      : "Carrier Response"
                  }
                  date={
                    isSoloOrganisation &&
                    isManagerForAssignment &&
                    !assignment.respondedAt
                      ? "Not required for solo workflow"
                      : formatDate(assignment.respondedAt)
                  }
                  active={Boolean(
                    assignment.respondedAt ||
                      (isSoloOrganisation && isManagerForAssignment),
                  )}
                />

                <TimelineItem
                  title={
                    isSoloOrganisation && isManagerForAssignment
                      ? "Verification Code Skipped"
                      : "Verification Code Generated"
                  }
                  date={
                    isSoloOrganisation &&
                    isManagerForAssignment &&
                    !assignment.codeGeneratedAt
                      ? "Not required for solo workflow"
                      : formatDate(assignment.codeGeneratedAt)
                  }
                  active={Boolean(
                    assignment.codeGeneratedAt ||
                      (isSoloOrganisation && isManagerForAssignment),
                  )}
                />

                <TimelineItem
                  title={
                    isSoloOrganisation && isManagerForAssignment
                      ? "Solo Job Completed"
                      : "Carrier Verified Collection"
                  }
                  date={formatDate(
                    assignment.collectedAt ?? assignment.completedAt,
                  )}
                  active={Boolean(
                    assignment.collectedAt ||
                      assignment.codeUsedAt ||
                      assignment.completedAt,
                  )}
                />

                <TimelineItem
                  title="Manager Confirmed Receipt"
                  date={formatDate(assignment.completedAt)}
                  active={Boolean(assignment.completedAt)}
                />

                <TimelineItem
                  title="DWT Receive Movement"
                  date={formatDate(latestDwtSubmission?.submittedAt)}
                  active={Boolean(latestDwtSubmission?.submittedAt)}
                />
              </div>
            </div>
          </section>

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

            {soloGeneratorHasHandedOffAssignment && (
              <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-sm text-blue-800 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-700">
                  Generator handoff
                </p>

                <h3 className="mt-3 text-lg font-semibold text-black">
                  Your part is complete
                </h3>

                <p className="mt-2 leading-6">
                  You created the waste record and handed it to the assigned
                  manager. Collection, receipt, DWT intake and completion now
                  sit with the manager or receiving operator.
                </p>

                <Link
                  href="/home/operations/listings"
                  className="mt-5 block rounded-2xl bg-black p-4 text-center font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                >
                  Back to My Waste Listings →
                </Link>
              </div>
            )}

            {soloManagerCanOperateWithoutCarrier && (
              <div className="space-y-4">
                <div className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-sm shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-700">
                    Incident option
                  </p>

                  <h3 className="mt-3 text-lg font-semibold text-black">
                    Report an issue before completion
                  </h3>

                  <p className="mt-2 leading-6 text-orange-900/75">
                    If there was contamination, missing paperwork, an access
                    issue, damaged load, safety concern or another operational
                    problem, report an incident before completing this job.
                  </p>

                  <div className="mt-5">
                    {soloManagerCanReportIncident ? (
                      <AssignmentIncidentModal
                        assignment={{
                          assignmentId: assignment.id,
                          listingId: assignment.listingId,
                          listingName:
                            assignment.listing?.name ?? "Assignment",
                          assignedAt: assignment.assignedAt,
                        }}
                        hasIncident={assignment.hasIncident}
                      />
                    ) : (
                      <p className="rounded-2xl border border-orange-200 bg-white p-4 text-sm text-orange-900/75">
                        You do not currently have permission to report incidents.
                      </p>
                    )}
                  </div>
                </div>

                {soloManagerCanCompleteJob ? (
                  <SoloManagerCompletionPanel assignmentId={assignment.id} />
                ) : (
                  <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
                    <p className="font-semibold">Completion blocked</p>
                    <p className="mt-2 leading-6">
                      Resolve the linked incident before completing this
                      solo-managed job.
                    </p>
                  </div>
                )}
              </div>
            )}

            {managerNeedsCarrier && (
              <CarrierHubSidebarPanel
                assignmentId={assignment.id}
                listingId={assignment.listingId}
                canAssignCarrier={managerCanAssignCarrier}
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

            {showDigitalWasteTrackingPanel && (
              <DigitalWasteTrackingSidebarPanel
                assignmentId={assignment.id}
                collectionVerified={collectionVerified}
                hasUnresolvedIncident={hasUnresolvedIncident}
                canViewReceiving={canViewReceiving}
                canSubmitDwt={canSubmitDwt}
                canViewDwt={canViewDwt}
                latestSubmission={latestDwtSubmission}
              />
            )}

            {showCompliancePanel && (
              <AssignmentCompliancePanel assignment={assignment} />
            )}

            {carrierCanReportIncident && !soloManagerCanReportIncident && (
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
                  Your active workspace can view this assignment, but there are
                  no operational actions available for the current status and
                  permission context.
                </p>
              </div>
            )}

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

                {managerNeedsCarrier && (
                  <Link
                    href={`/home/operations/carriers?assignmentId=${assignment.id}`}
                    className="block rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-semibold text-orange-800 transition hover:border-orange-400 hover:bg-orange-100"
                  >
                    Open Carrier Hub →
                  </Link>
                )}

                {canViewReceiving && !soloGeneratorHasHandedOffAssignment && (
                  <Link
                    href={`/home/receiving/intake/${assignment.id}`}
                    className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm font-semibold text-black transition hover:border-orange-300 hover:text-orange-600"
                  >
                    Receiving Intake →
                  </Link>
                )}

                {(canViewDwt || canSubmitDwt || canViewReceiving) &&
                  !soloGeneratorHasHandedOffAssignment && (
                    <Link
                      href="/home/receiving/submissions"
                      className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm font-semibold text-black transition hover:border-orange-300 hover:text-orange-600"
                    >
                      DWT Submissions →
                    </Link>
                  )}

                {canViewDwt && !soloGeneratorHasHandedOffAssignment && (
                  <Link
                    href="/home/compliance/digital-waste-tracking"
                    className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm font-semibold text-black transition hover:border-orange-300 hover:text-orange-600"
                  >
                    DWT Dashboard →
                  </Link>
                )}

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

function CarrierHubSidebarPanel({
  assignmentId,
  listingId,
  canAssignCarrier,
}: {
  assignmentId: string;
  listingId: number | string;
  canAssignCarrier: boolean;
}) {
  return (
    <div
      id="assign-carrier"
      className="scroll-mt-32 rounded-3xl border border-orange-200 bg-orange-50 p-6 text-sm text-orange-900 shadow-sm"
    >
      <p className="text-xs uppercase tracking-[0.25em] text-orange-700">
        Carrier Selection
      </p>

      <h3 className="mt-3 text-lg font-semibold text-black">
        Choose carrier in Carrier Hub
      </h3>

      <p className="mt-2 leading-6 text-orange-900/75">
        Carrier assignment happens in the Carrier Hub so managers can review
        workload, incident risk, contact details and carrier suitability before
        choosing who gets the job.
      </p>

      <div className="mt-5 space-y-3">
        {canAssignCarrier ? (
          <Link
            href={`/home/operations/carriers?assignmentId=${assignmentId}`}
            className="block rounded-2xl bg-black p-4 text-center font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
          >
            Choose from Carrier Hub →
          </Link>
        ) : (
          <div className="rounded-2xl border border-orange-200 bg-white p-4 text-sm leading-6 text-orange-900/75">
            <p className="font-semibold text-black">Permission required</p>
            <p className="mt-1">
              Your active workspace can view this assignment, but it does not
              currently have permission to assign the carrier.
            </p>
          </div>
        )}

        <Link
          href={`/home/marketplace/browse/${listingId}`}
          className="block rounded-2xl border border-orange-200 bg-white p-4 text-center font-semibold text-orange-800 transition hover:border-orange-400 hover:bg-orange-100"
        >
          Review listing →
        </Link>
      </div>
    </div>
  );
}

function ManagerNeedsCarrierPanel({
  listingId,
}: {
  listingId: number | string;
}) {
  return (
    <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-orange-700">
            Next Step Required
          </p>

          <h2 className="mt-2 text-xl font-semibold text-black">
            Manager accepted — carrier selection required
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-900/75">
            This job has been accepted, but it cannot move into collection until
            a carrier is selected. Carrier assignment happens in the Carrier Hub
            so you can compare available carriers before choosing one.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
          <Link
            href={`/home/marketplace/browse/${listingId}`}
            className="inline-flex justify-center rounded-full border border-orange-300 bg-white px-5 py-3 text-sm font-semibold text-orange-800 transition hover:border-orange-500 hover:bg-orange-100"
          >
            Open listing →
          </Link>
        </div>
      </div>
    </section>
  );
}

function HeaderPill({ children }: { children: ReactNode }) {
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

function DigitalWasteTrackingSidebarPanel({
  assignmentId,
  collectionVerified,
  hasUnresolvedIncident,
  canViewReceiving,
  canSubmitDwt,
  canViewDwt,
  latestSubmission,
}: {
  assignmentId: string;
  collectionVerified: boolean;
  hasUnresolvedIncident: boolean;
  canViewReceiving: boolean;
  canSubmitDwt: boolean;
  canViewDwt: boolean;
  latestSubmission: Awaited<
    ReturnType<typeof getLatestWasteTrackingSubmissionByAssignment>
  >;
}) {
  const isBlocked = !collectionVerified || hasUnresolvedIncident;

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 text-sm shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        Digital Waste Tracking
      </p>

      <h3 className="mt-3 text-lg font-semibold text-black">
        Receive movement
      </h3>

      <p className="mt-2 leading-6 text-black/50">
        Connect this assignment to a formal Waste Tracking Service receive
        movement record.
      </p>

      <div className="mt-5 space-y-3">
        <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
          <p className="text-xs uppercase tracking-widest text-black/35">
            Status
          </p>
          <p className="mt-2 font-semibold text-black">
            {latestSubmission
              ? formatLabel(latestSubmission.status)
              : "Not submitted"}
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
          <p className="text-xs uppercase tracking-widest text-black/35">
            Tracking ID
          </p>
          <p className="mt-2 break-all font-semibold text-black">
            {latestSubmission?.wasteTrackingId ?? "Not issued"}
          </p>
        </div>
      </div>

      {!collectionVerified && (
        <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-800">
          <p className="font-semibold">Waiting for completion</p>
          <p className="mt-1 leading-6">
            DWT receive movement submission unlocks after the job is completed.
          </p>
        </div>
      )}

      {hasUnresolvedIncident && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">Blocked by incident</p>
          <p className="mt-1 leading-6">
            Resolve the incident before submitting or updating the DWT record.
          </p>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {canViewReceiving && (
          <Link
            href={`/home/receiving/intake/${assignmentId}`}
            className={`block rounded-2xl p-4 text-center font-semibold transition ${
              isBlocked
                ? "border border-black/10 bg-[#fbfaf7] text-black/45 hover:border-orange-300 hover:text-orange-600"
                : "bg-black text-orange-400 hover:bg-orange-500 hover:text-black"
            }`}
          >
            {canSubmitDwt ? "Open DWT intake →" : "View DWT intake →"}
          </Link>
        )}

        {(canViewDwt || canSubmitDwt || canViewReceiving) && (
          <Link
            href="/home/receiving/submissions"
            className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-center font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
          >
            Submission log →
          </Link>
        )}
      </div>
    </div>
  );
}