import { auth } from "@/auth";
import { database } from "@/db/database";
import { reviews, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function TeamReviewsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // ✅ Fetch organisationId from DB (not session)
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

  // ✅ Correct column + relations
  const organisationReviews = await database.query.reviews.findMany({
    where: eq(reviews.reviewedOrganisationId, organisationId),
    with: {
      reviewer: true,
      reviewedOrganisation: true,
    },
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Organisation Reviews</h1>

      {organisationReviews.length > 0 ? (
        <ul className="space-y-6">
          {organisationReviews.map((review) => (
            <li
              key={review.id}
              className="border rounded-lg p-6 shadow-sm bg-white"
            >
              <h2 className="text-lg font-semibold">
                Reviewed By: {review.reviewer?.name ?? "Anonymous"}
              </h2>

              <p className="text-gray-600">
                <strong>Organisation:</strong>{" "}
                {review.reviewedOrganisation?.teamName ?? "Unknown"}
              </p>

              <p className="text-gray-600">
                <strong>Rating:</strong> {review.rating} / 5
              </p>

              {review.comment && <p className="mt-3">{review.comment}</p>}

              <p className="text-sm text-gray-400 mt-3">
                {review.createdAt?.toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500">No reviews found for your organisation.</p>
      )}
    </div>
  );
}
