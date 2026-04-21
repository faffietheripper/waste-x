"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

import { deleteListing } from "@/modules/listings/core/deleteListing";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const deleteListingAction = withErrorHandling(
  async (formData: FormData) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    const listingIdRaw = formData.get("listingId");

    if (typeof listingIdRaw !== "string" || isNaN(parseInt(listingIdRaw))) {
      throw new Error("INVALID_LISTING_ID");
    }

    const listingId = parseInt(listingIdRaw);

    await deleteListing({
      listingId,
      userId: session.user.id,
    });

    revalidatePath("/home/my-activity/archived-listings");
  },
  {
    actionName: "deleteListingAction",
    code: ERROR_CODES.WASTE_INVALID_DATA,
    severity: "high",
  },
);
