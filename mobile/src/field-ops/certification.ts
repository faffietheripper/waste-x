import type {
  MobileAssignmentV1,
  MobileFieldCertificationCloudV1,
} from "@waste-x/contracts";

import {
  getLocalMobileAssignmentByLoadId,
  getLocalMobileAssignmentWorkingSet,
} from "@/assignments/local-working-set";
import { getMobileCollectionChecks, getMobileFieldWorkflowState } from "@/field-ops/workflow";
import { wasteXMobileApi } from "@/platform/api";
import { openMobileDatabase } from "@/storage/database";

const CERTIFICATION_KEY = "mobile_field_certification_v1";
const CURRENT_APP_BOOT_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type MobileCertificationRun = {
  loadId: string;
  jobId: string;
  jobNumber: string;
  loadNumber: number;
  startedAt: string;
  initialEntityVersion: number;
  offlineCheckpoint: {
    recordedAt: string;
    bootId: string;
    entityVersion: number;
    pendingEvents: number;
  } | null;
};

export type MobileCertificationQueueSummary = {
  total: number;
  pending: number;
  sending: number;
  synced: number;
  conflicts: number;
  failed: number;
  eventTypes: string[];
};

export type MobileCertificationSnapshot = {
  run: MobileCertificationRun | null;
  assignment: MobileAssignmentV1 | null;
  queue: MobileCertificationQueueSummary;
  cloud: MobileFieldCertificationCloudV1 | null;
  cloudError: string | null;
  driverMatched: boolean;
  assignmentCached: boolean;
  sameRecordIdentity: boolean;
  workflowStarted: boolean;
  collectionConfirmed: boolean;
  fieldDelivered: boolean;
  offlineCheckpointRecorded: boolean;
  localRecordSurvivedRestart: boolean;
  cloudQueueDrained: boolean;
  cloudIdentityMatches: boolean;
  cloudFieldStateMatches: boolean;
  noConflictOrFailure: boolean;
  fullyCertified: boolean;
};

type QueueRow = {
  entity_id: string;
  event_type: string;
  status: string;
};

type MetadataRow = {
  value: string;
};

function parseRun(value: string | null | undefined): MobileCertificationRun | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as MobileCertificationRun;
    if (!parsed.loadId || !parsed.jobId || !parsed.jobNumber) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeRun(run: MobileCertificationRun | null) {
  const database = await openMobileDatabase();
  if (!run) {
    await database.runAsync("DELETE FROM local_sync_metadata WHERE key = ?", CERTIFICATION_KEY);
    return;
  }

  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO local_sync_metadata (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    CERTIFICATION_KEY,
    JSON.stringify(run),
    now,
  );
}

export async function getMobileCertificationRun() {
  const database = await openMobileDatabase();
  const row = await database.getFirstAsync<MetadataRow>(
    "SELECT value FROM local_sync_metadata WHERE key = ?",
    CERTIFICATION_KEY,
  );
  return parseRun(row?.value);
}

export async function startMobileFieldCertification(assignment: MobileAssignmentV1) {
  const workingSet = await getLocalMobileAssignmentWorkingSet();
  if (workingSet.scope?.resolution !== "MATCHED" || !workingSet.scope.driver) {
    throw new Error("A uniquely matched Waste X Driver is required before certification can start.");
  }

  const cached = await getLocalMobileAssignmentByLoadId(assignment.load.id);
  if (!cached) {
    throw new Error("The selected load is not present in the encrypted Mobile working set.");
  }

  const run: MobileCertificationRun = {
    loadId: cached.load.id,
    jobId: cached.job.id,
    jobNumber: cached.job.jobNumber,
    loadNumber: cached.load.loadNumber,
    startedAt: new Date().toISOString(),
    initialEntityVersion: cached.load.entityVersion,
    offlineCheckpoint: null,
  };
  await writeRun(run);
  return getMobileCertificationSnapshot(false);
}

export async function recordMobileOfflineCertificationCheckpoint(online: boolean) {
  if (online) {
    throw new Error("Turn connectivity off and refresh Waste X Mobile before recording the offline checkpoint.");
  }

  const run = await getMobileCertificationRun();
  if (!run) throw new Error("Start a Mobile certification run first.");

  const assignment = await getLocalMobileAssignmentByLoadId(run.loadId);
  if (!assignment) {
    throw new Error("The certification load is no longer available in the encrypted working set.");
  }

  const queue = await getQueueSummary(run.loadId);
  if (queue.pending + queue.sending <= 0) {
    throw new Error("Perform at least one field action while offline so Waste X has a queued event to certify.");
  }
  if (assignment.load.entityVersion <= run.initialEntityVersion) {
    throw new Error("Advance the selected field job after starting certification before recording the offline checkpoint.");
  }

  const updated: MobileCertificationRun = {
    ...run,
    offlineCheckpoint: {
      recordedAt: new Date().toISOString(),
      bootId: CURRENT_APP_BOOT_ID,
      entityVersion: assignment.load.entityVersion,
      pendingEvents: queue.pending + queue.sending,
    },
  };
  await writeRun(updated);
  return getMobileCertificationSnapshot(false);
}

