import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  bootMobileFoundation,
  type MobileFoundationStatus,
} from "@/foundation/boot";

export default function FoundationScreen() {
  const [status, setStatus] = useState<MobileFoundationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void bootMobileFoundation()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>WASTE X MOBILE · STEP 11</Text>
        <Text style={styles.title}>Field operations, local first.</Text>
        <Text style={styles.copy}>
          This phone will operate the same Waste X jobs and loads as Web and
          Desktop. Operational actions will commit locally first, then sync to
          Cloud when connectivity is available.
        </Text>

        {!status && !error ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator />
            <Text style={styles.muted}>Initialising secure Mobile foundation…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Mobile foundation needs attention</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorHint}>
              Waste X Mobile uses SQLCipher, so run it as a native development
              build rather than Expo Go.
            </Text>
          </View>
        ) : null}

        {status ? (
          <>
            <View style={styles.statusCard}>
              <View>
                <Text style={styles.statusLabel}>FOUNDATION</Text>
                <Text style={styles.statusValue}>READY</Text>
              </View>
              <Text style={styles.platform}>{Platform.OS.toUpperCase()}</Text>
            </View>

            <View style={styles.grid}>
              <Info label="Device ID" value={status.deviceId} />
              <Info label="Platform" value={status.platform} />
              <Info label="Local DB" value={`SQLCipher · schema v${status.schemaVersion}`} />
              <Info label="Cipher" value={status.cipherVersion} />
              <Info label="API" value={status.apiBaseUrl} />
              <Info label="Shared core" value={`${status.sharedNetWeightProof} t proof`} />
            </View>

            <View style={styles.sharedCard}>
              <Text style={styles.sectionTitle}>Shared Waste X packages</Text>
              {status.sharedPackages.map((name) => (
                <View style={styles.packageRow} key={name}>
                  <Text style={styles.tick}>✓</Text>
                  <Text style={styles.packageName}>{name}</Text>
                </View>
              ))}
            </View>

            <View style={styles.nextCard}>
              <Text style={styles.sectionTitle}>Next in Step 11</Text>
              <Text style={styles.nextText}>
                Register this device with Waste X Cloud, add Mobile login and
                scoped bootstrap, then attach the shared SyncEvent outbox.
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f7f3ed" },
  container: { padding: 24, paddingBottom: 60 },
  eyebrow: {
    color: "#ea580c",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  title: {
    marginTop: 10,
    color: "#111827",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1.5,
    lineHeight: 42,
  },
  copy: { marginTop: 14, color: "#64748b", fontSize: 15, lineHeight: 23 },
  loadingCard: {
    marginTop: 28,
    padding: 22,
    borderRadius: 18,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  muted: { color: "#64748b" },
  errorCard: {
    marginTop: 28,
    padding: 20,
    borderRadius: 18,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  errorTitle: { color: "#9f1239", fontWeight: "800", fontSize: 17 },
  errorText: { marginTop: 8, color: "#be123c", lineHeight: 20 },
  errorHint: { marginTop: 10, color: "#881337", lineHeight: 20, fontSize: 13 },
  statusCard: {
    marginTop: 28,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusLabel: { color: "#9ca3af", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  statusValue: { marginTop: 4, color: "#fff", fontSize: 24, fontWeight: "800" },
  platform: { color: "#fb923c", fontWeight: "800", fontSize: 12 },
  grid: { marginTop: 14, gap: 10 },
  infoCard: { padding: 16, borderRadius: 15, backgroundColor: "#fff" },
  infoLabel: { color: "#94a3b8", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  infoValue: { marginTop: 6, color: "#1e293b", fontSize: 13, fontWeight: "600" },
  sharedCard: { marginTop: 14, padding: 20, borderRadius: 18, backgroundColor: "#fff" },
  sectionTitle: { color: "#111827", fontSize: 18, fontWeight: "800" },
  packageRow: { marginTop: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  tick: { color: "#15803d", fontWeight: "900" },
  packageName: { color: "#475569", fontSize: 14 },
  nextCard: { marginTop: 14, padding: 20, borderRadius: 18, backgroundColor: "#ffedd5" },
  nextText: { marginTop: 8, color: "#9a3412", fontSize: 14, lineHeight: 21 },
});
