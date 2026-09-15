import { and, desc, eq, inArray } from "drizzle-orm";

import {
  clientEvidenceUploads,
  platformDiagnosticEvents,
  syncEventInbox,
} from "@/db/client-sync-schema";
import { database } from "@/db/database";
import {
  drivers,
  jobLoads,
  jobLoadWasteItems,
  jobs,
  organisations,
  sites,
  vehicles,
} from "@/db/schema";

function normalise(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function wasteItemCounts(loadIds: string[]) {
  if (loadIds.length === 0) return new Map<string, number>();

  const rows = await database
    .select({
      jobLoadId: jobLoadWasteItems.jobLoadId,
    })
    .from(jobLoadWasteItems)
    .where(inArray(jobLoadWasteItems.jobLoadId, loadIds));

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.jobLoadId, (counts.get(row.jobLoadId) ?? 0) + 1);
  }

  return counts;
}

export async function getAdminJobs(search = "") {
  const jobRows = await database
    .select({
      id: jobs.id,
      organisationId: jobs.organisationId,
      organisationName: organisations.teamName,
      jobNumber: jobs.jobNumber,
      direction: jobs.direction,
      status: jobs.status,
      jobDate: jobs.jobDate,
      plannedLoads: jobs.plannedLoads,
      ownSiteId: jobs.ownSiteId,
      ownSiteName: sites.name,
      driverId: jobs.driverId,
      driverName: drivers.name,
      vehicleId: jobs.vehicleId,
      vehicleRegistration: vehicles.registrationNumber,
    })
    .from(jobs)
    .innerJoin(organisations, eq(jobs.organisationId, organisations.id))
    .leftJoin(sites, eq(jobs.ownSiteId, sites.id))
    .leftJoin(drivers, eq(jobs.driverId, drivers.id))
    .leftJoin(vehicles, eq(jobs.vehicleId, vehicles.id))
    .orderBy(desc(jobs.jobDate))
    .limit(250);

  const ids = jobRows.map((row) => row.id);

  const loadRows =
    ids.length > 0
      ? await database
          .select({
            id: jobLoads.id,
            jobId: jobLoads.jobId,
            status: jobLoads.status,
          })
          .from(jobLoads)
          .where(inArray(jobLoads.jobId, ids))
      : [];

  const counts = await wasteItemCounts(loadRows.map((row) => row.id));

  const loadsByJob = new Map<
    string,
    { total: number; completed: number; wasteItems: number }
  >();

  for (const load of loadRows) {
    const current = loadsByJob.get(load.jobId) ?? {
      total: 0,
      completed: 0,
      wasteItems: 0,
    };

    current.total += 1;
    if (load.status === "completed") current.completed += 1;
    current.wasteItems += counts.get(load.id) ?? 0;
    loadsByJob.set(load.jobId, current);
  }

  const needle = normalise(search);

  return jobRows
    .map((job) => ({
      ...job,
      loads: loadsByJob.get(job.id) ?? {
        total: 0,
        completed: 0,
        wasteItems: 0,
      },
    }))
    .filter((job) => {
      if (!needle) return true;

      return [
        job.jobNumber,
        job.organisationName,
        job.status,
        job.direction,
        job.ownSiteName,
        job.driverName,
        job.vehicleRegistration,
      ].some((value) => normalise(value).includes(needle));
    });
}

