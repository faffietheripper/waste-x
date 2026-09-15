import {
  AppState,
  type AppStateStatus,
} from "react-native";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getLocalMobileAssignmentWorkingSet,
  refreshMobileAssignmentWorkingSet,
  type LocalMobileAssignmentWorkingSet,
} from "@/assignments/local-working-set";
import {
  getMobileAuthSnapshot,
  type MobileAuthSnapshot,
} from "@/auth/mobile-auth";
import {
  getMobileSyncStatus,
  syncPendingMobileEvents,
  type MobileSyncStatus,
} from "@/sync/mobile-sync";

type FieldOpsContextValue = {
  auth: MobileAuthSnapshot | null;
  workingSet: LocalMobileAssignmentWorkingSet | null;
  syncStatus: MobileSyncStatus | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearError: () => void;
};

const FieldOpsContext = createContext<FieldOpsContextValue | null>(null);

export function FieldOpsProvider({ children }: PropsWithChildren) {
  const [auth, setAuth] = useState<MobileAuthSnapshot | null>(null);
  const [workingSet, setWorkingSet] = useState<LocalMobileAssignmentWorkingSet | null>(null);
  const [syncStatus, setSyncStatus] = useState<MobileSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    WASTE_X_MOBILE_AUTHORITATIVE_REFRESH_V1

    Keep a handle to the active reconciliation rather than only a boolean.
    A manual pull-to-refresh must never become a silent no-op just because an
    AppState / heartbeat reconciliation happened to already be running.

    Automatic reconciliation may remain opportunistic and offline-safe.
    Manual reconciliation is authoritative: when Cloud says an assignment has
    moved to another Driver, the complete bootstrap snapshot replaces the local
    SQLCipher working set immediately.
  */
  const reconcilePromise = useRef<Promise<void> | null>(null);

  const reconcile = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);

    /*
      If an automatic reconciliation is already in flight, a user-requested
      refresh waits for it and then performs a NEW Cloud pass. This guarantees
      the gesture means "check Cloud now", not "return because something else
      was already checking".
    */
    if (reconcilePromise.current) {
      if (!showRefresh) {
        await reconcilePromise.current;
        return;
      }

      try {
        await reconcilePromise.current;
      } catch {
        // The explicit pass below gets its own result and error reporting.
      }
    }

    const task = (async () => {
      try {
        setError(null);

        let [nextAuth, nextWorkingSet, nextSyncStatus] = await Promise.all([
          getMobileAuthSnapshot(),
          getLocalMobileAssignmentWorkingSet(),
          getMobileSyncStatus(),
        ]);

        // SQLCipher remains the first read. Cloud is never required simply to
        // render already-authorised offline work.
        if (nextAuth.onlineAuthenticated) {
          if (nextSyncStatus.pending > 0) {
            try {
              await syncPendingMobileEvents();
              nextSyncStatus = await getMobileSyncStatus();
            } catch (reason) {
              /*
                Do not discard the durable outbox. For an explicit refresh,
                surface the problem because it can affect the authoritative
                ordering of this Driver's work.
              */
              if (showRefresh) {
                const detail =
                  reason instanceof Error ? reason.message : String(reason);
                throw new Error(
                  `Waste X could not reconcile queued Driver activity before refreshing assignments. ${detail}`,
                );
              }
            }
          }

          try {
            /*
              bootstrapMobile() returns the COMPLETE authorised assignment
              snapshot for this linked Driver. persistMobileAssignmentBootstrap
              transactionally deletes stale assignment rows before inserting
              this response, so reassigned Loads disappear here.
            */
            nextWorkingSet = await refreshMobileAssignmentWorkingSet();
          } catch (reason) {
            const detail =
              reason instanceof Error ? reason.message : String(reason);

            if (showRefresh) {
              throw new Error(
                `Waste X Cloud could not refresh this Driver's authorised assignments. Cached offline work has been preserved. ${detail}`,
              );
            }

            /*
              Automatic background failure remains non-destructive, but it is
              no longer invisible while the app claims to be online.
            */
            setError(
              `Cloud assignment refresh failed. Showing the last encrypted working set. ${detail}`,
            );
          }

          // Refresh auth once more so server-side device/session revocation is
          // reflected before the shell continues exposing operational data.
          nextAuth = await getMobileAuthSnapshot();
        }

        setAuth(nextAuth);
        setWorkingSet(nextWorkingSet);
        setSyncStatus(nextSyncStatus);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));

        // Reconciliation failure never destroys valid offline work.
        const [fallbackWorkingSet, fallbackSyncStatus, fallbackAuth] =
          await Promise.all([
            getLocalMobileAssignmentWorkingSet().catch(() => null),
            getMobileSyncStatus().catch(() => null),
            getMobileAuthSnapshot().catch(() => null),
          ]);

        if (fallbackAuth) setAuth(fallbackAuth);
        if (fallbackWorkingSet) setWorkingSet(fallbackWorkingSet);
        if (fallbackSyncStatus) setSyncStatus(fallbackSyncStatus);
      }
    })();

    reconcilePromise.current = task;

    try {
      await task;
    } finally {
      if (reconcilePromise.current === task) {
        reconcilePromise.current = null;
      }
      setLoading(false);
      if (showRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reconcile(false);

    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") void reconcile(false);
      },
    );

    return () => subscription.remove();
  }, [reconcile]);

  useEffect(() => {
    if (!auth) return;

    /*
      WASTE_X_MOBILE_FAST_ASSIGNMENT_RECONCILE_V1

      Desktop can create, assign and complete work while Cloud is unavailable.
      When Cloud returns there is a short race: Mobile may reconnect before the
      Desktop outbox has finished replaying and receive the previous assignment
      snapshot. A five-minute online heartbeat then makes valid newly-synced
      assignments look missing.

      While the app is active, reconcile every 15 seconds whether Cloud was
      already online or has just returned. The bootstrap remains authoritative,
      Driver-scoped and replacement-based, so reassignment/revocation semantics
      are unchanged.
    */
    const retryMs = 15 * 1000;
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void reconcile(false);
    }, retryMs);

    return () => clearInterval(timer);
  }, [auth?.onlineAuthenticated, reconcile]);

  const value = useMemo<FieldOpsContextValue>(
    () => ({
      auth,
      workingSet,
      syncStatus,
      loading,
      refreshing,
      error,
      refresh: () => reconcile(true),
      clearError: () => setError(null),
    }),
    [auth, workingSet, syncStatus, loading, refreshing, error, reconcile],
  );

  return (
    <FieldOpsContext.Provider value={value}>
      {children}
    </FieldOpsContext.Provider>
  );
}

export function useFieldOps() {
  const value = useContext(FieldOpsContext);
  if (!value) {
    throw new Error("useFieldOps must be used inside FieldOpsProvider.");
  }
  return value;
}
