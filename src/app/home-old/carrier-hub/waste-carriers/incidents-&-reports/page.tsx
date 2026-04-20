import { getCarrierIncidents, getCarrierActiveAssignments } from "./actions";
import IncidentModal from "@/components/app/CarrierHub/IncidentModal";

export default async function IncidentsAndReports() {
  const incidents = await getCarrierIncidents();
  const assignments = await getCarrierActiveAssignments();

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Incidents & Reports</h1>
        <IncidentModal assignments={assignments} />
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-lg font-medium mb-4">Your Submitted Incidents</h2>

        {incidents.length === 0 ? (
          <p className="text-gray-500">
            You haven’t submitted any incidents yet.
          </p>
        ) : (
          <div className="space-y-4">
            {incidents.map((incident) => (
              <div
                key={incident.id}
                className="border rounded-xl p-4 hover:bg-gray-50 transition"
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium capitalize">
                    {incident.type.replace("_", " ")}
                  </span>

                  <span
                    className={`text-sm px-3 py-1 rounded-full ${
                      incident.status === "open"
                        ? "bg-red-100 text-red-600"
                        : incident.status === "under_review"
                          ? "bg-yellow-100 text-yellow-600"
                          : incident.status === "resolved"
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {incident.status.replace("_", " ")}
                  </span>
                </div>

                {/* 🔥 ITEM CONTEXT */}
                <div className="mt-3 text-sm">
                  <p className="font-medium">{incident.listingName}</p>
                  <p className="text-gray-500">Location: {incident.location}</p>
                  <p className="text-gray-400 text-xs">
                    Assignment ID: {incident.assignmentId.slice(0, 8)}
                  </p>
                </div>

                <p className="text-sm text-gray-600 mt-3">{incident.summary}</p>

                <p className="text-xs text-gray-400 mt-3">
                  Submitted: {incident.createdAt?.toLocaleDateString() ?? "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
