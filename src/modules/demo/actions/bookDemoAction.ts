"use server";

import { Resend } from "resend";

import {
  buildDemoRequestEmail,
  type DemoRequestEmailData,
} from "@/modules/demo/core/demoEmailTemplate";

export type BookDemoActionResult = {
  ok: boolean;
  message: string;
};

export async function bookDemoAction(
  formData: FormData,
): Promise<BookDemoActionResult> {
  const website = cleanString(formData.get("website"));

  if (website) {
    return {
      ok: true,
      message: "Thanks — your demo request has been sent.",
    };
  }

  const firstName = cleanString(formData.get("firstName"));
  const lastName = cleanString(formData.get("lastName"));
  const email = cleanString(formData.get("email"));
  const phone = cleanString(formData.get("phone"));
  const companyName = cleanString(formData.get("companyName"));
  const companyType = cleanString(formData.get("companyType"));
  const organisationSize = cleanString(formData.get("organisationSize"));
  const message = cleanString(formData.get("message"));

  if (!firstName || !lastName || !email || !companyName) {
    return {
      ok: false,
      message:
        "Please complete your name, email address and company name before sending.",
    };
  }

  if (!isValidEmail(email)) {
    return {
      ok: false,
      message: "Please enter a valid email address.",
    };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.DEMO_REQUEST_TO_EMAIL ?? "tino@wastextracking.com";
  const fromEmail =
    process.env.DEMO_REQUEST_FROM_EMAIL ?? "Waste X <demo@wastextracking.com>";

    console.log("[BOOK_DEMO_ENV_CHECK]", {
  hasResendApiKey: Boolean(process.env.RESEND_API_KEY),
  resendPrefix: process.env.RESEND_API_KEY?.slice(0, 3),
  toEmail: process.env.DEMO_REQUEST_TO_EMAIL,
  fromEmail: process.env.DEMO_REQUEST_FROM_EMAIL,
}); 


  if (!resendApiKey) {
    console.error("[BOOK_DEMO_ERROR] Missing RESEND_API_KEY");

    return {
      ok: false,
      message:
        "Demo requests are not configured yet. Please email tino@wastextracking.com directly.",
    };
  }

  const request: DemoRequestEmailData = {
    firstName,
    lastName,
    email,
    phone,
    companyName,
    companyType,
    organisationSize,
    message,
    submittedAt: new Date().toISOString(),
  };

  const emailContent = buildDemoRequestEmail(request);

  try {
    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      replyTo: email,
    });

    if (error) {
      console.error("[BOOK_DEMO_RESEND_ERROR]", error);

      return {
        ok: false,
        message:
          "Sorry, we could not send your demo request right now. Please email tino@wastextracking.com directly.",
      };
    }

    return {
      ok: true,
      message:
        "Thanks — your demo request has been sent. We’ll get back to you shortly.",
    };
  } catch (error) {
    console.error("[BOOK_DEMO_ACTION_ERROR]", error);

    return {
      ok: false,
      message:
        "Sorry, we could not send your demo request right now. Please email tino@wastextracking.com directly.",
    };
  }
}

function cleanString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 2000);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}