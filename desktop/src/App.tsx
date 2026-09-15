import { invoke } from "@tauri-apps/api/core";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { RejectLoadModal, type SiteRejectionCategory } from "./RejectLoadModal";
import { TicketPanel } from "./TicketPanel";
import { CreateJobPanel, type DesktopCreatedJob } from "./CreateJobPanel";
import { ManageTransportPanel } from "./ManageTransportPanel";
import { SupportPanel } from "./SupportPanel";
import { RecordsPanel } from "./RecordsPanel";
import {
  QuickAddTransportModal,
  type QuickTransportKind,
} from "./QuickAddTransportModal";

type LocalDbStatus = { ready: boolean; encrypted: boolean; schemaVersion: number; cipherVersion: string; tableCount: number };
type ProvisioningStatus = {
  provisioned: boolean;
  deviceId: string | null;
  organisationId: string | null;
  defaultSiteId: string | null;
  defaultSiteName: string | null;
  displayName: string | null;
};
type ProvisionOptions = {
  organisation: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    email: string;
    role: string;
  };
  sites: Array<{
    id: string;
    name: string;
    fullAddress: string | null;
    postcode: string | null;
    isDefault: boolean;
  }>;
  recommendedSiteId: string | null;
};

type AuthStatus = { unlocked: boolean; canOffline: boolean; email: string | null; mode: "ONLINE" | "OFFLINE" | null; offlineExpiresAt: string | null; offlineDaysRemaining: number };
type OperationalSummary = { jobs: number; jobLoads: number; pendingSyncEvents: number; conflicts: number };
type OpsReference = { id: string; label: string; haulierCounterpartyId: string | null };
type WeightMetric = "Grams" | "Kilograms" | "Tonnes";
type TareSource = "LOAD" | "VEHICLE_MASTER" | "MANUAL" | null;
type VehicleTareResult = { vehicleId: string; tareWeightKg: number | null };
type LoadView = "live" | "rejected" | "completed" | "cancelled";
type ManualArrivalReason =
  | "DRIVER_NO_MOBILE_ACCESS"
  | "DRIVER_DEVICE_UNAVAILABLE"
  | "CONNECTIVITY_ISSUE"
  | "SITE_CONFIRMED_PHYSICAL_ARRIVAL"
  | "OTHER";
type DesktopView = "operations" | "create" | "cloud" | "manage" | "settings" | "support";

type DailyWasteItem = {
  id: string;
  itemNumber: number;
  ewcCodeId: string | null;
  ewcCode: string;
  wasteDescription: string;
  weightAmount: string | null;
  weightMetric: string;
  weightIsEstimate: boolean;
  permitEwcMatchType: string | null;
  permitEwcCode: string | null;
  permitEwcBasis: string | null;
  permitEwcReference: string | null;
};

type DailyLoad = {
  id: string;
  jobId: string;
  jobNumber: string;
  jobDate: string | null;
  loadNumber: number | null;
  direction: "incoming" | "outgoing";
  status: string;
  haulierCounterpartyId: string | null;
  driverId: string | null;
  vehicleId: string | null;
  wasteDescription: string;
  ewcCode: string | null;
  wasteItems: DailyWasteItem[];
  grossWeight: string | null;
  tareWeight: string | null;
  netWeight: string | null;
  weightMetric: string;
  ticketNumber: string | null;
  notes: string | null;
  entityVersion: number;
  pendingEvents: number;
  completionSyncState:
    | "not_applicable"
    | "pending"
    | "review_required"
    | "cloud_confirmed";
  ticketSyncState:
    | "not_issued"
    | "waiting_for_completion"
    | "pending"
    | "review_required"
    | "cloud_confirmed";
  searchText: string;
};

/* WASTE_X_DESKTOP_CANONICAL_SYNC_STATE_UI_V1 */
function desktopLoadStatusLabel(load: DailyLoad) {
  if (
    load.status === "completed" &&
    load.completionSyncState === "review_required"
  ) {
    return "completion review";
  }
  if (
    load.status === "completed" &&
    load.completionSyncState !== "cloud_confirmed"
  ) {
    return "completed locally";
  }
  return load.status;
}

function desktopLoadSyncSummary(load: DailyLoad) {
  if (load.status === "completed") {
    if (load.completionSyncState === "review_required") {
      return load.ticketNumber
        ? "Completed locally · completion needs sync review · ticket held locally"
        : "Completed locally · completion needs sync review";
    }

    if (load.completionSyncState === "pending") {
      return load.ticketNumber
        ? "Completed locally · Cloud confirmation pending · ticket waiting behind completion"
        : "Completed locally · Cloud confirmation pending";
    }

    if (load.ticketNumber) {
      const ticketState =
        load.ticketSyncState === "not_issued"
          ? "cloud_confirmed"
          : load.ticketSyncState;

      if (ticketState === "waiting_for_completion") {
        return "Completed locally · ticket waiting for completion sync";
      }
      if (ticketState === "review_required") {
        return "Cloud completion confirmed · ticket sync needs review";
      }
      if (ticketState === "pending") {
        return "Cloud completion confirmed · ticket awaiting Cloud confirmation";
      }
      return "Cloud confirmed · ticket synced";
    }

    return "Cloud confirmed";
  }

  return load.pendingEvents > 0
    ? `${load.pendingEvents} local ${
        load.pendingEvents === 1 ? "change" : "changes"
      } waiting to sync`
    : "Local record up to date";
}

type DailyOperationsSnapshot = { loads: DailyLoad[]; drivers: OpsReference[]; vehicles: OpsReference[]; pendingEvents: number; conflicts: number };
type DesktopSyncStatus = { running: boolean; cloudReachable: boolean; authRequired: boolean; lastAttemptAt: string | null; lastSuccessAt: string | null; lastError: string | null; cursor: string | null; pending: number; retryableFailed: number; permanentFailed: number; conflicts: number; deferredRemoteChanges: number };
type DesktopSyncRunResult = { status: DesktopSyncStatus; pushedApplied: number; pushedDuplicates: number; pushedConflicts: number; pushedFailed: number; pulledChanges: number; deferredRemoteChanges: number };
type UnlockResult = { ok: boolean; mode: "ONLINE" | "OFFLINE" };
type CloudContext = {
  baseUrl: string;
  environment: string;
  organisationId: string | null;
  organisationName: string | null;
  deviceId: string | null;
  defaultSiteId: string | null;
  defaultSiteName: string | null;
  displayName: string | null;
  horizonStart: string | null;
  horizonEnd: string | null;
  lastBootstrapAt: string | null;
};
type CloudJob = { id: string; jobNumber: string | null; jobDate: string | null; direction: string | null; status: string | null };
type CloudLoad = { id: string; jobId: string; loadNumber: number | null; direction: string | null; status: string | null };
type CloudEvidence = { evidenceId: string; entityType: string; entityId: string; fileName: string; contentType: string; byteSize: number; status: string; uploadedAt: string | null; createdAt: string | null };
type CloudCatalogue = { organisation: { id: string; teamName: string | null; status: string | null } | null; query: string; offset: number; limit: number; totals: { jobs: number; evidence: number }; jobs: CloudJob[]; jobLoads: CloudLoad[]; evidence: CloudEvidence[]; hasMoreJobs: boolean; nextOffset: number | null };
type CloudHistoryEvent = {
  id: string;
  occurredAt: string;
  source: "Desktop" | "Mobile" | "Cloud";
  eventType: string;
  label: string;
  entityType: string;
  entityId: string;
  loadNumber: number | null;
  resultStatus: string | null;
  reasonCode: string | null;
  version: number | null;
  actor: { id: string; name: string | null; email: string | null } | null;
  device: { id: string; displayName: string; deviceType: string; platform: string } | null;
  payload: unknown;
};
type CloudJobHistory = {
  ok: true;
  job: CloudJob & {
    driverId: string | null;
    vehicleId: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  loads: Array<CloudLoad & {
    driverId: string | null;
    vehicleId: string | null;
    ticketNumber: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  events: CloudHistoryEvent[];
  files: CloudEvidence[];
  note: string;
};

type EditState = {
  driverId: string;
  vehicleId: string;
  wasteDescription: string;
  grossWeight: string;
  tareWeight: string;
  netWeight: string;
  weightMetric: WeightMetric;
  notes: string;
  wasteItems: Array<{
    id: string;
    weightAmount: string;
    weightIsEstimate: boolean;
  }>;
};

type RejectionSummary = {
  authority: "RECEIVING_SITE" | "DRIVER";
  categoryLabel: string;
  reason: string;
};

const SITE_REJECTION_LABELS: Record<string, string> = {
  WASTE_MISMATCH: "Waste does not match booking",
  CONTAMINATION: "Contamination / unacceptable material",
  PERMIT_OR_COMPLIANCE: "Permit / compliance issue",
  UNSAFE_LOAD: "Unsafe load",
  DOCUMENTATION: "Missing / incorrect paperwork",
  SITE_CAPACITY: "Site cannot receive this load",
  OTHER: "Other",
};

function parseRejection(notes: string | null): RejectionSummary | null {
  if (!notes?.trim()) return null;
  const lines = notes.split("\n").map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    const site = line.match(/^\[SITE REJECTED · ([A-Z_]+) · [^\]]+\]\s*(.+)$/);
    if (site) {
      return {
        authority: "RECEIVING_SITE",
        categoryLabel: SITE_REJECTION_LABELS[site[1] ?? ""] ?? SITE_REJECTION_LABELS.OTHER,
        reason: (site[2] ?? "").trim(),
      };
    }
    const driver = line.match(/^\[DRIVER COLLECTION REJECTED · [^\]]+\]\s*(.+)$/);
    if (driver) {
      return {
        authority: "DRIVER",
        categoryLabel: "Driver refused collection",
        reason: (driver[1] ?? "").trim(),
      };
    }
    const legacy = line.match(/^\[REJECTED · [^\]]+\]\s*(.+)$/);
    if (legacy) {
      const detail = (legacy[1] ?? "").trim();
      const tagged = detail.match(/^\[CATEGORY:([A-Z_]+)\]\s*(.+)$/);
      const category = tagged?.[1] ?? "OTHER";
      return {
        authority: "RECEIVING_SITE",
        categoryLabel: SITE_REJECTION_LABELS[category] ?? SITE_REJECTION_LABELS.OTHER,
        reason: (tagged?.[2] ?? detail).trim(),
      };
    }
  }
  return null;
}

function loadBelongsToView(load: DailyLoad, view: LoadView) {
  if (view === "rejected") return load.status === "rejected";
  if (view === "completed") return load.status === "completed";
  if (view === "cancelled") return load.status === "cancelled";
  return !["completed", "rejected", "cancelled"].includes(load.status);
}

function weightMetric(value: string): WeightMetric {
  return value === "Grams" || value === "Kilograms" || value === "Tonnes" ? value : "Tonnes";
}

function formatWeightInput(value: number) {
  return Number(value.toFixed(3)).toString();
}

function calculatedNetWeight(grossValue: string, tareValue: string) {
  if (!grossValue.trim() || !tareValue.trim()) return "";
  const gross = Number(grossValue);
  const tare = Number(tareValue);
  if (!Number.isFinite(gross) || !Number.isFinite(tare) || gross < tare) return "";
  return formatWeightInput(gross - tare);
}

function vehicleTareForMetric(tareWeightKg: number | null, metric: WeightMetric) {
  if (tareWeightKg === null || !Number.isFinite(tareWeightKg) || tareWeightKg < 0) return null;
  if (metric === "Grams") return formatWeightInput(tareWeightKg * 1000);
  if (metric === "Tonnes") return formatWeightInput(tareWeightKg / 1000);
  return formatWeightInput(tareWeightKg);
}

function convertWeight(value: string, from: WeightMetric, to: WeightMetric) {
  if (!value.trim() || from === to) return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  const kilograms = from === "Tonnes" ? numeric * 1000 : from === "Grams" ? numeric / 1000 : numeric;
  const converted = to === "Tonnes" ? kilograms / 1000 : to === "Grams" ? kilograms * 1000 : kilograms;
  return formatWeightInput(converted);
}

