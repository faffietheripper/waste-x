import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type {
  MobileAssignmentLocationV1,
  MobileAssignmentV1,
} from "@waste-x/contracts";

import { getLocalMobileAssignmentByLoadId } from "@/assignments/local-working-set";
import {
  getMobileAuthSnapshot,
  type MobileAuthSnapshot,
} from "@/auth/mobile-auth";
import { CollectionConfirmationPanel } from "@/field-ops/collection-confirmation";
import { DeliveryActivityPanel } from "@/field-ops/delivery-activity";
import {
  formatAssignmentDate,
  formatWeight,
  humanStatus,
} from "@/field-ops/presentation";
import {
  getMobileFieldWorkflowState,
  getNextMobileFieldWorkflowAction,
  humanFieldWorkflowStep,
  isMobileAssignmentReadOnly,
  isMobileCollectionReady,
  MOBILE_FIELD_WORKFLOW_STEPS,
} from "@/field-ops/workflow";
import {
  getMobileSyncStatus,
  queueMobileJobLoadEvent,
  syncPendingMobileEvents,
  type MobileSyncStatus,
} from "@/sync/mobile-sync";

export default function MobileJobDetailScreen() {
  const router = useRouter();
  const { loadId } = useLocalSearchParams<{ loadId: string }>();
  const [assignment, setAssignment] = useState<MobileAssignmentV1 | null>(null);
  const [auth, setAuth] = useState<MobileAuthSnapshot | null>(null);
  const [syncStatus, setSyncStatus] = useState<MobileSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reloadLocalDetail() {
    const [localAssignment, localSync] = await Promise.all([
      getLocalMobileAssignmentByLoadId(loadId ?? ""),
      getMobileSyncStatus(),
    ]);
    setAssignment(localAssignment);
    setSyncStatus(localSync);
    return localAssignment;
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const snapshot = await getMobileAuthSnapshot();
        if (cancelled) return;

        if (!snapshot.authenticated) {
          router.replace("/");
          return;
        }

        const [localAssignment, localSync] = await Promise.all([
          getLocalMobileAssignmentByLoadId(loadId ?? ""),
          getMobileSyncStatus(),
        ]);

        if (cancelled) return;
        setAuth(snapshot);
        setSyncStatus(localSync);
        setAssignment(localAssignment);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadId, router]);

  const directionLabel = useMemo(() => {
    if (!assignment) return "FIELD JOB";
    return assignment.job.direction === "incoming" ? "COLLECTION" : "DELIVERY";
  }, [assignment]);

  async function recordNextFieldAction() {
    if (!assignment) return;
    if (isMobileAssignmentReadOnly(assignment)) {
      setError("This field job is read only and can no longer be changed.");
      return;
    }

    const workflow = getMobileFieldWorkflowState(assignment);
    const action = getNextMobileFieldWorkflowAction(workflow.step);
    if (!action) return;

    if (action.eventType === "FIELD_COLLECTED" && !isMobileCollectionReady(assignment)) {
      setError("Confirm the waste and quantity before marking this load collected.");
      return;
    }

    setActionBusy(true);
    setError(null);
    setMessage(null);

    try {
      const queued = await queueMobileJobLoadEvent({
        loadId: assignment.load.id,
        eventType: action.eventType,
      });
      setAssignment(queued.assignment);
      setSyncStatus(await getMobileSyncStatus());
      setMessage(
        auth?.onlineAuthenticated
          ? `${action.label} saved on this phone first. Syncing with Waste X Cloud…`
          : `${action.label} saved securely on this phone and queued for sync.`,
      );

      if (auth?.onlineAuthenticated) {
        try {
          await syncPendingMobileEvents();
          const refreshed = await reloadLocalDetail();
          setMessage(
            refreshed
              ? `${action.label} saved locally and confirmed by Waste X Cloud.`
              : `${action.label} synced.`,
          );
        } catch (syncError) {
          setSyncStatus(await getMobileSyncStatus());
          setMessage(
            `${action.label} is safe on this phone. Cloud sync will retry when connectivity is available.`,
          );
          console.warn("[MOBILE_FIELD_OPS] Immediate sync deferred", syncError);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Opening cached job…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !assignment) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.emptyContainer}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEyebrow}>JOB UNAVAILABLE</Text>
            <Text style={styles.emptyTitle}>This load is not in your local working set.</Text>
            <Text style={styles.emptyBody}>
              {error ??
                "Waste X only opens field jobs that are currently authorised and cached on this phone."}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!assignment) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.emptyContainer}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEyebrow}>JOB UNAVAILABLE</Text>
            <Text style={styles.emptyTitle}>This load is not in your local working set.</Text>
            <Text style={styles.emptyBody}>
              Waste X only opens field jobs that are currently authorised and cached on this phone.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const weight = formatWeight(assignment);
  const pending = syncStatus?.pending ?? 0;
  const workflow = getMobileFieldWorkflowState(assignment);
  const nextAction = getNextMobileFieldWorkflowAction(workflow.step);
  const readOnly = isMobileAssignmentReadOnly(assignment);
  const canonicalTerminal = ["completed", "rejected", "cancelled", "canceled"].includes(
    assignment.load.status.toLowerCase(),
  );
  const parentJobClosed = ["draft", "cancelled", "canceled"].includes(
    assignment.job.status.toLowerCase(),
  );
  const fieldDelivered = workflow.step === "DELIVERED";
  const workflowIndex = MOBILE_FIELD_WORKFLOW_STEPS.indexOf(workflow.step);
  const collectionReady = isMobileCollectionReady(assignment);
  const collectionGateActive =
    !readOnly && workflow.step === "ARRIVED_COLLECTION";
  const nextActionDisabled =
    readOnly ||
    actionBusy ||
    (nextAction?.eventType === "FIELD_COLLECTED" && !collectionReady);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
          <View
            style={[
              styles.connectionPill,
              auth?.onlineAuthenticated ? styles.onlinePill : styles.offlinePill,
            ]}
          >
            <View
              style={[
                styles.connectionDot,
                auth?.onlineAuthenticated ? styles.onlineDot : styles.offlineDot,
              ]}
            />
            <Text style={styles.connectionText}>
              {auth?.onlineAuthenticated ? "Online" : "Offline"}
              {pending > 0 ? ` · ${pending} queued` : ""}
            </Text>
          </View>
        </View>

        <Text style={styles.eyebrow}>{directionLabel}</Text>
        <Text style={styles.title}>{assignment.job.jobNumber}</Text>
        <Text style={styles.subtitle}>
          Load {assignment.load.loadNumber} · {formatAssignmentDate(assignment.job.jobDate)}
        </Text>

        <View style={styles.statusCard}>
          <View style={styles.flexOne}>
            <Text style={styles.statusLabel}>FIELD PROGRESS</Text>
            <Text style={styles.statusValue}>{humanFieldWorkflowStep(workflow.step)}</Text>
            <Text style={styles.canonicalStatus}>
              Load status · {humanStatus(assignment.load.status)}
            </Text>
          </View>
          <View style={styles.versionBadge}>
            <Text style={styles.versionLabel}>LOCAL VERSION</Text>
            <Text style={styles.versionValue}>v{assignment.load.entityVersion}</Text>
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

        <Section title="Field workflow">
          <View style={styles.timeline}>
            {MOBILE_FIELD_WORKFLOW_STEPS.map((step, index) => {
              const completed = index < workflowIndex;
              const current = index === workflowIndex;
              return (
                <View key={step} style={styles.timelineRow}>
                  <View
                    style={[
                      styles.timelineDot,
                      completed && styles.timelineDotComplete,
                      current && styles.timelineDotCurrent,
                    ]}
                  >
                    <Text style={styles.timelineDotText}>
                      {completed ? "✓" : current ? "•" : ""}
                    </Text>
                  </View>
                  <View style={styles.flexOne}>
                    <Text
                      style={[
                        styles.timelineLabel,
                        (completed || current) && styles.timelineLabelActive,
                      ]}
                    >
                      {humanFieldWorkflowStep(step)}
                    </Text>
                    {current && workflow.updatedAt ? (
                      <Text style={styles.timelineTime}>
                        {new Date(workflow.updatedAt).toLocaleString()}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          {collectionGateActive ? (
            <CollectionConfirmationPanel
              assignment={assignment}
              online={Boolean(auth?.onlineAuthenticated)}
              onAssignmentChange={(updated) => {
                setAssignment(updated);
                setError(null);
              }}
              onSyncStatusChange={setSyncStatus}
            />
          ) : null}

          {!readOnly && nextAction ? (
            <View style={styles.actionBlock}>
              <Text style={styles.actionEyebrow}>NEXT ACTION</Text>
              <Text style={styles.actionTitle}>{nextAction.label}</Text>
              <Text style={styles.actionHelper}>
                {nextAction.eventType === "FIELD_COLLECTED" && !collectionReady
                  ? "Waste and quantity confirmation are required before collection can be recorded."
                  : nextAction.helper}
              </Text>
              <Pressable
                disabled={nextActionDisabled}
                onPress={() => void recordNextFieldAction()}
                style={[
                  styles.primaryAction,
                  nextActionDisabled && styles.primaryActionDisabled,
                ]}
              >
                {actionBusy ? <ActivityIndicator color="#ffffff" /> : null}
                <Text style={styles.primaryActionText}>
                  {actionBusy
                    ? "Saving locally…"
                    : nextAction.eventType === "FIELD_COLLECTED" && !collectionReady
                      ? "Confirm waste & quantity first"
                      : nextAction.label}
                </Text>
              </Pressable>
              <Text style={styles.localActionHint}>
                Recorded to encrypted SQLCipher first. Internet is not required.
              </Text>
            </View>
          ) : (
            <View style={styles.completeBlock}>
              <Text style={styles.completeTitle}>
                {parentJobClosed
                  ? "This job is read only."
                  : canonicalTerminal
                    ? "This load is in a terminal state."
                    : fieldDelivered
                      ? "Field journey complete."
                      : "No field action is available."}
              </Text>
              <Text style={styles.completeBody}>
                {parentJobClosed
                  ? `Job status: ${humanStatus(assignment.job.status)}. No further Mobile actions can be recorded.`
                  : canonicalTerminal
                    ? `Canonical load status: ${humanStatus(assignment.load.status)}.`
                    : fieldDelivered
                      ? "The driver journey is delivered. Existing delivery notes and issues remain visible below while final Waste X compliance completion stays separate."
                      : "Waste X has no valid next field transition for this load."}
              </Text>
            </View>
          )}
        </Section>

        <Section title="Delivery & issues">
          <DeliveryActivityPanel
            assignment={assignment}
            online={Boolean(auth?.onlineAuthenticated)}
            onAssignmentChange={(updated) => {
              setAssignment(updated);
              setError(null);
            }}
            onSyncStatusChange={setSyncStatus}
          />
        </Section>

        <Section title="Route">
          <SiteCard
            label={assignment.job.direction === "incoming" ? "COLLECTION SITE" : "ORIGIN SITE"}
            location={assignment.origin}
            accent
          />
          <View style={styles.routeConnector}>
            <View style={styles.routeLine} />
            <Text style={styles.routeArrow}>↓</Text>
          </View>
          <SiteCard
            label={assignment.job.direction === "incoming" ? "DESTINATION SITE" : "DELIVERY SITE"}
            location={assignment.destination}
          />
        </Section>

        <Section title="Waste & quantity">
          <View style={styles.detailGrid}>
            <DetailTile label="EWC" value={assignment.load.ewcCode ?? "Not set"} />
            <DetailTile label="NET" value={weight ?? "Not confirmed"} />
          </View>
          <DetailRow
            label="Waste description"
            value={assignment.load.wasteDescription ?? assignment.material?.name ?? "Not set"}
          />
          {assignment.material ? (
            <DetailRow label="Material profile" value={assignment.material.name} />
          ) : null}
          {assignment.load.grossWeight ? (
            <DetailRow
              label="Gross weight"
              value={`${assignment.load.grossWeight} ${assignment.load.weightMetric}`}
            />
          ) : null}
          {assignment.load.tareWeight ? (
            <DetailRow
              label="Tare weight"
              value={`${assignment.load.tareWeight} ${assignment.load.weightMetric}`}
            />
          ) : null}
          <DetailRow
            label="Quantity basis"
            value={`${assignment.load.weightMetric}${assignment.load.weightIsEstimate ? " · estimate" : " · actual"}`}
          />
          <DetailRow
            label="Weight source"
            value={assignment.load.weightSource ?? "Not recorded"}
          />
          <DetailRow label="Ticket number" value={assignment.load.ticketNumber ?? "Not issued"} />
        </Section>

        <Section title="Driver & vehicle">
          <DetailRow label="Driver" value={assignment.transport.driverName} />
          <DetailRow
            label="Vehicle"
            value={assignment.transport.vehicleRegistration ?? "Not assigned"}
          />
          <DetailRow label="Driver ID" value={assignment.transport.driverId} mono />
        </Section>

        <Section title="Job information">
          <DetailRow label="Job status" value={humanStatus(assignment.job.status)} />
          <DetailRow
            label="Customer reference"
            value={assignment.job.customerReference ?? "Not supplied"}
          />
          <DetailRow
            label="Purchase order"
            value={assignment.job.purchaseOrder ?? "Not supplied"}
          />
          <DetailRow
            label="Movement time"
            value={
              assignment.load.movementAt
                ? new Date(assignment.load.movementAt).toLocaleString()
                : "Not recorded"
            }
          />
        </Section>

        {assignment.job.notes ? (
          <Section title="Instructions / notes">
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{assignment.job.notes}</Text>
            </View>
          </Section>
        ) : null}

        <View style={styles.localFirstCard}>
          <View style={styles.localFirstDot} />
          <View style={styles.flexOne}>
            <Text style={styles.localFirstTitle}>Local-first operational record</Text>
            <Text style={styles.localFirstBody}>
              Viewing, confirming waste/quantity, recording delivery notes/issues and advancing this journey all use the authorised SQLCipher record on this phone first. Every event keeps the same Waste X load ID for Cloud or trusted Bridge delivery.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function SiteCard({
  label,
  location,
  accent = false,
}: {
  label: string;
  location: MobileAssignmentLocationV1 | null;
  accent?: boolean;
}) {
  return (
    <View style={[styles.siteCard, accent && styles.siteCardAccent]}>
      <View style={styles.siteTopRow}>
        <Text style={styles.siteLabel}>{label}</Text>
        {location ? (
          <Text style={styles.siteKind}>
            {location.kind === "OWN_SITE" ? "WASTE X SITE" : "EXTERNAL SITE"}
          </Text>
        ) : null}
      </View>
      <Text style={styles.siteName}>{location?.name ?? "Site pending"}</Text>
      <Text style={styles.siteAddress}>
        {location?.fullAddress ?? "Address not available"}
      </Text>
      {location?.postcode ? <Text style={styles.sitePostcode}>{location.postcode}</Text> : null}
    </View>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailTile}>
      <Text style={styles.detailTileLabel}>{label}</Text>
      <Text style={styles.detailTileValue}>{value}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={[styles.detailValue, mono && styles.monoValue]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f3ed" },
  content: { paddingHorizontal: 20, paddingBottom: 42 },
  flexOne: { flex: 1 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  emptyContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  emptyCard: { marginTop: 28, padding: 24, borderRadius: 20, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#ece7df" },
  emptyEyebrow: { color: "#ea580c", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  emptyTitle: { marginTop: 10, color: "#111827", fontSize: 24, lineHeight: 29, fontWeight: "800", letterSpacing: -0.7 },
  emptyBody: { marginTop: 10, color: "#64748b", fontSize: 13, lineHeight: 20 },
  topBar: { paddingTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { paddingVertical: 8, paddingRight: 12 },
  backButtonText: { color: "#334155", fontSize: 13, fontWeight: "800" },
  connectionPill: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  onlinePill: { backgroundColor: "#ecfdf5" },
  offlinePill: { backgroundColor: "#fff7ed" },
  connectionDot: { width: 7, height: 7, borderRadius: 99 },
  onlineDot: { backgroundColor: "#16a34a" },
  offlineDot: { backgroundColor: "#f97316" },
  connectionText: { color: "#334155", fontSize: 11, fontWeight: "700" },
  eyebrow: { marginTop: 24, color: "#ea580c", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { marginTop: 7, color: "#111827", fontSize: 36, fontWeight: "900", letterSpacing: -1.2 },
  subtitle: { marginTop: 4, color: "#64748b", fontSize: 14, fontWeight: "600" },
  statusCard: { marginTop: 20, padding: 18, borderRadius: 18, backgroundColor: "#111827", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  statusLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  statusValue: { marginTop: 5, color: "#ffffff", fontSize: 21, fontWeight: "800" },
  canonicalStatus: { marginTop: 5, color: "#94a3b8", fontSize: 10, fontWeight: "700" },
  versionBadge: { alignItems: "flex-end" },
  versionLabel: { color: "#64748b", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  versionValue: { marginTop: 4, color: "#f97316", fontSize: 14, fontWeight: "900" },
  errorCard: { marginTop: 12, padding: 13, borderRadius: 13, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },
  errorText: { color: "#9f1239", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  messageCard: { marginTop: 12, padding: 13, borderRadius: 13, backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#bbf7d0" },
  messageText: { color: "#166534", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  section: { marginTop: 24 },
  sectionTitle: { marginBottom: 10, color: "#111827", fontSize: 18, fontWeight: "800" },
  sectionCard: { padding: 16, borderRadius: 18, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#ece7df" },
  timeline: { gap: 2 },
  timelineRow: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 12 },
  timelineDot: { width: 24, height: 24, borderRadius: 99, borderWidth: 2, borderColor: "#e2e8f0", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  timelineDotComplete: { borderColor: "#111827", backgroundColor: "#111827" },
  timelineDotCurrent: { borderColor: "#f97316", backgroundColor: "#fff7ed" },
  timelineDotText: { color: "#ffffff", fontSize: 11, fontWeight: "900" },
  timelineLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  timelineLabelActive: { color: "#1e293b", fontWeight: "800" },
  timelineTime: { marginTop: 2, color: "#94a3b8", fontSize: 9, fontWeight: "600" },
  actionBlock: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  actionEyebrow: { color: "#ea580c", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  actionTitle: { marginTop: 6, color: "#111827", fontSize: 20, fontWeight: "900" },
  actionHelper: { marginTop: 5, color: "#64748b", fontSize: 12, lineHeight: 18 },
  primaryAction: { marginTop: 14, minHeight: 52, borderRadius: 15, backgroundColor: "#111827", flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  primaryActionDisabled: { opacity: 0.45 },
  primaryActionText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  localActionHint: { marginTop: 8, color: "#94a3b8", fontSize: 9, lineHeight: 14, textAlign: "center", fontWeight: "700" },
  completeBlock: { marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: "#f8fafc" },
  completeTitle: { color: "#334155", fontSize: 13, fontWeight: "800" },
  completeBody: { marginTop: 5, color: "#64748b", fontSize: 11, lineHeight: 17 },
  siteCard: { padding: 15, borderRadius: 15, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#f1f5f9" },
  siteCardAccent: { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
  siteTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  siteLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  siteKind: { color: "#c2410c", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  siteName: { marginTop: 8, color: "#111827", fontSize: 16, fontWeight: "800" },
  siteAddress: { marginTop: 5, color: "#64748b", fontSize: 12, lineHeight: 18 },
  sitePostcode: { marginTop: 4, color: "#334155", fontSize: 11, fontWeight: "800" },
  routeConnector: { height: 30, alignItems: "center", justifyContent: "center" },
  routeLine: { position: "absolute", width: 1, top: 0, bottom: 0, backgroundColor: "#fed7aa" },
  routeArrow: { color: "#f97316", fontSize: 14, fontWeight: "900", backgroundColor: "#ffffff", paddingHorizontal: 5 },
  detailGrid: { flexDirection: "row", gap: 10, marginBottom: 4 },
  detailTile: { flex: 1, minHeight: 75, padding: 13, borderRadius: 13, backgroundColor: "#f8fafc" },
  detailTileLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  detailTileValue: { marginTop: 7, color: "#111827", fontSize: 14, fontWeight: "800" },
  detailRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e2e8f0" },
  detailLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  detailValue: { marginTop: 5, color: "#334155", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  monoValue: { fontSize: 11, fontWeight: "600" },
  notesCard: { padding: 14, borderRadius: 13, backgroundColor: "#fff7ed" },
  notesText: { color: "#7c2d12", fontSize: 13, lineHeight: 20 },
  localFirstCard: { marginTop: 24, padding: 16, borderRadius: 17, backgroundColor: "#111827", flexDirection: "row", gap: 12 },
  localFirstDot: { marginTop: 5, width: 9, height: 9, borderRadius: 99, backgroundColor: "#f97316" },
  localFirstTitle: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  localFirstBody: { marginTop: 5, color: "#cbd5e1", fontSize: 11, lineHeight: 17 },
});
