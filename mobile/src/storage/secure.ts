import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { MobileOfflineEntitlementV1 } from "@waste-x/contracts";

const DEVICE_ID_KEY = "waste-x-mobile-device-id-v1";
const DATABASE_KEY = "waste-x-mobile-database-key-v1";
const DEVICE_SECRET_KEY = "waste-x-mobile-device-secret-v1";
const SESSION_TOKEN_KEY = "waste-x-mobile-session-token-v1";
const SESSION_EXPIRY_KEY = "waste-x-mobile-session-expiry-v1";
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

function isUuidV7(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function createUuidV7() {
  const timestamp = BigInt(Date.now());
  const random = await Crypto.getRandomBytesAsync(10);
  const bytes = new Uint8Array(16);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number((timestamp >> BigInt((5 - index) * 8)) & 0xffn);
  }
  bytes[6] = 0x70 | (random[0]! & 0x0f);
  bytes[7] = random[1]!;
  bytes[8] = 0x80 | (random[2]! & 0x3f);
  for (let index = 9; index < 16; index += 1) bytes[index] = random[index - 6]!;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

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

export async function getMobileAuthProfile(): Promise<StoredMobileAuthProfile | null> {
  const value = await SecureStore.getItemAsync(AUTH_PROFILE_KEY, secureOptions);
  if (!value) return null;
  try { return JSON.parse(value) as StoredMobileAuthProfile; } catch { return null; }
}

export async function getMobileOfflineEntitlement(): Promise<MobileOfflineEntitlementV1 | null> {
  const value = await SecureStore.getItemAsync(OFFLINE_ENTITLEMENT_KEY, secureOptions);
  if (!value) return null;
  try { return JSON.parse(value) as MobileOfflineEntitlementV1; } catch { return null; }
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
  profile: StoredMobileAuthProfile;
}) {
  await Promise.all([
    SecureStore.setItemAsync(DEVICE_SECRET_KEY, input.deviceSecret, secureOptions),
    SecureStore.setItemAsync(SESSION_TOKEN_KEY, input.sessionToken, secureOptions),
    SecureStore.setItemAsync(SESSION_EXPIRY_KEY, input.sessionExpiresAt, secureOptions),
    SecureStore.setItemAsync(AUTH_PROFILE_KEY, JSON.stringify(input.profile), secureOptions),
  ]);
}

export async function storeMobileSession(input: {
  sessionToken: string;
  sessionExpiresAt: string;
  profile: StoredMobileAuthProfile;
}) {
  await Promise.all([
    SecureStore.setItemAsync(SESSION_TOKEN_KEY, input.sessionToken, secureOptions),
    SecureStore.setItemAsync(SESSION_EXPIRY_KEY, input.sessionExpiresAt, secureOptions),
    SecureStore.setItemAsync(AUTH_PROFILE_KEY, JSON.stringify(input.profile), secureOptions),
  ]);
}

export async function clearMobileSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_TOKEN_KEY, secureOptions),
    SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY, secureOptions),
    SecureStore.deleteItemAsync(AUTH_PROFILE_KEY, secureOptions),
  ]);
}
