import { desc, eq, gte, ilike, or } from "drizzle-orm";

import { database } from "@/db/database";
import {
  auditEvents,
  errorLogs,
  jobLoads,
  jobs,
  organisations,
  reportExports,
  supportTickets,
  users,
  wasteTrackingSubmissions,
} from "@/db/schema";

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function toTonnes(amount: string | number | null | undefined, metric: string | null | undefined) {
  const numeric = Number(amount ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  if (metric === "Kilograms") return numeric / 1000;
  if (metric === "Grams") return numeric / 1_000_000;
  return numeric;
}

export async function getAdminControlTowerData() {
  const since7 = daysAgo(7);
  const since1 = daysAgo(1);

  const [
    allOrganisations,
    allUsers,
    allSites,
    allPermits,
    allMaterials,
    dwtSettings,
    jobs7,
    loads7,
    dwt24,
    support,
    errors,
    activity,
  ] = await Promise.all([
    database.query.organisations.findMany({
      orderBy: [desc(organisations.createdAt)],
    }),
    database.query.users.findMany({
      columns: {
        id: true,
        organisationId: true,
        role: true,
        status: true,
        isActive: true,
        isSuspended: true,
        lastSeenAt: true,
        lastLoginAt: true,
      },
    }),
    database.query.sites.findMany({
      columns: {
        id: true,
        organisationId: true,
        siteType: true,
        status: true,
      },
    }),
    database.query.sitePermits.findMany({
      columns: {
        id: true,
        organisationId: true,
        status: true,
        isPrimary: true,
      },
    }),
    database.query.materialProfiles.findMany({
      columns: {
        id: true,
        organisationId: true,
        isActive: true,
      },
    }),
    database.query.wasteTrackingOrganisationSettings.findMany(),
    database.query.jobs.findMany({
      where: gte(jobs.createdAt, since7),
      columns: {
        id: true,
        organisationId: true,
        createdAt: true,
        status: true,
      },
    }),
    database.query.jobLoads.findMany({
      where: gte(jobLoads.updatedAt, since7),
      columns: {
        id: true,
        organisationId: true,
        status: true,
        completedAt: true,
        updatedAt: true,
        netWeight: true,
        weightMetric: true,
      },
    }),
    database.query.wasteTrackingSubmissions.findMany({
      where: gte(wasteTrackingSubmissions.createdAt, since1),
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
      limit: 250,
    }),
    database.query.supportTickets.findMany({
      with: {
        organisation: true,
        createdBy: true,
        assignedTo: true,
      },
      orderBy: [desc(supportTickets.updatedAt)],
      limit: 50,
    }),
    database.query.errorLogs.findMany({
      orderBy: [desc(errorLogs.createdAt)],
      limit: 100,
    }),
    database.query.auditEvents.findMany({
      with: {
        organisation: true,
        user: true,
      },
      orderBy: [desc(auditEvents.createdAt)],
      limit: 30,
    }),
  ]);

  const settingByOrganisation = new Map(
    dwtSettings.map((setting) => [setting.organisationId, setting]),
  );

  const readiness = allOrganisations.map((organisation) => {
    const hasReceivingSite = allSites.some(
      (site) =>
        site.organisationId === organisation.id &&
        site.siteType === "waste_receiving_site" &&
        site.status === "active",
    );

    const hasPermit = allPermits.some(
      (permit) =>
        permit.organisationId === organisation.id &&
        permit.status === "active" &&
        permit.isPrimary,
    );

    const hasMaterials = allMaterials.some(
      (material) => material.organisationId === organisation.id && material.isActive,
    );

    const dwt = settingByOrganisation.get(organisation.id);
    const dwtReady = Boolean(dwt?.isEnabled && dwt?.apiCode);

    const hasActiveUser = allUsers.some(
      (user) =>
        user.organisationId === organisation.id &&
        user.isActive &&
        !user.isSuspended,
    );

    const checks = [hasReceivingSite, hasPermit, hasMaterials, dwtReady, hasActiveUser];

    return {
      organisation,
      hasReceivingSite,
      hasPermit,
      hasMaterials,
      dwtReady,
      hasActiveUser,
      readyCount: checks.filter(Boolean).length,
      totalChecks: checks.length,
    };
  });

  const dwtAccepted = dwt24.filter((row) =>
    ["accepted", "accepted_with_warnings"].includes(row.status),
  ).length;

  const dwtWarnings = dwt24.filter(
    (row) => row.status === "accepted_with_warnings",
  ).length;

  const dwtNeedsAttention = dwt24.filter((row) =>
    ["rejected", "failed"].includes(row.status),
  ).length;

  const openSupport = support.filter((ticket) =>
    ["open", "in_progress", "waiting_on_user"].includes(ticket.status),
  );

  const unresolvedErrors = errors.filter((error) => !error.resolved);

  const completedLoads7 = loads7.filter((load) => load.status === "completed");
  const tonnes7 = completedLoads7.reduce(
    (total, load) => total + toTonnes(load.netWeight, load.weightMetric),
    0,
  );

  const organisationsBookingJobs7 = new Set(jobs7.map((job) => job.organisationId)).size;

  return {
    organisations: {
      total: allOrganisations.length,
      active: allOrganisations.filter((org) => org.status === "ACTIVE" && !org.isSuspended).length,
      pending: allOrganisations.filter((org) => org.status === "PENDING").length,
      suspended: allOrganisations.filter((org) => org.status === "SUSPENDED" || org.isSuspended).length,
      recent: allOrganisations.slice(0, 6),
      readiness,
      needsSetup: readiness
        .filter((item) => item.organisation.status === "ACTIVE" && item.readyCount < item.totalChecks)
        .sort((a, b) => a.readyCount - b.readyCount)
        .slice(0, 6),
    },
    users: {
      total: allUsers.length,
      active: allUsers.filter((user) => user.isActive && !user.isSuspended).length,
      invited: allUsers.filter((user) => user.status === "INVITED").length,
      suspended: allUsers.filter((user) => user.isSuspended).length,
      platformAdmins: allUsers.filter((user) => user.role === "platform_admin").length,
    },
    operations: {
      jobs7: jobs7.length,
      completedLoads7: completedLoads7.length,
      tonnes7,
      organisationsBookingJobs7,
    },
    dwt: {
      enabledOrganisations: dwtSettings.filter((setting) => setting.isEnabled).length,
      attempts24: dwt24.length,
      accepted24: dwtAccepted,
      warnings24: dwtWarnings,
      needsAttention24: dwtNeedsAttention,
      latest: dwt24[0] ?? null,
    },
    support: {
      open: openSupport.length,
      urgent: openSupport.filter((ticket) => ticket.priority === "urgent").length,
      unassigned: openSupport.filter((ticket) => !ticket.assignedToUserId).length,
      recent: support.slice(0, 6),
    },
    system: {
      unresolvedErrors: unresolvedErrors.length,
      criticalErrors: unresolvedErrors.filter((error) => error.severity === "critical").length,
      externalErrors: unresolvedErrors.filter((error) => error.layer === "external").length,
      recentErrors: unresolvedErrors.slice(0, 5),
    },
    activity,
  };
}

export async function getAdminOrganisationSummaries(search = "") {
  const where = search
    ? or(
        ilike(organisations.teamName, `%${search}%`),
        ilike(organisations.emailAddress, `%${search}%`),
      )
    : undefined;

  const orgs = await database.query.organisations.findMany({
    where,
    with: {
      members: {
        columns: {
          id: true,
          isActive: true,
          isSuspended: true,
          lastSeenAt: true,
        },
      },
      sites: {
        columns: {
          id: true,
          siteType: true,
          status: true,
        },
      },
      sitePermits: {
        columns: {
          id: true,
          status: true,
          isPrimary: true,
        },
      },
      materialProfiles: {
        columns: {
          id: true,
          isActive: true,
        },
      },
      jobs: {
        columns: {
          id: true,
          createdAt: true,
        },
      },
      jobLoads: {
        columns: {
          id: true,
          status: true,
          updatedAt: true,
        },
      },
      wasteTrackingSettings: true,
      wasteTrackingSubmissions: {
        columns: {
          id: true,
          status: true,
          createdAt: true,
        },
      },
    },
    orderBy: [desc(organisations.createdAt)],
  });

  return orgs.map((org) => {
    const hasReceivingSite = org.sites.some(
      (site) => site.siteType === "waste_receiving_site" && site.status === "active",
    );
    const hasPermit = org.sitePermits.some(
      (permit) => permit.status === "active" && permit.isPrimary,
    );
    const hasMaterials = org.materialProfiles.some((material) => material.isActive);
    const dwtReady = Boolean(org.wasteTrackingSettings?.isEnabled && org.wasteTrackingSettings?.apiCode);

    const timestamps = [
      ...org.members.map((member) => member.lastSeenAt),
      ...org.jobs.map((job) => job.createdAt),
      ...org.jobLoads.map((load) => load.updatedAt),
      ...org.wasteTrackingSubmissions.map((submission) => submission.createdAt),
    ]
      .filter((value): value is Date => value instanceof Date)
      .map((value) => value.getTime());

    const lastActivity = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;

    return {
      id: org.id,
      teamName: org.teamName,
      emailAddress: org.emailAddress,
      industry: org.industry,
      status: org.status,
      isSuspended: org.isSuspended,
      operatingMode: org.operatingMode,
      subscriptionPlan: org.subscriptionPlan,
      subscriptionStatus: org.subscriptionStatus,
      createdAt: org.createdAt,
      memberCount: org.members.length,
      activeMemberCount: org.members.filter((member) => member.isActive && !member.isSuspended).length,
      jobsCount: org.jobs.length,
      loadsCount: org.jobLoads.length,
      dwtCount: org.wasteTrackingSubmissions.length,
      dwtFailures: org.wasteTrackingSubmissions.filter((submission) =>
        ["rejected", "failed"].includes(submission.status),
      ).length,
      hasReceivingSite,
      hasPermit,
      hasMaterials,
      dwtReady,
      readinessScore: [hasReceivingSite, hasPermit, hasMaterials, dwtReady].filter(Boolean).length,
      lastActivity,
    };
  });
}

export async function getAdminOrganisationOverview(organisationId: string) {
  return database.query.organisations.findFirst({
    where: eq(organisations.id, organisationId),
    with: {
      members: true,
      sites: true,
      sitePermits: {
        with: {
          permittedEwcCodes: true,
        },
      },
      materialProfiles: true,
      jobs: true,
      jobLoads: true,
      wasteTrackingSettings: true,
      wasteTrackingSubmissions: {
        orderBy: [desc(wasteTrackingSubmissions.createdAt)],
        limit: 50,
      },
    },
  });
}

export async function getAdminUsers(search = "") {
  const where = search
    ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
    : undefined;

  return database.query.users.findMany({
    where,
    with: {
      organisation: true,
    },
    orderBy: [desc(users.createdAt)],
  });
}

export async function getAdminUser(userId: string) {
  return database.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      organisation: true,
      profile: true,
      createdJobs: {
        columns: { id: true, status: true, createdAt: true },
      },
      createdJobLoads: {
        columns: { id: true, status: true, updatedAt: true },
      },
      wasteTrackingSubmissionsSubmitted: {
        columns: { id: true, status: true, createdAt: true },
      },
    },
  });
}

