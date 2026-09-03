import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { refreshMobileAssignmentWorkingSet } from "@/assignments/local-working-set";
import {
  getMobileAuthSnapshot,
  loginMobile,
  provisionMobile,
  unlockMobileOffline,
  type MobileAuthSnapshot,
} from "@/auth/mobile-auth";

export default function MobileEntryScreen() {
  const router = useRouter();
  const [auth, setAuth] = useState<MobileAuthSnapshot | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(
    `Waste X Mobile · ${Platform.OS === "android" ? "Android" : "iPhone"}`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMobileAuthSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        setAuth(snapshot);
        if (snapshot.profile?.email) setEmail(snapshot.profile.email);
        if (snapshot.authenticated) router.replace("/(tabs)");
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submitOnlineAuth() {
    if (!email.trim() || !password) {
      setError("Enter your Waste X email and password.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (auth?.provisioned) {
        await loginMobile({ email, password });
      } else {
        if (!displayName.trim()) throw new Error("Give this phone a device name.");
        await provisionMobile({ email, password, displayName });
      }

      await refreshMobileAssignmentWorkingSet().catch(() => null);
      const snapshot = await getMobileAuthSnapshot();
      setAuth(snapshot);
      setPassword("");
      if (snapshot.authenticated) router.replace("/(tabs)");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function unlockOffline() {
    setBusy(true);
    setError(null);
    try {
      const snapshot = await unlockMobileOffline();
      setAuth(snapshot);
      if (snapshot.authenticated) router.replace("/(tabs)");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!auth) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>X</Text></View>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Opening Waste X…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.brandRow}>
          <Text style={styles.brandWaste}>Waste</Text>
          <Text style={styles.brandX}>X</Text>
        </View>

        {auth.offline.valid && !auth.onlineAuthenticated ? (
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>OFFLINE ACCESS</Text>
            <Text style={styles.title}>Your field work is still available.</Text>
            <Text style={styles.copy}>
              Waste X Cloud is unavailable, but this phone has a valid device-bound offline authorisation and encrypted working set.
            </Text>
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>
                {auth.offline.daysRemaining ?? 0} day{auth.offline.daysRemaining === 1 ? "" : "s"} offline access remaining
              </Text>
            </View>
            <Pressable disabled={busy} onPress={unlockOffline} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {busy ? "Unlocking…" : "Unlock offline operations"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>WASTE X MOBILE</Text>
            <Text style={styles.title}>
              {auth.provisioned ? "Sign in to your field workspace." : "Register this field device."}
            </Text>
            <Text style={styles.copy}>
              Assigned work is cached securely on this phone so operations can continue when connectivity disappears.
            </Text>

            {!auth.provisioned ? (
              <TextInput
                autoCapitalize="words"
                onChangeText={setDisplayName}
                placeholder="Device name"
                placeholderTextColor="#94a3b8"
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
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={email}
            />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={styles.input}
              value={password}
            />

            <Pressable disabled={busy} onPress={submitOnlineAuth} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {busy ? "Working…" : auth.provisioned ? "Sign in" : "Register & sign in"}
              </Text>
            </Pressable>
          </View>
        )}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.footerText}>
          Local-first field operations · encrypted on device
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f7f3ed" },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  brandMark: { width: 52, height: 52, borderRadius: 16, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#f97316", fontSize: 29, fontWeight: "900" },
  loadingText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  brandRow: { flexDirection: "row", alignItems: "baseline" },
  brandWaste: { color: "#111827", fontSize: 25, fontWeight: "800", letterSpacing: -0.9 },
  brandX: { color: "#f97316", fontSize: 27, fontWeight: "900", letterSpacing: -0.9 },
  hero: { marginTop: "auto", marginBottom: "auto" },
  eyebrow: { color: "#ea580c", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { marginTop: 12, color: "#111827", fontSize: 36, lineHeight: 40, fontWeight: "800", letterSpacing: -1.3 },
  copy: { marginTop: 13, color: "#64748b", fontSize: 14, lineHeight: 22 },
  input: { marginTop: 12, borderWidth: 1, borderColor: "#ddd6ce", borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, backgroundColor: "#ffffff", color: "#111827", fontSize: 15 },
  primaryButton: { marginTop: 16, minHeight: 50, borderRadius: 14, backgroundColor: "#111827", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  primaryButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  offlineBadge: { alignSelf: "flex-start", marginTop: 18, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#ffedd5" },
  offlineBadgeText: { color: "#c2410c", fontSize: 11, fontWeight: "800" },
  errorCard: { marginBottom: 16, padding: 14, borderRadius: 14, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },
  errorText: { color: "#9f1239", fontSize: 13, lineHeight: 19 },
  footerText: { textAlign: "center", color: "#94a3b8", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});
