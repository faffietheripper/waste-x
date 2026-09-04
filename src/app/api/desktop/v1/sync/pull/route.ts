import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { syncChangeFeed } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const pullSchema = z.object({
  protocolVersion: z.literal(1),
  deviceId: z.string().uuid(),
  cursor: z.string().nullable(),
  limit: z.number().int().min(1).max(1000).optional(),
});

export async function POST(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const parsed = pullSchema.safeParse(await request.json());

    if (!parsed.success) {
      return clientApiError(
        "INVALID_PULL_REQUEST",
        400,
        "The Waste X sync pull request is invalid.",
      );
    }

    if (parsed.data.deviceId !== context.deviceId) {
      return clientApiError(
        "DEVICE_MISMATCH",
        403,
        "The sync request does not belong to this Waste X device.",
      );
    }

    const cursorNumber = parsed.data.cursor === null ? 0 : Number(parsed.data.cursor);
    if (!Number.isSafeInteger(cursorNumber) || cursorNumber < 0) {
      return clientApiError(
        "INVALID_SYNC_CURSOR",
        400,
        "The Waste X sync cursor is invalid.",
      );
    }

    const limit = parsed.data.limit ?? 500;
    const rows = await database
      .select()
      .from(syncChangeFeed)
      .where(
        and(
          eq(syncChangeFeed.organisationId, context.organisationId),
          gt(syncChangeFeed.sequence, cursorNumber),
        ),
      )
      .orderBy(asc(syncChangeFeed.sequence))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return clientApiJson({
      ok: true,
      protocolVersion: 1,
      changes: page.map((change) => ({
        cursor: String(change.sequence),
        entityType: change.entityType,
        entityId: change.entityId,
        entityVersion: change.entityVersion,
        changeType: change.changeType,
        changedAt: change.changedAt?.toISOString() ?? new Date().toISOString(),
        payload: change.payload,
      })),
      nextCursor: last ? String(last.sequence) : parsed.data.cursor,
      hasMore,
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
