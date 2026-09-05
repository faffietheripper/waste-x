import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { MobileAssignmentV1 } from "@waste-x/contracts";

import { getLocalMobileAssignmentWorkingSet } from "@/assignments/local-working-set";
import {
  clearMobileFieldCertification,
  getMobileCertificationSnapshot,
  recordMobileOfflineCertificationCheckpoint,
  startMobileFieldCertification,
  type MobileCertificationSnapshot,
} from "@/field-ops/certification";

export function MobileCertificationPanel({ online }: { online: boolean }) {
  const [assignments, setAssignments] = useState<MobileAssignmentV1[]>([]);
  const [snapshot, setSnapshot] = useState<MobileCertificationSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setBusy(true);
    setError(null);
    try {
      const [workingSet, nextSnapshot] = await Promise.all([
        getLocalMobileAssignmentWorkingSet(),
        getMobileCertificationSnapshot(online),
      ]);
      setAssignments(workingSet.assignments);
      setSnapshot(nextSnapshot);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function start(assignment: MobileAssignmentV1) {
    setBusy(true);
    setError(null);
    try {
      setSnapshot(await startMobileFieldCertification(assignment));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function checkpoint() {
    setBusy(true);
    setError(null);
    try {
      setSnapshot(await recordMobileOfflineCertificationCheckpoint(online));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      await clearMobileFieldCertification();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  const run = snapshot?.run ?? null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>DEVELOPMENT · DRIVER E2E</Text>
          <Text style={styles.title}>Streamlined field certification</Text>
          <Text style={styles.helper}>
            Proves Collected → In transit → Arrived at destination works local-first and reconciles to the same Cloud load.
          </Text>
        </View>
        <View style={[styles.stateBadge, snapshot?.fullyCertified && styles.stateBadgeGood]}>
          <Text style={[styles.stateBadgeText, snapshot?.fullyCertified && styles.stateBadgeTextGood]}>
            {snapshot?.fullyCertified ? "CERTIFIED" : "TEST MODE"}
          </Text>
        </View>
      </View>

      {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}
      {snapshot?.cloudError && online ? <View style={styles.errorCard}><Text style={styles.errorText}>Cloud proof unavailable: {snapshot.cloudError}</Text></View> : null}

      {!run ? (
        <View style={styles.setupBlock}>
          <Text style={styles.subheading}>Choose a real cached assignment</Text>
          {assignments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No real loads are cached yet.</Text>
              <Text style={styles.emptyBody}>Assign this Driver to a booked Job/Load, then refresh the field workspace.</Text>
            </View>
          ) : assignments.map((assignment) => (
            <Pressable key={assignment.load.id} disabled={busy} onPress={() => void start(assignment)} style={styles.assignmentButton}>
              <View style={styles.flexOne}>
                <Text style={styles.assignmentJob}>{assignment.job.jobNumber}</Text>
                <Text style={styles.assignmentMeta}>Load {assignment.load.loadNumber} · {assignment.transport.driverName}</Text>
                <Text selectable style={styles.assignmentId}>{assignment.load.id}</Text>
              </View>
              <Text style={styles.assignmentAction}>Start →</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.runCard}>
            <Text style={styles.runLabel}>CERTIFICATION LOAD</Text>
            <Text style={styles.runTitle}>{run.jobNumber} · Load {run.loadNumber}</Text>
            <Text selectable style={styles.runId}>{run.loadId}</Text>
          </View>

          <View style={styles.checks}>
            <Check label="Driver scope matched" pass={Boolean(snapshot?.driverMatched)} />
            <Check label="Real assignment cached" pass={Boolean(snapshot?.assignmentCached)} />
            <Check label="Same local job/load identity" pass={Boolean(snapshot?.sameRecordIdentity)} />
            <Check label="Collected recorded" pass={Boolean(snapshot?.collectedRecorded)} />
            <Check label="In transit recorded" pass={Boolean(snapshot?.inTransitRecorded)} />
            <Check label="Arrived at destination" pass={Boolean(snapshot?.arrivedDestinationRecorded)} />
            <Check label="Offline checkpoint recorded" pass={Boolean(snapshot?.offlineCheckpointRecorded)} />
            <Check label="Encrypted record survived restart" pass={Boolean(snapshot?.localRecordSurvivedRestart)} />
            <Check label="Cloud queue fully drained" pass={Boolean(snapshot?.cloudQueueDrained)} />
            <Check label="Cloud exact job/load identity" pass={Boolean(snapshot?.cloudIdentityMatches)} />
            <Check label="Cloud Driver state matches Mobile" pass={Boolean(snapshot?.cloudFieldStateMatches)} />
            <Check label="No conflicts / failures" pass={Boolean(snapshot?.noConflictOrFailure)} />
          </View>

          <View style={styles.queueCard}>
            <Text style={styles.queueTitle}>Selected-load outbox</Text>
            <Text style={styles.queueText}>{snapshot?.queue.pending ?? 0} pending · {snapshot?.queue.synced ?? 0} synced · {snapshot?.queue.conflicts ?? 0} conflicts · {snapshot?.queue.failed ?? 0} failed</Text>
            {snapshot?.cloud ? <Text style={styles.cloudText}>Cloud v{snapshot.cloud.entityVersion} · {snapshot.cloud.fieldWorkflow?.step ?? "no Driver mirror"} · {snapshot.cloud.load.id}</Text> : null}
          </View>

          <Pressable disabled={busy || Boolean(snapshot?.offlineCheckpointRecorded)} onPress={() => void checkpoint()} style={[styles.primaryButton, (busy || snapshot?.offlineCheckpointRecorded) && styles.disabledButton]}>
            <Text style={styles.primaryButtonText}>
              {snapshot?.offlineCheckpointRecorded ? "Offline checkpoint recorded" : online ? "Go offline, perform one Driver action, then checkpoint" : "Record offline + queued checkpoint"}
            </Text>
          </Pressable>

          <View style={styles.instructions}>
            <Text style={styles.instructionsTitle}>Certification sequence</Text>
            <Text style={styles.instructionsText}>
              1. Start this proof on a real assigned load. 2. Perform one of the three Driver actions offline. 3. Record the checkpoint. 4. Fully close and reopen Mobile while offline. 5. Reconnect and drain the queue. 6. Finish at Arrived at destination. 7. Refresh proof online. Site accept/reject, weights, completion and tickets are deliberately outside Mobile certification.
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable disabled={busy} onPress={() => void reload()} style={styles.secondaryButton}>{busy ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Refresh proof</Text>}</Pressable>
            <Pressable disabled={busy} onPress={() => void clear()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Reset run</Text></Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function Check({ label, pass }: { label: string; pass: boolean }) {
  return <View style={styles.checkRow}><View style={[styles.checkDot, pass && styles.checkDotGood]}><Text style={styles.checkDotText}>{pass ? "✓" : ""}</Text></View><Text style={[styles.checkLabel, pass && styles.checkLabelGood]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 18, padding: 17, borderRadius: 18, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa" },
  flexOne: { flex: 1 },
  headerRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  eyebrow: { color: "#c2410c", fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  title: { marginTop: 5, color: "#111827", fontSize: 17, fontWeight: "900" },
  helper: { marginTop: 5, color: "#7c2d12", fontSize: 11, lineHeight: 17 },
  stateBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: "#ffedd5" },
  stateBadgeGood: { backgroundColor: "#dcfce7" },
  stateBadgeText: { color: "#c2410c", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  stateBadgeTextGood: { color: "#15803d" },
  errorCard: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },
  errorText: { color: "#9f1239", fontSize: 11, lineHeight: 17, fontWeight: "700" },
  setupBlock: { marginTop: 14 },
  subheading: { color: "#7c2d12", fontSize: 12, fontWeight: "800" },
  emptyCard: { marginTop: 10, padding: 13, borderRadius: 13, backgroundColor: "#ffffff" },
  emptyTitle: { color: "#334155", fontSize: 12, fontWeight: "800" },
  emptyBody: { marginTop: 4, color: "#64748b", fontSize: 10, lineHeight: 16 },
  assignmentButton: { marginTop: 9, padding: 13, borderRadius: 13, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", gap: 10 },
  assignmentJob: { color: "#111827", fontSize: 13, fontWeight: "900" },
  assignmentMeta: { marginTop: 3, color: "#64748b", fontSize: 10, fontWeight: "700" },
  assignmentId: { marginTop: 3, color: "#94a3b8", fontSize: 8 },
  assignmentAction: { color: "#ea580c", fontSize: 11, fontWeight: "900" },
  runCard: { marginTop: 14, padding: 13, borderRadius: 13, backgroundColor: "#111827" },
  runLabel: { color: "#94a3b8", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  runTitle: { marginTop: 5, color: "#ffffff", fontSize: 14, fontWeight: "900" },
  runId: { marginTop: 4, color: "#fb923c", fontSize: 9 },
  checks: { marginTop: 12, gap: 7 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  checkDot: { width: 20, height: 20, borderRadius: 99, borderWidth: 1, borderColor: "#fdba74", alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  checkDotGood: { backgroundColor: "#166534", borderColor: "#166534" },
  checkDotText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },
  checkLabel: { color: "#9a3412", fontSize: 11, fontWeight: "700" },
  checkLabelGood: { color: "#166534" },
  queueCard: { marginTop: 12, padding: 11, borderRadius: 12, backgroundColor: "#ffffff" },
  queueTitle: { color: "#334155", fontSize: 10, fontWeight: "900" },
  queueText: { marginTop: 3, color: "#64748b", fontSize: 9, lineHeight: 14 },
  cloudText: { marginTop: 5, color: "#0f766e", fontSize: 8, lineHeight: 13, fontWeight: "700" },
  primaryButton: { marginTop: 12, minHeight: 46, paddingHorizontal: 14, borderRadius: 13, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  disabledButton: { opacity: 0.5 },
  primaryButtonText: { color: "#ffffff", fontSize: 11, fontWeight: "900", textAlign: "center" },
  instructions: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#ffffff" },
  instructionsTitle: { color: "#334155", fontSize: 10, fontWeight: "900" },
  instructionsText: { marginTop: 4, color: "#64748b", fontSize: 9, lineHeight: 15 },
  buttonRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  secondaryButton: { flex: 1, minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: "#fdba74", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#9a3412", fontSize: 10, fontWeight: "800" },
});
