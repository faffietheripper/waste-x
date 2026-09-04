import type {
  DeviceId,
  OrganisationId,
  SiteId,
} from "./ids";

export type DeviceType = "DESKTOP" | "MOBILE";

export type DevicePlatform =
  | "WINDOWS"
  | "MACOS"
  | "LINUX"
  | "IOS"
  | "ANDROID";

export type DeviceStatus = "ACTIVE" | "REVOKED" | "SUSPENDED";

export interface DeviceIdentity {
  deviceId: DeviceId;
  organisationId: OrganisationId;
  defaultSiteId: SiteId | null;
  displayName: string;
  deviceType: DeviceType;
  platform: DevicePlatform;
  status: DeviceStatus;
  registeredAt: string;
}
