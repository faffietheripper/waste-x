"use server";

import { database } from "@/db/database";
import { organisations, users } from "@/db/schema";
import { auth, signOut } from "@/auth";
import { getSignedUrlForS3Object } from "@/lib/s3";
import { eq } from "drizzle-orm";
import type { ChainOfCustodyType } from "@/util/types";
import { redirect } from "next/navigation";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   S3 UPLOAD URL GENERATOR
========================================================= */

export const createUploadUrlAction = withErrorHandling(
  async (keys: string[], types: string[]) => {
    if (keys.length !== types.length) {
      throw new Error("Keys and types array must be of the same length.");
    }

    return Promise.all(
      keys.map((key, index) => getSignedUrlForS3Object(key, types[index])),
    );
  },
  {
    actionName: "createUploadUrlAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   FETCH ORGANISATION PROFILE
========================================================= */

export const fetchProfileAction = withErrorHandling(
  async () => {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const user = await database.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { organisationId: true },
    });

    if (!user?.organisationId) return null;

    return database.query.organisations.findFirst({
      where: eq(organisations.id, user.organisationId),
    });
  },
  {
    actionName: "fetchOrganisationProfile",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   SAVE / UPDATE PROFILE
========================================================= */

export const saveProfileAction = withErrorHandling(
  async (formData: FormData) => {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const userId = session.user.id;

    const user = await database.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { organisationId: true },
    });

    const existingOrgId = user?.organisationId;

    /* ===============================
       FORM DATA
    ============================== */

    const profilePicture = formData.get("profilePicture")?.toString() ?? null;
    const teamName = formData.get("teamName")?.toString();
    const industry = formData.get("industry")?.toString() ?? null;
    const telephone = formData.get("telephone")?.toString();
    const emailAddress = formData.get("emailAddress")?.toString();
    const country = formData.get("country")?.toString();
    const streetAddress = formData.get("streetAddress")?.toString();
    const city = formData.get("city")?.toString();
    const region = formData.get("region")?.toString();
    const postCode = formData.get("postCode")?.toString();

    const rawChain = formData.get("chainOfCustody");

    if (
      rawChain !== "wasteGenerator" &&
      rawChain !== "wasteManager" &&
      rawChain !== "wasteCarrier"
    ) {
      throw new Error("Invalid chain of custody value");
    }

    const chainOfCustody = rawChain as ChainOfCustodyType;

    /* ===============================
       UPDATE EXISTING ORG
    ============================== */

    if (existingOrgId) {
      const updateData: Partial<typeof organisations.$inferInsert> = {
        ...(profilePicture && { profilePicture }),
        ...(teamName && { teamName }),
        ...(chainOfCustody && { chainOfCustody }),
        ...(industry && { industry }),
        ...(telephone && { telephone }),
        ...(emailAddress && { emailAddress }),
        ...(country && { country }),
        ...(streetAddress && { streetAddress }),
        ...(city && { city }),
        ...(region && { region }),
        ...(postCode && { postCode }),
      };

      await database
        .update(organisations)
        .set(updateData)
        .where(eq(organisations.id, existingOrgId));

      return { success: true };
    }

    /* ===============================
       CREATE NEW ORG (WITH APPROVAL)
    ============================== */

    if (
      !teamName ||
      !telephone ||
      !emailAddress ||
      !country ||
      !streetAddress ||
      !city ||
      !region ||
      !postCode
    ) {
      throw new Error("Missing required organisation fields.");
    }

    const [newOrg] = await database
      .insert(organisations)
      .values({
        teamName,
        profilePicture,
        chainOfCustody,
        industry,
        telephone,
        emailAddress,
        country,
        streetAddress,
        city,
        region,
        postCode,
        status: "PENDING",
        createdAt: new Date(),
      })
      .returning();

    /* ===============================
       LINK USER AS ADMIN
    ============================== */

    await database
      .update(users)
      .set({
        organisationId: newOrg.id,
        role: "administrator",
      })
      .where(eq(users.id, userId));

    /* ===============================
       REDIRECT
    ============================== */

    redirect("/onboarding/pending");
  },
  {
    actionName: "saveOrganisationProfile",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high", // onboarding + org creation
  },
);

/* =========================================================
   ASSIGN ROLE
========================================================= */

export const assignRoleAction = withErrorHandling(
  async ({
    role,
  }: {
    role: "administrator" | "employee" | "seniorManagement";
  }) => {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    await database
      .update(users)
      .set({ role })
      .where(eq(users.id, session.user.id));

    // allow session update buffer
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await signOut({ redirectTo: "/" });
  },
  {
    actionName: "assignRoleAction",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high",
  },
);
