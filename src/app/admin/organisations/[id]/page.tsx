import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getOrganisationById } from "../actions";
import { ExportOrgButton } from "./ExportButton";

import { database } from "@/db/database";
import {
  wasteListings,
  incidents,
  carrierAssignments,
  auditEvents,
  users,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function AdminOrganisationPage({
  params,
}: {
  params: { id: string };
}) {
  await requirePlatformAdmin();

  const orgId = params.id;

  const org = await getOrganisationById(orgId);
  if (!org) return <div>Organisation not found.</div>;

  // =========================
  // 📊 INTELLIGENCE DATA
  // =========================

  const listings = await database.select().from(wasteListings);
  const allIncidents = await database.select().from(incidents);
  const assignments = await database.select().from(carrierAssignments);

  const orgListings = listings.filter((l) => l.organisationId === orgId);
  const orgIncidents = allIncidents.filter((i) => i.organisationId === orgId);
  const orgAssignments = assignments.filter((a) => a.organisationId === orgId);

  const completed = orgListings.filter((l) => l.status === "completed").length;

  const completionRate =
    orgListings.length > 0 ? completed / orgListings.length : 0;

  const incidentRate =
    orgListings.length > 0 ? orgIncidents.length / orgListings.length : 0;

  const verificationRate =
    orgAssignments.length > 0
      ? orgAssignments.filter((a) => a.codeUsedAt !== null).length /
        orgAssignments.length
      : 0;

  const trustScore = Math.round(
    completionRate * 50 + (1 - incidentRate) * 30 + verificationRate * 20,
  );

  const riskScore = 100 - trustScore;

  // =========================
  // 🕵️ ACTIVITY
  // =========================

  const activity = await database
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      createdAt: auditEvents.createdAt,
      userName: users.name,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.userId, users.id))
    .where(eq(auditEvents.organisationId, orgId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(20);

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{org.teamName}</h1>
          <p className="text-sm text-gray-500">{org.industry}</p>
        </div>
        <div className="flex space-x-8">
          <div className="text-right">
            <div
              className={`text-xl font-bold ${
                trustScore > 70
                  ? "text-green-600"
                  : trustScore > 40
                    ? "text-yellow-600"
                    : "text-red-600"
              }`}
            >
              {trustScore}
            </div>
            <div className="text-xs text-gray-500">Trust Score</div>
          </div>
          <ExportOrgButton orgId={orgId} />{" "}
        </div>
      </div>

      {/* METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Risk Score" value={riskScore} />
        <Metric
          label="Completion Rate"
          value={`${Math.round(completionRate * 100)}%`}
        />
        <Metric label="Incidents" value={orgIncidents.length} />
        <Metric label="Listings" value={orgListings.length} />
      </div>

      {/* DETAILS + FLAGS */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* DETAILS */}
        <div className="bg-white p-6 rounded-lg border space-y-3 text-sm">
          <h2 className="font-semibold mb-2">Organisation Details</h2>

          <DetailRow label="Email" value={org.email} />
          <DetailRow label="Telephone" value={org.telephone} />
          <DetailRow
            label="Address"
            value={`${org.streetAddress}, ${org.city}`}
          />
          <DetailRow label="Country" value={org.country} />
          <DetailRow label="Members" value={org.memberCount} />
          <DetailRow label="Joined" value={formatDate(org.createdAt)} />
        </div>

        {/* RISK FLAGS */}
        <div className="bg-white p-6 rounded-lg border space-y-3 text-sm">
          <h2 className="font-semibold mb-2">Risk Flags</h2>

          {riskScore > 60 && (
            <div className="text-red-600">⚠️ High Risk Organisation</div>
          )}
          {orgIncidents.length > 3 && (
            <div className="text-red-600">⚠️ Multiple Incidents</div>
          )}
          {completionRate < 0.5 && (
            <div className="text-yellow-600">⚠️ Low Completion Rate</div>
          )}
          {verificationRate < 0.5 && (
            <div className="text-yellow-600">⚠️ Low Verification Usage</div>
          )}

          {riskScore <= 40 && (
            <div className="text-green-600">✅ Healthy Organisation</div>
          )}
        </div>
      </div>

      {/* ACTIVITY */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Recent Activity</h2>

        <div className="bg-white border rounded-lg divide-y">
          {activity.map((a) => (
            <div key={a.id} className="p-4 text-sm">
              <div className="font-medium">{a.action}</div>
              <div className="text-xs text-gray-500">
                {a.userName || "System"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =========================
// 🧩 COMPONENTS
// =========================

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between border-b pb-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}

function formatDate(date: Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString();
}
