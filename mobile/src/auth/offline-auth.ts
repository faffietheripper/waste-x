import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";

import type { MobileOfflineEntitlementV1 } from "@waste-x/contracts";

import {
  getMaxObservedTime,
  getMobileDeviceSecret,
  getMobileOfflineEntitlement,
  getOrCreateDeviceId,
  observeTrustedTime,
} from "@/storage/secure";

const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000;
const OFFLINE_UNLOCK_TTL_MS = 15 * 60 * 1000;
let unlockedUntil = 0;

function utf8(value: string) {
  const bytes: number[] = [];
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point <= 0x7f) bytes.push(point);
    else if (point <= 0x7ff) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    else if (point <= 0xffff) bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    else bytes.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 0x3f), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
  }
  return new Uint8Array(bytes);
}

function concat(left: Uint8Array, right: Uint8Array) {
  const output = new Uint8Array(left.length + right.length);
  output.set(left, 0);
  output.set(right, left.length);
  return output;
}

function hexBytes(value: string) {
  const output = new Uint8Array(value.length / 2);
  for (let i = 0; i < output.length; i += 1) output[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return output;
}

function base64Url(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const value = (a << 16) | (b << 8) | c;
    output += alphabet[(value >> 18) & 63]!;
    output += alphabet[(value >> 12) & 63]!;
    output += index + 1 < bytes.length ? alphabet[(value >> 6) & 63]! : "=";
    output += index + 2 < bytes.length ? alphabet[value & 63]! : "=";
  }
  return output.replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sha256(data: Uint8Array) {
  // TypeScript 6 models Uint8Array as potentially backed by SharedArrayBuffer,
  // while expo-crypto requires a BufferSource backed by a normal ArrayBuffer.
  // Copying guarantees the stricter backing type without unsafe casts.
  const stableData = new Uint8Array(data.byteLength);
  stableData.set(data);
  return new Uint8Array(
    await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, stableData.buffer),
  );
}

async function hmacSha256(key: Uint8Array, message: Uint8Array) {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? await sha256(key) : key);
  const inner = block.map((value) => value ^ 0x36);
  const outer = block.map((value) => value ^ 0x5c);
  return sha256(concat(outer, await sha256(concat(inner, message))));
}

function canonical(entitlement: MobileOfflineEntitlementV1) {
  return [
    entitlement.version,
    entitlement.deviceId,
    entitlement.organisationId,
    entitlement.userId,
    entitlement.role,
    entitlement.defaultSiteId ?? "",
    entitlement.issuedAt,
    entitlement.expiresAt,
    entitlement.maxOfflineDays,
  ].join("|");
}

function sameString(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export type OfflineEntitlementStatus = {
  available: boolean;
  valid: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  reason: string | null;
};

export async function verifyStoredOfflineEntitlement(): Promise<OfflineEntitlementStatus> {
  const [entitlement, deviceSecret, deviceId, maxObserved] = await Promise.all([
    getMobileOfflineEntitlement(),
    getMobileDeviceSecret(),
    getOrCreateDeviceId(),
    getMaxObservedTime(),
  ]);

  if (!entitlement || !deviceSecret) return { available: false, valid: false, expiresAt: null, daysRemaining: null, reason: "No offline entitlement is stored." };
  if (entitlement.deviceId !== deviceId) return { available: true, valid: false, expiresAt: entitlement.expiresAt, daysRemaining: 0, reason: "Offline entitlement belongs to another device." };

  const deviceSecretHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, deviceSecret);
  const expected = base64Url(await hmacSha256(hexBytes(deviceSecretHash), utf8(canonical(entitlement))));
  if (!sameString(expected, entitlement.signature)) return { available: true, valid: false, expiresAt: entitlement.expiresAt, daysRemaining: 0, reason: "Offline entitlement signature is invalid." };

  const now = Date.now();
  if (maxObserved && now + CLOCK_ROLLBACK_TOLERANCE_MS < maxObserved) return { available: true, valid: false, expiresAt: entitlement.expiresAt, daysRemaining: 0, reason: "Device clock moved backwards. Connect to Waste X Cloud before continuing." };

  const expiry = Date.parse(entitlement.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) return { available: true, valid: false, expiresAt: entitlement.expiresAt, daysRemaining: 0, reason: "Offline authorisation has expired." };

  await observeTrustedTime(now);
  return {
    available: true,
    valid: true,
    expiresAt: entitlement.expiresAt,
    daysRemaining: Math.max(0, Math.ceil((expiry - now) / 86_400_000)),
    reason: null,
  };
}

export function isOfflineUnlocked() {
  return unlockedUntil > Date.now();
}

export async function unlockOfflineOperations() {
  const entitlement = await verifyStoredOfflineEntitlement();
  if (!entitlement.valid) throw new Error(entitlement.reason ?? "Offline access is unavailable.");

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Waste X offline operations",
    promptSubtitle: "Authorised offline access",
    fallbackLabel: "Use Passcode",
    disableDeviceFallback: false,
    biometricsSecurityLevel: "strong",
  });
  if (!result.success) throw new Error("Device authentication was not completed.");

  unlockedUntil = Date.now() + OFFLINE_UNLOCK_TTL_MS;
  return entitlement;
}

export function lockOfflineOperations() {
  unlockedUntil = 0;
}
