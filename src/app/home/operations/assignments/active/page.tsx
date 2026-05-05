import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { getAssignmentsByDepartment } from "@/modules/assignments/queries/getAssignmentsByDepartment";
import { AssignmentCard } from "@/components/app/Assignments/AssignmentCard";

/* =========================================================
   TYPES
========================================================= */

type DepartmentType = "generator" | "carrier" | "manager" | "compliance";

/* =========================================================
   PAGE
========================================================= */

export default async function ActiveAssignmentsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const organisationId = session.user.organisationId;
  const activeDepartment = session.user.activeDepartment;

  if (!organisationId) {
    redirect("/home");
  }

  if (!activeDepartment) {
    redirect("/home/settings/departments");
  }

  const departmentType = activeDepartment.type as DepartmentType;

  /* =========================================================
     FETCH ASSIGNMENTS

     Current workflow:
     - listing.status controls listing lifecycle
     - assignment.status controls carrier-side operational state
     - manager visibility comes from department.type === "manager"
     - manager acceptance comes from managerAcceptedAt

     status meanings:
     - pending:
       manager needs to respond OR carrier needs to respond,
       depending on managerAcceptedAt/carrierOrganisationId

     - accepted:
       carrier accepted, ready for collection verification

     - in_progress:
       carrier collected/verified, manager needs to receive waste

     completed jobs should live on the completed page.
  ========================================================= */

  const assignments = await getAssignmentsByDepartment({
    organisationId,
    departmentType,
    statusFilter: ["pending", "accepted", "in_progress"],
  });

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-8 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
            Waste X Operations
          </p>

          <h1 className="mt-3 text-3xl font-semibold">Active Assignments</h1>

          <p className="mt-3 max-w-3xl text-sm text-white/55">
            Showing active operational assignments for your{" "}
            {activeDepartment.name} department.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
              Department: {activeDepartment.name}
            </span>

            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium capitalize text-white/70">
              Type: {departmentType}
            </span>

            {departmentType === "manager" && (
              <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-xs font-medium text-orange-300">
                Manager workflow enabled
              </span>
            )}

            {departmentType === "carrier" && (
              <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-200">
                Carrier response workflow
              </span>
            )}

            {departmentType === "compliance" && (
              <span className="rounded-full border border-green-400/30 bg-green-500/10 px-4 py-2 text-xs font-medium text-green-200">
                Compliance visibility
              </span>
            )}
          </div>
        </section>

        {/* CONTENT */}
        {assignments.length === 0 ? (
          <section className="rounded-3xl border border-black/10 bg-white p-8 text-sm text-black/50 shadow-sm">
            No active assignments found for this department.
          </section>
        ) : (
          <section className="grid gap-4">
            {assignments.map((assignment) => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                departmentType={departmentType}
                viewerOrganisationId={organisationId}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
