export function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    LISTING_CREATED: "bg-blue-100 text-blue-700",
    BID_PLACED: "bg-purple-100 text-purple-700",
    ASSIGNED: "bg-orange-100 text-orange-700",
    COLLECTED: "bg-green-100 text-green-700",
    COMPLETED: "bg-green-200 text-green-800",
    INCIDENT_REPORTED: "bg-red-100 text-red-700",
  };

  const labelMap: Record<string, string> = {
    LISTING_CREATED: "Created",
    BID_PLACED: "Bid",
    ASSIGNED: "Assigned",
    COLLECTED: "Collected",
    COMPLETED: "Completed",
    INCIDENT_REPORTED: "Incident",
  };

  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded ${
        styles[action] || "bg-gray-100 text-gray-700"
      }`}
    >
      {labelMap[action] || action}
    </span>
  );
}
