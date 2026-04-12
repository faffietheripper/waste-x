N WRAPPER:
"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createListing } from "@/modules/listings/actions/createListing";
import { createListingSchema } from "@/modules/listings/validators/createListingSchema";
import { createUploadUrls } from "@/modules/listings/services/createUploadUrls";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { ratelimit } from "@/lib/rate-limit";

export const createUploadUrlAction = withErrorHandling(
  async (keys: string[], types: string[]) => {
    return createUploadUrls(keys, types);
  },
  {
    actionName: "createUploadUrlAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

export const createListingAction = withErrorHandling(
  async (input) => {
    const session = await auth();

    if (!session?.user?.id || !session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    if (ratelimit) {
      const { success } = await ratelimit.limit(session.user.id);
      if (!success) throw new Error("RATE_LIMITED");
    }

    const parsed = createListingSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("INVALID_DATA");
    }

    await createListing({
      ...parsed.data,
      organisationId: session.user.organisationId,
      userId: session.user.id,
    });

    revalidatePath("/home/waste-listings");
    redirect("/home/waste-listings");
  },
  {
    actionName: "createListingAction",
    code: ERROR_CODES.WASTE_INVALID_DATA,
    severity: "high",
  },
);