import { invoke } from "@tauri-apps/api/core";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { RejectLoadModal, type SiteRejectionCategory } from "./RejectLoadModal";
import { TicketPanel } from "./TicketPanel";

type LocalDbStatus = { ready: boolean; encrypted: boolean; schemaVersion: number; cipherVersion: string; tableCount: number };
type ProvisioningStatus = { provisioned: boolean; deviceId: string | null; organisationId: string | null; displayName: string | null };
type AuthStatus = { unlocked: boolean; canOffline: boolean; email: string | null; mode: "ONLINE" | "OFFLINE" | null; offlineExpiresAt: string | null; offlineDaysRemaining: number };
type OperationalSummary = { jobs: number; jobLoads: number; pendingSyncEvents: number; conflicts: number };
type OpsReference = { id: string; label: string; haulierCounterpartyId: string | null };
type WeightMetric = "Grams" | "Kilograms" | "Tonnes";
type TareSource = "LOAD" | "VEHICLE_MASTER" | "MANUAL" | null;
type VehicleTareResult = { vehicleId: string; tareWeightKg: number | null };
type LoadView = "live" | "rejected" | "completed" | "cancelled";

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
  grossWeight: string | null;
  tareWeight: string | null;
  netWeight: string | null;
  weightMetric: string;
  ticketNumber: string | null;
  notes: string | null;
  entityVersion: number;
  pendingEvents: number;
};

type DailyOperationsSnapshot = { loads: DailyLoad[]; drivers: OpsReference[]; vehicles: OpsReference[]; pendingEvents: number; conflicts: number };
type DesktopSyncStatus = { running: boolean; cloudReachable: boolean; authRequired: boolean; lastAttemptAt: string | null; lastSuccessAt: string | null; lastError: string | null; cursor: string | null; pending: number; retryableFailed: number; permanentFailed: number; conflicts: number; deferredRemoteChanges: number };
type DesktopSyncRunResult = { status: DesktopSyncStatus; pushedApplied: number; pushedDuplicates: number; pushedConflicts: number; pushedFailed: number; pulledChanges: number; deferredRemoteChanges: number };
type UnlockResult = { ok: boolean; mode: "ONLINE" | "OFFLINE" };
type CloudContext = { baseUrl: string; environment: string; organisationId: string | null; organisationName: string | null; deviceId: string | null; displayName: string | null; horizonStart: string | null; horizonEnd: string | null; lastBootstrapAt: string | null };
type CloudJob = { id: string; jobNumber: string | null; jobDate: string | null; direction: string | null; status: string | null };
type CloudLoad = { id: string; jobId: string; loadNumber: number | null; direction: string | null; status: string | null };
type CloudEvidence = { evidenceId: string; entityType: string; entityId: string; fileName: string; contentType: string; byteSize: number; status: string; uploadedAt: string | null; createdAt: string | null };
type CloudCatalogue = { organisation: { id: string; teamName: string | null; status: string | null } | null; query: string; offset: number; limit: number; totals: { jobs: number; evidence: number }; jobs: CloudJob[]; jobLoads: CloudLoad[]; evidence: CloudEvidence[]; hasMoreJobs: boolean; nextOffset: number | null };

