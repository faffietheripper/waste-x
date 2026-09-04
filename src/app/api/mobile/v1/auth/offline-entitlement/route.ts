import { eq } from "drizzle-orm";

import { clientDevices } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";
import { createOfflineEntitlement } from "@/lib/client-api/offline-entitlement";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const device = await database.query.clientDevices.findFirst({
      where: eq(clientDevices.id, context.deviceId),
      columns: { deviceType: true },
    });
    if (device?.deviceType !== "MOBILE") {
      return clientApiError(
        "MOBILE_DEVICE_REQUIRED",
        403,
        "A registered Waste X Mobile device is required.",
      );
    }

    const deviceSecret = request.headers.get("x-waste-x-device-secret")?.trim();
    if (!deviceSecret) {
      return clientApiError(
        "DEVICE_SECRET_REQUIRED",
        401,
        "Waste X Mobile device authentication is required.",
      );
    }

    return clientApiJson({
      ok: true,
      offlineEntitlement: createOfflineEntitlement(context, deviceSecret),
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
