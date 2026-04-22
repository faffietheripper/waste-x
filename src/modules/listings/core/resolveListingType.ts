export type ListingType =
  | "waste_collection"
  | "material_sale"
  | "internal_transfer";

export function resolveListingType({
  inputType,
  participationMode,
  marketMode,
}: {
  inputType?: ListingType;
  participationMode: "internal" | "external" | "mixed";
  marketMode: "open_market" | "direct_award" | "internal_only" | "hybrid";
}): ListingType {
  /* ===============================
     FORCE INTERNAL LOGIC
  ============================== */
  if (participationMode === "internal") {
    return "internal_transfer";
  }

  /* ===============================
     USE EXPLICIT INPUT
  ============================== */
  if (inputType) {
    return inputType;
  }

  /* ===============================
     CONTROLLED FALLBACKS
  ============================== */
  if (marketMode === "open_market") {
    return "waste_collection";
  }

  if (marketMode === "direct_award") {
    return "waste_collection";
  }

  if (marketMode === "hybrid") {
    return "waste_collection";
  }

  /* ===============================
     FAIL LOUD
  ============================== */
  throw new Error("Unable to resolve listing type");
}
