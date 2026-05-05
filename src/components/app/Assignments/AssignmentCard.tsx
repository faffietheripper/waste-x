import Link from "next/link";
import AssignmentActions from "@/components/app/Assignments/AssignmentActions";

type DepartmentType = "generator" | "carrier" | "manager" | "compliance";

type AssignmentPerspective = "generator" | "manager" | "carrier" | "compliance";

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

function statusClass(status: string) {
  switch (status) {
    case "pending":
      return "bg-orange-100 text-orange-700";
    case "accepted":
      return "bg-green-100 text-green-700";
    case "in_progress":
      return "bg-blue-100 text-blue-700";
    case "completed":
      return "bg-black text-white";
    case "rejected":
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function formatStatus(status: string) {
  switch (status) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function getViewerPerspective({
  assignment,
  viewerOrganisationId,
  departmentType,
}: {
  assignment: any;
  viewerOrganisationId?: string;
  departmentType: DepartmentType;
}): AssignmentPerspective {
  if (departmentType === "compliance") {
    return "compliance";
  }

  if (!viewerOrganisationId) {
    return departmentType === "manager" ? "manager" : departmentType;
  }

  if (assignment.managerOrganisationId === viewerOrganisationId) {
    return "manager";
  }

  if (assignment.carrierOrganisationId === viewerOrganisationId) {
    return "carrier";
  }

  if (
    assignment.organisationId === viewerOrganisationId ||
    assignment.assignedByOrganisationId === viewerOrganisationId
  ) {
    return "generator";
  }

  return departmentType === "manager" ? "manager" : departmentType;
}

function getWorkflowMessage({
  assignment,
  viewerPerspective,
}: {
  assignment: any;
  viewerPerspective: AssignmentPerspective;
}) {
  const managerAccepted = Boolean(assignment.managerAcceptedAt);
  const carrierAssigned = Boolean(assignment.carrierOrganisationId);

  if (assignment.status === "rejected") return "This assignment was rejected.";
  if (assignment.status === "cancelled")
    return "This assignment was cancelled.";
  if (assignment.status === "completed") return "This assignment is complete.";
  if (assignment.status === "in_progress") return "Collection is in progress.";
  if (assignment.status === "accepted")
    return "Carrier accepted. Ready for collection workflow.";

  if (assignment.status === "pending" && viewerPerspective === "manager") {
    if (!managerAccepted && !carrierAssigned) {
      return "This job is waiting for your manager response.";
    }

    if (managerAccepted && !carrierAssigned) {
      return "Manager accepted. A carrier now needs to be assigned.";
    }

    if (managerAccepted && carrierAssigned) {
      return "Carrier assigned. Waiting for carrier response.";
    }
  }

  if (assignment.status === "pending" && viewerPerspective === "carrier") {
    if (carrierAssigned) {
      return "This carrier job is waiting for your response.";
    }

    return "Waiting for manager to assign a carrier.";
  }

  if (assignment.status === "pending" && viewerPerspective === "generator") {
    if (!managerAccepted) {
      return "Waiting for the manager to accept or reject.";
    }

    if (managerAccepted && !carrierAssigned) {
      return "Manager accepted. Waiting for carrier assignment.";
    }

    return "Carrier assigned. Waiting for carrier response.";
  }

  return "Assignment is pending.";
}

export function AssignmentCard({
  assignment,
  departmentType,
  viewerOrganisationId,
}: {
  assignment: any;
  departmentType: DepartmentType;
  viewerOrganisationId?: string;
}) {
  const viewerPerspective = getViewerPerspective({
    assignment,
    viewerOrganisationId,
    departmentType,
  });

  const workflowMessage = getWorkflowMessage({
    assignment,
    viewerPerspective,
  });

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="font-semibold text-lg">
            {assignment.listingName ?? "Unnamed listing"}
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            {assignment.listingLocation ?? "Unknown location"}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-black px-3 py-1 text-xs font-medium capitalize text-white">
            Your role: {viewerPerspective}
          </span>

          <span
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusClass(
              assignment.status,
            )}`}
          >
            {formatStatus(assignment.status)}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-800">
        {workflowMessage}
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-gray-400">Generator</p>
          <p className="font-medium text-gray-800">
            {assignment.generatorOrgName ?? "Unknown"}
          </p>
        </div>

        <div>
          <p className="text-gray-400">Manager</p>
          <p className="font-medium text-gray-800">
            {assignment.managerOrgName ?? "Not assigned"}
          </p>
        </div>

        <div>
          <p className="text-gray-400">Carrier</p>
          <p className="font-medium text-gray-800">
            {assignment.carrierOrgName ?? "Not assigned yet"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-gray-400">Assigned</p>
          <p className="font-medium text-gray-800">
            {formatDate(assignment.assignedAt)}
          </p>
        </div>

        <div>
          <p className="text-gray-400">Manager Accepted</p>
          <p className="font-medium text-gray-800">
            {formatDate(assignment.managerAcceptedAt)}
          </p>
        </div>

        <div>
          <p className="text-gray-400">Carrier Assigned</p>
          <p className="font-medium text-gray-800">
            {formatDate(assignment.carrierAssignedAt)}
          </p>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 border-t pt-4">
        <Link
          href={`/home/operations/assignments/${assignment.id}`}
          className="text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          View assignment →
        </Link>

        <div className="w-full max-w-xs">
          <AssignmentActions
            assignmentId={assignment.id}
            status={assignment.status}
            departmentType={departmentType}
            perspective={viewerPerspective}
            variant="inline"
            managerAcceptedAt={assignment.managerAcceptedAt}
            carrierOrganisationId={assignment.carrierOrganisationId}
            viewerOrganisationId={viewerOrganisationId}
          />
        </div>
      </div>
    </div>
  );
}
