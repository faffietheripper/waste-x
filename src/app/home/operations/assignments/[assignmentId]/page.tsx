import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

import { getAssignmentById } from "@/modules/assignments/queries/getAssignmentById";

import AssignmentActions from "@/components/app/Assignments/AssignmentActions";
import VerificationPanel from "@/components/app/Assignments/VerificationPanel";
import AssignmentCompliancePanel from "@/components/app/Assignments/AssignmentCompliancePanel";
import AssignmentIncidentModal from "@/components/app/Assignments/AssignmentIncidentModal";

import { acceptAssignmentAction } from "@/modules/assignments/actions/acceptAssignmentAction";
import { rejectAssignmentAction } from "@/modules/assignments/actions/rejectAssignmentAction";
import { cancelAssignmentAction } from "@/modules/assignments/actions/cancelAssignmentAction";
import { markCollectedAction } from "@/modules/assignments/actions/markCollectedAction";
import { completeAssignmentAction } from "@/modules/assignments/actions/completeAssignmentAction";

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";
  return new Date(date).toLocaleString();
}

export default async function AssignmentDetailPage({
  params,
}: {
  params: { assignmentId: string };
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.activeDepartment) {
    redirect("/home/settings/departments");
  }

  const assignment = await getAssignmentById(params.assignmentId);

  if (!assignment) {
    notFound();
  }

  const departmentType = session.user.activeDepartment.type;

  return (
    <main className="pl-[24vw] py-32 px-12 space-y-8">
      {/* BACK */}
      <Link
        href="/home/operations/assignments/active"
        className="text-sm text-gray-500 hover:text-black"
      >
        ← Back to assignments
      </Link>

      {/* HEADER */}
      <div className="bg-white border rounded-2xl p-8 space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold">
              {assignment.listing?.name ?? "Assignment"}
            </h1>

            <p className="text-sm text-gray-500 mt-2">
              {assignment.listing?.location ?? "Unknown location"}
            </p>
          </div>

          <span className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium capitalize">
            {assignment.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-6 text-sm text-gray-600 pt-4">
          <div>
            <p className="text-gray-400">Generator</p>
            <p className="font-medium text-gray-900">
              {assignment.generatorOrg?.name ?? "Unknown"}
            </p>
          </div>

          <div>
            <p className="text-gray-400">Carrier</p>
            <p className="font-medium text-gray-900">
              {assignment.carrierOrg?.name ?? "Unknown"}
            </p>
          </div>

          <div>
            <p className="text-gray-400">Assignment Method</p>
            <p className="font-medium text-gray-900 capitalize">
              {assignment.assignmentMethod}
            </p>
          </div>

          <div>
            <p className="text-gray-400">Assigned At</p>
            <p className="font-medium text-gray-900">
              {formatDate(assignment.assignedAt)}
            </p>
          </div>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-6 gap-8">
        {/* LEFT */}
        <section className="col-span-4 space-y-8">
          {/* ASSIGNMENT INFO */}
          <div className="bg-white border rounded-2xl p-8 space-y-4">
            <h2 className="text-xl font-semibold">Assignment Details</h2>

            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-gray-400">Assignment ID</p>
                <p className="font-medium break-all">{assignment.id}</p>
              </div>

              <div>
                <p className="text-gray-400">Listing ID</p>
                <p className="font-medium">{assignment.listingId}</p>
              </div>

              <div>
                <p className="text-gray-400">Responded At</p>
                <p className="font-medium">
                  {formatDate(assignment.respondedAt)}
                </p>
              </div>

              <div>
                <p className="text-gray-400">Collected At</p>
                <p className="font-medium">
                  {formatDate(assignment.collectedAt)}
                </p>
              </div>

              <div>
                <p className="text-gray-400">Completed At</p>
                <p className="font-medium">
                  {formatDate(assignment.completedAt)}
                </p>
              </div>

              <div>
                <p className="text-gray-400">Verification Code</p>
                <p className="font-medium">
                  {departmentType === "compliance"
                    ? (assignment.verificationCode ?? "Not generated")
                    : "Protected"}
                </p>
              </div>
            </div>
          </div>

          {/* AUDIT TIMELINE */}
          <div className="bg-white border rounded-2xl p-8 space-y-4">
            <h2 className="text-xl font-semibold">Audit Trail</h2>

            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium">Assignment Created</p>
                <p className="text-gray-500">
                  {formatDate(assignment.assignedAt)}
                </p>
              </div>

              <div>
                <p className="font-medium">Carrier Response</p>
                <p className="text-gray-500">
                  {formatDate(assignment.respondedAt)}
                </p>
              </div>

              <div>
                <p className="font-medium">Waste Collected</p>
                <p className="text-gray-500">
                  {formatDate(assignment.collectedAt)}
                </p>
              </div>

              <div>
                <p className="font-medium">Assignment Completed</p>
                <p className="text-gray-500">
                  {formatDate(assignment.completedAt)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT */}
        <aside className="col-span-2 space-y-6">
          <AssignmentActions
            assignmentId={assignment.id}
            status={assignment.status}
            departmentType={departmentType}
          />

          {departmentType === "carrier" && assignment.status === "accepted" && (
            <VerificationPanel assignmentId={assignment.id} />
          )}

          {departmentType === "compliance" && (
            <AssignmentCompliancePanel assignment={assignment} />
          )}
          {departmentType === "carrier" &&
            ["accepted", "in_progress"].includes(assignment.status) && (
              <AssignmentIncidentModal
                assignment={{
                  assignmentId: assignment.id,
                  listingId: assignment.listingId,
                  listingName: assignment.listing?.name ?? "Assignment",
                  assignedAt: assignment.assignedAt,
                }}
                hasIncident={assignment.hasIncident}
              />
            )}
        </aside>
      </div>
    </main>
  );
}
