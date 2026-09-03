import { useEffect } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Tabs, useRouter } from "expo-router";

import {
  FieldOpsProvider,
  useFieldOps,
} from "@/field-ops/context";

function TabGlyph({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={[styles.glyph, active && styles.glyphActive]}>
      <Text style={[styles.glyphText, active && styles.glyphTextActive]}>{label}</Text>
    </View>
  );
}

function ProtectedTabs() {
  const router = useRouter();
  const { auth, loading } = useFieldOps();

  useEffect(() => {
    if (!loading && auth && !auth.authenticated) router.replace("/");
  }, [auth, loading, router]);

  if (loading || !auth) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading field workspace…</Text>
      </View>
    );
  }

  if (!auth.authenticated) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#111827",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "My Day",
          tabBarIcon: ({ focused }) => <TabGlyph label="D" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",
          tabBarIcon: ({ focused }) => <TabGlyph label="J" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ focused }) => <TabGlyph label="A" active={focused} />,
        }}
      />
    </Tabs>
  );
}

export default function FieldOpsTabsLayout() {
  return (
    <FieldOpsProvider>
      <ProtectedTabs />
    </FieldOpsProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: "#f7f3ed",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
  },
  tabBar: {
    height: 78,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "#ece7df",
    backgroundColor: "#ffffff",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  glyph: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  glyphActive: {
    backgroundColor: "#111827",
  },
  glyphText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900",
  },
  glyphTextActive: {
    color: "#f97316",
  },
});
