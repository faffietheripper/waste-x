import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { getAssignmentsByDepartment } from "@/modules/assignments/queries/getAssignmentsByDepartment";
import { AssignmentCard } from "@/components/app/Assignments/AssignmentCard";

/* =========================================================
   TYPES
========================================================= */

type DepartmentType = "generator" | "carrier" | "manager" | "compliance";

/* =========================================================
   PAGE
========================================================= */

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

  const departmentType = activeDepartment.type as DepartmentType;

  const assignments = await getAssignmentsByDepartment({
    organisationId,
    departmentType,
    statusFilter: ["completed"],
  });

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-36">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
              Waste X Assignments
            </p>

            <h1 className="mt-3 text-3xl font-semibold">
              Completed Assignments
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Review completed jobs for your active department. These records
              support chain-of-custody, verification history, incident review
              and compliance reporting.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <HeaderPill>Department: {activeDepartment.name}</HeaderPill>
              <HeaderPill>Type: {formatDepartmentType(departmentType)}</HeaderPill>
              <HeaderPill>Completed: {assignments.length}</HeaderPill>
            </div>
          </div>
        </section>

        {/* SUMMARY */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <MetricCard label="Completed Jobs" value={assignments.length} />

          <MetricCard
            label="Department"
            value={formatDepartmentType(departmentType)}
          />

          <MetricCard
            label="Workspace"
            value={activeDepartment.name || "Active Department"}
          />
        </section>

        {/* LIST */}
        {assignments.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-black/20 bg-white p-10 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              No Completed Work
            </p>

            <h2 className="mt-3 text-2xl font-semibold text-black">
              No completed assignments found
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-black/50">
              Completed assignments will appear here once jobs have moved
              through collection, receipt and final completion.
            </p>

            <Link
              href="/home/operations/assignments"
              className="mt-6 inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
            >
              Back to Assignments
            </Link>
          </section>
        ) : (
          <section className="grid gap-4">
            {assignments.map((assignment) => (
              <Link
                key={assignment.id}
                href={`/home/operations/assignments/${assignment.id}`}
                className="block transition hover:-translate-y-0.5"
              >
                <AssignmentCard
                  assignment={assignment}
                  departmentType={departmentType}
                  viewerOrganisationId={organisationId}
                />
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function HeaderPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/40">
        {label}
      </p>

      <p className="mt-3 text-2xl font-semibold text-black">{value}</p>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatDepartmentType(type: DepartmentType) {
  switch (type) {
    case "generator":
      return "Generator";

    case "carrier":
      return "Carrier / Logistics";

    case "manager":
      return "Manager";

    case "compliance":
      return "Compliance";

    default:
      return "Unknown";
  }
}