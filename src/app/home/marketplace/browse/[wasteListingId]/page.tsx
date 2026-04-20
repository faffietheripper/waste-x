import { auth } from "@/auth";
import PlaceBid from "@/components/app/MarketPlace/PlaceBid";
import { getBidsForListing } from "@/data-access/bids";
import { getWasteListing } from "@/data-access/wasteListings";
import { getOrganisationById } from "@/data-access/organisations";
import { getImageUrl } from "@/util/files";
import { formatDistance } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { isBidOver } from "@/util/bids";
import BidWinner from "@/components/app/BidWinner";
import { getWinningBid } from "@/data-access/getWinningBid";
import AssignListingButton from "@/components/app/AssignListingButton";
import { handleAssignWinningBid } from "./actions";

function formatTimestamp(timestamp: Date | null) {
  if (!timestamp) return "Unknown";
  return formatDistance(timestamp, new Date(), { addSuffix: true });
}

export default async function ListingPage({
  params,
}: {
  params: { wasteListingId: string };
}) {
  const listingId = Number(params.wasteListingId);

  if (isNaN(listingId)) {
    throw new Error("Invalid listing ID");
  }

  const session = await auth();

  if (!session?.user) {
    throw new Error("User not authenticated");
  }

  const listing = await getWasteListing(listingId);
  const { winningBid } = await getWinningBid(listingId);

  if (!listing) {
    return <div className="py-36 text-center">Listing not found</div>;
  }

  const organisation = await getOrganisationById(listing.organisationId);
  const allBids = await getBidsForListing(listing.id);

  const hasBids = allBids.length > 0;

  const canPlaceBid =
    listing.userId !== session.user.id &&
    !(await isBidOver(listing)) &&
    !listing.archived &&
    !("offerAccepted" in listing ? listing.offerAccepted : false);

  const canAssignBid =
    listing.organisationId === session.user.organisationId && !listing.assigned;

  const fileKeys = listing.fileKey?.split(",") ?? [];

  /* ==============================
     TEMPLATE DATA (SAFE)
  ============================== */

  const templateDataRecord = listing.templateData?.[0];

  const templateData = templateDataRecord
    ? JSON.parse(templateDataRecord.dataJson || "{}")
    : {};

  const templateSections = templateDataRecord?.template?.sections ?? [];

  return (
    <main className="pl-[24vw] min-h-screen overflow-y-scroll py-32 px-12">
      <div className="grid grid-cols-6 gap-10">
        {/* ================= LEFT SIDE ================= */}
        <div className="col-span-4 space-y-10">
          {/* HEADER */}
          <div className="bg-white border rounded-2xl p-8 shadow-sm space-y-4">
            <h1 className="text-3xl font-semibold">{listing.name}</h1>

            <div className="flex items-center gap-8 text-sm text-gray-600">
              <div>
                Starting Price:{" "}
                <span className="font-semibold">£{listing.startingPrice}</span>
              </div>

              <div>
                Current Bid:{" "}
                <span className="font-semibold">£{listing.currentBid}</span>
              </div>

              <div>Ends: {formatTimestamp(listing.endDate)}</div>

              {(await isBidOver(listing)) && (
                <Badge className="bg-red-500">Bidding Closed</Badge>
              )}
            </div>

            {organisation && (
              <div className="text-sm text-gray-500">
                Listed by{" "}
                <Link
                  href={`/home/organisations/${organisation.id}`}
                  className="underline hover:text-black"
                >
                  {organisation.teamName}
                </Link>
              </div>
            )}
          </div>

          {/* IMAGES */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {fileKeys.slice(0, 3).map((key, index) => (
              <Image
                key={index}
                src={getImageUrl(key.trim())}
                alt={listing.name}
                width={600}
                height={500}
                className="rounded-2xl h-64 object-cover border"
              />
            ))}
          </div>

          {/* TEMPLATE SECTIONS */}
          <div className="space-y-10">
            {templateSections.map((section: any) => (
              <div
                key={section.id}
                className="bg-white border rounded-2xl p-8 shadow-sm"
              >
                <div className="mb-8">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {section.title}
                  </h2>
                  <div className="h-px bg-gray-200 mt-4" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-8">
                  {section.fields.map((field: any) => {
                    const value = templateData?.[field.key];

                    if (value === undefined || value === null || value === "")
                      return null;

                    return (
                      <div key={field.id} className="flex flex-col">
                        <span className="text-sm text-gray-500 mb-1">
                          {field.label}
                        </span>

                        <span className="text-base font-medium text-gray-900">
                          {field.fieldType === "boolean"
                            ? value
                              ? "Yes"
                              : "No"
                            : value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ================= RIGHT SIDEBAR ================= */}
        <aside className="col-span-2 sticky top-6 h-[80vh] flex flex-col gap-6">
          {/* BIDS */}
          <div className="bg-white border rounded-2xl p-6 shadow-sm flex flex-col h-[75%]">
            <h2 className="text-xl font-semibold mb-4">Current Bids</h2>

            {canPlaceBid && (
              <PlaceBid listingId={listingId} currentBid={listing.currentBid} />
            )}

            <div className="mt-4 flex-1 overflow-y-auto pr-2 space-y-4">
              {hasBids ? (
                allBids.map((bid: any, index: number) => (
                  <div key={bid.id} className="border rounded-xl p-4 space-y-2">
                    {index === 0 && (
                      <Badge className="bg-green-500">Highest Bid</Badge>
                    )}

                    <div className="text-lg font-semibold">£{bid.amount}</div>

                    <div className="text-sm text-gray-600">
                      Bid by {bid.user?.name ?? "Unknown"}
                    </div>

                    <div className="text-sm text-gray-500">
                      Organisation: {bid.organisation?.teamName ?? "Unknown"}
                    </div>

                    <div className="text-xs text-gray-400">
                      {formatTimestamp(bid.timestamp ?? null)}
                    </div>

                    {canAssignBid && (
                      <AssignListingButton
                        listingId={listing.id}
                        bidId={bid.id}
                        offerAccepted={
                          "offerAccepted" in listing
                            ? listing.offerAccepted
                            : false
                        }
                        assignedCarrierOrganisationId={
                          listing.assignedCarrierOrganisationId ?? null
                        }
                        declinedOffer={bid.declinedOffer ?? false}
                        cancelledJob={bid.cancelledJob ?? false}
                        handleAssignWinningBid={handleAssignWinningBid}
                      />
                    )}
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No bids yet</div>
              )}
            </div>
          </div>

          {/* WINNER */}
          <div className="bg-white border rounded-2xl p-6 shadow-sm h-[25%] flex flex-col">
            <h2 className="font-semibold mb-3">Winning Bid</h2>

            <div className="flex-1 flex items-center">
              <BidWinner winningBid={winningBid} />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
