"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { createListing } from "../core/createListing";

export async function createListingAction(data: {
  templateId: string;
  templateData: Record<string, any>;
  name: string;
  location: string;
  startingPrice: number;
  endDate: Date;
  fileName: string[];

  participationMode: "internal" | "external" | "mixed";
  marketMode: "open_market" | "direct_award" | "internal_only" | "hybrid";
  allowedCarrierIds: string[];
}) {
  const user = await requireOrgUser();

  return createListing({
    ...data,
    userId: user.userId,
    organisationId: user.organisationId,
  });
}
