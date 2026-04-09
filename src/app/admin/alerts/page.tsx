import { database } from "@/db/database";
import { organisations, incidents, wasteListings } from "@/db/schema";

export default async function AlertsPage() {
  const orgs = await database.select().from(organisations);
  const incidentsData = await database.select().from(incidents);
  const listings = await database.select().from(wasteListings);

  const alerts = [];

  for (const org of orgs) {
    const orgIncidents = incidentsData.filter(
      (i) => i.organisationId === org.id,
    );

    const orgListings = listings.filter((l) => l.organisationId === org.id);

    if (orgIncidents.length >= 3) {
      alerts.push({
        type: "incident",
        message: `${org.teamName} has ${orgIncidents.length} incidents`,
      });
    }

    const stuckListings = orgListings.filter((l) => l.status === "assigned");

    if (stuckListings.length > 2) {
      alerts.push({
        type: "stuck",
        message: `${org.teamName} has stuck assignments`,
      });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">System Alerts</h1>

      <div className="bg-white border rounded-lg divide-y">
        {alerts.map((alert, i) => (
          <div key={i} className="p-4 text-sm text-red-600">
            ⚠️ {alert.message}
          </div>
        ))}

        {alerts.length === 0 && (
          <div className="p-4 text-sm text-gray-500">No active alerts</div>
        )}
      </div>
    </div>
  );
}
