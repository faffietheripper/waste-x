import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, carrierAssignments, wasteListings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

import {
  formatDwtHazardAnswer,
  getDwtListingProfileReadiness,
  safeParseDwtListingProfile,
  type DwtListingProfile,
} from "@/modules/digital-waste-tracking/core/dwtListingProfile";

import PlaceBid from "@/components/app/MarketPlace/PlaceBid";
import InternalAssignPanel from "@/components/app/Listings/InternalAssignPanel";
import BidWinner from "@/components/app/BidWinner";
import AssignListingButton from "@/components/app/Listings/AssignListingButton";
import StartSelfManagedJobButton from "@/components/app/Listings/StartSelfManagedJobButton";

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
  getEffectiveDepartmentTypeForPermission,
  hasOperationalPermissionForOrganisation,
} from "@/modules/auth/core/permissions";

/* =========================================================
   TYPES
========================================================= */

type ListingPageParams = {
  params: Promise<{
    wasteListingId: string;
  }>;
};

/* =========================================================
   HELPERS
========================================================= */

function formatTimestamp(timestamp: Date | string | null | undefined) {
  if (!timestamp) return "Unknown";

  const parsed = new Date(timestamp);

  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown";
  }

  return formatDistance(parsed, new Date(), {
    addSuffix: true,
  });
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "£0";

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return "£0";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(numberValue);
}

