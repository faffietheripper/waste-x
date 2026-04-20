import { auth } from "@/auth";
import { database } from "@/db/database";
import { reviews, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { safeDate } from "@/lib/date";

export default async function ReviewsPage() {
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

  // ✅ Fetch reviews written about my organisation
  const organisationReviews = await database.query.reviews.findMany({
    where: eq(reviews.reviewedOrganisationId, dbUser.organisationId),
    with: {
      reviewer: true,
    },
    orderBy: (review, { desc }) => [desc(review.createdAt)],
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Reviews For My Organisation</h1>

      {organisationReviews.length > 0 ? (
        <ul className="space-y-4">
          {organisationReviews.map((review) => (
            <li
              key={review.id}
              className="border rounded-lg p-4 shadow-sm bg-white"
            >
              <h2 className="text-lg font-semibold">
                Reviewed By: {review.reviewer?.name || "Anonymous"}
              </h2>

              <p className="text-gray-600">
                <strong>Rating:</strong> {review.rating} / 5
              </p>

              <p className="mt-2">{review.comment}</p>

              <p className="text-sm text-gray-400 mt-2">
                {safeDate(review.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No reviews found for your organisation.</p>
      )}
    </div>
  );
}
