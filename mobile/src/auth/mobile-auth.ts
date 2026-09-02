import { Platform } from "react-native";

import type {
  MobileLoginResponseV1,
  MobileProvisionResponseV1,
} from "@waste-x/contracts";

import { wasteXMobileApi } from "@/platform/api";
import {
  clearMobileSession,
  getMobileAuthProfile,
  getMobileDeviceSecret,
  getMobileSessionExpiry,
  getMobileSessionToken,
  getOrCreateDeviceId,
  storeMobileProvisioning,
  storeMobileSession,
  type StoredMobileAuthProfile,
} from "@/storage/secure";

export type MobileAuthSnapshot = {
  provisioned: boolean;
  authenticated: boolean;
  profile: StoredMobileAuthProfile | null;
  sessionExpiresAt: string | null;
};

function platform(): "IOS" | "ANDROID" {
  return Platform.OS === "android" ? "ANDROID" : "IOS";
}

function profileFromResponse(
  response: MobileProvisionResponseV1 | MobileLoginResponseV1,
): StoredMobileAuthProfile {
  return {
    userId: response.user.id,
    email: response.user.email,
    role: response.user.role,
    organisationId: response.user.organisationId,
    displayName: response.device.displayName,
  };
}

export async function getMobileAuthSnapshot(): Promise<MobileAuthSnapshot> {
  const [deviceSecret, token, expiry, profile] = await Promise.all([
    getMobileDeviceSecret(),
    getMobileSessionToken(),
    getMobileSessionExpiry(),
    getMobileAuthProfile(),
  ]);

  const authenticated = Boolean(
    token && expiry && Date.parse(expiry) > Date.now() && profile,
  );

  return {
    provisioned: Boolean(deviceSecret),
    authenticated,
    profile,
    sessionExpiresAt: expiry,
  };
}

export async function provisionMobile(input: {
  email: string;
  password: string;
  displayName: string;
}) {
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

  return response;
}

export async function loginMobile(input: { email: string; password: string }) {
  const [deviceId, deviceSecret] = await Promise.all([
    getOrCreateDeviceId(),
    getMobileDeviceSecret(),
  ]);

  if (!deviceSecret) {
    throw new Error("This Waste X Mobile installation has not been registered yet.");
  }

  const response = await wasteXMobileApi.loginMobile({
    email: input.email.trim(),
    password: input.password,
    deviceId,
    deviceSecret,
  });

  await storeMobileSession({
    sessionToken: response.session.token,
    sessionExpiresAt: response.session.expiresAt,
    profile: profileFromResponse(response),
  });

  return response;
}

export async function logoutMobile() {
  try {
    await wasteXMobileApi.logoutMobile();
  } finally {
    await clearMobileSession();
  }
}
