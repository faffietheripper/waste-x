import * as Crypto from "expo-crypto";

import {
  asDeviceId,
  asOrganisationId,
  asSiteId,
  asSyncEventId,
  asUserId,
  type MobileAssignmentV1,
  type MobileFieldWorkflowEventTypeV1,
  type SyncEventV1,
  type SyncPushRequestV1,
  type SyncPushResponseV1,
} from "@waste-x/contracts";

import {
  getLocalMobileAssignmentWorkingSet,
  refreshMobileAssignmentWorkingSet,
} from "@/assignments/local-working-set";
import {
  applyMobileFieldWorkflowEvent,
  getMobileFieldWorkflowState,
  getNextMobileFieldWorkflowAction,
  isMobileFieldWorkflowEventType,
} from "@/field-ops/workflow";
import { wasteXMobileApi } from "@/platform/api";
import { createUuidV7 } from "@/platform/ids";
import { openMobileDatabase } from "@/storage/database";
import {
  getMobileAuthProfile,
  getOrCreateDeviceId,
} from "@/storage/secure";

export type MobileJobLoadEventType =
  | "LOAD_ARRIVED"
  | "LOAD_DETAILS_UPDATED"
  | "LOAD_COMPLETED"
  | MobileFieldWorkflowEventTypeV1;

export type MobileSyncTransportName = "CLOUD" | "LOCAL_BRIDGE";

export interface MobileSyncTransport {
  name: MobileSyncTransportName;
  push(batch: SyncPushRequestV1): Promise<SyncPushResponseV1>;
}

export type MobileSyncStatus = {
  pending: number;
  relayed: number;
  sending: number;
  synced: number;
  conflicts: number;
  failed: number;
  lastError: string | null;
};

type QueueRow = {
  event_id: string;
  organisation_id: string;
  site_id: string | null;
  device_id: string;
  actor_user_id: string;
  entity_type: "job_load";
  entity_id: string;
  event_type: MobileJobLoadEventType;
  base_version: number | null;
  device_sequence: number;
  payload_json: string;
  payload_hash: string;
  occurred_at: string;
  recorded_at: string;
  status: string;
};

type AssignmentRow = {
  payload_json: string;
};

export const cloudMobileSyncTransport: MobileSyncTransport = {
  name: "CLOUD",
  push: (batch) => wasteXMobileApi.pushMobileSync(batch),
};

async function nextDeviceSequence() {
  const database = await openMobileDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `INSERT INTO local_sync_metadata (key, value, updated_at)
     VALUES ('device_sequence', '1', ?)
     ON CONFLICT(key) DO UPDATE SET
       value = CAST(local_sync_metadata.value AS INTEGER) + 1,
       updated_at = excluded.updated_at`,
    now,
  );

  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_sync_metadata WHERE key = 'device_sequence'",
  );
  const sequence = Number(row?.value ?? "0");
  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error("Waste X Mobile could not allocate a device event sequence.");
  }
  return sequence;
}

async function hashPayload(payload: unknown) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(payload ?? null),
  );
}

function parseAssignment(value: string): MobileAssignmentV1 {
  return JSON.parse(value) as MobileAssignmentV1;
}

function applyLocalProjection(
  assignment: MobileAssignmentV1,
  eventType: MobileJobLoadEventType,
  payload: unknown,
  occurredAt: string,
) {
  let next: MobileAssignmentV1 = JSON.parse(
    JSON.stringify(assignment),
  ) as MobileAssignmentV1;

  if (isMobileFieldWorkflowEventType(eventType)) {
    next = applyMobileFieldWorkflowEvent(next, eventType, occurredAt);
  }

  if (eventType === "LOAD_ARRIVED") {
    next.load.status = "arrived";
    next.load.movementAt = next.load.movementAt ?? occurredAt;
  }

  if (eventType === "LOAD_COMPLETED") {
    next.load.status = "completed";
  }

  if (eventType === "LOAD_DETAILS_UPDATED" && payload && typeof payload === "object") {
    const details = payload as {
      netWeight?: number | null;
      weightMetric?: "Grams" | "Kilograms" | "Tonnes";
      ticketNumber?: string | null;
      wasteDescription?: string;
    };

    if (details.netWeight !== undefined) {
      next.load.netWeight =
        details.netWeight === null ? null : details.netWeight.toFixed(3);
    }
    if (details.weightMetric !== undefined) {
      next.load.weightMetric = details.weightMetric;
    }
    if (details.ticketNumber !== undefined) {
      next.load.ticketNumber = details.ticketNumber;
    }
    if (details.wasteDescription !== undefined) {
      next.load.wasteDescription = details.wasteDescription;
    }
  }

  next.load.entityVersion += 1;
  return next;
}

