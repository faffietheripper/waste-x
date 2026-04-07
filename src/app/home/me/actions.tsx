"use server";

import { database } from "@/db/database";
import { userProfiles, users } from "@/db/schema";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { getSignedUrlForS3Object } from "@/lib/s3";
import { eq } from "drizzle-orm";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   TYPES
========================================================= */

type UserRole =
  | "administrator"
  | "employee"
  | "seniorManagement"
  | "platform_admin";

/* =========================================================
   CREATE SIGNED UPLOAD URL
========================================================= */

export const createUploadUrlAction = withErrorHandling(
  async (keys: string[], types: string[]) => {
    if (!keys.length || !types.length) return [];

    const uploadUrls = await Promise.all(
      keys.map((key, i) => {
        const type = types[i];
        if (!key || !type) return null;
        return getSignedUrlForS3Object(key, type);
      }),
    );

    return uploadUrls;
  },
  {
    actionName: "createUploadUrlAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   FETCH PROFILE
========================================================= */

export const fetchProfileAction = withErrorHandling(
  async () => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    const profile = await database.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, session.user.id),
    });

    return profile ?? null;
  },
  {
    actionName: "fetchProfileAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   SAVE / UPDATE PROFILE
========================================================= */

export const saveProfileAction = withErrorHandling(
  async (data: {
    profilePicture?: string;
    fullName: string;
    telephone?: string;
    emailAddress?: string;
    country?: string;
    streetAddress?: string;
    city?: string;
    region?: string;
    postCode?: string;
  }) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    const userId = session.user.id;

    const existingProfile = await database.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    if (existingProfile) {
      await database
        .update(userProfiles)
        .set({
          profilePicture: data.profilePicture,
          fullName: data.fullName,
          telephone: data.telephone,
          emailAddress: data.emailAddress,
          country: data.country,
          streetAddress: data.streetAddress,
          city: data.city,
          region: data.region,
          postCode: data.postCode,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId));
    } else {
      await database.insert(userProfiles).values({
        userId,
        profilePicture: data.profilePicture,
        fullName: data.fullName,
        telephone: data.telephone,
        emailAddress: data.emailAddress,
        country: data.country,
        streetAddress: data.streetAddress,
        city: data.city,
        region: data.region,
        postCode: data.postCode,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    redirect("/home");
  },
  {
    actionName: "saveProfileAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* =========================================================
   ASSIGN ROLE
========================================================= */

export const assignRoleAction = withErrorHandling(
  async (role: UserRole) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    await database
      .update(users)
      .set({ role })
      .where(eq(users.id, session.user.id));

    /**
     * Force re-auth to refresh session role
     */
    await signOut({
      redirectTo: "/",
    });
  },
  {
    actionName: "assignRoleAction",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high",
  },
);
