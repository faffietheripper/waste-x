import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

type AuthStatus = {
  unlocked: boolean;
  canOffline: boolean;
  email: string | null;
  mode: "ONLINE" | "OFFLINE" | null;
  offlineExpiresAt: string | null;
  offlineDaysRemaining: number;
};

type SyncStatus = {
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

type CloudContext = {
  baseUrl: string;
  environment: string;
  organisationId: string | null;
  organisationName: string | null;
  deviceId: string | null;
  displayName: string | null;
  horizonStart: string | null;
  horizonEnd: string | null;
  lastBootstrapAt: string | null;
};

type BridgeStatus = {
  reachable: boolean;
  service: string | null;
  version: string | null;
  pid: number | null;
  uptimeSeconds: number | null;
  databaseReady: boolean;
  cipherVersion: string | null;
  schemaVersion: number | null;
  pending: number;
  retrying: number;
  conflicts: number;
  deviceId: string | null;
  organisationId: string | null;
  lastBootstrapAt: string | null;
  syncCursor: string | null;
  error: string | null;
};

type SyncReviewItem = {
  source: "LOCAL_EVENT" | "CLOUD_CHANGE";
  itemId: string;
  jobNumber: string | null;
  loadNumber: number | null;
  entityType: string;
  entityId: string;
  eventType: string | null;
  status: string;
  reason: string;
  baseVersion: number | null;
  serverVersion: number | null;
  occurredAt: string | null;
};

type DockState = {
  auth: AuthStatus | null;
  sync: SyncStatus | null;
  cloud: CloudContext | null;
  bridge: BridgeStatus | null;
  reviews: SyncReviewItem[];
};

function relativeTime(value: string | null) {
  if (!value) return "never";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ageDays(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function reviewLabel(item: SyncReviewItem) {
  const load = item.jobNumber
    ? `${item.jobNumber}${item.loadNumber !== null ? ` · Load ${item.loadNumber}` : ""}`
    : item.entityId;
  return `${load} · ${item.eventType ?? item.source}`;
}

export function OfflineStatusDock() {
  const [state, setState] = useState<DockState>({ auth: null, sync: null, cloud: null, bridge: null, reviews: [] });

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const [auth, bridge] = await Promise.all([
          invoke<AuthStatus>("desktop_auth_status"),
          invoke<BridgeStatus>("desktop_bridge_status"),
        ]);
        if (!auth.unlocked) {
          if (!cancelled) setState({ auth, sync: null, cloud: null, bridge, reviews: [] });
          return;
        }

        const [sync, cloud, reviews] = await Promise.all([
          invoke<SyncStatus>("desktop_sync_status"),
          invoke<CloudContext>("desktop_cloud_context"),
          invoke<SyncReviewItem[]>("desktop_sync_review_items"),
        ]);
        if (!cancelled) setState({ auth, sync, cloud, bridge, reviews });
      } catch {
        if (!cancelled) setState((current) => current);
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const view = useMemo(() => {
    const { auth, sync, cloud } = state;
    if (!auth) return { tone: "starting", title: "Waste X Desktop starting", detail: "Checking encrypted local state…", queued: 0 };
    if (!auth.unlocked) {
      return {
        tone: "locked",
        title: "Desktop locked",
        detail: auth.canOffline
          ? `Offline unlock ready · ${auth.offlineDaysRemaining} day${auth.offlineDaysRemaining === 1 ? "" : "s"} remaining`
          : "Sign in to access operational data",
        queued: 0,
      };
    }

    const review = (sync?.conflicts ?? 0) + (sync?.permanentFailed ?? 0) + (sync?.deferredRemoteChanges ?? 0);
    const queued = (sync?.pending ?? 0) + (sync?.retryableFailed ?? 0);
    const bootstrapAge = ageDays(cloud?.lastBootstrapAt ?? null);

    if (review > 0) return { tone: "problem", title: "Sync review required", detail: `${review} item${review === 1 ? "" : "s"} need review. Open Details to see the exact job, event and Cloud reason.`, queued };
    if (sync?.authRequired) return { tone: "warning", title: "Cloud sign-in required", detail: "Local operations remain available, but upload is paused until an online sign-in renews this device session.", queued };
    if (bootstrapAge !== null && bootstrapAge >= 14) return { tone: "problem", title: "Offline working set is stale", detail: `Last Cloud bootstrap was ${bootstrapAge} days ago. Existing local work is preserved; reconnect before relying on new reference data.`, queued };
    if (sync?.running) return { tone: "syncing", title: "Syncing with Waste X Cloud", detail: queued > 0 ? `${queued} local change${queued === 1 ? "" : "s"} waiting for acknowledgement.` : "Checking for Cloud changes…", queued };
    if (sync?.cloudReachable) {
      return {
        tone: queued > 0 ? "syncing" : "online",
        title: queued > 0 ? "Cloud connected · changes queued" : "Cloud connected · fully synced",
        detail: queued > 0 ? `${queued} local change${queued === 1 ? "" : "s"} will upload automatically in device order.` : `Last successful sync ${relativeTime(sync.lastSuccessAt)}.`,
        queued,
      };
    }
    if (bootstrapAge !== null && bootstrapAge >= 7) return { tone: "warning", title: "Working offline · cache aging", detail: `Local operations are safe. Working set was last refreshed ${bootstrapAge} days ago; ${auth.offlineDaysRemaining} offline-auth day${auth.offlineDaysRemaining === 1 ? "" : "s"} remain.`, queued };
    return { tone: "offline", title: "Working safely offline", detail: `${queued} change${queued === 1 ? "" : "s"} stored locally · ${auth.offlineDaysRemaining} offline-auth day${auth.offlineDaysRemaining === 1 ? "" : "s"} remaining.`, queued };
  }, [state]);

  return (
    <aside className={`offline-status-dock dock-${view.tone}`} aria-live="polite">
      <div className="dock-primary">
        <span className="dock-dot" aria-hidden="true" />
        <div><strong>{view.title}</strong><span>{view.detail}</span></div>
      </div>

      {state.auth?.unlocked ? (
        <div className="dock-facts">
          <span><strong>{view.queued}</strong> queued</span>
          <span><strong>{state.sync?.conflicts ?? 0}</strong> conflicts</span>
          <span><strong>{state.auth.offlineDaysRemaining}</strong>d offline</span>
          <span className={state.bridge?.reachable && state.bridge.databaseReady ? "bridge-up" : "bridge-down"}>
            <strong>{state.bridge?.reachable && state.bridge.databaseReady ? "UP" : "DOWN"}</strong> Bridge
          </span>
          <details>
            <summary>Details</summary>
            <div className="dock-details">
              <span><strong>Environment</strong> {state.cloud?.environment ?? "Unknown"}</span>
              <span><strong>Cloud</strong> {state.cloud?.baseUrl ?? "Unavailable"}</span>
              <span><strong>Organisation</strong> {state.cloud?.organisationName ?? state.cloud?.organisationId ?? "Unknown"}</span>
              <span><strong>Device</strong> {state.cloud?.displayName ?? state.cloud?.deviceId ?? "Unknown"}</span>
              <span><strong>Last sync</strong> {relativeTime(state.sync?.lastSuccessAt ?? null)}</span>
              <span><strong>Last bootstrap</strong> {relativeTime(state.cloud?.lastBootstrapAt ?? null)}</span>
              <span><strong>Bridge</strong> {state.bridge?.reachable ? `PID ${state.bridge.pid ?? "—"} · v${state.bridge.version ?? "—"}` : "Not running"}</span>
              <span><strong>Bridge DB</strong> {state.bridge?.databaseReady ? `SQLCipher ${state.bridge.cipherVersion ?? "—"} · schema v${state.bridge.schemaVersion ?? "—"}` : state.bridge?.error ?? "Unavailable"}</span>
              {state.reviews.length ? (
                <>
                  <span><strong>Review items</strong> {state.reviews.length}</span>
                  {state.reviews.map((item) => (
                    <span key={`${item.source}:${item.itemId}`}>
                      <strong>{reviewLabel(item)}</strong> {item.status} · {item.reason}
                      {item.baseVersion !== null || item.serverVersion !== null
                        ? ` · local/base v${item.baseVersion ?? "—"} → Cloud v${item.serverVersion ?? "—"}`
                        : ""}
                    </span>
                  ))}
                </>
              ) : <span><strong>Review items</strong> None</span>}
            </div>
          </details>
        </div>
      ) : null}
    </aside>
  );
}
