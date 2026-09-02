import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { clientDevices } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import {
  createClientSession,
  hashOpaqueSecret,
  verifyWasteXPassword,
} from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().uuid(),
  deviceSecret: z.string().min(32),
});

export async function POST(request: Request) {
  try {
    const parsed = loginSchema.safeParse(await request.json());

    if (!parsed.success) {
      return clientApiError(
        "INVALID_REQUEST",
        400,
        "Mobile login details are invalid.",
      );
    }

    const user = await verifyWasteXPassword(
      parsed.data.email,
      parsed.data.password,
    );

    if (!user.organisationId) {
      return clientApiError(
        "ORGANISATION_REQUIRED",
        403,
        "A Waste X organisation is required.",
      );
    }

    const device = await database.query.clientDevices.findFirst({
      where: and(
        eq(clientDevices.id, parsed.data.deviceId),
        eq(clientDevices.organisationId, user.organisationId),
        eq(clientDevices.deviceType, "MOBILE"),
        eq(clientDevices.secretHash, hashOpaqueSecret(parsed.data.deviceSecret)),
        eq(clientDevices.status, "ACTIVE"),
      ),
      columns: {
        id: true,
        organisationId: true,
        defaultSiteId: true,
        displayName: true,
        deviceType: true,
        platform: true,
        status: true,
        createdAt: true,
      },
    });

    if (!device) {
      return clientApiError(
        "DEVICE_UNAVAILABLE",
        401,
        "This Waste X Mobile installation is not authorised.",
      );
    }

    const session = await createClientSession({
      deviceId: device.id,
      userId: user.id,
      organisationId: user.organisationId,
    });

    return clientApiJson({
      ok: true,
      device: {
        deviceId: device.id,
        organisationId: device.organisationId,
        defaultSiteId: device.defaultSiteId,
        displayName: device.displayName,
        deviceType: device.deviceType,
        platform: device.platform,
        status: device.status,
        registeredAt: device.createdAt?.toISOString() ?? new Date().toISOString(),
      },
      session: {
        token: session.sessionToken,
        expiresAt: session.expiresAt.toISOString(),
      },
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organisationId: user.organisationId,
      },
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
