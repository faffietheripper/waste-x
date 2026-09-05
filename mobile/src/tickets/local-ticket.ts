import type { MobileAssignmentV1 } from "@waste-x/contracts";

import { isMobileAssignmentReadOnly } from "@/field-ops/workflow";
import { createUuidV7 } from "@/platform/ids";
import { openMobileDatabase } from "@/storage/database";
import {
  getMobileAuthProfile,
  getOrCreateDeviceId,
} from "@/storage/secure";
import { queueMobileJobLoadEvent } from "@/sync/mobile-sync";

export type LocalTicketNumberSource = "EXISTING_LOAD" | "MOBILE_OFFLINE";

export type LocalTicketSyncState =
  | "EXISTING_CLOUD"
  | "LOCAL_ONLY"
  | "PENDING"
  | "SENDING"
  | "SYNCED"
  | "CONFLICT"
  | "FAILED";

export type LocalWasteTicket = {
  ticketId: string;
  ticketNumber: string;
  organisationId: string;
  jobId: string;
  loadId: string;
  deviceId: string;
  numberSource: LocalTicketNumberSource;
  sourceEntityVersion: number;
  assignmentSnapshot: MobileAssignmentV1;
  cloudEventId: string | null;
  syncState: LocalTicketSyncState;
  syncError: string | null;
  syncedAt: string | null;
  issuedAt: string;
  createdAt: string;
  updatedAt: string;
};

type TicketRow = {
  ticket_id: string;
  ticket_number: string;
  organisation_id: string;
  job_id: string;
  load_id: string;
  device_id: string;
  number_source: LocalTicketNumberSource;
  source_entity_version: number;
  snapshot_json: string;
  cloud_event_id: string | null;
  queue_status: string | null;
  queue_error: string | null;
  queue_synced_at: string | null;
  issued_at: string;
  created_at: string;
  updated_at: string;
};

function parseSnapshot(value: string) {
  return JSON.parse(value) as MobileAssignmentV1;
}

function normaliseJobNumber(value: string) {
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "WX-JOB";
}

/**
 * Waste X Mobile receives an immutable Cloud job/load identity before a Driver
 * can work offline. Ticket numbering therefore derives from that cached record
 * instead of a shared online counter. The load UUID fragment protects against
 * accidental human job-number reuse while ticketId remains the canonical
 * immutable identity.
 */
export function buildOfflineTicketNumber(assignment: MobileAssignmentV1) {
  const jobNumber = normaliseJobNumber(assignment.job.jobNumber);
  const loadNumber = String(assignment.load.loadNumber).padStart(2, "0");
  const loadCode = assignment.load.id.replace(/[^a-fA-F0-9]/g, "").slice(0, 8).toUpperCase();
  if (!loadCode) {
    throw new Error("Waste X cannot issue a ticket because this load has no stable identity.");
  }
  return `${jobNumber}-L${loadNumber}-${loadCode}`;
}

function deriveSyncState(row: TicketRow): LocalTicketSyncState {
  if (!row.cloud_event_id) {
    return row.number_source === "EXISTING_LOAD" ? "EXISTING_CLOUD" : "LOCAL_ONLY";
  }

  switch (row.queue_status) {
    case "PENDING":
      return "PENDING";
    case "SENDING":
      return "SENDING";
    case "SYNCED":
      return "SYNCED";
    case "CONFLICT":
      return "CONFLICT";
    case "FAILED":
      return "FAILED";
    default:
      return "LOCAL_ONLY";
  }
}

