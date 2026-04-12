"use server";

import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

import { saveOrganisation } from "@/modules/organisations/actions/saveOrganisation";
import { getOrganisationByUser } from "@/modules/organisations/queries/getOrganisation";
import { organisationSchema } from "@/modules/organisations/validators/organisationSchema";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* ===============================
   FETCH PROFILE
============================== */

export const fetchProfileAction = withErrorHandling(
  async () => {
    const session = await auth();
    if (!session?.user?.id) throw new Error("UNAUTHORIZED");

    return getOrganisationByUser(session.user.id);
  },
  {
    actionName: "fetchOrganisationProfile",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* ===============================
   SAVE PROFILE
============================== */

export const saveProfileAction = withErrorHandling(
  async (formData: FormData) => {
    const session = await auth();
    if (!session?.user?.id) throw new Error("UNAUTHORIZED");

    const parsed = organisationSchema.safeParse({
      teamName: formData.get("teamName"),
      telephone: formData.get("telephone"),
      emailAddress: formData.get("emailAddress"),
      country: formData.get("country"),
      streetAddress: formData.get("streetAddress"),
      city: formData.get("city"),
      region: formData.get("region"),
      postCode: formData.get("postCode"),
      capabilities: formData.getAll("capabilities"),
    });

    if (!parsed.success) {
      throw new Error("INVALID_INPUT");
    }

    const result = await saveOrganisation({
      userId: session.user.id,
      data: parsed.data,
    });

    if (result.organisationId) {
      redirect("/onboarding/pending");
    }

    return { success: true };
  },
  {
    actionName: "saveOrganisationProfile",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
