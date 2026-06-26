import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, carrierAssignments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

import PlaceBid from "@/components/app/MarketPlace/PlaceBid";
import InternalAssignPanel from "@/components/app/Listings/InternalAssignPanel";
import BidWinner from "@/components/app/BidWinner";
import AssignListingButton from "@/components/app/Listings/AssignListingButton";

import { Badge } from "@/components/ui/badge";

import { getBidsForListing } from "@/data-access/bids";
import { getWasteListing } from "@/data-access/wasteListings";
import { getOrganisationById } from "@/data-access/organisations";
import { getCarrierDepartments } from "@/data-access/departments";
import { getWinningBid } from "@/data-access/getWinningBid";

import { getImageUrl } from "@/util/files";
import { isBidOver } from "@/util/bids";

import { formatDistance } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { canUserAccessListing } from "@/modules/listings/core/canUserAccessListing";

import {
  type Capability,
  type DepartmentType,
  type Permission,
  hasOperationalPermission,
} from "@/modules/auth/core/permissions";

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

function formatDepartment(type: DepartmentType | null) {
  if (!type) return "Unknown";

  if (type === "generator") return "Generator";
  if (type === "carrier") return "Logistics";
  if (type === "manager") return "Waste Manager";
  if (type === "compliance") return "Compliance";

  return "Department";
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/* =========================================================
   PAGE
========================================================= */

export default async function ListingPage({ params }: any) {
  const listingId = Number(params.wasteListingId);

  if (!listingId || Number.isNaN(listingId)) {
    notFound();
  }

  /* =========================================================
     AUTH + OPERATIONAL CONTEXT
  ========================================================= */

  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  });

  if (!user?.organisationId || !user.organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  if (!user.department) {
    redirect("/home/settings/departments?reason=no-active-department");
  }

  const userOrg = user.organisationId;

  const capabilities =
    (user.organisation.capabilities as Capability[] | null) ?? [];

  const departmentType = user.department.type as DepartmentType;

  function can(permission: Permission) {
    return hasOperationalPermission({
      capabilities,
      departmentType,
      permission,
    });
  }

  const canViewListingByDepartment = can("listing:view");
  const canBidByDepartment = can("listing:bid");
  const canAssignBidByDepartment = can("listing:assign");
  const canDirectAssignByDepartment = can("listing:direct_assign");
  const canViewAssignmentByDepartment = can("assignment:view");

  /* =========================================================
     FETCH LISTING
  ========================================================= */

  const listing = await getWasteListing(listingId);

  if (!listing) {
    notFound();
  }

  /* =========================================================
     ORGANISATION-LEVEL LISTING VISIBILITY
  ========================================================= */

  if (!canUserAccessListing({ listing, userOrganisationId: userOrg })) {
    notFound();
  }

  /* =========================================================
     FETCH EXISTING ASSIGNMENT

     This is important.

     We do not rely only on listing.assignedCarrierOrganisationId because
     internal assignments may be represented by:
     - assignedCarrierDepartmentId
     - assignedAt
     - listing.status = "assigned"
     - carrierAssignments row
  ========================================================= */

  const [existingAssignment] = await database
    .select({
      id: carrierAssignments.id,
      status: carrierAssignments.status,
      carrierOrganisationId: carrierAssignments.carrierOrganisationId,
      managerOrganisationId: carrierAssignments.managerOrganisationId,
      assignedAt: carrierAssignments.assignedAt,
    })
    .from(carrierAssignments)
    .where(eq(carrierAssignments.listingId, listing.id))
    .orderBy(desc(carrierAssignments.assignedAt))
    .limit(1);

  /* =========================================================
     ASSIGNMENT LOCK

     This is the important bit.

     Once any of these are true, the listing is operationally locked:
     - assignment row exists
     - assigned carrier org exists
     - assigned internal department exists
     - assignedBy exists
     - assignedAt exists
     - winnerBid exists
     - listing lifecycle has moved beyond open
  ========================================================= */

  const assignedCarrierOrganisationId =
    listing.assignedCarrierOrganisationId ?? null;

  const isLockedByAssignmentRecord = Boolean(existingAssignment);

  const isLockedByListingSnapshot = Boolean(
    listing.assignedCarrierOrganisationId ||
      listing.assignedCarrierDepartmentId ||
      listing.assignedByOrganisationId ||
      listing.assignedAt ||
      listing.winnerBidId,
  );

  const isLockedByLifecycle = [
    "assigned",
    "in_progress",
    "completed",
    "cancelled",
  ].includes(listing.status ?? "");

  const isAssignmentLocked =
    isLockedByAssignmentRecord ||
    isLockedByListingSnapshot ||
    isLockedByLifecycle;

  const isOwner = listing.organisationId === userOrg;

  const isAssignedToCurrentOrganisation =
    assignedCarrierOrganisationId === userOrg ||
    existingAssignment?.carrierOrganisationId === userOrg ||
    existingAssignment?.managerOrganisationId === userOrg;

  /* =========================================================
     PAGE-LEVEL DEPARTMENT ACCESS
  ========================================================= */

  const canAccessThisPage =
    canBidByDepartment ||
    (isOwner && canViewListingByDepartment) ||
    (isAssignedToCurrentOrganisation && canViewAssignmentByDepartment);

  if (!canAccessThisPage) {
    notFound();
  }

  /* =========================================================
     FETCH RELATED DATA
  ========================================================= */

  const shouldLoadInternalCarriers =
    isOwner &&
    canDirectAssignByDepartment &&
    listing.marketMode === "internal_only" &&
    !isAssignmentLocked;

  const [organisation, bids, winningBidResult, internalCarriers] =
    await Promise.all([
      getOrganisationById(listing.organisationId),
      getBidsForListing(listing.id),
      getWinningBid(listingId),
      shouldLoadInternalCarriers ? getCarrierDepartments(userOrg) : [],
    ]);

  const { winningBid } = winningBidResult;

  /* =========================================================
     STATE LOGIC
  ========================================================= */

  const bidOver = await isBidOver(listing);

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
    FINAL RULES:

    - If listing is locked, nobody can bid.
    - If listing is locked, nobody can assign/reassign.
    - This applies to internal and external listings.
  */

  const canBid =
    canBidByDepartment &&
    !isOwner &&
    !isAssignmentLocked &&
    !bidOver &&
    isBiddableMarket &&
    participationAllowsExternalCarrier;

  const canAssignBid =
    canAssignBidByDepartment &&
    isOwner &&
    !isAssignmentLocked &&
    isBiddableMarket;

  const canAssignInternal =
    canDirectAssignByDepartment &&
    isOwner &&
    !isAssignmentLocked &&
    isInternal;

  const showInternalAssignmentPanel = isInternal && isOwner;

  const showBiddingPanel =
    isBiddableMarket && (canBidByDepartment || isOwner || bids.length > 0);

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

                  <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                    {formatDepartment(departmentType)}
                  </Badge>

                  {bidOver && !isAssignmentLocked && (
                    <Badge className="bg-red-500 text-white">
                      Bidding Closed
                    </Badge>
                  )}

                  {isAssignmentLocked && (
                    <Badge className="bg-orange-500 text-black">
                      Assignment Locked
                    </Badge>
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
                value={
                  isAssignmentLocked
                    ? formatLabel(listing.status ?? "assigned")
                    : bidOver
                      ? "Closed"
                      : "Open"
                }
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

            {isAssignmentLocked && (
              <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-800">
                This listing has already entered the assignment workflow.
                Bidding, internal assignment and external reassignment are now
                locked to protect the chain-of-custody record.
              </div>
            )}

            {isAssignedToCurrentOrganisation && (
              <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                This listing has been assigned to your organisation. View the
                assignment from your operations dashboard.
              </div>
            )}

            {!canBidByDepartment && !isOwner && (
              <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                Your current department can view this record, but it cannot bid
                on marketplace listings.
              </div>
            )}

            {isOwner &&
              !canAssignBidByDepartment &&
              !canDirectAssignByDepartment && (
                <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                  Your department can view this listing, but it cannot assign
                  work or perform operational listing actions.
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
          {showInternalAssignmentPanel && (
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-black">
                  Internal Assignment
                </h2>
                <p className="mt-1 text-sm text-black/50">
                  Assign this listing to an internal carrier department.
                </p>
              </div>

              {canAssignInternal ? (
                <InternalAssignPanel
                  listingId={listing.id}
                  carriers={internalCarriers}
                />
              ) : isAssignmentLocked ? (
                <AssignedNotice />
              ) : (
                <DepartmentBlockedNotice message="Your current department cannot directly assign internal carrier departments." />
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
                      isAssignmentLocked={isAssignmentLocked}
                      bidOver={bidOver}
                      isBiddableMarket={isBiddableMarket}
                      participationAllowsExternalCarrier={
                        participationAllowsExternalCarrier
                      }
                      canBidByDepartment={canBidByDepartment}
                    />
                  )}
                </div>
              )}

              {isOwner && isAssignmentLocked && (
                <div className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                  This listing is already assigned. You can review bids for
                  audit context, but you cannot accept another bid or reassign
                  this listing from here.
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

                        {isAssignmentLocked && (
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
                          {canAssignBid ? (
                            <AssignListingButton
                              listingId={listing.id}
                              bidId={bid.id}
                              assignedCarrierOrganisationId={
                                listing.assignedCarrierOrganisationId
                              }
                            />
                          ) : isAssignmentLocked ? (
                            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
                              Assignment already created. Further assignment is
                              locked.
                            </div>
                          ) : (
                            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
                              Your department can review bids but cannot assign
                              this listing.
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

function DepartmentBlockedNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
      {message}
    </div>
  );
}

function BidBlockedNotice({
  isAssignmentLocked,
  bidOver,
  isBiddableMarket,
  participationAllowsExternalCarrier,
  canBidByDepartment,
}: {
  isAssignmentLocked: boolean;
  bidOver: boolean;
  isBiddableMarket: boolean;
  participationAllowsExternalCarrier: boolean;
  canBidByDepartment: boolean;
}) {
  let message = "You cannot place a bid on this listing.";

  if (!canBidByDepartment) {
    message =
      "Your current department is not allowed to place marketplace bids.";
  } else if (isAssignmentLocked) {
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