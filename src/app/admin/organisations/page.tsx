import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import {
  getAllOrganisations,
  approveOrganisation,
  rejectOrganisation,
} from "./actions";
import Link from "next/link";
import { ApproveButton, RejectButton } from "./ActionButton";

export default async function AdminOrganisationsPage({
  searchParams,
}: {
  searchParams?: { search?: string };
}) {
  await requirePlatformAdmin();

  const search = searchParams?.search;
  const organisations = await getAllOrganisations(search);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1400px] mx-auto px-6 py-8 space-y-6">
        {/* HEADER */}
        <div>
          <h1 className="text-2xl font-bold">Organisations</h1>
          <p className="text-sm text-gray-500">
            Platform-wide organisation management
          </p>
        </div>

        {/* SEARCH */}
        <form className="flex gap-2">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Search by name or email..."
            className="border px-4 py-2 rounded w-80 text-sm"
          />
          <button className="px-4 py-2 bg-black text-white rounded text-sm">
            Search
          </button>
        </form>

        {/* TABLE */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <Th>Name</Th>
                  <Th>Industry</Th>
                  <Th>Email</Th>
                  <Th>Status</Th>
                  <Th>Members</Th>
                  <Th>Listings</Th>
                  <Th>Carrier Jobs</Th>
                  <Th>Avg Rating</Th>
                  <Th>Joined</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>

              <tbody>
                {organisations.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-gray-500">
                      No organisations found.
                    </td>
                  </tr>
                )}

                {organisations.map((org) => (
                  <tr key={org.id} className="border-t hover:bg-gray-50">
                    <Td className="font-medium">
                      <Link
                        href={`/admin/organisations/${org.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {org.teamName}
                      </Link>
                    </Td>

                    <Td>{org.industry ?? "—"}</Td>
                    <Td>{org.email}</Td>

                    {/* STATUS */}
                    <Td>
                      <span
                        className={`text-xs font-medium ${
                          org.status === "ACTIVE"
                            ? "text-green-600"
                            : org.status === "REJECTED"
                              ? "text-red-600"
                              : "text-yellow-600"
                        }`}
                      >
                        {org.status}
                      </span>
                    </Td>

                    <Td>{org.memberCount}</Td>
                    <Td>{org.listingsCount}</Td>
                    <Td>{org.carrierJobsCount}</Td>

                    <Td>
                      {org.avgRating ? Number(org.avgRating).toFixed(2) : "—"}
                    </Td>

                    <Td>{formatDate(org.createdAt)}</Td>

                    {/* ACTIONS */}
                    <Td>
                      {org.status === "PENDING" ? (
                        <div className="flex gap-2">
                          <form action={approveOrganisation}>
                            <input type="hidden" name="orgId" value={org.id} />
                            <ApproveButton />
                          </form>

                          <form action={rejectOrganisation}>
                            <input type="hidden" name="orgId" value={org.id} />
                            <RejectButton />
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">
                          No action required
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER NOTE */}
        <div className="text-xs text-gray-400 text-center">
          WX ADMIN PANEL · Organisation Moderation Active
        </div>
      </div>
    </div>
  );
}

/* ================= UI HELPERS ================= */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function formatDate(date: Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB");
}
