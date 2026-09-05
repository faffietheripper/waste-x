import * as Crypto from "expo-crypto";

import {
  asDeviceId,
  asOrganisationId,
  asSiteId,
  asSyncEventId,
  asUserId,
  type MobileAssignmentV1,
  type MobileFieldActivityEventTypeV1,
  type MobileFieldIssueTypeV1,
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
  isMobileAssignmentReadOnly,
  isMobileFieldWorkflowEventType,
} from "@/field-ops/workflow";
import { wasteXMobileApi } from "@/platform/api";
import { createUuidV7 } from "@/platform/ids";
import { openMobileDatabase } from "@/storage/database";
import {
  getMobileAuthProfile,
  getOrCreateDeviceId,
} from "@/storage/secure";

/**
 * Driver Mobile is deliberately not a site-operations client. It may record
 * only transport milestones, a pre-collection refusal, and ancillary
 * notes/issues. Waste acceptance at the receiving site, weights, completion
 * and receiving-site ticketing remain Web/Desktop authority.
 */
export type MobileJobLoadEventType =
  | MobileFieldWorkflowEventTypeV1
  | MobileFieldActivityEventTypeV1;

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

type MobileCollectionRejectionPayload = {
  reason: string;
};

type MobileDeliveryNotePayload = {
  note: string;
};

type MobileIssuePayload = {
  issueType: MobileFieldIssueTypeV1;
  summary: string;
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

const MOBILE_FIELD_ACTIVITY_EVENT_TYPES = new Set<MobileFieldActivityEventTypeV1>([
  "FIELD_COLLECTION_REJECTED",
  "FIELD_DELIVERY_NOTE_ADDED",
  "FIELD_ISSUE_REPORTED",
]);

const MOBILE_FIELD_ISSUE_TYPES = new Set<MobileFieldIssueTypeV1>([
  "DELAY",
  "SITE_ACCESS",
  "WASTE_MISMATCH",
  "VEHICLE",
  "SAFETY",
  "OTHER",
]);

export const cloudMobileSyncTransport: MobileSyncTransport = {
  name: "CLOUD",
  push: (batch) => wasteXMobileApi.pushMobileSync(batch),
};

function isMobileFieldActivityEventType(
  value: string,
): value is MobileFieldActivityEventTypeV1 {
  return MOBILE_FIELD_ACTIVITY_EVENT_TYPES.has(
    value as MobileFieldActivityEventTypeV1,
  );
}

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

function validateFieldActivity(
  assignment: MobileAssignmentV1,
  eventType: MobileFieldActivityEventTypeV1,
  payload: unknown,
) {
  const workflow = getMobileFieldWorkflowState(assignment);

  if (eventType === "FIELD_COLLECTION_REJECTED") {
    const reason = (payload as Partial<MobileCollectionRejectionPayload> | null)?.reason;
    if (workflow.step !== "ASSIGNED") {
      throw new Error("A collection can only be rejected before it has been marked collected.");
    }
    if (assignment.load.status.toLowerCase() !== "planned") {
      throw new Error("This load is no longer awaiting Driver collection.");
    }
    if (typeof reason !== "string" || reason.trim().length < 3) {
      throw new Error("Enter a reason before rejecting this collection.");
    }
    if (reason.trim().length > 2000) {
      throw new Error("Collection rejection reasons must be 2,000 characters or fewer.");
    }
    return;
  }

  if (eventType === "FIELD_DELIVERY_NOTE_ADDED") {
    const note = (payload as Partial<MobileDeliveryNotePayload> | null)?.note;
    if (workflow.step !== "ARRIVED_DESTINATION") {
      throw new Error("Arrival notes can be added after reaching the destination.");
    }
    if (typeof note !== "string" || note.trim().length < 2) {
      throw new Error("Enter an arrival note before saving.");
    }
    if (note.trim().length > 2000) {
      throw new Error("Arrival notes must be 2,000 characters or fewer.");
    }
    return;
  }

  const issue = payload as Partial<MobileIssuePayload> | null;
  if (
    !issue ||
    typeof issue.issueType !== "string" ||
    !MOBILE_FIELD_ISSUE_TYPES.has(issue.issueType as MobileFieldIssueTypeV1)
  ) {
    throw new Error("Choose a valid issue type.");
  }
  if (typeof issue.summary !== "string" || issue.summary.trim().length < 3) {
    throw new Error("Describe the issue before reporting it.");
  }
  if (issue.summary.trim().length > 2000) {
    throw new Error("Issue descriptions must be 2,000 characters or fewer.");
  }
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

  if (eventType === "FIELD_COLLECTION_REJECTED") {
    const rejection = payload as MobileCollectionRejectionPayload;
    next.load.status = "rejected";
    next.fieldActivity = [
      ...(next.fieldActivity ?? []),
      {
        eventType,
        occurredAt,
        text: rejection.reason.trim(),
        issueType: null,
      },
    ];
  }

  if (eventType === "FIELD_DELIVERY_NOTE_ADDED") {
    const note = (payload as MobileDeliveryNotePayload).note.trim();
    next.fieldActivity = [
      ...(next.fieldActivity ?? []),
      {
        eventType,
        occurredAt,
        text: note,
        issueType: null,
      },
    ];
  }

  if (eventType === "FIELD_ISSUE_REPORTED") {
    const issue = payload as MobileIssuePayload;
    next.fieldActivity = [
      ...(next.fieldActivity ?? []),
      {
        eventType,
        occurredAt,
        text: issue.summary.trim(),
        issueType: issue.issueType,
      },
    ];
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
  if (isMobileAssignmentReadOnly(assignment)) {
    throw new Error("This field job is read only and can no longer be changed.");
  }

  let payload = input.payload ?? {};

  if (isMobileFieldActivityEventType(input.eventType)) {
    validateFieldActivity(assignment, input.eventType, payload);
  }

  if (isMobileFieldWorkflowEventType(input.eventType)) {
    const current = getMobileFieldWorkflowState(assignment);
    const action = getNextMobileFieldWorkflowAction(current.step);
    if (!action || action.eventType !== input.eventType) {
      throw new Error("This Driver action is not valid for the load's current transport step.");
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
      // Applied events are durable. The working-set refresh can be retried
      // independently without replaying Driver events.
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
