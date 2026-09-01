import { invoke } from "@tauri-apps/api/core";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

type LocalDbStatus = {
  ready: boolean;
  encrypted: boolean;
  schemaVersion: number;
  cipherVersion: string;
  tableCount: number;
};

type ProvisioningStatus = {
  provisioned: boolean;
  deviceId: string | null;
  displayName: string | null;
};

type AuthStatus = {
  unlocked: boolean;
  canOffline: boolean;
  email: string | null;
  mode: "ONLINE" | "OFFLINE" | null;
  offlineExpiresAt: string | null;
  offlineDaysRemaining: number;
};

type OperationalSummary = {
  jobs: number;
  jobLoads: number;
  pendingSyncEvents: number;
  conflicts: number;
};

type OpsReference = {
  id: string;
  label: string;
  haulierCounterpartyId: string | null;
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
  grossWeight: string | null;
  tareWeight: string | null;
  netWeight: string | null;
  weightMetric: string;
  ticketNumber: string | null;
  notes: string | null;
  entityVersion: number;
  pendingEvents: number;
};

type DailyOperationsSnapshot = {
  loads: DailyLoad[];
  drivers: OpsReference[];
  vehicles: OpsReference[];
  pendingEvents: number;
  conflicts: number;
};

type DesktopSyncStatus = {
  running: boolean;
  cloudReachable: boolean;
  authRequired: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  cursor: string | null;
  pending: number;
  retryableFailed: number;
  permanentFailed: number;
  conflicts: number;
  deferredRemoteChanges: number;
};

type DesktopSyncRunResult = {
  status: DesktopSyncStatus;
  pushedApplied: number;
  pushedDuplicates: number;
  pushedConflicts: number;
  pushedFailed: number;
  pulledChanges: number;
  deferredRemoteChanges: number;
};

type UnlockResult = {
  ok: boolean;
  mode: "ONLINE" | "OFFLINE";
};

type EditState = {
  driverId: string;
  vehicleId: string;
  wasteDescription: string;
  grossWeight: string;
  tareWeight: string;
  netWeight: string;
  weightMetric: string;
  ticketNumber: string;
  notes: string;
};

