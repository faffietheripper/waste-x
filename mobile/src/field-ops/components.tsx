import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { MobileAssignmentV1 } from "@waste-x/contracts";

import {
  formatAssignmentDate,
  formatWeight,
  humanStatus,
} from "@/field-ops/presentation";

export function WasteXHeader({
  title,
  subtitle,
  online,
  pending,
}: {
  title: string;
  subtitle?: string;
  online: boolean;
  pending: number;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <View style={styles.brandRow}>
          <Text style={styles.brandWaste}>Waste</Text>
          <Text style={styles.brandX}>X</Text>
        </View>
        <View style={[styles.statusPill, online ? styles.onlinePill : styles.offlinePill]}>
          <View style={[styles.statusDot, online ? styles.onlineDot : styles.offlineDot]} />
          <Text style={styles.statusText}>
            {online ? "Online" : "Offline"}
            {pending > 0 ? ` · ${pending} queued` : ""}
          </Text>
        </View>
      </View>
      <Text style={styles.headerTitle}>{title}</Text>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function AssignmentCard({
  assignment,
  carryOver = false,
}: {
  assignment: MobileAssignmentV1;
  carryOver?: boolean;
}) {
  const weight = formatWeight(assignment);
  const direction = assignment.job.direction === "incoming" ? "COLLECTION" : "DELIVERY";

  return (
    <View style={styles.assignmentCard}>
      <View style={styles.assignmentTopRow}>
        <View style={styles.flexOne}>
          <View style={styles.assignmentLabelRow}>
            <Text style={styles.assignmentDirection}>{direction}</Text>
            {carryOver ? <Text style={styles.carryOverBadge}>CARRY-OVER</Text> : null}
          </View>
          <Text style={styles.assignmentNumber}>
            {assignment.job.jobNumber} · Load {assignment.load.loadNumber}
          </Text>
        </View>
        <Text style={styles.assignmentDate}>
          {formatAssignmentDate(assignment.job.jobDate)}
        </Text>
      </View>

      <View style={styles.routeBlock}>
        <Text style={styles.routePrimary} numberOfLines={1}>
          {assignment.origin?.name ?? "Origin pending"}
        </Text>
        <Text style={styles.routeArrow}>↓</Text>
        <Text style={styles.routePrimary} numberOfLines={1}>
          {assignment.destination?.name ?? "Destination pending"}
        </Text>
      </View>

      <View style={styles.assignmentMetaRow}>
        <Text style={styles.assignmentMeta} numberOfLines={1}>
          {assignment.load.ewcCode ?? "EWC pending"}
          {assignment.load.wasteDescription ? ` · ${assignment.load.wasteDescription}` : ""}
        </Text>
      </View>

      <View style={styles.assignmentFooter}>
        <View>
          <Text style={styles.footerLabel}>STATUS</Text>
          <Text style={styles.footerValue}>{humanStatus(assignment.load.status)}</Text>
        </View>
        <View>
          <Text style={styles.footerLabel}>VEHICLE</Text>
          <Text style={styles.footerValue}>
            {assignment.transport.vehicleRegistration ?? "Not set"}
          </Text>
        </View>
        <View>
          <Text style={styles.footerLabel}>WEIGHT</Text>
          <Text style={styles.footerValue}>{weight ?? "—"}</Text>
        </View>
      </View>
    </View>
  );
}

export function EmptyWorkState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>X</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function SectionHeading({
  title,
  count,
  action,
  onAction,
}: {
  title: string;
  count?: number;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {typeof count === "number" ? (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{count}</Text>
          </View>
        ) : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const fieldOpsStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f3ed",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  sectionGap: {
    marginTop: 24,
  },
  errorCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  errorText: {
    color: "#9f1239",
    fontSize: 13,
    lineHeight: 19,
  },
});

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  header: {
    paddingTop: 12,
    paddingBottom: 18,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  brandWaste: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  brandX: {
    color: "#f97316",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  onlinePill: { backgroundColor: "#ecfdf5" },
  offlinePill: { backgroundColor: "#fff7ed" },
  statusDot: { width: 7, height: 7, borderRadius: 999 },
  onlineDot: { backgroundColor: "#16a34a" },
  offlineDot: { backgroundColor: "#f97316" },
  statusText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "700",
  },
  headerTitle: {
    marginTop: 24,
    color: "#111827",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1.2,
  },
  headerSubtitle: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
  },
  assignmentCard: {
    marginTop: 12,
    padding: 17,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ece7df",
  },
  assignmentTopRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  assignmentLabelRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  assignmentDirection: {
    color: "#ea580c",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  carryOverBadge: {
    color: "#92400e",
    backgroundColor: "#fef3c7",
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  assignmentNumber: {
    marginTop: 5,
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  assignmentDate: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  routeBlock: {
    marginTop: 16,
    padding: 13,
    borderRadius: 13,
    backgroundColor: "#f8fafc",
  },
  routePrimary: {
    color: "#1e293b",
    fontSize: 14,
    fontWeight: "700",
  },
  routeArrow: {
    color: "#f97316",
    fontSize: 13,
    lineHeight: 18,
  },
  assignmentMetaRow: {
    marginTop: 12,
  },
  assignmentMeta: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
  },
  assignmentFooter: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  footerLabel: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  footerValue: {
    marginTop: 4,
    color: "#334155",
    fontSize: 11,
    fontWeight: "700",
  },
  emptyCard: {
    marginTop: 14,
    paddingHorizontal: 24,
    paddingVertical: 32,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ece7df",
    alignItems: "center",
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconText: {
    color: "#f97316",
    fontSize: 24,
    fontWeight: "900",
  },
  emptyTitle: {
    marginTop: 16,
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyBody: {
    marginTop: 7,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  countPill: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: {
    color: "#c2410c",
    fontSize: 11,
    fontWeight: "800",
  },
  sectionAction: {
    color: "#ea580c",
    fontSize: 12,
    fontWeight: "800",
  },
});
