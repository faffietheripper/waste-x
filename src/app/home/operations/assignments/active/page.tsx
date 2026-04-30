import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { getAssignmentsByDepartment } from "@/modules/assignments/queries/getAssignmentsByDepartment";
import { AssignmentCard } from "@/components/app/Assignments/AssignmentCard";

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

  const assignments = await getAssignmentsByDepartment({
    organisationId,
    departmentType: activeDepartment.type,
    statusFilter: ["assigned", "accepted", "in_progress"],
  });

  return (
    <div className="pl-[24vw] p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Active Assignments</h1>
        <p className="text-sm text-gray-500 mt-1">
          Showing pending, accepted and in-progress assignments for your{" "}
          {activeDepartment.name} department.
        </p>
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-sm text-gray-500">
          No active assignments found.
        </div>
      ) : (
        <div className="grid gap-4">
          {assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              departmentType={activeDepartment.type}
            />
          ))}
        </div>
      )}
    </div>
  );
}
