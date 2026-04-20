import { auth } from "@/auth";
import { database } from "@/db/database";
import { incidents } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

/* =========================================================
   PAGE
========================================================= */

export default async function IncidentsPage() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return <div className="p-10">Unauthorized</div>;
  }

  const orgId = session.user.organisationId;

  /* =========================================================
     FETCH
  ========================================================= */

  const allIncidents = await database
    .select()
    .from(incidents)
    .where(eq(incidents.reportedByOrganisationId, orgId));

  /* =========================================================
     SPLIT
  ========================================================= */

  const open = allIncidents.filter(
    (i: any) => i.status === "open" || i.status === "under_review",
  );

  const resolved = allIncidents.filter((i: any) => i.status === "resolved");

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="p-10 mt-32 flex flex-col gap-12">
      {/* HEADER */}
      <div className="pl-[24vw]">
        <h1 className="text-2xl font-semibold">Incident Management</h1>
        <p className="text-sm text-gray-500">
          Monitor, investigate, and resolve compliance incidents
        </p>
      </div>

      {/* ================= OPEN INCIDENTS ================= */}
      <div className="pl-[24vw] flex flex-col gap-6">
        <h2 className="text-lg font-semibold">Open Incidents</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {open.length === 0 && (
            <p className="text-sm text-gray-500">No open incidents.</p>
          )}

          {open.map((incident: any) => (
            <div
              key={incident.id}
              className="border border-red-200 bg-red-50 rounded-xl p-5 hover:shadow-md transition"
            >
              <h3 className="font-semibold">{incident.type}</h3>

              <p className="text-sm text-gray-600 mt-2">{incident.summary}</p>

              <div className="mt-3 text-xs text-red-600 font-medium">
                {incident.status}
              </div>

              <div className="mt-4">
                <Link
                  href={`/home/compliance/incidents/${incident.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View Incident →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================= RESOLVED INCIDENTS ================= */}
      <div className="pl-[24vw] flex flex-col gap-6">
        <h2 className="text-lg font-semibold">Resolved Incidents</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {resolved.length === 0 && (
            <p className="text-sm text-gray-500">No resolved incidents.</p>
          )}

          {resolved.map((incident: any) => (
            <Link
              key={incident.id}
              href={`/home/compliance/incidents/${incident.id}`}
              className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition block"
            >
              <h3 className="font-semibold">{incident.type}</h3>

              <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                {incident.summary}
              </p>

              <div className="mt-3 text-xs text-green-600 font-medium">
                Resolved
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
