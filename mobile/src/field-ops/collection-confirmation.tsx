import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { MobileAssignmentV1 } from "@waste-x/contracts";
import { calculateNetWeight } from "@waste-x/operations-core";

import { getLocalMobileAssignmentByLoadId } from "@/assignments/local-working-set";
import {
  getMobileCollectionChecks,
  isMobileCollectionReady,
} from "@/field-ops/workflow";
import {
  getMobileSyncStatus,
  queueMobileJobLoadEvent,
  syncPendingMobileEvents,
  type MobileSyncStatus,
} from "@/sync/mobile-sync";

type WeightMetric = "Grams" | "Kilograms" | "Tonnes";
type BusyAction = "WASTE" | "QUANTITY" | "MANUAL_WEIGHT" | null;

export function CollectionConfirmationPanel({
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
  const [wasteDescription, setWasteDescription] = useState(
    assignment.load.wasteDescription ?? assignment.material?.name ?? "",
  );
  const [quantity, setQuantity] = useState(assignment.load.netWeight ?? "");
  const [metric, setMetric] = useState<WeightMetric>(assignment.load.weightMetric);
  const [estimate, setEstimate] = useState(Boolean(assignment.load.weightIsEstimate));
  const [gross, setGross] = useState(assignment.load.grossWeight ?? "");
  const [tare, setTare] = useState(assignment.load.tareWeight ?? "");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWasteDescription(
      assignment.load.wasteDescription ?? assignment.material?.name ?? "",
    );
    setQuantity(assignment.load.netWeight ?? "");
    setMetric(assignment.load.weightMetric);
    setEstimate(Boolean(assignment.load.weightIsEstimate));
    setGross(assignment.load.grossWeight ?? "");
    setTare(assignment.load.tareWeight ?? "");
  }, [assignment]);

  const checks = getMobileCollectionChecks(assignment);
  const ready = isMobileCollectionReady(assignment);
  const calculatedNet = useMemo(() => {
    const grossValue = Number(gross);
    const tareValue = Number(tare);
    if (!gross.trim() || !tare.trim()) return null;
    try {
      return calculateNetWeight(grossValue, tareValue);
    } catch {
      return null;
    }
  }, [gross, tare]);

  async function saveDetails(
    kind: Exclude<BusyAction, null>,
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setBusy(kind);
    setError(null);
    setMessage(null);

    try {
      const queued = await queueMobileJobLoadEvent({
        loadId: assignment.load.id,
        eventType: "LOAD_DETAILS_UPDATED",
        payload: {
          ...payload,
          fieldConfirmation: kind,
        },
      });
      onAssignmentChange(queued.assignment);
      onSyncStatusChange(await getMobileSyncStatus());
      setMessage(
        online
          ? `${successMessage} Saved on this phone first; confirming with Waste X Cloud…`
          : `${successMessage} Saved securely on this phone and queued for sync.`,
      );

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
          console.warn("[MOBILE_COLLECTION] Immediate sync deferred", syncError);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  }

  function confirmWaste() {
    const value = wasteDescription.trim();
    if (!value) {
      setError("Enter or confirm the waste description first.");
      return;
    }
    void saveDetails(
      "WASTE",
      { wasteDescription: value },
      "Waste confirmed.",
    );
  }

  function confirmQuantity() {
    const value = Number(quantity);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    void saveDetails(
      "QUANTITY",
      {
        netWeight: value,
        weightMetric: metric,
        weightIsEstimate: estimate,
      },
      "Quantity confirmed.",
    );
  }

  function saveManualWeight() {
    const grossValue = Number(gross);
    const tareValue = Number(tare);
    let netWeight: number;
    try {
      netWeight = calculateNetWeight(grossValue, tareValue);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }
    if (netWeight <= 0) {
      setError("Net weight must be greater than zero.");
      return;
    }
    setQuantity(netWeight.toFixed(3));
    setEstimate(false);
    void saveDetails(
      "MANUAL_WEIGHT",
      {
        grossWeight: grossValue,
        tareWeight: tareValue,
        netWeight,
        weightMetric: metric,
        weightIsEstimate: false,
      },
      "Manual weight recorded.",
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.headingRow}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>COLLECTION CHECKS</Text>
          <Text style={styles.title}>Confirm what is actually on the vehicle.</Text>
        </View>
        <View style={[styles.readyBadge, ready && styles.readyBadgeComplete]}>
          <Text style={[styles.readyBadgeText, ready && styles.readyBadgeTextComplete]}>
            {ready ? "READY" : "2 CHECKS"}
          </Text>
        </View>
      </View>

      <View style={styles.checkRow}>
        <CheckBadge label="Waste" complete={Boolean(checks.wasteConfirmedAt)} />
        <CheckBadge label="Quantity" complete={Boolean(checks.quantityConfirmedAt)} />
        <CheckBadge
          label="Gross / tare"
          complete={Boolean(checks.manualWeightRecordedAt)}
          optional
        />
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

      <View style={styles.formBlock}>
        <Text style={styles.formLabel}>1 · CONFIRM WASTE</Text>
        <Text style={styles.helper}>
          Check the actual waste matches the job instruction. Edit it if the description needs correcting.
        </Text>
        <TextInput
          editable={busy === null}
          multiline
          onChangeText={setWasteDescription}
          placeholder="Waste description"
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.multilineInput]}
          value={wasteDescription}
        />
        <ActionButton
          busy={busy === "WASTE"}
          disabled={busy !== null}
          label={checks.wasteConfirmedAt ? "Reconfirm waste" : "Confirm waste"}
          onPress={confirmWaste}
        />
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formLabel}>2 · CONFIRM QUANTITY</Text>
        <Text style={styles.helper}>
          Waste X records the load quantity as weight. Enter the best known net quantity now; gross/tare can replace it below when available.
        </Text>
        <View style={styles.quantityRow}>
          <TextInput
            editable={busy === null}
            keyboardType="decimal-pad"
            onChangeText={setQuantity}
            placeholder="0.000"
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.quantityInput]}
            value={quantity}
          />
          <View style={styles.metricColumn}>
            {(["Tonnes", "Kilograms", "Grams"] as WeightMetric[]).map((value) => (
              <Pressable
                key={value}
                disabled={busy !== null}
                onPress={() => setMetric(value)}
                style={[styles.metricPill, metric === value && styles.metricPillActive]}
              >
                <Text style={[styles.metricText, metric === value && styles.metricTextActive]}>
                  {value === "Kilograms" ? "kg" : value === "Grams" ? "g" : "t"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.estimateRow}>
          <Pressable
            disabled={busy !== null}
            onPress={() => setEstimate(false)}
            style={[styles.choicePill, !estimate && styles.choicePillActive]}
          >
            <Text style={[styles.choiceText, !estimate && styles.choiceTextActive]}>Actual</Text>
          </Pressable>
          <Pressable
            disabled={busy !== null}
            onPress={() => setEstimate(true)}
            style={[styles.choicePill, estimate && styles.choicePillActive]}
          >
            <Text style={[styles.choiceText, estimate && styles.choiceTextActive]}>Estimate</Text>
          </Pressable>
        </View>
        <ActionButton
          busy={busy === "QUANTITY"}
          disabled={busy !== null}
          label={checks.quantityConfirmedAt ? "Reconfirm quantity" : "Confirm quantity"}
          onPress={confirmQuantity}
        />
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formLabel}>MANUAL WEIGHT · WHEN AVAILABLE</Text>
        <Text style={styles.helper}>
          Enter gross and tare using the same unit. Waste X calculates net automatically and treats it as the confirmed quantity.
        </Text>
        <View style={styles.weightRow}>
          <View style={styles.weightField}>
            <Text style={styles.smallLabel}>GROSS</Text>
            <TextInput
              editable={busy === null}
              keyboardType="decimal-pad"
              onChangeText={setGross}
              placeholder="0.000"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={gross}
            />
          </View>
          <View style={styles.weightField}>
            <Text style={styles.smallLabel}>TARE</Text>
            <TextInput
              editable={busy === null}
              keyboardType="decimal-pad"
              onChangeText={setTare}
              placeholder="0.000"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={tare}
            />
          </View>
        </View>
        <View style={styles.netCard}>
          <Text style={styles.netLabel}>CALCULATED NET</Text>
          <Text style={styles.netValue}>
            {calculatedNet === null ? "—" : `${calculatedNet.toFixed(3)} ${metric === "Tonnes" ? "t" : metric === "Kilograms" ? "kg" : "g"}`}
          </Text>
        </View>
        <ActionButton
          busy={busy === "MANUAL_WEIGHT"}
          disabled={busy !== null}
          label={checks.manualWeightRecordedAt ? "Update manual weight" : "Save manual weight"}
          onPress={saveManualWeight}
        />
      </View>

      <Text style={styles.footerHint}>
        Every confirmation is written to encrypted SQLCipher first and keeps the same Waste X job/load identity.
      </Text>
    </View>
  );
}