function editStateFor(load: DailyLoad): EditState {
  return {
    driverId: load.driverId ?? "",
    vehicleId: load.vehicleId ?? "",
    wasteDescription: load.wasteDescription,
    grossWeight: load.grossWeight ?? "",
    tareWeight: load.tareWeight ?? "",
    netWeight: load.netWeight ?? "",
    weightMetric: load.weightMetric || "Tonnes",
    ticketNumber: load.ticketNumber ?? "",
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

export function App() {
  const [database, setDatabase] = useState<LocalDbStatus | null>(null);
  const [provisioning, setProvisioning] = useState<ProvisioningStatus | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [summary, setSummary] = useState<OperationalSummary | null>(null);
  const [operations, setOperations] = useState<DailyOperationsSnapshot | null>(null);
  const [sync, setSync] = useState<DesktopSyncStatus | null>(null);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
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

  const availableDrivers = useMemo(
    () =>
      operations?.drivers.filter(
        (driver) => driver.haulierCounterpartyId === (selectedLoad?.haulierCounterpartyId ?? null),
      ) ?? [],
    [operations, selectedLoad],
  );

  const availableVehicles = useMemo(
    () =>
      operations?.vehicles.filter(
        (vehicle) => vehicle.haulierCounterpartyId === (selectedLoad?.haulierCounterpartyId ?? null),
      ) ?? [],
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
      const [operationalSummary, dailyOperations, syncStatus] = await Promise.all([
        invoke<OperationalSummary>("desktop_operational_summary"),
        invoke<DailyOperationsSnapshot>("desktop_daily_operations"),
        invoke<DesktopSyncStatus>("desktop_sync_status"),
      ]);
      setSummary(operationalSummary);
      setOperations(dailyOperations);
      setSync(syncStatus);
    } else {
      setSummary(null);
      setOperations(null);
      setSync(null);
      setSelectedLoadId(null);
      setEdit(null);
    }
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
        if (!result.status.cloudReachable) {
          setMessage("Cloud is still unavailable. Local operations remain safe and queued.");
        } else if (result.status.authRequired) {
          setMessage("Cloud is reachable, but the Desktop session must be renewed with an online sign-in.");
        } else if (result.pushedConflicts > 0 || result.status.conflicts > 0) {
          setMessage("Sync stopped safely at a conflict. Later physical events remain queued in order.");
        } else if (result.status.permanentFailed > 0) {
          setMessage("Cloud rejected an event. Waste X kept it locally for review instead of discarding it.");
        } else {
          setMessage(
            `Sync complete: ${result.pushedApplied + result.pushedDuplicates} uploaded · ${result.pulledChanges} Cloud changes received.`,
          );
        }
      }
    } catch (error) {
      if (showToast) setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncBusy(false);
      syncLoopActive.current = false;
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await invoke("local_db_self_test");
        await refreshLocalState();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    })();
  }, []);

  useEffect(() => {
    if (!email && auth?.email) setEmail(auth.email);
  }, [auth?.email, email]);

  useEffect(() => {
    if (selectedLoad) setEdit(editStateFor(selectedLoad));
  }, [selectedLoad?.id]);

  useEffect(() => {
    if (!auth?.unlocked) return;

    const initial = window.setTimeout(() => void syncNow(false), 1200);
    const interval = window.setInterval(() => void syncNow(false), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [auth?.unlocked]);

  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      await refreshLocalState();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
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
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await invoke<UnlockResult>("desktop_unlock", { input: { email, password } });
      setPassword("");
      await refreshLocalState();
      setMessage(
        result.mode === "OFFLINE"
          ? "Cloud is unavailable — Waste X unlocked offline from encrypted local data."
          : "Cloud sign-in verified. Offline access refreshed for 14 days.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    await invoke("desktop_lock");
    setMessage(null);
    await refreshLocalState();
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLoad || !edit) return;
    await run(
      () =>
        invoke("desktop_save_load_details", {
          input: {
            loadId: selectedLoad.id,
            driverId: edit.driverId || null,
            vehicleId: edit.vehicleId || null,
            wasteDescription: edit.wasteDescription,
            grossWeight: numberOrNull(edit.grossWeight),
            tareWeight: numberOrNull(edit.tareWeight),
            netWeight: numberOrNull(edit.netWeight),
            weightMetric: edit.weightMetric,
            weightIsEstimate: false,
            ticketNumber: edit.ticketNumber || null,
            notes: edit.notes || null,
          },
        }),
      "Load details saved locally and queued for Cloud sync.",
    );
  }

  async function loadAction(command: string, success: string) {
    if (!selectedLoad) return;
    await run(() => invoke(command, { input: { loadId: selectedLoad.id } }), success);
  }

  async function rejectLoad() {
    if (!selectedLoad) return;
    const reason = window.prompt("Why is this incoming load being rejected?");
    if (!reason) return;
    await run(
      () => invoke("desktop_reject_load", { input: { loadId: selectedLoad.id, reason } }),
      "Load rejected locally and queued for Cloud sync.",
    );
  }

  const locked = Boolean(provisioning?.provisioned && !auth?.unlocked);
  const syncProblems = (sync?.conflicts ?? 0) + (sync?.permanentFailed ?? 0) + (sync?.deferredRemoteChanges ?? 0);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Waste X Desktop</span>
          <h1>{locked ? "Waste X is locked." : "Local-first operations."}</h1>
          <p>
            Yard actions commit to encrypted SQLite first. Cloud sync is a consequence,
            not a prerequisite for operating the site.
          </p>
        </div>
        {auth?.unlocked ? (
          <div className="top-actions">
            <button className="secondary-button" disabled={syncBusy} onClick={() => void syncNow(true)}>
              {syncBusy || sync?.running ? "Syncing…" : "Sync now"}
            </button>
            <button className="secondary-button" onClick={handleLock}>Lock Desktop</button>
          </div>
        ) : null}
      </header>

      <section className="status-grid">
        <article><strong>Local database</strong><span>{database?.ready ? `Encrypted · schema v${database.schemaVersion}` : "Starting…"}</span></article>
        <article><strong>Authentication</strong><span>{auth?.unlocked ? `${auth.mode} unlocked` : provisioning?.provisioned ? "Locked" : "Not provisioned"}</span></article>
        <article><strong>Cloud sync</strong><span>{!auth?.unlocked ? "Protected" : sync?.authRequired ? "Sign-in required" : sync?.cloudReachable ? "Connected" : "Offline / waiting"}</span></article>
        <article><strong>Sync outbox</strong><span>{sync ? `${sync.pending} pending · ${sync.retryableFailed} retrying · ${syncProblems} review` : "Protected"}</span></article>
      </section>

      {!provisioning?.provisioned ? (
        <section className="panel">
          <span className="eyebrow">Initial provisioning</span>
          <h2>Connect this Mac to Waste X.</h2>
          <form className="form-grid" onSubmit={handleProvision}>
            <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <label className="wide"><span>Desktop name</span><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>
            <button disabled={busy}>{busy ? "Provisioning…" : "Provision this Mac"}</button>
          </form>
        </section>
      ) : !auth?.unlocked ? (
        <section className="panel auth-panel">
          <span className="eyebrow">Secure unlock</span>
          <h2>Sign in to Waste X Desktop.</h2>
          <p className="small-copy">If Cloud cannot be reached, Waste X validates against the encrypted offline entitlement instead.</p>
          <form className="form-grid" onSubmit={handleUnlock}>
            <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></label>
            <button disabled={busy}>{busy ? "Checking…" : "Unlock Waste X"}</button>
          </form>
        </section>
      ) : (
        <>
          <section className={`sync-strip ${sync?.cloudReachable ? "online" : "offline"} ${syncProblems > 0 ? "problem" : ""}`}>
            <div>
              <strong>{sync?.cloudReachable ? "Cloud connected" : "Local operations active"}</strong>
              <span>
                {sync?.authRequired
                  ? "Cloud session needs an online sign-in before queued work can upload."
                  : sync?.lastError
                    ? sync.lastError
                    : sync?.cloudReachable
                      ? `Last successful sync ${shortTime(sync.lastSuccessAt)}.`
                      : "Waste X will retry automatically every 15 seconds while this Desktop is unlocked."}
              </span>
            </div>
            <div className="sync-metrics">
              <span><strong>{sync?.pending ?? 0}</strong> pending</span>
              <span><strong>{sync?.retryableFailed ?? 0}</strong> retrying</span>
              <span><strong>{syncProblems}</strong> review</span>
              <span>cursor {sync?.cursor ?? "—"}</span>
            </div>
          </section>

          <section className="operations-header">
            <div>
              <span className="eyebrow">Daily Operations</span>
              <h2>{summary?.jobLoads ?? 0} local loads ready</h2>
            </div>
            <div className="ops-meta">
              <span>{summary?.jobs ?? 0} jobs</span>
              <span>{operations?.pendingEvents ?? 0} local events</span>
              <button className="secondary-button" disabled={busy} onClick={() => run(() => invoke("desktop_refresh_bootstrap"), "Cloud bootstrap refreshed.")}>Refresh bootstrap</button>
            </div>
          </section>

          <section className="operations-layout">
            <div className="load-list">
              {operations?.loads.map((load) => (
                <button key={load.id} className={`load-row ${selectedLoadId === load.id ? "selected" : ""}`} onClick={() => setSelectedLoadId(load.id)}>
                  <div className="load-title">
                    <strong>{load.jobNumber || "Job"} · Load {load.loadNumber ?? "—"}</strong>
                    <span className={`status-pill status-${load.status}`}>{load.status}</span>
                  </div>
                  <span>{load.direction} · {load.jobDate ?? "No date"} · {load.ewcCode ?? "No EWC"}</span>
                  <span>{load.wasteDescription || "Waste description required"}</span>
                  <span className="load-foot">Net {load.netWeight ?? "—"} {load.weightMetric} {load.pendingEvents > 0 ? `· ${load.pendingEvents} local change${load.pendingEvents === 1 ? "" : "s"}` : ""}</span>
                </button>
              ))}
              {!operations?.loads.length ? <div className="empty-state">No operational loads are cached on this Desktop.</div> : null}
            </div>

            <div className="load-editor">
              {selectedLoad && edit ? (
                <>
                  <div className="editor-heading">
                    <div>
                      <span className="eyebrow">Selected load</span>
                      <h3>{selectedLoad.jobNumber} · Load {selectedLoad.loadNumber ?? "—"}</h3>
                    </div>
                    <span className={`status-pill status-${selectedLoad.status}`}>{selectedLoad.status}</span>
                  </div>

                  <form className="editor-form" onSubmit={saveDetails}>
                    <label><span>Driver</span><select value={edit.driverId} onChange={(e) => setEdit({ ...edit, driverId: e.target.value })}><option value="">Select driver</option>{availableDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.label}</option>)}</select></label>
                    <label><span>Vehicle</span><select value={edit.vehicleId} onChange={(e) => setEdit({ ...edit, vehicleId: e.target.value })}><option value="">Select vehicle</option>{availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</select></label>
                    <label className="wide"><span>Waste description</span><input value={edit.wasteDescription} onChange={(e) => setEdit({ ...edit, wasteDescription: e.target.value })} /></label>
                    <label><span>Gross</span><input inputMode="decimal" value={edit.grossWeight} onChange={(e) => setEdit({ ...edit, grossWeight: e.target.value })} /></label>
                    <label><span>Tare</span><input inputMode="decimal" value={edit.tareWeight} onChange={(e) => setEdit({ ...edit, tareWeight: e.target.value })} /></label>
                    <label><span>Net</span><input inputMode="decimal" value={edit.netWeight} onChange={(e) => setEdit({ ...edit, netWeight: e.target.value })} /></label>
                    <label><span>Metric</span><select value={edit.weightMetric} onChange={(e) => setEdit({ ...edit, weightMetric: e.target.value })}><option>Tonnes</option><option>Kilograms</option><option>Grams</option></select></label>
                    <label className="wide"><span>Ticket number</span><input value={edit.ticketNumber} onChange={(e) => setEdit({ ...edit, ticketNumber: e.target.value })} /></label>
                    <label className="wide"><span>Notes</span><textarea rows={3} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
                    <button disabled={busy || ["completed", "rejected", "cancelled"].includes(selectedLoad.status)}>Save locally</button>
                  </form>

                  <div className="action-row">
                    {selectedLoad.direction === "incoming" && selectedLoad.status === "planned" ? <button disabled={busy} onClick={() => loadAction("desktop_mark_load_arrived", "Arrival recorded locally and queued for sync.")}>Mark Arrived</button> : null}
                    {selectedLoad.direction === "incoming" && selectedLoad.status === "arrived" ? <button disabled={busy} onClick={() => loadAction("desktop_accept_load", "Load accepted locally and queued for sync.")}>Accept</button> : null}
                    {selectedLoad.direction === "incoming" && selectedLoad.status === "arrived" ? <button className="danger-button" disabled={busy} onClick={rejectLoad}>Reject</button> : null}
                    {((selectedLoad.direction === "incoming" && selectedLoad.status === "accepted") || (selectedLoad.direction === "outgoing" && !["completed", "rejected", "cancelled"].includes(selectedLoad.status))) ? <button disabled={busy} onClick={() => loadAction("desktop_complete_load", "Load completed locally and queued for sync.")}>Complete Load</button> : null}
                  </div>

                  <div className="local-proof">Entity version {selectedLoad.entityVersion} · {selectedLoad.pendingEvents} unsynced local event{selectedLoad.pendingEvents === 1 ? "" : "s"}</div>
                </>
              ) : (
                <div className="empty-state editor-empty">Select a load to operate it from encrypted local storage.</div>
              )}
            </div>
          </section>
        </>
      )}

      {message ? <div className="toast">{message}</div> : null}
    </main>
  );
}
