import { resolveListingType, ListingType } from "./resolveListingType";

type CreateListingInput = {
  templateId: string;
  templateData: Record<string, any>;

  name: string;
  location: string;
  startingPrice: number;
  endDate: Date;

  fileName: string[]; // coming from form

  participationMode: "internal" | "external" | "mixed";
  marketMode: "open_market" | "direct_award" | "internal_only" | "hybrid";

  allowedCarrierIds?: string[];
  listingType?: ListingType;
};

type Context = {
  userId: string;
  organisationId: string;
};

export function createListing(input: CreateListingInput, ctx: Context) {
  /* ===============================
     BASIC VALIDATION
  ============================== */

  if (!input.name.trim()) throw new Error("Name is required");
  if (!input.location.trim()) throw new Error("Location is required");
  if (!input.endDate) throw new Error("End date required");

  /* ===============================
     NORMALISE
  ============================== */

  const allowedCarrierIds = input.allowedCarrierIds ?? [];

  const fileKeys = Array.isArray(input.fileName)
    ? input.fileName.map((key) => key.trim()).filter(Boolean)
    : [];

  /* ===============================
     PARTICIPATION RULES
  ============================== */

  if (input.participationMode === "internal") {
    if (allowedCarrierIds.length === 0) {
      throw new Error("Internal listings require allowed carriers");
    }
  }

  /* ===============================
     MARKET RULES
  ============================== */

  let assignmentMethod: "bid" | "direct" | undefined;
  let assigned = false;

  if (input.marketMode === "open_market") {
    assignmentMethod = "bid";
  }

  if (input.marketMode === "direct_award") {
    assignmentMethod = "direct";
    assigned = true;
  }

  /* ===============================
     RESOLVE LISTING TYPE
  ============================== */

  const listingType = resolveListingType({
    inputType: input.listingType,
    participationMode: input.participationMode,
    marketMode: input.marketMode,
  });

  /* ===============================
     RETURN DB OBJECT
  ============================== */

  return {
    templateId: input.templateId,
    templateVersion: 1,
    templateData: input.templateData,

    name: input.name.trim(),
    location: input.location.trim(),

    startingPrice: input.startingPrice ?? 0,
    currentBid: 0,

    /*
      IMPORTANT:
      bb_waste_listing.fileKey is a text column.
      So for multiple images, we store them as a comma-separated string.

      Example:
      listings/img1.jpg,listings/img2.jpg,listings/img3.jpg
    */
    fileKey: fileKeys.join(","),

    endDate: input.endDate,

    participationMode: input.participationMode,
    marketMode: input.marketMode,
    listingType,

    assignmentMethod,
    assignedCarrierOrganisationId: null,
    assignedByOrganisationId: null,
    assignedAt: null,

    userId: ctx.userId,
    organisationId: ctx.organisationId,

    createdAt: new Date(),
  };
}