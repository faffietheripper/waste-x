import { desc, eq } from "drizzle-orm";

import {
  clientDevices,
  platformDiagnosticEvents,
  type PlatformDiagnosticOutcome,
  type PlatformDiagnosticSurface,
} from "@/db/client-sync-schema";
import { database } from "@/db/database";
import { organisations, sites, users } from "@/db/schema";

export type AdminDiagnosticFilters = {
  search?: string;
  organisationId?: string;
  userId?: string;
  deviceId?: string;
  surface?: PlatformDiagnosticSurface;
  outcome?: PlatformDiagnosticOutcome;
};

function normalise(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function getAdminDiagnostics(
  filters: AdminDiagnosticFilters = {},
) {
  try {
    const rows = await database
      .select({
        id: platformDiagnosticEvents.id,
        organisationId: platformDiagnosticEvents.organisationId,
        organisationName: organisations.teamName,
        userId: platformDiagnosticEvents.userId,
        userName: users.name,
        userEmail: users.email,
        deviceId: platformDiagnosticEvents.deviceId,
        deviceName: clientDevices.displayName,
        siteId: platformDiagnosticEvents.siteId,
        siteName: sites.name,
        surface: platformDiagnosticEvents.surface,
        clientVersion: platformDiagnosticEvents.clientVersion,
        severity: platformDiagnosticEvents.severity,
        category: platformDiagnosticEvents.category,
        code: platformDiagnosticEvents.code,
        operation: platformDiagnosticEvents.operation,
        route: platformDiagnosticEvents.route,
        method: platformDiagnosticEvents.method,
        entityType: platformDiagnosticEvents.entityType,
        entityId: platformDiagnosticEvents.entityId,
        correlationId: platformDiagnosticEvents.correlationId,
        safeMessage: platformDiagnosticEvents.safeMessage,
        safeContext: platformDiagnosticEvents.safeContext,
        outcome: platformDiagnosticEvents.outcome,
        occurredAt: platformDiagnosticEvents.occurredAt,
        recordedAt: platformDiagnosticEvents.recordedAt,
        resolvedAt: platformDiagnosticEvents.resolvedAt,
      })
      .from(platformDiagnosticEvents)
      .leftJoin(
        organisations,
        eq(platformDiagnosticEvents.organisationId, organisations.id),
      )
      .leftJoin(users, eq(platformDiagnosticEvents.userId, users.id))
      .leftJoin(
        clientDevices,
        eq(platformDiagnosticEvents.deviceId, clientDevices.id),
      )
      .leftJoin(sites, eq(platformDiagnosticEvents.siteId, sites.id))
      .orderBy(desc(platformDiagnosticEvents.occurredAt))
      .limit(500);

    const search = normalise(filters.search);

    const filtered = rows.filter((row) => {
      if (
        filters.organisationId &&
        row.organisationId !== filters.organisationId
      ) {
        return false;
      }

      if (filters.userId && row.userId !== filters.userId) return false;
      if (filters.deviceId && row.deviceId !== filters.deviceId) return false;
      if (filters.surface && row.surface !== filters.surface) return false;
      if (filters.outcome && row.outcome !== filters.outcome) return false;

      if (!search) return true;

      return [
        row.code,
        row.operation,
        row.safeMessage,
        row.correlationId,
        row.organisationName,
        row.userName,
        row.userEmail,
        row.deviceName,
        row.siteName,
        row.entityType,
        row.entityId,
        row.category,
        row.surface,
        row.clientVersion,
      ].some((value) => normalise(value).includes(search));
    });

    return {
      storageReady: true as const,
      rows: filtered.slice(0, 250),
    };
  } catch {
    /*
      Patch C creates the migration source separately. Until the migration is
      actually applied to an environment, the Admin diagnostics route must
      degrade safely rather than taking the whole Admin control plane down.
    */
    return {
      storageReady: false as const,
      rows: [],
    };
  }
}