export async function getAdminLoads(search = "") {
  const loadRows = await database
    .select({
      id: jobLoads.id,
      organisationId: jobLoads.organisationId,
      organisationName: organisations.teamName,
      jobId: jobLoads.jobId,
      jobNumber: jobs.jobNumber,
      loadNumber: jobLoads.loadNumber,
      status: jobLoads.status,
      direction: jobLoads.direction,
      movementAt: jobLoads.movementAt,
      receivedAt: jobLoads.receivedAt,
      completedAt: jobLoads.completedAt,
      ownSiteId: jobLoads.ownSiteId,
      ownSiteName: sites.name,
      driverId: jobLoads.driverId,
      driverName: drivers.name,
      vehicleId: jobLoads.vehicleId,
      vehicleRegistration: vehicles.registrationNumber,
      grossWeight: jobLoads.grossWeight,
      tareWeight: jobLoads.tareWeight,
      netWeight: jobLoads.netWeight,
      weightMetric: jobLoads.weightMetric,
      weightSource: jobLoads.weightSource,
      weightIsEstimate: jobLoads.weightIsEstimate,
      ticketNumber: jobLoads.ticketNumber,
      createdAt: jobLoads.createdAt,
      updatedAt: jobLoads.updatedAt,
    })
    .from(jobLoads)
    .innerJoin(jobs, eq(jobLoads.jobId, jobs.id))
    .innerJoin(organisations, eq(jobLoads.organisationId, organisations.id))
    .leftJoin(sites, eq(jobLoads.ownSiteId, sites.id))
    .leftJoin(drivers, eq(jobLoads.driverId, drivers.id))
    .leftJoin(vehicles, eq(jobLoads.vehicleId, vehicles.id))
    .orderBy(desc(jobLoads.updatedAt))
    .limit(500);

  const counts = await wasteItemCounts(loadRows.map((row) => row.id));
  const needle = normalise(search);

  return loadRows
    .map((load) => ({
      ...load,
      wasteItemCount: counts.get(load.id) ?? 0,
    }))
    .filter((load) => {
      if (!needle) return true;

      return [
        load.jobNumber,
        load.loadNumber,
        load.organisationName,
        load.status,
        load.direction,
        load.ownSiteName,
        load.driverName,
        load.vehicleRegistration,
        load.ticketNumber,
      ].some((value) => normalise(value).includes(needle));
    });
}

export async function getAdminJob(jobId: string) {
  const [job] = await database
    .select({
      id: jobs.id,
      organisationId: jobs.organisationId,
      organisationName: organisations.teamName,
      jobNumber: jobs.jobNumber,
      direction: jobs.direction,
      status: jobs.status,
      jobDate: jobs.jobDate,
      plannedLoads: jobs.plannedLoads,
      ownSiteId: jobs.ownSiteId,
      ownSiteName: sites.name,
      driverId: jobs.driverId,
      driverName: drivers.name,
      vehicleId: jobs.vehicleId,
      vehicleRegistration: vehicles.registrationNumber,
      purchaseOrder: jobs.purchaseOrder,
      customerReference: jobs.customerReference,
    })
    .from(jobs)
    .innerJoin(organisations, eq(jobs.organisationId, organisations.id))
    .leftJoin(sites, eq(jobs.ownSiteId, sites.id))
    .leftJoin(drivers, eq(jobs.driverId, drivers.id))
    .leftJoin(vehicles, eq(jobs.vehicleId, vehicles.id))
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (!job) return null;

  const loads = await database
    .select({
      id: jobLoads.id,
      loadNumber: jobLoads.loadNumber,
      status: jobLoads.status,
      direction: jobLoads.direction,
      movementAt: jobLoads.movementAt,
      receivedAt: jobLoads.receivedAt,
      completedAt: jobLoads.completedAt,
      ownSiteName: sites.name,
      driverName: drivers.name,
      vehicleRegistration: vehicles.registrationNumber,
      grossWeight: jobLoads.grossWeight,
      tareWeight: jobLoads.tareWeight,
      netWeight: jobLoads.netWeight,
      weightMetric: jobLoads.weightMetric,
      ticketNumber: jobLoads.ticketNumber,
      updatedAt: jobLoads.updatedAt,
    })
    .from(jobLoads)
    .leftJoin(sites, eq(jobLoads.ownSiteId, sites.id))
    .leftJoin(drivers, eq(jobLoads.driverId, drivers.id))
    .leftJoin(vehicles, eq(jobLoads.vehicleId, vehicles.id))
    .where(eq(jobLoads.jobId, jobId))
    .orderBy(jobLoads.loadNumber);

  const counts = await wasteItemCounts(loads.map((load) => load.id));

  return {
    ...job,
    loads: loads.map((load) => ({
      ...load,
      wasteItemCount: counts.get(load.id) ?? 0,
    })),
  };
}

