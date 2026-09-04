import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { MobileOfflineEntitlementV1 } from "@waste-x/contracts";

import { createUuidV7, isUuidV7 } from "@/platform/ids";

const DEVICE_ID_KEY = "waste-x-mobile-device-id-v1";
const DATABASE_KEY = "waste-x-mobile-database-key-v1";
const DEVICE_SECRET_KEY = "waste-x-mobile-device-secret-v1";
const SESSION_TOKEN_KEY = "waste-x-mobile-session-token-v1";
const SESSION_EXPIRY_KEY = "waste-x-mobile-session-expiry-v1";
const REFRESH_TOKEN_KEY = "waste-x-mobile-refresh-token-v1";
const REFRESH_EXPIRY_KEY = "waste-x-mobile-refresh-expiry-v1";
const AUTH_PROFILE_KEY = "waste-x-mobile-auth-profile-v1";
const OFFLINE_ENTITLEMENT_KEY = "waste-x-mobile-offline-entitlement-v1";
const MAX_OBSERVED_TIME_KEY = "waste-x-mobile-max-observed-time-v1";

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export type StoredMobileAuthProfile = {
  userId: string;
  email: string;
  role: string;
  organisationId: string;
  displayName: string;
};

export async function getOrCreateDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY, secureOptions);
  if (existing) {
    if (isUuidV7(existing)) return existing;
    if (await getMobileDeviceSecret()) return existing;
  }
  const deviceId = await createUuidV7();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId, secureOptions);
  return deviceId;
}

export async function getOrCreateDatabaseKey() {
  const existing = await SecureStore.getItemAsync(DATABASE_KEY, secureOptions);
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(DATABASE_KEY, key, secureOptions);
  return key;
}

export function getMobileDeviceSecret() {
  return SecureStore.getItemAsync(DEVICE_SECRET_KEY, secureOptions);
}
export function getMobileSessionToken() {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY, secureOptions);
}
export function getMobileSessionExpiry() {
  return SecureStore.getItemAsync(SESSION_EXPIRY_KEY, secureOptions);
}
export function getMobileRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY, secureOptions);
}
export function getMobileRefreshExpiry() {
  return SecureStore.getItemAsync(REFRESH_EXPIRY_KEY, secureOptions);
}

export async function getMobileAuthProfile(): Promise<StoredMobileAuthProfile | null> {
  const value = await SecureStore.getItemAsync(AUTH_PROFILE_KEY, secureOptions);
  if (!value) return null;
  try {
    return JSON.parse(value) as StoredMobileAuthProfile;
  } catch {
    return null;
  }
}

export async function getMobileOfflineEntitlement(): Promise<MobileOfflineEntitlementV1 | null> {
  const value = await SecureStore.getItemAsync(OFFLINE_ENTITLEMENT_KEY, secureOptions);
  if (!value) return null;
  try {
    return JSON.parse(value) as MobileOfflineEntitlementV1;
  } catch {
    return null;
  }
}

export async function storeMobileOfflineEntitlement(entitlement: MobileOfflineEntitlementV1) {
  await SecureStore.setItemAsync(OFFLINE_ENTITLEMENT_KEY, JSON.stringify(entitlement), secureOptions);
  await observeTrustedTime(Date.parse(entitlement.issuedAt));
}

export async function clearMobileOfflineEntitlement() {
  await SecureStore.deleteItemAsync(OFFLINE_ENTITLEMENT_KEY, secureOptions);
}

export async function getMaxObservedTime() {
  const value = await SecureStore.getItemAsync(MAX_OBSERVED_TIME_KEY, secureOptions);
  const parsed = value ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function observeTrustedTime(timestamp = Date.now()) {
  const previous = await getMaxObservedTime();
  if (timestamp > previous) {
    await SecureStore.setItemAsync(MAX_OBSERVED_TIME_KEY, String(timestamp), secureOptions);
  }
}

export async function storeMobileProvisioning(input: {
  deviceSecret: string;
  sessionToken: string;
  sessionExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  profile: StoredMobileAuthProfile;
}) {
  await Promise.all([
    SecureStore.setItemAsync(DEVICE_SECRET_KEY, input.deviceSecret, secureOptions),
    SecureStore.setItemAsync(SESSION_TOKEN_KEY, input.sessionToken, secureOptions),
    SecureStore.setItemAsync(SESSION_EXPIRY_KEY, input.sessionExpiresAt, secureOptions),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, input.refreshToken, secureOptions),
    SecureStore.setItemAsync(REFRESH_EXPIRY_KEY, input.refreshExpiresAt, secureOptions),
    SecureStore.setItemAsync(AUTH_PROFILE_KEY, JSON.stringify(input.profile), secureOptions),
  ]);
}

export async function storeMobileSession(input: {
  sessionToken: string;
  sessionExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  profile: StoredMobileAuthProfile;
}) {
  await Promise.all([
    SecureStore.setItemAsync(SESSION_TOKEN_KEY, input.sessionToken, secureOptions),
    SecureStore.setItemAsync(SESSION_EXPIRY_KEY, input.sessionExpiresAt, secureOptions),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, input.refreshToken, secureOptions),
    SecureStore.setItemAsync(REFRESH_EXPIRY_KEY, input.refreshExpiresAt, secureOptions),
    SecureStore.setItemAsync(AUTH_PROFILE_KEY, JSON.stringify(input.profile), secureOptions),
  ]);
}

export async function clearMobileSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_TOKEN_KEY, secureOptions),
    SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY, secureOptions),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, secureOptions),
    SecureStore.deleteItemAsync(REFRESH_EXPIRY_KEY, secureOptions),
    SecureStore.deleteItemAsync(AUTH_PROFILE_KEY, secureOptions),
  ]);
}
