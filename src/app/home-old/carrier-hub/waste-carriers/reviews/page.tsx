import { auth } from "@/auth";
import { database } from "@/db/database";
import { organisations, reviews } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { safeDate } from "@/lib/date";

export default async function CarrierReviewsPage() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    throw new Error("Unauthorized");
  }

  /* ===============================
     Confirm Carrier Organisation
  ================================= */
  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, session.user.organisationId),
  });

  if (!organisation || organisation.chainOfCustody !== "wasteCarrier") {
    return (
      <div className="p-12">
        <h1 className="text-xl font-bold text-red-600">
          Access restricted to licensed waste carriers.
        </h1>
      </div>
    );
  }

  /* ===============================
     Fetch Reviews
  ================================= */
  const carrierReviews = await database.query.reviews.findMany({
    where: eq(reviews.reviewedOrganisationId, organisation.id),
    with: {
      reviewer: true,
      listing: true,
    },
    orderBy: desc(reviews.createdAt),
  });

  const totalReviews = carrierReviews.length;

  const averageRating =
    totalReviews > 0
      ? (
          carrierReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        ).toFixed(1)
      : "N/A";

  const ratingBreakdown = {
    5: carrierReviews.filter((r) => r.rating === 5).length,
    4: carrierReviews.filter((r) => r.rating === 4).length,
    3: carrierReviews.filter((r) => r.rating === 3).length,
    2: carrierReviews.filter((r) => r.rating === 2).length,
    1: carrierReviews.filter((r) => r.rating === 1).length,
  };

  return (
    <main className="pt-12 space-y-10">
      <h1 className="text-3xl font-bold">Carrier Reviews Analytics</h1>

      {/* ===============================
          KPI SECTION
      ================================ */}
      <section className="grid grid-cols-3 gap-6">
        <StatCard title="Total Reviews" value={totalReviews} />
        <StatCard title="Average Rating" value={averageRating} />
        <StatCard
          title="Reputation Status"
          value={
            totalReviews === 0
              ? "No Reviews"
              : Number(averageRating) >= 4.5
                ? "Excellent"
                : Number(averageRating) >= 4
                  ? "Strong"
                  : Number(averageRating) >= 3
                    ? "Average"
                    : "Needs Improvement"
          }
        />
      </section>

      {/* ===============================
          Rating Breakdown
      ================================ */}
      <section className="bg-gray-100 p-6 rounded-xl">
        <h2 className="text-xl font-semibold mb-4">Rating Breakdown</h2>

        {[5, 4, 3, 2, 1].map((star) => (
          <div key={star} className="flex items-center justify-between mb-2">
            <span>{star} ★</span>
            <span>{ratingBreakdown[star as 1 | 2 | 3 | 4 | 5]}</span>
          </div>
        ))}
      </section>

      {/* ===============================
          Review List
      ================================ */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Recent Reviews</h2>

        {carrierReviews.length > 0 ? (
          <div className="space-y-4">
            {carrierReviews.map((review) => (
              <div key={review.id} className="bg-white shadow rounded-xl p-6">
                <div className="flex justify-between items-center">
                  <p className="font-semibold">
                    {review.reviewer?.name || "Anonymous"}
                  </p>
                  <p className="text-yellow-600 font-bold">{review.rating} ★</p>
                </div>

                {review.listing && (
                  <p className="text-sm text-gray-500 mt-1">
                    Listing: {review.listing.name}
                  </p>
                )}

                {review.comment && (
                  <p className="mt-3 text-gray-700">“{review.comment}”</p>
                )}

                <p className="text-xs text-gray-400 mt-2">
                  {safeDate(review.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p>No reviews yet.</p>
        )}
      </section>
    </main>
  );
}

/* ===============================
   Reusable KPI Card
================================= */

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-white shadow rounded-xl p-6">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </div>
  );
}