function editStateFor(load: DailyLoad): EditState {
  const metric = weightMetric(load.weightMetric);
  const grossWeight = load.grossWeight ?? "";
  const tareWeight = load.tareWeight ?? "";
  const calculatedNet = calculatedNetWeight(grossWeight, tareWeight);
  return {
    driverId: load.driverId ?? "",
    vehicleId: load.vehicleId ?? "",
    wasteDescription: load.wasteDescription,
    grossWeight,
    tareWeight,
    netWeight: calculatedNet || load.netWeight || "",
    weightMetric: metric,
    notes: load.notes ?? "",
    wasteItems: (load.wasteItems ?? []).map((item) => ({
      id: item.id,
      weightAmount: item.weightAmount ?? "",
      weightIsEstimate: item.weightIsEstimate,
    })),
  };
}

function numberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) throw new Error("Weights must be valid numbers.");
  return parsed;
}

function shortTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function shortDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cloudHistoryTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function cloudHistorySummary(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const keys: Array<[string, string]> = [
    ["driverId", "Driver"],
    ["vehicleId", "Vehicle"],
    ["status", "Status"],
    ["grossWeight", "Gross"],
    ["tareWeight", "Tare"],
    ["netWeight", "Net"],
    ["weightMetric", "Metric"],
    ["ticketNumber", "Ticket"],
    ["reason", "Reason"],
    ["summary", "Summary"],
    ["fileName", "File"],
  ];

  return keys
    .flatMap(([key, label]) => {
      if (!(key in record)) return [];
      const value = record[key];

      if (value === null || value === "") return [`${label}: none`];

      return ["string", "number", "boolean"].includes(typeof value)
        ? [`${label}: ${String(value)}`]
        : [];
    })
    .slice(0, 5)
    .join(" · ");
}

