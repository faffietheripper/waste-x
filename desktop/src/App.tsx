import type { DevicePlatform, SyncEventV1 } from "@waste-x/contracts";
import { calculateNetWeight } from "@waste-x/operations-core";

const platformExamples: DevicePlatform[] = ["WINDOWS", "MACOS"];

export function App() {
  const exampleNetWeight = calculateNetWeight(28.46, 12.14);

  const foundationEvent: Pick<SyncEventV1, "schemaVersion" | "eventType"> = {
    schemaVersion: 1,
    eventType: "DESKTOP_FOUNDATION_READY",
  };

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Waste X Desktop</span>
        <h1>Offline foundation is ready.</h1>
        <p>
          Tauri + React is isolated from the existing Next.js web app and wired
          to shared Waste X contracts.
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
          <strong>Next milestone</strong>
          <span>Encrypted SQLite + bootstrap</span>
        </article>
      </section>
    </main>
  );
}
