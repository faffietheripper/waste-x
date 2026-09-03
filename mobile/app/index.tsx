import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getLocalMobileAssignmentWorkingSet,
  refreshMobileAssignmentWorkingSet,
  type LocalMobileAssignmentWorkingSet,
} from "@/assignments/local-working-set";
import {
  getMobileAuthSnapshot,
  loginMobile,
  logoutMobile,
  provisionMobile,
  unlockMobileOffline,
  type MobileAuthSnapshot,
} from "@/auth/mobile-auth";
import {
  bootMobileFoundation,
  type MobileFoundationStatus,
} from "@/foundation/boot";

export default function FoundationScreen() {
  const [status, setStatus] = useState<MobileFoundationStatus | null>(null);
  const [auth, setAuth] = useState<MobileAuthSnapshot | null>(null);
  const [workingSet, setWorkingSet] = useState<LocalMobileAssignmentWorkingSet | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(
    `Waste X Mobile · ${Platform.OS === "android" ? "Android" : "iPhone"}`,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshAuth() {
    const snapshot = await getMobileAuthSnapshot();
    setAuth(snapshot);
    if (snapshot.profile?.email) setEmail(snapshot.profile.email);
    return snapshot;
  }

  async function loadLocalWorkingSet() {
    const local = await getLocalMobileAssignmentWorkingSet();
    setWorkingSet(local);
    return local;
  }

  async function refreshAssignments() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const local = await refreshMobileAssignmentWorkingSet();
      setWorkingSet(local);
      const resolution = local.scope?.resolution ?? "NO_DRIVER_MATCH";
      if (resolution === "MATCHED") {
        setMessage(
          `Encrypted working set refreshed · ${local.assignments.length} assigned load${local.assignments.length === 1 ? "" : "s"}.`,
        );
      } else if (resolution === "AMBIGUOUS_DRIVER_MATCH") {
        setMessage(
          "No assignments cached because more than one active Driver record matches this Waste X account email.",
        );
      } else {
        setMessage(
          "No assignments cached because this Waste X account is not uniquely linked to an active Driver yet.",
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const foundation = await bootMobileFoundation();
        const [authSnapshot, localWorkingSet] = await Promise.all([
          getMobileAuthSnapshot(),
          getLocalMobileAssignmentWorkingSet(),
        ]);

        if (cancelled) return;
        setStatus(foundation);
        setAuth(authSnapshot);
        setWorkingSet(localWorkingSet);
        if (authSnapshot.profile?.email) setEmail(authSnapshot.profile.email);

        // Refresh only when Cloud authentication is genuinely available. A
        // failed refresh never deletes the existing encrypted local snapshot.
        if (authSnapshot.onlineAuthenticated) {
          try {
            const refreshed = await refreshMobileAssignmentWorkingSet();
            if (!cancelled) setWorkingSet(refreshed);
          } catch {
            // Existing local work remains available. Connectivity/auth detail is
            // already represented by the auth snapshot and offline entitlement.
          }
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAuth() {
    if (!email.trim() || !password) {
      setError("Enter your Waste X email and password.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (auth?.provisioned) {
        await loginMobile({ email, password });
      } else {
        if (!displayName.trim()) {
          throw new Error("Give this Waste X Mobile device a name.");
        }
        await provisionMobile({ email, password, displayName });
      }

      setPassword("");
      const authSnapshot = await refreshAuth();

      if (authSnapshot.onlineAuthenticated) {
        const local = await refreshMobileAssignmentWorkingSet();
        setWorkingSet(local);
        setMessage(
          `Signed in, refreshed 14-day offline authorisation and cached ${local.assignments.length} assigned load${local.assignments.length === 1 ? "" : "s"}.`,
        );
      } else {
        setMessage("Signed in and refreshed 14-day offline authorisation.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function unlockOffline() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const snapshot = await unlockMobileOffline();
      setAuth(snapshot);
      await loadLocalWorkingSet();
      setMessage("Offline operations unlocked with the encrypted local working set.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await logoutMobile();
      await Promise.all([refreshAuth(), loadLocalWorkingSet()]);
      setMessage("Signed out and removed this device's offline authorisation and cached assignments.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  const stateLabel = auth?.onlineAuthenticated
    ? "ONLINE AUTH"
    : auth?.offlineUnlocked
      ? "OFFLINE UNLOCKED"
      : auth?.offline.valid
        ? "OFFLINE READY"
        : auth?.provisioned
          ? "REGISTERED"
          : "READY";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>WASTE X MOBILE · STEP 11</Text>
        <Text style={styles.title}>Field operations, local first.</Text>
        <Text style={styles.copy}>
          Mobile now combines device-bound offline authorisation with an encrypted,
          driver-scoped assignment working set.
        </Text>

        {!status || !auth || !workingSet ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator />
            <Text style={styles.muted}>Initialising secure Mobile foundation…</Text>
          </View>
        ) : null}

        {status && auth && workingSet ? (
          <>
            <View style={styles.statusCard}>
              <View>
                <Text style={styles.statusLabel}>MOBILE FOUNDATION</Text>
                <Text style={styles.statusValue}>{stateLabel}</Text>
              </View>
              <Text style={styles.platform}>{Platform.OS.toUpperCase()}</Text>
            </View>

            <View style={styles.grid}>
              <Info label="Device ID" value={status.deviceId} />
              <Info label="Local DB" value={`SQLCipher · schema v${status.schemaVersion}`} />
              <Info label="API" value={status.apiBaseUrl} />
              <Info
                label="Offline authorisation"
                value={
                  auth.offline.valid
                    ? `${auth.offline.daysRemaining ?? 0} days remaining`
                    : auth.offline.reason ?? "Not issued"
                }
              />
              {auth.profile ? <Info label="Organisation" value={auth.profile.organisationId} /> : null}
              {auth.profile ? <Info label="User role" value={auth.profile.role} /> : null}
            </View>

            <View style={styles.workingSetCard}>
              <View style={styles.workingSetHeader}>
                <View style={styles.flexOne}>
                  <Text style={styles.sectionEyebrow}>ENCRYPTED WORKING SET</Text>
                  <Text style={styles.sectionTitle}>Assigned work on this phone</Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countValue}>{workingSet.assignments.length}</Text>
                  <Text style={styles.countLabel}>LOADS</Text>
                </View>
              </View>

              <Text style={styles.workingSetMeta}>
                {workingSet.available
                  ? `Scope: ${workingSet.scope?.resolution ?? "UNKNOWN"} · refreshed ${workingSet.refreshedAt ? new Date(workingSet.refreshedAt).toLocaleString() : "—"}`
                  : "No assignment snapshot has been downloaded yet."}
              </Text>

              {workingSet.scope?.driver ? (
                <Text style={styles.driverLine}>
                  {workingSet.scope.driver.name}
                  {workingSet.scope.driver.email ? ` · ${workingSet.scope.driver.email}` : ""}
                </Text>
              ) : workingSet.available ? (
                <Text style={styles.scopeWarning}>
                  {workingSet.scope?.resolution === "AMBIGUOUS_DRIVER_MATCH"
                    ? "More than one active Driver uses this account email. Waste X returned zero assignments for safety."
                    : "No unique active Driver matches this Waste X account email yet. Waste X returned zero assignments for safety."}
                </Text>
              ) : null}

              {workingSet.assignments.slice(0, 4).map((assignment) => (
                <View key={assignment.load.id} style={styles.assignmentRow}>
                  <View style={styles.flexOne}>
                    <Text style={styles.assignmentTitle}>
                      {assignment.job.jobNumber} · Load {assignment.load.loadNumber}
                    </Text>
                    <Text style={styles.assignmentMeta}>
                      {new Date(assignment.job.jobDate).toLocaleDateString()} · {assignment.job.direction.toUpperCase()} · {assignment.load.status}
                    </Text>
                    <Text style={styles.assignmentRoute} numberOfLines={2}>
                      {assignment.origin?.name ?? "Origin pending"} → {assignment.destination?.name ?? "Destination pending"}
                    </Text>
                  </View>
                  <Text style={styles.ewcText}>{assignment.load.ewcCode ?? "EWC —"}</Text>
                </View>
              ))}

              {workingSet.assignments.length > 4 ? (
                <Text style={styles.moreText}>
                  + {workingSet.assignments.length - 4} more cached assignment{workingSet.assignments.length - 4 === 1 ? "" : "s"}
                </Text>
              ) : null}

              {auth.onlineAuthenticated ? (
                <Pressable
                  disabled={busy}
                  onPress={refreshAssignments}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>
                    {busy ? "Refreshing…" : "Refresh assigned work"}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.authCard}>
              <Text style={styles.sectionTitle}>
                {auth.onlineAuthenticated
                  ? "Waste X session"
                  : auth.offline.valid
                    ? "Offline access"
                    : auth.provisioned
                      ? "Sign in to this device"
                      : "Register this Mobile device"}
              </Text>

              {auth.onlineAuthenticated && auth.profile ? (
                <>
                  <Text style={styles.authSummary}>{auth.profile.email}</Text>
                  <Text style={styles.authMeta}>
                    {auth.profile.displayName} · {auth.profile.role}
                  </Text>
                  <Text style={styles.offlineHint}>
                    Offline authorised until {auth.offline.expiresAt ? new Date(auth.offline.expiresAt).toLocaleString() : "—"}.
                  </Text>
                  <Pressable disabled={busy} onPress={signOut} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>
                      {busy ? "Working…" : "Sign out"}
                    </Text>
                  </Pressable>
                </>
              ) : auth.offline.valid && auth.profile ? (
                <>
                  <Text style={styles.authSummary}>{auth.profile.email}</Text>
                  <Text style={styles.authMeta}>
                    {auth.offlineUnlocked
                      ? "Local operations are unlocked. Cached assigned work remains available without Cloud."
                      : "Cloud session unavailable or expired. Device authorisation and cached work remain available."}
                  </Text>
                  {!auth.offlineUnlocked ? (
                    <Pressable disabled={busy} onPress={unlockOffline} style={styles.primaryButton}>
                      <Text style={styles.primaryButtonText}>
                        {busy ? "Unlocking…" : "Unlock offline operations"}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable disabled={busy} onPress={signOut} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Sign out</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {!auth.provisioned ? (
                    <TextInput
                      autoCapitalize="words"
                      onChangeText={setDisplayName}
                      placeholder="Device name"
                      style={styles.input}
                      value={displayName}
                    />
                  ) : null}
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="Waste X email"
                    style={styles.input}
                    value={email}
                  />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setPassword}
                    placeholder="Password"
                    secureTextEntry
                    style={styles.input}
                    value={password}
                  />
                  <Pressable disabled={busy} onPress={submitAuth} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>
                      {busy ? "Working…" : auth.provisioned ? "Sign in" : "Register & sign in"}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>

            {message ? (
              <View style={styles.successCard}>
                <Text style={styles.successText}>{message}</Text>
              </View>
            ) : null}

            <View style={styles.nextCard}>
              <Text style={styles.sectionTitle}>Next in Step 11</Text>
              <Text style={styles.nextText}>
                Prove this cached assignment set survives an app restart with Cloud completely unavailable, then wire one local load action into the sync outbox.
              </Text>
            </View>
          </>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Waste X Mobile needs attention</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
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
  flexOne: { flex: 1 },
  eyebrow: { color: "#ea580c", fontSize: 11, fontWeight: "800", letterSpacing: 1.8 },
  title: { marginTop: 10, color: "#111827", fontSize: 40, fontWeight: "800", letterSpacing: -1.5, lineHeight: 42 },
  copy: { marginTop: 14, color: "#64748b", fontSize: 15, lineHeight: 23 },
  loadingCard: { marginTop: 28, padding: 22, borderRadius: 18, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 12 },
  muted: { color: "#64748b" },
  statusCard: { marginTop: 28, padding: 20, borderRadius: 20, backgroundColor: "#111827", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLabel: { color: "#9ca3af", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  statusValue: { marginTop: 4, color: "#fff", fontSize: 22, fontWeight: "800" },
  platform: { color: "#fb923c", fontWeight: "800", fontSize: 12 },
  grid: { marginTop: 14, gap: 10 },
  infoCard: { padding: 16, borderRadius: 15, backgroundColor: "#fff" },
  infoLabel: { color: "#94a3b8", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  infoValue: { marginTop: 6, color: "#1e293b", fontSize: 13, fontWeight: "600" },
  workingSetCard: { marginTop: 14, padding: 20, borderRadius: 18, backgroundColor: "#111827" },
  workingSetHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  sectionEyebrow: { color: "#fb923c", fontSize: 9, fontWeight: "800", letterSpacing: 1.3 },
  countBadge: { minWidth: 58, alignItems: "center", borderRadius: 14, backgroundColor: "#1f2937", paddingHorizontal: 10, paddingVertical: 9 },
  countValue: { color: "#fff", fontSize: 20, fontWeight: "800" },
  countLabel: { marginTop: 1, color: "#94a3b8", fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  workingSetMeta: { marginTop: 12, color: "#94a3b8", fontSize: 11, lineHeight: 17 },
  driverLine: { marginTop: 10, color: "#fff", fontSize: 13, fontWeight: "700" },
  scopeWarning: { marginTop: 10, color: "#fdba74", fontSize: 12, lineHeight: 18 },
  assignmentRow: { marginTop: 12, borderTopWidth: 1, borderTopColor: "#334155", paddingTop: 12, flexDirection: "row", gap: 12 },
  assignmentTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  assignmentMeta: { marginTop: 3, color: "#94a3b8", fontSize: 10, textTransform: "uppercase" },
  assignmentRoute: { marginTop: 5, color: "#cbd5e1", fontSize: 12, lineHeight: 17 },
  ewcText: { color: "#fb923c", fontSize: 10, fontWeight: "800" },
  moreText: { marginTop: 12, color: "#94a3b8", fontSize: 11 },
  authCard: { marginTop: 14, padding: 20, borderRadius: 18, backgroundColor: "#fff" },
  sectionTitle: { color: "#111827", fontSize: 18, fontWeight: "800" },
  input: { marginTop: 12, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: "#0f172a", backgroundColor: "#f8fafc", fontSize: 15 },
  primaryButton: { marginTop: 14, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#111827" },
  primaryButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  secondaryButton: { marginTop: 14, borderRadius: 12, paddingVertical: 13, alignItems: "center", borderWidth: 1, borderColor: "#cbd5e1" },
  secondaryButtonText: { color: "#cbd5e1", fontWeight: "800", fontSize: 14 },
  authSummary: { marginTop: 12, color: "#0f172a", fontSize: 16, fontWeight: "700" },
  authMeta: { marginTop: 5, color: "#64748b", fontSize: 13 },
  offlineHint: { marginTop: 10, color: "#166534", fontSize: 13, lineHeight: 19 },
  successCard: { marginTop: 14, padding: 16, borderRadius: 14, backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#bbf7d0" },
  successText: { color: "#166534", lineHeight: 20 },
  errorCard: { marginTop: 14, padding: 20, borderRadius: 18, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },
  errorTitle: { color: "#9f1239", fontWeight: "800", fontSize: 17 },
  errorText: { marginTop: 8, color: "#be123c", lineHeight: 20 },
  nextCard: { marginTop: 14, padding: 20, borderRadius: 18, backgroundColor: "#ffedd5" },
  nextText: { marginTop: 8, color: "#9a3412", fontSize: 14, lineHeight: 21 },
});
