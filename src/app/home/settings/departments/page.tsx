import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";

import { database } from "@/db/database";
import { departments, organisations, users } from "@/db/schema";

import {
  createDepartmentAction,
  setActiveDepartmentAction,
  assignMemberToDepartmentAction,
  deleteDepartmentAction,
  ensureRecommendedDepartmentsAction,
  clearMemberDepartmentAction,
} from "./actions";

/* =========================================================
   TYPES
========================================================= */

type DepartmentType = "generator" | "manager" | "carrier" | "compliance";

type Capability = "generator" | "carrier" | "manager";

type DepartmentRow = {
  id: string;
  organisationId: string;
  name: string;
  type: DepartmentType;
  createdAt: Date | null;
};

type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  departmentId: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatType(value: string | null | undefined) {
  if (!value) return "Unknown";

  switch (value) {
    case "generator":
      return "Generator";
    case "manager":
      return "Manager";
    case "carrier":
      return "Carrier / Logistics";
    case "compliance":
      return "Compliance";
    default:
      return value;
  }
}

function getTypeDescription(type: DepartmentType) {
  switch (type) {
    case "generator":
      return "Creates listings, assigns jobs and confirms completion.";

    case "manager":
      return "Accepts manager-assigned work, assigns carriers and receives waste.";

    case "carrier":
      return "Handles logistics, collection, verification and transport activity.";

    case "compliance":
      return "Reviews incidents, audit trails and compliance records.";

    default:
      return "Operational department.";
  }
}

