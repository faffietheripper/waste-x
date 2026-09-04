import { z } from "zod";

import {
  ClientApiAuthError,
  refreshClientSession,
} from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const refreshSchema = z.object({
  deviceId: z.string().uuid(),
  refreshToken: z.string().min(32),
});

export async function POST(request: Request) {
  try {
    const parsed = refreshSchema.safeParse(await request.json());
    if (!parsed.success) {
      return clientApiError(
        "INVALID_REQUEST",
        400,
        "Mobile refresh details are invalid.",
      );
    }

    const deviceSecret = request.headers.get("x-waste-x-device-secret")?.trim();
    if (!deviceSecret) {
      throw new ClientApiAuthError(
        "DEVICE_SECRET_REQUIRED",
        401,
        "This Waste X Mobile installation is not authorised.",
      );
    }

    const refreshed = await refreshClientSession({
      deviceId: parsed.data.deviceId,
      refreshToken: parsed.data.refreshToken,
      deviceSecret,
    });

    return clientApiJson({
      ok: true,
      device: {
        deviceId: refreshed.device.id,
        organisationId: refreshed.device.organisationId,
        defaultSiteId: refreshed.device.defaultSiteId,
        displayName: refreshed.device.displayName,
        deviceType: refreshed.device.deviceType,
        platform: refreshed.device.platform,
        status: refreshed.device.status,
        registeredAt:
          refreshed.device.createdAt?.toISOString() ?? new Date().toISOString(),
      },
      session: {
        token: refreshed.sessionToken,
        expiresAt: refreshed.expiresAt.toISOString(),
      },
      refresh: {
        token: refreshed.refreshToken,
        expiresAt: refreshed.refreshExpiresAt.toISOString(),
      },
      user: {
        id: refreshed.user.id,
        email: refreshed.user.email,
        role: refreshed.user.role,
        organisationId: refreshed.user.organisationId,
      },
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
