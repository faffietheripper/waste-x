// utils/sendRegEmail.ts

import emailjs from "@emailjs/browser";

export async function sendRegEmail({
  name,
  email,
  token,
}: {
  name: string;
  email: string;
  token: string;
}) {
  const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID!;
  const TEMPLATE_ID = "template_yxsn82b"; // update if needed
  const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY!;

  // 🔑 Build invite link
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/setup-account?token=${token}`;

  try {
    const templateParams = {
      to_email: email,
      user_name: name,

      // 👇 IMPORTANT — pass link to template
      invite_link: link,
    };

    console.log("📨 Invite link:", link); // debug

    const response = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      templateParams,
      PUBLIC_KEY,
    );

    if (response.status === 200) {
      console.log("✅ Invite email sent.");
      return { success: true };
    } else {
      throw new Error("Failed to send email.");
    }
  } catch (error) {
    console.error("❌ EmailJS error:", error);
    return {
      success: false,
      message: "Failed to send invitation email.",
    };
  }
}
