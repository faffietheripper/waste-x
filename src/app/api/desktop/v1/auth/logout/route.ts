import { eq } from "drizzle-orm";

import { clientSessions } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import { requireClientApiContext } from "@/lib/client-api/auth";
import {
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await requireClientApiContext(request);

    await database
      .update(clientSessions)
      .set({ revokedAt: new Date() })
      .where(eq(clientSessions.id, context.sessionId));

    return clientApiJson({ ok: true, loggedOut: true });
  } catch (error) {
    return handleClientApiError(error);
  }
}
