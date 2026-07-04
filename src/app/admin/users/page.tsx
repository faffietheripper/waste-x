// src/app/admin/users/page.tsx

import Link from "next/link";

import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import { getAllPlatformUsers, reactivateUser, suspendUser } from "./actions";

type AdminUsersSearchParams =
  | {
      search?: string;
    }
  | Promise<{
      search?: string;
    }>;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: AdminUsersSearchParams;
}) {
  await requirePlatformAdmin();

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = resolvedSearchParams.search?.trim() ?? "";

  const users = await getAllPlatformUsers(search);

  const totalUsers = users.length;

  const activeUsers = users.filter(
    (user) => user.isActive && !user.isSuspended,
  ).length;

  const suspendedUsers = users.filter((user) => user.isSuspended).length;

  const inactiveUsers = users.filter(
    (user) => !user.isActive && !user.isSuspended,
  ).length;

  const platformAdmins = users.filter(
    (user) => user.role === "platform_admin",
  ).length;

  const usersWithNoRecentLogin = users.filter(
    (user) => !user.lastLoginAt,
  ).length;

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Platform Access
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Platform Users
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Manage all users across organisations, review account status,
              monitor platform activity and suspend or reactivate access where
              needed.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/organisations"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Organisations
            </Link>

            <Link
              href="/admin/audit/live"
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Live activity
            </Link>
          </div>
        </div>
      </section>

      {/* ================= SUMMARY ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Total users"
          value={totalUsers}
          helper="Current result set"
        />

        <SummaryCard
          label="Active"
          value={activeUsers}
          helper="Can currently access Waste X"
        />

        <SummaryCard
          label="Inactive"
          value={inactiveUsers}
          helper="Not active but not suspended"
        />

        <SummaryCard
          label="Suspended"
          value={suspendedUsers}
          helper="Access restricted"
          tone={suspendedUsers > 0 ? "danger" : "default"}
        />

        <SummaryCard
          label="Platform admins"
          value={platformAdmins}
          helper="Platform-level access"
        />
      </section>

      {/* ================= SEARCH ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Search
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Find a platform user
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Search by name or email to investigate account activity, roles,
              organisation access and operational usage.
            </p>
          </div>
        </div>

        <form className="mt-6 flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Search by name or email..."
            className="min-h-[3rem] flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white"
          />

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-2xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Search
            </button>

            {search && (
              <Link
                href="/admin/users"
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Clear
              </Link>
            )}
          </div>
        </form>
      </section>

      {/* ================= USERS TABLE ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              User Register
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              All platform users
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Showing account status, organisation, activity counts and last
              login across the platform.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
              No login recorded
            </p>

            <p className="mt-1 text-sm font-bold text-gray-950">
              {usersWithNoRecentLogin}
            </p>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
            <p className="text-sm font-semibold text-gray-950">
              No users found.
            </p>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Try clearing the search term, or check whether users have been
              created yet.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>User</Th>
                    <Th>Organisation</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th>Listings</Th>
                    <Th>Bids</Th>
                    <Th>Last Login</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {users.map((user) => (
                    <tr key={user.id} className="transition hover:bg-gray-50">
                      <Td>
                        <div>
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="font-semibold text-gray-950 underline-offset-4 hover:underline"
                          >
                            {user.name || "Unnamed user"}
                          </Link>

                          <p className="mt-1 text-xs text-gray-500">
                            {user.email}
                          </p>
                        </div>
                      </Td>

                      <Td>
                        <span className="font-medium text-gray-700">
                          {user.organisationName ?? "—"}
                        </span>
                      </Td>

                      <Td>
                        <RoleBadge role={user.role} />
                      </Td>

                      <Td>
                        <UserStatusBadge
                          isActive={user.isActive}
                          isSuspended={user.isSuspended}
                        />
                      </Td>

                      <Td>{user.listingsCount}</Td>
                      <Td>{user.bidsCount}</Td>

                      <Td>
                        <span className="text-gray-600">
                          {formatDate(user.lastLoginAt)}
                        </span>
                      </Td>

                      <Td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                          >
                            View
                          </Link>

                          <Link
                            href={`/admin/audit/entity?entityId=${encodeURIComponent(
                              user.id,
                            )}`}
                            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                          >
                            Audit
                          </Link>

                          {user.isSuspended ? (
                            <form action={reactivateUser.bind(null, user.id)}>
                              <button
                                type="submit"
                                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                              >
                                Reactivate
                              </button>
                            </form>
                          ) : (
                            <form action={suspendUser.bind(null, user.id)}>
                              <button
                                type="submit"
                                className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                              >
                                Suspend
                              </button>
                            </form>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function SummaryCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: number | string;
  helper: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p
        className={`mt-3 text-3xl font-bold tracking-tight ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-4 align-middle text-sm text-gray-600">
      {children}
    </td>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "platform_admin" || role === "administrator";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
        isAdmin
          ? "border-gray-900 bg-gray-950 text-white"
          : "border-gray-200 bg-gray-50 text-gray-600"
      }`}
    >
      {formatLabel(role)}
    </span>
  );
}

function UserStatusBadge({
  isActive,
  isSuspended,
}: {
  isActive: boolean;
  isSuspended: boolean;
}) {
  if (isSuspended) {
    return (
      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
        Suspended
      </span>
    );
  }

  if (!isActive) {
    return (
      <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
        Inactive
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-gray-900 bg-gray-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
      Active
    </span>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatDate(date: Date | string | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(new Date(date));
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}