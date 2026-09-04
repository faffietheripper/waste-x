import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";

import { database } from "@/db/database";
import { clientDevices, clientSessions } from "@/db/client-sync-schema";
import { organisations, users } from "@/db/schema";

const CLIENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CLIENT_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ClientApiContext = {
  sessionId: string;
  deviceId: string;
  organisationId: string;
  userId: string;
  role: string;
  defaultSiteId: string | null;
};

export class ClientApiAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ClientApiAuthError";
  }
}

export function randomOpaqueSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashOpaqueSecret(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function verifyWasteXPassword(email: string, password: string) {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await database.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
    columns: {
      id: true,
      email: true,
      passwordHash: true,
      organisationId: true,
      role: true,
      isActive: true,
      isSuspended: true,
      status: true,
    },
  });

  if (!user?.passwordHash || !user.organisationId) {
    throw new ClientApiAuthError(
      "AUTH_INVALID_CREDENTIALS",
      401,
      "Invalid email or password.",
    );
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);

  if (!validPassword) {
    throw new ClientApiAuthError(
      "AUTH_INVALID_CREDENTIALS",
      401,
      "Invalid email or password.",
    );
  }

  if (!user.isActive || user.isSuspended || user.status === "SUSPENDED") {
    throw new ClientApiAuthError(
      "ACCOUNT_UNAVAILABLE",
      403,
      "This Waste X account is unavailable.",
    );
  }

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, user.organisationId),
    columns: {
      id: true,
      isSuspended: true,
      status: true,
    },
  });

  if (
    !organisation ||
    organisation.isSuspended ||
    organisation.status === "SUSPENDED" ||
    organisation.status === "REJECTED"
  ) {
    throw new ClientApiAuthError(
      "ORGANISATION_UNAVAILABLE",
      403,
      "This Waste X organisation is unavailable.",
    );
  }

  return user;
}

export async function createClientSession({
  deviceId,
  userId,
  organisationId,
}: {
  deviceId: string;
  userId: string;
  organisationId: string;
}) {
  const sessionToken = randomOpaqueSecret();
  const refreshToken = randomOpaqueSecret();
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CLIENT_SESSION_TTL_MS);
  const refreshExpiresAt = new Date(now.getTime() + CLIENT_REFRESH_TTL_MS);

  await database.insert(clientSessions).values({
    id: sessionId,
    deviceId,
    userId,
    organisationId,
    tokenHash: hashOpaqueSecret(sessionToken),
    expiresAt,
    refreshTokenHash: hashOpaqueSecret(refreshToken),
    refreshExpiresAt,
    lastSeenAt: now,
    createdAt: now,
  });

  return {
    sessionId,
    sessionToken,
    expiresAt,
    refreshToken,
    refreshExpiresAt,
  };
}

export async function refreshClientSession({
  deviceId,
  refreshToken,
  deviceSecret,
}: {
  deviceId: string;
  refreshToken: string;
  deviceSecret: string;
}) {
  const now = new Date();
  const refreshTokenHash = hashOpaqueSecret(refreshToken);
  const deviceSecretHash = hashOpaqueSecret(deviceSecret);

  const session = await database.query.clientSessions.findFirst({
    where: and(
      eq(clientSessions.deviceId, deviceId),
      eq(clientSessions.refreshTokenHash, refreshTokenHash),
      isNull(clientSessions.revokedAt),
      gt(clientSessions.refreshExpiresAt, now),
    ),
    columns: {
      id: true,
      deviceId: true,
      userId: true,
      organisationId: true,
    },
  });

  if (!session) {
    throw new ClientApiAuthError(
      "AUTH_INVALID_REFRESH",
      401,
      "This Waste X Mobile refresh session is invalid or expired.",
    );
  }

  const device = await database.query.clientDevices.findFirst({
    where: and(
      eq(clientDevices.id, session.deviceId),
      eq(clientDevices.secretHash, deviceSecretHash),
      eq(clientDevices.organisationId, session.organisationId),
      eq(clientDevices.deviceType, "MOBILE"),
      eq(clientDevices.status, "ACTIVE"),
    ),
    columns: {
      id: true,
      organisationId: true,
      defaultSiteId: true,
      displayName: true,
      deviceType: true,
      platform: true,
      status: true,
      createdAt: true,
    },
  });

  if (!device) {
    throw new ClientApiAuthError(
      "DEVICE_UNAVAILABLE",
      401,
      "This Waste X Mobile installation is not authorised.",
    );
  }

  const user = await database.query.users.findFirst({
    where: and(
      eq(users.id, session.userId),
      eq(users.organisationId, session.organisationId),
    ),
    columns: {
      id: true,
      email: true,
      role: true,
      organisationId: true,
      isActive: true,
      isSuspended: true,
      status: true,
    },
  });

  if (
    !user ||
    !user.organisationId ||
    !user.isActive ||
    user.isSuspended ||
    user.status === "SUSPENDED"
  ) {
    throw new ClientApiAuthError(
      "ACCOUNT_UNAVAILABLE",
      403,
      "This Waste X account is unavailable.",
    );
  }

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, session.organisationId),
    columns: {
      id: true,
      isSuspended: true,
      status: true,
    },
  });

  if (
    !organisation ||
    organisation.isSuspended ||
    organisation.status === "SUSPENDED" ||
    organisation.status === "REJECTED"
  ) {
    throw new ClientApiAuthError(
      "ORGANISATION_UNAVAILABLE",
      403,
      "This Waste X organisation is unavailable.",
    );
  }

  const nextSessionToken = randomOpaqueSecret();
  const nextRefreshToken = randomOpaqueSecret();
  const expiresAt = new Date(now.getTime() + CLIENT_SESSION_TTL_MS);
  const refreshExpiresAt = new Date(now.getTime() + CLIENT_REFRESH_TTL_MS);

  await Promise.all([
    database
      .update(clientSessions)
      .set({
        tokenHash: hashOpaqueSecret(nextSessionToken),
        expiresAt,
        refreshTokenHash: hashOpaqueSecret(nextRefreshToken),
        refreshExpiresAt,
        lastSeenAt: now,
      })
      .where(eq(clientSessions.id, session.id)),
    database
      .update(clientDevices)
      .set({ lastSeenAt: now, updatedAt: now })
      .where(eq(clientDevices.id, device.id)),
  ]);

  return {
    device,
    user,
    sessionToken: nextSessionToken,
    expiresAt,
    refreshToken: nextRefreshToken,
    refreshExpiresAt,
  };
}

