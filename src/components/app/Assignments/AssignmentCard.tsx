export function AssignmentCard({ assignment }: any) {
  return (
    <div className="border rounded-xl p-4 space-y-2">
      <div className="font-semibold">
        {assignment.listingName ??
          assignment.listing?.name ??
          "Unnamed listing"}
      </div>

      <div className="text-sm text-gray-500">
        Carrier:{" "}
        {assignment.carrierOrgName ?? assignment.carrierOrg?.name ?? "Unknown"}
      </div>

      <div className="text-xs text-gray-400">
        Assigned:{" "}
        {assignment.assignedAt
          ? new Date(assignment.assignedAt).toLocaleString()
          : "Unknown"}
      </div>

      <div className="text-sm font-medium capitalize">
        Status: {assignment.status}
      </div>
    </div>
  );
}