export function App() {
  const [database, setDatabase] = useState<LocalDbStatus | null>(null);
  const [provisioning, setProvisioning] = useState<ProvisioningStatus | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [summary, setSummary] = useState<OperationalSummary | null>(null);
  const [operations, setOperations] = useState<DailyOperationsSnapshot | null>(null);
  const [sync, setSync] = useState<DesktopSyncStatus | null>(null);
  const [cloudContext, setCloudContext] = useState<CloudContext | null>(null);
  const [cloudCatalogue, setCloudCatalogue] = useState<CloudCatalogue | null>(null);
  const [cloudQuery, setCloudQuery] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudSelectedJobId, setCloudSelectedJobId] = useState<string | null>(null);
  const [cloudHistory, setCloudHistory] = useState<CloudJobHistory | null>(null);
  const [cloudHistoryBusy, setCloudHistoryBusy] = useState(false);
  const [cloudHistoryError, setCloudHistoryError] = useState<string | null>(null);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [loadView, setLoadView] = useState<LoadView>("live");

  const [desktopView, setDesktopView] = useState<DesktopView>("operations");

  const [loadQuery, setLoadQuery] = useState("");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [manualArrivalReason, setManualArrivalReason] = useState<ManualArrivalReason | "">("");
  const [manualArrivalNote, setManualArrivalNote] = useState("");
  const [manualArrivalConfirmed, setManualArrivalConfirmed] = useState(false);
  const [quickTransportKind, setQuickTransportKind] = useState<QuickTransportKind | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [tareSource, setTareSource] = useState<TareSource>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("Waste X Site Desktop");
  const [provisionOptions, setProvisionOptions] = useState<ProvisionOptions | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [signOutArmed, setSignOutArmed] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /* WASTE_X_DESKTOP_GLOBAL_ACTION_TOAST_V1 */
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 6500);
    return () => window.clearTimeout(timer);
  }, [message]);
  const syncLoopActive = useRef(false);

  const selectedLoad = useMemo(
    () => operations?.loads.find((load) => load.id === selectedLoadId) ?? null,
    [operations, selectedLoadId],
  );
  const visibleLoads = useMemo(
    () => (operations?.loads ?? []).filter((load) => loadBelongsToView(load, loadView)),
    [operations, loadView],
  );
  const loadCounts = useMemo(() => {
    const loads = operations?.loads ?? [];
    return {
      live: loads.filter((load) => loadBelongsToView(load, "live")).length,
      rejected: loads.filter((load) => loadBelongsToView(load, "rejected")).length,
      completed: loads.filter((load) => loadBelongsToView(load, "completed")).length,
      cancelled: loads.filter((load) => loadBelongsToView(load, "cancelled")).length,
    };
  }, [operations]);
  const rejection = useMemo(
    () => selectedLoad?.status === "rejected" ? parseRejection(selectedLoad.notes) : null,
    [selectedLoad],
  );
  const selectedTerminal = Boolean(selectedLoad && ["completed", "rejected", "cancelled"].includes(selectedLoad.status));
  const availableDrivers = useMemo(
    () => operations?.drivers.filter((driver) => driver.haulierCounterpartyId === (selectedLoad?.haulierCounterpartyId ?? null)) ?? [],
    [operations, selectedLoad],
  );
  const availableVehicles = useMemo(
    () => operations?.vehicles.filter((vehicle) => vehicle.haulierCounterpartyId === (selectedLoad?.haulierCounterpartyId ?? null)) ?? [],
    [operations, selectedLoad],
  );

  async function refreshLocalState() {
    const [dbStatus, provisioningStatus, authStatus] = await Promise.all([
      invoke<LocalDbStatus>("local_db_status"),
      invoke<ProvisioningStatus>("desktop_provisioning_status"),
      invoke<AuthStatus>("desktop_auth_status"),
    ]);
    setDatabase(dbStatus);
    setProvisioning(provisioningStatus);
    setAuth(authStatus);
    if (authStatus.unlocked) {
      const [operationalSummary, dailyOperations, syncStatus, context] = await Promise.all([
        invoke<OperationalSummary>("desktop_operational_summary"),
        invoke<DailyOperationsSnapshot>("desktop_daily_operations"),
        invoke<DesktopSyncStatus>("desktop_sync_status"),
        invoke<CloudContext>("desktop_cloud_context"),
      ]);
      setSummary(operationalSummary);
      setOperations(dailyOperations);
      setSync(syncStatus);
      setCloudContext(context);
    } else {
      setSummary(null); setOperations(null); setSync(null); setCloudContext(null); setCloudCatalogue(null); setCloudSelectedJobId(null); setCloudHistory(null); setCloudHistoryError(null); setSelectedLoadId(null); setEdit(null); setTareSource(null);
    }
  }

  async function fetchCloudJobHistory(jobId: string) {
    if (!auth?.unlocked || !sync?.cloudReachable) return;

    setCloudHistoryBusy(true);
    setCloudHistoryError(null);

    try {
      setCloudHistory(
        await invoke<CloudJobHistory>("desktop_cloud_job_history", {
          input: { jobId },
        }),
      );
    } catch (error) {
      setCloudHistory(null);
      setCloudHistoryError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCloudHistoryBusy(false);
    }
  }

  async function fetchCloudCatalogue(query = cloudQuery, offset = 0) {
    if (!auth?.unlocked) return;
    setCloudBusy(true);

    try {
      const catalogue = await invoke<CloudCatalogue>(
        "desktop_cloud_catalogue",
        { input: { query, offset, limit: 50 } },
      );

      setCloudCatalogue(catalogue);

      const selected =
        cloudSelectedJobId &&
        catalogue.jobs.some((job) => job.id === cloudSelectedJobId)
          ? cloudSelectedJobId
          : catalogue.jobs[0]?.id ?? null;

      setCloudSelectedJobId(selected);

      if (selected) void fetchCloudJobHistory(selected);
      else {
        setCloudHistory(null);
        setCloudHistoryError(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCloudBusy(false);
    }
  }

  async function copyCloudHistory() {
    if (!cloudHistory) return;

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(cloudHistory, null, 2),
      );
      setMessage("Record history copied as JSON.");
    } catch {
      setMessage(
        "Automatic copy was unavailable. Expand Raw record data and copy the required information manually.",
      );
    }
  }

  async function syncNow(showToast = true) {
    if (syncLoopActive.current) return;
    syncLoopActive.current = true;
    setSyncBusy(true);
    try {
      /* WASTE_X_DESKTOP_PARTNER_MUTATION_AUTO_SYNC_V1
       * Operational companies, Hauliers and Sites sync before Driver / Vehicle
       * and Job mutations that may reference their stable local identities. */
      let pendingMasterMutations = 0;
      try {
        const partnerSync = await invoke<{
          ok: boolean;
          syncedNow: number;
          pending: number;
          failed: number;
          warning: string | null;
        }>("desktop_sync_partner_mutations");
        pendingMasterMutations += partnerSync.pending;
      } catch {
        pendingMasterMutations += 1;
      }

      /* WASTE_X_DESKTOP_MASTER_MUTATION_AUTO_SYNC_V1
       * Driver / Vehicle creates replay after Partner identities and before
       * Job/Load activity that may reference them. */
      try {
        const transportSync = await invoke<{
          ok: boolean;
          syncedNow: number;
          pending: number;
          failed: number;
          warning: string | null;
        }>("desktop_sync_transport_mutations");
        pendingMasterMutations += transportSync.pending;
      } catch {
        pendingMasterMutations += 1;
      }

      /* WASTE_X_DESKTOP_JOB_MUTATION_AUTO_SYNC_V1
       * A Job owns the canonical identity of its planned Loads. Never upload a
       * later Load event until the Job-create request has Cloud acknowledgement. */
      let pendingJobCreates = 0;
      try {
        const jobSync = await invoke<{
          ok: boolean;
          syncedNow: number;
          pending: number;
          failed: number;
          warning: string | null;
        }>("desktop_sync_job_mutations");
        pendingJobCreates = jobSync.pending;
      } catch {
        pendingJobCreates = 1;
      }

      if (pendingJobCreates > 0 || pendingMasterMutations > 0) {
        try {
          await invoke("desktop_sync_support");
        } catch {
          // Support has its own durable queue and can retry independently.
        }

        const status = await invoke<DesktopSyncStatus>("desktop_sync_status");
        setSync(status);
        await refreshLocalState();

        if (showToast) {
          setMessage(
            pendingJobCreates > 0
              ? "Offline Job creation is still waiting for Cloud acknowledgement. Its Load activity remains safely queued behind it."
              : "Offline master-data changes are still waiting for Cloud acknowledgement. Load activity remains safely queued behind them.",
          );
        }
        return;
      }

      const result = await invoke<DesktopSyncRunResult>("desktop_sync_now");
      setSync(result.status);

      /* WASTE_X_DESKTOP_SUPPORT_AUTO_SYNC_V1 */
      if (result.status.cloudReachable && !result.status.authRequired) {
        try {
          await invoke("desktop_sync_support");
        } catch {
          // Support remains queued; operational Job sync stays isolated.
        }
      }

      /*
       * WASTE_X_DESKTOP_RELATIONAL_REFRESH_V1
       *
       * Incremental Job Load changes are fast, but the authoritative bootstrap
       * owns the complete relational working set (including wasteItems[]).
       * Reconcile after incoming Cloud changes so a multi-waste Load cannot
       * temporarily render from a flat/single-item compatibility payload.
       */
      if (
        result.status.cloudReachable &&
        !result.status.authRequired &&
        result.pulledChanges > 0
      ) {
        try {
          await invoke("desktop_refresh_bootstrap");
        } catch {
          // Incremental sync has already succeeded. The periodic reconciliation
          // below will retry without blocking local operations.
        }
      }

      await refreshLocalState();
      if (showToast) {
        if (!result.status.cloudReachable) setMessage("Cloud is still unavailable. Local operations remain safe and queued.");
        else if (result.status.authRequired) setMessage("Cloud is reachable, but the Desktop session must be renewed with an online sign-in.");
        else if (result.pushedConflicts > 0 || result.status.conflicts > 0) setMessage("Sync stopped safely at a conflict. Later physical events remain queued in order.");
        else if (result.status.permanentFailed > 0) setMessage("Cloud rejected an event. Waste X kept it locally for review instead of discarding it.");
        else setMessage(`Sync complete: ${result.pushedApplied + result.pushedDuplicates} uploaded · ${result.pulledChanges} Cloud changes received.`);
      }
    } catch (error) {
      if (showToast) setMessage(error instanceof Error ? error.message : String(error));
    } finally { setSyncBusy(false); syncLoopActive.current = false; }
  }

  async function storedVehicleTare(vehicleId: string, metric: WeightMetric) {
    const result = await invoke<VehicleTareResult>("desktop_vehicle_tare", { input: { vehicleId } });
    return vehicleTareForMetric(result.tareWeightKg, metric);
  }

  useEffect(() => {
    void (async () => {
      try { await invoke("local_db_self_test"); await refreshLocalState(); }
      catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    })();
  }, []);
  useEffect(() => { if (!email && auth?.email) setEmail(auth.email); }, [auth?.email, email]);
  useEffect(() => {
    if (!operations) return;
    const currentIsVisible = Boolean(selectedLoadId && operations.loads.some((load) => load.id === selectedLoadId && loadBelongsToView(load, loadView)));
    if (!currentIsVisible) {
      setSelectedLoadId(operations.loads.find((load) => loadBelongsToView(load, loadView))?.id ?? null);
    }
  }, [loadView, operations, selectedLoadId]);
  useEffect(() => {
    let cancelled = false;
    if (!selectedLoad) {
      setEdit(null);
      setTareSource(null);
      return () => { cancelled = true; };
    }

    const initial = editStateFor(selectedLoad);
    setEdit(initial);
    setManualArrivalReason("");
    setManualArrivalNote("");
    setManualArrivalConfirmed(false);
    if (selectedLoad.tareWeight !== null && selectedLoad.tareWeight.trim() !== "") {
      setTareSource("LOAD");
      return () => { cancelled = true; };
    }
    if (!selectedLoad.vehicleId) {
      setTareSource(null);
      return () => { cancelled = true; };
    }

    void storedVehicleTare(selectedLoad.vehicleId, initial.weightMetric)
      .then((tare) => {
        if (cancelled || tare === null) return;
        setEdit((current) => current && current.vehicleId === selectedLoad.vehicleId
          ? { ...current, tareWeight: tare, netWeight: calculatedNetWeight(current.grossWeight, tare) }
          : current);
        setTareSource("VEHICLE_MASTER");
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : String(error));
      });

    return () => { cancelled = true; };
  }, [selectedLoad?.id]);
  useEffect(() => {
    if (!auth?.unlocked) return;
    const initial = window.setTimeout(() => void syncNow(false), 1200);
    const interval = window.setInterval(() => void syncNow(false), 15_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [auth?.unlocked]);

  useEffect(() => {
    if (
      !auth?.unlocked ||
      !sync?.cloudReachable ||
      sync?.authRequired
    ) {
      return;
    }

    let cancelled = false;

    const reconcileAuthoritativeWorkingSet = async () => {
      if (syncLoopActive.current) return;

      try {
        await invoke("desktop_refresh_bootstrap");
        if (!cancelled) {
          await refreshLocalState();
        }
      } catch {
        // Offline-first: a missed reconciliation is retried automatically.
      }
    };

    const initial = window.setTimeout(
      () => void reconcileAuthoritativeWorkingSet(),
      3_000,
    );
    const interval = window.setInterval(
      () => void reconcileAuthoritativeWorkingSet(),
      60_000,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [auth?.unlocked, sync?.authRequired, sync?.cloudReachable]);

  useEffect(() => {
    if (auth?.unlocked && sync?.cloudReachable && !cloudCatalogue && !cloudBusy) void fetchCloudCatalogue("", 0);
  }, [auth?.unlocked, sync?.cloudReachable]);

  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage(null);
    try { await task(); await refreshLocalState(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function handleProvisionCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setProvisionOptions(null);
    setSelectedSiteId("");

    try {
      const options = await invoke<ProvisionOptions>("desktop_provision_options", {
        input: { email, password },
      });

      setProvisionOptions(options);
      setSelectedSiteId(
        options.recommendedSiteId ??
          (options.sites.length === 1 ? options.sites[0]!.id : ""),
      );

      if (options.sites.length === 0) {
        setMessage(
          "Your organisation has no active Waste X site. Create or activate a site in Waste X Web before registering this workstation.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleProvision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!provisionOptions) {
      setMessage("Verify the Waste X account before registering this workstation.");
      return;
    }

    if (!selectedSiteId) {
      setMessage("Choose the operating site for this Waste X Desktop.");
      return;
    }

    await run(async () => {
      await invoke("desktop_provision_and_bootstrap", {
        input: {
          email,
          password,
          displayName,
          defaultSiteId: selectedSiteId,
        },
      });

      await invoke<UnlockResult>("desktop_unlock", {
        input: { email, password },
      });

      setPassword("");
      setProvisionOptions(null);
      setSelectedSiteId("");
    }, "This workstation is registered, the site working set is stored locally, and offline access is ready.");
  }

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result = await invoke<UnlockResult>("desktop_unlock", { input: { email, password } });
      setPassword("");
      if (result.mode === "ONLINE") await invoke("desktop_refresh_bootstrap");
      await refreshLocalState();
      setMessage(
        result.mode === "OFFLINE"
          ? "Desktop unlocked. Local operations are ready."
          : "Desktop unlocked. Working set refreshed.",
      );
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function handleLock() {
    await invoke("desktop_lock");
    setMessage(null);
    await refreshLocalState();
  }

  async function handleSignOut() {
    setBusy(true);
    setMessage(null);

    try {
      await invoke("desktop_sign_out");
      setSignOutArmed(false);
      await refreshLocalState();
      setMessage(
        "Signed out. This workstation remains registered, but Waste X Cloud is required for the next password sign-in.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function loadDetailsInput(load: DailyLoad, values: EditState) {
    const netWeight = calculatedNetWeight(values.grossWeight, values.tareWeight);
    return {
      loadId: load.id,
      driverId: values.driverId || null,
      vehicleId: values.vehicleId || null,
      wasteDescription: values.wasteDescription,
      grossWeight: numberOrNull(values.grossWeight),
      tareWeight: numberOrNull(values.tareWeight),
      netWeight: numberOrNull(netWeight),
      weightMetric: values.weightMetric,
      weightIsEstimate: false,
      ticketNumber: null,
      notes: values.notes || null,
      wasteItems: values.wasteItems.map((item) => ({
        id: item.id,
        weightAmount: numberOrNull(item.weightAmount),
        weightIsEstimate: item.weightIsEstimate,
      })),
    };
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLoad || !edit) return;

    await run(
      () =>
        invoke("desktop_save_load_details", {
          input: loadDetailsInput(selectedLoad, edit),
        }),
      "Site details saved locally. Waste X will sync them to Cloud when available.",
    );

    /*
     * WASTE_X_DESKTOP_IMMEDIATE_DETAILS_SYNC_V1
     *
     * Weights and Waste Item allocations are operational data, not completion-
     * only data. Attempt sync immediately after Save so Web can show them before
     * the Load is completed. If Cloud is unavailable, the encrypted outbox
     * remains authoritative and the normal background loop retries later.
     */
    await syncNow(false);
  }

  async function completeSelectedLoad() {
    if (!selectedLoad || !edit) return;
    const netWeight = calculatedNetWeight(edit.grossWeight, edit.tareWeight);
    const net = Number(netWeight);
    if (!netWeight || !Number.isFinite(net) || net <= 0) {
      setMessage("Enter a gross weight above tare. Waste X calculates the positive net weight automatically before completion.");
      return;
    }

    if (edit.wasteItems.length > 1) {
      const allocations = edit.wasteItems.map((item) =>
        Number(item.weightAmount),
      );
      if (
        allocations.some(
          (value) => !Number.isFinite(value) || value <= 0,
        )
      ) {
        setMessage(
          "Enter a positive weight allocation for every Waste Item before completing the Load.",
        );
        return;
      }

      const allocated = allocations.reduce(
        (total, value) => total + value,
        0,
      );
      const tolerance =
        edit.weightMetric === "Grams"
          ? 1
          : edit.weightMetric === "Kilograms"
            ? 0.01
            : 0.001;

      if (Math.abs(allocated - net) > tolerance) {
        setMessage(
          `Waste Item allocations total ${allocated.toFixed(3)} ${edit.weightMetric}, but the Load net is ${net.toFixed(3)} ${edit.weightMetric}.`,
        );
        return;
      }
    }

    await run(async () => {
      /* Completion finalises the values currently visible to the operator.
       * They no longer need to press Save site details before Complete Load. */
      await invoke("desktop_save_load_details", { input: loadDetailsInput(selectedLoad, edit) });
      await invoke("desktop_complete_load", { input: { loadId: selectedLoad.id } });
    }, "Site weights finalised and load completed locally. The receiving-site ticket can now be generated.");
  }

  async function handleQuickTransportCreated(
    kind: QuickTransportKind,
    entityId: string,
  ) {
    /*
      The modal refreshed the Cloud bootstrap. Reload Operations, then select
      the new record in the current unsaved Load editor.

      Do not auto-save the Load: the operator may also have unsaved weights
      or notes. Save site details remains the explicit Load commit point.
    */
    await refreshLocalState();

    if (kind === "driver") {
      setEdit((current) =>
        current ? { ...current, driverId: entityId } : current,
      );
      setMessage(
        "Driver created and selected. Save site details to assign the Driver to this Load.",
      );
      return;
    }

    setEdit((current) =>
      current ? { ...current, vehicleId: entityId } : current,
    );

    const metric = edit?.weightMetric ?? "Tonnes";

    try {
      const tare = await storedVehicleTare(entityId, metric);

      if (tare !== null) {
        setEdit((current) =>
          current && current.vehicleId === entityId
            ? {
                ...current,
                tareWeight: tare,
                netWeight: calculatedNetWeight(
                  current.grossWeight,
                  tare,
                ),
              }
            : current,
        );
        setTareSource("VEHICLE_MASTER");
      } else {
        setTareSource(null);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : String(error),
      );
      return;
    }

    setMessage(
      "Vehicle created and selected. Save site details to assign the Vehicle to this Load.",
    );
  }

  async function handleVehicleChange(vehicleId: string) {
    if (!edit) return;
    setEdit({ ...edit, vehicleId });
    if (!vehicleId) {
      setTareSource(null);
      return;
    }

    try {
      const tare = await storedVehicleTare(vehicleId, edit.weightMetric);
      if (tare === null) {
        setTareSource(null);
        return;
      }
      setEdit((current) => current && current.vehicleId === vehicleId
        ? { ...current, tareWeight: tare, netWeight: calculatedNetWeight(current.grossWeight, tare) }
        : current);
      setTareSource("VEHICLE_MASTER");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function handleMetricChange(nextMetric: WeightMetric) {
    if (!edit) return;
    const grossWeight = convertWeight(edit.grossWeight, edit.weightMetric, nextMetric);
    const tareWeight = convertWeight(edit.tareWeight, edit.weightMetric, nextMetric);
    setEdit({
      ...edit,
      weightMetric: nextMetric,
      grossWeight,
      tareWeight,
      netWeight: calculatedNetWeight(grossWeight, tareWeight),
      wasteItems: edit.wasteItems.map((item) => ({
        ...item,
        weightAmount: convertWeight(
          item.weightAmount,
          edit.weightMetric,
          nextMetric,
        ),
      })),
    });
  }

  async function loadAction(command: string, success: string) {
    if (!selectedLoad) return;
    await run(() => invoke(command, { input: { loadId: selectedLoad.id } }), success);
  }

  async function manualArriveSelectedLoad() {
    if (!selectedLoad) return;

    if (!manualArrivalConfirmed) {
      setMessage("Confirm that the vehicle and waste are physically at the receiving site.");
      return;
    }
    if (!manualArrivalReason) {
      setMessage("Choose why Driver Mobile cannot be used for this arrival.");
      return;
    }
    if (
      manualArrivalReason === "OTHER" &&
      manualArrivalNote.trim().length < 3
    ) {
      setMessage("Add a short note when the manual-arrival reason is Other.");
      return;
    }

    await run(
      () =>
        invoke("desktop_mark_load_arrived", {
          input: {
            loadId: selectedLoad.id,
            arrivalMode: "manual_site_fallback",
            manualArrivalReason,
            manualArrivalNote: manualArrivalNote.trim() || null,
            physicalArrivalConfirmed: true,
          },
        }),
      "Manual site arrival recorded locally and queued for Cloud audit sync.",
    );
  }

  async function rejectLoad(category: SiteRejectionCategory, reason: string) {
    if (!selectedLoad) return false;
    setBusy(true);
    setMessage(null);
    try {
      await invoke("desktop_reject_site_load", {
        input: { loadId: selectedLoad.id, category, reason },
      });
      setLoadView("rejected");
      await refreshLocalState();
      setMessage("Load rejected locally with the receiving-site reason recorded. Cloud sync will update the Driver copy.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCloudSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await fetchCloudCatalogue(cloudQuery, 0); }

  const locked = Boolean(provisioning?.provisioned && !auth?.unlocked);
  const syncProblems = (sync?.conflicts ?? 0) + (sync?.permanentFailed ?? 0) + (sync?.deferredRemoteChanges ?? 0);
  const incomingWeightLocked = Boolean(selectedLoad?.direction === "incoming" && !["arrived", "accepted"].includes(selectedLoad.status));


  // PILOT_DESKTOP_SHELL_V2
  if (auth?.unlocked) {
    const pilotSiteName =
      (
        cloudContext as
          | (CloudContext & { defaultSiteName?: string | null })
          | null
      )?.defaultSiteName ??
      (
        provisioning as
          | (ProvisioningStatus & { defaultSiteName?: string | null })
          | null
      )?.defaultSiteName ??
      "Receiving site";

    const driverLabels = new Map(
      (operations?.drivers ?? []).map((driver) => [driver.id, driver.label]),
    );

    const vehicleLabels = new Map(
      (operations?.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle.label]),
    );

    const pilotDriverLabel = (load: DailyLoad) =>
      load.driverId
        ? driverLabels.get(load.driverId) ?? "Assigned driver"
        : "Unassigned";

    const pilotVehicleLabel = (load: DailyLoad) =>
      load.vehicleId
        ? vehicleLabels.get(load.vehicleId) ?? "Assigned vehicle"
        : "No vehicle";

    const normalisedLoadQuery = loadQuery.trim().toLowerCase();

    const statusPriority = (status: string) => {
      if (status === "arrived") return 0;
      if (status === "accepted") return 1;
      if (status === "planned") return 2;
      return 3;
    };

    const pilotVisibleLoads = [...visibleLoads]
      .filter((load) => {
        if (!normalisedLoadQuery) return true;

        const searchable = [
          load.jobNumber,
          load.jobId,
          load.id,
          load.loadNumber !== null ? `load ${load.loadNumber}` : "",
          load.jobDate ?? "",
          load.direction,
          load.status,
          load.wasteDescription,
          load.ewcCode ?? "",
          ...(load.wasteItems ?? []).flatMap((item) => [
            item.ewcCode,
            item.wasteDescription,
          ]),
          load.ticketNumber ?? "",
          load.notes ?? "",
          pilotDriverLabel(load),
          pilotVehicleLabel(load),
          load.searchText ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(normalisedLoadQuery);
      })
      .sort((a, b) => {
        if (loadView === "live") {
          const priority =
            statusPriority(a.status) - statusPriority(b.status);

          if (priority !== 0) return priority;
        }

        const date =
          (a.jobDate ?? "").localeCompare(b.jobDate ?? "");

        if (date !== 0) return date;

        const job = a.jobNumber.localeCompare(b.jobNumber);

        if (job !== 0) return job;

        return (a.loadNumber ?? 0) - (b.loadNumber ?? 0);
      });

    const pilotSelectedVisible = Boolean(
      selectedLoad &&
        pilotVisibleLoads.some((load) => load.id === selectedLoad.id),
    );

    return (
      <main className="shell pilot-shell">
        <header className="pilot-appbar">
          <div className="pilot-brand">
            <span className="eyebrow">Waste X Desktop</span>
            <strong>{pilotSiteName}</strong>
          </div>

          <nav
            className="pilot-primary-nav"
            aria-label="Waste X Desktop navigation"
          >
            <button
              type="button"
              className={desktopView === "operations" ? "active" : ""}
              onClick={() => setDesktopView("operations")}
            >
              Operations
            </button>

            <button
              type="button"
              className={desktopView === "create" ? "active" : ""}
              onClick={() => setDesktopView("create")}
            >
              Create job
            </button>

            <button
              type="button"
              className={desktopView === "cloud" ? "active" : ""}
              onClick={() => setDesktopView("cloud")}
            >
              Records
            </button>

            <button
              type="button"
              className={desktopView === "manage" ? "active" : ""}
              onClick={() => setDesktopView("manage")}
            >
              Manage
            </button>

            <button

              type="button"

              className={desktopView === "support" ? "active" : ""}

              onClick={() => setDesktopView("support")}

            >

              Support

            </button>


            <button
              type="button"
              className={desktopView === "settings" ? "active" : ""}
              onClick={() => setDesktopView("settings")}
            >
              Settings
            </button>
          </nav>

          <div className="pilot-appbar-actions">
            <span
              className={`pilot-connection ${
                sync?.cloudReachable ? "online" : "offline"
              }`}
            >
              <i />
              {sync?.cloudReachable ? "Online" : "Offline"}
            </span>

            <button
              type="button"
              className="pilot-lock-button"
              onClick={handleLock}
            >
              Lock Desktop
            </button>
          </div>
        </header>

        {desktopView === "operations" ? (
          <section className="pilot-screen pilot-operations-screen">
            <div className="pilot-operations-title">
              <div>
                <span className="eyebrow">Site operations</span>
                <h1>Loads</h1>
                <p>
                  {pilotSiteName} · select a load and operate it from one screen.
                </p>
              </div>

              <div className="pilot-mini-status">
                <span>
                  <strong>{operations?.pendingEvents ?? 0}</strong> queued
                </span>
                <span>
                  <strong>{syncProblems}</strong> review
                </span>
              </div>
            </div>

            <section
              className="load-view-tabs pilot-load-tabs"
              aria-label="Load status views"
            >
              {([
                ["live", "Live", loadCounts.live],
                ["rejected", "Rejected", loadCounts.rejected],
                ["completed", "Completed", loadCounts.completed],
                ["cancelled", "Cancelled", loadCounts.cancelled],
              ] as Array<[LoadView, string, number]>).map(
                ([value, label, count]) => (
                  <button
                    type="button"
                    key={value}
                    className={loadView === value ? "active" : ""}
                    onClick={() => setLoadView(value)}
                  >
                    {label} <span>{count}</span>
                  </button>
                ),
              )}
            </section>

            <div className="pilot-search-row">
              <div className="pilot-search">
                <span aria-hidden="true">⌕</span>

                <input
                  type="search"
                  value={loadQuery}
                  onChange={(event) => setLoadQuery(event.target.value)}
                  placeholder="Search reference, driver, source, waste, vehicle, EWC or ticket…"
                  aria-label="Search cached loads"
                />

                {loadQuery ? (
                  <button
                    type="button"
                    className="pilot-search-clear"
                    onClick={() => setLoadQuery("")}
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <span className="pilot-result-count">
                {pilotVisibleLoads.length} matching{" "}
                {loadView === "live" ? "live" : loadView}{" "}
                {pilotVisibleLoads.length === 1 ? "load" : "loads"}
              </span>
            </div>

            <section className="pilot-workspace">
              <section className="pilot-load-panel">
                <div className="pilot-table-head">
                  <span>Reference</span>
                  <span>Driver / waste</span>
                  <span>Status</span>
                </div>

                <div className="pilot-table-body">
                  {pilotVisibleLoads.map((load) => (
                    <button
                      type="button"
                      key={load.id}
                      className={`pilot-table-row ${
                        selectedLoadId === load.id ? "selected" : ""
                      }`}
                      onClick={() => setSelectedLoadId(load.id)}
                    >
                      <span className="pilot-reference-cell">
                        <strong>
                          {load.jobNumber || "Job"} · {load.loadNumber ?? "—"}
                        </strong>

                        <small>
                          {shortDate(load.jobDate)} · {load.direction}
                          {load.wasteItems?.length > 1
                            ? ` · ${load.wasteItems.length} waste items`
                            : load.ewcCode
                              ? ` · ${load.ewcCode}`
                              : ""}
                        </small>
                      </span>

                      <span className="pilot-detail-cell">
                        <strong>{pilotDriverLabel(load)}</strong>

                        <small>
                          {load.wasteItems?.length > 1
                            ? load.wasteItems
                                .map(
                                  (item) =>
                                    `${item.ewcCode} ${item.wasteDescription}`,
                                )
                                .join(" · ")
                            : load.wasteDescription ||
                              "Waste description required"}
                          {load.vehicleId
                            ? ` · ${pilotVehicleLabel(load)}`
                            : ""}
                        </small>
                      </span>

                      <span className="pilot-table-status">
                        <span
                          className={`status-pill status-${load.status}`}
                        >
                          {desktopLoadStatusLabel(load)}
                        </span>

                        <small>{desktopLoadSyncSummary(load)}</small>
                      </span>
                    </button>
                  ))}

                  {!pilotVisibleLoads.length ? (
                    <div className="empty-state pilot-empty-table">
                      {loadQuery
                        ? `No ${loadView} loads match “${loadQuery}”.`
                        : `No ${loadView} loads are cached on this Desktop.`}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="load-editor pilot-load-editor">
                {selectedLoad && pilotSelectedVisible && edit ? (
                  <>
                    <div className="editor-heading pilot-editor-heading">
                      <div>
                        <span className="eyebrow">Selected load</span>

                        <h3>
                          {selectedLoad.jobNumber} · Load{" "}
                          {selectedLoad.loadNumber ?? "—"}
                        </h3>

                        <p className="pilot-editor-meta">
                          {shortDate(selectedLoad.jobDate)} ·{" "}
                          {selectedLoad.direction}
                          {selectedLoad.wasteItems?.length > 1
                            ? ` · ${selectedLoad.wasteItems.length} waste items`
                            : selectedLoad.ewcCode
                              ? ` · EWC ${selectedLoad.ewcCode}`
                              : ""}
                        </p>
                      </div>

                      <span
                        className={`status-pill status-${selectedLoad.status}`}
                      >
                        {desktopLoadStatusLabel(selectedLoad)}
                      </span>
                    </div>

                    {selectedLoad.status === "rejected" ? (
                      <div className="site-rejection-record">
                        <span>REJECTION RECORD</span>

                        <strong>
                          {rejection?.authority === "DRIVER"
                            ? "Driver refused collection"
                            : "Receiving site rejected load"}
                        </strong>

                        <b>
                          {rejection?.categoryLabel ??
                            "Reason recorded in load notes"}
                        </b>

                        <p>
                          {rejection?.reason ??
                            "Review the recorded rejection detail below."}
                        </p>

                        <small>
                          This load is terminal and does not receive a normal
                          completed-load ticket.
                        </small>
                      </div>
                    ) : null}

                    {/* WASTE_X_STAGE_D_ACTIVE_SHELL_V1 */}
                    {quickTransportKind ? (
                      <QuickAddTransportModal
                        open
                        kind={quickTransportKind}
                        jobNumber={selectedLoad.jobNumber}
                        loadNumber={selectedLoad.loadNumber}
                        haulierCounterpartyId={
                          selectedLoad.haulierCounterpartyId
                        }
                        onClose={() => setQuickTransportKind(null)}
                        onCreated={handleQuickTransportCreated}
                      />
                    ) : null}

                    <form
                      className="editor-form pilot-editor-form"
                      onSubmit={saveDetails}
                    >
                      <label className="pilot-quick-select-field">
                        <span className="pilot-quick-select-heading">
                          <span>Driver</span>
                          <button
                            type="button"
                            disabled={selectedTerminal || busy}
                            title="Create a Driver locally for this Load's carrier; Waste X syncs it when Cloud is available"
                            onClick={() => setQuickTransportKind("driver")}
                          >
                            + Add
                          </button>
                        </span>

                        <select
                          disabled={selectedTerminal}
                          value={edit.driverId}
                          onChange={(event) =>
                            setEdit({
                              ...edit,
                              driverId: event.target.value,
                            })
                          }
                        >
                          <option value="">Select driver</option>

                          {availableDrivers.map((driver) => (
                            <option
                              key={driver.id}
                              value={driver.id}
                            >
                              {driver.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="pilot-quick-select-field">
                        <span className="pilot-quick-select-heading">
                          <span>Vehicle</span>
                          <button
                            type="button"
                            disabled={selectedTerminal || busy}
                            title="Create a Vehicle locally for this Load's carrier; Waste X syncs it when Cloud is available"
                            onClick={() => setQuickTransportKind("vehicle")}
                          >
                            + Add
                          </button>
                        </span>

                        <select
                          disabled={selectedTerminal}
                          value={edit.vehicleId}
                          onChange={(event) =>
                            void handleVehicleChange(event.target.value)
                          }
                        >
                          <option value="">Select vehicle</option>

                          {availableVehicles.map((vehicle) => (
                            <option
                              key={vehicle.id}
                              value={vehicle.id}
                            >
                              {vehicle.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="wide">
                        <span>Waste description</span>

                        <input
                          disabled={selectedTerminal}
                          value={edit.wasteDescription}
                          onChange={(event) =>
                            setEdit({
                              ...edit,
                              wasteDescription: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label>
                        <span>Gross · weighbridge reading</span>

                        <input
                          disabled={
                            selectedTerminal || incomingWeightLocked
                          }
                          inputMode="decimal"
                          value={edit.grossWeight}
                          onChange={(event) => {
                            const grossWeight = event.target.value;

                            setEdit({
                              ...edit,
                              grossWeight,
                              netWeight: calculatedNetWeight(
                                grossWeight,
                                edit.tareWeight,
                              ),
                            });
                          }}
                        />
                      </label>

                      <label>
                        <span>Tare</span>

                        <input
                          disabled={
                            selectedTerminal || incomingWeightLocked
                          }
                          inputMode="decimal"
                          value={edit.tareWeight}
                          onChange={(event) => {
                            const tareWeight = event.target.value;

                            setTareSource("MANUAL");

                            setEdit({
                              ...edit,
                              tareWeight,
                              netWeight: calculatedNetWeight(
                                edit.grossWeight,
                                tareWeight,
                              ),
                            });
                          }}
                        />

                        <small className="small-copy">
                          {tareSource === "VEHICLE_MASTER"
                            ? "Loaded from the vehicle's stored tare."
                            : tareSource === "LOAD"
                              ? "Using the tare already saved on this load."
                              : tareSource === "MANUAL"
                                ? "Operator-adjusted tare."
                                : "Enter the actual tare."}
                        </small>
                      </label>

                      <label>
                        <span>Net · calculated</span>

                        <input
                          readOnly
                          inputMode="decimal"
                          value={edit.netWeight}
                        />

                        <small className="small-copy">
                          Gross − tare.
                        </small>
                      </label>

                      <label>
                        <span>Metric</span>

                        <select
                          disabled={
                            selectedTerminal || incomingWeightLocked
                          }
                          value={edit.weightMetric}
                          onChange={(event) =>
                            handleMetricChange(
                              event.target.value as WeightMetric,
                            )
                          }
                        >
                          <option>Tonnes</option>
                          <option>Kilograms</option>
                          <option>Grams</option>
                        </select>
                      </label>

                      {selectedLoad.wasteItems?.length ? (
                        <div className="wide">
                          <span className="pilot-waste-allocation-title">Waste Items · allocation must equal net</span>

                          <div className="manage-inline-list">
                            {selectedLoad.wasteItems.map((item) => {
                              const allocation = edit.wasteItems.find(
                                (row) => row.id === item.id,
                              );

                              return (
                                <div
                                  key={item.id}
                                  className="manage-inline-card"
                                >
                                  <div>
                                    <strong>
                                      {item.itemNumber}. {item.ewcCode}
                                    </strong>
                                    <small>
                                      {item.wasteDescription}
                                      {item.permitEwcMatchType ===
                                      "regulatory_authority"
                                        ? ` · Regulatory authority${item.permitEwcBasis ? ` · ${item.permitEwcBasis.replaceAll("_", " ")}` : ""}`
                                        : " · Exact permit match"}
                                    </small>
                                  </div>

                                  <label className="pilot-allocation-field">
                                    <span>
                                      Allocated {edit.weightMetric}
                                    </span>
                                    <input
                                      disabled={
                                        selectedTerminal ||
                                        incomingWeightLocked
                                      }
                                      inputMode="decimal"
                                      value={
                                        allocation?.weightAmount ?? ""
                                      }
                                      onChange={(event) =>
                                        setEdit({
                                          ...edit,
                                          wasteItems:
                                            edit.wasteItems.map((row) =>
                                              row.id === item.id
                                                ? {
                                                    ...row,
                                                    weightAmount:
                                                      event.target.value,
                                                  }
                                                : row,
                                            ),
                                        })
                                      }
                                    />
                                  </label>

                                  <label className="pilot-estimate-toggle">
                                    <span>Estimated split</span>
                                    <input
                                      type="checkbox"
                                      disabled={
                                        selectedTerminal ||
                                        incomingWeightLocked
                                      }
                                      checked={
                                        allocation?.weightIsEstimate ??
                                        false
                                      }
                                      onChange={(event) =>
                                        setEdit({
                                          ...edit,
                                          wasteItems:
                                            edit.wasteItems.map((row) =>
                                              row.id === item.id
                                                ? {
                                                    ...row,
                                                    weightIsEstimate:
                                                      event.target.checked,
                                                  }
                                                : row,
                                            ),
                                        })
                                      }
                                    />
                                  </label>
                                </div>
                              );
                            })}
                          </div>

                          <small className="small-copy">
                            Gross and tare belong to the lorry. Allocate the
                            final net across every identifiable Waste Item.
                            Mark an allocation estimated when it was not
                            separately measured.
                          </small>
                        </div>
                      ) : null}

                      {incomingWeightLocked && !selectedTerminal ? (
                        <p className="wide small-copy pilot-weight-note">
                          Weight entry unlocks when the load reaches the
                          receiving site.
                        </p>
                      ) : null}

                      <label className="wide">
                        <span>Site ticket</span>

                        <input
                          disabled
                          value={
                            selectedLoad.ticketNumber ??
                            (selectedLoad.status === "completed"
                              ? "Ready to generate below"
                              : selectedLoad.status === "rejected"
                                ? "Not issued for rejected loads"
                                : "Available after site completion")
                          }
                        />
                      </label>

                      <label className="wide">
                        <span>Notes</span>

                        <textarea
                          disabled={selectedTerminal}
                          rows={2}
                          value={edit.notes}
                          onChange={(event) =>
                            setEdit({
                              ...edit,
                              notes: event.target.value,
                            })
                          }
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={busy || selectedTerminal}
                      >
                        Save site details
                      </button>
                    </form>

                    <div className="action-row pilot-action-row">
                      {selectedLoad.direction === "incoming" &&
                      selectedLoad.status === "planned" &&
                      selectedLoad.haulierCounterpartyId ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            loadAction(
                              "desktop_mark_load_arrived",
                              "External-haulier arrival recorded locally and queued for sync.",
                            )
                          }
                        >
                          Mark external carrier arrived
                        </button>
                      ) : null}

                      {selectedLoad.direction === "incoming" &&
                      selectedLoad.status === "planned" &&
                      !selectedLoad.haulierCounterpartyId ? (
                        <div className="wide">
                          <p className="small-copy">
                            Waiting for the assigned Driver to mark Arrived at
                            destination on Mobile.
                          </p>
                          <details className="ticket-waiting-card">
                            <summary>Driver cannot use Mobile?</summary>
                            <div className="inline-form-grid">
                              <p className="small-copy">
                                Use this only when the vehicle and waste are
                                physically at this receiving site. Waste X records
                                the Desktop operator, time and reason without
                                inventing Driver milestones.
                              </p>
                              <label>
                                <span>Fallback reason</span>
                                <select
                                  value={manualArrivalReason}
                                  onChange={(event) =>
                                    setManualArrivalReason(
                                      event.target.value as ManualArrivalReason | "",
                                    )
                                  }
                                >
                                  <option value="">Choose reason</option>
                                  <option value="DRIVER_NO_MOBILE_ACCESS">
                                    Driver has no Mobile access
                                  </option>
                                  <option value="DRIVER_DEVICE_UNAVAILABLE">
                                    Driver phone / device unavailable
                                  </option>
                                  <option value="CONNECTIVITY_ISSUE">
                                    Connectivity issue
                                  </option>
                                  <option value="SITE_CONFIRMED_PHYSICAL_ARRIVAL">
                                    Site confirmed physical arrival
                                  </option>
                                  <option value="OTHER">Other</option>
                                </select>
                              </label>
                              <label>
                                <span>Note</span>
                                <textarea
                                  rows={2}
                                  maxLength={2000}
                                  value={manualArrivalNote}
                                  onChange={(event) =>
                                    setManualArrivalNote(event.target.value)
                                  }
                                  placeholder="Optional unless reason is Other"
                                />
                              </label>
                              <label className="desktop-inline-check">
                                <input
                                  type="checkbox"
                                  checked={manualArrivalConfirmed}
                                  onChange={(event) =>
                                    setManualArrivalConfirmed(event.target.checked)
                                  }
                                />
                                I confirm the vehicle and waste are physically at
                                this receiving site.
                              </label>
                              <button
                                type="button"
                                disabled={
                                  busy ||
                                  !manualArrivalConfirmed ||
                                  !manualArrivalReason
                                }
                                onClick={() => void manualArriveSelectedLoad()}
                              >
                                Confirm manual arrival
                              </button>
                            </div>
                          </details>
                        </div>
                      ) : null}

                      {selectedLoad.direction === "incoming" &&
                      selectedLoad.status === "arrived" ? (
                        <>
                          <button
                            type="button"
                            className="danger-button"
                            disabled={busy}
                            onClick={() => setRejectModalOpen(true)}
                          >
                            Reject load
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              loadAction(
                                "desktop_accept_load",
                                "Load accepted locally and queued for sync.",
                              )
                            }
                          >
                            Accept load
                          </button>
                        </>
                      ) : null}

                      {(selectedLoad.direction === "incoming" &&
                        selectedLoad.status === "accepted") ||
                      (selectedLoad.direction === "outgoing" &&
                        ![
                          "completed",
                          "rejected",
                          "cancelled",
                        ].includes(selectedLoad.status)) ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void completeSelectedLoad()
                          }
                        >
                          Finalise weights + Complete
                        </button>
                      ) : null}
                    </div>

                    {selectedLoad.status === "completed" ||
                    selectedLoad.ticketNumber ? (
                      <TicketPanel
                        loadId={selectedLoad.id}
                        disabled={busy}
                        onChanged={refreshLocalState}
                      />
                    ) : null}

                    <div className="local-proof pilot-local-proof">
                      {desktopLoadSyncSummary(selectedLoad)}
                    </div>
                  </>
                ) : (
                  <div className="empty-state editor-empty">
                    {pilotVisibleLoads.length
                      ? "Select a load from the table."
                      : "No load is available in this view."}
                  </div>
                )}
              </section>
            </section>
          </section>
        ) : null}

        {/* WASTE_X_DESKTOP_CREATE_JOB_PANEL_V1 */}
        {desktopView === "create" ? (
          <CreateJobPanel
            cloudReachable={Boolean(sync?.cloudReachable)}
            siteName={pilotSiteName}
            onCreated={async (created: DesktopCreatedJob) => {
              await refreshLocalState();
              setLoadView("live");
              setLoadQuery("");
              setSelectedLoadId(created.firstLoadId);
              setDesktopView("operations");
              setMessage(
                created.syncFeedWarning
                  ? `${created.job.jobNumber} created. The encrypted working set was refreshed, but one Cloud change-feed publication needs review.`
                  : `${created.job.jobNumber} created and added to site operations.`,
              );
            }}
          />
        ) : null}

        {desktopView === "cloud" ? (
          <section className="pilot-screen pilot-scroll-screen">
            <div className="pilot-page-heading">
              <div>
                <span className="eyebrow">Organisation records</span>
                <h1>Cloud records</h1>
                <p>
                  Search the wider{" "}
                  {cloudContext?.organisationName ?? "Waste X organisation"}{" "}
                  and inspect the captured operational history.
                </p>
              </div>
            </div>

            <form className="pilot-cloud-search" onSubmit={handleCloudSearch}>
              <input
                value={cloudQuery}
                onChange={(event) => setCloudQuery(event.target.value)}
                placeholder="Search job reference, status or direction…"
              />
              <button disabled={!sync?.cloudReachable || cloudBusy}>
                {cloudBusy ? "Searching…" : "Search records"}
              </button>
            </form>

            {!sync?.cloudReachable ? (
              <p className="pilot-connectivity-hint">Cloud archive search is available when connected.</p>
            ) : cloudCatalogue ? (
              <>
                <div className="pilot-record-counts">
                  <span><strong>{cloudCatalogue.totals.jobs}</strong> matching jobs</span>
                  <span><strong>{cloudHistory?.events.length ?? 0}</strong> selected history events</span>
                  <span><strong>{cloudHistory?.files.length ?? 0}</strong> attached files</span>
                </div>

                <div className="pilot-record-history-layout">
                  <section className="pilot-record-list-panel">
                    <div className="pilot-history-heading">
                      <div>
                        <span className="eyebrow">Records</span>
                        <h2>Jobs</h2>
                      </div>
                    </div>

                    <div className="pilot-record-job-list">
                      {cloudCatalogue.jobs.map((job) => {
                        const loadCount = cloudCatalogue.jobLoads.filter(
                          (load) => load.jobId === job.id,
                        ).length;

                        return (
                          <button
                            type="button"
                            key={job.id}
                            className={`pilot-record-job ${
                              cloudSelectedJobId === job.id ? "active" : ""
                            }`}
                            onClick={() => {
                              setCloudSelectedJobId(job.id);
                              void fetchCloudJobHistory(job.id);
                            }}
                          >
                            <strong>{job.jobNumber ?? job.id}</strong>
                            <span>
                              {shortDate(job.jobDate)} · {job.direction ?? "—"} ·{" "}
                              {job.status ?? "—"}
                            </span>
                            <small>
                              {loadCount} {loadCount === 1 ? "load" : "loads"}
                            </small>
                          </button>
                        );
                      })}

                      {!cloudCatalogue.jobs.length ? (
                        <div className="empty-state">No Cloud jobs matched.</div>
                      ) : null}
                    </div>

                    <div className="cloud-page-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={cloudBusy || cloudCatalogue.offset === 0}
                        onClick={() =>
                          void fetchCloudCatalogue(
                            cloudCatalogue.query,
                            Math.max(
                              0,
                              cloudCatalogue.offset - cloudCatalogue.limit,
                            ),
                          )
                        }
                      >
                        Previous
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={
                          cloudBusy ||
                          !cloudCatalogue.hasMoreJobs ||
                          cloudCatalogue.nextOffset === null
                        }
                        onClick={() =>
                          void fetchCloudCatalogue(
                            cloudCatalogue.query,
                            cloudCatalogue.nextOffset ?? 0,
                          )
                        }
                      >
                        Next
                      </button>
                    </div>
                  </section>

                  <section className="pilot-record-history-panel">
                    <div className="pilot-history-heading main">
                      <div>
                        <span className="eyebrow">Authoritative record</span>
                        <h2>
                          {cloudHistory?.job.jobNumber ??
                            (cloudSelectedJobId ? "Record history" : "Select a Job")}
                        </h2>
                        <p>
                          Captured Desktop, Mobile and canonical Cloud changes.
                        </p>
                      </div>

                      {cloudSelectedJobId ? (
                        <div className="pilot-history-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={cloudHistoryBusy}
                            onClick={() =>
                              void fetchCloudJobHistory(cloudSelectedJobId)
                            }
                          >
                            {cloudHistoryBusy ? "Refreshing…" : "Refresh"}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={!cloudHistory}
                            onClick={() => void copyCloudHistory()}
                          >
                            Copy JSON
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {cloudHistoryError ? (
                      <div className="pilot-history-error">{cloudHistoryError}</div>
                    ) : null}

                    {cloudHistoryBusy && !cloudHistory ? (
                      <div className="empty-state">Loading record history…</div>
                    ) : cloudHistory ? (
                      <>
                        <div className="pilot-history-current">
                          <span><b>Status</b> {cloudHistory.job.status ?? "—"}</span>
                          <span><b>Direction</b> {cloudHistory.job.direction ?? "—"}</span>
                          <span><b>Loads</b> {cloudHistory.loads.length}</span>
                          <span>
                            <b>Updated</b>{" "}
                            {cloudHistory.job.updatedAt
                              ? cloudHistoryTime(cloudHistory.job.updatedAt)
                              : "—"}
                          </span>
                        </div>

                        <div className="pilot-history-timeline">
                          {cloudHistory.events.map((event) => {
                            const summary = cloudHistorySummary(event.payload);

                            return (
                              <article
                                className={`pilot-history-event ${
                                  event.resultStatus === "REJECTED" ? "rejected" : ""
                                }`}
                                key={event.id}
                              >
                                <i />
                                <div>
                                  <div className="pilot-history-event-top">
                                    <div>
                                      <strong>{event.label}</strong>
                                      <span>
                                        {event.entityType === "job_load" &&
                                        event.loadNumber
                                          ? `Load ${event.loadNumber}`
                                          : "Job"}{" "}
                                        · {event.source}
                                      </span>
                                    </div>
                                    <time>{cloudHistoryTime(event.occurredAt)}</time>
                                  </div>

                                  <div className="pilot-history-meta">
                                    {event.actor ? (
                                      <span>
                                        Operator:{" "}
                                        {event.actor.name ??
                                          event.actor.email ??
                                          event.actor.id}
                                      </span>
                                    ) : null}
                                    {event.device ? (
                                      <span>Device: {event.device.displayName}</span>
                                    ) : null}
                                    {event.resultStatus ? (
                                      <span>Result: {event.resultStatus}</span>
                                    ) : null}
                                    {event.version !== null ? (
                                      <span>Version {event.version}</span>
                                    ) : null}
                                    {event.reasonCode ? (
                                      <span>Reason: {event.reasonCode}</span>
                                    ) : null}
                                  </div>

                                  {summary ? (
                                    <p className="pilot-history-summary">{summary}</p>
                                  ) : null}

                                  <details className="pilot-history-raw">
                                    <summary>Raw record data</summary>
                                    <pre>
                                      {JSON.stringify(event.payload, null, 2)}
                                    </pre>
                                  </details>
                                </div>
                              </article>
                            );
                          })}

                          {!cloudHistory.events.length ? (
                            <div className="empty-state">
                              No captured history is available for this record yet.
                            </div>
                          ) : null}
                        </div>

                        <section className="pilot-history-files">
                          <div className="pilot-history-heading">
                            <div>
                              <span className="eyebrow">Attached records</span>
                              <h3>Files / evidence</h3>
                            </div>
                            <span>{cloudHistory.files.length}</span>
                          </div>

                          {cloudHistory.files.length ? (
                            <div className="cloud-list">
                              {cloudHistory.files.map((file) => (
                                <div className="cloud-row" key={file.evidenceId}>
                                  <strong>{file.fileName}</strong>
                                  <span>{file.entityType} · {file.entityId}</span>
                                  <span>{fileSize(file.byteSize)} · {file.status}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="pilot-history-no-files">
                              No files are attached to this Job or its Loads.
                              Operational history remains available above.
                            </div>
                          )}
                        </section>

                        <p className="pilot-history-note">{cloudHistory.note}</p>
                      </>
                    ) : (
                      <div className="empty-state">
                        Select a Job to inspect its operational history.
                      </div>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <div className="empty-state">
                Search Waste X Cloud to load organisation records.
              </div>
            )}
          </section>
        ) : null}

        {/* WASTE_X_DESKTOP_MANAGE_TRANSPORT_V1 */}
        {desktopView === "manage" ? (
          <ManageTransportPanel
            cloudReachable={Boolean(sync?.cloudReachable)}
            onMasterDataChanged={async () => {
              await refreshLocalState();
            }}
          />
        ) : null}

        {/* WASTE_X_DESKTOP_SUPPORT_V1 */}

        {desktopView === "support" ? (

          <SupportPanel

            cloudReachable={Boolean(sync?.cloudReachable)}

          />

        ) : null}


        {desktopView === "settings" ? (
          <section className="pilot-screen pilot-scroll-screen">
            <div className="pilot-page-heading">
              <div>
                <span className="eyebrow">Workstation</span>
                <h1>Settings</h1>

                <p>
                  Workstation, offline and account controls. Daily site
                  operations stay separate from technical details.
                </p>
              </div>
            </div>

            <div className="pilot-settings-grid">
              <section className="pilot-setting-card">
                <span className="eyebrow">Workstation</span>

                <h2>
                  {cloudContext?.displayName ??
                    provisioning?.displayName ??
                    "Waste X Desktop"}
                </h2>

                <dl>
                  <div>
                    <dt>Organisation</dt>
                    <dd>
                      {cloudContext?.organisationName ??
                        cloudContext?.organisationId ??
                        "—"}
                    </dd>
                  </div>

                  <div>
                    <dt>Site</dt>
                    <dd>{pilotSiteName}</dd>
                  </div>

                  <div>
                    <dt>Offline working set</dt>
                    <dd>
                      {shortDate(
                        cloudContext?.horizonStart ?? null,
                      )}{" "}
                      →{" "}
                      {shortDate(
                        cloudContext?.horizonEnd ?? null,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Last refreshed</dt>
                    <dd>
                      {shortTime(
                        cloudContext?.lastBootstrapAt ?? null,
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="pilot-setting-card">
                <span className="eyebrow">Sync & offline</span>

                <h2>
                  {sync?.cloudReachable
                    ? "Connected"
                    : "Working offline"}
                </h2>

                <dl>
                  <div>
                    <dt>Queued changes</dt>
                    <dd>
                      {(sync?.pending ?? 0) +
                        (sync?.retryableFailed ?? 0)}
                    </dd>
                  </div>

                  <div>
                    <dt>Review required</dt>
                    <dd>{syncProblems}</dd>
                  </div>

                  <div>
                    <dt>Offline access</dt>
                    <dd>
                      {auth.offlineDaysRemaining} days remaining
                    </dd>
                  </div>

                  <div>
                    <dt>Last sync</dt>
                    <dd>
                      {shortTime(sync?.lastSuccessAt ?? null)}
                    </dd>
                  </div>
                </dl>

                <div className="pilot-setting-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={syncBusy}
                    onClick={() => void syncNow(true)}
                  >
                    {syncBusy || sync?.running
                      ? "Syncing…"
                      : "Sync now"}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      busy || !sync?.cloudReachable
                    }
                    onClick={() =>
                      run(
                        () =>
                          invoke(
                            "desktop_refresh_bootstrap",
                          ),
                        "Cloud working set refreshed.",
                      )
                    }
                  >
                    Refresh working set
                  </button>
                </div>
              </section>

              <section
                className={`pilot-setting-card ${
                  syncProblems > 0 ? "needs-review" : ""
                }`}
              >
                <span className="eyebrow">Sync review</span>

                <h2>
                  {syncProblems > 0
                    ? `${syncProblems} ${
                        syncProblems === 1 ? "item" : "items"
                      } need attention`
                    : "No review items"}
                </h2>

                <p>
                  {syncProblems > 0
                    ? "Waste X kept the affected records safely. Normal site operations can continue. Use Details in the status bar to inspect the exact review item."
                    : "No conflicts or rejected sync events currently require attention."}
                </p>
              </section>

              <section className="pilot-setting-card">
                <span className="eyebrow">Account</span>

                <h2>{auth.email ?? "Signed-in operator"}</h2>

                <p>
                  Use Lock Desktop for normal workstation security.
                  Signing out removes this user's offline authority and
                  requires Cloud for the next password sign-in.
                </p>

                {signOutArmed ? (
                  <div className="pilot-signout-confirm">
                    <strong>
                      Sign out of this workstation?
                    </strong>

                    <span>
                      The workstation stays registered, but this user's
                      offline authority will be removed.
                    </span>

                    <div>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => {
                          setSignOutArmed(false);
                          setMessage(null);
                        }}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="danger-button"
                        disabled={busy}
                        onClick={() =>
                          void handleSignOut()
                        }
                      >
                        {busy
                          ? "Signing out…"
                          : "Confirm sign out"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="pilot-signout-button"
                    disabled={busy}
                    onClick={() => {
                      setSignOutArmed(true);
                      setMessage(null);
                    }}
                  >
                    Sign out…
                  </button>
                )}
              </section>

              <section className="pilot-setting-card pilot-diagnostics">
                <details>
                  <summary>Advanced diagnostics</summary>

                  <dl>
                    <div>
                      <dt>Local storage</dt>
                      <dd>
                        {database?.ready &&
                        database?.encrypted
                          ? "Encrypted and ready"
                          : "Starting"}
                      </dd>
                    </div>

                    <div>
                      <dt>Database schema</dt>
                      <dd>
                        {database?.schemaVersion ?? "—"}
                      </dd>
                    </div>

                    <div>
                      <dt>Cloud environment</dt>
                      <dd>
                        {cloudContext?.environment ?? "—"}
                      </dd>
                    </div>

                    <div>
                      <dt>Cloud endpoint</dt>
                      <dd>
                        {cloudContext?.baseUrl ?? "—"}
                      </dd>
                    </div>

                    <div>
                      <dt>Sync cursor</dt>
                      <dd>{sync?.cursor ?? "—"}</dd>
                    </div>
                  </dl>
                </details>
              </section>
            </div>
          </section>
        ) : null}

        {selectedLoad ? (
          <RejectLoadModal
            open={
              rejectModalOpen &&
              selectedLoad.status === "arrived"
            }
            jobNumber={selectedLoad.jobNumber}
            loadNumber={selectedLoad.loadNumber}
            busy={busy}
            onClose={() => setRejectModalOpen(false)}
            onConfirm={rejectLoad}
          />
        ) : null}

        {message ? (
          <div className="pilot-action-toast neutral" role="status" aria-live="polite">
            <div><strong>Waste X</strong><span>{message}</span></div>
            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">×</button>
          </div>
        ) : null}
      </main>
    );
  }


  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Waste X Desktop</span>
          <h1>{locked ? "Waste X is locked." : "Local-first operations."}</h1>
          <p>Driver Mobile records transport arrival. The receiving site controls acceptance/rejection, weights, completion and the final site ticket.</p>
        </div>
        {auth?.unlocked ? (
          <div className="top-actions">
            <button
              className="secondary-button"
              disabled={syncBusy}
              onClick={() => void syncNow(true)}
            >
              {syncBusy || sync?.running ? "Syncing…" : "Sync now"}
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={handleLock}
            >
              Lock Desktop
            </button>
            {signOutArmed ? (
              <>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    setSignOutArmed(false);
                    setMessage(null);
                  }}
                >
                  Cancel
                </button>

                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void handleSignOut()}
                >
                  {busy ? "Signing out…" : "Confirm sign out"}
                </button>
              </>
            ) : (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setSignOutArmed(true);
                  setMessage(
                    "Sign out removes this user's offline authority. Lock Desktop instead if you want this workstation to remain usable while Waste X Cloud is unavailable.",
                  );
                }}
              >
                Sign out
              </button>
            )}
          </div>
        ) : null}
      </header>

      <section className="status-grid">
        <article><strong>Local database</strong><span>{database?.ready ? `Encrypted · schema v${database.schemaVersion}` : "Starting…"}</span></article>
        <article><strong>Authentication</strong><span>{auth?.unlocked ? `${auth.mode} unlocked` : provisioning?.provisioned ? "Locked" : "Not provisioned"}</span></article>
        <article><strong>Cloud</strong><span>{!auth?.unlocked ? "Protected" : `${cloudContext?.environment ?? "Unknown"} · ${sync?.cloudReachable ? "Connected" : "Offline"}`}</span></article>
        <article><strong>Sync outbox</strong><span>{sync ? `${sync.pending} pending · ${sync.retryableFailed} retrying · ${syncProblems} review` : "Protected"}</span></article>
      </section>

      {!provisioning?.provisioned ? (
        <section className="panel auth-panel">
          <span className="eyebrow">Set up Waste X Desktop</span>
          <h2>Connect this workstation to Waste X.</h2>
          <p className="small-copy">
            Sign in first. Waste X will detect your organisation and available
            operating sites before this workstation is registered.
          </p>

          {!provisionOptions ? (
            <form className="form-grid" onSubmit={handleProvisionCheck}>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setProvisionOptions(null);
                    setSelectedSiteId("");
                  }}
                  required
                  autoFocus
                />
              </label>

              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setProvisionOptions(null);
                    setSelectedSiteId("");
                  }}
                  required
                />
              </label>

              <button disabled={busy}>
                {busy ? "Checking…" : "Continue"}
              </button>
            </form>
          ) : (
            <>
              <div className="empty-state">
                <strong>{provisionOptions.organisation.name}</strong>
                <span>
                  {provisionOptions.sites.length > 0
                    ? `${provisionOptions.sites.length} active site${provisionOptions.sites.length === 1 ? "" : "s"} available`
                    : "No active operating sites are available"}
                </span>
              </div>

              <form className="form-grid" onSubmit={handleProvision}>
                <label className="wide">
                  <span>Operating site</span>
                  <select
                    value={selectedSiteId}
                    onChange={(event) => setSelectedSiteId(event.target.value)}
                    required
                  >
                    <option value="">Choose site…</option>
                    {provisionOptions.sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                        {site.isDefault ? " · Default" : ""}
                        {site.postcode ? ` · ${site.postcode}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="wide">
                  <span>Workstation name</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    required
                  />
                </label>

                <div className="wide top-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      setProvisionOptions(null);
                      setSelectedSiteId("");
                    }}
                  >
                    Back
                  </button>

                  <button
                    disabled={busy || !selectedSiteId}
                  >
                    {busy
                      ? "Registering…"
                      : "Register & open Waste X"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      ) : !auth?.unlocked ? (
        <section className="panel auth-panel">
          <span className="eyebrow">Secure workstation</span>
          <h2>Unlock Waste X Desktop.</h2>
          <p className="small-copy">
            {provisioning.defaultSiteName
              ? `${provisioning.defaultSiteName} · `
              : ""}
            Enter your Waste X password. If Cloud cannot be reached, a valid
            encrypted offline entitlement can unlock this workstation.
          </p>

          <form className="form-grid" onSubmit={handleUnlock}>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoFocus
              />
            </label>

            <button disabled={busy}>
              {busy ? "Checking…" : "Unlock Waste X"}
            </button>
          </form>

          {auth?.canOffline ? (
            <p className="small-copy">
              Offline access ready · {auth.offlineDaysRemaining} day
              {auth.offlineDaysRemaining === 1 ? "" : "s"} remaining.
            </p>
          ) : null}
        </section>
      ) : (
        <>
          <section className={`sync-strip ${sync?.cloudReachable ? "online" : "offline"} ${syncProblems > 0 ? "problem" : ""}`}>
            <div><strong>{cloudContext?.environment ?? (sync?.cloudReachable ? "Cloud connected" : "Local operations active")}</strong><span>{cloudContext?.baseUrl ?? "Cloud endpoint unavailable"} · {cloudContext?.organisationName ?? cloudContext?.organisationId ?? "Organisation unknown"}</span><span>{sync?.authRequired ? "Cloud session needs an online sign-in before queued work can upload." : sync?.lastError ? sync.lastError : sync?.cloudReachable ? `Last successful sync ${shortTime(sync.lastSuccessAt)}.` : "Waste X will retry automatically every 15 seconds while this Desktop is unlocked."}</span></div>
            <div className="sync-metrics"><span><strong>{sync?.pending ?? 0}</strong> pending</span><span><strong>{sync?.retryableFailed ?? 0}</strong> retrying</span><span><strong>{syncProblems}</strong> review</span><span>cursor {sync?.cursor ?? "—"}</span></div>
          </section>

          <section className="environment-strip">
            <span>
              <strong>Device</strong>{" "}
              {cloudContext?.displayName ?? provisioning?.displayName ?? "—"}
            </span>
            <span>
              <strong>Organisation</strong>{" "}
              {cloudContext?.organisationName ??
                cloudContext?.organisationId ??
                "—"}
            </span>
            <span>
              <strong>Site</strong>{" "}
              {cloudContext?.defaultSiteName ??
                provisioning?.defaultSiteName ??
                cloudContext?.defaultSiteId ??
                provisioning?.defaultSiteId ??
                "—"}
            </span>
            <span>
              <strong>Offline working set</strong>{" "}
              {shortDate(cloudContext?.horizonStart ?? null)} →{" "}
              {shortDate(cloudContext?.horizonEnd ?? null)}
            </span>
            <span>
              <strong>Last bootstrap</strong>{" "}
              {shortTime(cloudContext?.lastBootstrapAt ?? null)}
            </span>
          </section>

          <section className="cloud-catalogue">
            {/* WASTE_X_DESKTOP_LOCAL_RECORDS_PANEL_V1 */}
            <RecordsPanel
              cloudReachable={Boolean(sync?.cloudReachable)}
            />

            <div className="cloud-catalogue-heading"><div><span className="eyebrow">Organisation Cloud Access</span><h2>Whole-account view when connected</h2><p className="small-copy">Historical Cloud records stay searchable without bloating the guaranteed offline cache. Operational writes still hydrate into SQLite first.</p></div><form className="cloud-search" onSubmit={handleCloudSearch}><input value={cloudQuery} onChange={(e) => setCloudQuery(e.target.value)} placeholder="Search job number, status or direction" /><button disabled={!sync?.cloudReachable || cloudBusy}>{cloudBusy ? "Searching…" : "Search Cloud"}</button></form></div>
            {!sync?.cloudReachable ? <p className="pilot-connectivity-hint">Cloud archive search is available when connected.</p> : cloudCatalogue ? (
              <><div className="cloud-totals"><span><strong>{cloudCatalogue.totals.jobs}</strong> matching organisation jobs</span><span><strong>{cloudCatalogue.totals.evidence}</strong> matching evidence files</span><span>Showing up to {cloudCatalogue.limit} at a time</span></div><div className="cloud-columns"><div><h3>Cloud jobs</h3><div className="cloud-list">{cloudCatalogue.jobs.map((job) => { const loadCount = cloudCatalogue.jobLoads.filter((load) => load.jobId === job.id).length; return <div className="cloud-row" key={job.id}><strong>{job.jobNumber ?? job.id}</strong><span>{job.direction ?? "—"} · {job.status ?? "—"} · {shortDate(job.jobDate)}</span><span>{loadCount} load{loadCount === 1 ? "" : "s"} on this page</span></div>; })}{!cloudCatalogue.jobs.length ? <div className="empty-state">No Cloud jobs matched.</div> : null}</div><div className="cloud-page-actions"><button className="secondary-button" disabled={cloudBusy || cloudCatalogue.offset === 0} onClick={() => void fetchCloudCatalogue(cloudCatalogue.query, Math.max(0, cloudCatalogue.offset - cloudCatalogue.limit))}>Previous</button><button className="secondary-button" disabled={cloudBusy || !cloudCatalogue.hasMoreJobs || cloudCatalogue.nextOffset === null} onClick={() => void fetchCloudCatalogue(cloudCatalogue.query, cloudCatalogue.nextOffset ?? 0)}>Next</button></div></div><div><h3>Cloud evidence</h3><div className="cloud-list">{cloudCatalogue.evidence.map((file) => <div className="cloud-row" key={file.evidenceId}><strong>{file.fileName}</strong><span>{file.entityType} · {file.entityId}</span><span>{fileSize(file.byteSize)} · {file.status}</span></div>)}{!cloudCatalogue.evidence.length ? <div className="empty-state">No evidence metadata matched.</div> : null}</div></div></div></>
            ) : <div className="empty-state">Connect to Cloud to load the organisation catalogue.</div>}
          </section>

          <section className="operations-header"><div><span className="eyebrow">Daily Operations · Offline Guaranteed</span><h2>{summary?.jobLoads ?? 0} local loads ready</h2></div><div className="ops-meta"><span>{summary?.jobs ?? 0} jobs</span><span>{operations?.pendingEvents ?? 0} local events</span><button className="secondary-button" disabled={busy || !sync?.cloudReachable} onClick={() => run(() => invoke("desktop_refresh_bootstrap"), "Cloud working set reconciled with encrypted SQLite.")}>Reconcile working set</button></div></section>

          <section className="load-view-tabs" aria-label="Load views">
            {([
              ["live", "Live", loadCounts.live],
              ["rejected", "Rejected", loadCounts.rejected],
              ["completed", "Completed", loadCounts.completed],
              ["cancelled", "Cancelled", loadCounts.cancelled],
            ] as Array<[LoadView, string, number]>).map(([value, label, count]) => (
              <button
                type="button"
                key={value}
                className={loadView === value ? "active" : ""}
                onClick={() => setLoadView(value)}
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </section>

          <section className="operations-layout">
            <div className="load-list">
              {visibleLoads.map((load) => <button key={load.id} className={`load-row ${selectedLoadId === load.id ? "selected" : ""}`} onClick={() => setSelectedLoadId(load.id)}><div className="load-title"><strong>{load.jobNumber || "Job"} · Load {load.loadNumber ?? "—"}</strong><span className={`status-pill status-${load.status}`}>{load.status}</span></div><span>{load.direction} · {load.jobDate ?? "No date"} · {load.ewcCode ?? "No EWC"}</span><span>{load.wasteDescription || "Waste description required"}</span><span className="load-foot">Net {load.netWeight ?? "—"} {load.weightMetric}{load.ticketNumber ? ` · Ticket ${load.ticketNumber}` : load.status === "completed" ? " · Site ticket ready" : ""}{load.pendingEvents > 0 ? ` · ${load.pendingEvents} local change${load.pendingEvents === 1 ? "" : "s"}` : ""}</span></button>)}
              {!visibleLoads.length ? <div className="empty-state">No {loadView} loads are cached on this Desktop.</div> : null}
            </div>

            <div className="load-editor">
              {selectedLoad && edit ? (
                <>
                  <div className="editor-heading"><div><span className="eyebrow">Selected load</span><h3>{selectedLoad.jobNumber} · Load {selectedLoad.loadNumber ?? "—"}</h3></div><span className={`status-pill status-${selectedLoad.status}`}>{selectedLoad.status}</span></div>

                  {selectedLoad.status === "rejected" ? (
                    <div className="site-rejection-record">
                      <span>REJECTION RECORD</span>
                      <strong>{rejection?.authority === "DRIVER" ? "Driver refused collection" : "Receiving site rejected load"}</strong>
                      <b>{rejection?.categoryLabel ?? "Reason recorded in load notes"}</b>
                      <p>{rejection?.reason ?? "Open the notes below to review the recorded rejection detail."}</p>
                      <small>This load is terminal and cannot receive a normal completed-load ticket.</small>
                    </div>
                  ) : null}

                  <form className="editor-form" onSubmit={saveDetails}>
                    <label className="pilot-quick-select-field">
                      <span className="pilot-quick-select-heading">
                        <span>Driver</span>
                        <button
                          type="button"
                          disabled={
                            selectedTerminal ||
                            busy
                          }
                          title="Create a Driver for this Load's carrier"
                          onClick={() => setQuickTransportKind("driver")}
                        >
                          + Add
                        </button>
                      </span>
                      <select
                        disabled={selectedTerminal}
                        value={edit.driverId}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            driverId: e.target.value,
                          })
                        }
                      >
                        <option value="">Select driver</option>
                        {availableDrivers.map((driver) => (
                          <option key={driver.id} value={driver.id}>
                            {driver.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="pilot-quick-select-field">
                      <span className="pilot-quick-select-heading">
                        <span>Vehicle</span>
                        <button
                          type="button"
                          disabled={
                            selectedTerminal ||
                            busy
                          }
                          title="Create a Vehicle for this Load's carrier"
                          onClick={() => setQuickTransportKind("vehicle")}
                        >
                          + Add
                        </button>
                      </span>
                      <select
                        disabled={selectedTerminal}
                        value={edit.vehicleId}
                        onChange={(e) =>
                          void handleVehicleChange(e.target.value)
                        }
                      >
                        <option value="">Select vehicle</option>
                        {availableVehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="wide"><span>Waste description</span><input disabled={selectedTerminal} value={edit.wasteDescription} onChange={(e) => setEdit({ ...edit, wasteDescription: e.target.value })} /></label>
                    <label><span>Gross · weighbridge reading</span><input disabled={selectedTerminal || incomingWeightLocked} inputMode="decimal" value={edit.grossWeight} onChange={(e) => { const grossWeight = e.target.value; setEdit({ ...edit, grossWeight, netWeight: calculatedNetWeight(grossWeight, edit.tareWeight) }); }} /></label>
                    <label><span>Tare · editable</span><input disabled={selectedTerminal || incomingWeightLocked} inputMode="decimal" value={edit.tareWeight} onChange={(e) => { const tareWeight = e.target.value; setTareSource("MANUAL"); setEdit({ ...edit, tareWeight, netWeight: calculatedNetWeight(edit.grossWeight, tareWeight) }); }} /><small className="small-copy">{tareSource === "VEHICLE_MASTER" ? "Loaded from the selected vehicle's stored tare." : tareSource === "LOAD" ? "Using the tare already saved on this load." : tareSource === "MANUAL" ? "Operator-adjusted tare for this load." : "No stored vehicle tare — enter the actual tare."}</small></label>
                    <label><span>Net · calculated</span><input readOnly inputMode="decimal" value={edit.netWeight} /><small className="small-copy">Gross − tare. Waste X recalculates this automatically.</small></label>
                    <label><span>Metric</span><select disabled={selectedTerminal || incomingWeightLocked} value={edit.weightMetric} onChange={(e) => handleMetricChange(e.target.value as WeightMetric)}><option>Tonnes</option><option>Kilograms</option><option>Grams</option></select></label>
                    {incomingWeightLocked && !selectedTerminal ? <p className="wide small-copy">Weight entry unlocks after the Driver reaches the destination and the load is handed to the receiving site.</p> : null}
                    <label className="wide"><span>Site ticket</span><input disabled value={selectedLoad.ticketNumber ?? (selectedLoad.status === "completed" ? "Ready to generate below" : selectedLoad.status === "rejected" ? "Not issued for rejected loads" : "Available after site completion")} /></label>
                    <label className="wide"><span>Notes</span><textarea disabled={selectedTerminal} rows={3} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
                    <button disabled={busy || selectedTerminal}>Save site details</button>
                  </form>

                  <div className="action-row">
                    {selectedLoad.direction === "incoming" && selectedLoad.status === "planned" && selectedLoad.haulierCounterpartyId ? <button disabled={busy} onClick={() => loadAction("desktop_mark_load_arrived", "External-haulier arrival recorded locally and queued for sync.")}>Mark external carrier arrived</button> : null}
                    {selectedLoad.direction === "incoming" && selectedLoad.status === "planned" && !selectedLoad.haulierCounterpartyId ? (
                      <div className="wide">
                        <p className="small-copy">Waiting for the assigned Driver to mark Arrived at destination on Mobile.</p>
                        <details className="ticket-waiting-card">
                          <summary>Driver cannot use Mobile?</summary>
                          <div className="inline-form-grid">
                            <label>
                              <span>Fallback reason</span>
                              <select value={manualArrivalReason} onChange={(event) => setManualArrivalReason(event.target.value as ManualArrivalReason | "")}>
                                <option value="">Choose reason</option>
                                <option value="DRIVER_NO_MOBILE_ACCESS">Driver has no Mobile access</option>
                                <option value="DRIVER_DEVICE_UNAVAILABLE">Driver phone / device unavailable</option>
                                <option value="CONNECTIVITY_ISSUE">Connectivity issue</option>
                                <option value="SITE_CONFIRMED_PHYSICAL_ARRIVAL">Site confirmed physical arrival</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </label>
                            <label><span>Note</span><textarea rows={2} maxLength={2000} value={manualArrivalNote} onChange={(event) => setManualArrivalNote(event.target.value)} /></label>
                            <label className="desktop-inline-check"><input type="checkbox" checked={manualArrivalConfirmed} onChange={(event) => setManualArrivalConfirmed(event.target.checked)} />I confirm physical arrival at this site.</label>
                            <button type="button" disabled={busy || !manualArrivalConfirmed || !manualArrivalReason} onClick={() => void manualArriveSelectedLoad()}>Confirm manual arrival</button>
                          </div>
                        </details>
                      </div>
                    ) : null}
                    {selectedLoad.direction === "incoming" && selectedLoad.status === "arrived" ? <button disabled={busy} onClick={() => loadAction("desktop_accept_load", "Load accepted locally and queued for sync.")}>Accept</button> : null}
                    {selectedLoad.direction === "incoming" && selectedLoad.status === "arrived" ? <button className="danger-button" disabled={busy} onClick={() => setRejectModalOpen(true)}>Reject load</button> : null}
                    {((selectedLoad.direction === "incoming" && selectedLoad.status === "accepted") || (selectedLoad.direction === "outgoing" && !["completed", "rejected", "cancelled"].includes(selectedLoad.status))) ? <button disabled={busy} onClick={() => void completeSelectedLoad()}>Finalise weights + Complete Load</button> : null}
                  </div>

                  {selectedLoad.status === "completed" || selectedLoad.ticketNumber ? <TicketPanel loadId={selectedLoad.id} disabled={busy} onChanged={refreshLocalState} /> : null}

                  <div className="local-proof">Entity version {selectedLoad.entityVersion} · {selectedLoad.pendingEvents} unsynced local event{selectedLoad.pendingEvents === 1 ? "" : "s"}</div>
                </>
              ) : <div className="empty-state editor-empty">Select a load to operate it from encrypted local storage.</div>}
            </div>
          </section>
        </>
      )}

      {quickTransportKind && selectedLoad ? (
        <QuickAddTransportModal
          open
          kind={quickTransportKind}
          jobNumber={selectedLoad.jobNumber}
          loadNumber={selectedLoad.loadNumber}
          haulierCounterpartyId={
            selectedLoad.haulierCounterpartyId
          }
          onClose={() => setQuickTransportKind(null)}
          onCreated={handleQuickTransportCreated}
        />
      ) : null}

      {selectedLoad ? (
        <RejectLoadModal
          open={rejectModalOpen && selectedLoad.status === "arrived"}
          jobNumber={selectedLoad.jobNumber}
          loadNumber={selectedLoad.loadNumber}
          busy={busy}
          onClose={() => setRejectModalOpen(false)}
          onConfirm={rejectLoad}
        />
      ) : null}
      {message ? <div className="toast">{message}</div> : null}
    </main>
  );
}
