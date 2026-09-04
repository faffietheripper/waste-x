import { Platform } from "react-native";

import { WasteXApiError } from "@waste-x/api-client";
import type {
  MobileLoginResponseV1,
  MobileProvisionResponseV1,
  MobileRefreshResponseV1,
} from "@waste-x/contracts";

import { wasteXMobileApi } from "@/platform/api";
import {
  isOfflineUnlocked,
  lockOfflineOperations,
  unlockOfflineOperations,
  verifyStoredOfflineEntitlement,
  type OfflineEntitlementStatus,
} from "@/auth/offline-auth";
import { clearMobileAssignmentWorkingSet } from "@/assignments/local-working-set";
import {
  clearMobileOfflineEntitlement,
  clearMobileOnlineCredentials,
  clearMobileSession,
  getMobileAuthProfile,
  getMobileDeviceSecret,
  getMobileRefreshExpiry,
  getMobileRefreshToken,
  getMobileSessionExpiry,
  getMobileSessionToken,
  getOrCreateDeviceId,
  observeTrustedTime,
  storeMobileOfflineEntitlement,
  storeMobileProvisioning,
  storeMobileSession,
  type StoredMobileAuthProfile,
} from "@/storage/secure";

const SESSION_RENEWAL_WINDOW_MS = 5 * 60 * 1000;

let refreshInFlight: Promise<MobileRefreshResponseV1> | null = null;

export type MobileAuthSnapshot = {
  provisioned: boolean;
  authenticated: boolean;
  cloudReachable: boolean;
  onlineAuthenticated: boolean;
  offlineUnlocked: boolean;
  offline: OfflineEntitlementStatus;
  profile: StoredMobileAuthProfile | null;
  sessionExpiresAt: string | null;
  refreshAvailable: boolean;
};

function platform(): "IOS" | "ANDROID" {
  return Platform.OS === "android" ? "ANDROID" : "IOS";
}

function profileFromResponse(
  response:
    | MobileProvisionResponseV1
    | MobileLoginResponseV1
    | MobileRefreshResponseV1,
): StoredMobileAuthProfile {
  return {
    userId: response.user.id,
    email: response.user.email,
    role: response.user.role,
    organisationId: response.user.organisationId,
    displayName: response.device.displayName,
  };
}

function isCloudUnreachable(error: unknown) {
  return error instanceof WasteXApiError && error.code === "CLOUD_UNREACHABLE";
}

function isRefreshExpired(error: unknown) {
  return error instanceof WasteXApiError && error.code === "AUTH_INVALID_REFRESH";
}

function isHardAuthorisationRejection(error: unknown) {
  if (!(error instanceof WasteXApiError)) return false;
  return (
    error.status === 403 ||
    error.code === "DEVICE_UNAVAILABLE" ||
    error.code === "DEVICE_SECRET_REQUIRED" ||
    error.code === "ACCOUNT_UNAVAILABLE" ||
    error.code === "ORGANISATION_UNAVAILABLE"
  );
}

async function clearRevokedMobileState() {
  await Promise.all([
    clearMobileSession(),
    clearMobileOfflineEntitlement(),
    clearMobileAssignmentWorkingSet(),
  ]);
  lockOfflineOperations();
}

async function refreshOfflineEntitlement() {
  const response = await wasteXMobileApi.offlineEntitlementMobile();
  await storeMobileOfflineEntitlement(response.offlineEntitlement);
  return response.offlineEntitlement;
}

