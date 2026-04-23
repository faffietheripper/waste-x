export function canUserAccessListing({
  listing,
  userOrganisationId,
}: {
  listing: {
    organisationId: string;
    participationMode: "internal" | "external" | "mixed";
    allowedCarrierIds: string | null;
  };
  userOrganisationId: string;
}) {
  /* ===============================
     EXTERNAL → OPEN ACCESS
  ============================== */
  if (listing.participationMode === "external") {
    return true;
  }

  /* ===============================
     INTERNAL → SAME ORG ONLY
  ============================== */
  if (listing.participationMode === "internal") {
    return listing.organisationId === userOrganisationId;
  }

  /* ===============================
     MIXED → OWNER OR ALLOWED
  ============================== */
  if (listing.participationMode === "mixed") {
    const allowed = listing.allowedCarrierIds?.split(",").filter(Boolean) ?? [];

    return (
      listing.organisationId === userOrganisationId ||
      allowed.includes(userOrganisationId)
    );
  }

  /* ===============================
     FALLBACK (SAFE)
  ============================== */
  return false;
}