function rowToTicket(row: TicketRow): LocalWasteTicket {
  return {
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number,
    organisationId: row.organisation_id,
    jobId: row.job_id,
    loadId: row.load_id,
    deviceId: row.device_id,
    numberSource: row.number_source,
    sourceEntityVersion: Number(row.source_entity_version),
    assignmentSnapshot: parseSnapshot(row.snapshot_json),
    cloudEventId: row.cloud_event_id,
    syncState: deriveSyncState(row),
    syncError: row.queue_error,
    syncedAt: row.queue_synced_at,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TICKET_SELECT = `
  SELECT
    ticket.ticket_id,
    ticket.ticket_number,
    ticket.organisation_id,
    ticket.job_id,
    ticket.load_id,
    ticket.device_id,
    ticket.number_source,
    ticket.source_entity_version,
    ticket.snapshot_json,
    ticket.cloud_event_id,
    queue.status AS queue_status,
    queue.last_error AS queue_error,
    queue.synced_at AS queue_synced_at,
    ticket.issued_at,
    ticket.created_at,
    ticket.updated_at
  FROM local_ticket AS ticket
  LEFT JOIN local_sync_queue AS queue
    ON queue.event_id = ticket.cloud_event_id
`;

export async function getLocalTicketForLoad(loadId: string) {
  const database = await openMobileDatabase();
  const row = await database.getFirstAsync<TicketRow>(
    `${TICKET_SELECT} WHERE ticket.load_id = ? LIMIT 1`,
    loadId,
  );
  return row ? rowToTicket(row) : null;
}

export async function getLocalTicketById(ticketId: string) {
  const database = await openMobileDatabase();
  const row = await database.getFirstAsync<TicketRow>(
    `${TICKET_SELECT} WHERE ticket.ticket_id = ? LIMIT 1`,
    ticketId,
  );
  return row ? rowToTicket(row) : null;
}

export async function getLocalTicketsForJob(jobId: string) {
  const database = await openMobileDatabase();
  const rows = await database.getAllAsync<TicketRow>(
    `${TICKET_SELECT} WHERE ticket.job_id = ? ORDER BY ticket.issued_at ASC`,
    jobId,
  );
  return rows.map(rowToTicket);
}

export async function issueLocalTicket(assignment: MobileAssignmentV1) {
  const existing = await getLocalTicketForLoad(assignment.load.id);
  if (existing) return { ticket: existing, assignment, created: false };

  const [profile, deviceId] = await Promise.all([
    getMobileAuthProfile(),
    getOrCreateDeviceId(),
  ]);
  if (!profile) {
    throw new Error("Waste X Mobile must be authorised before issuing a ticket.");
  }
  if (isMobileAssignmentReadOnly(assignment) && !assignment.load.ticketNumber?.trim()) {
    throw new Error("Issue the Waste X ticket before this field load becomes read only.");
  }

  const existingNumber = assignment.load.ticketNumber?.trim() || null;
  const ticketNumber = existingNumber ?? buildOfflineTicketNumber(assignment);
  const numberSource: LocalTicketNumberSource = existingNumber
    ? "EXISTING_LOAD"
    : "MOBILE_OFFLINE";
  const ticketId = await createUuidV7();
  const now = new Date().toISOString();
  const snapshot: MobileAssignmentV1 = JSON.parse(
    JSON.stringify(assignment),
  ) as MobileAssignmentV1;
  snapshot.load.ticketNumber = ticketNumber;

  const database = await openMobileDatabase();
  await database.runAsync(
    `INSERT INTO local_ticket (
       ticket_id,
       ticket_number,
       organisation_id,
       job_id,
       load_id,
       device_id,
       number_source,
       source_entity_version,
       snapshot_json,
       cloud_event_id,
       issued_at,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    ticketId,
    ticketNumber,
    profile.organisationId,
    assignment.job.id,
    assignment.load.id,
    deviceId,
    numberSource,
    assignment.load.entityVersion,
    JSON.stringify(snapshot),
    now,
    now,
    now,
  );

  let projectedAssignment = assignment;
  if (!existingNumber) {
    try {
      const queued = await queueMobileJobLoadEvent({
        loadId: assignment.load.id,
        eventType: "LOAD_DETAILS_UPDATED",
        payload: { ticketNumber },
      });
      projectedAssignment = queued.assignment;
      await database.runAsync(
        `UPDATE local_ticket
         SET cloud_event_id = ?, updated_at = ?
         WHERE ticket_id = ?`,
        queued.eventId,
        new Date().toISOString(),
        ticketId,
      );
    } catch (reason) {
      // The ticket remains safely issued in encrypted local storage. Keeping a
      // LOCAL_ONLY ticket is preferable to silently losing an offline legal
      // record; the UI can surface the state for explicit retry/remediation.
      console.warn("[MOBILE_TICKET] Cloud event queue deferred", reason);
    }
  }

  return {
    ticket: (await getLocalTicketById(ticketId))!,
    assignment: projectedAssignment,
    created: true,
  };
}