function getTypeClass(type: DepartmentType) {
  switch (type) {
    case "generator":
      return "border-blue-300 bg-blue-100 text-blue-700";

    case "manager":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "carrier":
      return "border-green-300 bg-green-100 text-green-700";

    case "compliance":
      return "border-black bg-black text-orange-400";

    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

function getRecommendedTypes(capabilities: Capability[]) {
  const types = new Set<DepartmentType>();

  if (capabilities.includes("generator")) {
    types.add("generator");
  }

  if (capabilities.includes("manager")) {
    types.add("manager");
  }

  if (capabilities.includes("carrier")) {
    types.add("carrier");
  }

  types.add("compliance");

  return Array.from(types);
}

function getDepartmentMemberCount(departmentId: string, members: MemberRow[]) {
  return members.filter((member) => member.departmentId === departmentId)
    .length;
}

/* =========================================================
   PAGE
========================================================= */

export default async function DepartmentsSettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.organisationId) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const organisationId = session.user.organisationId;
  const activeDepartmentId = session.user.departmentId ?? null;

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, organisationId),
  });

  if (!organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const capabilities = (organisation.capabilities ?? []) as Capability[];

  const orgDepartments = (await database.query.departments.findMany({
    where: eq(departments.organisationId, organisationId),
    orderBy: desc(departments.createdAt),
  })) as DepartmentRow[];

  const members = (await database.query.users.findMany({
    where: eq(users.organisationId, organisationId),
    orderBy: desc(users.createdAt),
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      departmentId: true,
    },
  })) as MemberRow[];

  const recommendedTypes = getRecommendedTypes(capabilities);
  const existingTypes = new Set(orgDepartments.map((d) => d.type));
  const missingTypes = recommendedTypes.filter(
    (type) => !existingTypes.has(type),
  );

  const activeDepartment =
    orgDepartments.find((department) => department.id === activeDepartmentId) ??
    null;

  const unassignedMembers = members.filter((member) => !member.departmentId);

  const metrics = {
    totalDepartments: orgDepartments.length,
    totalMembers: members.length,
    unassignedMembers: unassignedMembers.length,
    missingRecommended: missingTypes.length,
  };

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
        <div className="flex items-start justify-between gap-8">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
              Waste X Departments
            </p>

            <h1 className="mt-3 text-3xl font-semibold">Department Settings</h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Configure department access for generator, manager, carrier and
              compliance workflows. Your active department controls which
              operational perspective you use across assignments, incidents and
              audit records.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
                Organisation: {organisation.teamName}
              </span>

              <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-xs font-medium text-orange-300">
                Active: {activeDepartment?.name ?? "Not selected"}
              </span>
            </div>
          </div>

          <form action={ensureRecommendedDepartmentsAction}>
            <button
              type="submit"
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Create Recommended
            </button>
          </form>
        </div>
      </section>

      {/* METRICS */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <MetricCard label="Departments" value={metrics.totalDepartments} />
        <MetricCard label="Members" value={metrics.totalMembers} />
        <MetricCard
          label="Unassigned"
          value={metrics.unassignedMembers}
          danger={metrics.unassignedMembers > 0}
        />
        <MetricCard
          label="Missing Recommended"
          value={metrics.missingRecommended}
          danger={metrics.missingRecommended > 0}
        />
      </section>

      {/* WORKFLOW NOTICE */}
      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
        <p className="text-sm font-semibold text-orange-800">
          Current Waste X workflow model
        </p>

        <p className="mt-2 text-sm leading-6 text-orange-700">
          Manager organisations now need their own department type. This lets a
          manager accept assigned listings, assign carriers, and receive waste
          without being forced into generator or carrier logic. A logistics team
          should usually be created as a <strong>Carrier / Logistics</strong>{" "}
          department.
        </p>
      </section>

      {/* MAIN GRID */}
      <section className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        {/* LEFT */}
        <aside className="space-y-6 xl:col-span-4">
          {/* CREATE */}
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              Create Department
            </p>

            <h2 className="mt-2 text-xl font-semibold text-black">
              Add workflow area
            </h2>

            <p className="mt-2 text-sm leading-6 text-black/45">
              Create a department for the operational role this team performs.
            </p>

            <form action={createDepartmentAction} className="mt-6 space-y-5">
              <div>
                <label className="text-sm font-semibold text-black">
                  Department Name
                </label>

                <input
                  required
                  name="name"
                  placeholder="e.g. Manager Operations"
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-black">
                  Department Type
                </label>

                <select
                  required
                  name="type"
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition focus:border-orange-500 focus:bg-white"
                >
                  <option value="generator">Generator</option>
                  <option value="manager">Manager</option>
                  <option value="carrier">Carrier / Logistics</option>
                  <option value="compliance">Compliance</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Create Department
              </button>
            </form>
          </div>

          {/* RECOMMENDED */}
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              Recommended Setup
            </p>

            <h2 className="mt-2 text-xl font-semibold text-black">
              Based on capabilities
            </h2>

            <p className="mt-2 text-sm leading-6 text-black/45">
              These departments are recommended from your organisation
              capabilities.
            </p>

            <div className="mt-6 space-y-3">
              {recommendedTypes.map((type) => {
                const exists = existingTypes.has(type);

                return (
                  <div
                    key={type}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-black">
                        {formatType(type)}
                      </p>
                      <p className="mt-1 text-xs text-black/40">
                        {exists ? "Created" : "Missing"}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        exists
                          ? "border-green-300 bg-green-100 text-green-700"
                          : "border-orange-300 bg-orange-100 text-orange-700"
                      }`}
                    >
                      {exists ? "Ready" : "Needed"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* RIGHT */}
        <section className="space-y-6 xl:col-span-8">
          {/* DEPARTMENTS */}
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Departments
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                Organisation Departments
              </h2>

              <p className="mt-2 text-sm leading-6 text-black/45">
                Choose your active department or manage department records.
              </p>
            </div>

            {orgDepartments.length === 0 ? (
              <EmptyState
                title="No departments yet"
                text="Create recommended departments to start routing users into the correct workflows."
              />
            ) : (
              <div className="grid grid-cols-1 gap-5">
                {orgDepartments.map((department) => {
                  const isActive = department.id === activeDepartmentId;
                  const memberCount = getDepartmentMemberCount(
                    department.id,
                    members,
                  );

                  return (
                    <DepartmentCard
                      key={department.id}
                      department={department}
                      isActive={isActive}
                      memberCount={memberCount}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* MEMBERS */}
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Members
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                Member Department Assignment
              </h2>

              <p className="mt-2 text-sm leading-6 text-black/45">
                Assign users to the correct department so their workflow
                perspective is accurate.
              </p>
            </div>

            {members.length === 0 ? (
              <EmptyState
                title="No members found"
                text="No members are currently attached to this organisation."
              />
            ) : (
              <div className="divide-y divide-black/5">
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    departments={orgDepartments}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

/* =========================================================
   DEPARTMENT CARD
========================================================= */

function DepartmentCard({
  department,
  isActive,
  memberCount,
}: {
  department: DepartmentRow;
  isActive: boolean;
  memberCount: number;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 ${
        isActive
          ? "border-orange-300 bg-orange-50"
          : "border-black/10 bg-[#fbfaf7]"
      }`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-black">
              {department.name}
            </h3>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getTypeClass(
                department.type,
              )}`}
            >
              {formatType(department.type)}
            </span>

            {isActive && (
              <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-orange-400">
                Active
              </span>
            )}
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
            {getTypeDescription(department.type)}
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-black/40">
            <span>
              {memberCount} member{memberCount === 1 ? "" : "s"}
            </span>
            <span>Created {formatDate(department.createdAt)}</span>
            <span className="font-mono">
              ID: {department.id.slice(0, 10)}...
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {!isActive && (
            <form action={setActiveDepartmentAction}>
              <input type="hidden" name="departmentId" value={department.id} />

              <button
                type="submit"
                className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Set Active
              </button>
            </form>
          )}

          <form action={deleteDepartmentAction}>
            <input type="hidden" name="departmentId" value={department.id} />

            <button
              type="submit"
              className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              Delete
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MEMBER ROW
========================================================= */

function MemberRow({
  member,
  departments,
}: {
  member: MemberRow;
  departments: DepartmentRow[];
}) {
  const currentDepartment = departments.find(
    (department) => department.id === member.departmentId,
  );

  return (
    <div className="grid grid-cols-12 items-center gap-4 py-5">
      <div className="col-span-12 md:col-span-4">
        <p className="font-semibold text-black">{member.name}</p>
        <p className="mt-1 text-sm text-black/45">{member.email}</p>
      </div>

      <div className="col-span-6 md:col-span-2">
        <span className="rounded-full border border-black/10 bg-[#fbfaf7] px-3 py-1 text-xs font-semibold capitalize text-black/55">
          {member.role}
        </span>
      </div>

      <div className="col-span-6 md:col-span-2">
        {currentDepartment ? (
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${getTypeClass(
              currentDepartment.type,
            )}`}
          >
            {currentDepartment.name}
          </span>
        ) : (
          <span className="rounded-full border border-orange-300 bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
            Unassigned
          </span>
        )}
      </div>

      <div className="col-span-12 md:col-span-4">
        <div className="flex flex-wrap gap-2 md:justify-end">
          <form action={assignMemberToDepartmentAction} className="flex gap-2">
            <input type="hidden" name="memberId" value={member.id} />

            <select
              name="departmentId"
              defaultValue={member.departmentId ?? ""}
              className="rounded-full border border-black/10 bg-[#fbfaf7] px-4 py-2 text-sm outline-none focus:border-orange-500"
            >
              <option value="" disabled>
                Select department
              </option>

              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
            >
              Save
            </button>
          </form>

          {member.departmentId && (
            <form action={clearMemberDepartmentAction}>
              <input type="hidden" name="memberId" value={member.id} />

              <button
                type="submit"
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/55 transition hover:bg-orange-100 hover:text-orange-700"
              >
                Clear
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function MetricCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 shadow-sm ${
        danger ? "border-orange-200 bg-orange-50" : "border-black/10 bg-white"
      }`}
    >
      <p
        className={`text-xs uppercase tracking-widest ${
          danger ? "text-orange-700" : "text-black/40"
        }`}
      >
        {label}
      </p>

      <p
        className={`mt-3 text-3xl font-semibold ${
          danger ? "text-orange-700" : "text-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-black/20 bg-[#fbfaf7] p-8 text-center">
      <p className="text-sm font-semibold text-black">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
        {text}
      </p>
    </div>
  );
}
