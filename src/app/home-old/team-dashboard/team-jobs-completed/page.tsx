import Link from "next/link";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { carrierAssignments, userProfiles, bids } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import JobReview from "@/components/app/JobReview";

export default async function TeamCompletedJobsPage() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    throw new Error("Unauthorized");
  }

  const organisationId = session.user.organisationId;

  /* =========================================================
     FETCH COMPLETED ASSIGNMENTS
  ========================================================= */

  const completedAssignments = await database.query.carrierAssignments.findMany(
    {
      where: and(
        eq(carrierAssignments.status, "completed"),
        or(
          eq(carrierAssignments.organisationId, organisationId),
          eq(carrierAssignments.carrierOrganisationId, organisationId),
        ),
      ),
      with: {
        listing: {
          with: {
            organisation: true,
            winningOrganisation: true,
            bids: true,
          },
        },
      },
    },
  );

  type Assignment = (typeof completedAssignments)[number];

  /* =========================================================
     ATTACH RECEIVER PROFILES
  ========================================================= */

  const assignmentsWithProfiles = await Promise.all(
    completedAssignments.map(async (assignment: Assignment) => {
      const listing = assignment.listing;

      if (!listing) {
        return { ...assignment, profile: null };
      }

      const winningBid = listing.bids?.find(
        (b: typeof bids.$inferSelect) =>
          b.organisationId === listing.winningOrganisationId,
      );

      const receiverUserId =
        listing.organisationId === organisationId
          ? winningBid?.userId
          : listing.userId;

      if (!receiverUserId) {
        return { ...assignment, profile: null };
      }

      const profile = await database.query.userProfiles.findFirst({
        where: eq(userProfiles.userId, receiverUserId),
      });

      return { ...assignment, profile };
    }),
  );

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Completed Organisation Jobs</h1>

      {assignmentsWithProfiles.length > 0 ? (
        <ul>
          {assignmentsWithProfiles.map((assignment) => {
            const listing = assignment.listing;

            if (!listing) return null;

            const reviewedOrganisationId =
              listing.organisationId === organisationId
                ? listing.winningOrganisationId
                : listing.organisationId;

            return (
              <li
                key={assignment.id}
                className="p-6 border rounded-lg shadow-sm mb-4"
              >
                <section className="flex justify-between">
                  <div className="md:w-[700px]">
                    <h1>
                      <strong>Listing:</strong> {listing.name}
                    </h1>

                    <p className="text-gray-600">
                      <strong>Location:</strong> {listing.location || "Unknown"}
                    </p>

                    <p className="text-gray-600">
                      <strong>Owner Organisation:</strong>{" "}
                      {listing.organisation?.teamName || "Unknown"}
                    </p>

                    <p className="text-gray-600">
                      <strong>Winning Organisation:</strong>{" "}
                      {listing.winningOrganisation?.teamName || "Unknown"}
                    </p>

                    <p className="text-green-600 font-bold mt-2">Completed</p>
                  </div>

                  <div className="flex space-x-4">
                    <Link href={`/home/listings/${listing.id}`}>
                      <button className="bg-blue-500 text-white px-4 py-2 rounded-md">
                        View Listing
                      </button>
                    </Link>

                    {assignment.profile && reviewedOrganisationId && (
                      <JobReview
                        listingId={listing.id}
                        reviewedOrganisationId={reviewedOrganisationId}
                      />
                    )}
                  </div>
                </section>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>No completed organisation jobs found.</p>
      )}
    </div>
  );
}