export async function requireClientApiContext(
  request: Request,
): Promise<ClientApiContext> {
  const authorization = request.headers.get("authorization") ?? "";
  const deviceSecret = request.headers.get("x-waste-x-device-secret") ?? "";

  if (!authorization.startsWith("Bearer ") || !deviceSecret) {
    throw new ClientApiAuthError(
      "AUTH_REQUIRED",
      401,
      "Desktop authentication is required.",
    );
  }

  const sessionToken = authorization.slice("Bearer ".length).trim();
  const sessionTokenHash = hashOpaqueSecret(sessionToken);
  const deviceSecretHash = hashOpaqueSecret(deviceSecret);
  const now = new Date();

  const session = await database.query.clientSessions.findFirst({
    where: and(
      eq(clientSessions.tokenHash, sessionTokenHash),
      isNull(clientSessions.revokedAt),
      gt(clientSessions.expiresAt, now),
    ),
    columns: {
      id: true,
      deviceId: true,
      userId: true,
      organisationId: true,
    },
  });

  if (!session) {
    throw new ClientApiAuthError(
      "AUTH_INVALID_SESSION",
      401,
      "Desktop session is invalid or expired.",
    );
  }

  const device = await database.query.clientDevices.findFirst({
    where: and(
      eq(clientDevices.id, session.deviceId),
      eq(clientDevices.secretHash, deviceSecretHash),
      eq(clientDevices.organisationId, session.organisationId),
      eq(clientDevices.status, "ACTIVE"),
    ),
    columns: {
      id: true,
      defaultSiteId: true,
    },
  });

  if (!device) {
    throw new ClientApiAuthError(
      "DEVICE_UNAVAILABLE",
      401,
      "This Waste X device is not authorised.",
    );
  }

  const user = await database.query.users.findFirst({
    where: and(
      eq(users.id, session.userId),
      eq(users.organisationId, session.organisationId),
    ),
    columns: {
      id: true,
      role: true,
      isActive: true,
      isSuspended: true,
      status: true,
    },
  });

  if (
    !user ||
    !user.isActive ||
    user.isSuspended ||
    user.status === "SUSPENDED"
  ) {
    throw new ClientApiAuthError(
      "ACCOUNT_UNAVAILABLE",
      403,
      "This Waste X account is unavailable.",
    );
  }

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, session.organisationId),
    columns: {
      id: true,
      isSuspended: true,
      status: true,
    },
  });

  if (!organisation || organisation.isSuspended || organisation.status === "SUSPENDED") {
    throw new ClientApiAuthError(
      "ORGANISATION_UNAVAILABLE",
      403,
      "This Waste X organisation is unavailable.",
    );
  }

  await Promise.all([
    database
      .update(clientSessions)
      .set({ lastSeenAt: now })
      .where(eq(clientSessions.id, session.id)),
    database
      .update(clientDevices)
      .set({ lastSeenAt: now, updatedAt: now })
      .where(eq(clientDevices.id, device.id)),
  ]);

  return {
    sessionId: session.id,
    deviceId: device.id,
    organisationId: session.organisationId,
    userId: user.id,
    role: user.role,
    defaultSiteId: device.defaultSiteId,
  };
}

export function requireOperationsRole(context: ClientApiContext) {
  const allowed = new Set([
    "administrator",
    "operations",
    "seniorManagement",
    "employee",
  ]);

  if (!allowed.has(context.role)) {
    throw new ClientApiAuthError(
      "PERMISSION_DENIED",
      403,
      "This user cannot perform Waste X operations.",
    );
  }
}
