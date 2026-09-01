import { invoke } from "@tauri-apps/api/core";
import type { DevicePlatform, SyncEventV1 } from "@waste-x/contracts";
import { calculateNetWeight } from "@waste-x/operations-core";
import { useEffect, useState } from "react";

const platformExamples: DevicePlatform[] = ["WINDOWS", "MACOS"];

type LocalDbStatus = {
  ready: boolean;
  encrypted: boolean;
  schemaVersion: number;
  cipherVersion: string;
  tableCount: number;
  storage: string;
};

export function App() {
  const exampleNetWeight = calculateNetWeight(28.46, 12.14);
  const [database, setDatabase] = useState<LocalDbStatus | null>(null);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  const foundationEvent: Pick<SyncEventV1, "schemaVersion" | "eventType"> = {
    schemaVersion: 1,
    eventType: "DESKTOP_FOUNDATION_READY",
  };

  useEffect(() => {
    let cancelled = false;

    async function checkLocalDatabase() {
      try {
        const status = await invoke<LocalDbStatus>("local_db_status");
        await invoke("local_db_self_test");
        if (!cancelled) setDatabase(status);
      } catch (error) {
        if (!cancelled) {
          setDatabaseError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void checkLocalDatabase();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Waste X Desktop</span>
        <h1>{database?.ready ? "Local-first foundation is alive." : "Offline foundation is starting."}</h1>
        <p>
          Waste X Desktop now owns an encrypted local operational database. Cloud
          remains the permanent system of record, but site operations will not
          depend on Cloud availability.
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
          <strong>Operations core</strong>
          <span>Example net: {exampleNetWeight.toFixed(3)} t</span>
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
          <span>
            {database?.encrypted
              ? `SQLCipher ${database.cipherVersion}`
              : "Waiting for native database"}
          </span>
        </article>
        <article>
          <strong>Next milestone</strong>
          <span>Persist Cloud bootstrap into SQLite</span>
        </article>
      </section>
    </main>
  );
}
