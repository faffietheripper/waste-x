import { auth } from "@/auth";
import { database } from "@/db/database";
import { bids, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export default async function TeamWithdrawalsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // ✅ Get organisation from DB (not session)
  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      organisationId: true,
    },
  });

  if (!dbUser?.organisationId) {
    throw new Error("No organisation found for this user");
  }

  const organisationId = dbUser.organisationId;

  // ✅ Single query instead of two
  const relevantBids = await database.query.bids.findMany({
    with: {
      listing: true,
      organisation: true,
    },
    where: and(eq(bids.organisationId, organisationId)),
  });

  const declinedOffers = relevantBids.filter(
    (bid) => bid.declinedOffer === true,
  );

  const cancelledJobs = relevantBids.filter((bid) => bid.cancelledJob === true);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Withdrawals</h1>

      {/* Declined Offers */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Declined Offers</h2>

        {declinedOffers.length > 0 ? (
          declinedOffers.map((bid) => (
            <div key={bid.id} className="p-6 border rounded-lg shadow-sm mb-4">
              <div>
                <strong>Listing:</strong> {bid.listing?.name ?? "Unknown"}
              </div>

              <div>
                <strong>Amount:</strong> £{bid.amount}
              </div>

              <div className="text-red-600 font-semibold">Declined</div>

              <div>
                <strong>Organisation:</strong>{" "}
                {bid.organisation?.teamName ?? "Unknown"}
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-500">No declined offers found.</p>
        )}
      </section>

      {/* Cancelled Jobs */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Cancelled Jobs</h2>

        {cancelledJobs.length > 0 ? (
          cancelledJobs.map((bid) => (
            <div key={bid.id} className="p-6 border rounded-lg shadow-sm mb-4">
              <div>
                <strong>Listing:</strong> {bid.listing?.name ?? "Unknown"}
              </div>

              <div>
                <strong>Amount:</strong> £{bid.amount}
              </div>

              <div className="text-red-600 font-semibold">Cancelled</div>

              <div>
                <strong>Reason:</strong> {bid.cancellationReason ?? "N/A"}
              </div>

              <div>
                <strong>Organisation:</strong>{" "}
                {bid.organisation?.teamName ?? "Unknown"}
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-500">No cancelled jobs found.</p>
        )}
      </section>
    </div>
  );
}
