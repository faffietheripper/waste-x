import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
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

type DepartmentType = "generator" | "carrier" | "manager" | "compliance";
type AssignmentPerspective = "generator" | "manager" | "carrier" | "compliance";

type CarrierOption = {
  id: string;
  teamName: string;
  capabilities: ("generator" | "carrier" | "manager")[];
};

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

  return departmentType;
}

function getWorkflowMessage({
  assignment,
  perspective,
}: {
  assignment: any;
  perspective: AssignmentPerspective;
}) {
  const managerAccepted = Boolean(assignment.managerAcceptedAt);
  const carrierAssigned = Boolean(assignment.carrierOrganisationId);

  if (assignment.status === "cancelled") {
    return "This assignment has been cancelled.";
  }

  if (assignment.status === "rejected") {
    return "This assignment has been rejected.";
  }

  if (assignment.status === "completed") {
    return "The waste has been received and this assignment is complete.";
  }

  if (assignment.status === "in_progress") {
    if (perspective === "manager") {
      return "Collection is in progress. Confirm receipt using the verification code to complete the workflow.";
    }

    if (perspective === "carrier") {
      return "Collection has been verified. Waiting for the manager to confirm receipt.";
    }

    return "Collection has been recorded. Waiting for manager receipt confirmation.";
  }

  if (assignment.status === "accepted") {
    return "The carrier has accepted the job. Collection can now be verified.";
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

export default async function AssignmentDetailPage({
  params,
}: {
  params: { assignmentId: string };
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.organisationId) {
    redirect("/home");
  }

  if (!session.user.activeDepartment) {
    redirect("/home/settings/departments");
  }

  const assignment = await getAssignmentById(params.assignmentId);

  if (!assignment) {
    notFound();
  }

  const organisationId = session.user.organisationId;
  const departmentType = session.user.activeDepartment.type as DepartmentType;

  const perspective = getPerspective({
    assignment,
    organisationId,
    departmentType,
  });

  const workflowMessage = getWorkflowMessage({
    assignment,
    perspective,
  });

  /*
    Carrier candidates:
    Any ACTIVE organisation with carrier capability can be selected.
    This includes the manager's own organisation if it also has carrier capability.
  */
  const allOrganisations = await database.select().from(organisations);

  const carrierOptions: CarrierOption[] = allOrganisations
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
      capabilities: org.capabilities as ("generator" | "carrier" | "manager")[],
    }));

  const managerCanAssignCarrier =
    perspective === "manager" &&
    assignment.status === "pending" &&
    Boolean(assignment.managerAcceptedAt) &&
    !assignment.carrierOrganisationId;

  const managerCanReceiveWaste =
    perspective === "manager" && assignment.status === "in_progress";

  const showVerificationPanel =
    perspective === "carrier" && assignment.status === "accepted";

  const showIncidentModal =
    perspective === "carrier" &&
    ["accepted", "in_progress"].includes(assignment.status);

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
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold capitalize text-black">
                {assignment.status.replace("_", " ")}
              </span>

              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium capitalize text-white/70">
                Your role: {perspective}
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-orange-400/20 bg-orange-500/10 p-4 text-sm text-orange-100">
            {workflowMessage}
          </div>
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

              <div className="mt-6 grid grid-cols-3 gap-5 text-sm">
                <InfoCard
                  label="Generator"
                  value={assignment.generatorOrg?.name ?? "Unknown"}
                />

                <InfoCard
                  label="Manager"
                  value={assignment.managerOrg?.name ?? "Not assigned"}
                />

                <InfoCard
                  label="Carrier"
                  value={assignment.carrierOrg?.name ?? "Not assigned yet"}
                />
              </div>
            </div>

            {/* ASSIGNMENT INFO */}
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-black">
                Assignment Details
              </h2>

              <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                <Detail label="Assignment ID" value={assignment.id} breakAll />

                <Detail
                  label="Listing ID"
                  value={String(assignment.listingId)}
                />

                <Detail
                  label="Assignment Method"
                  value={assignment.assignmentMethod ?? "Unknown"}
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
                  value={
                    departmentType === "compliance"
                      ? (assignment.verificationCode ?? "Not generated")
                      : "Protected"
                  }
                />
              </div>
            </div>

            {/* AUDIT TRAIL */}
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-black">Audit Trail</h2>

              <div className="mt-6 space-y-5 text-sm">
                <TimelineItem
                  title="Assignment Created"
                  date={formatDate(assignment.assignedAt)}
                />

                <TimelineItem
                  title="Manager Accepted"
                  date={formatDate(assignment.managerAcceptedAt)}
                />

                <TimelineItem
                  title="Carrier Assigned"
                  date={formatDate(assignment.carrierAssignedAt)}
                />

                <TimelineItem
                  title="Carrier Response"
                  date={formatDate(assignment.respondedAt)}
                />

                <TimelineItem
                  title="Waste Collected"
                  date={formatDate(assignment.collectedAt)}
                />

                <TimelineItem
                  title="Assignment Completed"
                  date={formatDate(assignment.completedAt)}
                />
              </div>
            </div>
          </section>

          {/* RIGHT */}
          <aside className="col-span-2 space-y-6">
            <AssignmentActions
              assignmentId={assignment.id}
              status={assignment.status}
              departmentType={departmentType}
              perspective={perspective}
              managerAcceptedAt={assignment.managerAcceptedAt}
              carrierOrganisationId={assignment.carrierOrganisationId}
              viewerOrganisationId={organisationId}
            />

            {managerCanAssignCarrier && (
              <AssignCarrierPanel
                assignmentId={assignment.id}
                carriers={carrierOptions}
                currentOrganisationId={organisationId}
              />
            )}

            {managerCanReceiveWaste && (
              <ManagerReceiptPanel assignmentId={assignment.id} />
            )}

            {showVerificationPanel && (
              <VerificationPanel assignmentId={assignment.id} />
            )}

            {departmentType === "compliance" && (
              <AssignmentCompliancePanel assignment={assignment} />
            )}

            {showIncidentModal && (
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
          </aside>
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

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

function TimelineItem({ title, date }: { title: string; date: string }) {
  return (
    <div className="border-l-2 border-orange-500 pl-4">
      <p className="font-medium text-black">{title}</p>
      <p className="mt-1 text-black/45">{date}</p>
    </div>
  );
}
