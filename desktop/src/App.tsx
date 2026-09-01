import { invoke } from "@tauri-apps/api/core";
import type { DevicePlatform, SyncEventV1 } from "@waste-x/contracts";
import { calculateNetWeight } from "@waste-x/operations-core";
import { type FormEvent, useEffect, useState } from "react";

const platformExamples: DevicePlatform[] = ["WINDOWS", "MACOS"];

type LocalDbStatus = {
  ready: boolean;
  encrypted: boolean;
  schemaVersion: number;
  cipherVersion: string;
  tableCount: number;
  storage: string;
};

type ProvisioningStatus = {
  provisioned: boolean;
  deviceId: string | null;
  organisationId: string | null;
  defaultSiteId: string | null;
  displayName: string | null;
  platform: string | null;
  credentialsAvailable: boolean;
};

type AuthStatus = {
  requiresUnlock: boolean;
  unlocked: boolean;
  canOffline: boolean;
  email: string | null;
  mode: "ONLINE" | "OFFLINE" | null;
  offlineExpiresAt: string | null;
  offlineDaysRemaining: number;
};

type OperationalSummary = {
  organisationId: string | null;
  syncCursor: string | null;
  lastBootstrapAt: string | null;
  jobs: number;
  jobLoads: number;
  pendingSyncEvents: number;
  conflicts: number;
};

type UnlockResult = {
  ok: boolean;
  mode: "ONLINE" | "OFFLINE";
  userId: string;
  role: string;
  offlineExpiresAt: string;
};

