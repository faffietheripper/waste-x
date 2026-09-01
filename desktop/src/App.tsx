import { invoke } from "@tauri-apps/api/core";
import type { DevicePlatform, SyncEventV1 } from "@waste-x/contracts";
import { calculateNetWeight } from "@waste-x/operations-core";
import { FormEvent, useEffect, useState } from "react";

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

type OperationalSummary = {
  organisationId: string | null;
  syncCursor: string | null;
  lastBootstrapAt: string | null;
  jobs: number;
  jobLoads: number;
  pendingSyncEvents: number;
  conflicts: number;
};

export function App() {
  const exampleNetWeight = calculateNetWeight(28.46, 12.14);
  const [database, setDatabase] = useState<LocalDbStatus | null>(null);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState<ProvisioningStatus | null>(null);
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
    const [dbStatus, provisioningStatus, operationalSummary] = await Promise.all([
      invoke<LocalDbStatus>("local_db_status"),
      invoke<ProvisioningStatus>("desktop_provisioning_status"),
      invoke<OperationalSummary>("local_db_operational_summary"),
    ]);
    setDatabase(dbStatus);
    setProvisioning(provisioningStatus);
    setSummary(operationalSummary);
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

  async function handleProvision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await invoke<{ ok: boolean }>("desktop_provision_and_bootstrap", {
        input: { email, password, displayName },
      });
      if (!result.ok) throw new Error("Waste X Desktop provisioning did not complete.");
      setPassword("");
      await refreshLocalState();
      setMessage("This Mac is provisioned and the Cloud working set is stored locally.");
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

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Waste X Desktop</span>
        <h1>{database?.ready ? "Local-first foundation is alive." : "Offline foundation is starting."}</h1>
        <p>
          Waste X Desktop owns an encrypted operational database on this machine.
          Cloud remains the permanent system of record, but local operations are
          designed to continue when connectivity disappears.
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
          <strong>Encryption</strong>
          <span>{database?.encrypted ? `SQLCipher ${database.cipherVersion}` : "Waiting for native database"}</span>
        </article>
        <article>
          <strong>Local working set</strong>
          <span>{summary ? `${summary.jobs} jobs · ${summary.jobLoads} loads` : "Not bootstrapped yet"}</span>
        </article>
        <article>
          <strong>Sync state</strong>
          <span>{summary ? `${summary.pendingSyncEvents} pending · ${summary.conflicts} conflicts` : "Waiting"}</span>
        </article>
      </section>

      <section className="provisioning-panel">
        <div>
          <span className="eyebrow">Initial provisioning</span>
          <h2>{provisioning?.provisioned ? "This Desktop is registered." : "Connect this Mac to Waste X."}</h2>
          <p className="panel-copy">
            {provisioning?.provisioned
              ? `Device ${provisioning.deviceId} is linked to this installation. The working set below is read from encrypted local storage.`
              : "Sign in once to register a permanent Desktop device and copy the 14-day operational working set into encrypted SQLite. Your Waste X password is not stored."}
          </p>
        </div>

        {provisioning?.provisioned ? (
          <div className="provisioned-actions">
            <div className="local-counts">
              <strong>{summary?.jobs ?? 0}</strong><span>local jobs</span>
              <strong>{summary?.jobLoads ?? 0}</strong><span>local loads</span>
            </div>
            <button type="button" onClick={handleRefresh} disabled={busy}>
              {busy ? "Refreshing…" : "Refresh Cloud bootstrap"}
            </button>
          </div>
        ) : (
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
        )}

        {message ? <div className="status-message">{message}</div> : null}
      </section>
    </main>
  );
}