async function rotateCloudSession(refreshToken: string) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const deviceId = await getOrCreateDeviceId();
    const response = await wasteXMobileApi.refreshMobile({
      deviceId,
      refreshToken,
    });

    await storeMobileSession({
      sessionToken: response.session.token,
      sessionExpiresAt: response.session.expiresAt,
      refreshToken: response.refresh.token,
      refreshExpiresAt: response.refresh.expiresAt,
      profile: profileFromResponse(response),
    });
    await observeTrustedTime();
    return response;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function getMobileAuthSnapshot(): Promise<MobileAuthSnapshot> {
  let [
    deviceSecret,
    token,
    expiry,
    refreshToken,
    refreshExpiry,
    profile,
  ] = await Promise.all([
    getMobileDeviceSecret(),
    getMobileSessionToken(),
    getMobileSessionExpiry(),
    getMobileRefreshToken(),
    getMobileRefreshExpiry(),
    getMobileAuthProfile(),
  ]);

  let cloudReachable = false;
  let onlineAuthenticated = false;
  const now = Date.now();

  const refreshIsCurrent = () =>
    Boolean(
      refreshToken &&
        refreshExpiry &&
        Date.parse(refreshExpiry) > Date.now() &&
        profile,
    );

  const sessionNeedsRenewal = () =>
    !token ||
    !expiry ||
    !profile ||
    Date.parse(expiry) <= Date.now() + SESSION_RENEWAL_WINDOW_MS;

  if (deviceSecret && refreshIsCurrent() && sessionNeedsRenewal()) {
    try {
      const refreshed = await rotateCloudSession(refreshToken!);
      token = refreshed.session.token;
      expiry = refreshed.session.expiresAt;
      refreshToken = refreshed.refresh.token;
      refreshExpiry = refreshed.refresh.expiresAt;
      profile = profileFromResponse(refreshed);
    } catch (error) {
      if (isCloudUnreachable(error)) {
        cloudReachable = false;
      } else if (isRefreshExpired(error)) {
        await clearMobileOnlineCredentials();
        token = null;
        expiry = null;
        refreshToken = null;
        refreshExpiry = null;
      } else if (isHardAuthorisationRejection(error)) {
        await clearRevokedMobileState();
        token = null;
        expiry = null;
        refreshToken = null;
        refreshExpiry = null;
        profile = null;
      }
    }
  }

  const localSessionCurrent = Boolean(
    token && expiry && Date.parse(expiry) > Date.now() && profile,
  );

  if (localSessionCurrent && deviceSecret) {
    try {
      await refreshOfflineEntitlement();
      await observeTrustedTime();
      cloudReachable = true;
      onlineAuthenticated = true;
    } catch (error) {
      if (isCloudUnreachable(error)) {
        cloudReachable = false;
      } else if (
        error instanceof WasteXApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        if (refreshIsCurrent()) {
          try {
            const refreshed = await rotateCloudSession(refreshToken!);
            token = refreshed.session.token;
            expiry = refreshed.session.expiresAt;
            refreshToken = refreshed.refresh.token;
            refreshExpiry = refreshed.refresh.expiresAt;
            profile = profileFromResponse(refreshed);
            await refreshOfflineEntitlement();
            await observeTrustedTime();
            cloudReachable = true;
            onlineAuthenticated = true;
          } catch (refreshError) {
            if (isCloudUnreachable(refreshError)) {
              cloudReachable = false;
            } else if (isRefreshExpired(refreshError)) {
              await clearMobileOnlineCredentials();
              token = null;
              expiry = null;
              refreshToken = null;
              refreshExpiry = null;
            } else if (isHardAuthorisationRejection(refreshError)) {
              await clearRevokedMobileState();
              token = null;
              expiry = null;
              refreshToken = null;
              refreshExpiry = null;
              profile = null;
            }
          }
        } else {
          await clearRevokedMobileState();
          token = null;
          expiry = null;
          profile = null;
        }
      } else {
        cloudReachable = false;
      }
    }
  }

  const offline = await verifyStoredOfflineEntitlement();
  const offlineUnlocked = isOfflineUnlocked() && offline.valid;

  return {
    provisioned: Boolean(deviceSecret),
    authenticated: onlineAuthenticated || offlineUnlocked,
    cloudReachable,
    onlineAuthenticated,
    offlineUnlocked,
    offline,
    profile,
    sessionExpiresAt: expiry,
    refreshAvailable: refreshIsCurrent(),
  };
}

export async function provisionMobile(input: {
  email: string;
  password: string;
  displayName: string;
}) {
  const deviceId = await getOrCreateDeviceId();
  const response = await wasteXMobileApi.provisionMobile({
    deviceId,
    email: input.email.trim(),
    password: input.password,
    displayName: input.displayName.trim(),
    platform: platform(),
    defaultSiteId: null,
  });
  await storeMobileProvisioning({
    deviceSecret: response.credentials.deviceSecret,
    sessionToken: response.credentials.sessionToken,
    sessionExpiresAt: response.credentials.sessionExpiresAt,
    refreshToken: response.credentials.refreshToken,
    refreshExpiresAt: response.credentials.refreshExpiresAt,
    profile: profileFromResponse(response),
  });
  await observeTrustedTime();
  await refreshOfflineEntitlement();
  return response;
}

export async function loginMobile(input: { email: string; password: string }) {
  const [deviceId, deviceSecret] = await Promise.all([
    getOrCreateDeviceId(),
    getMobileDeviceSecret(),
  ]);
  if (!deviceSecret) {
    throw new Error("This Waste X Mobile installation has not been registered yet.");
  }
  const response = await wasteXMobileApi.loginMobile({
    email: input.email.trim(),
    password: input.password,
    deviceId,
    deviceSecret,
  });
  await storeMobileSession({
    sessionToken: response.session.token,
    sessionExpiresAt: response.session.expiresAt,
    refreshToken: response.refresh.token,
    refreshExpiresAt: response.refresh.expiresAt,
    profile: profileFromResponse(response),
  });
  await observeTrustedTime();
  await refreshOfflineEntitlement();
  lockOfflineOperations();
  return response;
}

export async function unlockMobileOffline() {
  await unlockOfflineOperations();
  return getMobileAuthSnapshot();
}

export async function logoutMobile() {
  try {
    const snapshot = await getMobileAuthSnapshot();
    if (snapshot.onlineAuthenticated) await wasteXMobileApi.logoutMobile();
  } finally {
    lockOfflineOperations();
    await Promise.all([
      clearMobileSession(),
      clearMobileOfflineEntitlement(),
      clearMobileAssignmentWorkingSet(),
    ]);
  }
}
