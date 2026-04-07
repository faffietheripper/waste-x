"use server";

import { revalidatePath } from "next/cache";
import { database } from "@/db/database";
import {
  wasteListings,
  listingTemplates,
  listingTemplateData,
} from "@/db/schema";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getSignedUrlForS3Object } from "@/lib/s3";
import { eq } from "drizzle-orm";
import { requireOrgUser } from "@/lib/access/require-org-user";
import { ratelimit } from "@/lib/rate-limit";
import { z } from "zod";
import { logRequest } from "@/lib/logger";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_FILES = 10;

const allowedFileTypes = ["image/jpeg", "image/png", "application/pdf"];

/* =========================================================
   VALIDATION
========================================================= */

const createListingSchema = z.object({
  templateId: z.string().uuid(),
  templateData: z.record(z.any()),
  fileName: z.array(z.string()),
  startingPrice: z.number().min(0),
  endDate: z.date(),
  name: z.string().min(3).max(200),
  location: z.string().min(3).max(200),
});

/* =========================================================
   GENERATE S3 UPLOAD URLS
========================================================= */

export const createUploadUrlAction = withErrorHandling(
  async (keys: string[], types: string[]) => {
    if (keys.length !== types.length) {
      throw new Error("Keys and types must match.");
    }

    if (keys.length > MAX_FILES) {
      throw new Error(`Maximum ${MAX_FILES} files allowed.`);
    }

    types.forEach((type) => {
      if (!allowedFileTypes.includes(type)) {
        throw new Error(`Invalid file type: ${type}`);
      }
    });

    const signedUrls = await Promise.all(
      keys.map((key, i) => getSignedUrlForS3Object(key, types[i])),
    );

    return signedUrls;
  },
  {
    actionName: "createUploadUrlAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   CREATE LISTING
========================================================= */

export const createListingAction = withErrorHandling(
  async (input: {
    templateId: string;
    templateData: Record<string, any>;
    fileName: string[];
    startingPrice: number;
    endDate: Date;
    name: string;
    location: string;
  }) => {
    const session = await auth();

    if (!session?.user?.id || !session?.user?.organisationId) {
      throw new Error("Unauthorized");
    }

    const organisationId = session.user.organisationId;
    const userId = session.user.id;

    /* ================= RATE LIMIT ================= */

    if (ratelimit) {
      const { success } = await ratelimit.limit(userId);

      if (!success) {
        throw new Error("Too many requests. Please slow down.");
      }
    }

    /* ================= VALIDATION ================= */

    const parsed = createListingSchema.safeParse(input);

    if (!parsed.success) {
      throw new Error("Invalid listing data.");
    }

    const {
      templateId,
      templateData,
      fileName,
      startingPrice,
      endDate,
      name,
      location,
    } = parsed.data;

    if (fileName.length > MAX_FILES) {
      throw new Error(`Maximum ${MAX_FILES} files allowed.`);
    }

    /* ================= TEMPLATE CHECK ================= */

    const template = await database.query.listingTemplates.findFirst({
      where: eq(listingTemplates.id, templateId),
    });

    if (!template) {
      throw new Error("Template not found.");
    }

    /* ================= TRANSACTION ================= */

    await database.transaction(async (tx) => {
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

      /* ================= AUDIT LOG ================= */

      logRequest(
        "create_listing",
        organisationId,
        userId,
        "waste_listing",
        listing.id.toString(),
      );
    });

    revalidatePath("/home/waste-listings");
    redirect("/home/waste-listings");
  },
  {
    actionName: "createListingAction",
    code: ERROR_CODES.WASTE_INVALID_DATA,
    severity: "high",
  },
);

/* =========================================================
   LOAD TEMPLATE STRUCTURE
========================================================= */

export const getTemplateWithStructure = withErrorHandling(
  async (templateId: string) => {
    await requireOrgUser();

    if (!templateId) {
      throw new Error("Template ID required.");
    }

    const template = await database.query.listingTemplates.findFirst({
      where: eq(listingTemplates.id, templateId),
      with: {
        sections: {
          orderBy: (sections, { asc }) => [asc(sections.orderIndex)],
          with: {
            fields: {
              orderBy: (fields, { asc }) => [asc(fields.orderIndex)],
            },
          },
        },
      },
    });

    if (!template) {
      throw new Error("Template not found.");
    }

    return template;
  },
  {
    actionName: "getTemplateWithStructure",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);
