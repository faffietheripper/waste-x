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

  const reconcile = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      setError(null);

      let [nextAuth, nextWorkingSet, nextSyncStatus] = await Promise.all([
        getMobileAuthSnapshot(),
        getLocalMobileAssignmentWorkingSet(),
        getMobileSyncStatus(),
      ]);

      // SQLCipher remains the first read. Cloud reconciliation is opportunistic
      // and never required to render the operational UI.
      if (nextAuth.onlineAuthenticated) {
        if (nextSyncStatus.pending > 0) {
          try {
            await syncPendingMobileEvents();
            nextSyncStatus = await getMobileSyncStatus();
          } catch {
            // The existing outbox remains durable; keep showing local work.
          }
        }

        try {
          nextWorkingSet = await refreshMobileAssignmentWorkingSet();
        } catch {
          // Cached assignments remain authoritative for offline field work.
        }

        // Refresh auth once more so a server-side device/session revocation is
        // reflected before the shell continues to expose operational data.
        nextAuth = await getMobileAuthSnapshot();
      }

      setAuth(nextAuth);
      setWorkingSet(nextWorkingSet);
      setSyncStatus(nextSyncStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      // Even when reconciliation fails, try to keep locally persisted work on
      // screen rather than replacing the whole app with an error state.
      const [fallbackWorkingSet, fallbackSyncStatus] = await Promise.all([
        getLocalMobileAssignmentWorkingSet().catch(() => null),
        getMobileSyncStatus().catch(() => null),
      ]);
      if (fallbackWorkingSet) setWorkingSet(fallbackWorkingSet);
      if (fallbackSyncStatus) setSyncStatus(fallbackSyncStatus);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
