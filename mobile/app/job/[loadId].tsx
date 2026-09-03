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

import type { MobileAssignmentLocationV1, MobileAssignmentV1 } from "@waste-x/contracts";

import { getLocalMobileAssignmentByLoadId } from "@/assignments/local-working-set";
import {
  getMobileAuthSnapshot,
  type MobileAuthSnapshot,
} from "@/auth/mobile-auth";
import {
  formatAssignmentDate,
  formatWeight,
  humanStatus,
} from "@/field-ops/presentation";
import {
  getMobileSyncStatus,
  type MobileSyncStatus,
} from "@/sync/mobile-sync";

export default function MobileJobDetailScreen() {
  const router = useRouter();
  const { loadId } = useLocalSearchParams<{ loadId: string }>();
  const [assignment, setAssignment] = useState<MobileAssignmentV1 | null>(null);
  const [auth, setAuth] = useState<MobileAuthSnapshot | null>(null);
  const [syncStatus, setSyncStatus] = useState<MobileSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (error || !assignment) {
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

  const weight = formatWeight(assignment);
  const pending = syncStatus?.pending ?? 0;

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
          <View>
            <Text style={styles.statusLabel}>CURRENT STATUS</Text>
            <Text style={styles.statusValue}>{humanStatus(assignment.load.status)}</Text>
          </View>
          <View style={styles.versionBadge}>
            <Text style={styles.versionLabel}>LOCAL VERSION</Text>
            <Text style={styles.versionValue}>v{assignment.load.entityVersion}</Text>
          </View>
        </View>

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
            <DetailTile
              label="WEIGHT"
              value={weight ?? "Not confirmed"}
            />
          </View>
          <DetailRow
            label="Waste description"
            value={assignment.load.wasteDescription ?? assignment.material?.name ?? "Not set"}
          />
          {assignment.material ? (
            <DetailRow label="Material profile" value={assignment.material.name} />
          ) : null}
          <DetailRow label="Weight basis" value={assignment.load.weightMetric} />
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
            <Text style={styles.localFirstTitle}>Available from encrypted local data</Text>
            <Text style={styles.localFirstBody}>
              This job detail screen reads the authorised SQLCipher snapshot on this phone. Cloud connectivity is not required to view it.
            </Text>
          </View>
        </View>

        <View style={styles.nextActionCard}>
          <Text style={styles.nextActionEyebrow}>NEXT FIELD BUILD</Text>
          <Text style={styles.nextActionTitle}>Operational actions attach here next.</Text>
          <Text style={styles.nextActionBody}>
            Start job → en route → collection arrival → collected → in transit → destination arrival → delivered.
          </Text>
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
  statusCard: { marginTop: 20, padding: 18, borderRadius: 18, backgroundColor: "#111827", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  statusValue: { marginTop: 5, color: "#ffffff", fontSize: 21, fontWeight: "800" },
  versionBadge: { alignItems: "flex-end" },
  versionLabel: { color: "#64748b", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  versionValue: { marginTop: 4, color: "#f97316", fontSize: 14, fontWeight: "900" },
  section: { marginTop: 24 },
  sectionTitle: { marginBottom: 10, color: "#111827", fontSize: 18, fontWeight: "800" },
  sectionCard: { padding: 16, borderRadius: 18, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#ece7df" },
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
  nextActionCard: { marginTop: 12, padding: 17, borderRadius: 17, backgroundColor: "#ffedd5" },
  nextActionEyebrow: { color: "#c2410c", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  nextActionTitle: { marginTop: 7, color: "#7c2d12", fontSize: 15, fontWeight: "800" },
  nextActionBody: { marginTop: 5, color: "#9a3412", fontSize: 11, lineHeight: 17 },
});
