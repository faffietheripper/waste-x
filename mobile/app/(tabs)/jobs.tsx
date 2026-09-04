import { useMemo, useState } from "react";
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
  WasteXHeader,
  fieldOpsStyles,
} from "@/field-ops/components";
import { useFieldOps } from "@/field-ops/context";
import { bucketMobileAssignments } from "@/field-ops/presentation";

type Filter = "assigned" | "upcoming" | "completed" | "cancelled";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "assigned", label: "Assigned" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function JobsScreen() {
  const router = useRouter();
  const {
    auth,
    workingSet,
    syncStatus,
    refreshing,
    error,
    refresh,
  } = useFieldOps();
  const [filter, setFilter] = useState<Filter>("assigned");

  const buckets = useMemo(
    () => bucketMobileAssignments(workingSet?.assignments ?? []),
    [workingSet?.assignments],
  );

  const assigned = [...buckets.today, ...buckets.upcoming];
  const visible =
    filter === "assigned"
      ? assigned
      : filter === "upcoming"
        ? buckets.upcoming
        : filter === "completed"
          ? buckets.completed
          : buckets.cancelled;

  const countFor = (key: Filter) =>
    key === "assigned"
      ? assigned.length
      : key === "upcoming"
        ? buckets.upcoming.length
        : key === "completed"
          ? buckets.completed.length
          : buckets.cancelled.length;

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
          title="Jobs"
          subtitle="Your authorised field assignments"
          online={Boolean(auth?.onlineAuthenticated)}
          pending={syncStatus?.pending ?? 0}
        />

        {error ? (
          <View style={fieldOpsStyles.errorCard}>
            <Text style={fieldOpsStyles.errorText}>{error}</Text>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((item) => {
            const active = item.key === filter;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                  {item.label}
                </Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>
                    {countFor(item.key)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.listBlock}>
          {visible.length > 0 ? (
            visible.map((assignment) => (
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
            <EmptyWorkState
              title={`No ${FILTERS.find((item) => item.key === filter)?.label.toLowerCase()} jobs`}
              body={
                workingSet?.scope?.resolution === "MATCHED"
                  ? "This view is fed from the encrypted assignment snapshot on your phone and refreshes when Waste X Cloud is available."
                  : "This account is not yet uniquely linked to an active Driver, so Waste X is intentionally returning zero field assignments."
              }
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  assignmentPressed: { opacity: 0.72 },
  filters: {
    gap: 8,
    paddingBottom: 4,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 13,
    paddingRight: 9,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e1d8",
  },
  filterPillActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  filterLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
  },
  filterLabelActive: {
    color: "#ffffff",
  },
  filterCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountActive: {
    backgroundColor: "#f97316",
  },
  filterCountText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
  },
  filterCountTextActive: {
    color: "#ffffff",
  },
  listBlock: {
    marginTop: 14,
  },
});