function formatDepartment(type: DepartmentType | null | undefined) {
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

function parseFileKeys(fileKey: string | null | undefined) {
  if (!fileKey) return [];

  const raw = fileKey.trim();

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }

          if (item && typeof item === "object") {
            const possibleKey =
              item.key ??
              item.fileKey ??
              item.file_key ??
              item.url ??
              item.path ??
              "";

            return String(possibleKey).trim();
          }

          return "";
        })
        .filter(Boolean);
    }

    if (parsed && typeof parsed === "object") {
      const possibleKeys =
        parsed.keys ??
        parsed.fileKeys ??
        parsed.file_keys ??
        parsed.files ??
        parsed.images ??
        null;

      if (Array.isArray(possibleKeys)) {
        return possibleKeys
          .map((item) => {
            if (typeof item === "string") {
              return item.trim();
            }

            if (item && typeof item === "object") {
              const possibleKey =
                item.key ??
                item.fileKey ??
                item.file_key ??
                item.url ??
                item.path ??
                "";

              return String(possibleKey).trim();
            }

            return "";
          })
          .filter(Boolean);
      }

      const possibleSingleKey =
        parsed.key ??
        parsed.fileKey ??
        parsed.file_key ??
        parsed.url ??
        parsed.path ??
        "";

      if (possibleSingleKey) {
        return [String(possibleSingleKey).trim()].filter(Boolean);
      }
    }
  } catch {
    // Not JSON. Continue to string splitting below.
  }

  return raw
    .split(/[,;\n|]+/)
    .map((key) => key.trim())
    .map((key) => key.replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function parseAllowedCarrierIds(value: unknown) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\n|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

/* =========================================================
   PAGE
========================================================= */

export default async function ListingPage({ params }: ListingPageParams) {
  const { wasteListingId } = await params;
  const listingId = Number(wasteListingId);

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

  const currentOrganisation = user.organisation;
  const isSoloOrganisation = currentOrganisation.operatingMode === "solo";

  if (!user.department && !isSoloOrganisation) {
    redirect("/home/settings/departments?reason=no-active-department");
  }

  const userOrg = user.organisationId;

  const capabilities =
    (currentOrganisation.capabilities as Capability[] | null) ?? [];

  const departmentType =
    (user.department?.type as DepartmentType | undefined) ?? null;

  const effectiveBidDepartmentType = getEffectiveDepartmentTypeForPermission({
    operatingMode: currentOrganisation.operatingMode,
    departmentType,
    permission: "listing:bid",
  });

  const effectiveAssignCarrierDepartmentType =
    getEffectiveDepartmentTypeForPermission({
      operatingMode: currentOrganisation.operatingMode,
      departmentType,
      permission: "assignment:assign_carrier",
    });

  const displayDepartmentType = effectiveBidDepartmentType ?? departmentType;

  function can(permission: Permission) {
    return hasOperationalPermissionForOrganisation({
      capabilities,
      departmentType,
      permission,
      operatingMode: currentOrganisation.operatingMode,
    });
  }

  const canViewListingByDepartment = can("listing:view");
  const canBidByDepartment = can("listing:bid");

  /*
    Build-safe:
    Your current permission matrix already has "listing:direct_assign".
    We reuse it for accepting/assigning bids from the listing owner side.
    If you later add "listing:assign" to permissions.ts, you can split this.
  */
  const canAssignBidByDepartment = can("listing:direct_assign");

  const canDirectAssignByDepartment = can("listing:direct_assign");
  const canViewAssignmentByDepartment = can("assignment:view");
  const canAssignCarrierByDepartment = can("assignment:assign_carrier");

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

     This supports both:
     - generator/internal assignment
     - external manager-won marketplace assignment
  ========================================================= */

  const [existingAssignment] = await database
    .select({
      id: carrierAssignments.id,
      status: carrierAssignments.status,
      carrierOrganisationId: carrierAssignments.carrierOrganisationId,
      managerOrganisationId: carrierAssignments.managerOrganisationId,
      managerAcceptedAt: carrierAssignments.managerAcceptedAt,
      carrierAssignedAt: carrierAssignments.carrierAssignedAt,
      assignedAt: carrierAssignments.assignedAt,
    })
    .from(carrierAssignments)
    .where(eq(carrierAssignments.listingId, listing.id))
    .orderBy(desc(carrierAssignments.assignedAt))
    .limit(1);

  /* =========================================================
     ASSIGNMENT LOCK
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
     EXTERNAL MANAGER → CARRIER ASSIGNMENT RULE

     Hybrid Waste X flow:
     generator accepts manager bid
     manager accepts external job
     manager then assigns a carrier

     This is separate from:
     - generator internal assignment
     - direct award
  ========================================================= */

  const isExternalManagerWorkflow =
    effectiveAssignCarrierDepartmentType === "manager" &&
    !isOwner &&
    Boolean(existingAssignment) &&
    existingAssignment?.managerOrganisationId === userOrg &&
    (listing.marketMode === "open_market" || listing.marketMode === "hybrid");

  const managerCanAssignExternalCarrier =
    canAssignCarrierByDepartment &&
    isExternalManagerWorkflow &&
    Boolean(existingAssignment?.managerAcceptedAt) &&
    !existingAssignment?.carrierOrganisationId &&
    !["completed", "cancelled", "rejected", "in_progress"].includes(
      existingAssignment?.status ?? "",
    );

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

  /*
    Clean fix:
    getWinningBid() does not need to return id.
    The canonical winning bid id is already stored on the listing snapshot.
  */
  const winningBidId = listing.winnerBidId ?? null;

  /* =========================================================
     STATE LOGIC
  ========================================================= */

  const bidOver = await isBidOver(listing);

  const allowedCarrierIds = parseAllowedCarrierIds(listing.allowedCarrierIds);

  const isAllowedCarrier = allowedCarrierIds.includes(userOrg);

  const isInternal = listing.marketMode === "internal_only";

  const isBiddableMarket =
    listing.marketMode === "open_market" || listing.marketMode === "hybrid";

  const participationAllowsExternalCarrier =
    listing.participationMode === "external" ||
    (listing.participationMode === "mixed" && isAllowedCarrier);

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
  isInternal &&
  !isSoloOrganisation;

const canStartSelfManagedJob =
  isSoloOrganisation &&
  canDirectAssignByDepartment &&
  isOwner &&
  listing.status === "open" &&
  !isAssignmentLocked &&
  !existingAssignment &&
  !listing.assignedCarrierOrganisationId;

const showInternalAssignmentPanel = isInternal && isOwner && !isSoloOrganisation;

  const showManagerCarrierHubPrompt =
    managerCanAssignExternalCarrier && Boolean(existingAssignment);

  const showManagerCarrierWaitingPanel =
    isExternalManagerWorkflow &&
    !managerCanAssignExternalCarrier &&
    !existingAssignment?.carrierOrganisationId &&
    !["completed", "cancelled", "rejected"].includes(
      existingAssignment?.status ?? "",
    );

  const showBiddingPanel =
    isBiddableMarket && (canBidByDepartment || isOwner || bids.length > 0);

  const fileKeys = parseFileKeys(listing.fileKey);
  const previewFileKeys = fileKeys.slice(0, 3);
  const extraImageCount = Math.max(fileKeys.length - previewFileKeys.length, 0);

  /* =========================================================
     TEMPLATE DATA
  ========================================================= */

  const templateDataRecord = listing.templateData?.[0] ?? null;

  const templateData = templateDataRecord
    ? JSON.parse(templateDataRecord.dataJson || "{}")
    : {};

  const templateSections = templateDataRecord?.template?.sections ?? [];

const [listingDwtSnapshotRecord] = await database
  .select({
    dwtSnapshotJson: wasteListings.dwtSnapshotJson,
  })
  .from(wasteListings)
  .where(eq(wasteListings.id, listing.id))
  .limit(1);

const dwtSnapshot = safeParseDwtListingProfile(
  (listing as { dwtSnapshotJson?: string | null }).dwtSnapshotJson ??
    listingDwtSnapshotRecord?.dwtSnapshotJson ??
    null,
);

const dwtReadiness = getDwtListingProfileReadiness(dwtSnapshot);

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-12 py-32 pl-[24vw]">
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
                    {formatDepartment(displayDepartmentType)}
                  </Badge>
                  <Badge
  className={
    dwtReadiness.tone === "success"
      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
      : dwtReadiness.tone === "warning"
        ? "bg-orange-100 text-orange-700 hover:bg-orange-100"
        : "bg-gray-100 text-gray-600 hover:bg-gray-100"
  }
>
  {dwtReadiness.label}
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

                  {isExternalManagerWorkflow && (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      Manager Job
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

            {isExternalManagerWorkflow && (
              <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-800">
                You are managing this external marketplace job. Carrier selection
                is handled in the Carrier Hub so you can compare carrier details
                before assigning collection.
              </div>
            )}

            {!canBidByDepartment && !isOwner && !isExternalManagerWorkflow && (
              <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                Your current workspace can view this record, but it cannot bid
                on marketplace listings.
              </div>
            )}

            {isOwner &&
              !canAssignBidByDepartment &&
              !canDirectAssignByDepartment && (
                <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                  Your current workspace can view this listing, but it cannot assign
                  work or perform operational listing actions.
                </div>
              )}
          </section>
          <DwtListingPrefillPanel
  profile={dwtSnapshot}
  readiness={dwtReadiness}
/>

          {/* IMAGES */}
          {fileKeys.length > 0 ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                    Listing Images
                  </p>

                  <p className="mt-1 text-sm text-black/45">
                    Showing {previewFileKeys.length} of {fileKeys.length} image
                    {fileKeys.length === 1 ? "" : "s"}.
                  </p>
                </div>

                {extraImageCount > 0 && (
                  <span className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/45">
                    +{extraImageCount} more saved
                  </span>
                )}
              </div>

              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {previewFileKeys.map((key: string, index: number) => (
                  <div
                    key={`${key}-${index}`}
                    className="relative h-64 overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm"
                  >
                    <Image
                      src={getImageUrl(key)}
                      alt={`${listing.name} image ${index + 1}`}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      className="object-cover"
                    />

                    {index === previewFileKeys.length - 1 &&
                      extraImageCount > 0 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                          <span className="rounded-full bg-black/70 px-5 py-3 text-sm font-semibold">
                            +{extraImageCount} more
                          </span>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="rounded-3xl border border-dashed border-black/20 bg-white p-8 text-sm text-black/45 shadow-sm">
              No listing images were uploaded for this record.
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
       <aside className="sticky top-32 col-span-2 h-fit space-y-6">
  {/* SOLO SELF-MANAGED JOB */}
  {canStartSelfManagedJob && (
    <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-orange-700">
        Solo workflow
      </p>

      <h2 className="mt-3 text-xl font-semibold text-black">
        Start self-managed job
      </h2>

      <p className="mt-2 text-sm leading-6 text-orange-900/75">
        Because this is a solo organisation, you can act as the generator,
        manager and carrier for this listing. Waste X will create the assignment
        and send you straight into the operational workflow.
      </p>

      <div className="mt-5">
        <StartSelfManagedJobButton listingId={listing.id} />
      </div>
    </section>
  )}

  {/* MANAGER CARRIER HUB PROMPT FOR EXTERNAL MARKETPLACE JOB */}
          {showManagerCarrierHubPrompt && existingAssignment && (
            <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-700">
                Carrier Assignment
              </p>

              <h2 className="mt-3 text-xl font-semibold text-black">
                Choose carrier in Carrier Hub
              </h2>

              <p className="mt-2 text-sm leading-6 text-orange-900/75">
                This listing has entered the assignment workflow. Carrier
                selection is now handled in the Carrier Hub so you can compare
                carrier workload, incidents, contact details and recommendation
                signals before assigning the job.
              </p>

              <Link
                href={`/home/operations/carriers?assignmentId=${existingAssignment.id}`}
                className="mt-5 flex w-full justify-center rounded-2xl bg-black px-5 py-4 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
              >
                Open Carrier Hub →
              </Link>
            </section>
          )}

          {/* MANAGER WAITING / BLOCKED PANEL */}
          {showManagerCarrierWaitingPanel && existingAssignment && (
            <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-orange-900">
                Carrier assignment not available yet
              </h2>

              <p className="mt-2 text-sm leading-6 text-orange-800">
                This external job is assigned to your manager organisation. Once
                the manager acceptance step is completed, carrier selection will
                unlock in the Carrier Hub.
              </p>

              <div className="mt-5 space-y-2 text-sm text-orange-800">
                <p>
                  Manager accepted:{" "}
                  <strong>
                    {existingAssignment.managerAcceptedAt ? "Yes" : "No"}
                  </strong>
                </p>

                <p>
                  Carrier assigned:{" "}
                  <strong>
                    {existingAssignment.carrierOrganisationId ? "Yes" : "No"}
                  </strong>
                </p>

                <p>
                  Assignment status:{" "}
                  <strong>{formatLabel(existingAssignment.status)}</strong>
                </p>
              </div>
            </section>
          )}

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
                <DepartmentBlockedNotice message="Your current workspace cannot directly assign internal carrier departments." />
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

              {!isOwner && !isExternalManagerWorkflow && (
                <div className="mb-5">
                  {canBid ? (
  <PlaceBid
    listingId={listing.id}
    currentBid={Number(listing.currentBid ?? 0)}
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

              {isExternalManagerWorkflow && (
                <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-800">
                  <p>
                    Your organisation won this marketplace job. Carrier selection
                    happens in the Carrier Hub so you can compare carriers before
                    assigning collection.
                  </p>

                  {existingAssignment && managerCanAssignExternalCarrier && (
                    <Link
                      href={`/home/operations/carriers?assignmentId=${existingAssignment.id}`}
                      className="mt-3 inline-flex rounded-full bg-black px-4 py-2 text-xs font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                    >
                      Open Carrier Hub →
                    </Link>
                  )}
                </div>
              )}

              <div className="max-h-[460px] space-y-4 overflow-y-auto pr-2">
                {bids.length > 0 ? (
                  bids.map((bid: any, index: number) => (
                    <div
                      key={bid.id}
                      className={`rounded-2xl border p-4 ${
                        winningBidId === bid.id
                          ? "border-green-200 bg-green-50"
                          : "border-black/10 bg-[#fbfaf7]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {winningBidId === bid.id ? (
                            <Badge className="mb-3 bg-green-500 text-white">
                              Winning Bid
                            </Badge>
                          ) : (
                            index === 0 &&
                            !isAssignmentLocked && (
                              <Badge className="mb-3 bg-green-500 text-white">
                                Highest Bid
                              </Badge>
                            )
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
      <p className="text-xs uppercase tracking-widest text-black/40">
        {label}
      </p>

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
      "Your current workspace is not allowed to place marketplace bids.";
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

function DwtListingPrefillPanel({
  profile,
  readiness,
}: {
  profile: DwtListingProfile;
  readiness: ReturnType<typeof getDwtListingProfileReadiness>;
}) {
  const panelClass =
    readiness.tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : readiness.tone === "warning"
        ? "border-orange-200 bg-orange-50"
        : "border-black/10 bg-white";

  const textClass =
    readiness.tone === "success"
      ? "text-emerald-800"
      : readiness.tone === "warning"
        ? "text-orange-800"
        : "text-black/60";

  return (
    <section className={`rounded-3xl border p-8 shadow-sm ${panelClass}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
            Waste & DWT Prefill
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-black">
            Compliance readiness for this listing
          </h2>

          <p className={`mt-2 max-w-3xl text-sm leading-6 ${textClass}`}>
            This information was captured from the template/listing form to help
            the manager or receiver prefill the Digital Waste Tracking intake
            later. It does not replace final receiver confirmation.
          </p>
        </div>

        <span className="rounded-full border border-current/20 bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black/60">
          {readiness.completedFields}/{readiness.totalFields} fields
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DwtInfo label="EWC code(s)" value={profile.ewcCodes} />
        <DwtInfo label="Physical form" value={profile.physicalForm} />
        <DwtInfo label="Container type" value={profile.typeOfContainers} />
        <DwtInfo
          label="Containers"
          value={profile.numberOfContainers}
        />
        <DwtInfo
          label="Estimated weight"
          value={
            profile.weightAmount
              ? `${profile.weightAmount} ${profile.weightMetric}${
                  profile.weightIsEstimate ? " estimated" : ""
                }`
              : ""
          }
        />
        <DwtInfo
          label="POPs"
          value={formatDwtHazardAnswer(profile.containsPops)}
        />
        <DwtInfo
          label="Hazardous"
          value={formatDwtHazardAnswer(profile.containsHazardous)}
        />
        <DwtInfo
          label="Recovery/disposal"
          value={profile.disposalOrRecoveryCode}
        />
      </div>

      {profile.wasteDescription && (
        <div className="mt-5 rounded-2xl border border-black/10 bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/35">
            DWT waste description
          </p>

          <p className="mt-2 text-sm leading-6 text-black/65">
            {profile.wasteDescription}
          </p>
        </div>
      )}

      {(readiness.missing.length > 0 || readiness.warnings.length > 0) && (
        <div className="mt-5 rounded-2xl border border-black/10 bg-white/70 p-4">
          <p className="text-sm font-semibold text-black">
            Still needed before final DWT submission
          </p>

          {readiness.missing.length > 0 && (
            <p className="mt-2 text-sm leading-6 text-black/55">
              {readiness.missing.join(", ")}
            </p>
          )}

          {readiness.warnings.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-orange-800">
              {readiness.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function DwtInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-black/70">
        {value || "Not set"}
      </p>
    </div>
  );
}