export async function queueMobileJobLoadEvent(input: {
  loadId: string;
  eventType: MobileJobLoadEventType;
  payload?: unknown;
  occurredAt?: string;
}) {
  const [profile, deviceId] = await Promise.all([
    getMobileAuthProfile(),
    getOrCreateDeviceId(),
  ]);
  if (!profile) {
    throw new Error("Waste X Mobile must be authorised before recording operations.");
  }

  const database = await openMobileDatabase();
  const assignmentRow = await database.getFirstAsync<AssignmentRow>(
    "SELECT payload_json FROM local_mobile_assignment WHERE load_id = ?",
    input.loadId,
  );
  if (!assignmentRow) {
    throw new Error("This load is not in the authorised Mobile working set.");
  }

  const assignment = parseAssignment(assignmentRow.payload_json);
  if (assignment.transport.driverId === "") {
    throw new Error("This Mobile assignment has no authorised Driver scope.");
  }

  let payload = input.payload ?? {};
  if (isMobileFieldWorkflowEventType(input.eventType)) {
    const current = getMobileFieldWorkflowState(assignment);
    const action = getNextMobileFieldWorkflowAction(current.step);
    if (!action || action.eventType !== input.eventType) {
      throw new Error("This field action is not valid for the load's current workflow step.");
    }
    payload = {
      ...(payload && typeof payload === "object" ? payload : {}),
      fromStep: action.fromStep,
      toStep: action.toStep,
    };
  }

  const [eventId, deviceSequence, payloadHash] = await Promise.all([
    createUuidV7(),
    nextDeviceSequence(),
    hashPayload(payload),
  ]);
  const recordedAt = new Date().toISOString();
  const occurredAt = input.occurredAt ?? recordedAt;
  const baseVersion = assignment.load.entityVersion;
  const projected = applyLocalProjection(
    assignment,
    input.eventType,
    payload,
    occurredAt,
  );

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO local_sync_queue (
         event_id,
         organisation_id,
         site_id,
         device_id,
         actor_user_id,
         entity_type,
         entity_id,
         event_type,
         base_version,
         device_sequence,
         payload_json,
         payload_hash,
         occurred_at,
         recorded_at,
         status,
         attempt_count
       ) VALUES (?, ?, NULL, ?, ?, 'job_load', ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0)`,
      eventId,
      profile.organisationId,
      deviceId,
      profile.userId,
      input.loadId,
      input.eventType,
      baseVersion,
      deviceSequence,
      JSON.stringify(payload),
      payloadHash,
      occurredAt,
      recordedAt,
    );

    await database.runAsync(
      `UPDATE local_mobile_assignment
       SET load_status = ?, entity_version = ?, payload_json = ?, refreshed_at = ?
       WHERE load_id = ?`,
      projected.load.status,
      projected.load.entityVersion,
      JSON.stringify(projected),
      recordedAt,
      input.loadId,
    );
  });

  return {
    eventId,
    deviceSequence,
    baseVersion,
    assignment: projected,
  };
}

function rowToEvent(row: QueueRow): SyncEventV1 {
  return {
    schemaVersion: 1,
    eventId: asSyncEventId(row.event_id),
    organisationId: asOrganisationId(row.organisation_id),
    siteId: row.site_id ? asSiteId(row.site_id) : null,
    deviceId: asDeviceId(row.device_id),
    actorUserId: asUserId(row.actor_user_id),
    entityType: row.entity_type,
    entityId: row.entity_id,
    eventType: row.event_type,
    baseVersion: row.base_version,
    deviceSequence: row.device_sequence,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    payload: JSON.parse(row.payload_json) as unknown,
    payloadHash: row.payload_hash,
  };
}

export async function getMobileSyncStatus(): Promise<MobileSyncStatus> {
  const database = await openMobileDatabase();
  const rows = await database.getAllAsync<{ status: string; count: number }>(
    `SELECT status, COUNT(*) AS count
     FROM local_sync_queue
     GROUP BY status`,
  );
  const counts = new Map(rows.map((row) => [row.status, Number(row.count)]));
  const relayedRow = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM local_sync_queue
     WHERE status = 'PENDING' AND last_relayed_at IS NOT NULL`,
  );
  const errorRow = await database.getFirstAsync<{ last_error: string | null }>(
    `SELECT last_error
     FROM local_sync_queue
     WHERE last_error IS NOT NULL
     ORDER BY device_sequence DESC
     LIMIT 1`,
  );

  return {
    pending: counts.get("PENDING") ?? 0,
    relayed: Number(relayedRow?.count ?? 0),
    sending: counts.get("SENDING") ?? 0,
    synced: counts.get("SYNCED") ?? 0,
    conflicts: counts.get("CONFLICT") ?? 0,
    failed: counts.get("FAILED") ?? 0,
    lastError: errorRow?.last_error ?? null,
  };
}