export function App() {
  const exampleNetWeight = calculateNetWeight(28.46, 12.14);
  const [database, setDatabase] = useState<LocalDbStatus | null>(null);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState<ProvisioningStatus | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [summary, setSummary] = useState<OperationalSummary | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("Waste X Desktop — Mac");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const foundationEvent: Pick<SyncEventV1, "schemaVersion" | "eventType"> = {
    schemaVersion: 1,
    eventType: "DESKTOP_FOUNDATION_READY",
  };

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
      setSummary(await invoke<OperationalSummary>("desktop_operational_summary"));
    } else {
      setSummary(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        await invoke("local_db_self_test");
        if (!cancelled) await refreshLocalState();
      } catch (error) {
        if (!cancelled) {
          setDatabaseError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!email && auth?.email) setEmail(auth.email);
  }, [auth?.email, email]);

  async function handleProvision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await invoke<{ ok: boolean }>("desktop_provision_and_bootstrap", {
        input: { email, password, displayName },
      });
      if (!result.ok) throw new Error("Waste X Desktop provisioning did not complete.");

      const unlock = await invoke<UnlockResult>("desktop_unlock", {
        input: { email, password },
      });
      setPassword("");
      await refreshLocalState();
      setMessage(
        `This Mac is provisioned and unlocked ${unlock.mode === "ONLINE" ? "through Cloud" : "offline"}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await invoke<UnlockResult>("desktop_unlock", {
        input: { email, password },
      });
      setPassword("");
      await refreshLocalState();
      setMessage(
        result.mode === "ONLINE"
          ? "Signed in through Waste X Cloud. Offline access has been refreshed for 14 days."
          : "Cloud is unavailable. Waste X unlocked using the encrypted offline entitlement.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setBusy(true);
    setMessage(null);
    try {
      await invoke("desktop_refresh_bootstrap");
      await refreshLocalState();
      setMessage("Cloud bootstrap refreshed into encrypted local storage.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    await invoke("desktop_lock");
    setPassword("");
    setMessage(null);
    await refreshLocalState();
  }

  const locked = Boolean(provisioning?.provisioned && !auth?.unlocked);

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Waste X Desktop</span>
        <h1>
          {locked
            ? "Waste X is locked."
            : database?.ready
              ? "Local-first foundation is alive."
              : "Offline foundation is starting."}
        </h1>
        <p>
          Waste X Desktop owns an encrypted operational database on this machine.
          Cloud remains the permanent system of record, while authorised local
          operations can continue through connectivity loss.
        </p>
      </section>

      <section className="grid" aria-label="Desktop foundation status">
        <article>
          <strong>Platforms</strong>
          <span>{platformExamples.join(" + ")}</span>
        </article>
        <article>
          <strong>Shared contracts</strong>
          <span>Schema v{foundationEvent.schemaVersion}</span>
        </article>
        <article>
          <strong>Local database</strong>
          <span>
            {databaseError
              ? `Error: ${databaseError}`
              : database?.ready
                ? `Encrypted · schema v${database.schemaVersion} · ${database.tableCount} local tables`
                : "Initialising SQLCipher…"}
          </span>
        </article>
        <article>
          <strong>Authentication</strong>
          <span>
            {auth?.unlocked
              ? `${auth.mode === "OFFLINE" ? "Offline" : "Online"} session unlocked`
              : provisioning?.provisioned
                ? "Locked"
                : "Not provisioned"}
          </span>
        </article>
        <article>
          <strong>Local working set</strong>
          <span>
            {auth?.unlocked && summary
              ? `${summary.jobs} jobs · ${summary.jobLoads} loads`
              : provisioning?.provisioned
                ? "Protected while locked"
                : "Not bootstrapped yet"}
          </span>
        </article>
        <article>
          <strong>Offline autonomy</strong>
          <span>
            {auth?.canOffline
              ? `${auth.offlineDaysRemaining} day${auth.offlineDaysRemaining === 1 ? "" : "s"} remaining`
              : provisioning?.provisioned
                ? "Online sign-in required to enable"
                : "Waiting for provisioning"}
          </span>
        </article>
      </section>

      <section className="provisioning-panel">
        {!provisioning?.provisioned ? (
          <>
            <div>
              <span className="eyebrow">Initial provisioning</span>
              <h2>Connect this Mac to Waste X.</h2>
              <p className="panel-copy">
                Sign in once to register a permanent Desktop device and copy the
                operational working set into encrypted SQLite. Your Waste X password
                is never stored.
              </p>
            </div>
            <form className="provision-form" onSubmit={handleProvision}>
              <label>
                <span>Waste X email</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" />
              </label>
              <label>
                <span>Waste X password</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
              </label>
              <label>
                <span>Desktop name</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
              </label>
              <button type="submit" disabled={busy}>{busy ? "Provisioning…" : "Provision this Mac"}</button>
            </form>
          </>
        ) : !auth?.unlocked ? (
          <>
            <div>
              <span className="eyebrow">Secure unlock</span>
              <h2>Sign in to Waste X Desktop.</h2>
              <p className="panel-copy">
                When Cloud is reachable, Waste X validates this account/device and
                renews offline access. If Cloud is unavailable, the encrypted local
                credential verifier and device-bound entitlement can unlock this
                Desktop until the offline window expires.
              </p>
            </div>
            <form className="provision-form" onSubmit={handleUnlock}>
              <label>
                <span>Waste X email</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" />
              </label>
              <label>
                <span>Waste X password</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" autoFocus />
              </label>
              <button type="submit" disabled={busy}>{busy ? "Checking…" : "Unlock Waste X"}</button>
            </form>
            <div className={`auth-banner ${auth?.canOffline ? "ready" : ""}`}>
              {auth?.canOffline
                ? `Offline access is ready until ${auth.offlineExpiresAt ? new Date(auth.offlineExpiresAt).toLocaleString() : "the entitlement expiry"}.`
                : "First unlock must be online so this Desktop can receive its 14-day offline entitlement."}
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="eyebrow">Authorised session</span>
              <h2>This Desktop is unlocked.</h2>
              <p className="panel-copy">
                Device {provisioning.deviceId} is registered to this installation.
                The working set below is being read from encrypted local storage.
              </p>
            </div>
            <div className="provisioned-actions">
              <div className="local-counts">
                <strong>{summary?.jobs ?? 0}</strong><span>local jobs</span>
                <strong>{summary?.jobLoads ?? 0}</strong><span>local loads</span>
              </div>
              <div className="button-row">
                <button type="button" onClick={handleRefresh} disabled={busy}>
                  {busy ? "Refreshing…" : "Refresh Cloud bootstrap"}
                </button>
                <button type="button" className="secondary-button" onClick={handleLock} disabled={busy}>
                  Lock Desktop
                </button>
              </div>
            </div>
            <div className={`auth-banner ${auth.canOffline ? "ready" : ""}`}>
              {auth.mode === "OFFLINE" ? "Running in offline authenticated mode. " : "Cloud authentication is current. "}
              {auth.canOffline ? `${auth.offlineDaysRemaining} days of offline access remain.` : "Offline entitlement needs refreshing."}
            </div>
          </>
        )}

        {message ? <div className="status-message">{message}</div> : null}
      </section>
    </main>
  );
}
