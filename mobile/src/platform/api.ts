import { Platform } from "react-native";

import { WasteXApiClient } from "@waste-x/api-client";

function defaultApiBaseUrl() {
  if (Platform.OS === "android") return "http://10.0.2.2:3000";
  return "http://127.0.0.1:3000";
}

export const mobileApiBaseUrl =
  process.env.EXPO_PUBLIC_WASTE_X_API_BASE_URL?.trim() || defaultApiBaseUrl();

// The shared client is deliberately instantiated here even though Step 11's
// first foundation slice does not authenticate yet. Mobile will add secure token
// providers when device registration/login lands in the next slice.
export const wasteXMobileApi = new WasteXApiClient({
  baseUrl: mobileApiBaseUrl,
});
