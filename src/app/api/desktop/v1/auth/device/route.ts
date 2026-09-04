import { eq } from "drizzle-orm";

import { clientDevices, clientSessions } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import { requireClientApiContext } from "@/lib/client-api/auth";
import {
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    const now = new Date();

    await database.transaction(async (tx) => {
      await tx
        .update(clientDevices)
        .set({
          status: "REVOKED",
          revokedAt: now,
          updatedAt: now,
        })
        .where(eq(clientDevices.id, context.deviceId));

      await tx
        .update(clientSessions)
        .set({ revokedAt: now })
        .where(eq(clientSessions.deviceId, context.deviceId));
    });

    return clientApiJson({
      ok: true,
      revoked: true,
      deviceId: context.deviceId,
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
