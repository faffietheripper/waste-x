import { and, eq, sql } from "drizzle-orm";

import {
  syncChangeFeed,
  syncEntityVersions,
} from "@/db/client-sync-schema";
import { database } from "@/db/database";

export async function getSyncEntityVersion({
  organisationId,
  entityType,
  entityId,
}: {
  organisationId: string;
  entityType: string;
  entityId: string;
}) {
  const row = await database.query.syncEntityVersions.findFirst({
    where: and(
      eq(syncEntityVersions.organisationId, organisationId),
      eq(syncEntityVersions.entityType, entityType),
      eq(syncEntityVersions.entityId, entityId),
    ),
    columns: { version: true },
  });

  return row?.version ?? 0;
}

export async function recordSyncChange({
  organisationId,
  siteId,
  entityType,
  entityId,
  changeType = "UPSERT",
  payload,
}: {
  organisationId: string;
  siteId?: string | null;
  entityType: string;
  entityId: string;
  changeType?: "UPSERT" | "DELETE";
  payload: unknown;
}) {
  return database.transaction(async (tx) => {
    const now = new Date();

    const [versionRow] = await tx
      .insert(syncEntityVersions)
      .values({
        organisationId,
        entityType,
        entityId,
        version: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          syncEntityVersions.organisationId,
          syncEntityVersions.entityType,
          syncEntityVersions.entityId,
        ],
        set: {
          version: sql`${syncEntityVersions.version} + 1`,
          updatedAt: now,
        },
      })
      .returning({ version: syncEntityVersions.version });

    const [change] = await tx
      .insert(syncChangeFeed)
      .values({
        organisationId,
        siteId: siteId ?? null,
        entityType,
        entityId,
        entityVersion: versionRow.version,
        changeType,
        payload,
        changedAt: now,
      })
      .returning({ sequence: syncChangeFeed.sequence });

    return {
      version: versionRow.version,
      cursor: String(change.sequence),
    };
  });
}
