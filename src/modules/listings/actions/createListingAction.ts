"use server";

import crypto from "crypto";

import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  listingTemplateData,
  listingTemplates,
  wasteListings,
} from "@/db/schema";
import { requireOrgUser } from "@/lib/access/require-org-user";
import { createListing } from "../core/createListing";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import {
  hasAnyDwtListingProfileValue,
  normaliseDwtListingProfile,
  safeParseDwtListingProfile,
} from "@/modules/digital-waste-tracking/core/dwtListingProfile";

export const createListingAction = withErrorHandling(
  async (input: any) => {
    const { userId, organisationId } = await requireOrgUser();

    const template = await database.query.listingTemplates.findFirst({
      where: eq(listingTemplates.id, input.templateId),
    });

    if (!template) {
      throw new Error("Template not found.");
    }

    if (template.organisationId !== organisationId) {
      throw new Error("You cannot create a listing from this template.");
    }

    if (!template.isLocked) {
      throw new Error("Template must be published before it can be used.");
    }

    const templateDwtProfile = safeParseDwtListingProfile(
      template.dwtProfileJson,
    );

    const submittedDwtProfile = normaliseDwtListingProfile(
      input.dwtSnapshot ?? templateDwtProfile,
    );

    const dwtSnapshot = normaliseDwtListingProfile({
      ...templateDwtProfile,
      ...submittedDwtProfile,
      templateId: template.id,
      templateVersion: template.version,
      capturedAt: new Date().toISOString(),
      capturedFrom: "listing_create_from_template",
    });

    const shouldStoreDwtSnapshot = hasAnyDwtListingProfileValue(dwtSnapshot);

    const listing = createListing(
      {
        ...input,
        templateVersion: template.version,
      },
      {
        userId,
        organisationId,
      },
    );

    const inserted = await database
      .insert(wasteListings)
      .values({
        ...listing,
        templateVersion: template.version,
        dwtSnapshotJson: shouldStoreDwtSnapshot
          ? JSON.stringify(dwtSnapshot)
          : null,
      })
      .returning({ id: wasteListings.id });

    const listingId = inserted?.[0]?.id;

    if (!listingId) {
      throw new Error("Failed to create listing");
    }

    await database.insert(listingTemplateData).values({
      id: crypto.randomUUID(),
      listingId,
      organisationId,
      templateId: template.id,
      templateVersion: template.version,
      dataJson: JSON.stringify(input.templateData ?? {}),
    });

    return {
      success: true,
      id: listingId,
      listingId,
      message: shouldStoreDwtSnapshot
        ? "Listing created with DWT prefill snapshot."
        : "Listing created. DWT details can be completed later.",
    };
  },
  {
    actionName: "createListing",
    code: ERROR_CODES.LISTING_CREATE_FAILED,
    severity: "high",
  },
);