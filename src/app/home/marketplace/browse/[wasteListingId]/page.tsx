import { auth } from "@/auth";
import PlaceBid from "@/components/app/MarketPlace/PlaceBid";
import InternalAssignPanel from "@/components/app/Listings/InternalAssignPanel";
import { getBidsForListing } from "@/data-access/bids";
import { getWasteListing } from "@/data-access/wasteListings";
import { getOrganisationById } from "@/data-access/organisations";
import { getCarrierDepartments } from "@/data-access/departments";
import { getImageUrl } from "@/util/files";
import { formatDistance } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { isBidOver } from "@/util/bids";
import BidWinner from "@/components/app/BidWinner";
import { getWinningBid } from "@/data-access/getWinningBid";
import AssignListingButton from "@/components/app/Listings/AssignListingButton";
import { canUserAccessListing } from "@/modules/listings/core/canUserAccessListing";
import { notFound } from "next/navigation";

/* =========================================================
   HELPERS
========================================================= */

function formatTimestamp(timestamp: Date | string | null | undefined) {
  if (!timestamp) return "Unknown";

  return formatDistance(new Date(timestamp), new Date(), {
    addSuffix: true,
  });
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "£0";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number(value));
}

/* =========================================================
   PAGE
========================================================= */

export default async function ListingPage({ params }: any) {
  const listingId = Number(params.wasteListingId);

  if (!listingId || Number.isNaN(listingId)) {
    notFound();
  }

  const session = await auth();

  if (!session?.user) {
    throw new Error("User not authenticated");
  }

  const userOrg = session.user.organisationId;

  if (!userOrg) {
    notFound();
  }

  /* =========================================================
     FETCH LISTING
  ========================================================= */

  const listing = await getWasteListing(listingId);

  if (!listing) {
    notFound();
  }

  /* =========================================================
     ACCESS CONTROL
  ========================================================= */

  if (!canUserAccessListing({ listing, userOrganisationId: userOrg })) {
    notFound();
  }

  /* =========================================================
     FETCH RELATED DATA
  ========================================================= */

  const [organisation, bids, winningBidResult, internalCarriers] =
    await Promise.all([
      getOrganisationById(listing.organisationId),
      getBidsForListing(listing.id),
      getWinningBid(listingId),
      getCarrierDepartments(userOrg),
    ]);

  const { winningBid } = winningBidResult;

  /* =========================================================
     STATE LOGIC
  ========================================================= */

  const bidOver = await isBidOver(listing);

  const isOwner = listing.organisationId === userOrg;

  const assignedCarrierOrganisationId =
    listing.assignedCarrierOrganisationId ?? null;

  const isAssigned = Boolean(assignedCarrierOrganisationId);

  const isAssignedToCurrentOrganisation =
    assignedCarrierOrganisationId === userOrg;

  const allowedCarrierIds =
    listing.allowedCarrierIds?.split(",").filter(Boolean) ?? [];

  const isAllowedCarrier = allowedCarrierIds.includes(userOrg);

  const isInternal = listing.marketMode === "internal_only";

  const isBiddableMarket =
    listing.marketMode === "open_market" || listing.marketMode === "hybrid";

  const participationAllowsExternalCarrier =
    listing.participationMode === "external" ||
    (listing.participationMode === "mixed" && isAllowedCarrier);

  /*
    IMPORTANT RULE:
    Once a listing is assigned, bidding must stop immediately.
    This is true even when the assigned carrier has not accepted yet.
  */
  const canBid =
    !isOwner &&
    !isAssigned &&
    !bidOver &&
    isBiddableMarket &&
    participationAllowsExternalCarrier;

  const canAssign = isOwner && !isAssigned;

  const showBiddingPanel = isBiddableMarket;

  const fileKeys = listing.fileKey?.split(",").filter(Boolean) ?? [];

  /* =========================================================
     TEMPLATE DATA
  ========================================================= */

  const templateDataRecord = listing.templateData?.[0] ?? null;

  const templateData = templateDataRecord
    ? JSON.parse(templateDataRecord.dataJson || "{}")
    : {};

  const templateSections = templateDataRecord?.template?.sections ?? [];

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="pl-[24vw] min-h-screen bg-[#f7f3ed] py-32 px-12">
      <div className="grid grid-cols-6 gap-10">
        {/* =====================================================
            LEFT SIDE
        ===================================================== */}
        <div className="col-span-4 space-y-10">
          {/* HEADER */}
          <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-orange-500">
                  Waste Listing
                </p>

                <h1 className="mt-3 text-3xl font-semibold text-black">
                  {listing.name}
                </h1>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Badge className="bg-black text-white">
                    {listing.marketMode?.replaceAll("_", " ")}
                  </Badge>

                  <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
                    {listing.participationMode}
                  </Badge>

                  {bidOver && (
                    <Badge className="bg-red-500 text-white">
                      Bidding Closed
                    </Badge>
                  )}

                  {isAssigned && (
                    <Badge className="bg-orange-500 text-black">Assigned</Badge>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5 text-right">
                <p className="text-xs uppercase tracking-widest text-black/40">
                  Current Bid
                </p>
                <p className="mt-1 text-2xl font-semibold text-black">
                  {formatMoney(listing.currentBid)}
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4">
              <InfoCard
                label="Starting Price"
                value={formatMoney(listing.startingPrice)}
              />

              <InfoCard label="Ends" value={formatTimestamp(listing.endDate)} />

              <InfoCard
                label="Status"
                value={isAssigned ? "Assigned" : bidOver ? "Closed" : "Open"}
              />
            </div>

            {organisation && (
              <div className="mt-6 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm text-black/60">
                Listed by{" "}
                <Link
                  href={`/home/organisations/${organisation.id}`}
                  className="font-medium text-black underline underline-offset-4 hover:text-orange-600"
                >
                  {organisation.teamName}
                </Link>
              </div>
            )}

            {isAssigned && (
              <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                This listing has already been assigned. Bidding is closed while
                the assignment is awaiting carrier action or completion.
              </div>
            )}

            {isAssignedToCurrentOrganisation && (
              <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                This listing has been assigned to your organisation. View the
                assignment from your operations dashboard.
              </div>
            )}
          </section>

          {/* IMAGES */}
          {fileKeys.length > 0 && (
            <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {fileKeys.slice(0, 3).map((key: string, index: number) => (
                <Image
                  key={`${key}-${index}`}
                  src={getImageUrl(key.trim())}
                  alt={listing.name}
                  width={600}
                  height={500}
                  className="h-64 rounded-3xl border border-black/10 object-cover shadow-sm"
                />
              ))}
            </section>
          )}

          {/* TEMPLATE DATA */}
          <section className="space-y-8">
            {templateSections.length > 0 ? (
              templateSections.map((section: any) => (
                <div
                  key={section.id}
                  className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm"
                >
                  <div className="mb-8">
                    <p className="text-xs uppercase tracking-[0.25em] text-orange-500">
                      Listing Details
                    </p>

                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black">
                      {section.title}
                    </h2>

                    <div className="mt-4 h-px bg-black/10" />
                  </div>

                  <div className="grid grid-cols-1 gap-x-16 gap-y-8 md:grid-cols-2">
                    {section.fields.map((field: any) => {
                      const value = templateData?.[field.key];

                      if (
                        value === undefined ||
                        value === null ||
                        value === ""
                      ) {
                        return null;
                      }

                      return (
                        <div key={field.id} className="flex flex-col">
                          <span className="mb-1 text-sm text-black/45">
                            {field.label}
                          </span>

                          <span className="text-base font-medium text-black">
                            {field.fieldType === "boolean"
                              ? value
                                ? "Yes"
                                : "No"
                              : String(value)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-black/10 bg-white p-8 text-sm text-black/50 shadow-sm">
                No additional listing details available.
              </div>
            )}
          </section>
        </div>

        {/* =====================================================
            RIGHT SIDEBAR
        ===================================================== */}
        <aside className="col-span-2 sticky top-32 h-fit space-y-6">
          {/* INTERNAL ASSIGNMENT */}
          {isInternal && isOwner && (
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-black">
                  Internal Assignment
                </h2>
                <p className="mt-1 text-sm text-black/50">
                  Assign this listing to an internal carrier department.
                </p>
              </div>

              {canAssign ? (
                <InternalAssignPanel
                  listingId={listing.id}
                  carriers={internalCarriers}
                />
              ) : (
                <AssignedNotice />
              )}
            </section>
          )}

          {/* BIDDING PANEL */}
          {showBiddingPanel && (
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-black">
                  Current Bids
                </h2>
                <p className="mt-1 text-sm text-black/50">
                  Review carrier offers for this waste listing.
                </p>
              </div>

              {!isOwner && (
                <div className="mb-5">
                  {canBid ? (
                    <PlaceBid
                      listingId={listing.id}
                      currentBid={listing.currentBid}
                    />
                  ) : (
                    <BidBlockedNotice
                      isAssigned={isAssigned}
                      bidOver={bidOver}
                      isBiddableMarket={isBiddableMarket}
                      participationAllowsExternalCarrier={
                        participationAllowsExternalCarrier
                      }
                    />
                  )}
                </div>
              )}

              <div className="max-h-[460px] space-y-4 overflow-y-auto pr-2">
                {bids.length > 0 ? (
                  bids.map((bid: any, index: number) => (
                    <div
                      key={bid.id}
                      className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {index === 0 && (
                            <Badge className="mb-3 bg-green-500 text-white">
                              Highest Bid
                            </Badge>
                          )}

                          <div className="text-2xl font-semibold text-black">
                            {formatMoney(bid.amount)}
                          </div>
                        </div>

                        {isAssigned && (
                          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                            Locked
                          </Badge>
                        )}
                      </div>

                      <div className="mt-3 space-y-1 text-sm">
                        <p className="text-black/60">
                          Bid by{" "}
                          <span className="font-medium text-black">
                            {bid.user?.name ?? "Unknown"}
                          </span>
                        </p>

                        <p className="text-black/60">
                          Organisation{" "}
                          <span className="font-medium text-black">
                            {bid.organisation?.teamName ?? "Unknown"}
                          </span>
                        </p>

                        <p className="text-xs text-black/40">
                          {formatTimestamp(bid.timestamp ?? null)}
                        </p>
                      </div>

                      {isOwner && (
                        <div className="mt-4">
                          {canAssign ? (
                            <AssignListingButton
                              listingId={listing.id}
                              bidId={bid.id}
                              assignedCarrierOrganisationId={
                                listing.assignedCarrierOrganisationId
                              }
                            />
                          ) : (
                            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
                              Assignment already created. Further assignment is
                              locked.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-6 text-center text-sm text-black/50">
                    No bids yet.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* WINNER */}
          <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-black">Winning Bid</h2>

            <div className="mt-4">
              <BidWinner winningBid={winningBid} />
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>
      <p className="mt-2 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function AssignedNotice() {
  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
      This listing has already been assigned. Internal assignment is locked.
    </div>
  );
}

function BidBlockedNotice({
  isAssigned,
  bidOver,
  isBiddableMarket,
  participationAllowsExternalCarrier,
}: {
  isAssigned: boolean;
  bidOver: boolean;
  isBiddableMarket: boolean;
  participationAllowsExternalCarrier: boolean;
}) {
  let message = "You cannot place a bid on this listing.";

  if (isAssigned) {
    message =
      "This listing has already been assigned, so new bids are no longer accepted.";
  } else if (bidOver) {
    message = "Bidding has closed for this listing.";
  } else if (!isBiddableMarket) {
    message = "This listing is not available for marketplace bidding.";
  } else if (!participationAllowsExternalCarrier) {
    message =
      "Your organisation is not approved to participate in bidding for this listing.";
  }

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
      {message}
    </div>
  );
}
