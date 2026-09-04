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

export interface BootstrapEntityVersionV1 {
  entityType: string;
  entityId: string;
  version: number;
}

export interface DesktopBootstrapV1 {
  schemaVersion: 1;
  generatedAt: string;
  syncCursor: string | null;
  entityVersions: BootstrapEntityVersionV1[];
  workingSet?: {
    forwardDays: number;
    horizonStart: string;
    horizonEnd: string;
  };
  device: DeviceIdentity | null;
  organisation: unknown;
  sites: unknown[];
  users: unknown[];
  jobs: unknown[];
  jobLoads: unknown[];
  drivers: unknown[];
  vehicles: unknown[];
  counterparties: unknown[];
  counterpartyRoles: unknown[];
  counterpartySites: unknown[];
  counterpartySiteAuthorisations: unknown[];
  counterpartySiteEwcCodes: unknown[];
  ewcCodes: unknown[];
  permits: unknown[];
  permitEwcCodes: unknown[];
  // Step 6 issues this. Keeping it nullable prevents the client from treating
  // an unsigned placeholder as real offline authorisation.
  offlineEntitlement: OfflineEntitlementV1 | null;
}
