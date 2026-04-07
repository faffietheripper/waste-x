"use server";

import { signIn, signOut } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { RegisterSchema } from "@/util/authSchema";
import { eq } from "drizzle-orm";
import bcryptjs from "bcryptjs";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   GET USER (UTILITY)
========================================================= */

export async function getUserFromDb(email: string) {
  const existedUser = await database.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!existedUser) {
    return {
      success: false,
      message: "User not found.",
    };
  }

  return {
    success: true,
    data: existedUser,
  };
}

/* =========================================================
   REGISTER USER
========================================================= */

export const registerUser = withErrorHandling(
  async ({
    name,
    email,
    password,
    confirmPassword,
  }: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    /* ===============================
       VALIDATION (UX SAFE)
    ============================== */

    const parsed = RegisterSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid registration details.",
      };
    }

    /* ===============================
       CHECK EXISTING USER
    ============================== */

    const existingUser = await database.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return {
        success: false,
        message: "User already exists.",
      };
    }

    /* ===============================
       HASH PASSWORD
    ============================== */

    const passwordHash = await bcryptjs.hash(password, 10);

    /* ===============================
       CREATE USER
    ============================== */

    const [user] = await database
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        role: "employee",
        isActive: true,
        isSuspended: false,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      });

    return {
      success: true,
      data: user,
    };
  },
  {
    actionName: "registerUser",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high", // auth system critical
  },
);
