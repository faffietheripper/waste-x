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
  getMobileAuthSnapshot,
  loginMobile,
  logoutMobile,
  provisionMobile,
  unlockMobileOffline,
  type MobileAuthSnapshot,
} from "@/auth/mobile-auth";
import { bootMobileFoundation, type MobileFoundationStatus } from "@/foundation/boot";

export default function FoundationScreen() {
  const [status, setStatus] = useState<MobileFoundationStatus | null>(null);
  const [auth, setAuth] = useState<MobileAuthSnapshot | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(`Waste X Mobile · ${Platform.OS === "android" ? "Android" : "iPhone"}`);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshAuth() {
    const snapshot = await getMobileAuthSnapshot();
    setAuth(snapshot);
    if (snapshot.profile?.email) setEmail(snapshot.profile.email);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([bootMobileFoundation(), getMobileAuthSnapshot()])
      .then(([foundation, authSnapshot]) => {
        if (!cancelled) {
          setStatus(foundation);
          setAuth(authSnapshot);
          if (authSnapshot.profile?.email) setEmail(authSnapshot.profile.email);
        }
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { cancelled = true; };
  }, []);

  async function submitAuth() {
    if (!email.trim() || !password) return setError("Enter your Waste X email and password.");
    setBusy(true); setError(null); setMessage(null);
    try {
      if (auth?.provisioned) {
        await loginMobile({ email, password });
        setMessage("Signed in and refreshed 14-day offline authorisation.");
      } else {
        if (!displayName.trim()) throw new Error("Give this Waste X Mobile device a name.");
        await provisionMobile({ email, password, displayName });
        setMessage("Mobile registered, signed in and authorised for offline work.");
      }
      setPassword("");
      await refreshAuth();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function unlockOffline() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const snapshot = await unlockMobileOffline();
      setAuth(snapshot);
      setMessage("Offline operations unlocked on this device.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setError(null); setMessage(null);
    try {
      await logoutMobile();
      await refreshAuth();
      setMessage("Signed out and removed this device's offline authorisation.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
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
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>WASTE X MOBILE · STEP 11</Text>
        <Text style={styles.title}>Field operations, local first.</Text>
        <Text style={styles.copy}>Mobile can now hold a device-bound 14-day offline entitlement. Cloud availability is not required to unlock authorised local operations.</Text>

        {!status || !auth ? <View style={styles.loadingCard}><ActivityIndicator /><Text style={styles.muted}>Initialising secure Mobile foundation…</Text></View> : null}

        {status && auth ? <>
          <View style={styles.statusCard}><View><Text style={styles.statusLabel}>MOBILE FOUNDATION</Text><Text style={styles.statusValue}>{stateLabel}</Text></View><Text style={styles.platform}>{Platform.OS.toUpperCase()}</Text></View>
          <View style={styles.grid}>
            <Info label="Device ID" value={status.deviceId} />
            <Info label="Local DB" value={`SQLCipher · schema v${status.schemaVersion}`} />
            <Info label="API" value={status.apiBaseUrl} />
            <Info label="Offline authorisation" value={auth.offline.valid ? `${auth.offline.daysRemaining ?? 0} days remaining` : auth.offline.reason ?? "Not issued"} />
            {auth.profile ? <Info label="Organisation" value={auth.profile.organisationId} /> : null}
            {auth.profile ? <Info label="User role" value={auth.profile.role} /> : null}
          </View>

          <View style={styles.authCard}>
            <Text style={styles.sectionTitle}>{auth.onlineAuthenticated ? "Waste X session" : auth.offline.valid ? "Offline access" : auth.provisioned ? "Sign in to this device" : "Register this Mobile device"}</Text>
            {auth.onlineAuthenticated && auth.profile ? <>
              <Text style={styles.authSummary}>{auth.profile.email}</Text>
              <Text style={styles.authMeta}>{auth.profile.displayName} · {auth.profile.role}</Text>
              <Text style={styles.offlineHint}>Offline authorised until {auth.offline.expiresAt ? new Date(auth.offline.expiresAt).toLocaleString() : "—"}.</Text>
              <Pressable disabled={busy} onPress={signOut} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{busy ? "Working…" : "Sign out"}</Text></Pressable>
            </> : auth.offline.valid && auth.profile ? <>
              <Text style={styles.authSummary}>{auth.profile.email}</Text>
              <Text style={styles.authMeta}>{auth.offlineUnlocked ? "Local operations are unlocked." : "Cloud session unavailable or expired. Device authorisation is still valid."}</Text>
              {!auth.offlineUnlocked ? <Pressable disabled={busy} onPress={unlockOffline} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{busy ? "Unlocking…" : "Unlock offline operations"}</Text></Pressable> : null}
              <Pressable disabled={busy} onPress={signOut} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Sign out</Text></Pressable>
            </> : <>
              {!auth.provisioned ? <TextInput autoCapitalize="words" onChangeText={setDisplayName} placeholder="Device name" style={styles.input} value={displayName} /> : null}
              <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="Waste X email" style={styles.input} value={email} />
              <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setPassword} placeholder="Password" secureTextEntry style={styles.input} value={password} />
              <Pressable disabled={busy} onPress={submitAuth} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{busy ? "Working…" : auth.provisioned ? "Sign in" : "Register & sign in"}</Text></Pressable>
            </>}
          </View>

          {message ? <View style={styles.successCard}><Text style={styles.successText}>{message}</Text></View> : null}
          <View style={styles.nextCard}><Text style={styles.sectionTitle}>Next in Step 11</Text><Text style={styles.nextText}>Download the user/driver-scoped operational bootstrap so assigned jobs and loads are actually available without Cloud.</Text></View>
        </> : null}

        {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>Waste X Mobile needs attention</Text><Text style={styles.errorText}>{error}</Text></View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoCard}><Text style={styles.infoLabel}>{label}</Text><Text selectable style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f7f3ed" }, container: { padding: 24, paddingBottom: 60 },
  eyebrow: { color: "#ea580c", fontSize: 11, fontWeight: "800", letterSpacing: 1.8 }, title: { marginTop: 10, color: "#111827", fontSize: 40, fontWeight: "800", letterSpacing: -1.5, lineHeight: 42 }, copy: { marginTop: 14, color: "#64748b", fontSize: 15, lineHeight: 23 },
  loadingCard: { marginTop: 28, padding: 22, borderRadius: 18, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 12 }, muted: { color: "#64748b" },
  statusCard: { marginTop: 28, padding: 20, borderRadius: 20, backgroundColor: "#111827", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, statusLabel: { color: "#9ca3af", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 }, statusValue: { marginTop: 4, color: "#fff", fontSize: 22, fontWeight: "800" }, platform: { color: "#fb923c", fontWeight: "800", fontSize: 12 },
  grid: { marginTop: 14, gap: 10 }, infoCard: { padding: 16, borderRadius: 15, backgroundColor: "#fff" }, infoLabel: { color: "#94a3b8", fontSize: 10, fontWeight: "800", letterSpacing: 1 }, infoValue: { marginTop: 6, color: "#1e293b", fontSize: 13, fontWeight: "600" },
  authCard: { marginTop: 14, padding: 20, borderRadius: 18, backgroundColor: "#fff" }, sectionTitle: { color: "#111827", fontSize: 18, fontWeight: "800" }, input: { marginTop: 12, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: "#0f172a", backgroundColor: "#f8fafc", fontSize: 15 },
  primaryButton: { marginTop: 14, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#111827" }, primaryButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 }, secondaryButton: { marginTop: 14, borderRadius: 12, paddingVertical: 13, alignItems: "center", borderWidth: 1, borderColor: "#cbd5e1" }, secondaryButtonText: { color: "#334155", fontWeight: "800", fontSize: 14 },
  authSummary: { marginTop: 12, color: "#0f172a", fontSize: 16, fontWeight: "700" }, authMeta: { marginTop: 5, color: "#64748b", fontSize: 13 }, offlineHint: { marginTop: 10, color: "#166534", fontSize: 13, lineHeight: 19 },
  successCard: { marginTop: 14, padding: 16, borderRadius: 14, backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#bbf7d0" }, successText: { color: "#166534", lineHeight: 20 }, errorCard: { marginTop: 14, padding: 20, borderRadius: 18, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" }, errorTitle: { color: "#9f1239", fontWeight: "800", fontSize: 17 }, errorText: { marginTop: 8, color: "#be123c", lineHeight: 20 }, nextCard: { marginTop: 14, padding: 20, borderRadius: 18, backgroundColor: "#ffedd5" }, nextText: { marginTop: 8, color: "#9a3412", fontSize: 14, lineHeight: 21 },
});
