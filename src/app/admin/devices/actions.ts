"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { clientDevices, clientSessions } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { recordPlatformAdminAuditEvent } from "@/lib/admin/recordPlatformAdminAudit";

function revalidateDeviceSurfaces(deviceId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/devices");
  revalidatePath(`/admin/devices/${deviceId}`);
}

async function deviceAuditContext(deviceId: string) {
  return database.query.clientDevices.findFirst({
    where: eq(clientDevices.id, deviceId),
    columns: {
      id: true,
      organisationId: true,
      status: true,
      revokedAt: true,
    },
  });
}

export async function suspendDeviceAction(deviceId: string) {
  await requirePlatformAdmin();

  const before = await deviceAuditContext(deviceId);
  if (!before) throw new Error("Device not found.");

  const now = new Date();

  await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(clientDevices)
      .set({
        status: "SUSPENDED",
        updatedAt: now,
      })
      .where(
        and(
          eq(clientDevices.id, deviceId),
          eq(clientDevices.status, "ACTIVE"),
        ),
      )
      .returning({ id: clientDevices.id });

    if (!updated) {
      throw new Error("Only active devices can be suspended.");
    }

    await tx
      .update(clientSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(clientSessions.deviceId, deviceId),
          isNull(clientSessions.revokedAt),
        ),
      );
  });

  await recordPlatformAdminAuditEvent({
    organisationId: before.organisationId,
    entityType: "client_device",
    entityId: deviceId,
    action: "ADMIN_DEVICE_SUSPENDED",
    previousState: { status: before.status },
    newState: { status: "SUSPENDED", sessionsRevoked: true },
  });

  revalidateDeviceSurfaces(deviceId);
}

export async function reactivateDeviceAction(deviceId: string) {
  await requirePlatformAdmin();

  const before = await deviceAuditContext(deviceId);
  if (!before) throw new Error("Device not found.");

  const now = new Date();

  const [updated] = await database
    .update(clientDevices)
    .set({
      status: "ACTIVE",
      revokedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(clientDevices.id, deviceId),
        eq(clientDevices.status, "SUSPENDED"),
      ),
    )
    .returning({ id: clientDevices.id });

  if (!updated) {
    throw new Error("Only suspended devices can be reactivated.");
  }

  /*
    Existing sessions remain revoked. Reactivated clients must authenticate
    again rather than silently regaining an old session.
  */
  await recordPlatformAdminAuditEvent({
    organisationId: before.organisationId,
    entityType: "client_device",
    entityId: deviceId,
    action: "ADMIN_DEVICE_REACTIVATED",
    previousState: { status: before.status },
    newState: { status: "ACTIVE", oldSessionsRestored: false },
  });

  revalidateDeviceSurfaces(deviceId);
}

export async function revokeDeviceAction(deviceId: string) {
  await requirePlatformAdmin();

  const before = await deviceAuditContext(deviceId);
  if (!before) throw new Error("Device not found.");

  const now = new Date();

  await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(clientDevices)
      .set({
        status: "REVOKED",
        revokedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(clientDevices.id, deviceId),
          isNull(clientDevices.revokedAt),
        ),
      )
      .returning({ id: clientDevices.id });

    if (!updated) {
      throw new Error("This device is already revoked or unavailable.");
    }

    await tx
      .update(clientSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(clientSessions.deviceId, deviceId),
          isNull(clientSessions.revokedAt),
        ),
      );
  });

  await recordPlatformAdminAuditEvent({
    organisationId: before.organisationId,
    entityType: "client_device",
    entityId: deviceId,
    action: "ADMIN_DEVICE_REVOKED",
    previousState: { status: before.status },
    newState: { status: "REVOKED", sessionsRevoked: true },
  });

  revalidateDeviceSurfaces(deviceId);
}
