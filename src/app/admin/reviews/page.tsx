// src/app/admin/reviews/page.tsx

import Link from "next/link";
import type { ReactNode } from "react";

import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getReviewDashboard } from "./actions";

type AdminReviewsSearchParams =
  | {
      search?: string;
    }
  | Promise<{
      search?: string;
    }>;

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams?: AdminReviewsSearchParams;
}) {
  await requirePlatformAdmin();

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = resolvedSearchParams.search?.trim() ?? "";

  const { reviews, stats } = await getReviewDashboard(search);

  const totalReviews = Number(stats.total ?? 0);
  const averageRating = Number(stats.average ?? 0);
  const reviewsThisWeek = Number(stats.thisWeek ?? 0);

  const fiveStarCount = getRatingCount(stats.breakdown, 5);
  const fourStarCount = getRatingCount(stats.breakdown, 4);
  const threeStarCount = getRatingCount(stats.breakdown, 3);
  const twoStarCount = getRatingCount(stats.breakdown, 2);
  const oneStarCount = getRatingCount(stats.breakdown, 1);

  const positiveReviews = fiveStarCount + fourStarCount;
  const neutralReviews = threeStarCount;
  const lowRatingReviews = twoStarCount + oneStarCount;

  const positiveRate = calculateRate(positiveReviews, totalReviews);
  const lowRatingRate = calculateRate(lowRatingReviews, totalReviews);

  const filteredLowRatingReviews = reviews.filter(
    (review) => Number(review.rating ?? 0) <= 2,
  ).length;

  const reputationStatus =
    totalReviews === 0
      ? "No Data"
      : averageRating >= 4
        ? "Strong"
        : averageRating >= 3
          ? "Watch"
          : "At Risk";

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Trust Monitoring
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Reviews & Reputation
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Monitor platform trust, review quality, low-rating feedback and
              organisation reputation signals across Waste X.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/organisations"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Organisations
            </Link>

            <Link
              href="/admin/audit/compliance"
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Compliance audit
            </Link>
          </div>
        </div>
      </section>

      {/* ================= KPI STRIP ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Reviews"
          value={totalReviews}
          helper="All reviews recorded"
        />

        <StatCard
          label="Average Rating"
          value={averageRating.toFixed(2)}
          helper="Overall platform reputation"
        />

        <StatCard
          label="This Week"
          value={reviewsThisWeek}
          helper="Recent review activity"
        />

        <StatCard
          label="Reputation Status"
          value={reputationStatus}
          helper={`${positiveRate}% positive, ${lowRatingRate}% low rating`}
          tone={
            reputationStatus === "At Risk"
              ? "danger"
              : reputationStatus === "Watch"
                ? "warning"
                : "default"
          }
        />
      </section>

      {/* ================= REPUTATION HEALTH ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Reputation Health
          </p>

          <div className="mt-5 flex items-end gap-3">
            <p className="text-5xl font-black tracking-tight text-gray-950">
              {averageRating.toFixed(1)}
            </p>

            <p className="pb-2 text-sm font-semibold text-gray-400">/ 5</p>
          </div>

          <p className="mt-4 text-sm leading-6 text-gray-500">
            Reviews help show whether the platform is building trust between
            generators, carriers and managers.
          </p>

          <div className="mt-6">
            <ScoreBar value={calculateRate(averageRating, 5)} />
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:col-span-2">
          <MiniMetric
            label="Positive Reviews"
            value={positiveReviews}
            helper={`${positiveRate}% are 4 or 5 star`}
          />

          <MiniMetric
            label="Neutral Reviews"
            value={neutralReviews}
            helper="3 star reviews"
          />

          <MiniMetric
            label="Low Rating Reviews"
            value={lowRatingReviews}
            helper={`${lowRatingRate}% are 1 or 2 star`}
            tone={lowRatingReviews > 0 ? "danger" : "default"}
          />

          <MiniMetric
            label="Filtered Low Ratings"
            value={filteredLowRatingReviews}
            helper="Low ratings in current results"
            tone={filteredLowRatingReviews > 0 ? "danger" : "default"}
          />
        </section>
      </section>

      {/* ================= RATING BREAKDOWN ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Distribution
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Rating distribution
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Breakdown of all reviews by star rating. This helps spot trust
              issues quickly before they become bigger moderation problems.
            </p>
          </div>

          <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
            {totalReviews} total
          </span>
        </div>

        <div className="space-y-4">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = getRatingCount(stats.breakdown, star);
            const percentage = calculateRate(count, totalReviews);

            return (
              <RatingRow
                key={star}
                star={star}
                count={count}
                percentage={percentage}
              />
            );
          })}
        </div>
      </section>

      {/* ================= SEARCH ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Search
          </p>

          <h2 className="mt-2 text-lg font-bold text-gray-950">
            Find reviews
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Search by reviewer, organisation, email or review comment.
          </p>
        </div>

        <form className="mt-6 flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Search by user, organisation, or comment..."
            className="min-h-[3rem] flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white"
          />

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-2xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Search
            </button>

            {search && (
              <Link
                href="/admin/reviews"
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Clear
              </Link>
            )}
          </div>
        </form>
      </section>

      {/* ================= REVIEW FEED ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Review Feed
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Platform reviews
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              {search ? (
                <>
                  Showing {reviews.length} result
                  {reviews.length === 1 ? "" : "s"} for “{search}”.
                </>
              ) : (
                <>
                  Showing {reviews.length} review
                  {reviews.length === 1 ? "" : "s"}.
                </>
              )}
            </p>
          </div>

          {search && (
            <Link
              href="/admin/reviews"
              className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
            >
              Clear search
            </Link>
          )}
        </div>

        {reviews.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
            <p className="text-lg font-bold text-gray-950">No reviews found</p>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              {search
                ? `No reviews matched “${search}”.`
                : "There are no reviews in the system yet."}
            </p>

            {search && (
              <Link
                href="/admin/reviews"
                className="mt-5 inline-flex rounded-2xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
              >
                Clear search
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function StatCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: number | string;
  helper: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p
        className={`mt-3 text-3xl font-bold tracking-tight ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: number | string;
  helper: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p
        className={`mt-3 text-2xl font-bold tracking-tight ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function RatingRow({
  star,
  count,
  percentage,
}: {
  star: number;
  count: number;
  percentage: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-950">{star}</span>
          <span className="text-gray-500">star</span>
        </div>

        <div className="text-right">
          <p className="font-semibold text-gray-950">{count}</p>
          <p className="text-xs text-gray-400">{percentage}%</p>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-gray-950"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ReviewCard({
  review,
}: {
  review: {
    id: string;
    rating: number;
    comment: string | null;
    organisationName: string | null;
    reviewerName: string | null;
    reviewerEmail: string | null;
    createdAt: Date | string | null;
  };
}) {
  const rating = Number(review.rating ?? 0);
  const lowRating = rating <= 2;

  return (
    <article
      className={`rounded-[1.5rem] border p-5 shadow-sm ${
        lowRating
          ? "border-red-200 bg-red-50"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <RatingBadge rating={rating} />

            {lowRating && (
              <span className="rounded-full border border-red-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
                Review needed
              </span>
            )}
          </div>

          <h3 className="mt-3 text-sm font-bold text-gray-950">
            {review.organisationName ?? "Unknown organisation"}
          </h3>

          <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-600">
            {review.comment ?? "No comment provided."}
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
            <span>
              By{" "}
              <span className="font-semibold text-gray-700">
                {review.reviewerName ?? "Unknown reviewer"}
              </span>
            </span>

            {review.reviewerEmail && <span>{review.reviewerEmail}</span>}

            <span>{formatDate(review.createdAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/audit/entity?entityId=${encodeURIComponent(review.id)}`}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Audit
          </Link>
        </div>
      </div>
    </article>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  const className =
    rating <= 2
      ? "border-red-200 bg-white text-red-700"
      : rating >= 4
        ? "border-gray-900 bg-gray-950 text-white"
        : "border-gray-300 bg-gray-100 text-gray-800";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${className}`}
    >
      {rating} ⭐
    </span>
  );
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-gray-950"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getRatingCount(
  breakdown: {
    rating: number;
    count: number | string;
  }[],
  rating: number,
) {
  const item = breakdown.find((row) => Number(row.rating) === rating);

  return Number(item?.count ?? 0);
}

function calculateRate(value: number, total: number) {
  if (!total || total <= 0) return 0;

  return Math.round((value / total) * 100);
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(new Date(date));
}