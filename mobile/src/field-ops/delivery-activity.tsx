import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type {
  MobileAssignmentV1,
  MobileFieldIssueTypeV1,
} from "@waste-x/contracts";

import { getLocalMobileAssignmentByLoadId } from "@/assignments/local-working-set";
import {
  getMobileFieldWorkflowState,
  humanFieldWorkflowStep,
  isMobileAssignmentReadOnly,
} from "@/field-ops/workflow";
import {
  getMobileSyncStatus,
  queueMobileJobLoadEvent,
  syncPendingMobileEvents,
  type MobileSyncStatus,
} from "@/sync/mobile-sync";

const ISSUE_OPTIONS: Array<{ value: MobileFieldIssueTypeV1; label: string }> = [
  { value: "DELAY", label: "Delay" },
  { value: "SITE_ACCESS", label: "Site access" },
  { value: "WASTE_MISMATCH", label: "Waste mismatch" },
  { value: "VEHICLE", label: "Vehicle" },
  { value: "SAFETY", label: "Safety" },
  { value: "OTHER", label: "Other" },
];

type BusyAction = "ARRIVAL_NOTE" | "ISSUE" | null;

export function DeliveryActivityPanel({
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
  const [arrivalNote, setArrivalNote] = useState("");
  const [issueType, setIssueType] = useState<MobileFieldIssueTypeV1>("DELAY");
  const [issueSummary, setIssueSummary] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workflow = getMobileFieldWorkflowState(assignment);
  const readOnly = isMobileAssignmentReadOnly(assignment);
  const canChange = !readOnly;
  const canAddArrivalNote = canChange && workflow.step === "ARRIVED_DESTINATION";
  const activity = [...(assignment.fieldActivity ?? [])].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  );

  async function saveEvent({
    eventType,
    payload,
    successMessage,
    action,
  }: {
    eventType: "FIELD_DELIVERY_NOTE_ADDED" | "FIELD_ISSUE_REPORTED";
    payload: Record<string, unknown>;
    successMessage: string;
    action: Exclude<BusyAction, null>;
  }) {
    setBusy(action);
    setError(null);
    setMessage(null);

    try {
      const queued = await queueMobileJobLoadEvent({
        loadId: assignment.load.id,
        eventType,
        payload,
      });
      onAssignmentChange(queued.assignment);
      onSyncStatusChange(await getMobileSyncStatus());
      setMessage(
        online
          ? `${successMessage} Saved on this phone first; confirming with Waste X Cloud…`
          : `${successMessage} Saved securely on this phone and queued for sync.`,
      );

      if (action === "ARRIVAL_NOTE") setArrivalNote("");
      if (action === "ISSUE") setIssueSummary("");

      if (online) {
        try {
          await syncPendingMobileEvents();
          const [refreshed, syncStatus] = await Promise.all([
            getLocalMobileAssignmentByLoadId(assignment.load.id),
            getMobileSyncStatus(),
          ]);
          if (refreshed) onAssignmentChange(refreshed);
          onSyncStatusChange(syncStatus);
          setMessage(`${successMessage} Confirmed by Waste X Cloud.`);
        } catch (syncError) {
          onSyncStatusChange(await getMobileSyncStatus());
          setMessage(`${successMessage} Safe on this phone. Cloud sync will retry automatically.`);
          console.warn("[MOBILE_FIELD_ACTIVITY] Immediate sync deferred", syncError);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  }

  function addArrivalNote() {
    const note = arrivalNote.trim();
    if (note.length < 2) {
      setError("Enter an arrival note before saving.");
      return;
    }
    void saveEvent({
      eventType: "FIELD_DELIVERY_NOTE_ADDED",
      payload: { note },
      successMessage: "Arrival note recorded.",
      action: "ARRIVAL_NOTE",
    });
  }

  function reportIssue() {
    const summary = issueSummary.trim();
    if (summary.length < 3) {
      setError("Describe the issue before reporting it.");
      return;
    }
    void saveEvent({
      eventType: "FIELD_ISSUE_REPORTED",
      payload: { issueType, summary },
      successMessage: "Issue reported.",
      action: "ISSUE",
    });
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.headingRow}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>FIELD NOTES & ISSUES</Text>
          <Text style={styles.title}>Optional notes stay with this load.</Text>
          <Text style={styles.helper}>
            Ticketing, weights, acceptance and completion are controlled by the receiving site, not the Driver app.
          </Text>
        </View>
        <View style={[styles.stateBadge, !canChange && styles.stateBadgeClosed]}>
          <Text style={[styles.stateBadgeText, !canChange && styles.stateBadgeTextClosed]}>
            {canChange ? "ACTIVE" : "READ ONLY"}
          </Text>
        </View>
      </View>

      {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}
      {message ? <View style={styles.messageCard}><Text style={styles.messageText}>{message}</Text></View> : null}

      {activity.length > 0 ? (
        <View style={styles.historyBlock}>
          <Text style={styles.formLabel}>FIELD ACTIVITY</Text>
          {activity.map((entry, index) => (
            <View key={`${entry.eventType}-${entry.occurredAt}-${index}`} style={styles.activityCard}>
              <View style={styles.activityTopRow}>
                <Text style={[styles.activityKind, entry.eventType === "FIELD_ISSUE_REPORTED" && styles.activityKindIssue]}>
                  {entry.eventType === "FIELD_DELIVERY_NOTE_ADDED"
                    ? "ARRIVAL NOTE"
                    : `ISSUE · ${issueLabel(entry.issueType)}`}
                </Text>
                <Text style={styles.activityTime}>{new Date(entry.occurredAt).toLocaleString()}</Text>
              </View>
              <Text style={styles.activityText}>{entry.text}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyHistory}>
          <Text style={styles.emptyHistoryTitle}>No field notes or issues yet.</Text>
          <Text style={styles.emptyHistoryBody}>You only need to add something here when it is operationally useful.</Text>
        </View>
      )}

      {canAddArrivalNote ? (
        <View style={styles.formBlock}>
          <Text style={styles.formLabel}>ARRIVAL NOTE · OPTIONAL</Text>
          <Text style={styles.helper}>Record a handover or access detail if the receiving site needs it.</Text>
          <TextInput
            editable={busy === null}
            maxLength={2000}
            multiline
            onChangeText={setArrivalNote}
            placeholder="e.g. Waiting at weighbridge bay 2"
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.multilineInput]}
            value={arrivalNote}
          />
          <ActionButton busy={busy === "ARRIVAL_NOTE"} disabled={busy !== null} label="Save arrival note" onPress={addArrivalNote} />
        </View>
      ) : canChange ? (
        <View style={styles.lockedCard}>
          <Text style={styles.lockedTitle}>Arrival notes unlock at the destination.</Text>
          <Text style={styles.lockedBody}>Current Driver step: {humanFieldWorkflowStep(workflow.step)}.</Text>
        </View>
      ) : null}

      {canChange ? (
        <View style={styles.formBlock}>
          <Text style={styles.formLabel}>REPORT ISSUE · OPTIONAL</Text>
          <Text style={styles.helper}>Reporting an issue records the problem; it does not accept, reject or cancel the load.</Text>
          <View style={styles.issueOptions}>
            {ISSUE_OPTIONS.map((option) => {
              const selected = issueType === option.value;
              return (
                <Pressable key={option.value} disabled={busy !== null} onPress={() => setIssueType(option.value)} style={[styles.issueChip, selected && styles.issueChipSelected]}>
                  <Text style={[styles.issueChipText, selected && styles.issueChipTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            editable={busy === null}
            maxLength={2000}
            multiline
            onChangeText={setIssueSummary}
            placeholder="Describe what happened and anything already done"
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.multilineInput]}
            value={issueSummary}
          />
          <ActionButton busy={busy === "ISSUE"} disabled={busy !== null} label="Report issue" onPress={reportIssue} danger />
        </View>
      ) : (
        <View style={styles.closedCard}>
          <Text style={styles.closedTitle}>Driver record closed.</Text>
          <Text style={styles.closedBody}>Canonical load status: {assignment.load.status}.</Text>
        </View>
      )}

      <Text style={styles.localHint}>Notes and issues are written to encrypted SQLCipher first and queued with the same load ID.</Text>
    </View>
  );
}

function issueLabel(value: MobileFieldIssueTypeV1 | null) {
  return (ISSUE_OPTIONS.find((option) => option.value === value)?.label ?? "Other").toUpperCase();
}

function ActionButton({ label, busy, disabled, onPress, danger = false }: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.actionButton, danger && styles.actionButtonDanger, disabled && styles.actionButtonDisabled]}>
      {busy ? <ActivityIndicator color="#ffffff" /> : null}
      <Text style={styles.actionButtonText}>{busy ? "Saving locally…" : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: 2 },
  flexOne: { flex: 1 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  eyebrow: { color: "#ea580c", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  title: { marginTop: 6, color: "#111827", fontSize: 17, lineHeight: 22, fontWeight: "900" },
  helper: { marginTop: 6, color: "#64748b", fontSize: 11, lineHeight: 17 },
  stateBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: "#ecfdf5" },
  stateBadgeClosed: { backgroundColor: "#f1f5f9" },
  stateBadgeText: { color: "#166534", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  stateBadgeTextClosed: { color: "#64748b" },
  errorCard: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },
  errorText: { color: "#9f1239", fontSize: 11, lineHeight: 17, fontWeight: "700" },
  messageCard: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#bbf7d0" },
  messageText: { color: "#166534", fontSize: 11, lineHeight: 17, fontWeight: "700" },
  historyBlock: { marginTop: 18, gap: 8 },
  formLabel: { color: "#475569", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  activityCard: { padding: 12, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  activityTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  activityKind: { color: "#166534", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  activityKindIssue: { color: "#c2410c" },
  activityTime: { color: "#94a3b8", fontSize: 8, fontWeight: "700" },
  activityText: { marginTop: 6, color: "#334155", fontSize: 11, lineHeight: 17 },
  emptyHistory: { marginTop: 16, padding: 13, borderRadius: 12, backgroundColor: "#f8fafc" },
  emptyHistoryTitle: { color: "#475569", fontSize: 11, fontWeight: "800" },
  emptyHistoryBody: { marginTop: 4, color: "#94a3b8", fontSize: 10, lineHeight: 15 },
  formBlock: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  input: { marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: "#dbe2ea", backgroundColor: "#ffffff", color: "#111827", fontSize: 12, paddingHorizontal: 12, paddingVertical: 11 },
  multilineInput: { minHeight: 82, textAlignVertical: "top" },
  issueOptions: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 7 },
  issueChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  issueChipSelected: { backgroundColor: "#fff7ed", borderColor: "#fb923c" },
  issueChipText: { color: "#64748b", fontSize: 9, fontWeight: "800" },
  issueChipTextSelected: { color: "#c2410c" },
  actionButton: { marginTop: 11, minHeight: 46, borderRadius: 13, backgroundColor: "#111827", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 15 },
  actionButtonDanger: { backgroundColor: "#9a3412" },
  actionButtonDisabled: { opacity: 0.5 },
  actionButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  lockedCard: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: "#fff7ed" },
  lockedTitle: { color: "#9a3412", fontSize: 11, fontWeight: "800" },
  lockedBody: { marginTop: 4, color: "#c2410c", fontSize: 10, lineHeight: 15 },
  closedCard: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: "#f1f5f9" },
  closedTitle: { color: "#334155", fontSize: 11, fontWeight: "800" },
  closedBody: { marginTop: 4, color: "#64748b", fontSize: 10, lineHeight: 15 },
  localHint: { marginTop: 12, color: "#94a3b8", fontSize: 9, lineHeight: 14, textAlign: "center", fontWeight: "700" },
});
