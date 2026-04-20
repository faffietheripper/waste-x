import Link from "next/link";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { carrierAssignments, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import JobReview from "@/components/app/JobReview";

export default async function CompletedJobsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser?.organisationId) {
    throw new Error("No organisation found");
  }

  const completedAssignments = await database.query.carrierAssignments.findMany(
    {
      where: eq(carrierAssignments.status, "completed"),
      with: {
        listing: true,
      },
    },
  );

  const relevantAssignments = completedAssignments.filter(
    (assignment) =>
      assignment.listing.organisationId === dbUser.organisationId ||
      assignment.listing.winningOrganisationId === dbUser.organisationId,
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Completed Jobs</h1>

      {relevantAssignments.length > 0 ? (
        <ul>
          {relevantAssignments.map((assignment) => {
            const listing = assignment.listing;

            return (
              <li
                key={assignment.id}
                className="p-6 border rounded-lg shadow-sm mb-4"
              >
                <section className="flex justify-between">
                  <div className="md:w-[700px]">
                    <h1>Listing Title: {listing.name}</h1>

                    <p className="text-gray-500 text-sm">
                      Full listing details available in the listing page
                    </p>
                  </div>

                  <div className="flex space-x-4">
                    <Link href={`/home/waste-listings/${listing.id}`}>
                      <button className="bg-blue-500 text-white px-4 py-2 rounded-md">
                        View Listing
                      </button>
                    </Link>

                    <JobReview
                      listingId={listing.id}
                      reviewedOrganisationId={listing.organisationId}
                    />
                  </div>
                </section>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>No completed jobs found.</p>
      )}
    </div>
  );
}
