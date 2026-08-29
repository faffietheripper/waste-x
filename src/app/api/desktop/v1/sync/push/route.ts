import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";
import {
  processSyncEvent,
  syncPushSchema,
} from "@/lib/client-api/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const parsed = syncPushSchema.safeParse(await request.json());

    if (!parsed.success) {
      return clientApiError(
        "INVALID_SYNC_BATCH",
        400,
        "The Waste X sync batch is invalid.",
        parsed.error.flatten(),
      );
    }

    if (parsed.data.deviceId !== context.deviceId) {
      return clientApiError(
        "DEVICE_MISMATCH",
        403,
        "The sync batch does not belong to this Waste X device.",
      );
    }

    // Process in device order so a sequence of offline state transitions is
    // replayed in the same order the operator performed them.
    const orderedEvents = [...parsed.data.events].sort(
      (a, b) => a.deviceSequence - b.deviceSequence,
    );

    const results = [];
    for (const event of orderedEvents) {
      results.push(await processSyncEvent(context, event));
    }

    return clientApiJson({
      ok: true,
      protocolVersion: 1,
      batchId: parsed.data.batchId,
      results,
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
