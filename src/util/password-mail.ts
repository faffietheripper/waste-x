// src/util/sendEmail.ts
import emailjs from "@emailjs/browser";

export async function sendResetEmail(email: string, resetLink: string) {
  const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE_ID = "template_ttdi4gm";
  const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

  if (!SERVICE_ID || !PUBLIC_KEY) {
    throw new Error("Missing EmailJS environment variables");
  }

  try {
    const templateParams = {
      to_email: email,
      reset_link: resetLink,
    };

    const response = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      templateParams,
      PUBLIC_KEY,
    );

    if (response.status === 200) {
      console.log("Email sent successfully:", response);
      return {
        success: true,
        message: "Password reset link sent successfully.",
      };
    } else {
      console.error("Failed to send email:", response);
      throw new Error("Failed to send email.");
    }
  } catch (error) {
    console.error("EmailJS error:", error);
    return { success: false, message: "Error sending reset email." };
  }
}
