export interface DesktopOfflineEntitlementV1 {
  version: 1;
  deviceId: string;
  organisationId: string;
  userId: string;
  role: string;
  defaultSiteId: string | null;
  issuedAt: string;
  expiresAt: string;
  maxOfflineDays: 14;
  signature: string;
}

export interface DesktopOfflineEntitlementResponseV1 {
  ok: true;
  offlineEntitlement: DesktopOfflineEntitlementV1;
}
