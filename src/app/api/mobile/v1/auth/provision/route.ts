import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { clientDevices } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import { sites } from "@/db/schema";
import {
  createClientSession,
  hashOpaqueSecret,
  randomOpaqueSecret,
  verifyWasteXPassword,
} from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const provisionSchema = z.object({
  deviceId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(1),
  displayName: z.string().trim().min(1).max(120),
  platform: z.enum(["IOS", "ANDROID"]),
  defaultSiteId: z.string().min(1).nullable().optional(),
});

const allowedRoles = new Set([
  "administrator",
  "operations",
  "seniorManagement",
  "employee",
]);

export async function POST(request: Request) {
  try {
    const parsed = provisionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return clientApiError(
        "INVALID_REQUEST",
        400,
        "Mobile provisioning details are invalid.",
        parsed.error.flatten(),
      );
    }

    const user = await verifyWasteXPassword(
      parsed.data.email,
      parsed.data.password,
    );

    if (!allowedRoles.has(user.role)) {
      return clientApiError(
        "PERMISSION_DENIED",
        403,
        "This Waste X user cannot provision an operational Mobile device.",
      );
    }

    if (!user.organisationId) {
      return clientApiError(
        "ORGANISATION_REQUIRED",
        403,
        "A Waste X organisation is required.",
      );
    }

    const existing = await database.query.clientDevices.findFirst({
      where: eq(clientDevices.id, parsed.data.deviceId),
      columns: { id: true },
    });

    if (existing) {
      return clientApiError(
        "DEVICE_ALREADY_REGISTERED",
        409,
        "This Waste X Mobile installation is already registered.",
      );
    }

    const defaultSiteId = parsed.data.defaultSiteId ?? null;
    if (defaultSiteId) {
      const site = await database.query.sites.findFirst({
        where: and(
          eq(sites.id, defaultSiteId),
          eq(sites.organisationId, user.organisationId),
        ),
        columns: { id: true, status: true },
      });

      if (!site || site.status !== "active") {
        return clientApiError(
          "INVALID_SITE",
          400,
          "The selected Waste X site is not available to this organisation.",
        );
      }
    }

    const deviceSecret = randomOpaqueSecret();
    const now = new Date();

    await database.insert(clientDevices).values({
      id: parsed.data.deviceId,
      organisationId: user.organisationId,
      defaultSiteId,
      displayName: parsed.data.displayName,
      deviceType: "MOBILE",
      platform: parsed.data.platform,
      status: "ACTIVE",
      secretHash: hashOpaqueSecret(deviceSecret),
      registeredByUserId: user.id,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const session = await createClientSession({
      deviceId: parsed.data.deviceId,
      userId: user.id,
      organisationId: user.organisationId,
    });

    return clientApiJson(
      {
        ok: true,
        device: {
          deviceId: parsed.data.deviceId,
          organisationId: user.organisationId,
          defaultSiteId,
          displayName: parsed.data.displayName,
          deviceType: "MOBILE",
          platform: parsed.data.platform,
          status: "ACTIVE",
          registeredAt: now.toISOString(),
        },
        credentials: {
          deviceSecret,
          sessionToken: session.sessionToken,
          sessionExpiresAt: session.expiresAt.toISOString(),
        },
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          organisationId: user.organisationId,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleClientApiError(error);
  }
}
