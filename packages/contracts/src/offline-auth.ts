export interface ClientOfflineEntitlementV1 {
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

export interface ClientOfflineEntitlementResponseV1 {
  ok: true;
  offlineEntitlement: ClientOfflineEntitlementV1;
}

export type DesktopOfflineEntitlementV1 = ClientOfflineEntitlementV1;
export type DesktopOfflineEntitlementResponseV1 = ClientOfflineEntitlementResponseV1;
export type MobileOfflineEntitlementV1 = ClientOfflineEntitlementV1;
export type MobileOfflineEntitlementResponseV1 = ClientOfflineEntitlementResponseV1;
