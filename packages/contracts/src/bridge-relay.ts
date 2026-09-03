import type { DeviceId, OrganisationId, SiteId } from "./ids";
import type { SyncPushRequestV1, SyncPushResponseV1 } from "./sync";

export interface MobileBridgePairingV1 {
  protocolVersion: 1;
  bridgeId: string;
  organisationId: OrganisationId;
  siteId: SiteId | null;
  displayName: string;
  baseUrl: string;
  relaySecret: string;
  pairedDeviceId: DeviceId;
  pairedAt: string;
}

export interface MobileBridgeHealthV1 {
  ok: true;
  protocolVersion: 1;
  service: "waste-x-bridge-relay";
  bridgeId: string;
  organisationId: OrganisationId;
  siteId: SiteId | null;
  displayName: string;
  acceptsMobileSync: boolean;
}

export interface MobileBridgeSyncPushRequestV1 extends SyncPushRequestV1 {}
export interface MobileBridgeSyncPushResponseV1 extends SyncPushResponseV1 {
  transport: "LOCAL_BRIDGE";
  bridgeId: string;
}