function CheckBadge({
  label,
  complete,
  optional = false,
}: {
  label: string;
  complete: boolean;
  optional?: boolean;
}) {
  return (
    <View style={[styles.checkBadge, complete && styles.checkBadgeComplete]}>
      <Text style={[styles.checkIcon, complete && styles.checkIconComplete]}>
        {complete ? "✓" : optional ? "○" : "•"}
      </Text>
      <Text style={[styles.checkText, complete && styles.checkTextComplete]}>{label}</Text>
    </View>
  );
}

function ActionButton({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionButton, disabled && styles.actionButtonDisabled]}
    >
      {busy ? <ActivityIndicator color="#ffffff" /> : null}
      <Text style={styles.actionButtonText}>{busy ? "Saving locally…" : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  flexOne: { flex: 1 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eyebrow: { color: "#ea580c", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  title: { marginTop: 6, color: "#111827", fontSize: 18, lineHeight: 23, fontWeight: "900" },
  readyBadge: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, backgroundColor: "#fff7ed" },
  readyBadgeComplete: { backgroundColor: "#ecfdf5" },
  readyBadgeText: { color: "#c2410c", fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  readyBadgeTextComplete: { color: "#166534" },
  checkRow: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 7 },
  checkBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  checkBadgeComplete: { backgroundColor: "#ecfdf5", borderColor: "#bbf7d0" },
  checkIcon: { color: "#94a3b8", fontSize: 10, fontWeight: "900" },
  checkIconComplete: { color: "#16a34a" },
  checkText: { color: "#64748b", fontSize: 9, fontWeight: "800" },
  checkTextComplete: { color: "#166534" },
  errorCard: { marginTop: 12, padding: 11, borderRadius: 12, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },
  errorText: { color: "#9f1239", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  messageCard: { marginTop: 12, padding: 11, borderRadius: 12, backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#bbf7d0" },
  messageText: { color: "#166534", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  formBlock: { marginTop: 16, padding: 14, borderRadius: 15, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#f1f5f9" },
  formLabel: { color: "#334155", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  helper: { marginTop: 6, color: "#64748b", fontSize: 11, lineHeight: 17 },
  input: { marginTop: 10, minHeight: 46, borderWidth: 1, borderColor: "#dbe1e8", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: "#ffffff", color: "#111827", fontSize: 14, fontWeight: "700" },
  multilineInput: { minHeight: 78, textAlignVertical: "top" },
  quantityRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  quantityInput: { flex: 1 },
  metricColumn: { marginTop: 10, flexDirection: "row", gap: 5, alignItems: "center" },
  metricPill: { minWidth: 36, height: 46, paddingHorizontal: 9, borderRadius: 12, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dbe1e8", alignItems: "center", justifyContent: "center" },
  metricPillActive: { backgroundColor: "#111827", borderColor: "#111827" },
  metricText: { color: "#64748b", fontSize: 10, fontWeight: "900" },
  metricTextActive: { color: "#f97316" },
  estimateRow: { marginTop: 9, flexDirection: "row", gap: 7 },
  choicePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dbe1e8" },
  choicePillActive: { backgroundColor: "#ffedd5", borderColor: "#fed7aa" },
  choiceText: { color: "#64748b", fontSize: 10, fontWeight: "800" },
  choiceTextActive: { color: "#c2410c" },
  actionButton: { marginTop: 12, minHeight: 47, borderRadius: 13, backgroundColor: "#111827", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  actionButtonDisabled: { opacity: 0.6 },
  actionButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  weightRow: { flexDirection: "row", gap: 10 },
  weightField: { flex: 1 },
  smallLabel: { marginTop: 10, color: "#94a3b8", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  netCard: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: "#fff7ed", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  netLabel: { color: "#9a3412", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  netValue: { color: "#7c2d12", fontSize: 14, fontWeight: "900" },
  footerHint: { marginTop: 12, color: "#94a3b8", fontSize: 9, lineHeight: 14, textAlign: "center", fontWeight: "700" },
});
