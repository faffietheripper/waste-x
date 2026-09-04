import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

import {
  clientDevices,
  syncEntityVersions,
} from "@/db/client-sync-schema";
import { database } from "@/db/database";
import { jobLoadFieldStates } from "@/db/mobile-field-schema";
import { drivers, jobLoads, jobs, users } from "@/db/schema";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { loadId: string } },
) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const device = await database.query.clientDevices.findFirst({
      where: and(
        eq(clientDevices.id, context.deviceId),
        eq(clientDevices.organisationId, context.organisationId),
        eq(clientDevices.deviceType, "MOBILE"),
        eq(clientDevices.status, "ACTIVE"),
      ),
      columns: { id: true },
    });

    if (!device) {
      return clientApiError(
        "MOBILE_DEVICE_REQUIRED",
        403,
        "This certification endpoint is available only to an authorised Waste X Mobile device.",
      );
    }

    const user = await database.query.users.findFirst({
      where: and(
        eq(users.id, context.userId),
        eq(users.organisationId, context.organisationId),
      ),
      columns: { id: true, email: true },
    });

    if (!user) {
      return clientApiError(
        "ACCOUNT_UNAVAILABLE",
        403,
        "This Waste X account is unavailable.",
      );
    }

    const matchedDrivers = await database
      .select({ id: drivers.id })
      .from(drivers)
      .where(
        and(
          eq(drivers.organisationId, context.organisationId),
          eq(drivers.isActive, true),
          sql`lower(trim(${drivers.email})) = ${user.email.toLowerCase().trim()}`,
        ),
      )
      .orderBy(asc(drivers.id))
      .limit(2);

    if (matchedDrivers.length !== 1) {
      return clientApiError(
        "MOBILE_DRIVER_SCOPE_UNAVAILABLE",
        403,
        "Waste X Mobile requires exactly one active Driver linked to this account.",
      );
    }

    const driverId = matchedDrivers[0]!.id;
    const [record] = await database
      .select({
        jobId: jobs.id,
        jobNumber: jobs.jobNumber,
        jobStatus: jobs.status,
        jobDriverId: jobs.driverId,
        loadId: jobLoads.id,
        loadNumber: jobLoads.loadNumber,
        loadStatus: jobLoads.status,
        loadDriverId: jobLoads.driverId,
        netWeight: jobLoads.netWeight,
        weightMetric: jobLoads.weightMetric,
        notes: jobLoads.notes,
      })
      .from(jobLoads)
      .innerJoin(
        jobs,
        and(
          eq(jobLoads.jobId, jobs.id),
          eq(jobLoads.organisationId, jobs.organisationId),
        ),
      )
      .where(
        and(
          eq(jobLoads.id, params.loadId),
          eq(jobLoads.organisationId, context.organisationId),
          or(
            eq(jobLoads.driverId, driverId),
            and(isNull(jobLoads.driverId), eq(jobs.driverId, driverId)),
          ),
        ),
      )
      .limit(1);

    if (!record) {
      return clientApiError(
        "MOBILE_LOAD_NOT_ASSIGNED",
        404,
        "This load is not assigned to the authorised Mobile Driver.",
      );
    }

    const [fieldState, versionRow] = await Promise.all([
      database.query.jobLoadFieldStates.findFirst({
        where: and(
          eq(jobLoadFieldStates.jobLoadId, record.loadId),
          eq(jobLoadFieldStates.organisationId, context.organisationId),
        ),
      }),
      database.query.syncEntityVersions.findFirst({
        where: and(
          eq(syncEntityVersions.organisationId, context.organisationId),
          eq(syncEntityVersions.entityType, "job_load"),
          eq(syncEntityVersions.entityId, record.loadId),
        ),
        columns: { version: true },
      }),
    ]);

    return clientApiJson({
      ok: true as const,
      schemaVersion: 1 as const,
      checkedAt: new Date().toISOString(),
      entityVersion: versionRow?.version ?? 0,
      job: {
        id: record.jobId,
        jobNumber: record.jobNumber,
        status: record.jobStatus,
      },
      load: {
        id: record.loadId,
        loadNumber: record.loadNumber,
        status: record.loadStatus,
        netWeight: record.netWeight,
        weightMetric: record.weightMetric,
        notes: record.notes,
      },
      fieldWorkflow: fieldState
        ? {
            step: fieldState.step,
            updatedAt: fieldState.occurredAt?.toISOString() ?? null,
            lastEventType: fieldState.lastEventType,
          }
        : null,
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
