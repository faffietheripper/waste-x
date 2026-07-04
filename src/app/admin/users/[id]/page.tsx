// src/app/admin/users/[id]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import { getPlatformUserById, reactivateUser, suspendUser } from "../actions";

type AdminUserDetailParams =
  | {
      id: string;
    }
  | Promise<{
      id: string;
    }>;

export default async function AdminUserDetailPage({
  params,
}: {
  params: AdminUserDetailParams;
}) {
  await requirePlatformAdmin();

  const resolvedParams = await params;
  const user = await getPlatformUserById(resolvedParams.id);

  if (!user) {
    notFound();
  }

  const accountStatus = user.isSuspended
    ? "Suspended"
    : user.isActive
      ? "Active"
      : "Inactive";

  const totalActivity =
    Number(user.listingsCount ?? 0) + Number(user.bidsCount ?? 0);

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              User Profile
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              {user.name || "Unnamed user"}
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/users"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              ← Users
            </Link>

            <Link
              href={`/admin/audit/entity?entityId=${encodeURIComponent(
                user.id,
              )}`}
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              View audit
            </Link>

            {user.isSuspended ? (
              <form action={reactivateUser.bind(null, user.id)}>
                <button
                  type="submit"
                  className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  Reactivate user
                </button>
              </form>
            ) : (
              <form action={suspendUser.bind(null, user.id)}>
                <button
                  type="submit"
                  className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Suspend user
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ================= STATUS CARDS ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Account status"
          value={accountStatus}
          helper="Current access state"
          tone={user.isSuspended ? "danger" : "default"}
        />

        <SummaryCard
          label="Role"
          value={formatLabel(user.role)}
          helper="Platform or organisation role"
        />

        <SummaryCard
          label="Total activity"
          value={totalActivity}
          helper="Listings plus bids"
        />

        <SummaryCard
          label="Last login"
          value={formatDate(user.lastLoginAt)}
          helper="Most recent platform access"
        />
      </section>

      {/* ================= MAIN CONTENT ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        {/* PROFILE */}
        <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="border-b border-gray-200 pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Profile
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              User information
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Account details, organisation relationship and platform access
              information for this user.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <DetailCard label="Name" value={user.name || "Unnamed user"} />
            <DetailCard label="Email" value={user.email} />
            <DetailCard
              label="Organisation"
              value={user.organisationName ?? "—"}
            />
            <DetailCard label="Role" value={formatLabel(user.role)} />
            <DetailCard label="Status" value={accountStatus} />
            <DetailCard label="Joined" value={formatDate(user.createdAt)} />
            <DetailCard
              label="Last login"
              value={formatDate(user.lastLoginAt)}
            />
            <DetailCard label="User ID" value={user.id} />
          </div>
        </section>

        {/* ACCESS PANEL */}
        <aside className="space-y-6">
          <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Access Control
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Account controls
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Suspend or reactivate this user’s access. Suspended users should
              not be able to continue operational actions.
            </p>

            <div className="mt-5">
              <UserStatusBadge
                isActive={user.isActive}
                isSuspended={user.isSuspended}
              />
            </div>

            <div className="mt-6">
              {user.isSuspended ? (
                <form action={reactivateUser.bind(null, user.id)}>
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
                  >
                    Reactivate user
                  </button>
                </form>
              ) : (
                <form action={suspendUser.bind(null, user.id)}>
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    Suspend user
                  </button>
                </form>
              )}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Investigation
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Audit links
            </h2>

            <div className="mt-5 space-y-3">
              <Link
                href={`/admin/audit/entity?entityId=${encodeURIComponent(
                  user.id,
                )}`}
                className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
              >
                Open entity audit →
              </Link>

              <Link
                href="/admin/audit/live"
                className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
              >
                Open live activity →
              </Link>

              <Link
                href="/admin/organisations"
                className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
              >
                View organisations →
              </Link>
            </div>
          </section>
        </aside>
      </section>

      {/* ================= ACTIVITY ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="border-b border-gray-200 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Activity
          </p>

          <h2 className="mt-2 text-lg font-bold text-gray-950">
            User activity summary
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Quick view of user contribution across listings and bids.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ActivityCard
            label="Listings created"
            value={user.listingsCount}
            helper="Waste listings created by this user"
          />

          <ActivityCard
            label="Bids placed"
            value={user.bidsCount}
            helper="Marketplace bids submitted"
          />

          <ActivityCard
            label="Total activity"
            value={totalActivity}
            helper="Listings plus bids"
          />
        </div>
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
        className={`mt-3 truncate text-2xl font-bold tracking-tight ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-semibold text-gray-950">
        {value}
      </p>
    </div>
  );
}

function ActivityCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <p className="text-sm text-gray-500">{label}</p>

      <p className="mt-2 text-2xl font-bold text-gray-950">{value}</p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
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