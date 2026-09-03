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

  return { pairing, profile, deviceId };
}

function relayHeaders(relaySecret: string, deviceId: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Waste-X-Mobile-Relay-Secret": relaySecret,
    "X-Waste-X-Mobile-Device-Id": deviceId,
  };
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

  if (!response.ok) {
    throw new Error(`Waste X site Bridge health returned HTTP ${response.status}.`);
  }

  const health = (await response.json()) as MobileBridgeHealthV1;
  if (
    !health.ok ||
    health.protocolVersion !== 1 ||
    health.service !== "waste-x-bridge-relay" ||
    health.bridgeId !== pairing.bridgeId ||
    health.organisationId !== pairing.organisationId
  ) {
    throw new Error("Waste X Mobile rejected an unexpected site Bridge identity.");
  }

  return health;
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

    const body = (await response.json().catch(() => null)) as
      | MobileBridgeSyncPushResponseV1
      | { error?: string; message?: string }
      | null;

    if (!response.ok) {
      const detail =
        body && "message" in body && body.message
          ? body.message
          : body && "error" in body && body.error
            ? body.error
            : `HTTP ${response.status}`;
      throw new Error(`Waste X site Bridge rejected the Mobile sync batch: ${detail}.`);
    }

    if (
      !body ||
      !("transport" in body) ||
      body.transport !== "LOCAL_BRIDGE" ||
      body.bridgeId !== pairing.bridgeId ||
      body.protocolVersion !== 1 ||
      !Array.isArray(body.results)
    ) {
      throw new Error("Waste X Mobile received an invalid site Bridge sync response.");
    }

    return {
      protocolVersion: 1,
      results: body.results,
    };
  },
};
