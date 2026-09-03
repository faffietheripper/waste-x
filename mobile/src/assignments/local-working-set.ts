import type {
  MobileAssignmentBootstrapV1,
  MobileAssignmentV1,
  MobileDriverIdentityV1,
  MobileDriverScopeResolutionV1,
} from "@waste-x/contracts";

import { wasteXMobileApi } from "@/platform/api";
import { openMobileDatabase } from "@/storage/database";
import { getMobileAuthProfile } from "@/storage/secure";

export type LocalMobileAssignmentWorkingSet = {
  available: boolean;
  generatedAt: string | null;
  refreshedAt: string | null;
  horizonStart: string | null;
  horizonEnd: string | null;
  scope: {
    resolution: MobileDriverScopeResolutionV1;
    userId: string;
    driver: MobileDriverIdentityV1 | null;
  } | null;
  assignments: MobileAssignmentV1[];
};

type BootstrapStateRow = {
  scope_resolution: MobileDriverScopeResolutionV1;
  user_id: string;
  driver_json: string | null;
  generated_at: string;
  horizon_start: string;
  horizon_end: string;
  refreshed_at: string;
};

type AssignmentRow = {
  payload_json: string;
};

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function getLocalMobileAssignmentWorkingSet(): Promise<LocalMobileAssignmentWorkingSet> {
  const database = await openMobileDatabase();
  const state = await database.getFirstAsync<BootstrapStateRow>(
    `SELECT
       scope_resolution,
       user_id,
       driver_json,
       generated_at,
       horizon_start,
       horizon_end,
       refreshed_at
     FROM local_mobile_bootstrap_state
     WHERE singleton_id = 1`,
  );

  if (!state) {
    return {
      available: false,
      generatedAt: null,
      refreshedAt: null,
      horizonStart: null,
      horizonEnd: null,
      scope: null,
      assignments: [],
    };
  }

  const rows = await database.getAllAsync<AssignmentRow>(
    `SELECT payload_json
     FROM local_mobile_assignment
     ORDER BY job_date ASC, job_number ASC, load_number ASC`,
  );

  const assignments = rows
    .map((row) => parseJson<MobileAssignmentV1>(row.payload_json))
    .filter((assignment): assignment is MobileAssignmentV1 => Boolean(assignment));

  return {
    available: true,
    generatedAt: state.generated_at,
    refreshedAt: state.refreshed_at,
    horizonStart: state.horizon_start,
    horizonEnd: state.horizon_end,
    scope: {
      resolution: state.scope_resolution,
      userId: state.user_id,
      driver: parseJson<MobileDriverIdentityV1>(state.driver_json),
    },
    assignments,
  };
}

export async function persistMobileAssignmentBootstrap(
  bootstrap: MobileAssignmentBootstrapV1,
): Promise<LocalMobileAssignmentWorkingSet> {
  if (bootstrap.schemaVersion !== 1) {
    throw new Error("Waste X Mobile received an unsupported assignment bootstrap version.");
  }

  const profile = await getMobileAuthProfile();
  if (!profile || profile.userId !== bootstrap.scope.userId) {
    throw new Error("Waste X Mobile refused an assignment bootstrap for another user.");
  }

  const database = await openMobileDatabase();
  const refreshedAt = new Date().toISOString();

  await database.withTransactionAsync(async () => {
    // The Cloud response is the complete authorised snapshot for this user and
    // horizon. Replacing it transactionally prevents stale assignments from a
    // previous driver scope remaining visible after reassignment.
    await database.runAsync("DELETE FROM local_mobile_assignment");

    for (const assignment of bootstrap.assignments) {
      await database.runAsync(
        `INSERT INTO local_mobile_assignment (
           load_id,
           job_id,
           job_number,
           job_date,
           job_status,
           direction,
           load_number,
           load_status,
           entity_version,
           driver_id,
           vehicle_id,
           ewc_code,
           payload_json,
           refreshed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        assignment.load.id,
        assignment.job.id,
        assignment.job.jobNumber,
        assignment.job.jobDate,
        assignment.job.status,
        assignment.load.direction,
        assignment.load.loadNumber,
        assignment.load.status,
        assignment.load.entityVersion,
        assignment.transport.driverId,
        assignment.transport.vehicleId,
        assignment.load.ewcCode,
        JSON.stringify(assignment),
        refreshedAt,
      );
    }

    await database.runAsync(
      `INSERT INTO local_mobile_bootstrap_state (
         singleton_id,
         scope_resolution,
         user_id,
         driver_json,
         generated_at,
         horizon_start,
         horizon_end,
         refreshed_at
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(singleton_id) DO UPDATE SET
         scope_resolution = excluded.scope_resolution,
         user_id = excluded.user_id,
         driver_json = excluded.driver_json,
         generated_at = excluded.generated_at,
         horizon_start = excluded.horizon_start,
         horizon_end = excluded.horizon_end,
         refreshed_at = excluded.refreshed_at`,
      bootstrap.scope.resolution,
      bootstrap.scope.userId,
      bootstrap.scope.driver ? JSON.stringify(bootstrap.scope.driver) : null,
      bootstrap.generatedAt,
      bootstrap.workingSet.horizonStart,
      bootstrap.workingSet.horizonEnd,
      refreshedAt,
    );

    await database.runAsync(
      `UPDATE local_device_configuration
       SET organisation_id = ?, user_id = ?, updated_at = ?
       WHERE singleton_id = 1`,
      profile.organisationId,
      profile.userId,
      refreshedAt,
    );
  });

  return getLocalMobileAssignmentWorkingSet();
}

export async function refreshMobileAssignmentWorkingSet() {
  const bootstrap = await wasteXMobileApi.bootstrapMobile();
  return persistMobileAssignmentBootstrap(bootstrap);
}

export async function clearMobileAssignmentWorkingSet() {
  const database = await openMobileDatabase();
  const now = new Date().toISOString();

  await database.withTransactionAsync(async () => {
    await database.runAsync("DELETE FROM local_mobile_assignment");
    await database.runAsync("DELETE FROM local_mobile_bootstrap_state");
    await database.runAsync(
      `UPDATE local_device_configuration
       SET organisation_id = NULL, user_id = NULL, updated_at = ?
       WHERE singleton_id = 1`,
      now,
    );
  });
}
