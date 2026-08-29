import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  ne,
  or,
} from "drizzle-orm";

import {
  clientDevices,
  syncChangeFeed,
} from "@/db/client-sync-schema";
import { database } from "@/db/database";
import {
  counterparties,
  drivers,
  ewcCodes,
  jobLoads,
  jobs,
  organisations,
  permitEwcCodes,
  sitePermits,
  sites,
  users,
  vehicles,
} from "@/db/schema";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import {
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const FORWARD_DAYS = 14;

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export async function GET(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const now = new Date();
    const horizonStart = startOfUtcDay(now);
    const horizonEnd = new Date(
      horizonStart.getTime() + FORWARD_DAYS * DAY_MS,
    );

    const [
      organisation,
      device,
      organisationSites,
      organisationUsers,
      organisationDrivers,
      organisationVehicles,
      organisationCounterparties,
      organisationPermits,
      organisationPermitEwcs,
      activeEwcs,
      workingJobs,
      latestChange,
    ] = await Promise.all([
      database.query.organisations.findFirst({
        where: eq(organisations.id, context.organisationId),
        columns: {
          id: true,
          teamName: true,
          capabilities: true,
          operatingMode: true,
          industry: true,
          telephone: true,
          emailAddress: true,
          country: true,
          streetAddress: true,
          city: true,
          region: true,
          postCode: true,
          status: true,
        },
      }),
      database.query.clientDevices.findFirst({
        where: and(
          eq(clientDevices.id, context.deviceId),
          eq(clientDevices.organisationId, context.organisationId),
        ),
        columns: {
          id: true,
          organisationId: true,
          defaultSiteId: true,
          displayName: true,
          deviceType: true,
          platform: true,
          status: true,
          createdAt: true,
        },
      }),
      database
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.organisationId, context.organisationId),
            ne(sites.status, "archived"),
          ),
        )
        .orderBy(desc(sites.isDefault), asc(sites.name)),
      database
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          organisationId: users.organisationId,
          role: users.role,
          isActive: users.isActive,
          isSuspended: users.isSuspended,
          status: users.status,
        })
        .from(users)
        .where(eq(users.organisationId, context.organisationId)),
      database
        .select()
        .from(drivers)
        .where(
          and(
            eq(drivers.organisationId, context.organisationId),
            eq(drivers.isActive, true),
          ),
        ),
      database
        .select()
        .from(vehicles)
        .where(
          and(
            eq(vehicles.organisationId, context.organisationId),
            eq(vehicles.isActive, true),
          ),
        ),
      database
        .select()
        .from(counterparties)
        .where(
          and(
            eq(counterparties.organisationId, context.organisationId),
            eq(counterparties.isActive, true),
          ),
        ),
      database
        .select()
        .from(sitePermits)
        .where(eq(sitePermits.organisationId, context.organisationId)),
      database
        .select()
        .from(permitEwcCodes)
        .where(
          and(
            eq(permitEwcCodes.organisationId, context.organisationId),
            eq(permitEwcCodes.isActive, true),
          ),
        ),
      database
        .select()
        .from(ewcCodes)
        .where(eq(ewcCodes.isActive, true))
        .orderBy(asc(ewcCodes.code)),
      database
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.organisationId, context.organisationId),
            ne(jobs.status, "draft"),
            or(
              and(gte(jobs.jobDate, horizonStart), lt(jobs.jobDate, horizonEnd)),
              and(ne(jobs.status, "completed"), ne(jobs.status, "cancelled")),
            ),
          ),
        )
        .orderBy(asc(jobs.jobDate), asc(jobs.jobNumber)),
      database
        .select({ sequence: syncChangeFeed.sequence })
        .from(syncChangeFeed)
        .where(eq(syncChangeFeed.organisationId, context.organisationId))
        .orderBy(desc(syncChangeFeed.sequence))
        .limit(1),
    ]);

    const jobIds = workingJobs.map((job) => job.id);
    const workingLoads = jobIds.length
      ? await database
          .select()
          .from(jobLoads)
          .where(
            and(
              eq(jobLoads.organisationId, context.organisationId),
              inArray(jobLoads.jobId, jobIds),
            ),
          )
          .orderBy(asc(jobLoads.jobId), asc(jobLoads.loadNumber))
      : [];

    return clientApiJson({
      ok: true,
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      workingSet: {
        forwardDays: FORWARD_DAYS,
        horizonStart: horizonStart.toISOString(),
        horizonEnd: horizonEnd.toISOString(),
      },
      syncCursor:
        latestChange.length > 0 ? String(latestChange[0].sequence) : null,
      device: device
        ? {
            deviceId: device.id,
            organisationId: device.organisationId,
            defaultSiteId: device.defaultSiteId,
            displayName: device.displayName,
            deviceType: device.deviceType,
            platform: device.platform,
            status: device.status,
            registeredAt: device.createdAt?.toISOString() ?? now.toISOString(),
          }
        : null,
      organisation,
      sites: organisationSites,
      users: organisationUsers,
      jobs: workingJobs,
      jobLoads: workingLoads,
      drivers: organisationDrivers,
      vehicles: organisationVehicles,
      counterparties: organisationCounterparties,
      ewcCodes: activeEwcs,
      permits: organisationPermits,
      permitEwcCodes: organisationPermitEwcs,
      // Step 6 will replace this with a signed rolling offline entitlement.
      offlineEntitlement: null,
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
