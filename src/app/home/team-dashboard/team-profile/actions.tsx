"use server";

import { database } from "@/db/database";
import { organisations, users } from "@/db/schema";
import { auth, signOut } from "@/auth";
import { getSignedUrlForS3Object } from "@/lib/s3";
import { eq } from "drizzle-orm";
import type { ChainOfCustodyType } from "@/util/types";
import { redirect } from "next/navigation";

/* =========================================================
   S3 UPLOAD URL GENERATOR
========================================================= */

export async function createUploadUrlAction(keys: string[], types: string[]) {
  if (keys.length !== types.length) {
    throw new Error("Keys and types array must be of the same length.");
  }

  return Promise.all(
    keys.map((key, index) => getSignedUrlForS3Object(key, types[index])),
  );
}

/* =========================================================
   FETCH ORGANISATION PROFILE
========================================================= */

export async function fetchProfileAction() {
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
}

/* =========================================================
   SAVE / UPDATE PROFILE
========================================================= */

export async function saveProfileAction(formData: FormData) {
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

      // 🔥 ONBOARDING CONTROL
      status: "PENDING",

      // optional but useful
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
     REDIRECT TO PENDING STATE
  ============================== */

  redirect("/onboarding/pending");
}

/* =========================================================
   ASSIGN ROLE
========================================================= */

export async function assignRoleAction({
  role,
}: {
  role: "administrator" | "employee" | "seniorManagement";
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await database
    .update(users)
    .set({ role })
    .where(eq(users.id, session.user.id));

  await new Promise((resolve) => setTimeout(resolve, 1500));

  await signOut({ redirectTo: "/" });
}
