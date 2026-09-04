import { z } from "zod";

export const devicePlatformSchema = z.enum([
  "WINDOWS",
  "MACOS",
  "LINUX",
  "IOS",
  "ANDROID",
]);

export const deviceIdentitySchema = z.object({
  deviceId: z.string().uuid(),
  organisationId: z.string().min(1),
  defaultSiteId: z.string().min(1).nullable(),
  displayName: z.string().trim().min(1).max(120),
  deviceType: z.enum(["DESKTOP", "MOBILE"]),
  platform: devicePlatformSchema,
  status: z.enum(["ACTIVE", "REVOKED", "SUSPENDED"]),
  registeredAt: z.string().datetime({ offset: true }),
});
