import crypto from "node:crypto";

import {
  hashOpaqueSecret,
  type ClientApiContext,
} from "@/lib/client-api/auth";

export const OFFLINE_WINDOW_DAYS = 14 as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type OfflineEntitlementPayload = {
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

export function canonicalOfflineEntitlement(payload: OfflineEntitlementPayload) {
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

export function createOfflineEntitlement(
  context: ClientApiContext,
  deviceSecret: string,
) {
  const now = new Date();
  const entitlement: OfflineEntitlementPayload = {
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

  // Cloud stores SHA-256(deviceSecret), while the client stores the opaque
  // secret in the OS secure store. Both independently derive this device-bound
  // MAC key without a global offline signing secret.
  const deviceKey = Buffer.from(hashOpaqueSecret(deviceSecret), "hex");
  const signature = crypto
    .createHmac("sha256", deviceKey)
    .update(canonicalOfflineEntitlement(entitlement))
    .digest("base64url");

  return {
    ...entitlement,
    signature,
  };
}