type EditState = {
  driverId: string;
  vehicleId: string;
  wasteDescription: string;
  grossWeight: string;
  tareWeight: string;
  netWeight: string;
  weightMetric: WeightMetric;
  notes: string;
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
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [loadView, setLoadView] = useState<LoadView>("live");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [tareSource, setTareSource] = useState<TareSource>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("Waste X Desktop — Mac");
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
      setSummary(null); setOperations(null); setSync(null); setCloudContext(null); setCloudCatalogue(null); setSelectedLoadId(null); setEdit(null); setTareSource(null);
    }
  }

  async function fetchCloudCatalogue(query = cloudQuery, offset = 0) {
    if (!auth?.unlocked) return;
    setCloudBusy(true);
    try {
      setCloudCatalogue(await invoke<CloudCatalogue>("desktop_cloud_catalogue", { input: { query, offset, limit: 50 } }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setCloudBusy(false); }
  }

  async function syncNow(showToast = true) {
    if (syncLoopActive.current) return;
    syncLoopActive.current = true;
    setSyncBusy(true);
    try {
      const result = await invoke<DesktopSyncRunResult>("desktop_sync_now");
      setSync(result.status);
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
    if (auth?.unlocked && sync?.cloudReachable && !cloudCatalogue && !cloudBusy) void fetchCloudCatalogue("", 0);
  }, [auth?.unlocked, sync?.cloudReachable]);

  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage(null);
    try { await task(); await refreshLocalState(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function handleProvision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await invoke("desktop_provision_and_bootstrap", { input: { email, password, displayName } });
      await invoke<UnlockResult>("desktop_unlock", { input: { email, password } });
      setPassword("");
    }, "This Mac is provisioned and the operational working set is stored locally.");
  }

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result = await invoke<UnlockResult>("desktop_unlock", { input: { email, password } });
      setPassword("");
      if (result.mode === "ONLINE") await invoke("desktop_refresh_bootstrap");
      await refreshLocalState();
      setMessage(result.mode === "OFFLINE"
        ? "Cloud is unavailable — Waste X unlocked offline from encrypted local data."
        : "Cloud sign-in verified. Working set reconciled and offline access refreshed for 14 days.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function handleLock() { await invoke("desktop_lock"); setMessage(null); await refreshLocalState(); }

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
    };
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLoad || !edit) return;
    await run(
      () => invoke("desktop_save_load_details", { input: loadDetailsInput(selectedLoad, edit) }),
      "Site details saved locally and queued for Cloud sync.",
    );
  }

  async function completeSelectedLoad() {
    if (!selectedLoad || !edit) return;
    const netWeight = calculatedNetWeight(edit.grossWeight, edit.tareWeight);
    const net = Number(netWeight);
    if (!netWeight || !Number.isFinite(net) || net <= 0) {
      setMessage("Enter a gross weight above tare. Waste X calculates the positive net weight automatically before completion.");
      return;
    }

    await run(async () => {
      /* Completion finalises the values currently visible to the operator.
       * They no longer need to press Save site details before Complete Load. */
      await invoke("desktop_save_load_details", { input: loadDetailsInput(selectedLoad, edit) });
      await invoke("desktop_complete_load", { input: { loadId: selectedLoad.id } });
    }, "Site weights finalised and load completed locally. The receiving-site ticket can now be generated.");
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
    });
  }

  async function loadAction(command: string, success: string) {
    if (!selectedLoad) return;
    await run(() => invoke(command, { input: { loadId: selectedLoad.id } }), success);
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

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Waste X Desktop</span>
          <h1>{locked ? "Waste X is locked." : "Local-first operations."}</h1>
          <p>Driver Mobile records transport arrival. The receiving site controls acceptance/rejection, weights, completion and the final site ticket.</p>
        </div>
        {auth?.unlocked ? <div className="top-actions"><button className="secondary-button" disabled={syncBusy} onClick={() => void syncNow(true)}>{syncBusy || sync?.running ? "Syncing…" : "Sync now"}</button><button className="secondary-button" onClick={handleLock}>Lock Desktop</button></div> : null}
      </header>

      <section className="status-grid">
        <article><strong>Local database</strong><span>{database?.ready ? `Encrypted · schema v${database.schemaVersion}` : "Starting…"}</span></article>
        <article><strong>Authentication</strong><span>{auth?.unlocked ? `${auth.mode} unlocked` : provisioning?.provisioned ? "Locked" : "Not provisioned"}</span></article>
        <article><strong>Cloud</strong><span>{!auth?.unlocked ? "Protected" : `${cloudContext?.environment ?? "Unknown"} · ${sync?.cloudReachable ? "Connected" : "Offline"}`}</span></article>
        <article><strong>Sync outbox</strong><span>{sync ? `${sync.pending} pending · ${sync.retryableFailed} retrying · ${syncProblems} review` : "Protected"}</span></article>
      </section>

      {!provisioning?.provisioned ? (
        <section className="panel"><span className="eyebrow">Initial provisioning</span><h2>Connect this Mac to Waste X.</h2><form className="form-grid" onSubmit={handleProvision}><label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><label className="wide"><span>Desktop name</span><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label><button disabled={busy}>{busy ? "Provisioning…" : "Provision this Mac"}</button></form></section>
      ) : !auth?.unlocked ? (
        <section className="panel auth-panel"><span className="eyebrow">Secure unlock</span><h2>Sign in to Waste X Desktop.</h2><p className="small-copy">If Cloud cannot be reached, Waste X validates against the encrypted offline entitlement instead.</p><form className="form-grid" onSubmit={handleUnlock}><label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></label><button disabled={busy}>{busy ? "Checking…" : "Unlock Waste X"}</button></form></section>
      ) : (
        <>
          <section className={`sync-strip ${sync?.cloudReachable ? "online" : "offline"} ${syncProblems > 0 ? "problem" : ""}`}>
            <div><strong>{cloudContext?.environment ?? (sync?.cloudReachable ? "Cloud connected" : "Local operations active")}</strong><span>{cloudContext?.baseUrl ?? "Cloud endpoint unavailable"} · {cloudContext?.organisationName ?? cloudContext?.organisationId ?? "Organisation unknown"}</span><span>{sync?.authRequired ? "Cloud session needs an online sign-in before queued work can upload." : sync?.lastError ? sync.lastError : sync?.cloudReachable ? `Last successful sync ${shortTime(sync.lastSuccessAt)}.` : "Waste X will retry automatically every 15 seconds while this Desktop is unlocked."}</span></div>
            <div className="sync-metrics"><span><strong>{sync?.pending ?? 0}</strong> pending</span><span><strong>{sync?.retryableFailed ?? 0}</strong> retrying</span><span><strong>{syncProblems}</strong> review</span><span>cursor {sync?.cursor ?? "—"}</span></div>
          </section>

          <section className="environment-strip"><span><strong>Device</strong> {cloudContext?.displayName ?? provisioning?.displayName ?? "—"}</span><span><strong>Organisation</strong> {cloudContext?.organisationName ?? cloudContext?.organisationId ?? "—"}</span><span><strong>Offline working set</strong> {shortDate(cloudContext?.horizonStart ?? null)} → {shortDate(cloudContext?.horizonEnd ?? null)}</span><span><strong>Last bootstrap</strong> {shortTime(cloudContext?.lastBootstrapAt ?? null)}</span></section>

          <section className="cloud-catalogue">
            <div className="cloud-catalogue-heading"><div><span className="eyebrow">Organisation Cloud Access</span><h2>Whole-account view when connected</h2><p className="small-copy">Historical Cloud records stay searchable without bloating the guaranteed offline cache. Operational writes still hydrate into SQLite first.</p></div><form className="cloud-search" onSubmit={handleCloudSearch}><input value={cloudQuery} onChange={(e) => setCloudQuery(e.target.value)} placeholder="Search job number, status or direction" /><button disabled={!sync?.cloudReachable || cloudBusy}>{cloudBusy ? "Searching…" : "Search Cloud"}</button></form></div>
            {!sync?.cloudReachable ? <div className="cloud-offline-note">Cloud catalogue unavailable offline. The local operational working set below remains fully usable.</div> : cloudCatalogue ? (
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
                    <label><span>Driver</span><select disabled={selectedTerminal} value={edit.driverId} onChange={(e) => setEdit({ ...edit, driverId: e.target.value })}><option value="">Select driver</option>{availableDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.label}</option>)}</select></label>
                    <label><span>Vehicle</span><select disabled={selectedTerminal} value={edit.vehicleId} onChange={(e) => void handleVehicleChange(e.target.value)}><option value="">Select vehicle</option>{availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</select></label>
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
                    {selectedLoad.direction === "incoming" && selectedLoad.status === "planned" && !selectedLoad.haulierCounterpartyId ? <span className="small-copy">Waiting for the assigned Driver to mark Arrived at destination on Mobile.</span> : null}
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
