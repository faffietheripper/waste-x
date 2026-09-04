import * as SecureStore from "expo-secure-store";

import {
  asDeviceId,
  asOrganisationId,
  asSiteId,
  type MobileBridgePairingV1,
} from "@waste-x/contracts";

import { getOrCreateDeviceId } from "@/storage/secure";

const BRIDGE_PAIRING_KEY = "waste-x-mobile-bridge-pairing-v1";

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function normaliseBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Waste X Bridge pairing contains an invalid relay address.");
  }

  const localDevelopmentHost =
    url.hostname === "127.0.0.1" || url.hostname === "localhost";

  if (url.protocol !== "https:" && !(localDevelopmentHost && url.protocol === "http:")) {
    throw new Error(
      "Waste X Mobile requires HTTPS for a site Bridge relay. Plain HTTP is allowed only for localhost development.",
    );
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "Waste X Bridge relay addresses cannot contain credentials, query strings or fragments.",
    );
  }

  return trimmed;
}

function parsePairing(value: string): MobileBridgePairingV1 {
  const parsed = JSON.parse(value) as Partial<MobileBridgePairingV1>;
  if (
    parsed.protocolVersion !== 1 ||
    typeof parsed.bridgeId !== "string" ||
    !parsed.bridgeId.trim() ||
    typeof parsed.organisationId !== "string" ||
    typeof parsed.displayName !== "string" ||
    typeof parsed.baseUrl !== "string" ||
    typeof parsed.relaySecret !== "string" ||
    parsed.relaySecret.length < 32 ||
    typeof parsed.pairedDeviceId !== "string" ||
    typeof parsed.pairedAt !== "string"
  ) {
    throw new Error("Stored Waste X Bridge pairing is invalid.");
  }

  const pairedAt = Date.parse(parsed.pairedAt);
  if (!Number.isFinite(pairedAt)) {
    throw new Error("Stored Waste X Bridge pairing timestamp is invalid.");
  }

  return {
    protocolVersion: 1,
    bridgeId: parsed.bridgeId,
    organisationId: asOrganisationId(parsed.organisationId),
    siteId:
      typeof parsed.siteId === "string" && parsed.siteId
        ? asSiteId(parsed.siteId)
        : null,
    displayName: parsed.displayName,
    baseUrl: normaliseBaseUrl(parsed.baseUrl),
    relaySecret: parsed.relaySecret,
    pairedDeviceId: asDeviceId(parsed.pairedDeviceId),
    pairedAt: new Date(pairedAt).toISOString(),
  };
}

export async function getMobileBridgePairing(): Promise<MobileBridgePairingV1 | null> {
  const value = await SecureStore.getItemAsync(BRIDGE_PAIRING_KEY, secureOptions);
  if (!value) return null;

  try {
    const pairing = parsePairing(value);
    const deviceId = await getOrCreateDeviceId();
    if (pairing.pairedDeviceId !== deviceId) {
      await clearMobileBridgePairing();
      return null;
    }
    return pairing;
  } catch {
    await clearMobileBridgePairing();
    return null;
  }
}

export async function storeMobileBridgePairing(input: {
  bridgeId: string;
  organisationId: string;
  siteId?: string | null;
  displayName: string;
  baseUrl: string;
  relaySecret: string;
}) {
  if (input.relaySecret.length < 32) {
    throw new Error("Waste X Bridge pairing secret is too short.");
  }

  const deviceId = await getOrCreateDeviceId();
  const pairing: MobileBridgePairingV1 = {
    protocolVersion: 1,
    bridgeId: input.bridgeId.trim(),
    organisationId: asOrganisationId(input.organisationId),
    siteId: input.siteId ? asSiteId(input.siteId) : null,
    displayName: input.displayName.trim(),
    baseUrl: normaliseBaseUrl(input.baseUrl),
    relaySecret: input.relaySecret,
    pairedDeviceId: asDeviceId(deviceId),
    pairedAt: new Date().toISOString(),
  };

  if (!pairing.bridgeId || !pairing.displayName) {
    throw new Error("Waste X Bridge pairing identity is incomplete.");
  }

  await SecureStore.setItemAsync(
    BRIDGE_PAIRING_KEY,
    JSON.stringify(pairing),
    secureOptions,
  );

  return pairing;
}

export async function storeMobileBridgePairingPayload(payload: string) {
  let pairing: MobileBridgePairingV1;
  try {
    pairing = parsePairing(payload.trim());
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Waste X Bridge pairing payload is invalid: ${error.message}`
        : "Waste X Bridge pairing payload is invalid.",
    );
  }

  const deviceId = await getOrCreateDeviceId();
  if (pairing.pairedDeviceId !== deviceId) {
    throw new Error(
      "This Waste X Bridge pairing was issued for a different Mobile device.",
    );
  }

  await SecureStore.setItemAsync(
    BRIDGE_PAIRING_KEY,
    JSON.stringify(pairing),
    secureOptions,
  );
  return pairing;
}

export function clearMobileBridgePairing() {
  return SecureStore.deleteItemAsync(BRIDGE_PAIRING_KEY, secureOptions);
}
