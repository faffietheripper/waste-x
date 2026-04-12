"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

import { assignCarrierDirect } from "@/modules/assignments/actions/assignCarrierDirect";
import { createNotification } from "@/modules/notifications/services/createNotification";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const assignCarrierAction = withErrorHandling(
  async (listingId: number, carrierOrganisationId: string) => {
    const session = await auth();

    if (!session?.user?.id || !session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    const result = await assignCarrierDirect({
      listingId,
      carrierOrganisationId,
      assignedByOrganisationId: session.user.organisationId,
    });

    /* ===============================
       NOTIFICATION (SIDE EFFECT)
    ============================== */

    if (result.listing.userId) {
      await createNotification({
        recipientId: result.listing.userId,
        title: "Waste Carrier Assigned 🚛",
        message: `
Carrier: ${result.carrierOrg.teamName}
📧 ${result.carrierOrg.emailAddress}
📞 ${result.carrierOrg.telephone}

Verification Code: 🔐 ${result.verificationCode}
        `.trim(),
        type: "carrier_assigned",
        listingId,
      });
    }

    revalidatePath("/home/carrier-hub/waste-carriers/assigned-carrier-jobs");
    revalidatePath("/home/my-activity/jobs-in-progress");

    return { success: true };
  },
  {
    actionName: "assignCarrierAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
