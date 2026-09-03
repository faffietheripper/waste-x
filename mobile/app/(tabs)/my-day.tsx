import { useMemo } from "react";
import { useRouter } from "expo-router";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AssignmentCard,
  EmptyWorkState,
  SectionHeading,
  WasteXHeader,
  fieldOpsStyles,
} from "@/field-ops/components";
import { useFieldOps } from "@/field-ops/context";
import {
  assignmentDateKey,
  bucketMobileAssignments,
  formatLongDate,
  greetingForNow,
} from "@/field-ops/presentation";

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function MyDayScreen() {
  const router = useRouter();
  const {
    auth,
    workingSet,
    syncStatus,
    refreshing,
    error,
    refresh,
  } = useFieldOps();

  const buckets = useMemo(
    () => bucketMobileAssignments(workingSet?.assignments ?? []),
    [workingSet?.assignments],
  );

  const personName =
    workingSet?.scope?.driver?.name ||
    auth?.profile?.email?.split("@")[0] ||
    "there";
  const pending = syncStatus?.pending ?? 0;
  const nextUp = buckets.upcoming.slice(0, 2);

  const openAssignment = (loadId: string) => {
    router.push({ pathname: "/job/[loadId]", params: { loadId } });
  };

  return (
    <SafeAreaView style={fieldOpsStyles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={fieldOpsStyles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        }
      >
        <WasteXHeader
          title={`${greetingForNow()}, ${personName}`}
          subtitle={formatLongDate()}
          online={Boolean(auth?.onlineAuthenticated)}
          pending={pending}
        />

        {error ? (
          <View style={fieldOpsStyles.errorCard}>
            <Text style={fieldOpsStyles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.summaryRow}>
          <SummaryCard label="TODAY" value={buckets.today.length} />
          <SummaryCard label="UPCOMING" value={buckets.upcoming.length} />
          <SummaryCard label="QUEUED" value={pending} accent={pending > 0} />
        </View>

        <View style={fieldOpsStyles.sectionGap}>
          <SectionHeading title="My Day" count={buckets.today.length} />
          {buckets.today.length > 0 ? (
            buckets.today.map((assignment) => (
              <Pressable
                key={assignment.load.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${assignment.job.jobNumber}, load ${assignment.load.loadNumber}`}
                onPress={() => openAssignment(assignment.load.id)}
                style={({ pressed }) => pressed && styles.assignmentPressed}
              >
                <AssignmentCard
                  assignment={assignment}
                  carryOver={assignmentDateKey(assignment.job.jobDate) < todayKey()}
                />
              </Pressable>
            ))
          ) : (
            <EmptyWorkState
              title="No field work assigned for today"
              body={
                workingSet?.scope?.resolution === "MATCHED"
                  ? "New assignments will appear here automatically when Waste X refreshes. Your existing cached work remains available offline."
                  : "This Waste X account is not yet uniquely linked to an active Driver. Once a Driver is linked and assigned a load, it will appear here."
              }
            />
          )}
        </View>

        <View style={fieldOpsStyles.sectionGap}>
          <SectionHeading title="Next up" count={buckets.upcoming.length} />
          {nextUp.length > 0 ? (
            nextUp.map((assignment) => (
              <Pressable
                key={assignment.load.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${assignment.job.jobNumber}, load ${assignment.load.loadNumber}`}
                onPress={() => openAssignment(assignment.load.id)}
                style={({ pressed }) => pressed && styles.assignmentPressed}
              >
                <AssignmentCard assignment={assignment} />
              </Pressable>
            ))
          ) : (
            <View style={styles.quietCard}>
              <Text style={styles.quietTitle}>Nothing else scheduled yet.</Text>
              <Text style={styles.quietBody}>
                Waste X keeps the next 14 days of authorised field work available on this phone.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.offlineBanner}>
          <View style={styles.offlineDot} />
          <View style={styles.flexOne}>
            <Text style={styles.offlineTitle}>Local-first field workspace</Text>
            <Text style={styles.offlineBody}>
              {auth?.onlineAuthenticated
                ? "Cloud is connected. New assignments and queued field events reconcile automatically."
                : `Working from encrypted local data${auth?.offline.daysRemaining ? ` · ${auth.offline.daysRemaining} days offline authorisation remaining` : ""}.`}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, accent && styles.summaryCardAccent]}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  assignmentPressed: { opacity: 0.72 },
  summaryRow: {
    flexDirection: "row",
    gap: 9,
  },
  summaryCard: {
    flex: 1,
    minHeight: 84,
    borderRadius: 17,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ece7df",
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: "center",
  },
  summaryCardAccent: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  summaryValue: {
    color: "#111827",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  summaryLabel: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  quietCard: {
    marginTop: 12,
    padding: 18,
    borderRadius: 17,
    backgroundColor: "#f1ede7",
  },
  quietTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
  },
  quietBody: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
  },
  offlineBanner: {
    marginTop: 28,
    marginBottom: 6,
    padding: 16,
    borderRadius: 17,
    backgroundColor: "#111827",
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  offlineDot: {
    marginTop: 4,
    width: 9,
    height: 9,
    borderRadius: 99,
    backgroundColor: "#f97316",
  },
  offlineTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  offlineBody: {
    marginTop: 5,
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 17,
  },
});
