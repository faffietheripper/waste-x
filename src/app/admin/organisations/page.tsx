// src/app/admin/organisations/page.tsx

import Link from "next/link";

import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import {
  approveOrganisation,
  getAllOrganisations,
  rejectOrganisation,
} from "./actions";
import { ApproveButton, RejectButton } from "./ActionButton";

type AdminOrganisationsSearchParams =
  | {
      search?: string;
    }
  | Promise<{
      search?: string;
    }>;

export default async function AdminOrganisationsPage({
  searchParams,
}: {
  searchParams?: AdminOrganisationsSearchParams;
}) {
  await requirePlatformAdmin();

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = resolvedSearchParams.search?.trim() ?? "";

  const organisations = await getAllOrganisations(search);

  const totalOrganisations = organisations.length;

  const pendingOrganisations = organisations.filter(
    (org) => org.status === "PENDING",
  ).length;

  const activeOrganisations = organisations.filter(
    (org) => org.status === "ACTIVE",
  ).length;

  const rejectedOrganisations = organisations.filter(
    (org) => org.status === "REJECTED",
  ).length;

  const totalMembers = organisations.reduce(
    (total, org) => total + Number(org.memberCount ?? 0),
    0,
  );

  const totalListings = organisations.reduce(
    (total, org) => total + Number(org.listingsCount ?? 0),
    0,
  );

  const totalCarrierJobs = organisations.reduce(
    (total, org) => total + Number(org.carrierJobsCount ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Platform Network
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Organisations
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Review organisation onboarding, approve or reject pending
              companies, and monitor platform usage across members, listings,
              carrier jobs and reputation signals.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/users"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Users
            </Link>

            <Link
              href="/admin/audit/compliance"
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Compliance view
            </Link>
          </div>
        </div>
      </section>

      {/* ================= SUMMARY ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Organisations"
          value={totalOrganisations}
          helper="Current result set"
        />

        <SummaryCard
          label="Active"
          value={activeOrganisations}
          helper="Approved organisations"
        />

        <SummaryCard
          label="Pending"
          value={pendingOrganisations}
          helper="Awaiting platform approval"
          tone={pendingOrganisations > 0 ? "warning" : "default"}
        />

        <SummaryCard
          label="Rejected"
          value={rejectedOrganisations}
          helper="Rejected applications"
          tone={rejectedOrganisations > 0 ? "danger" : "default"}
        />

        <SummaryCard
          label="Members"
          value={totalMembers}
          helper="Users across organisations"
        />
      </section>

      {/* ================= PLATFORM SIGNALS ================= */}
      <section className="grid gap-5 md:grid-cols-3">
        <Metric
          label="Total listings"
          value={totalListings}
          helper="Waste listings created by organisations"
        />

        <Metric
          label="Carrier jobs"
          value={totalCarrierJobs}
          helper="Carrier assignment activity"
        />

        <Metric
          label="Network activation"
          value={`${calculateRate(activeOrganisations, totalOrganisations)}%`}
          helper="Active organisations / total organisations"
        />
      </section>

      {/* ================= SEARCH ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Search
          </p>

          <h2 className="mt-2 text-lg font-bold text-gray-950">
            Find an organisation
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Search by organisation name or email to review onboarding status,
            members, activity and approval actions.
          </p>
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
                href="/admin/organisations"
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Clear
              </Link>
            )}
          </div>
        </form>
      </section>

      {/* ================= TABLE ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Organisation Register
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Platform-wide organisation management
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Review company details, approval status, activity and moderation
              actions.
            </p>
          </div>

          {pendingOrganisations > 0 && (
            <span className="rounded-full border border-gray-300 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-800">
              {pendingOrganisations} pending approval
            </span>
          )}
        </div>

        {organisations.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
            <p className="text-sm font-semibold text-gray-950">
              No organisations found.
            </p>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Try clearing the search term, or wait for new organisation
              applications to appear.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Organisation</Th>
                    <Th>Industry</Th>
                    <Th>Status</Th>
                    <Th>Members</Th>
                    <Th>Listings</Th>
                    <Th>Carrier Jobs</Th>
                    <Th>Avg Rating</Th>
                    <Th>Joined</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {organisations.map((org) => (
                    <tr key={org.id} className="transition hover:bg-gray-50">
                      <Td>
                        <div>
                          <Link
                            href={`/admin/organisations/${org.id}`}
                            className="font-semibold text-gray-950 underline-offset-4 hover:underline"
                          >
                            {org.teamName}
                          </Link>

                          <p className="mt-1 text-xs text-gray-500">
                            {org.email ?? "No email recorded"}
                          </p>
                        </div>
                      </Td>

                      <Td>{org.industry ?? "—"}</Td>

                      <Td>
                        <StatusBadge status={org.status} />
                      </Td>

                      <Td>{org.memberCount}</Td>
                      <Td>{org.listingsCount}</Td>
                      <Td>{org.carrierJobsCount}</Td>

                      <Td>
                        {org.avgRating ? Number(org.avgRating).toFixed(2) : "—"}
                      </Td>

                      <Td>{formatDate(org.createdAt)}</Td>

                      <Td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/organisations/${org.id}`}
                            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                          >
                            View
                          </Link>

                          <Link
                            href={`/admin/audit/entity?entityId=${encodeURIComponent(
                              org.id,
                            )}`}
                            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                          >
                            Audit
                          </Link>

                          {org.status === "PENDING" ? (
                            <>
                              <form action={approveOrganisation}>
                                <input
                                  type="hidden"
                                  name="orgId"
                                  value={org.id}
                                />
                                <ApproveButton />
                              </form>

                              <form action={rejectOrganisation}>
                                <input
                                  type="hidden"
                                  name="orgId"
                                  value={org.id}
                                />
                                <RejectButton />
                              </form>
                            </>
                          ) : (
                            <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-400">
                              No approval action
                            </span>
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

        <p className="mt-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-gray-300">
          WX Admin Panel · Organisation Moderation Active
        </p>
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
  tone?: "default" | "warning" | "danger";
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-gray-950"
        : "text-gray-950";

  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p className={`mt-3 text-3xl font-bold tracking-tight ${valueClass}`}>
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p className="mt-3 text-2xl font-bold tracking-tight text-gray-950">
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

function StatusBadge({ status }: { status: string | null | undefined }) {
  const className =
    status === "ACTIVE"
      ? "border-gray-900 bg-gray-950 text-white"
      : status === "PENDING"
        ? "border-gray-300 bg-gray-100 text-gray-800"
        : status === "REJECTED" || status === "SUSPENDED"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-gray-200 bg-white text-gray-600";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {formatStatus(status)}
    </span>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function calculateRate(value: number, total: number) {
  if (!total || total <= 0) return 0;

  return Math.round((value / total) * 100);
}

function formatDate(date: Date | string | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(new Date(date));
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}