import { auth } from "@/auth";
import { database } from "@/db/database";
import { incidents } from "@/db/schema";
import { eq } from "drizzle-orm";

/* =========================================================
   PAGE
========================================================= */

export default async function IncidentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return <div className="p-10">Unauthorized</div>;
  }

  const incidentId = params.id;

  /* =========================================================
     FETCH
  ========================================================= */

  const [incident] = await database
    .select()
    .from(incidents)
    .where(eq(incidents.id, incidentId));

  if (!incident) {
    return <div className="p-10">Incident not found</div>;
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="p-10 mt-32 flex flex-col gap-8">
      <div className="pl-[24vw] flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Incident Details</h1>

        <div className="border border-gray-200 rounded-xl p-6 flex flex-col gap-4">
          {/* TYPE */}
          <div>
            <p className="text-sm text-gray-500">Type</p>
            <p className="font-medium">{incident.type}</p>
          </div>

          {/* STATUS */}
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-medium">{incident.status}</p>
          </div>

          {/* SUMMARY */}
          <div>
            <p className="text-sm text-gray-500">Summary</p>
            <p className="text-gray-700">{incident.summary}</p>
          </div>

          {/* CORRECTIVE ACTION */}
          {incident.correctiveActions && (
            <div>
              <p className="text-sm text-gray-500">Corrective Actions</p>
              <p className="text-gray-700">{incident.correctiveActions}</p>
            </div>
          )}

          {/* TIMESTAMPS */}
          <div className="text-xs text-gray-400 mt-4">
            Created:{" "}
            {incident.createdAt
              ? new Date(incident.createdAt).toLocaleString()
              : "N/A"}
          </div>
        </div>
      </div>
    </div>
  );
}