export async function getAdminAuditFeed(limit = 150) {
  return database.query.auditEvents.findMany({
    with: {
      organisation: true,
      user: true,
    },
    orderBy: [desc(auditEvents.createdAt)],
    limit,
  });
}

export async function getAdminPlatformReportData(days = 30) {
  const safeDays = [7, 30, 90].includes(days) ? days : 30;
  const since = daysAgo(safeDays);

  const [periodJobs, periodLoads, periodDwt, exports] = await Promise.all([
    database.query.jobs.findMany({
      where: gte(jobs.createdAt, since),
      columns: { id: true, organisationId: true, status: true, createdAt: true },
    }),
    database.query.jobLoads.findMany({
      where: gte(jobLoads.updatedAt, since),
      columns: {
        id: true,
        organisationId: true,
        status: true,
        netWeight: true,
        weightMetric: true,
        updatedAt: true,
      },
    }),
    database.query.wasteTrackingSubmissions.findMany({
      where: gte(wasteTrackingSubmissions.createdAt, since),
      columns: {
        id: true,
        organisationId: true,
        status: true,
        createdAt: true,
      },
    }),
    database.query.reportExports.findMany({
      with: {
        organisation: true,
        requestedBy: true,
      },
      orderBy: [desc(reportExports.createdAt)],
      limit: 50,
    }),
  ]);

  const completedLoads = periodLoads.filter((load) => load.status === "completed");
  const tonnes = completedLoads.reduce(
    (total, load) => total + toTonnes(load.netWeight, load.weightMetric),
    0,
  );

  const acceptedDwt = periodDwt.filter((submission) =>
    ["accepted", "accepted_with_warnings"].includes(submission.status),
  ).length;
  const failedDwt = periodDwt.filter((submission) =>
    ["rejected", "failed"].includes(submission.status),
  ).length;

  return {
    days: safeDays,
    jobs: periodJobs.length,
    completedLoads: completedLoads.length,
    tonnes,
    organisationsBooking: new Set(periodJobs.map((job) => job.organisationId)).size,
    dwtAttempts: periodDwt.length,
    dwtAccepted: acceptedDwt,
    dwtFailed: failedDwt,
    dwtAcceptanceRate:
      periodDwt.length > 0 ? Math.round((acceptedDwt / periodDwt.length) * 1000) / 10 : 0,
    exports,
  };
}
