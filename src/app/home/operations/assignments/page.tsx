import { auth } from "@/auth";
import { database } from "@/db/database";
import { carrierAssignments } from "@/db/schema";
import { eq } from "drizzle-orm";

/* =========================================================
   PAGE
========================================================= */

export default async function AssignmentsPage() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return <div className="p-10">Unauthorized</div>;
  }

  const orgId = session.user.organisationId;

  const assignments = await database.query.carrierAssignments.findMany({
    where: eq(carrierAssignments.organisationId, orgId),
  });

  /* ===============================
     METRICS
  ============================== */

  const total = assignments.length;
  const pending = assignments.filter((a) => a.status === "pending").length;
  const active = assignments.filter((a) => a.status === "accepted").length;
  const completed = assignments.filter((a) => a.status === "completed").length;

  return (
    <div className="p-10 flex flex-col gap-10">
      {/* HEADER */}
      <div className="pl-[24vw]">
        <h1 className="text-2xl font-semibold">Assignments Overview</h1>
        <p className="text-sm text-gray-500">
          Manage and track all waste assignment operations
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
          {assignments
            .filter((a) => a.status === "accepted")
            .slice(0, 5)
            .map((a) => (
              <Item key={a.id} label={`Assignment #${a.id}`} />
            ))}
        </Section>

        <Section title="Pending Responses">
          {assignments
            .filter((a) => a.status === "pending")
            .slice(0, 5)
            .map((a) => (
              <Item key={a.id} label={`Assignment #${a.id}`} />
            ))}
        </Section>

        <Section title="Recently Completed">
          {assignments
            .filter((a) => a.status === "completed")
            .slice(0, 5)
            .map((a) => (
              <Item key={a.id} label={`Assignment #${a.id}`} />
            ))}
        </Section>

        <Section title="Issues / Incidents">
          <div className="text-sm text-gray-400">No incidents reported</div>
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

function Item({ label }: { label: string }) {
  return (
    <div className="text-sm text-gray-600 border-b border-gray-100 pb-2">
      {label}
    </div>
  );
}
