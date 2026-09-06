import { Platform } from "react-native";

import type { DevicePlatform } from "@waste-x/contracts";
import { calculateNetWeight } from "@waste-x/operations-core";
import { devicePlatformSchema } from "@waste-x/validation";

import { mobileApiBaseUrl, wasteXMobileApi } from "@/platform/api";
import { initialiseMobileDatabase } from "@/storage/database";
import { getOrCreateDeviceId } from "@/storage/secure";
import { quarantineLegacyDriverIssuedTickets } from "@/tickets/authority-migration";

export type MobileFoundationStatus = {
  deviceId: string;
  platform: "IOS" | "ANDROID";
  schemaVersion: number;
  cipherVersion: string;
  apiBaseUrl: string;
  sharedNetWeightProof: number;
  sharedPackages: string[];
};

function mobilePlatform(): "IOS" | "ANDROID" {
  const candidate: DevicePlatform = Platform.OS === "android" ? "ANDROID" : "IOS";
  const parsed = devicePlatformSchema.parse(candidate);
  if (parsed !== "IOS" && parsed !== "ANDROID") {
    throw new Error("Waste X Mobile is only supported on iOS and Android.");
  }
  return parsed;
}

export async function bootMobileFoundation(): Promise<MobileFoundationStatus> {
  const platform = mobilePlatform();
  const deviceId = await getOrCreateDeviceId();
  const database = await initialiseMobileDatabase(deviceId, platform);

  // Early Stage 13 development briefly allowed Driver-issued management tickets.
  // Quarantine only those explicitly stamped experimental records before any
  // field screen or sync loop can expose/replay them.
  await quarantineLegacyDriverIssuedTickets();

  // Touch the shared API client as a compile/runtime proof that Mobile is wired
  // to the same framework-free client package. Network calls start with device
  // registration in the next Step 11 slice.
  void wasteXMobileApi;

  return {
    deviceId,
    platform,
    schemaVersion: database.schemaVersion,
    cipherVersion: database.cipherVersion,
    apiBaseUrl: mobileApiBaseUrl,
    sharedNetWeightProof: calculateNetWeight(18.75, 7.25),
    sharedPackages: [
      "@waste-x/contracts",
      "@waste-x/validation",
      "@waste-x/api-client",
      "@waste-x/operations-core",
    ],
  };
}
