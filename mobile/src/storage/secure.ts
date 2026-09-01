import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "waste-x-mobile-device-id-v1";
const DATABASE_KEY = "waste-x-mobile-database-key-v1";

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function getOrCreateDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY, secureOptions);
  if (existing) return existing;

  const deviceId = Crypto.randomUUID();
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
