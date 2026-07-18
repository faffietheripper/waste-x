import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import { InferSelectModel } from "drizzle-orm";

import { wasteListings } from "@/db/schema";
import { getImageUrl } from "@/util/files";
import { isBidOver } from "@/util/bids";
import { archiveBids } from "@/util/archiveBids";
import { unarchivedBids } from "@/util/unarchivedBids";
import { auth } from "@/auth";
import { deleteListingAction } from "@/modules/listings/actions/deleteListingAction";

type Listing = InferSelectModel<typeof wasteListings>;

type FormAction = (formData: FormData) => Promise<unknown> | unknown;

/* =========================================================
   FORMATTERS
========================================================= */

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "£0";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMode(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "draft":
      return "Draft";
    case "open":
      return "Open";
    case "assigned":
      return "Assigned";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function getStatusClass(status: string | null | undefined) {
  switch (status) {
    case "draft":
      return "border-gray-300 bg-gray-100 text-gray-700";
    case "open":
      return "border-green-300 bg-green-100 text-green-700";
    case "assigned":
      return "border-orange-300 bg-orange-100 text-orange-700";
    case "in_progress":
      return "border-blue-300 bg-blue-100 text-blue-700";
    case "completed":
      return "border-black bg-black text-white";
    case "cancelled":
      return "border-red-300 bg-red-100 text-red-700";
    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

function getWorkflowText({
  listing,
  bidOver,
  isOwner,
}: {
  listing: Listing;
  bidOver: boolean;
  isOwner: boolean;
}) {
  if (listing.archived) {
    return "This listing is archived and not currently active in marketplace operations.";
  }

  if (listing.status === "completed") {
    return "This listing has completed its assignment workflow.";
  }

  if (listing.status === "cancelled") {
    return "This listing was cancelled.";
  }

  if (listing.status === "in_progress") {
    return "Collection or receipt workflow is currently in progress.";
  }

  if (listing.status === "assigned") {
    return "This listing has already been assigned. New bids are closed.";
  }

  if (bidOver) {
    return "Bidding has closed for this listing.";
  }

  if (isOwner) {
    return "Your organisation owns this listing. Open it to review bids or assignment state.";
  }

  return "This listing is open for marketplace review and bidding where permitted.";
}

/* =========================================================
   COMPONENT
========================================================= */

export default async function ListingCard({ listing }: { listing: Listing }) {
  const session = await auth();

  const userId = session?.user?.id;
  const userOrganisationId = session?.user?.organisationId;

  const bidOver = await isBidOver(listing);

  const isOwner =
    listing.userId === userId || listing.organisationId === userOrganisationId;

  const isAssigned = Boolean(listing.assignedCarrierOrganisationId);

  const canPlaceBid =
    !isOwner &&
    !bidOver &&
    !listing.archived &&
    listing.status === "open" &&
    !isAssigned;

  const fileKeys =
    listing.fileKey
      ?.split(",")
      .map((key) => key.trim())
      .filter(Boolean) ?? [];

  const firstImageUrl = fileKeys[0]
    ? getImageUrl(fileKeys[0])
    : "/placeholder.png";

  const workflowText = getWorkflowText({
    listing,
    bidOver,
    isOwner,
  });

  async function archiveListingFormAction(formData: FormData) {
    "use server";

    await (archiveBids as FormAction)(formData);
  }

  async function unarchiveListingFormAction(formData: FormData) {
    "use server";

    await (unarchivedBids as FormAction)(formData);
  }

  async function deleteListingFormAction(formData: FormData) {
    "use server";

    await (deleteListingAction as FormAction)(formData);
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
      {/* IMAGE */}
      <div className="relative h-56 w-full overflow-hidden bg-black">
        <Image
          src={firstImageUrl}
          width={700}
          height={500}
          alt={listing.name || "Waste listing"}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
              listing.status,
            )}`}
          >
            {getStatusLabel(listing.status)}
          </span>

          {listing.archived && (
            <span className="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              Archived
            </span>
          )}

          {bidOver &&
            !["assigned", "completed", "cancelled"].includes(
              listing.status ?? "",
            ) && (
              <span className="rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                Bidding Closed
              </span>
            )}
        </div>

        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-300">
            Waste Listing
          </p>

          <h2 className="mt-1 line-clamp-2 text-xl font-semibold text-white">
            {listing.name}
          </h2>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-black/50">
          {listing.location || "Location not set"}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <DetailBlock
            label="Starting Price"
            value={formatCurrency(listing.startingPrice)}
          />

          <DetailBlock
            label="Current Bid"
            value={formatCurrency(listing.currentBid)}
          />

          <DetailBlock label="Market" value={formatMode(listing.marketMode)} />

          <DetailBlock
            label="Mode"
            value={formatMode(listing.participationMode)}
          />
        </div>

        <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm leading-6 text-orange-800">
          {workflowText}
        </div>

        <div className="mt-4 space-y-2 text-sm text-black/50">
          <div className="flex items-center justify-between gap-4">
            <span>Bid Ends</span>

            <span className="font-medium text-black">
              {listing.endDate
                ? format(listing.endDate, "dd MMM yyyy")
                : "Not set"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span>Template Version</span>

            <span className="font-medium text-black">
              v{listing.templateVersion}
            </span>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="mt-auto pt-6">
          {!listing.archived ? (
            <section>
              {isOwner ? (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/home/marketplace/browse/${listing.id}`}
                    className="rounded-full bg-black px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                  >
                    View Listing
                  </Link>

                  <form action={archiveListingFormAction}>
                    <input type="hidden" name="listingId" value={listing.id} />

                    <button
                      type="submit"
                      className="w-full rounded-full border border-black/10 bg-[#fbfaf7] px-4 py-2 text-sm font-semibold text-black/60 transition hover:bg-orange-100 hover:text-orange-700"
                    >
                      Archive
                    </button>
                  </form>
                </div>
              ) : (
                <Link
                  href={`/home/marketplace/browse/${listing.id}`}
                  className="block rounded-full bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-black transition hover:bg-orange-400"
                >
                  {canPlaceBid ? "View / Place Bid" : "View Listing"}
                </Link>
              )}
            </section>
          ) : (
            <section className="space-y-2">
              <Link
                href={`/home/marketplace/browse/${listing.id}`}
                className="block rounded-full bg-black px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
              >
                View Archived Listing
              </Link>

              {isOwner && (
                <div className="grid grid-cols-2 gap-2">
                  <form action={deleteListingFormAction}>
                    <input type="hidden" name="listingId" value={listing.id} />

                    <button
                      type="submit"
                      className="w-full rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </form>

                  <form action={unarchiveListingFormAction}>
                    <input type="hidden" name="listingId" value={listing.id} />

                    <button
                      type="submit"
                      className="w-full rounded-full border border-black/10 bg-[#fbfaf7] px-4 py-2 text-sm font-semibold text-black/60 transition hover:bg-orange-100 hover:text-orange-700"
                    >
                      Unarchive
                    </button>
                  </form>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-3">
      <p className="text-[10px] uppercase tracking-widest text-black/35">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-semibold text-black">{value}</p>
    </div>
  );
}