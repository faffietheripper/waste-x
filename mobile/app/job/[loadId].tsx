import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
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
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadId, router]);

  const directionLabel = useMemo(() => {
    if (!assignment) return "DRIVER JOB";
    return assignment.job.direction === "incoming" ? "COLLECTION" : "DELIVERY";
  }, [assignment]);

  async function recordNextFieldAction() {
    if (!assignment) return;
    if (isMobileAssignmentReadOnly(assignment)) {
      setError("This Driver job is read only and can no longer be changed.");
      return;
    }

    const workflow = getMobileFieldWorkflowState(assignment);
    const action = getNextMobileFieldWorkflowAction(workflow.step);
    if (!action) return;

    setActionBusy(true);
    setError(null);
    setMessage(null);

    try {
      const queued = await queueMobileJobLoadEvent({
        loadId: assignment.load.id,
        eventType: action.eventType,
      });
      setAssignment(queued.assignment);
      setRejectOpen(false);
      setRejectReason("");
      setSyncStatus(await getMobileSyncStatus());
      setMessage(
        auth?.onlineAuthenticated
          ? `${action.label} saved on this phone first. Syncing with Waste X…`
          : `${action.label} saved securely on this phone and queued for sync.`,
      );

      if (auth?.onlineAuthenticated) {
        try {
          await syncPendingMobileEvents();
          const refreshed = await reloadLocalDetail();
          setMessage(refreshed ? `${action.label} confirmed by Waste X.` : `${action.label} synced.`);
        } catch (syncError) {
          setSyncStatus(await getMobileSyncStatus());
          setMessage(`${action.label} is safe on this phone. Sync will retry automatically.`);
          console.warn("[MOBILE_DRIVER] Immediate sync deferred", syncError);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setActionBusy(false);
    }
  }

  async function rejectCollection() {
    if (!assignment) return;
    const workflow = getMobileFieldWorkflowState(assignment);
    if (workflow.step !== "ASSIGNED" || assignment.load.status.toLowerCase() !== "planned") {
      setRejectOpen(false);
      setError("This collection can no longer be rejected by the Driver because collection has already started.");
      return;
    }

    const reason = rejectReason.trim();
    if (reason.length < 3) {
      setError("Enter a reason before rejecting this collection.");
      return;
    }

    setRejectBusy(true);
    setError(null);
    setMessage(null);

    try {
      const queued = await queueMobileJobLoadEvent({
        loadId: assignment.load.id,
        eventType: "FIELD_COLLECTION_REJECTED",
        payload: { reason },
      });
      setAssignment(queued.assignment);
      setRejectOpen(false);
      setRejectReason("");
      setSyncStatus(await getMobileSyncStatus());
      setMessage(
        auth?.onlineAuthenticated
          ? "Collection rejected on this phone first. Syncing with Waste X…"
          : "Collection rejected securely on this phone and queued for sync.",
      );

      if (auth?.onlineAuthenticated) {
        try {
          await syncPendingMobileEvents();
          const refreshed = await reloadLocalDetail();
          setMessage(refreshed ? "Collection rejection confirmed by Waste X." : "Collection rejection synced.");
        } catch (syncError) {
          setSyncStatus(await getMobileSyncStatus());
          setMessage("Collection rejection is safe on this phone. Sync will retry automatically.");
          console.warn("[MOBILE_DRIVER] Collection rejection sync deferred", syncError);
        }
      }
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : String(reasonError));
    } finally {
      setRejectBusy(false);
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
              {error ?? "Waste X only opens jobs currently assigned and cached for this Driver."}
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
  const terminal = ["completed", "rejected", "cancelled", "canceled"].includes(
    assignment.load.status.toLowerCase(),
  );
  const atDestination = workflow.step === "ARRIVED_DESTINATION";
  const canRejectBeforeCollection =
    !readOnly &&
    workflow.step === "ASSIGNED" &&
    assignment.load.status.toLowerCase() === "planned";
  const workflowIndex = MOBILE_FIELD_WORKFLOW_STEPS.indexOf(workflow.step);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
          <View style={[styles.connectionPill, auth?.onlineAuthenticated ? styles.onlinePill : styles.offlinePill]}>
            <View style={[styles.connectionDot, auth?.onlineAuthenticated ? styles.onlineDot : styles.offlineDot]} />
            <Text style={styles.connectionText}>
              {auth?.onlineAuthenticated ? "Online" : "Offline"}{pending > 0 ? ` · ${pending} queued` : ""}
            </Text>
          </View>
        </View>

        <Text style={styles.eyebrow}>{directionLabel}</Text>
        <Text style={styles.title}>{assignment.job.jobNumber}</Text>
        <Text style={styles.subtitle}>Load {assignment.load.loadNumber} · {formatAssignmentDate(assignment.job.jobDate)}</Text>

        <View style={styles.statusCard}>
          <View style={styles.flexOne}>
            <Text style={styles.statusLabel}>DRIVER PROGRESS</Text>
            <Text style={styles.statusValue}>{humanFieldWorkflowStep(workflow.step)}</Text>
            <Text style={styles.canonicalStatus}>Site load status · {humanStatus(assignment.load.status)}</Text>
          </View>
          <View style={styles.versionBadge}>
            <Text style={styles.versionLabel}>LOCAL VERSION</Text>
            <Text style={styles.versionValue}>v{assignment.load.entityVersion}</Text>
          </View>
        </View>

        {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}
        {message ? <View style={styles.messageCard}><Text style={styles.messageText}>{message}</Text></View> : null}

        <Section title="Driver workflow">
          <Text style={styles.workflowIntro}>
            Record only the physical transport milestones you control. Before collection you may refuse an unsuitable booked collection; after Mark collected, acceptance and rejection belong to the receiving site.
          </Text>
          <View style={styles.timeline}>
            {MOBILE_FIELD_WORKFLOW_STEPS.map((step, index) => {
              const completed = index < workflowIndex;
              const current = index === workflowIndex;
              return (
                <View key={step} style={styles.timelineRow}>
                  <View style={[styles.timelineDot, completed && styles.timelineDotComplete, current && styles.timelineDotCurrent]}>
                    <Text style={styles.timelineDotText}>{completed ? "✓" : current ? "•" : ""}</Text>
                  </View>
                  <View style={styles.flexOne}>
                    <Text style={[styles.timelineLabel, (completed || current) && styles.timelineLabelActive]}>{humanFieldWorkflowStep(step)}</Text>
                    {current && workflow.updatedAt ? <Text style={styles.timelineTime}>{new Date(workflow.updatedAt).toLocaleString()}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>

          {!readOnly && nextAction ? (
            <View style={styles.actionBlock}>
              <Text style={styles.actionEyebrow}>NEXT DRIVER ACTION</Text>
              <Text style={styles.actionTitle}>{nextAction.label}</Text>
              <Text style={styles.actionHelper}>{nextAction.helper}</Text>
              <Pressable disabled={actionBusy || rejectBusy} onPress={() => void recordNextFieldAction()} style={[styles.primaryAction, (actionBusy || rejectBusy) && styles.primaryActionDisabled]}>
                {actionBusy ? <ActivityIndicator color="#ffffff" /> : null}
                <Text style={styles.primaryActionText}>{actionBusy ? "Saving locally…" : nextAction.label}</Text>
              </Pressable>
              <Text style={styles.localActionHint}>Recorded to encrypted SQLCipher first. Internet is not required.</Text>

              {canRejectBeforeCollection ? (
                <View style={styles.rejectBlock}>
                  {!rejectOpen ? (
                    <>
                      <Text style={styles.rejectHelper}>
                        Wrong waste, unsafe load or collection cannot be taken? Refuse it before loading. This option disappears after Mark collected.
                      </Text>
                      <Pressable
                        disabled={actionBusy || rejectBusy}
                        onPress={() => {
                          setRejectOpen(true);
                          setError(null);
                        }}
                        style={styles.rejectOpenButton}
                      >
                        <Text style={styles.rejectOpenButtonText}>Reject collection</Text>
                      </Pressable>
                    </>
                  ) : (
                    <View style={styles.rejectForm}>
                      <Text style={styles.rejectEyebrow}>PRE-COLLECTION REFUSAL</Text>
                      <Text style={styles.rejectTitle}>Why are you rejecting this collection?</Text>
                      <Text style={styles.rejectHelper}>
                        This closes the Driver collection as rejected. It is not the receiving site's later acceptance/rejection decision.
                      </Text>
                      <TextInput
                        editable={!rejectBusy && !actionBusy}
                        maxLength={2000}
                        multiline
                        onChangeText={setRejectReason}
                        placeholder="e.g. Waste on site does not match the booked material"
                        placeholderTextColor="#94a3b8"
                        style={styles.rejectInput}
                        value={rejectReason}
                      />
                      <View style={styles.rejectActions}>
                        <Pressable
                          disabled={rejectBusy || actionBusy}
                          onPress={() => {
                            setRejectOpen(false);
                            setRejectReason("");
                            setError(null);
                          }}
                          style={styles.rejectCancelButton}
                        >
                          <Text style={styles.rejectCancelButtonText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          disabled={rejectBusy || actionBusy || rejectReason.trim().length < 3}
                          onPress={() => void rejectCollection()}
                          style={[
                            styles.rejectConfirmButton,
                            (rejectBusy || actionBusy || rejectReason.trim().length < 3) && styles.rejectConfirmButtonDisabled,
                          ]}
                        >
                          {rejectBusy ? <ActivityIndicator color="#ffffff" /> : null}
                          <Text style={styles.rejectConfirmButtonText}>{rejectBusy ? "Rejecting locally…" : "Confirm rejection"}</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          ) : atDestination && !terminal ? (
            <View style={styles.handoffCard}>
              <Text style={styles.handoffEyebrow}>DRIVER HAND-OFF COMPLETE</Text>
              <Text style={styles.handoffTitle}>Awaiting receiving-site decision.</Text>
              <Text style={styles.handoffBody}>
                The site can now check the waste and paperwork, record the weight, then accept or reject the load. You do not need to confirm delivery or issue a ticket.
              </Text>
            </View>
          ) : (
            <View style={styles.completeBlock}>
              <Text style={styles.completeTitle}>{terminal ? `Load ${humanStatus(assignment.load.status)}` : "No Driver action available."}</Text>
              <Text style={styles.completeBody}>Site-side decisions remain read-only on Driver Mobile.</Text>
            </View>
          )}
        </Section>

        <Section title="Route">
          <SiteCard label={assignment.job.direction === "incoming" ? "COLLECTION SITE" : "ORIGIN SITE"} location={assignment.origin} accent />
          <View style={styles.routeConnector}><View style={styles.routeLine} /><Text style={styles.routeArrow}>↓</Text></View>
          <SiteCard label={assignment.job.direction === "incoming" ? "DESTINATION SITE" : "DELIVERY SITE"} location={assignment.destination} />
        </Section>

        <Section title="Booked waste">
          <View style={styles.detailGrid}>
            <DetailTile label="EWC" value={assignment.load.ewcCode ?? "Not set"} />
            <DetailTile label="SITE NET" value={weight ?? "Pending site weight"} />
          </View>
          <DetailRow label="Booked description" value={assignment.load.wasteDescription ?? assignment.material?.name ?? "Not set"} />
          <Text style={styles.readOnlyHint}>Waste description and weight are site-controlled records on Driver Mobile.</Text>
        </Section>

        <Section title="Driver & vehicle">
          <DetailRow label="Driver" value={assignment.transport.driverName} />
          <DetailRow label="Vehicle" value={assignment.transport.vehicleRegistration ?? "Not assigned"} />
        </Section>

        <Section title="Field notes & issues">
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

        {assignment.load.ticketNumber ? (
          <Section title="Documents">
            <View style={styles.documentCard}>
              <View style={styles.documentTopRow}>
                <View style={styles.flexOne}>
                  <Text style={styles.documentEyebrow}>RECEIVING-SITE TICKET</Text>
                  <Text selectable style={styles.documentNumber}>{assignment.load.ticketNumber}</Text>
                </View>
                <View style={styles.receivedBadge}><Text style={styles.receivedBadgeText}>RECEIVED</Text></View>
              </View>
              <Text style={styles.documentBody}>
                Issued by the receiving site after its final transaction. This Driver copy is read-only; Mobile cannot issue, edit or renumber it.
              </Text>
            </View>
          </Section>
        ) : null}

        <Section title="Job information">
          <DetailRow label="Job status" value={humanStatus(assignment.job.status)} />
          <DetailRow label="Customer reference" value={assignment.job.customerReference ?? "Not supplied"} />
          <DetailRow label="Purchase order" value={assignment.job.purchaseOrder ?? "Not supplied"} />
        </Section>

        {assignment.job.notes ? (
          <Section title="Instructions / notes"><View style={styles.notesCard}><Text style={styles.notesText}>{assignment.job.notes}</Text></View></Section>
        ) : null}

        <View style={styles.localFirstCard}>
          <View style={styles.localFirstDot} />
          <View style={styles.flexOne}>
            <Text style={styles.localFirstTitle}>Local-first Driver record</Text>
            <Text style={styles.localFirstBody}>
              Pre-collection refusal, collection, transit, destination arrival and field evidence are written to encrypted storage first. Site acceptance, destination rejection, weights, completion and tickets stay under Web/Desktop authority.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.sectionCard}>{children}</View></View>;
}

function SiteCard({ label, location, accent = false }: { label: string; location: MobileAssignmentLocationV1 | null; accent?: boolean }) {
  return (
    <View style={[styles.siteCard, accent && styles.siteCardAccent]}>
      <View style={styles.siteTopRow}>
        <Text style={styles.siteLabel}>{label}</Text>
        {location ? <Text style={styles.siteKind}>{location.kind === "OWN_SITE" ? "WASTE X SITE" : "EXTERNAL SITE"}</Text> : null}
      </View>
      <Text style={styles.siteName}>{location?.name ?? "Site pending"}</Text>
      <Text style={styles.siteAddress}>{location?.fullAddress ?? "Address not available"}</Text>
      {location?.postcode ? <Text style={styles.sitePostcode}>{location.postcode}</Text> : null}
    </View>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailTile}><Text style={styles.detailTileLabel}>{label}</Text><Text style={styles.detailTileValue}>{value}</Text></View>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text selectable style={styles.detailValue}>{value}</Text></View>;
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
  emptyTitle: { marginTop: 10, color: "#111827", fontSize: 24, lineHeight: 29, fontWeight: "800" },
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
  statusCard: { marginTop: 20, padding: 18, borderRadius: 18, backgroundColor: "#111827", flexDirection: "row", alignItems: "center", gap: 16 },
  statusLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  statusValue: { marginTop: 5, color: "#ffffff", fontSize: 21, fontWeight: "800" },
  canonicalStatus: { marginTop: 5, color: "#94a3b8", fontSize: 10, fontWeight: "700" },
  versionBadge: { alignItems: "flex-end" },
  versionLabel: { color: "#64748b", fontSize: 8, fontWeight: "900" },
  versionValue: { marginTop: 4, color: "#f97316", fontSize: 14, fontWeight: "900" },
  errorCard: { marginTop: 12, padding: 13, borderRadius: 13, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },
  errorText: { color: "#9f1239", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  messageCard: { marginTop: 12, padding: 13, borderRadius: 13, backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#bbf7d0" },
  messageText: { color: "#166534", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  section: { marginTop: 24 },
  sectionTitle: { marginBottom: 10, color: "#111827", fontSize: 18, fontWeight: "800" },
  sectionCard: { padding: 16, borderRadius: 18, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#ece7df" },
  workflowIntro: { marginBottom: 14, color: "#64748b", fontSize: 11, lineHeight: 17 },
  timeline: { gap: 2 },
  timelineRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 12 },
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
  localActionHint: { marginTop: 8, color: "#94a3b8", fontSize: 9, textAlign: "center", fontWeight: "700" },
  rejectBlock: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#fee2e2" },
  rejectOpenButton: { marginTop: 10, minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fff7f7", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  rejectOpenButtonText: { color: "#b91c1c", fontSize: 12, fontWeight: "900" },
  rejectForm: { padding: 13, borderRadius: 14, backgroundColor: "#fff7f7", borderWidth: 1, borderColor: "#fecaca" },
  rejectEyebrow: { color: "#b91c1c", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  rejectTitle: { marginTop: 6, color: "#7f1d1d", fontSize: 15, fontWeight: "900" },
  rejectHelper: { marginTop: 6, color: "#991b1b", fontSize: 10, lineHeight: 16 },
  rejectInput: { marginTop: 10, minHeight: 82, borderRadius: 12, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#ffffff", color: "#111827", fontSize: 12, lineHeight: 18, paddingHorizontal: 12, paddingVertical: 11, textAlignVertical: "top" },
  rejectActions: { marginTop: 10, flexDirection: "row", gap: 8 },
  rejectCancelButton: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  rejectCancelButtonText: { color: "#475569", fontSize: 11, fontWeight: "800" },
  rejectConfirmButton: { flex: 1.4, minHeight: 44, borderRadius: 12, backgroundColor: "#b91c1c", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  rejectConfirmButtonDisabled: { opacity: 0.4 },
  rejectConfirmButtonText: { color: "#ffffff", fontSize: 11, fontWeight: "900" },
  handoffCard: { marginTop: 16, padding: 15, borderRadius: 14, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa" },
  handoffEyebrow: { color: "#c2410c", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  handoffTitle: { marginTop: 6, color: "#7c2d12", fontSize: 15, fontWeight: "900" },
  handoffBody: { marginTop: 5, color: "#9a3412", fontSize: 11, lineHeight: 17 },
  completeBlock: { marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: "#f8fafc" },
  completeTitle: { color: "#334155", fontSize: 13, fontWeight: "800" },
  completeBody: { marginTop: 5, color: "#64748b", fontSize: 11, lineHeight: 17 },
  siteCard: { padding: 15, borderRadius: 15, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#f1f5f9" },
  siteCardAccent: { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
  siteTopRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  siteLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "900" },
  siteKind: { color: "#c2410c", fontSize: 8, fontWeight: "800" },
  siteName: { marginTop: 8, color: "#111827", fontSize: 16, fontWeight: "800" },
  siteAddress: { marginTop: 5, color: "#64748b", fontSize: 12, lineHeight: 18 },
  sitePostcode: { marginTop: 4, color: "#334155", fontSize: 11, fontWeight: "800" },
  routeConnector: { height: 30, alignItems: "center", justifyContent: "center" },
  routeLine: { position: "absolute", width: 1, top: 0, bottom: 0, backgroundColor: "#fed7aa" },
  routeArrow: { color: "#f97316", fontSize: 14, backgroundColor: "#ffffff", paddingHorizontal: 5 },
  detailGrid: { flexDirection: "row", gap: 10, marginBottom: 4 },
  detailTile: { flex: 1, minHeight: 75, padding: 13, borderRadius: 13, backgroundColor: "#f8fafc" },
  detailTileLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "900" },
  detailTileValue: { marginTop: 7, color: "#111827", fontSize: 14, fontWeight: "800" },
  detailRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e2e8f0" },
  detailLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "900" },
  detailValue: { marginTop: 5, color: "#334155", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  readOnlyHint: { marginTop: 10, color: "#94a3b8", fontSize: 10, lineHeight: 15 },
  documentCard: { padding: 15, borderRadius: 14, backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0" },
  documentTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  documentEyebrow: { color: "#166534", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  documentNumber: { marginTop: 6, color: "#14532d", fontSize: 14, lineHeight: 20, fontWeight: "900" },
  receivedBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: "#dcfce7" },
  receivedBadgeText: { color: "#15803d", fontSize: 8, fontWeight: "900" },
  documentBody: { marginTop: 10, color: "#166534", fontSize: 11, lineHeight: 17 },
  notesCard: { padding: 14, borderRadius: 13, backgroundColor: "#fff7ed" },
  notesText: { color: "#7c2d12", fontSize: 13, lineHeight: 20 },
  localFirstCard: { marginTop: 24, padding: 16, borderRadius: 17, backgroundColor: "#111827", flexDirection: "row", gap: 12 },
  localFirstDot: { marginTop: 5, width: 9, height: 9, borderRadius: 99, backgroundColor: "#f97316" },
  localFirstTitle: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  localFirstBody: { marginTop: 5, color: "#cbd5e1", fontSize: 11, lineHeight: 17 },
});
