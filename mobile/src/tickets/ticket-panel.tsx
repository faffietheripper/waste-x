import { StyleSheet, Text, View } from "react-native";

import type { MobileAssignmentV1 } from "@waste-x/contracts";

import { getMobileFieldWorkflowState } from "@/field-ops/workflow";
import type { MobileSyncStatus } from "@/sync/mobile-sync";

export function MobileTicketPanel({
  assignment,
  online,
}: {
  assignment: MobileAssignmentV1;
  online: boolean;
  onAssignmentChange: (assignment: MobileAssignmentV1) => void;
  onSyncStatusChange: (status: MobileSyncStatus) => void;
}) {
  const workflow = getMobileFieldWorkflowState(assignment);
  const ticketNumber = assignment.load.ticketNumber?.trim() || null;
  const delivered = workflow.step === "DELIVERED";

  const state = ticketNumber
    ? "TICKET RECEIVED"
    : delivered
      ? "WAITING FOR SITE"
      : "WAITING FOR DELIVERY";

  return (
    <View style={styles.wrapper}>
      <View style={styles.headingRow}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>STEP 13 · DIGITAL TICKET</Text>
          <Text style={styles.title}>Receive the management-site ticket.</Text>
          <Text style={styles.helper}>
            The Driver app records the field journey and evidence. It never creates,
            renumbers or regenerates the management-site ticket. Waste X Desktop/site
            issues the canonical ticket after delivery has been confirmed.
          </Text>
        </View>
        <View style={[styles.badge, ticketNumber && styles.badgeReceived]}>
          <Text style={[styles.badgeText, ticketNumber && styles.badgeTextReceived]}>
            {state}
          </Text>
        </View>
      </View>

      {ticketNumber ? (
        <View style={styles.ticketCard}>
          <Text style={styles.ticketLabel}>WASTE X SITE TICKET</Text>
          <Text selectable style={styles.ticketNumber}>{ticketNumber}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Authority</Text>
            <Text style={styles.goodValue}>Management / site</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Mobile role</Text>
            <Text style={styles.metaValue}>Read-only digital copy</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Local availability</Text>
            <Text style={styles.goodValue}>Cached with this load</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Connectivity</Text>
            <Text style={styles.metaValue}>{online ? "Cloud connected" : "Offline copy"}</Text>
          </View>
          <Text style={styles.note}>
            The immutable site-generated PDF will appear here when the document/evidence
            sync slice is connected. Mobile will only cache/view that original document.
          </Text>
        </View>
      ) : delivered ? (
        <View style={styles.waitingCard}>
          <Text style={styles.waitingTitle}>Delivery confirmed. Waiting for the site ticket.</Text>
          <Text style={styles.waitingBody}>
            Your delivery confirmation is the gate that allows the management/site
            workflow to issue the canonical ticket. Keep this load synced or relay it
            through Waste X Bridge; the Driver cannot issue the ticket from this screen.
          </Text>
        </View>
      ) : (
        <View style={styles.waitingCard}>
          <Text style={styles.waitingTitle}>Ticket issue is not available to the Driver.</Text>
          <Text style={styles.waitingBody}>
            Complete the field journey normally. After you confirm delivery, the
            management/site workflow can verify the load, finalise the weights and issue
            the Waste X ticket. The same ticket will then return to this phone.
          </Text>
        </View>
      )}

      <View style={styles.ruleCard}>
        <Text style={styles.ruleTitle}>AUTHORITY BOUNDARY</Text>
        <Text style={styles.ruleBody}>
          Mobile: journey + signatures + photos + delivery confirmation. Desktop/site:
          ticket number + canonical PDF + printing/reprinting. External weighbridge
          tickets are captured as third-party evidence, not issued by the Driver.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 12 },
  flexOne: { flex: 1 },
  headingRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  eyebrow: { color: "#c2410c", fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  title: { marginTop: 5, color: "#111827", fontSize: 17, fontWeight: "900" },
  helper: { marginTop: 5, color: "#64748b", fontSize: 11, lineHeight: 17 },
  badge: {
    maxWidth: 118,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  badgeReceived: { backgroundColor: "#dcfce7" },
  badgeText: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  badgeTextReceived: { color: "#15803d" },
  ticketCard: { padding: 15, borderRadius: 15, backgroundColor: "#111827" },
  ticketLabel: { color: "#94a3b8", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  ticketNumber: { marginTop: 7, color: "#ffffff", fontSize: 16, lineHeight: 22, fontWeight: "900" },
  metaRow: { marginTop: 10, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  metaLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "700" },
  metaValue: { flex: 1, color: "#cbd5e1", textAlign: "right", fontSize: 9, fontWeight: "700" },
  goodValue: { flex: 1, color: "#86efac", textAlign: "right", fontSize: 9, fontWeight: "800" },
  note: { marginTop: 13, color: "#94a3b8", fontSize: 9, lineHeight: 14, fontWeight: "600" },
  waitingCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  waitingTitle: { color: "#9a3412", fontSize: 12, fontWeight: "900" },
  waitingBody: { marginTop: 5, color: "#9a3412", fontSize: 10, lineHeight: 16 },
  ruleCard: { padding: 12, borderRadius: 12, backgroundColor: "#f8fafc" },
  ruleTitle: { color: "#475569", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  ruleBody: { marginTop: 5, color: "#64748b", fontSize: 9, lineHeight: 15, fontWeight: "600" },
});
