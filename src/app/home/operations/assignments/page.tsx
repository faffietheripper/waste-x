import { auth } from "@/auth";
import { database } from "@/db/database";
import { carrierAssignments } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";
import Link from "next/link";

/* =========================================================
   PAGE
========================================================= */

export default async function AssignmentsPage() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return <div className="p-10">Unauthorized</div>;
  }

  const orgId = session.user.organisationId;

  /*
    Supports both internal and external assignments.

    organisationId:
    - original / owning organisation assignment context

    carrierOrganisationId:
    - external or internal carrier organisation assigned to the job

    assignedByOrganisationId:
    - organisation that created/assigned the job
  */
  const assignments = await database.query.carrierAssignments.findMany({
    where: or(
      eq(carrierAssignments.organisationId, orgId),
      eq(carrierAssignments.carrierOrganisationId, orgId),
      eq(carrierAssignments.assignedByOrganisationId, orgId),
    ),
    orderBy: desc(carrierAssignments.assignedAt),
  });

  /* ===============================
     METRICS
  ============================== */

  const total = assignments.length;

  const pending = assignments.filter((a) => a.status === "pending").length;

  const active = assignments.filter((a) =>
    ["accepted", "in_progress"].includes(a.status),
  ).length;

  const completed = assignments.filter((a) => a.status === "completed").length;

  const activeAssignments = assignments.filter((a) =>
    ["accepted", "in_progress"].includes(a.status),
  );

  const pendingAssignments = assignments.filter((a) => a.status === "pending");

  const completedAssignments = assignments.filter(
    (a) => a.status === "completed",
  );

  return (
    <div className="p-10 flex flex-col gap-10">
      {/* HEADER */}
      <div className="pl-[24vw]">
        <h1 className="text-2xl font-semibold">Assignments Overview</h1>
        <p className="text-sm text-gray-500">
          Manage and track all internal and external waste assignment operations
        </p>
      </div>

      {/* METRIC CARDS */}
      <div className="pl-[24vw] grid grid-cols-4 gap-6">
        <Card title="Total" value={total} />
        <Card title="Pending" value={pending} />
        <Card title="Active" value={active} />
        <Card title="Completed" value={completed} />
      </div>

      {/* GRID SECTIONS */}
      <div className="pl-[24vw] grid grid-cols-2 gap-6">
        <Section title="Active Assignments">
          {activeAssignments.length > 0 ? (
            activeAssignments
              .slice(0, 5)
              .map((a) => (
                <Item
                  key={a.id}
                  href={`/home/operations/assignments/${a.id}`}
                  label={`Assignment #${a.id}`}
                />
              ))
          ) : (
            <Empty text="No active assignments" />
          )}
        </Section>

        <Section title="Pending Responses">
          {pendingAssignments.length > 0 ? (
            pendingAssignments
              .slice(0, 5)
              .map((a) => (
                <Item
                  key={a.id}
                  href={`/home/operations/assignments/${a.id}`}
                  label={`Assignment #${a.id}`}
                />
              ))
          ) : (
            <Empty text="No pending responses" />
          )}
        </Section>

        <Section title="Recently Completed">
          {completedAssignments.length > 0 ? (
            completedAssignments
              .slice(0, 5)
              .map((a) => (
                <Item
                  key={a.id}
                  href={`/home/operations/assignments/${a.id}`}
                  label={`Assignment #${a.id}`}
                />
              ))
          ) : (
            <Empty text="No completed assignments" />
          )}
        </Section>

        <Section title="Issues / Incidents">
          <div className="text-sm text-gray-400">
            Incident summary coming soon
          </div>
        </Section>
      </div>
    </div>
  );
}

/* =========================================================
   UI COMPONENTS
========================================================= */

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <h2 className="text-2xl font-semibold">{value}</h2>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {children}
    </div>
  );
}

function Item({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="text-sm text-gray-600 border-b border-gray-100 pb-2 hover:text-orange-600 transition"
    >
      {label}
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-gray-400">{text}</div>;
}
