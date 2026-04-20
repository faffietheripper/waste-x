import { auth } from "@/auth";
import { database } from "@/db/database";
import { bids } from "@/db/schema";
import { eq, or } from "drizzle-orm";

export default async function WithdrawalsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  // ✅ Declined offers relevant to this user
  const declinedOffers = await database.query.bids.findMany({
    where: eq(bids.declinedOffer, true),
    with: {
      listing: true,
    },
  });

  const filteredDeclined = declinedOffers.filter(
    (bid) => bid.userId === userId || bid.listing?.userId === userId,
  );

  // ✅ Cancelled jobs relevant to this user
  const cancelledJobs = await database.query.bids.findMany({
    where: eq(bids.cancelledJob, true),
    with: {
      listing: true,
    },
  });

  const filteredCancelled = cancelledJobs.filter(
    (bid) => bid.userId === userId || bid.listing?.userId === userId,
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Withdrawals</h1>

      {/* Declined Offers */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Declined Offers</h2>

        {filteredDeclined.length > 0 ? (
          <ul>
            {filteredDeclined.map((bid) => (
              <li key={bid.id} className="p-6 border rounded-lg shadow-sm mb-4">
                <div>
                  <strong>Listing:</strong> {bid.listing?.name}
                </div>
                <div>
                  <strong>Amount:</strong> £{bid.amount}
                </div>
                <div>
                  <strong>Status:</strong> Declined
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No declined offers found.</p>
        )}
      </section>

      {/* Cancelled Jobs */}
      <section>
        <h2 className="text-xl font-semibold mb-2">Cancelled Jobs</h2>

        {filteredCancelled.length > 0 ? (
          <ul>
            {filteredCancelled.map((bid) => (
              <li key={bid.id} className="p-6 border rounded-lg shadow-sm mb-4">
                <div>
                  <strong>Listing:</strong> {bid.listing?.name}
                </div>
                <div>
                  <strong>Amount:</strong> £{bid.amount}
                </div>
                <div>
                  <strong>Status:</strong> Cancelled
                </div>
                <div>
                  <strong>Reason:</strong> {bid.cancellationReason || "N/A"}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No cancelled jobs found.</p>
        )}
      </section>
    </div>
  );
}
