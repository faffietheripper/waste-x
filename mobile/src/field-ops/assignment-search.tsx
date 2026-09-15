import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { MobileAssignmentV1 } from "@waste-x/contracts";

import { AssignmentTable } from "@/field-ops/assignment-table";
import { getMobileFieldWorkflowState } from "@/field-ops/workflow";

/* WASTE_X_MOBILE_GLOBAL_ASSIGNMENT_SEARCH_V1 */

type AssignmentSearchProps = {
  assignments: MobileAssignmentV1[];
  onOpen: (loadId: string) => void;
};

function searchableStatus(assignment: MobileAssignmentV1) {
  const workflow = getMobileFieldWorkflowState(assignment).step;
  return [
    assignment.job.status,
    assignment.load.status,
    workflow,
    assignment.load.siteRejection ? "rejected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function searchableText(assignment: MobileAssignmentV1) {
  return [
    assignment.job.jobNumber,
    `load ${assignment.load.loadNumber}`,
    searchableStatus(assignment),
    assignment.origin?.name,
    assignment.destination?.name,
    assignment.transport.vehicleRegistration,
    assignment.load.ewcCode,
    assignment.load.wasteDescription,
    ...(assignment.load.wasteItems ?? []).flatMap((item) => [
      item.ewcCode,
      item.wasteDescription,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function AssignmentSearch({
  assignments,
  onOpen,
}: AssignmentSearchProps) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!needle) return [];

    return assignments.filter((assignment) =>
      searchableText(assignment).includes(needle),
    );
  }, [assignments, needle]);

  return (
    <View style={styles.wrap}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>
          Search
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search any Job, reference, status, route..."
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={styles.input}
          accessibilityLabel="Search all authorised Waste X jobs"
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear job search"
            onPress={() => setQuery("")}
            style={({ pressed }) => [
              styles.clearButton,
              pressed && styles.clearPressed,
            ]}
          >
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {needle ? (
        <View style={styles.results}>
          <View style={styles.resultHeading}>
            <Text style={styles.resultTitle}>
              {results.length} {results.length === 1 ? "match" : "matches"}
            </Text>
            <Text style={styles.resultMeta}>
              All authorised cached work
            </Text>
          </View>

          {results.length ? (
            <AssignmentTable assignments={results} onOpen={onOpen} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No Job matched that search.</Text>
              <Text style={styles.emptyCopy}>
                Try the full reference, status, site, vehicle, EWC or waste.
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 18,
  },
  searchBar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },
  searchIcon: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  clearPressed: {
    opacity: 0.7,
  },
  clearText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
  },
  results: {
    marginTop: 10,
  },
  resultHeading: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  resultTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  resultMeta: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  empty: {
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  emptyCopy: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
});
