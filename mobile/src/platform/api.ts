import { Platform } from "react-native";

import { WasteXApiClient } from "@waste-x/api-client";

import {
  getMobileDeviceSecret,
  getMobileSessionToken,
} from "@/storage/secure";

function defaultApiBaseUrl() {
  if (Platform.OS === "android") return "http://10.0.2.2:3000";
  return "http://127.0.0.1:3000";
}

export const mobileApiBaseUrl =
  process.env.EXPO_PUBLIC_WASTE_X_API_BASE_URL?.trim() || defaultApiBaseUrl();

export const wasteXMobileApi = new WasteXApiClient({
  baseUrl: mobileApiBaseUrl,
  getAccessToken: getMobileSessionToken,
  getDeviceSecret: getMobileDeviceSecret,
});
