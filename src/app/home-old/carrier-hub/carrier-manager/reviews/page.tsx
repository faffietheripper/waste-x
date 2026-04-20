import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, organisations, reviews } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { safeDate } from "@/lib/date";

export default async function WasteManagerReviewsPage() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser?.organisationId) {
    return (
      <div className="p-12">
        <h1 className="text-xl font-bold">
          Create an organisation to access reviews.
        </h1>
      </div>
    );
  }

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, dbUser.organisationId),
  });

  /* ===============================
     Reviews Written By This Org
  ================================= */

  const orgReviews = await database.query.reviews.findMany({
    where: eq(reviews.reviewerId, dbUser.id),
    with: {
      reviewedOrganisation: true,
      listing: true,
    },
    orderBy: desc(reviews.createdAt),
  });

  const totalReviews = orgReviews.length;

  const averageRating =
    totalReviews > 0
      ? (
          orgReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        ).toFixed(1)
      : "N/A";

  const ratingBreakdown = {
    5: orgReviews.filter((r) => r.rating === 5).length,
    4: orgReviews.filter((r) => r.rating === 4).length,
    3: orgReviews.filter((r) => r.rating === 3).length,
    2: orgReviews.filter((r) => r.rating === 2).length,
    1: orgReviews.filter((r) => r.rating === 1).length,
  };

  return (
    <main className=" pt-10 space-y-10">
      <h1 className="text-3xl font-bold">Carrier Reviews Issued</h1>

      {/* ===============================
          KPI SECTION
      ================================ */}
      <section className="grid grid-cols-3 gap-6">
        <StatCard title="Reviews Written" value={totalReviews} />
        <StatCard title="Average Rating Given" value={averageRating} />
        <StatCard
          title="Organisation"
          value={organisation?.teamName ?? "Unknown"}
        />
      </section>

      {/* ===============================
          Rating Breakdown
      ================================ */}
      <section className="bg-gray-100 p-6 rounded-xl">
        <h2 className="text-xl font-semibold mb-4">Rating Distribution</h2>

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

        {orgReviews.length > 0 ? (
          orgReviews.map((review) => (
            <div
              key={review.id}
              className="bg-white shadow rounded-xl p-6 border"
            >
              <div className="flex justify-between items-center">
                <p className="font-semibold">
                  {review.reviewedOrganisation?.teamName ?? "Carrier"}
                </p>
                <p className="text-yellow-600 font-bold">{review.rating} ★</p>
              </div>

              {review.listing && (
                <p className="text-sm text-gray-500 mt-1">
                  Related Listing: {review.listing.name}
                </p>
              )}

              {review.comment && (
                <p className="mt-3 text-gray-700">“{review.comment}”</p>
              )}

              <p className="text-xs text-gray-400 mt-2">
                {safeDate(review.createdAt)}
              </p>

              <div className="mt-4">
                <Link
                  href={`/home/organisations/${review.reviewedOrganisation?.id}`}
                  className="text-sm text-blue-600 underline"
                >
                  View Carrier Profile
                </Link>
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-500">You have not issued any reviews yet.</p>
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
    <div className="bg-white shadow rounded-xl p-6 border">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </div>
  );
}
