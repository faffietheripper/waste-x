"use server";

import { signIn } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { LoginSchema } from "@/util/authSchema";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   GET USER (UTILITY)
========================================================= */

export async function getUserFromDb(email: string, password?: string) {
  const user = await database.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    return { success: false, message: "User not found." };
  }

  if (password) {
    const isValid = await bcrypt.compare(password, user.passwordHash!);
    if (!isValid) {
      return { success: false, message: "Incorrect password." };
    }
  }

  if (!user.isActive || user.isSuspended) {
    return { success: false, message: "Account inactive or suspended." };
  }

  return { success: true, data: user };
}

/* =========================================================
   LOGIN
========================================================= */

export const login = withErrorHandling(
  async ({ email, password }: { email: string; password: string }) => {
    /* ===============================
       VALIDATION (UX SAFE)
    ============================== */

    const parsed = LoginSchema.safeParse({ email, password });

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid email or password format.",
      };
    }

    /* ===============================
       AUTH ATTEMPT
    ============================== */

    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (!res || res.error) {
      return {
        success: false,
        message: "Invalid email or password.",
      };
    }

    return {
      success: true,
      data: res,
    };
  },
  {
    actionName: "login",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high", // auth = critical system
  },
);
