import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { getAssignmentsByDepartment } from "@/modules/assignments/queries/getAssignmentsByDepartment";
import { AssignmentCard } from "@/components/app/Assignments/AssignmentCard";

export default async function CompletedAssignmentsPage() {
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
    statusFilter: ["completed"],
  });

  return (
    <main className="pl-[24vw] mt-10 space-y-6 pr-10">
      <div>
        <h1 className="text-2xl font-bold">Completed Assignments</h1>
        <p className="text-sm text-gray-500 mt-1">
          Completed jobs for your {activeDepartment.name} department.
        </p>
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-sm text-gray-500">
          No completed assignments found.
        </div>
      ) : (
        <div className="grid gap-4">
          {assignments.map((assignment) => (
            <Link
              key={assignment.id}
              href={`/home/operations/assignments/${assignment.id}`}
            >
              <AssignmentCard assignment={assignment} />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
