import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { departments, organisations, users } from "@/db/schema";

import {
  setActiveDepartmentAction,
  assignMemberToDepartmentAction,
  deleteDepartmentAction,
  ensureRecommendedDepartmentsAction,
  clearMemberDepartmentAction,
} from "./actions";

import CreateDepartmentForm from "./CreateDepartmentForm";

/* =========================================================
   FORM ACTION WRAPPERS
   Keeps React / Next form action typing clean.
========================================================= */

async function ensureRecommendedDepartmentsFormAction(_formData: FormData) {
  "use server";

  await ensureRecommendedDepartmentsAction();
}

async function setActiveDepartmentFormAction(formData: FormData) {
  "use server";

  await setActiveDepartmentAction(formData);
}

async function deleteDepartmentFormAction(formData: FormData) {
  "use server";

  await deleteDepartmentAction(formData);
}

async function assignMemberToDepartmentFormAction(formData: FormData) {
  "use server";

  await assignMemberToDepartmentAction(formData);
}

async function clearMemberDepartmentFormAction(formData: FormData) {
  "use server";

  await clearMemberDepartmentAction(formData);
}

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

type MemberRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  departmentId: string | null;
};

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_DEPARTMENT_TYPES = 4;

const ALL_DEPARTMENT_TYPES: DepartmentType[] = [
  "generator",
  "manager",
  "carrier",
  "compliance",
];