export async function syncPendingMobileEvents(
  transport: MobileSyncTransport = cloudMobileSyncTransport,
) {
  const [profile, deviceId] = await Promise.all([
    getMobileAuthProfile(),
    getOrCreateDeviceId(),
  ]);
  if (!profile) {
    throw new Error("Waste X Mobile is not signed in for sync.");
  }

  const database = await openMobileDatabase();
  const rows = await database.getAllAsync<QueueRow>(
    `SELECT
       event_id,
       organisation_id,
       site_id,
       device_id,
       actor_user_id,
       entity_type,
       entity_id,
       event_type,
       base_version,
       device_sequence,
       payload_json,
       payload_hash,
       occurred_at,
       recorded_at,
       status
     FROM local_sync_queue
     WHERE actor_user_id = ?
       AND status IN ('PENDING', 'SENDING')
     ORDER BY device_sequence ASC
     LIMIT 100`,
    profile.userId,
  );

  if (rows.length === 0) {
    return {
      transport: transport.name,
      uploaded: 0,
      results: [] as SyncPushResponseV1["results"],
    };
  }

  const eventIds = rows.map((row) => row.event_id);
  const placeholders = eventIds.map(() => "?").join(", ");
  await database.runAsync(
    `UPDATE local_sync_queue
     SET status = 'SENDING', last_error = NULL
     WHERE event_id IN (${placeholders})`,
    ...eventIds,
  );

  const batch: SyncPushRequestV1 = {
    protocolVersion: 1,
    deviceId: asDeviceId(deviceId),
    batchId: await createUuidV7(),
    events: rows.map(rowToEvent),
  };

  let response: SyncPushResponseV1;
  try {
    response = await transport.push(batch);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await database.runAsync(
      `UPDATE local_sync_queue
       SET status = 'PENDING',
           attempt_count = attempt_count + 1,
           last_error = ?
       WHERE event_id IN (${placeholders})`,
      message,
      ...eventIds,
    );
    throw error;
  }

  const relayDelivery = transport.name === "LOCAL_BRIDGE";
  const deliveredAt = new Date().toISOString();

  for (const result of response.results) {
    if (
      relayDelivery &&
      (result.status === "APPLIED" || result.status === "DUPLICATE")
    ) {
      await database.runAsync(
        `UPDATE local_sync_queue
         SET status = 'PENDING',
             attempt_count = attempt_count + 1,
             last_error = NULL,
             last_relayed_at = ?,
             relay_bridge_id = COALESCE(relay_bridge_id, 'LOCAL_BRIDGE')
         WHERE event_id = ?`,
        deliveredAt,
        result.eventId,
      );
      continue;
    }

    const status =
      result.status === "APPLIED" || result.status === "DUPLICATE"
        ? "SYNCED"
        : result.status === "CONFLICT"
          ? "CONFLICT"
          : result.status === "RETRYABLE_ERROR"
            ? "PENDING"
            : "FAILED";

    await database.runAsync(
      `UPDATE local_sync_queue
       SET status = ?,
           attempt_count = attempt_count + 1,
           last_error = ?,
           synced_at = CASE WHEN ? = 'SYNCED' THEN ? ELSE synced_at END
       WHERE event_id = ?`,
      status,
      result.reasonCode ?? null,
      status,
      deliveredAt,
      result.eventId,
    );
  }

  const status = await getMobileSyncStatus();
  if (
    transport.name === "CLOUD" &&
    status.pending === 0 &&
    status.sending === 0
  ) {
    try {
      await refreshMobileAssignmentWorkingSet();
    } catch {
      // The Cloud event result remains authoritative and durable. A bootstrap
      // refresh can be retried independently without replaying applied events.
    }
  }

  return {
    transport: transport.name,
    uploaded: rows.length,
    results: response.results,
  };
}

export async function getFirstSyncProofCandidate() {
  const workingSet = await getLocalMobileAssignmentWorkingSet();
  return (
    workingSet.assignments.find(
      (assignment) =>
        assignment.load.status === "planned" &&
        assignment.load.direction === "incoming",
    ) ?? null
  );
}
