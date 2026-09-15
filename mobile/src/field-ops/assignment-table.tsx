import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { MobileAssignmentV1 } from "@waste-x/contracts";

import {
  formatAssignmentDate,
  humanStatus,
} from "@/field-ops/presentation";
import {
  getMobileFieldWorkflowState,
  humanFieldWorkflowStep,
} from "@/field-ops/workflow";

type AssignmentTableProps = {
  assignments: MobileAssignmentV1[];
  onOpen: (loadId: string) => void;
  carryOver?: (assignment: MobileAssignmentV1) => boolean;
};

const COMPLETED_STATUSES = new Set([
  "completed",
  "delivered",
  "received",
  "disposed",
]);

const REJECTED_STATUSES = new Set(["rejected"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);

function statusLabel(assignment: MobileAssignmentV1) {
  const canonical = assignment.load.status.toLowerCase();

  if (
    COMPLETED_STATUSES.has(canonical) ||
    REJECTED_STATUSES.has(canonical) ||
    CANCELLED_STATUSES.has(canonical)
  ) {
    return humanStatus(assignment.load.status);
  }

  return humanFieldWorkflowStep(
    getMobileFieldWorkflowState(assignment).step,
  );
}

function statusTone(assignment: MobileAssignmentV1) {
  const canonical = assignment.load.status.toLowerCase();

  if (
    REJECTED_STATUSES.has(canonical) ||
    assignment.load.siteRejection
  ) {
    return "danger" as const;
  }

  if (COMPLETED_STATUSES.has(canonical)) {
    return "success" as const;
  }

  if (CANCELLED_STATUSES.has(canonical)) {
    return "muted" as const;
  }

  const workflow =
    getMobileFieldWorkflowState(assignment).step.toLowerCase();

  if (
    workflow.includes("transit") ||
    workflow.includes("arrived") ||
    workflow.includes("collected")
  ) {
    return "active" as const;
  }

  return "default" as const;
}

/* WASTE_X_MOBILE_REFERENCE_PRIORITY_V1 */
export function AssignmentTable({
  assignments,
  onOpen,
  carryOver,
}: AssignmentTableProps) {
  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.refColumn]}>
          REF
        </Text>

        <Text style={[styles.headerCell, styles.routeColumn]}>
          ROUTE
        </Text>

        <Text style={[styles.headerCell, styles.statusColumn]}>
          STATUS
        </Text>
      </View>

      {assignments.map((assignment, index) => {
        const tone = statusTone(assignment);
        const isCarryOver = carryOver?.(assignment) ?? false;

        return (
          <Pressable
            key={assignment.load.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${assignment.job.jobNumber}, load ${assignment.load.loadNumber}`}
            onPress={() => onOpen(assignment.load.id)}
            style={({ pressed }) => [
              styles.row,
              index === assignments.length - 1 && styles.lastRow,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.refColumn}>
              <Text style={styles.jobNumber} numberOfLines={2}>
                {assignment.job.jobNumber}
              </Text>

              <Text style={styles.loadNumber}>
                Load {assignment.load.loadNumber}
              </Text>

              {isCarryOver ? (
                <View style={styles.carryOverBadge}>
                  <Text style={styles.carryOverText}>
                    CARRY-OVER
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.routeColumn}>
              <Text style={styles.routePrimary} numberOfLines={1}>
                {assignment.origin?.name ?? "Origin pending"}
              </Text>

              <View style={styles.routeDestination}>
                <Text style={styles.routeArrow}>→</Text>
                <Text style={styles.routeSecondary} numberOfLines={1}>
                  {assignment.destination?.name ?? "Destination pending"}
                </Text>
              </View>

              <Text style={styles.meta} numberOfLines={1}>
                {formatAssignmentDate(assignment.job.jobDate)}
                {assignment.transport.vehicleRegistration
                  ? ` · ${assignment.transport.vehicleRegistration}`
                  : ""}
              </Text>
            </View>

            <View style={styles.statusColumn}>
              <View
                style={[
                  styles.statusBadge,
                  tone === "success" && styles.statusSuccess,
                  tone === "danger" && styles.statusDanger,
                  tone === "active" && styles.statusActive,
                  tone === "muted" && styles.statusMuted,
                ]}
              >
                <Text
                  numberOfLines={2}
                  style={[
                    styles.statusText,
                    tone === "success" && styles.statusSuccessText,
                    tone === "danger" && styles.statusDangerText,
                    tone === "active" && styles.statusActiveText,
                    tone === "muted" && styles.statusMutedText,
                  ]}
                >
                  {statusLabel(assignment)}
                </Text>
              </View>

              <Text style={styles.openArrow}>›</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#e7e1d8",
    backgroundColor: "#ffffff",
  },

  headerRow: {
    minHeight: 38,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e7e1d8",
  },

  headerCell: {
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  row: {
    minHeight: 82,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f1ede7",
  },

  lastRow: {
    borderBottomWidth: 0,
  },

  rowPressed: {
    backgroundColor: "#fff7ed",
    opacity: 0.82,
  },

  refColumn: {
    flex: 1.65,
    minWidth: 0,
    paddingRight: 8,
  },

  routeColumn: {
    flex: 0.85,
    minWidth: 0,
    paddingRight: 8,
  },

  statusColumn: {
    width: 82,
    alignItems: "flex-end",
  },

  jobNumber: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "900",
  },

  loadNumber: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 9,
    fontWeight: "700",
  },

  carryOverBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#fef3c7",
  },

  carryOverText: {
    color: "#92400e",
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  routePrimary: {
    color: "#1e293b",
    fontSize: 11,
    fontWeight: "800",
  },

  routeDestination: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  routeArrow: {
    color: "#f97316",
    fontSize: 10,
    fontWeight: "900",
  },

  routeSecondary: {
    flex: 1,
    color: "#475569",
    fontSize: 10,
    fontWeight: "700",
  },

  meta: {
    marginTop: 5,
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "700",
  },

  statusBadge: {
    maxWidth: 78,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
  },

  statusText: {
    color: "#1d4ed8",
    fontSize: 7,
    lineHeight: 10,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
  },

  statusSuccess: {
    backgroundColor: "#ecfdf5",
  },

  statusSuccessText: {
    color: "#15803d",
  },

  statusDanger: {
    backgroundColor: "#fef2f2",
  },

  statusDangerText: {
    color: "#b91c1c",
  },

  statusActive: {
    backgroundColor: "#fff7ed",
  },

  statusActiveText: {
    color: "#c2410c",
  },

  statusMuted: {
    backgroundColor: "#f1f5f9",
  },

  statusMutedText: {
    color: "#64748b",
  },

  openArrow: {
    marginTop: 6,
    marginRight: 3,
    color: "#cbd5e1",
    fontSize: 19,
    fontWeight: "500",
  },
});
