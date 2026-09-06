import type { MobileAssignmentV1 } from "@waste-x/contracts";

import { openMobileDatabase } from "@/storage/database";

const CLEANUP_KEY = "stage13_ticket_authority_cleanup_v1";

type LegacyTicketRow = {
  ticket_id: string;
  ticket_number: string;
  load_id: string;
  cloud_event_id: string | null;
};

type AssignmentRow = {
  payload_json: string;
};

/**
 * Early Stage 13 development builds briefly allowed a Driver device to create a
 * management-site ticket. That authority model was intentionally removed.
 *
 * This one-time migration removes only records explicitly stamped
 * MOBILE_OFFLINE by that experimental issuer and its ticket-only queue event.
 * It never touches tickets received from Cloud/Desktop or normal field events.
 */
export async function quarantineLegacyDriverIssuedTickets() {
  const database = await openMobileDatabase();
  const done = await database.getFirstAsync<{ value: string }>(
    `SELECT value FROM local_sync_metadata WHERE key = ? LIMIT 1`,
    CLEANUP_KEY,
  );
  if (done?.value === "done") return;

  const legacy = await database.getAllAsync<LegacyTicketRow>(
    `SELECT ticket_id, ticket_number, load_id, cloud_event_id
     FROM local_ticket
     WHERE number_source = 'MOBILE_OFFLINE'`,
  );

  await database.withTransactionAsync(async () => {
    for (const ticket of legacy) {
      const row = await database.getFirstAsync<AssignmentRow>(
        `SELECT payload_json FROM local_mobile_assignment WHERE load_id = ? LIMIT 1`,
        ticket.load_id,
      );

      if (row?.payload_json) {
        try {
          const assignment = JSON.parse(row.payload_json) as MobileAssignmentV1;
          if (assignment.load.ticketNumber?.trim() === ticket.ticket_number) {
            assignment.load.ticketNumber = null;
            await database.runAsync(
              `UPDATE local_mobile_assignment
               SET payload_json = ?
               WHERE load_id = ?`,
              JSON.stringify(assignment),
              ticket.load_id,
            );
          }
        } catch {
          // Leave an unreadable assignment untouched; the next authorised
          // bootstrap will replace the complete working set transactionally.
        }
      }

      if (ticket.cloud_event_id) {
        const queueRow = await database.getFirstAsync<{
          event_type: string;
          payload_json: string;
        }>(
          `SELECT event_type, payload_json
           FROM local_sync_queue
           WHERE event_id = ?
           LIMIT 1`,
          ticket.cloud_event_id,
        );

        let isLegacyTicketOnlyEvent = false;
        if (queueRow?.event_type === "LOAD_DETAILS_UPDATED") {
          try {
            const payload = JSON.parse(queueRow.payload_json) as Record<string, unknown>;
            const keys = Object.keys(payload);
            isLegacyTicketOnlyEvent =
              keys.length === 1 &&
              keys[0] === "ticketNumber" &&
              payload.ticketNumber === ticket.ticket_number;
          } catch {
            isLegacyTicketOnlyEvent = false;
          }
        }

        if (isLegacyTicketOnlyEvent) {
          await database.runAsync(
            `DELETE FROM local_sync_queue WHERE event_id = ?`,
            ticket.cloud_event_id,
          );
        }
      }

      await database.runAsync(
        `DELETE FROM local_ticket_document WHERE ticket_id = ?`,
        ticket.ticket_id,
      );
      await database.runAsync(
        `DELETE FROM local_ticket WHERE ticket_id = ?`,
        ticket.ticket_id,
      );
    }

    const now = new Date().toISOString();
    await database.runAsync(
      `INSERT INTO local_sync_metadata (key, value, updated_at)
       VALUES (?, 'done', ?)
       ON CONFLICT(key) DO UPDATE SET value = 'done', updated_at = excluded.updated_at`,
      CLEANUP_KEY,
      now,
    );
  });
}
