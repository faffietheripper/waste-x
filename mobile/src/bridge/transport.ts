import type {
  MobileBridgeHealthV1,
  MobileBridgeSyncPushResponseV1,
  SyncPushRequestV1,
} from "@waste-x/contracts";

import type { MobileSyncTransport } from "@/sync/mobile-sync";
import {
  getMobileAuthProfile,
  getOrCreateDeviceId,
} from "@/storage/secure";

import { getMobileBridgePairing } from "./pairing";

const REQUEST_TIMEOUT_MS = 4_000;

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function requirePairingContext() {
  const [pairing, profile, deviceId] = await Promise.all([
    getMobileBridgePairing(),
    getMobileAuthProfile(),
    getOrCreateDeviceId(),
  ]);

  if (!pairing) {
    throw new Error("This phone is not paired with a Waste X site Bridge.");
  }
  if (!profile) {
    throw new Error("Waste X Mobile must be authorised before using a site Bridge.");
  }
  if (pairing.organisationId !== profile.organisationId) {
    throw new Error("The paired Waste X Bridge belongs to another organisation.");
  }
  if (pairing.pairedDeviceId !== deviceId) {
    throw new Error("The paired Waste X Bridge credential belongs to another Mobile device.");
  }

  return { pairing, deviceId };
}

function relayHeaders(relaySecret: string, deviceId: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Waste-X-Mobile-Relay-Secret": relaySecret,
    "X-Waste-X-Mobile-Device-Id": deviceId,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBridgeHealth(value: unknown): value is MobileBridgeHealthV1 {
  if (!isObject(value)) return false;
  return (
    value.ok === true &&
    value.protocolVersion === 1 &&
    value.service === "waste-x-bridge-relay" &&
    typeof value.bridgeId === "string" &&
    typeof value.organisationId === "string" &&
    (typeof value.siteId === "string" || value.siteId === null) &&
    typeof value.displayName === "string" &&
    typeof value.acceptsMobileSync === "boolean"
  );
}

function isBridgeSyncResponse(
  value: unknown,
): value is MobileBridgeSyncPushResponseV1 {
  if (!isObject(value)) return false;
  return (
    value.protocolVersion === 1 &&
    value.transport === "LOCAL_BRIDGE" &&
    typeof value.bridgeId === "string" &&
    Array.isArray(value.results)
  );
}

function errorDetail(value: unknown, fallback: string) {
  if (!isObject(value)) return fallback;
  if (typeof value.message === "string" && value.message) return value.message;
  if (typeof value.error === "string" && value.error) return value.error;
  return fallback;
}

export async function getLocalBridgeHealth() {
  const { pairing, deviceId } = await requirePairingContext();

  const response = await withTimeout((signal) =>
    fetch(`${pairing.baseUrl}/v1/mobile/health`, {
      method: "GET",
      headers: relayHeaders(pairing.relaySecret, deviceId),
      signal,
    }),
  );

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Waste X site Bridge health failed: ${errorDetail(body, `HTTP ${response.status}`)}.`,
    );
  }

  if (
    !isBridgeHealth(body) ||
    body.bridgeId !== pairing.bridgeId ||
    body.organisationId !== pairing.organisationId
  ) {
    throw new Error("Waste X Mobile rejected an unexpected site Bridge identity.");
  }

  return body;
}

export const localBridgeMobileSyncTransport: MobileSyncTransport = {
  name: "LOCAL_BRIDGE",
  async push(batch: SyncPushRequestV1) {
    const { pairing, deviceId } = await requirePairingContext();

    if (batch.deviceId !== deviceId) {
      throw new Error("Waste X Mobile refused to relay a sync batch for another device.");
    }

    const response = await withTimeout((signal) =>
      fetch(`${pairing.baseUrl}/v1/mobile/sync/push`, {
        method: "POST",
        headers: relayHeaders(pairing.relaySecret, deviceId),
        body: JSON.stringify(batch),
        signal,
      }),
    );

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        `Waste X site Bridge rejected the Mobile sync batch: ${errorDetail(body, `HTTP ${response.status}`)}.`,
      );
    }

    if (
      !isBridgeSyncResponse(body) ||
      body.bridgeId !== pairing.bridgeId
    ) {
      throw new Error("Waste X Mobile received an invalid site Bridge sync response.");
    }

    return {
      protocolVersion: 1,
      results: body.results,
    };
  },
};
