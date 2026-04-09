import { database } from "@/db/database";
import {
  wasteListings,
  incidents,
  carrierAssignments,
  organisations,
} from "@/db/schema";

import { ExportButton } from "./ExportButton";

export default async function CompliancePage() {
  // 📊 BASE DATA
  const listings = await database.select().from(wasteListings);
  const allIncidents = await database.select().from(incidents);
  const assignments = await database.select().from(carrierAssignments);
  const orgs = await database.select().from(organisations);

  const totalListings = listings.length;

  const completedListings = listings.filter(
    (l) => l.status === "completed",
  ).length;

  const incompleteListings = listings.filter(
    (l) => l.status !== "completed" && l.status !== "cancelled",
  ).length;

  const unresolvedIncidents = allIncidents.filter(
    (i) => i.status !== "resolved",
  ).length;

  const verificationUsed = assignments.filter(
    (a) => a.codeUsedAt !== null,
  ).length;

  const verificationRate =
    assignments.length > 0
      ? Math.round((verificationUsed / assignments.length) * 100)
      : 0;

  const completionRate =
    totalListings > 0
      ? Math.round((completedListings / totalListings) * 100)
      : 0;

  // 🧠 TRUST + RISK ENGINE
  const orgStats = orgs.map((org) => {
    const orgListings = listings.filter((l) => l.organisationId === org.id);

    const orgIncidents = allIncidents.filter(
      (i) => i.organisationId === org.id,
    );

    const orgAssignments = assignments.filter(
      (a) => a.organisationId === org.id,
    );

    const completed = orgListings.filter(
      (l) => l.status === "completed",
    ).length;

    const completionRate =
      orgListings.length > 0 ? completed / orgListings.length : 0;

    const incidentRate =
      orgListings.length > 0 ? orgIncidents.length / orgListings.length : 0;

    const verificationRate =
      orgAssignments.length > 0
        ? orgAssignments.filter((a) => a.codeUsedAt !== null).length /
          orgAssignments.length
        : 0;

    // 🔥 TRUST SCORE
    const trustScore = Math.round(
      completionRate * 50 + (1 - incidentRate) * 30 + verificationRate * 20,
    );

    const riskScore = 100 - trustScore;

    return {
      id: org.id,
      name: org.teamName,
      trustScore,
      riskScore,
      incidents: orgIncidents.length,
      completionRate: Math.round(completionRate * 100),
    };
  });

  const highRiskOrgs = orgStats
    .filter((o) => o.riskScore > 60)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold">
          Compliance & Audit Intelligence
        </h1>
        <p className="text-sm text-gray-500">
          System-wide integrity, trust scoring, and regulatory visibility
        </p>
      </div>

      {/* CORE METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Chain Completion" value={`${completionRate}%`} />
        <Metric label="Incomplete Chains" value={incompleteListings} />
        <Metric label="Unresolved Incidents" value={unresolvedIncidents} />
        <Metric label="Verification Usage" value={`${verificationRate}%`} />
      </div>

      {/* TRUST SCORES */}
      <div>
        <h2 className="text-lg font-semibold mb-2">
          Organisation Trust Scores
        </h2>

        <div className="bg-white border rounded-lg divide-y">
          {orgStats.slice(0, 10).map((org) => (
            <div key={org.id} className="p-4 flex justify-between items-center">
              <div>
                <div className="text-sm font-medium">{org.name}</div>
                <div className="text-xs text-gray-500">
                  Completion: {org.completionRate}% • Incidents: {org.incidents}
                </div>
              </div>

              <div className="text-right">
                <div
                  className={`text-sm font-semibold ${
                    org.trustScore > 70
                      ? "text-green-600"
                      : org.trustScore > 40
                        ? "text-yellow-600"
                        : "text-red-600"
                  }`}
                >
                  {org.trustScore}
                </div>
                <div className="text-xs text-gray-400">Trust Score</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RISK ENGINE */}
      <div>
        <h2 className="text-lg font-semibold mb-2">High Risk Organisations</h2>

        <div className="bg-white border rounded-lg divide-y">
          {highRiskOrgs.map((org) => (
            <div key={org.id} className="p-4 flex justify-between items-center">
              <div>
                <div className="text-sm font-medium text-red-600">
                  {org.name}
                </div>
                <div className="text-xs text-gray-500">
                  Risk Score: {org.riskScore}
                </div>
              </div>

              <button className="text-xs bg-black text-white px-3 py-1 rounded">
                Investigate
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* EXPORT (UPDATED ✅) */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Audit Reports</h2>

        <div className="bg-white border rounded-lg p-4 flex justify-between items-center">
          <div>
            <div className="text-sm font-medium">
              Export Full Compliance Report
            </div>
            <div className="text-xs text-gray-500">
              Generate audit-ready documentation (PDF)
            </div>
          </div>

          <ExportButton />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
