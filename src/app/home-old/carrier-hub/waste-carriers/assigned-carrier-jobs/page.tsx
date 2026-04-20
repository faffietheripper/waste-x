import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { eq } from "drizzle-orm";
import { users, carrierAssignments } from "@/db/schema";
import Link from "next/link";
import { acceptCarrierJobAction, rejectCarrierJobAction } from "./actions";
import CollectedForm from "@/components/app/WasteCarriers/CollectedForm";

export default async function AssignedCarrierJobs() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser?.organisationId) {
    throw new Error("User has no organisation");
  }

  const assignments = await database.query.carrierAssignments.findMany({
    where: eq(carrierAssignments.carrierOrganisationId, dbUser.organisationId),
    with: {
      listing: true,
    },
    orderBy: (ca, { desc }) => [desc(ca.assignedAt)],
  });

  return (
    <main className="pt-10 space-y-8">
      <h1 className="text-3xl font-bold">Assigned Carrier Jobs</h1>

      {assignments.length > 0 ? (
        <div className="space-y-6">
          {assignments.map(({ id, listing, status, assignedAt }) => (
            <div
              key={id}
              className="bg-white rounded-2xl shadow-md border p-6 grid grid-cols-3 gap-6 items-center transition-all duration-200 hover:shadow-xl hover:-translate-y-1"
            >
              {/* LEFT SIDE */}
              <div className="col-span-2 space-y-2">
                <h2 className="text-lg font-semibold">
                  {listing?.name ?? "Unknown Job"}
                </h2>

                <p className="text-sm text-gray-500">
                  Location: {listing?.location ?? "N/A"}
                </p>

                {assignedAt && (
                  <p className="text-xs text-gray-400">
                    Assigned: {new Date(assignedAt).toLocaleString()}
                  </p>
                )}

                <StatusBadge status={status} />
              </div>

              {/* ACTIONS */}
              <div className="flex flex-wrap gap-3 justify-end">
                {listing?.id && (
                  <Link
                    href={`/home/waste-listings/${listing.id}`}
                    className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm transition"
                  >
                    View Job
                  </Link>
                )}

                {status === "pending" && listing?.id && (
                  <>
                    <form action={acceptCarrierJobAction}>
                      <input
                        type="hidden"
                        name="listingId"
                        value={listing.id}
                      />
                      <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition">
                        Accept
                      </button>
                    </form>

                    <form action={rejectCarrierJobAction}>
                      <input
                        type="hidden"
                        name="listingId"
                        value={listing.id}
                      />
                      <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition">
                        Reject
                      </button>
                    </form>
                  </>
                )}

                {status === "accepted" && listing?.id && (
                  <CollectedForm listingId={listing.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-100 p-8 rounded-xl text-gray-600">
          No carrier jobs assigned to your organisation yet.
        </div>
      )}
    </main>
  );
}

/* ===============================
   STATUS BADGE
================================= */

function StatusBadge({ status }: { status: string }) {
  const styles = {
    pending: "bg-yellow-100 text-yellow-700",
    accepted: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-block mt-2 px-3 py-1 text-xs font-medium rounded-full ${
        styles[status as keyof typeof styles] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {status}
    </span>
  );
}
