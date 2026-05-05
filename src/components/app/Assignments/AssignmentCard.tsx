import Link from "next/link";
import AssignmentActions from "@/components/app/Assignments/AssignmentActions";

type DepartmentType = "generator" | "carrier" | "compliance";

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Unknown";

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
    case "carrier_pending":
      return "bg-yellow-100 text-yellow-700";
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

function getViewerRole(assignment: any, viewerOrganisationId?: string) {
  if (!viewerOrganisationId) return null;

  if (assignment.managerOrganisationId === viewerOrganisationId) {
    return "Manager";
  }

  if (assignment.carrierOrganisationId === viewerOrganisationId) {
    return "Carrier";
  }

  if (
    assignment.organisationId === viewerOrganisationId ||
    assignment.assignedByOrganisationId === viewerOrganisationId
  ) {
    return "Generator";
  }

  return null;
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
  const viewerRole = getViewerRole(assignment, viewerOrganisationId);

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
          {viewerRole && (
            <span className="rounded-full bg-black text-white px-3 py-1 text-xs font-medium">
              Your role: {viewerRole}
            </span>
          )}

          <span
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusClass(
              assignment.status,
            )}`}
          >
            {assignment.status.replace("_", " ")}
          </span>
        </div>
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
            variant="inline"
          />
        </div>
      </div>
    </div>
  );
}
