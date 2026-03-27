"use server";

import { randomUUID } from "crypto";
import { add } from "date-fns";
import { database } from "@/db/database";
import { passwordResetTokens } from "@/db/schema";

export async function submitForgotPassword(formData: FormData) {
  const email = formData.get("email")?.toString();

  if (!email) {
    return { success: false, message: "Email is required." };
  }

  const resetToken = randomUUID();

  const baseUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

  const tokenExpiration = add(new Date(), { hours: 1 });

  try {
    await database.insert(passwordResetTokens).values({
      email,
      token: resetToken,
      expires: tokenExpiration,
      used: false,
    });

    return {
      success: true,
      resetLink,
      message: "If the email exists, a reset link has been generated.",
    };
  } catch (error) {
    console.error("Error storing reset token:", error);

    return {
      success: false,
      message: "An error occurred while processing your request.",
    };
  }
}
