import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { MobileAssignmentV1 } from "@waste-x/contracts";

import { getLocalMobileAssignmentByLoadId } from "@/assignments/local-working-set";
import { isMobileAssignmentReadOnly } from "@/field-ops/workflow";
import {
  getLocalTicketForLoad,
  issueLocalTicket,
  type LocalWasteTicket,
} from "@/tickets/local-ticket";
import {
  getMobileSyncStatus,
  syncPendingMobileEvents,
  type MobileSyncStatus,
} from "@/sync/mobile-sync";

export function MobileTicketPanel({
  assignment,
  online,
  onAssignmentChange,
  onSyncStatusChange,
}: {
  assignment: MobileAssignmentV1;
  online: boolean;
  onAssignmentChange: (assignment: MobileAssignmentV1) => void;
  onSyncStatusChange: (status: MobileSyncStatus) => void;
}) {
  const [ticket, setTicket] = useState<LocalWasteTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reloadTicket() {
    const next = await getLocalTicketForLoad(assignment.load.id);
    setTicket(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    void getLocalTicketForLoad(assignment.load.id)
      .then((next) => {
        if (!cancelled) setTicket(next);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assignment.load.id]);

  async function issue() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await issueLocalTicket(assignment);
      setTicket(result.ticket);
      onAssignmentChange(result.assignment);
      onSyncStatusChange(await getMobileSyncStatus());

      if (!result.created) {
        setMessage("This load already has the same immutable Waste X ticket on this phone.");
        return;
      }

      if (
        result.ticket.numberSource === "MOBILE_OFFLINE" &&
        !result.ticket.cloudEventId
      ) {
        setMessage(
          "Ticket is safely issued in encrypted local storage. Its Cloud queue event could not be attached yet, so do not close the load until this state is remediated.",
        );
        return;
      }

      setMessage(
        online
          ? "Ticket issued in encrypted local storage first. Confirming the ticket number with Waste X Cloud…"
          : "Ticket issued completely offline and queued with the same Waste X load identity.",
      );

      if (online && result.ticket.cloudEventId) {
        try {
          await syncPendingMobileEvents();
          const [refreshedAssignment, syncStatus] = await Promise.all([
            getLocalMobileAssignmentByLoadId(assignment.load.id),
            getMobileSyncStatus(),
          ]);
          if (refreshedAssignment) onAssignmentChange(refreshedAssignment);
          onSyncStatusChange(syncStatus);
          const refreshedTicket = await reloadTicket();
          setMessage(
            refreshedTicket?.syncState === "SYNCED" ||
              refreshedTicket?.syncState === "EXISTING_CLOUD"
              ? "Ticket is safe on this phone and the same ticket number is confirmed by Waste X Cloud."
              : "Ticket is safe on this phone. Cloud reconciliation will continue automatically.",
          );
        } catch (syncError) {
          await reloadTicket();
          onSyncStatusChange(await getMobileSyncStatus());
          setMessage("Ticket is safe on this phone. Cloud sync will retry automatically.");
          console.warn("[MOBILE_TICKET] Immediate sync deferred", syncError);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  const readOnlyWithoutTicket = isMobileAssignmentReadOnly(assignment) && !ticket;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headingRow}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>STEP 13.1 · DIGITAL TICKET</Text>
          <Text style={styles.title}>Issue from the encrypted load record.</Text>
          <Text style={styles.helper}>
            No Cloud counter is required. Waste X derives a stable number from the cached job/load identity, stores the ticket in SQLCipher and reconciles that exact number later.
          </Text>
        </View>
        <View style={[styles.badge, ticket && styles.badgeIssued]}>
          <Text style={[styles.badgeText, ticket && styles.badgeTextIssued]}>
            {ticket ? "ISSUED" : "NOT ISSUED"}
          </Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {message ? (
        <View style={styles.messageCard}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      {ticket ? (
        <View style={styles.ticketCard}>
          <Text style={styles.ticketLabel}>WASTE X TICKET</Text>
          <Text selectable style={styles.ticketNumber}>{ticket.ticketNumber}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Issued</Text>
            <Text style={styles.metaValue}>{new Date(ticket.issuedAt).toLocaleString()}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Local storage</Text>
            <Text style={styles.goodValue}>Encrypted · available offline</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Cloud state</Text>
            <Text style={syncStateStyle(ticket.syncState)}>{humanSyncState(ticket.syncState)}</Text>
          </View>
          <Text selectable style={styles.ticketId}>{ticket.ticketId}</Text>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Waste X ticket has been issued for this load.</Text>
          <Text style={styles.emptyBody}>
            Issuing works without internet. The first immutable snapshot is retained even if this assignment later leaves the active working set.
          </Text>
          <Pressable
            disabled={busy || readOnlyWithoutTicket}
            onPress={() => void issue()}
            style={[
              styles.primaryButton,
              (busy || readOnlyWithoutTicket) && styles.primaryButtonDisabled,
            ]}
          >
            {busy ? <ActivityIndicator color="#ffffff" /> : null}
            <Text style={styles.primaryButtonText}>
              {busy
                ? "Issuing locally…"
                : readOnlyWithoutTicket
                  ? "Ticket must be issued before load closes"
                  : online
                    ? "Issue digital ticket"
                    : "Issue digital ticket offline"}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.nextCard}>
        <Text style={styles.nextTitle}>Next in Section 13</Text>
        <Text style={styles.nextBody}>
          Offline PDF, signatures and evidence will attach to this same immutable ticket ID rather than creating parallel records.
        </Text>
      </View>
    </View>
  );
}

function humanSyncState(state: LocalWasteTicket["syncState"]) {
  switch (state) {
    case "EXISTING_CLOUD":
      return "Already on Cloud load";
    case "LOCAL_ONLY":
      return "Local only";
    case "PENDING":
      return "Queued";
    case "SENDING":
      return "Syncing";
    case "SYNCED":
      return "Cloud confirmed";
    case "CONFLICT":
      return "Conflict";
    case "FAILED":
      return "Sync failed";
  }
}

function syncStateStyle(state: LocalWasteTicket["syncState"]) {
  return state === "SYNCED" || state === "EXISTING_CLOUD"
    ? styles.goodValue
    : state === "CONFLICT" || state === "FAILED"
      ? styles.badValue
      : styles.pendingValue;
}

const styles = StyleSheet.create({
  wrapper: { gap: 12 },
  flexOne: { flex: 1 },
  headingRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  eyebrow: { color: "#c2410c", fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  title: { marginTop: 5, color: "#111827", fontSize: 17, fontWeight: "900" },
  helper: { marginTop: 5, color: "#64748b", fontSize: 11, lineHeight: 17 },
  badge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: "#f1f5f9" },
  badgeIssued: { backgroundColor: "#dcfce7" },
  badgeText: { color: "#64748b", fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  badgeTextIssued: { color: "#15803d" },
  errorCard: { padding: 12, borderRadius: 12, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },
  errorText: { color: "#9f1239", fontSize: 11, lineHeight: 17, fontWeight: "700" },
  messageCard: { padding: 12, borderRadius: 12, backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#bbf7d0" },
  messageText: { color: "#166534", fontSize: 11, lineHeight: 17, fontWeight: "700" },
  ticketCard: { padding: 15, borderRadius: 15, backgroundColor: "#111827" },
  ticketLabel: { color: "#94a3b8", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  ticketNumber: { marginTop: 7, color: "#ffffff", fontSize: 16, lineHeight: 22, fontWeight: "900" },
  metaRow: { marginTop: 10, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  metaLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "700" },
  metaValue: { flex: 1, color: "#cbd5e1", textAlign: "right", fontSize: 9, fontWeight: "700" },
  goodValue: { flex: 1, color: "#86efac", textAlign: "right", fontSize: 9, fontWeight: "800" },
  pendingValue: { flex: 1, color: "#fdba74", textAlign: "right", fontSize: 9, fontWeight: "800" },
  badValue: { flex: 1, color: "#fda4af", textAlign: "right", fontSize: 9, fontWeight: "800" },
  ticketId: { marginTop: 12, color: "#64748b", fontSize: 8 },
  emptyCard: { padding: 14, borderRadius: 14, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa" },
  emptyTitle: { color: "#7c2d12", fontSize: 12, fontWeight: "900" },
  emptyBody: { marginTop: 5, color: "#9a3412", fontSize: 10, lineHeight: 16 },
  primaryButton: { marginTop: 12, minHeight: 46, paddingHorizontal: 14, borderRadius: 13, backgroundColor: "#111827", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: "#ffffff", fontSize: 11, fontWeight: "900", textAlign: "center" },
  nextCard: { padding: 12, borderRadius: 12, backgroundColor: "#f8fafc" },
  nextTitle: { color: "#334155", fontSize: 10, fontWeight: "900" },
  nextBody: { marginTop: 4, color: "#64748b", fontSize: 9, lineHeight: 15 },
});