export async function clearMobileFieldCertification() {
  await writeRun(null);
}

async function getQueueSummary(loadId: string): Promise<MobileCertificationQueueSummary> {
  const database = await openMobileDatabase();
  const rows = await database.getAllAsync<QueueRow>(
    `SELECT entity_id, event_type, status
     FROM local_sync_queue
     WHERE entity_type = 'job_load' AND entity_id = ?
     ORDER BY device_sequence ASC`,
    loadId,
  );

  const count = (status: string) => rows.filter((row) => row.status === status).length;
  return {
    total: rows.length,
    pending: count("PENDING"),
    sending: count("SENDING"),
    synced: count("SYNCED"),
    conflicts: count("CONFLICT"),
    failed: count("FAILED"),
    eventTypes: Array.from(new Set(rows.map((row) => row.event_type))),
  };
}

export async function getMobileCertificationSnapshot(
  checkCloud = false,
): Promise<MobileCertificationSnapshot> {
  const [run, workingSet] = await Promise.all([
    getMobileCertificationRun(),
    getLocalMobileAssignmentWorkingSet(),
  ]);

  const assignment = run
    ? await getLocalMobileAssignmentByLoadId(run.loadId)
    : null;
  const queue = run
    ? await getQueueSummary(run.loadId)
    : {
        total: 0,
        pending: 0,
        sending: 0,
        synced: 0,
        conflicts: 0,
        failed: 0,
        eventTypes: [],
      };

  let cloud: MobileFieldCertificationCloudV1 | null = null;
  let cloudError: string | null = null;
  if (run && checkCloud) {
    try {
      cloud = await wasteXMobileApi.certifyMobileLoad(run.loadId);
    } catch (reason) {
      cloudError = reason instanceof Error ? reason.message : String(reason);
    }
  }

  const driverMatched =
    workingSet.scope?.resolution === "MATCHED" && Boolean(workingSet.scope.driver);
  const assignmentCached = Boolean(assignment);
  const sameRecordIdentity = Boolean(
    run &&
      assignment &&
      assignment.load.id === run.loadId &&
      assignment.job.id === run.jobId,
  );
  const workflow = assignment ? getMobileFieldWorkflowState(assignment) : null;
  const workflowStarted = Boolean(workflow && workflow.step !== "ASSIGNED");
  const collectionChecks = assignment ? getMobileCollectionChecks(assignment) : null;
  const collectionConfirmed = Boolean(
    collectionChecks?.wasteConfirmedAt && collectionChecks?.quantityConfirmedAt,
  );
  const fieldDelivered = workflow?.step === "DELIVERED";
  const offlineCheckpointRecorded = Boolean(run?.offlineCheckpoint);
  const localRecordSurvivedRestart = Boolean(
    run?.offlineCheckpoint &&
      run.offlineCheckpoint.bootId !== CURRENT_APP_BOOT_ID &&
      assignment &&
      assignment.load.entityVersion >= run.offlineCheckpoint.entityVersion,
  );
  const cloudQueueDrained = Boolean(
    run &&
      queue.total > 0 &&
      queue.synced > 0 &&
      queue.pending === 0 &&
      queue.sending === 0,
  );
  const cloudIdentityMatches = Boolean(
    run &&
      assignment &&
      cloud &&
      cloud.job.id === run.jobId &&
      cloud.load.id === run.loadId &&
      cloud.job.id === assignment.job.id &&
      cloud.load.id === assignment.load.id,
  );
  const cloudFieldStateMatches = Boolean(
    workflow && cloud?.fieldWorkflow && cloud.fieldWorkflow.step === workflow.step,
  );
  const noConflictOrFailure = queue.conflicts === 0 && queue.failed === 0;

  const fullyCertified = Boolean(
    run &&
      driverMatched &&
      assignmentCached &&
      sameRecordIdentity &&
      workflowStarted &&
      collectionConfirmed &&
      fieldDelivered &&
      offlineCheckpointRecorded &&
      localRecordSurvivedRestart &&
      cloudQueueDrained &&
      cloudIdentityMatches &&
      cloudFieldStateMatches &&
      noConflictOrFailure,
  );

  return {
    run,
    assignment,
    queue,
    cloud,
    cloudError,
    driverMatched,
    assignmentCached,
    sameRecordIdentity,
    workflowStarted,
    collectionConfirmed,
    fieldDelivered,
    offlineCheckpointRecorded,
    localRecordSurvivedRestart,
    cloudQueueDrained,
    cloudIdentityMatches,
    cloudFieldStateMatches,
    noConflictOrFailure,
    fullyCertified,
  };
}
