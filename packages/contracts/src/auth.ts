import type { DeviceIdentity } from "./device";

export interface DesktopProvisionRequestV1 {
  email: string;
  password: string;
  displayName: string;
  platform: "WINDOWS" | "MACOS" | "LINUX";
  defaultSiteId?: string | null;
}

export interface DesktopProvisionResponseV1 {
  device: DeviceIdentity;
  credentials: {
    deviceSecret: string;
    sessionToken: string;
    sessionExpiresAt: string;
  };
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export interface DesktopLoginRequestV1 {
  email: string;
  password: string;
  deviceId: string;
  deviceSecret: string;
}

export interface DesktopLoginResponseV1 {
  device: DeviceIdentity;
  session: {
    token: string;
    expiresAt: string;
  };
  user: {
    id: string;
    email: string;
    role: string;
    organisationId: string;
  };
}
