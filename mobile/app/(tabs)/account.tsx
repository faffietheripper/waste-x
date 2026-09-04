import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { loginMobile, logoutMobile } from "@/auth/mobile-auth";
import { MobileCertificationPanel } from "@/field-ops/certification-panel";
import {
  WasteXHeader,
  fieldOpsStyles,
} from "@/field-ops/components";
import { useFieldOps } from "@/field-ops/context";
import { getMobileSyncStatus } from "@/sync/mobile-sync";

export default function AccountScreen() {
  const router = useRouter();
  const {
    auth,
    workingSet,
    syncStatus,
    refreshing,
    error,
    refresh,
  } = useFieldOps();
  const [busy, setBusy] = useState(false);
  const [reconnectBusy, setReconnectBusy] = useState(false);
  const [reconnectPassword, setReconnectPassword] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  async function reconnectCloud() {
    const email = auth?.profile?.email?.trim();
    if (!email) {
      setActionError("Waste X could not resolve the email for this registered Mobile user.");
      return;
    }
    if (!reconnectPassword) {
      setActionError("Enter your Waste X password to reconnect this phone to Cloud.");
      return;
    }

    setReconnectBusy(true);
    setActionError(null);
    try {
      await loginMobile({
        email,
        password: reconnectPassword,
      });
      setReconnectPassword("");
      await refresh();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setReconnectBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setActionError(null);
    try {
      const current = await getMobileSyncStatus();
      if (current.pending > 0 || current.sending > 0) {
        throw new Error(
          "Waste X has unsynced field events on this phone. Let them sync before signing out so operational work is not stranded locally.",
        );
      }
      await logoutMobile();
      router.replace("/");
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={fieldOpsStyles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={fieldOpsStyles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        }
      >
        <WasteXHeader
          title="Account"
          subtitle="Device, driver and offline status"
          online={Boolean(auth?.onlineAuthenticated)}
          pending={syncStatus?.pending ?? 0}
        />

        {error || actionError ? (
          <View style={fieldOpsStyles.errorCard}>
            <Text style={fieldOpsStyles.errorText}>{actionError ?? error}</Text>
          </View>
        ) : null}

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(workingSet?.scope?.driver?.name || auth?.profile?.email || "W")
                .slice(0, 1)
                .toUpperCase()}
            </Text>
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.profileName}>
              {workingSet?.scope?.driver?.name ?? "Waste X user"}
            </Text>
            <Text style={styles.profileEmail}>{auth?.profile?.email ?? "—"}</Text>
            <Text style={styles.profileRole}>{auth?.profile?.role ?? "Field user"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Field identity</Text>
          <InfoRow
            label="Driver link"
            value={workingSet?.scope?.resolution ?? "Not resolved"}
          />
          <InfoRow
            label="Driver email"
            value={workingSet?.scope?.driver?.email ?? "Not linked"}
          />
          <InfoRow
            label="Default vehicle"
            value={workingSet?.scope?.driver?.defaultVehicleId ?? "Not set"}
          />
          <InfoRow
            label="Cached loads"
            value={String(workingSet?.assignments.length ?? 0)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Offline readiness</Text>
          <InfoRow
            label="Cloud"
            value={auth?.onlineAuthenticated ? "Connected" : "Unavailable"}
            emphasis={auth?.onlineAuthenticated ? "good" : "warning"}
          />
          <InfoRow
            label="Offline authorisation"
            value={
              auth?.offline.valid
                ? `${auth.offline.daysRemaining ?? 0} days remaining`
                : auth?.offline.reason ?? "Unavailable"
            }
          />
          <InfoRow
            label="Queued events"
            value={String(syncStatus?.pending ?? 0)}
            emphasis={(syncStatus?.pending ?? 0) > 0 ? "warning" : "good"}
          />
          <InfoRow
            label="Relayed to Bridge"
            value={String(syncStatus?.relayed ?? 0)}
          />
          <InfoRow
            label="Conflicts"
            value={String(syncStatus?.conflicts ?? 0)}
            emphasis={(syncStatus?.conflicts ?? 0) > 0 ? "warning" : undefined}
          />
        </View>

        {auth?.provisioned && !auth.onlineAuthenticated ? (
          <View style={styles.reconnectCard}>
            <Text style={styles.reconnectEyebrow}>CLOUD SESSION</Text>
            <Text style={styles.reconnectTitle}>Reconnect to Waste X Cloud</Text>
            <Text style={styles.reconnectCopy}>
              Offline work stays available on this phone. Enter your normal Waste X password to renew the Cloud session and refresh assigned jobs.
            </Text>
            <Text style={styles.reconnectEmail}>{auth.profile?.email ?? "—"}</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!reconnectBusy}
              onChangeText={setReconnectPassword}
              onSubmitEditing={() => void reconnectCloud()}
              placeholder="Waste X password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={styles.reconnectInput}
              value={reconnectPassword}
            />
            <Pressable
              disabled={reconnectBusy}
              onPress={() => void reconnectCloud()}
              style={styles.reconnectButton}
            >
              <Text style={styles.reconnectButtonText}>
                {reconnectBusy ? "Reconnecting…" : "Reconnect Cloud"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {__DEV__ ? (
          <MobileCertificationPanel online={Boolean(auth?.onlineAuthenticated)} />
        ) : null}

        <Pressable disabled={busy || reconnectBusy} onPress={() => void refresh()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>
            {refreshing ? "Refreshing…" : "Refresh field workspace"}
          </Text>
        </Pressable>

        <Pressable disabled={busy || reconnectBusy} onPress={signOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>{busy ? "Signing out…" : "Sign out"}</Text>
        </Pressable>

        <Text style={styles.securityNote}>
          Signing out removes this device's offline authorisation and cached assignments. Waste X blocks sign-out while operational events are still unsynced.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "good" | "warning";
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          emphasis === "good" && styles.infoGood,
          emphasis === "warning" && styles.infoWarning,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  profileCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },
  profileName: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
  },
  profileEmail: {
    marginTop: 4,
    color: "#cbd5e1",
    fontSize: 12,
  },
  profileRole: {
    marginTop: 3,
    color: "#fb923c",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  section: {
    marginTop: 18,
    padding: 17,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ece7df",
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  infoRow: {
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  infoLabel: {
    flex: 1,
    color: "#64748b",
    fontSize: 12,
  },
  infoValue: {
    maxWidth: "55%",
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
  infoGood: { color: "#15803d" },
  infoWarning: { color: "#c2410c" },
  reconnectCard: {
    marginTop: 18,
    padding: 17,
    borderRadius: 18,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  reconnectEyebrow: {
    color: "#ea580c",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  reconnectTitle: {
    marginTop: 7,
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
  },
  reconnectCopy: {
    marginTop: 7,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
  },
  reconnectEmail: {
    marginTop: 12,
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
  },
  reconnectInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#fdba74",
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#ffffff",
    color: "#111827",
    fontSize: 14,
  },
  reconnectButton: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  reconnectButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryButton: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7d0c7",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  signOutButton: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  securityNote: {
    marginTop: 12,
    marginBottom: 8,
    color: "#94a3b8",
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
  },
});
