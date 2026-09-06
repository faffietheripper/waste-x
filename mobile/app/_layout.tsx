import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { bootMobileFoundation } from "@/foundation/boot";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void bootMobileFoundation()
      .then(() => {
        if (!cancelled) setReady(true);
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

  if (error) {
    return (
      <View style={styles.screen}>
        <StatusBar style="auto" />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>LOCAL DATABASE</Text>
          <Text style={styles.title}>Waste X could not open its encrypted workspace.</Text>
          <Text selectable style={styles.error}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.screen}>
        <StatusBar style="auto" />
        <ActivityIndicator />
        <Text style={styles.loading}>Opening encrypted Waste X workspace…</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: "#f7f3ed",
  },
  loading: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#fecdd3",
    backgroundColor: "#fff1f2",
  },
  eyebrow: {
    color: "#be123c",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    marginTop: 7,
    color: "#111827",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
  },
  error: {
    marginTop: 10,
    color: "#9f1239",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
  },
});
