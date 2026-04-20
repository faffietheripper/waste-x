import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { incidents, carrierAssignments, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import IncidentResolutionForm from "@/components/app/CarrierHub/IncidentResolutionForm";

export default async function IncidentManagement() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser?.organisationId) throw new Error("No organisation found");

  const organisationId = dbUser.organisationId;

  // Fetch incidents linked to assignments created by this organisation
  const organisationIncidents = await database.query.incidents.findMany({
    with: {
      assignment: {
        with: {
          listing: true, // ✅ Correct relation
          carrierOrganisation: true,
        },
      },
      reportedByUser: true,
      reportedByOrganisation: true,
    },
    where: (inc, { exists }) =>
      exists(
        database
          .select()
          .from(carrierAssignments)
          .where(
            and(
              eq(carrierAssignments.id, inc.assignmentId),
              eq(carrierAssignments.assignedByOrganisationId, organisationId),
            ),
          ),
      ),
    orderBy: (inc, { desc }) => [desc(inc.createdAt)],
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Incident Management</h1>

      {organisationIncidents.length === 0 && (
        <p className="text-gray-500">
          No incidents linked to your assigned jobs.
        </p>
      )}

      {organisationIncidents.map((incident) => {
        const isResolved = incident.status === "resolved";

        return (
          <div
            key={incident.id}
            className={`p-6 border rounded-xl shadow-sm mb-6 ${
              isResolved
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            {/* ================= JOB DETAILS ================= */}
            <div className="mb-4 space-y-1">
              <div className="text-lg font-semibold">
                {incident.assignment?.listing?.name}
              </div>

              <div className="text-sm">
                <strong>Carrier:</strong>{" "}
                {incident.assignment?.carrierOrganisation?.teamName}
              </div>

              <div className="text-sm">
                <strong>Reported By:</strong>{" "}
                {incident.reportedByOrganisation?.teamName}
              </div>

              <div className="text-sm">
                <strong>Type:</strong> {incident.type}
              </div>

              <div className="text-sm">
                <strong>Status:</strong>{" "}
                <span className="capitalize font-medium">
                  {incident.status}
                </span>
              </div>

              <div className="text-sm">
                <strong>Reported:</strong>{" "}
                {incident.createdAt?.toLocaleDateString()}
              </div>
            </div>

            {/* ================= INCIDENT DETAILS ================= */}
            <div className="mb-4 text-sm">
              <strong>Summary:</strong> {incident.summary}
            </div>

            {incident.immediateAction && (
              <div className="mb-2 text-sm">
                <strong>Immediate Action:</strong> {incident.immediateAction}
              </div>
            )}

            {incident.investigationFindings && (
              <div className="mb-2 text-sm">
                <strong>Investigation Findings:</strong>{" "}
                {incident.investigationFindings}
              </div>
            )}

            {incident.preventativeMeasures && (
              <div className="mb-2 text-sm">
                <strong>Preventative Measures:</strong>{" "}
                {incident.preventativeMeasures}
              </div>
            )}

            {incident.complianceReview && (
              <div className="mb-2 text-sm">
                <strong>Compliance Review:</strong> {incident.complianceReview}
              </div>
            )}

            {/* ================= RESOLUTION SECTION ================= */}
            {!isResolved && (
              <IncidentResolutionForm
                incidentId={incident.id}
                assignmentId={incident.assignmentId}
              />
            )}

            {isResolved && (
              <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg">
                <div className="text-sm font-semibold text-green-800">
                  ✅ Incident Resolved
                </div>

                <div className="mt-2 text-sm">
                  <strong>Corrective Actions:</strong>
                  <p className="mt-1 text-gray-700">
                    {incident.correctiveActions}
                  </p>
                </div>

                {incident.dateClosed && (
                  <div className="mt-2 text-xs text-gray-600">
                    Closed on {incident.dateClosed.toLocaleDateString()}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