/* =========================================================
   HELPERS
========================================================= */

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";

  const parsed = new Date(date);

  if (!Number.isFinite(parsed.getTime())) {
    return "Not yet";
  }

  return parsed.toLocaleString("en-GB", {
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

function formatCapability(value: Capability) {
  switch (value) {
    case "generator":
      return "Generator";
    case "manager":
      return "Manager";
    case "carrier":
      return "Carrier";
    default:
      return value;
  }
}

function getTypeDescription(type: DepartmentType) {
  switch (type) {
    case "generator":
      return "Creates listings, assigns jobs and manages generator-side work.";

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

function getCapabilityClass(capability: Capability) {
  switch (capability) {
    case "generator":
      return "border-blue-300 bg-blue-100 text-blue-700";

    case "manager":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "carrier":
      return "border-green-300 bg-green-100 text-green-700";

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

  /*
    Compliance is always available because every organisation needs audit,
    incident review and oversight.
  */
  types.add("compliance");

  return Array.from(types);
}

function getUnavailableTypes(capabilities: Capability[]) {
  const recommendedTypes = getRecommendedTypes(capabilities);

  return ALL_DEPARTMENT_TYPES.filter(
    (type) => !recommendedTypes.includes(type),
  );
}

function getDepartmentMemberCount(
  departmentId: string,
  members: MemberRecord[],
) {
  return members.filter((member) => member.departmentId === departmentId)
    .length;
}

function getDuplicateDepartmentTypes(departmentRows: DepartmentRow[]) {
  const counts = departmentRows.reduce<Record<string, number>>(
    (acc, department) => {
      acc[department.type] = (acc[department.type] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([type]) => type as DepartmentType);
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

  const currentUser = await database.query.users.findFirst({
    where: and(
      eq(users.id, session.user.id),
      eq(users.organisationId, organisationId),
    ),
    columns: {
      id: true,
      role: true,
      name: true,
      email: true,
    },
  });

  const canManageDepartments = currentUser?.role === "administrator";

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
  })) as MemberRecord[];

  const recommendedTypes = getRecommendedTypes(capabilities);
  const unavailableTypes = getUnavailableTypes(capabilities);

  const existingTypes = new Set(
    orgDepartments.map((department) => department.type),
  );

  const missingTypes = recommendedTypes.filter(
    (type) => !existingTypes.has(type),
  );

  const duplicateTypes = getDuplicateDepartmentTypes(orgDepartments);

  const availableTypesToCreate = recommendedTypes.filter(
    (type) => !existingTypes.has(type),
  );

  const hasReachedDepartmentLimit =
    existingTypes.size >= MAX_DEPARTMENT_TYPES ||
    orgDepartments.length >= MAX_DEPARTMENT_TYPES;

  const canCreateAnotherDepartment =
    canManageDepartments &&
    availableTypesToCreate.length > 0 &&
    !hasReachedDepartmentLimit;

  const activeDepartment =
    orgDepartments.find((department) => department.id === activeDepartmentId) ??
    null;

  const unassignedMembers = members.filter((member) => !member.departmentId);

  const metrics = {
    totalDepartments: orgDepartments.length,
    uniqueDepartmentTypes: existingTypes.size,
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

            <h1 className="mt-3 text-3xl font-semibold">
              Department Settings
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Configure department access for the workflows your organisation is
              approved to use. Administrator access lets you manage available
              departments, but department options are still controlled by the
              organisation’s capabilities.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <HeaderPill>Organisation: {organisation.teamName}</HeaderPill>

              <HeaderPill>
                Active: {activeDepartment?.name ?? "Not selected"}
              </HeaderPill>

              <HeaderPill>
                Types: {existingTypes.size}/{MAX_DEPARTMENT_TYPES}
              </HeaderPill>

              <HeaderPill>
                Capabilities:{" "}
                {capabilities.length
                  ? capabilities.map(formatCapability).join(", ")
                  : "None configured"}
              </HeaderPill>

              <span
                className={`rounded-full border px-4 py-2 text-xs font-medium ${
                  canManageDepartments
                    ? "border-green-400/30 bg-green-500/10 text-green-300"
                    : "border-orange-400/30 bg-orange-500/10 text-orange-300"
                }`}
              >
                {canManageDepartments ? "Administrator Access" : "View Only"}
              </span>
            </div>
          </div>

          {canManageDepartments && missingTypes.length > 0 ? (
            <form action={ensureRecommendedDepartmentsFormAction}>
              <button
                type="submit"
                className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Create Recommended
              </button>
            </form>
          ) : canManageDepartments ? (
            <div className="rounded-2xl border border-green-400/20 bg-green-500/10 px-5 py-4 text-sm text-green-300">
              Recommended departments are already created.
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/60">
              Administrator role required for changes.
            </div>
          )}
        </div>
      </section>

      {/* METRICS */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-5">
        <MetricCard label="Departments" value={metrics.totalDepartments} />

        <MetricCard
          label="Unique Types"
          value={metrics.uniqueDepartmentTypes}
        />

        <MetricCard label="Members" value={metrics.totalMembers} />

        <MetricCard
          label="Unassigned"
          value={metrics.unassignedMembers}
          danger={metrics.unassignedMembers > 0}
        />

        <MetricCard
          label="Missing Available"
          value={metrics.missingRecommended}
          danger={metrics.missingRecommended > 0}
        />
      </section>

      {/* CAPABILITY EXPLANATION */}
      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <p className="text-sm font-semibold text-orange-800">
              Why some department types may not appear
            </p>

            <p className="mt-2 text-sm leading-6 text-orange-700">
              Department creation is based on your organisation capabilities.
              For example, a carrier-only organisation can create a{" "}
              <strong>Carrier / Logistics</strong> department and a{" "}
              <strong>Compliance</strong> department, but it will not see{" "}
              <strong>Generator</strong> or <strong>Manager</strong>{" "}
              departments unless those capabilities are added to the
              organisation.
            </p>

            <p className="mt-3 text-sm leading-6 text-orange-700">
              Your user role controls whether you can manage settings. Your
              organisation capabilities control which operational departments
              are available.
            </p>
          </div>

          <div className="rounded-2xl border border-orange-200 bg-white/60 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-orange-700">
              Current Capabilities
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {capabilities.length > 0 ? (
                capabilities.map((capability) => (
                  <span
                    key={capability}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${getCapabilityClass(
                      capability,
                    )}`}
                  >
                    {formatCapability(capability)}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                  No capabilities configured
                </span>
              )}

              <span className="rounded-full border border-black bg-black px-3 py-1 text-xs font-semibold text-orange-400">
                Compliance always available
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* UNAVAILABLE TYPES NOTICE */}
      {unavailableTypes.length > 0 && (
        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
            Capability-Locked Departments
          </p>

          <h2 className="mt-2 text-xl font-semibold text-black">
            Some department types are currently hidden
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
            These department types are not available because this organisation
            does not currently have the matching capability. An administrator
            can manage available departments, but cannot create departments for
            capabilities the organisation does not have.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {unavailableTypes.map((type) => (
              <span
                key={type}
                className="rounded-full border border-black/10 bg-[#fbfaf7] px-4 py-2 text-xs font-semibold text-black/45"
              >
                {formatType(type)} locked
              </span>
            ))}
          </div>
        </section>
      )}

      {/* DUPLICATE WARNING */}
      {duplicateTypes.length > 0 && (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm font-semibold text-red-800">
            Duplicate department types detected
          </p>

          <p className="mt-2 text-sm leading-6 text-red-700">
            This organisation has more than one department for the same type:{" "}
            <strong>{duplicateTypes.map(formatType).join(", ")}</strong>. The
            new rules prevent this going forward. Please move members away from
            duplicate departments and delete the extras.
          </p>
        </section>
      )}

      {/* VIEW ONLY NOTICE */}
      {!canManageDepartments && (
        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <p className="text-sm font-semibold text-orange-800">
            View-only access
          </p>

          <p className="mt-2 text-sm leading-6 text-orange-700">
            You can review departments and member assignments, but only an
            organisation administrator can create departments, delete
            departments, assign members or clear department assignments.
          </p>
        </section>
      )}

      {/* WORKFLOW NOTICE */}
      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
        <p className="text-sm font-semibold text-orange-800">
          Current Waste X workflow model
        </p>

        <p className="mt-2 text-sm leading-6 text-orange-700">
          A <strong>Generator</strong> department handles listing-side work, a{" "}
          <strong>Manager</strong> department handles waste receipt, a{" "}
          <strong>Carrier / Logistics</strong> department handles collection and
          verification, and a <strong>Compliance</strong> department handles
          review, incidents and audit.
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
              Add available workflow area
            </h2>

            <p className="mt-2 text-sm leading-6 text-black/45">
              The dropdown only shows department types that match your
              organisation capabilities and have not already been created.
            </p>

            {availableTypesToCreate.length === 0 && canManageDepartments && (
              <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-700">
                All department types currently available to this organisation
                have already been created.
              </div>
            )}

            {availableTypesToCreate.length > 0 && (
              <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-700">
                Available to create now:{" "}
                <strong>{availableTypesToCreate.map(formatType).join(", ")}</strong>
              </div>
            )}

            <CreateDepartmentForm
              canManageDepartments={canManageDepartments}
              canCreateAnotherDepartment={canCreateAnotherDepartment}
              availableTypesToCreate={availableTypesToCreate}
              hasReachedDepartmentLimit={hasReachedDepartmentLimit}
            />
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
              These are the department types Waste X recommends for your current
              organisation capabilities. Compliance is always recommended.
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
                        {exists ? "Created" : "Available to create"}
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
                Review department records and member counts. Member assignment
                options only include departments that already exist.
              </p>
            </div>

            {orgDepartments.length === 0 ? (
              <EmptyState
                title="No departments yet"
                text="Create the available recommended departments first. Once departments exist, members can be assigned to them."
              />
            ) : (
              <div className="grid grid-cols-1 gap-5">
                {orgDepartments.map((department) => {
                  const isActive = department.id === activeDepartmentId;

                  const memberCount = getDepartmentMemberCount(
                    department.id,
                    members,
                  );

                  const isDuplicateType = duplicateTypes.includes(
                    department.type,
                  );

                  return (
                    <DepartmentCard
                      key={department.id}
                      department={department}
                      isActive={isActive}
                      memberCount={memberCount}
                      canManageDepartments={canManageDepartments}
                      isDuplicateType={isDuplicateType}
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
                perspective is accurate. If a department is missing from the
                dropdown, it either has not been created yet or the organisation
                does not currently have the capability for it.
              </p>
            </div>

            {members.length === 0 ? (
              <EmptyState
                title="No members found"
                text="No members are currently attached to this organisation."
              />
            ) : orgDepartments.length === 0 ? (
              <EmptyState
                title="Create departments before assigning members"
                text="Members cannot be assigned until at least one department exists for this organisation."
              />
            ) : (
              <div className="divide-y divide-black/5">
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    departments={orgDepartments}
                    canManageDepartments={canManageDepartments}
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
  canManageDepartments,
  isDuplicateType,
}: {
  department: DepartmentRow;
  isActive: boolean;
  memberCount: number;
  canManageDepartments: boolean;
  isDuplicateType: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 ${
        isDuplicateType
          ? "border-red-300 bg-red-50"
          : isActive
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

            {isDuplicateType && (
              <span className="rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                Duplicate Type
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

        {canManageDepartments ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!isActive && (
              <form action={setActiveDepartmentFormAction}>
                <input type="hidden" name="departmentId" value={department.id} />

                <button
                  type="submit"
                  className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
                >
                  Set Active
                </button>
              </form>
            )}

            <form action={deleteDepartmentFormAction}>
              <input type="hidden" name="departmentId" value={department.id} />

              <button
                type="submit"
                className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                Delete
              </button>
            </form>
          </div>
        ) : (
          <span className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/40">
            View only
          </span>
        )}
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
  canManageDepartments,
}: {
  member: MemberRecord;
  departments: DepartmentRow[];
  canManageDepartments: boolean;
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
        {canManageDepartments ? (
          <div className="flex flex-wrap gap-2 md:justify-end">
            <form
              action={assignMemberToDepartmentFormAction}
              className="flex gap-2"
            >
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
              <form action={clearMemberDepartmentFormAction}>
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
        ) : (
          <p className="text-right text-sm text-black/35">
            Administrator role required to change member departments.
          </p>
        )}
      </div>
    </div>
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