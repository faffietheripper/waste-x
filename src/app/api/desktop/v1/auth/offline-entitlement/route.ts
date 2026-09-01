import crypto from "node:crypto";

import {
  hashOpaqueSecret,
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const OFFLINE_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type EntitlementPayload = {
  version: 1;
  deviceId: string;
  organisationId: string;
  userId: string;
  role: string;
  defaultSiteId: string | null;
  issuedAt: string;
  expiresAt: string;
  maxOfflineDays: 14;
};

function canonicalEntitlement(payload: EntitlementPayload) {
  return [
    payload.version,
    payload.deviceId,
    payload.organisationId,
    payload.userId,
    payload.role,
    payload.defaultSiteId ?? "",
    payload.issuedAt,
    payload.expiresAt,
    payload.maxOfflineDays,
  ].join("|");
}

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

    const now = new Date();
    const entitlement: EntitlementPayload = {
      version: 1,
      deviceId: context.deviceId,
      organisationId: context.organisationId,
      userId: context.userId,
      role: context.role,
      defaultSiteId: context.defaultSiteId,
      issuedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + OFFLINE_WINDOW_DAYS * DAY_MS,
      ).toISOString(),
      maxOfflineDays: OFFLINE_WINDOW_DAYS,
    };

    // The Cloud stores only SHA-256(deviceSecret), while the Desktop holds the
    // secret in the OS credential store. Both can independently derive this
    // device-specific MAC key without introducing a global signing secret.
    const deviceKey = Buffer.from(hashOpaqueSecret(deviceSecret), "hex");
    const signature = crypto
      .createHmac("sha256", deviceKey)
      .update(canonicalEntitlement(entitlement))
      .digest("base64url");

    return clientApiJson({
      ok: true,
      offlineEntitlement: {
        ...entitlement,
        signature,
      },
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
