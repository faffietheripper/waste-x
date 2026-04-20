import React from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { carrierAssignments, users } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import ManagerCompletionForm from "@/components/app/WasteCarriers/ManagerCompletionForm";

export default async function JobAssignments() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser?.organisationId) throw new Error("No organisation found");

  const assignments = await database.query.carrierAssignments.findMany({
    where: and(
      eq(carrierAssignments.assignedByOrganisationId, dbUser.organisationId),
      or(
        eq(carrierAssignments.status, "collected"),
        eq(carrierAssignments.status, "completed"),
      ),
    ),
    with: {
      listing: true,
      carrierOrganisation: true,
      incidents: true,
    },
    orderBy: (ca, { desc }) => [desc(ca.collectedAt)],
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Carrier Job Lifecycle</h1>

      {assignments.length === 0 && (
        <p className="text-gray-500">No carrier job activity yet.</p>
      )}

      {assignments.map((assignment) => {
        const isCompleted = assignment.status === "completed";

        const hadIncident = assignment.incidents?.length > 0;

        const hasOpenIncident = assignment.incidents?.some(
          (incident) =>
            incident.status === "open" || incident.status === "under_review",
        );

        const hasResolvedIncident = hadIncident && !hasOpenIncident;

        return (
          <div
            key={assignment.id}
            className={`p-6 border rounded-xl shadow-sm mb-6 ${
              hasOpenIncident
                ? "bg-red-50 border-red-300"
                : isCompleted
                  ? "bg-green-50 border-green-200"
                  : ""
            }`}
          >
            {/* ===== JOB DETAILS ===== */}
            <div className="mb-4 space-y-1">
              <div className="text-lg font-semibold">
                {assignment.listing?.name}
              </div>

              <div className="text-sm">
                <strong>Carrier:</strong>{" "}
                {assignment.carrierOrganisation?.teamName}
              </div>

              <div className="text-sm">
                <strong>Collected:</strong>{" "}
                {assignment.collectedAt?.toLocaleDateString()}
              </div>

              {assignment.completedAt && (
                <div className="text-sm">
                  <strong>Completed:</strong>{" "}
                  {assignment.completedAt.toLocaleDateString()}
                </div>
              )}

              <div className="text-sm">
                <strong>Status:</strong>{" "}
                <span
                  className={`px-2 py-1 rounded-md text-xs capitalize ${
                    hasOpenIncident
                      ? "bg-red-100 text-red-800"
                      : isCompleted
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {hasOpenIncident ? "incident open" : assignment.status}
                </span>
              </div>
            </div>

            {/* 🚨 INCIDENT WARNING */}
            {hasOpenIncident && (
              <div className="mb-4 text-sm font-medium text-red-700">
                ⚠️ An incident has been reported for this job. Completion is
                locked until it is resolved.
              </div>
            )}

            {/* ✅ Completion Form */}
            {!isCompleted && !hasOpenIncident && (
              <ManagerCompletionForm listingId={assignment.listingId} />
            )}

            {/* ✅ Completed Indicator */}
            {isCompleted && !hadIncident && (
              <div className="text-sm font-medium text-green-700">
                ✅ Transfer fully completed.
              </div>
            )}

            {/* 📄 Completed WITH Incident History */}
            {isCompleted && hasResolvedIncident && (
              <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-sm font-medium text-blue-800">
                  ⚠️ This job previously had an incident.
                </div>

                <Link
                  href={`/home/carrier-hub/carrier-manager/incident-management?assignmentId=${assignment.id}`}
                  className="inline-block mt-2 text-sm font-medium text-blue-600 hover:underline"
                >
                  View Incident Resolution Report →
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
