import type { DeviceIdentity } from "./device";
import type {
  OrganisationId,
  SiteId,
  UserId,
} from "./ids";

export interface OfflineEntitlementV1 {
  schemaVersion: 1;
  userId: UserId;
  organisationId: OrganisationId;
  deviceId: DeviceIdentity["deviceId"];
  allowedSiteIds: SiteId[];
  role: string;
  permissions: string[];
  issuedAt: string;
  expiresAt: string;
  signedToken: string;
}

export interface DesktopBootstrapV1 {
  schemaVersion: 1;
  generatedAt: string;
  syncCursor: string | null;
  device: DeviceIdentity;
  organisation: unknown;
  sites: unknown[];
  users: unknown[];
  jobs: unknown[];
  jobLoads: unknown[];
  drivers: unknown[];
  vehicles: unknown[];
  counterparties: unknown[];
  permits: unknown[];
  permitEwcCodes: unknown[];
  offlineEntitlement: OfflineEntitlementV1;
}
