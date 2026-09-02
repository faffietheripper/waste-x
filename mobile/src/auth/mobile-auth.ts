import { Platform } from "react-native";

import type {
  MobileLoginResponseV1,
  MobileProvisionResponseV1,
} from "@waste-x/contracts";

import { wasteXMobileApi } from "@/platform/api";
import {
  isOfflineUnlocked,
  lockOfflineOperations,
  unlockOfflineOperations,
  verifyStoredOfflineEntitlement,
  type OfflineEntitlementStatus,
} from "@/auth/offline-auth";
import {
  clearMobileOfflineEntitlement,
  clearMobileSession,
  getMobileAuthProfile,
  getMobileDeviceSecret,
  getMobileSessionExpiry,
  getMobileSessionToken,
  getOrCreateDeviceId,
  observeTrustedTime,
  storeMobileOfflineEntitlement,
  storeMobileProvisioning,
  storeMobileSession,
  type StoredMobileAuthProfile,
} from "@/storage/secure";

export type MobileAuthSnapshot = {
  provisioned: boolean;
  authenticated: boolean;
  onlineAuthenticated: boolean;
  offlineUnlocked: boolean;
  offline: OfflineEntitlementStatus;
  profile: StoredMobileAuthProfile | null;
  sessionExpiresAt: string | null;
};

function platform(): "IOS" | "ANDROID" {
  return Platform.OS === "android" ? "ANDROID" : "IOS";
}

function profileFromResponse(response: MobileProvisionResponseV1 | MobileLoginResponseV1): StoredMobileAuthProfile {
  return {
    userId: response.user.id,
    email: response.user.email,
    role: response.user.role,
    organisationId: response.user.organisationId,
    displayName: response.device.displayName,
  };
}

async function refreshOfflineEntitlement() {
  const response = await wasteXMobileApi.offlineEntitlementMobile();
  await storeMobileOfflineEntitlement(response.offlineEntitlement);
  return response.offlineEntitlement;
}

export async function getMobileAuthSnapshot(): Promise<MobileAuthSnapshot> {
  const [deviceSecret, token, expiry, profile, offline] = await Promise.all([
    getMobileDeviceSecret(),
    getMobileSessionToken(),
    getMobileSessionExpiry(),
    getMobileAuthProfile(),
    verifyStoredOfflineEntitlement(),
  ]);
  const onlineAuthenticated = Boolean(token && expiry && Date.parse(expiry) > Date.now() && profile);
  const offlineUnlocked = isOfflineUnlocked() && offline.valid;
  return {
    provisioned: Boolean(deviceSecret),
    authenticated: onlineAuthenticated || offlineUnlocked,
    onlineAuthenticated,
    offlineUnlocked,
    offline,
    profile,
    sessionExpiresAt: expiry,
  };
}

export async function provisionMobile(input: { email: string; password: string; displayName: string }) {
  const deviceId = await getOrCreateDeviceId();
  const response = await wasteXMobileApi.provisionMobile({
    deviceId,
    email: input.email.trim(),
    password: input.password,
    displayName: input.displayName.trim(),
    platform: platform(),
    defaultSiteId: null,
  });
  await storeMobileProvisioning({
    deviceSecret: response.credentials.deviceSecret,
    sessionToken: response.credentials.sessionToken,
    sessionExpiresAt: response.credentials.sessionExpiresAt,
    profile: profileFromResponse(response),
  });
  await observeTrustedTime();
  await refreshOfflineEntitlement();
  return response;
}

export async function loginMobile(input: { email: string; password: string }) {
  const [deviceId, deviceSecret] = await Promise.all([getOrCreateDeviceId(), getMobileDeviceSecret()]);
  if (!deviceSecret) throw new Error("This Waste X Mobile installation has not been registered yet.");
  const response = await wasteXMobileApi.loginMobile({ email: input.email.trim(), password: input.password, deviceId, deviceSecret });
  await storeMobileSession({
    sessionToken: response.session.token,
    sessionExpiresAt: response.session.expiresAt,
    profile: profileFromResponse(response),
  });
  await observeTrustedTime();
  await refreshOfflineEntitlement();
  lockOfflineOperations();
  return response;
}

export async function unlockMobileOffline() {
  await unlockOfflineOperations();
  return getMobileAuthSnapshot();
}

export async function logoutMobile() {
  try {
    const snapshot = await getMobileAuthSnapshot();
    if (snapshot.onlineAuthenticated) await wasteXMobileApi.logoutMobile();
  } finally {
    lockOfflineOperations();
    await Promise.all([clearMobileSession(), clearMobileOfflineEntitlement()]);
  }
}