export async function getAdminLoad(loadId: string) {
  const [load] = await database
    .select({
      id: jobLoads.id,
      organisationId: jobLoads.organisationId,
      organisationName: organisations.teamName,
      jobId: jobLoads.jobId,
      jobNumber: jobs.jobNumber,
      jobDate: jobs.jobDate,
      loadNumber: jobLoads.loadNumber,
      status: jobLoads.status,
      direction: jobLoads.direction,
      movementAt: jobLoads.movementAt,
      receivedAt: jobLoads.receivedAt,
      completedAt: jobLoads.completedAt,
      ownSiteId: jobLoads.ownSiteId,
      ownSiteName: sites.name,
      driverId: jobLoads.driverId,
      driverName: drivers.name,
      vehicleId: jobLoads.vehicleId,
      vehicleRegistration: vehicles.registrationNumber,
      grossWeight: jobLoads.grossWeight,
      tareWeight: jobLoads.tareWeight,
      netWeight: jobLoads.netWeight,
      weightMetric: jobLoads.weightMetric,
      weightSource: jobLoads.weightSource,
      weightIsEstimate: jobLoads.weightIsEstimate,
      ticketNumber: jobLoads.ticketNumber,
      purchaseOrder: jobLoads.purchaseOrder,
      customerReference: jobLoads.customerReference,
      createdAt: jobLoads.createdAt,
      updatedAt: jobLoads.updatedAt,
    })
    .from(jobLoads)
    .innerJoin(jobs, eq(jobLoads.jobId, jobs.id))
    .innerJoin(organisations, eq(jobLoads.organisationId, organisations.id))
    .leftJoin(sites, eq(jobLoads.ownSiteId, sites.id))
    .leftJoin(drivers, eq(jobLoads.driverId, drivers.id))
    .leftJoin(vehicles, eq(jobLoads.vehicleId, vehicles.id))
    .where(eq(jobLoads.id, loadId))
    .limit(1);

  if (!load) return null;

  const [wasteItems, evidence, syncEvents] = await Promise.all([
    database
      .select({
        id: jobLoadWasteItems.id,
        itemNumber: jobLoadWasteItems.itemNumber,
        ewcCodeSnapshot: jobLoadWasteItems.ewcCodeSnapshot,
        wasteDescriptionSnapshot: jobLoadWasteItems.wasteDescriptionSnapshot,
        physicalFormSnapshot: jobLoadWasteItems.physicalFormSnapshot,
        numberOfContainers: jobLoadWasteItems.numberOfContainers,
        containerTypeSnapshot: jobLoadWasteItems.containerTypeSnapshot,
        containsPops: jobLoadWasteItems.containsPops,
        containsHazardous: jobLoadWasteItems.containsHazardous,
        disposalRecoveryCodeSnapshot:
          jobLoadWasteItems.disposalRecoveryCodeSnapshot,
        weightMetric: jobLoadWasteItems.weightMetric,
        weightAmount: jobLoadWasteItems.weightAmount,
        weightIsEstimate: jobLoadWasteItems.weightIsEstimate,
        weightSource: jobLoadWasteItems.weightSource,
        permitEwcMatchType: jobLoadWasteItems.permitEwcMatchType,
        regulatoryRuleKeySnapshot:
          jobLoadWasteItems.regulatoryRuleKeySnapshot,
        regulatoryRuleScopeSnapshot:
          jobLoadWasteItems.regulatoryRuleScopeSnapshot,
        qualifyingAuthorisationRefSnapshot:
          jobLoadWasteItems.qualifyingAuthorisationRefSnapshot,
        permitEwcBasis: jobLoadWasteItems.permitEwcBasis,
        permitEwcReference: jobLoadWasteItems.permitEwcReference,
        permitEwcCodeSnapshot: jobLoadWasteItems.permitEwcCodeSnapshot,
        permitEwcCheckedAt: jobLoadWasteItems.permitEwcCheckedAt,
      })
      .from(jobLoadWasteItems)
      .where(eq(jobLoadWasteItems.jobLoadId, loadId))
      .orderBy(jobLoadWasteItems.itemNumber),

    database
      .select({
        evidenceId: clientEvidenceUploads.evidenceId,
        deviceId: clientEvidenceUploads.deviceId,
        userId: clientEvidenceUploads.userId,
        fileName: clientEvidenceUploads.fileName,
        contentType: clientEvidenceUploads.contentType,
        byteSize: clientEvidenceUploads.byteSize,
        status: clientEvidenceUploads.status,
        uploadedAt: clientEvidenceUploads.uploadedAt,
        createdAt: clientEvidenceUploads.createdAt,
        updatedAt: clientEvidenceUploads.updatedAt,
      })
      .from(clientEvidenceUploads)
      .where(
        and(
          eq(clientEvidenceUploads.organisationId, load.organisationId),
          eq(clientEvidenceUploads.entityType, "job_load"),
          eq(clientEvidenceUploads.entityId, loadId),
        ),
      )
      .orderBy(desc(clientEvidenceUploads.createdAt)),

    database
      .select({
        eventId: syncEventInbox.eventId,
        deviceId: syncEventInbox.deviceId,
        actorUserId: syncEventInbox.actorUserId,
        eventType: syncEventInbox.eventType,
        baseVersion: syncEventInbox.baseVersion,
        deviceSequence: syncEventInbox.deviceSequence,
        occurredAt: syncEventInbox.occurredAt,
        recordedAt: syncEventInbox.recordedAt,
        receivedAt: syncEventInbox.receivedAt,
        resultStatus: syncEventInbox.resultStatus,
        resultEntityVersion: syncEventInbox.resultEntityVersion,
        reasonCode: syncEventInbox.reasonCode,
      })
      .from(syncEventInbox)
      .where(
        and(
          eq(syncEventInbox.organisationId, load.organisationId),
          eq(syncEventInbox.entityType, "job_load"),
          eq(syncEventInbox.entityId, loadId),
        ),
      )
      .orderBy(desc(syncEventInbox.receivedAt)),
  ]);

  let diagnosticsStorageReady = true;
  let diagnostics: Array<{
    id: string;
    deviceId: string | null;
    userId: string | null;
    severity: string;
    category: string;
    code: string;
    operation: string;
    correlationId: string;
    safeMessage: string;
    safeContext: Record<string, string | number | boolean | null>;
    outcome: string;
    occurredAt: Date;
  }> = [];

  try {
    diagnostics = await database
      .select({
        id: platformDiagnosticEvents.id,
        deviceId: platformDiagnosticEvents.deviceId,
        userId: platformDiagnosticEvents.userId,
        severity: platformDiagnosticEvents.severity,
        category: platformDiagnosticEvents.category,
        code: platformDiagnosticEvents.code,
        operation: platformDiagnosticEvents.operation,
        correlationId: platformDiagnosticEvents.correlationId,
        safeMessage: platformDiagnosticEvents.safeMessage,
        safeContext: platformDiagnosticEvents.safeContext,
        outcome: platformDiagnosticEvents.outcome,
        occurredAt: platformDiagnosticEvents.occurredAt,
      })
      .from(platformDiagnosticEvents)
      .where(
        and(
          eq(platformDiagnosticEvents.organisationId, load.organisationId),
          eq(platformDiagnosticEvents.entityType, "job_load"),
          eq(platformDiagnosticEvents.entityId, loadId),
        ),
      )
      .orderBy(desc(platformDiagnosticEvents.occurredAt))
      .limit(100);
  } catch {
    diagnosticsStorageReady = false;
  }

  return {
    ...load,
    wasteItems,
    evidence,
    syncEvents,
    diagnostics,
    diagnosticsStorageReady,
  };
}
