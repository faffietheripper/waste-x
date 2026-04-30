"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createOrganisation } from "../core/createOrganisation";
import { getOrganisationByUser } from "../queries/getOrganisation";
import { organisationSchema } from "../validators/organisationSchema";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const fetchOrganisationAction = withErrorHandling(
  async () => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    return getOrganisationByUser(session.user.id);
  },
  {
    actionName: "fetchOrganisation",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

export const createOrganisationAction = withErrorHandling(
  async (formData: FormData) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    const parsed = organisationSchema.safeParse({
      teamName: formData.get("teamName"),
      industry: formData.get("industry"),

      telephone: formData.get("telephone"),
      emailAddress: formData.get("emailAddress"),

      streetAddress: formData.get("streetAddress"),
      city: formData.get("city"),
      region: formData.get("region"),
      postCode: formData.get("postCode"),
      country: formData.get("country"),

      profilePicture: formData.get("profilePicture") || null,

      capabilities: formData.getAll("capabilities"),
    });

    if (!parsed.success) {
      throw new Error("INVALID_INPUT");
    }

    const result = await createOrganisation({
      userId: session.user.id,
      data: parsed.data,
    });

    if (result.organisationId) {
      redirect("/onboarding/pending");
    }

    return {
      success: true,
    };
  },
  {
    actionName: "createOrganisation",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
