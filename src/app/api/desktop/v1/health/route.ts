import { sql } from "drizzle-orm";

import { database } from "@/db/database";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await database.execute(sql`select 1`);

    return clientApiJson({
      ok: true,
      status: "ok",
      database: "reachable",
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CLIENT_API] Health check failed", error);
    return clientApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "Waste X Cloud is not ready to accept Desktop requests.",
    );
  }
}
