import { database } from "@/db/database";
import {
  wasteListings,
  listingTemplates,
  listingTemplateData,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { logRequest } from "@/lib/logger";

export async function createListing({
  organisationId,
  userId,
  templateId,
  templateData,
  fileName,
  startingPrice,
  endDate,
  name,
  location,
}: {
  organisationId: string;
  userId: string;
  templateId: string;
  templateData: Record<string, any>;
  fileName: string[];
  startingPrice: number;
  endDate: Date;
  name: string;
  location: string;
}) {
  const template = await database.query.listingTemplates.findFirst({
    where: eq(listingTemplates.id, templateId),
  });

  if (!template) {
    throw new Error("TEMPLATE_NOT_FOUND");
  }

  const [listing] = await database.transaction(async (tx) => {
    const [listing] = await tx
      .insert(wasteListings)
      .values({
        name,
        location,
        startingPrice,
        currentBid: startingPrice,
        fileKey: fileName.join(","),
        userId,
        organisationId,
        templateId: template.id,
        templateVersion: template.version,
        status: "open",
        endDate,
      })
      .returning();

    await tx.insert(listingTemplateData).values({
      organisationId,
      listingId: listing.id,
      templateId: template.id,
      templateVersion: template.version,
      dataJson: JSON.stringify(templateData),
    });

    logRequest(
      "create_listing",
      organisationId,
      userId,
      "waste_listing",
      listing.id.toString(),
    );

    return [listing];
  });

  return listing;
}
