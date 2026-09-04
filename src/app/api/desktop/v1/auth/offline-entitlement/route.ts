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

    const deviceSecret = request.headers.get("x-waste-x-device-secret")?.trim();
    if (!deviceSecret) {
      return clientApiError(
        "DEVICE_SECRET_REQUIRED",
        401,
        "Waste X Desktop device authentication is required.",
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
