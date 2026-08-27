import { cache } from "react";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { transportRouteSnapshots } from "@/db/carbon-schema";
import {
  customerInvoiceJobs,
  customerInvoices,
  jobCommercialLines,
} from "@/db/commercial-schema";
import { database } from "@/db/database";
import {
  counterpartySites,
  drivers,
  invoices,
  jobLoads,
  jobs,
  materialProfiles,
  organisations,
  permitEwcCodes,
  sitePermits,
  sites,
  users,
  vehicles,
  wasteTrackingOrganisationSettings,
} from "@/db/schema";
import {
  jobLoadReturnSnapshots,
  returnSettings,
  returnSiteGeographies,
} from "@/db/returns-schema";

export type AdminSetupCheck = {
  key: string;
  label: string;
  ok: boolean;
  helper: string;
};

export type AdminOrganisationWorkflowSummary = {
  id: string;
  teamName: string;
  capabilities: ("generator" | "carrier" | "manager")[];
  status: string | null;
  isSuspended: boolean;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  setup: {
    checks: AdminSetupCheck[];
    readyCount: number;
    requiredCount: number;
    ready: boolean;
  };
  operations: {
    jobs: number;
    completedJobs: number;
    completedLoads: number;
    tonnes: number;
  };
  returns: {
    candidates: number;
    ready: number;
    review: number;
  };
  carbon: {
    eligible: number;
    calculated: number;
    pending: number;
    attention: number;
    missingPostcode: number;
    coverage: number;
  };
  commercial: {
    completedJobs: number;
    pricedCompletedJobs: number;
    unpricedCompletedJobs: number;
    invoiceReadyJobs: number;
  };
  customerInvoices: {
    draft: number;
    issued: number;
    paid: number;
    void: number;
    issuedValue: number;
    paidValue: number;
  };
  platformBilling: {
    platformInvoices: number;
    pending: number;
    failed: number;
    paid: number;
    paidValue: number;
  };
  attentionSignals: number;
};

export type AdminReturnIssueRow = {
  organisationId: string;
  organisationName: string;
  jobId: string;
  jobNumber: string;
  jobLoadId: string;
  loadNumber: number;
  direction: "incoming" | "outgoing";
  issues: string[];
};

export type AdminCarbonIssueRow = {
  organisationId: string;
  organisationName: string;
  jobId: string;
  jobNumber: string;
  jobLoadId: string;
  loadNumber: number;
  direction: "incoming" | "outgoing";
  originPostcode: string;
  destinationPostcode: string;
  status: "missing_postcode" | "geocode_failed" | "route_failed";
  error: string;
};

function daysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value;
}

function safeDays(value: number) {
  return [7, 30, 90, 180].includes(value) ? value : 30;
}

function currentQuarterWindow(now = new Date()) {
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const startMonth = (quarter - 1) * 3;
  const start = new Date(now.getFullYear(), startMonth, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), startMonth + 3, 1, 0, 0, 0, 0);

  return {
    year: now.getFullYear(),
    quarter,
    label: `Q${quarter} ${now.getFullYear()}`,
    start,
    end,
  };
}

function isWithin(value: Date | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const time = value.getTime();
  return time >= start.getTime() && time < end.getTime();
}

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTonnes(
  value: string | number | null | undefined,
  metric: string | null | undefined,
) {
  const amount = numeric(value);
  if (metric === "Kilograms") return amount / 1000;
  if (metric === "Grams") return amount / 1_000_000;
  return amount;
}

function cleanPostcode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export const getAdminWorkflowHealth = cache(async (requestedDays = 30) => {
  const days = safeDays(requestedDays);
  const since = daysAgo(days);
  const quarter = currentQuarterWindow();

  const [
    organisationRows,
    userRows,
    ownSiteRows,
    counterpartySiteRows,
    permitRows,
    permitEwcRows,
    materialRows,
    driverRows,
    vehicleRows,
    dwtSettingRows,
    returnSettingRows,
    recentJobs,
    recentLoads,
    customerInvoiceRows,
    platformInvoiceRows,
  ] = await Promise.all([
    database.select({
      id: organisations.id,
      teamName: organisations.teamName,
      capabilities: organisations.capabilities,
      status: organisations.status,
      isSuspended: organisations.isSuspended,
      subscriptionPlan: organisations.subscriptionPlan,
      subscriptionStatus: organisations.subscriptionStatus,
    }).from(organisations).orderBy(desc(organisations.createdAt)),

    database.select({
      id: users.id,
      organisationId: users.organisationId,
      isActive: users.isActive,
      isSuspended: users.isSuspended,
      status: users.status,
    }).from(users),

    database.select({
      id: sites.id,
      organisationId: sites.organisationId,
      siteType: sites.siteType,
      postcode: sites.postcode,
      status: sites.status,
      isDefault: sites.isDefault,
    }).from(sites),

    database.select({
      id: counterpartySites.id,
      organisationId: counterpartySites.organisationId,
      postcode: counterpartySites.postcode,
    }).from(counterpartySites),

    database.select({
      id: sitePermits.id,
      organisationId: sitePermits.organisationId,
      status: sitePermits.status,
      isPrimary: sitePermits.isPrimary,
    }).from(sitePermits),

    database.select({
      organisationId: permitEwcCodes.organisationId,
      permitId: permitEwcCodes.permitId,
      ewcCodeId: permitEwcCodes.ewcCodeId,
      isActive: permitEwcCodes.isActive,
    }).from(permitEwcCodes),

    database.select({
      id: materialProfiles.id,
      organisationId: materialProfiles.organisationId,
      isActive: materialProfiles.isActive,
    }).from(materialProfiles),

    database.select({
      id: drivers.id,
      organisationId: drivers.organisationId,
      isActive: drivers.isActive,
    }).from(drivers),

    database.select({
      id: vehicles.id,
      organisationId: vehicles.organisationId,
      isActive: vehicles.isActive,
    }).from(vehicles),

    database.select().from(wasteTrackingOrganisationSettings),
    database.select().from(returnSettings),

    database.select({
      id: jobs.id,
      organisationId: jobs.organisationId,
      jobNumber: jobs.jobNumber,
      status: jobs.status,
      direction: jobs.direction,
      customerInvoicedAt: jobs.customerInvoicedAt,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
    }).from(jobs).where(gte(jobs.createdAt, since)).orderBy(desc(jobs.createdAt)),

    database.select({
      id: jobLoads.id,
      organisationId: jobLoads.organisationId,
      jobId: jobLoads.jobId,
      loadNumber: jobLoads.loadNumber,
      status: jobLoads.status,
      direction: jobLoads.direction,
      receivedAt: jobLoads.receivedAt,
      movementAt: jobLoads.movementAt,
      completedAt: jobLoads.completedAt,
      updatedAt: jobLoads.updatedAt,
      netWeight: jobLoads.netWeight,
      weightMetric: jobLoads.weightMetric,
      ewcCodeId: jobLoads.ewcCodeId,
      ewcCodeSnapshot: jobLoads.ewcCodeSnapshot,
      physicalFormSnapshot: jobLoads.physicalFormSnapshot,
      disposalRecoveryCodeSnapshot: jobLoads.disposalRecoveryCodeSnapshot,
      sitePermitId: jobLoads.sitePermitId,
      clientSiteId: jobLoads.clientSiteId,
      ownSiteId: jobLoads.ownSiteId,
      thirdPartyDestinationSiteId: jobLoads.thirdPartyDestinationSiteId,
      transportCarbonCalculatedAt: jobLoads.transportCarbonCalculatedAt,
      transportDistanceKm: jobLoads.transportDistanceKm,
      transportCo2eKg: jobLoads.transportCo2eKg,
    }).from(jobLoads).where(gte(jobLoads.updatedAt, since)).orderBy(desc(jobLoads.updatedAt)),

    database.select().from(customerInvoices).where(gte(customerInvoices.createdAt, since)).orderBy(desc(customerInvoices.createdAt)),
    database.select().from(invoices).where(gte(invoices.createdAt, since)).orderBy(desc(invoices.createdAt)),
  ]);

  const jobIds = recentJobs.map((row) => row.id);
  const loadIds = recentLoads.map((row) => row.id);

  const [
    commercialLineRows,
    customerInvoiceJobRows,
    returnSnapshotRows,
    returnGeographyRows,
    routeSnapshotRows,
  ] = await Promise.all([
    jobIds.length
      ? database.select().from(jobCommercialLines).where(
          and(
            inArray(jobCommercialLines.jobId, jobIds),
            eq(jobCommercialLines.isActive, true),
          ),
        )
      : Promise.resolve([]),
    jobIds.length
      ? database.select().from(customerInvoiceJobs).where(
          inArray(customerInvoiceJobs.jobId, jobIds),
        )
      : Promise.resolve([]),
    loadIds.length
      ? database.select().from(jobLoadReturnSnapshots).where(
          inArray(jobLoadReturnSnapshots.jobLoadId, loadIds),
        )
      : Promise.resolve([]),
    database.select().from(returnSiteGeographies),
    loadIds.length
      ? database.select().from(transportRouteSnapshots).where(
          inArray(transportRouteSnapshots.jobLoadId, loadIds),
        )
      : Promise.resolve([]),
  ]);

  const organisationById = new Map(
    organisationRows.map((row) => [row.id, row]),
  );
  const jobById = new Map(recentJobs.map((row) => [row.id, row]));
  const ownSiteById = new Map(ownSiteRows.map((row) => [row.id, row]));
  const counterpartySiteById = new Map(
    counterpartySiteRows.map((row) => [row.id, row]),
  );
  const defaultOwnSiteByOrg = new Map(
    ownSiteRows
      .filter((row) => row.isDefault && row.status === "active")
      .map((row) => [row.organisationId, row]),
  );
  const returnSnapshotByLoad = new Map(
    returnSnapshotRows.map((row) => [row.jobLoadId, row]),
  );
  const routeSnapshotByLoad = new Map(
    routeSnapshotRows.map((row) => [row.jobLoadId, row]),
  );
  const dwtSettingByOrg = new Map(
    dwtSettingRows.map((row) => [row.organisationId, row]),
  );
  const geographyBySubject = new Map(
    returnGeographyRows.map((row) => [
      `${row.organisationId}:${row.subjectType}:${row.subjectId}`,
      row,
    ]),
  );

  const revenuePricedJobIds = new Set(
    commercialLineRows
      .filter((row) => row.kind === "revenue" && row.isActive)
      .map((row) => row.jobId),
  );
  const customerInvoiceStatusById = new Map(
    customerInvoiceRows.map((row) => [row.id, row.status]),
  );
  const activeInvoiceJobIds = new Set(
    customerInvoiceJobRows
      .filter((row) => customerInvoiceStatusById.get(row.invoiceId) !== "void")
      .map((row) => row.jobId),
  );

  const completedLoadCountByJob = new Map<string, number>();
  const completedTonnesByJob = new Map<string, number>();
  for (const load of recentLoads) {
    if (load.status !== "completed") continue;
    completedLoadCountByJob.set(
      load.jobId,
      (completedLoadCountByJob.get(load.jobId) ?? 0) + 1,
    );
    completedTonnesByJob.set(
      load.jobId,
      (completedTonnesByJob.get(load.jobId) ?? 0) +
        toTonnes(load.netWeight, load.weightMetric),
    );
  }

  function returnArea(params: {
    organisationId: string;
    subjectType: "own_site" | "counterparty_site";
    subjectId: string | null;
    snapshotLabel: string | null | undefined;
  }) {
    if (params.snapshotLabel?.trim()) return params.snapshotLabel.trim();
    if (!params.subjectId) return "";
    const row = geographyBySubject.get(
      `${params.organisationId}:${params.subjectType}:${params.subjectId}`,
    );
    return row?.returnAreaLabel?.trim() || row?.localAuthorityName?.trim() || "";
  }

  const returnCandidateLoads = recentLoads.filter((load) => {
    const eligible =
      (load.direction === "incoming" &&
        ["accepted", "completed"].includes(load.status)) ||
      (load.direction === "outgoing" && load.status === "completed");
    if (!eligible) return false;

    const eventAt = load.direction === "incoming" ? load.receivedAt : load.movementAt;
    if (eventAt) return isWithin(eventAt, quarter.start, quarter.end);
    return Boolean(load.updatedAt && load.updatedAt >= quarter.start);
  });

  const returnIssues: AdminReturnIssueRow[] = [];
  const returnReadyLoadIds = new Set<string>();

  for (const load of returnCandidateLoads) {
    const snapshot = returnSnapshotByLoad.get(load.id);
    const issues: string[] = [];
    const eventAt = load.direction === "incoming" ? load.receivedAt : load.movementAt;

    if (!eventAt) {
      issues.push(
        load.direction === "incoming"
          ? "Missing receipt date/time"
          : "Missing outgoing movement date/time",
      );
    }
    if (!load.ewcCodeSnapshot?.trim()) issues.push("Missing EWC snapshot");
    if (toTonnes(load.netWeight, load.weightMetric) <= 0) {
      issues.push("Missing positive net weight");
    }
    if (!load.physicalFormSnapshot?.trim()) issues.push("Missing physical state");
    if (!load.disposalRecoveryCodeSnapshot?.trim()) issues.push("Missing D/R code");
    if (!load.sitePermitId) issues.push("Missing receiving-site permit");

    if (load.sitePermitId && load.ewcCodeId) {
      const permitted = permitEwcRows.some(
        (row) =>
          row.organisationId === load.organisationId &&
          row.permitId === load.sitePermitId &&
          row.ewcCodeId === load.ewcCodeId &&
          row.isActive,
      );
      if (!permitted) issues.push("EWC is not active on the linked permit");
    }

    if (load.direction === "incoming") {
      const origin = returnArea({
        organisationId: load.organisationId,
        subjectType: "counterparty_site",
        subjectId: load.clientSiteId,
        snapshotLabel: snapshot?.originReturnAreaLabel,
      });
      if (!origin) issues.push("Origin local authority / return area missing");
    } else {
      const destination = returnArea({
        organisationId: load.organisationId,
        subjectType: "counterparty_site",
        subjectId: load.thirdPartyDestinationSiteId,
        snapshotLabel: snapshot?.destinationReturnAreaLabel,
      });
      if (!destination) {
        issues.push("Destination local authority / return area missing");
      }
    }

    if (issues.length === 0) {
      returnReadyLoadIds.add(load.id);
      continue;
    }

    const organisation = organisationById.get(load.organisationId);
    const job = jobById.get(load.jobId);
    returnIssues.push({
      organisationId: load.organisationId,
      organisationName: organisation?.teamName ?? "Unknown organisation",
      jobId: load.jobId,
      jobNumber: job?.jobNumber ?? load.jobId,
      jobLoadId: load.id,
      loadNumber: load.loadNumber,
      direction: load.direction,
      issues,
    });
  }

  const carbonEligibleLoads = recentLoads.filter(
    (load) =>
      load.status === "completed" &&
      toTonnes(load.netWeight, load.weightMetric) > 0,
  );
  const carbonCalculatedLoadIds = new Set<string>();
  const carbonPendingLoadIds = new Set<string>();
  const carbonAttentionLoadIds = new Set<string>();
  const carbonMissingPostcodeLoadIds = new Set<string>();
  const carbonIssues: AdminCarbonIssueRow[] = [];

  for (const load of carbonEligibleLoads) {
    const routeSnapshot = routeSnapshotByLoad.get(load.id);
    const ownSite =
      (load.ownSiteId ? ownSiteById.get(load.ownSiteId) : undefined) ??
      defaultOwnSiteByOrg.get(load.organisationId);
    const clientSite = load.clientSiteId
      ? counterpartySiteById.get(load.clientSiteId)
      : undefined;
    const destinationSite = load.thirdPartyDestinationSiteId
      ? counterpartySiteById.get(load.thirdPartyDestinationSiteId)
      : undefined;

    const originPostcode = cleanPostcode(
      load.direction === "incoming" ? clientSite?.postcode : ownSite?.postcode,
    );
    const destinationPostcode = cleanPostcode(
      load.direction === "incoming"
        ? ownSite?.postcode
        : destinationSite?.postcode,
    );

    const missingPostcode = !originPostcode || !destinationPostcode;
    const routeFailure = [
      "missing_postcode",
      "geocode_failed",
      "route_failed",
    ].includes(routeSnapshot?.status ?? "");
    const calculated = Boolean(
      load.transportCarbonCalculatedAt &&
        load.transportDistanceKm !== null &&
        load.transportCo2eKg !== null &&
        routeSnapshot?.status === "calculated",
    );

    if (calculated) {
      carbonCalculatedLoadIds.add(load.id);
      continue;
    }

    if (!missingPostcode && !routeFailure) {
      carbonPendingLoadIds.add(load.id);
      continue;
    }

    carbonAttentionLoadIds.add(load.id);
    if (missingPostcode) carbonMissingPostcodeLoadIds.add(load.id);

    const organisation = organisationById.get(load.organisationId);
    const job = jobById.get(load.jobId);
    const status: AdminCarbonIssueRow["status"] = missingPostcode
      ? "missing_postcode"
      : routeSnapshot?.status === "geocode_failed"
        ? "geocode_failed"
        : "route_failed";

    carbonIssues.push({
      organisationId: load.organisationId,
      organisationName: organisation?.teamName ?? "Unknown organisation",
      jobId: load.jobId,
      jobNumber: job?.jobNumber ?? load.jobId,
      jobLoadId: load.id,
      loadNumber: load.loadNumber,
      direction: load.direction,
      originPostcode,
      destinationPostcode,
      status,
      error:
        routeSnapshot?.lastError?.trim() ||
        (missingPostcode
          ? "One or both route postcodes are missing."
          : "Automatic road route could not be calculated."),
    });
  }

  const summaries: AdminOrganisationWorkflowSummary[] = organisationRows.map(
    (organisation) => {
      const orgUsers = userRows.filter((row) => row.organisationId === organisation.id);
      const orgSites = ownSiteRows.filter((row) => row.organisationId === organisation.id);
      const orgPermits = permitRows.filter((row) => row.organisationId === organisation.id);
      const orgMaterials = materialRows.filter((row) => row.organisationId === organisation.id);
      const orgDrivers = driverRows.filter((row) => row.organisationId === organisation.id);
      const orgVehicles = vehicleRows.filter((row) => row.organisationId === organisation.id);
      const orgJobs = recentJobs.filter((row) => row.organisationId === organisation.id);
      const orgLoads = recentLoads.filter((row) => row.organisationId === organisation.id);
      const orgReturnCandidates = returnCandidateLoads.filter((row) => row.organisationId === organisation.id);
      const orgCarbonEligible = carbonEligibleLoads.filter((row) => row.organisationId === organisation.id);
      const orgCustomerInvoices = customerInvoiceRows.filter((row) => row.organisationId === organisation.id);
      const orgPlatformInvoices = platformInvoiceRows.filter((row) => row.organisationId === organisation.id);

      const activePermitIds = new Set(
        orgPermits.filter((row) => row.status === "active").map((row) => row.id),
      );
      const hasActiveUser = orgUsers.some((row) => row.isActive && !row.isSuspended);
      const hasReceivingSite = orgSites.some(
        (row) => row.siteType === "waste_receiving_site" && row.status === "active",
      );
      const hasPermit = activePermitIds.size > 0;
      const hasPermittedEwc = permitEwcRows.some(
        (row) =>
          row.organisationId === organisation.id &&
          row.isActive &&
          activePermitIds.has(row.permitId),
      );
      const hasMaterials = orgMaterials.some((row) => row.isActive);
      const hasDriver = orgDrivers.some((row) => row.isActive);
      const hasVehicle = orgVehicles.some((row) => row.isActive);
      const dwt = dwtSettingByOrg.get(organisation.id);
      const dwtReady = Boolean(dwt?.isEnabled && dwt?.apiCode);

      const checks: AdminSetupCheck[] = [
        {
          key: "active_user",
          label: "Active customer user",
          ok: hasActiveUser,
          helper: hasActiveUser ? "Access available" : "No active workspace user",
        },
        {
          key: "capabilities",
          label: "Organisation capabilities",
          ok: organisation.capabilities.length > 0,
          helper:
            organisation.capabilities.length > 0
              ? organisation.capabilities.join(" + ")
              : "No capabilities selected",
        },
      ];

      if (organisation.capabilities.includes("manager")) {
        checks.push(
          {
            key: "receiving_site",
            label: "Receiving site",
            ok: hasReceivingSite,
            helper: hasReceivingSite ? "Configured" : "Missing",
          },
          {
            key: "permit",
            label: "Active site permit",
            ok: hasPermit,
            helper: hasPermit ? "Configured" : "Missing",
          },
          {
            key: "permitted_ewc",
            label: "Permitted EWC",
            ok: hasPermittedEwc,
            helper: hasPermittedEwc ? "Configured" : "No active EWC mapping",
          },
          {
            key: "materials",
            label: "Material profiles",
            ok: hasMaterials,
            helper: hasMaterials ? "Configured" : "Missing",
          },
          {
            key: "dwt",
            label: "Digital Waste Tracking",
            ok: dwtReady,
            helper: dwtReady ? "Enabled" : "Needs configuration",
          },
        );
      }

      if (organisation.capabilities.includes("carrier")) {
        checks.push(
          {
            key: "driver",
            label: "Active driver",
            ok: hasDriver,
            helper: hasDriver ? "Configured" : "No active driver",
          },
          {
            key: "vehicle",
            label: "Active vehicle",
            ok: hasVehicle,
            helper: hasVehicle ? "Configured" : "No active vehicle",
          },
        );
      }

      const completedJobs = orgJobs.filter((row) => row.status === "completed");
      const completedLoads = orgLoads.filter((row) => row.status === "completed");
      const tonnes = completedLoads.reduce(
        (total, row) => total + toTonnes(row.netWeight, row.weightMetric),
        0,
      );
      const pricedCompletedJobs = completedJobs.filter((row) => revenuePricedJobIds.has(row.id));
      const unpricedCompletedJobs = completedJobs.filter(
        (row) => !revenuePricedJobIds.has(row.id) && !activeInvoiceJobIds.has(row.id),
      );
      const invoiceReadyJobs = completedJobs.filter((row) => {
        if (!revenuePricedJobIds.has(row.id)) return false;
        if (activeInvoiceJobIds.has(row.id) || row.customerInvoicedAt) return false;
        return (
          (completedLoadCountByJob.get(row.id) ?? 0) > 0 ||
          (completedTonnesByJob.get(row.id) ?? 0) > 0
        );
      });

      const returnReady = orgReturnCandidates.filter((row) => returnReadyLoadIds.has(row.id)).length;
      const returnReview = orgReturnCandidates.length - returnReady;
      const carbonCalculated = orgCarbonEligible.filter((row) => carbonCalculatedLoadIds.has(row.id)).length;
      const carbonPending = orgCarbonEligible.filter((row) => carbonPendingLoadIds.has(row.id)).length;
      const carbonAttention = orgCarbonEligible.filter((row) => carbonAttentionLoadIds.has(row.id)).length;
      const missingPostcode = orgCarbonEligible.filter((row) => carbonMissingPostcodeLoadIds.has(row.id)).length;

      const draft = orgCustomerInvoices.filter((row) => row.status === "draft").length;
      const issued = orgCustomerInvoices.filter((row) => row.status === "issued").length;
      const paid = orgCustomerInvoices.filter((row) => row.status === "paid").length;
      const voidCount = orgCustomerInvoices.filter((row) => row.status === "void").length;
      const issuedValue = orgCustomerInvoices
        .filter((row) => row.status === "issued")
        .reduce((total, row) => total + numeric(row.total), 0);
      const paidValue = orgCustomerInvoices
        .filter((row) => row.status === "paid")
        .reduce((total, row) => total + numeric(row.total), 0);

      const platformPending = orgPlatformInvoices.filter((row) => row.status === "pending").length;
      const platformFailed = orgPlatformInvoices.filter((row) => row.status === "failed").length;
      const platformPaid = orgPlatformInvoices.filter((row) => row.status === "paid").length;
      const platformPaidValue = orgPlatformInvoices
        .filter((row) => row.status === "paid")
        .reduce((total, row) => total + numeric(row.amount), 0);

      const readyCount = checks.filter((row) => row.ok).length;

      return {
        id: organisation.id,
        teamName: organisation.teamName,
        capabilities: organisation.capabilities,
        status: organisation.status,
        isSuspended: organisation.isSuspended,
        subscriptionPlan: organisation.subscriptionPlan,
        subscriptionStatus: organisation.subscriptionStatus,
        setup: {
          checks,
          readyCount,
          requiredCount: checks.length,
          ready: checks.length > 0 && readyCount === checks.length,
        },
        operations: {
          jobs: orgJobs.length,
          completedJobs: completedJobs.length,
          completedLoads: completedLoads.length,
          tonnes,
        },
        returns: {
          candidates: orgReturnCandidates.length,
          ready: returnReady,
          review: returnReview,
        },
        carbon: {
          eligible: orgCarbonEligible.length,
          calculated: carbonCalculated,
          pending: carbonPending,
          attention: carbonAttention,
          missingPostcode,
          coverage: percentage(carbonCalculated, orgCarbonEligible.length),
        },
        commercial: {
          completedJobs: completedJobs.length,
          pricedCompletedJobs: pricedCompletedJobs.length,
          unpricedCompletedJobs: unpricedCompletedJobs.length,
          invoiceReadyJobs: invoiceReadyJobs.length,
        },
        customerInvoices: {
          draft,
          issued,
          paid,
          void: voidCount,
          issuedValue,
          paidValue,
        },
        platformBilling: {
          platformInvoices: orgPlatformInvoices.length,
          pending: platformPending,
          failed: platformFailed,
          paid: platformPaid,
          paidValue: platformPaidValue,
        },
        attentionSignals:
          returnReview +
          carbonAttention +
          unpricedCompletedJobs.length +
          platformFailed +
          (organisation.subscriptionStatus === "past_due" ? 1 : 0),
      };
    },
  );

  const activeSummaries = summaries.filter(
    (row) => row.status === "ACTIVE" && !row.isSuspended,
  );

  const recentCustomerInvoices = customerInvoiceRows.slice(0, 50).map((row) => ({
    id: row.id,
    organisationId: row.organisationId,
    organisationName:
      organisationById.get(row.organisationId)?.teamName ?? "Unknown organisation",
    invoiceNumber: row.invoiceNumber,
    customerName: row.customerNameSnapshot,
    status: row.status,
    total: numeric(row.total),
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
  }));

  const recentPlatformInvoices = platformInvoiceRows.slice(0, 50).map((row) => ({
    id: row.id,
    organisationId: row.organisationId,
    organisationName:
      organisationById.get(row.organisationId)?.teamName ?? "Unknown organisation",
    status: row.status,
    amount: numeric(row.amount),
    currency: row.currency,
    stripeInvoiceId: row.stripeInvoiceId,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
  }));

  return {
    days,
    quarter,
    organisations: summaries,
    activeOrganisations: activeSummaries.length,
    setup: {
      ready: activeSummaries.filter((row) => row.setup.ready).length,
      attention: activeSummaries.filter((row) => !row.setup.ready).length,
    },
    operations: {
      jobs: summaries.reduce((total, row) => total + row.operations.jobs, 0),
      completedJobs: summaries.reduce((total, row) => total + row.operations.completedJobs, 0),
      completedLoads: summaries.reduce((total, row) => total + row.operations.completedLoads, 0),
      tonnes: summaries.reduce((total, row) => total + row.operations.tonnes, 0),
    },
    returns: {
      configuredOrganisations: returnSettingRows.length,
      candidates: returnCandidateLoads.length,
      ready: returnReadyLoadIds.size,
      review: returnIssues.length,
      organisationsWithReview: new Set(returnIssues.map((row) => row.organisationId)).size,
    },
    carbon: {
      eligible: carbonEligibleLoads.length,
      calculated: carbonCalculatedLoadIds.size,
      pending: carbonPendingLoadIds.size,
      attention: carbonAttentionLoadIds.size,
      missingPostcode: carbonMissingPostcodeLoadIds.size,
      coverage: percentage(carbonCalculatedLoadIds.size, carbonEligibleLoads.length),
    },
    commercial: {
      completedJobs: summaries.reduce((total, row) => total + row.commercial.completedJobs, 0),
      pricedCompletedJobs: summaries.reduce((total, row) => total + row.commercial.pricedCompletedJobs, 0),
      unpricedCompletedJobs: summaries.reduce((total, row) => total + row.commercial.unpricedCompletedJobs, 0),
      invoiceReadyJobs: summaries.reduce((total, row) => total + row.commercial.invoiceReadyJobs, 0),
      draftInvoices: customerInvoiceRows.filter((row) => row.status === "draft").length,
      issuedInvoices: customerInvoiceRows.filter((row) => row.status === "issued").length,
      paidInvoices: customerInvoiceRows.filter((row) => row.status === "paid").length,
      issuedValue: customerInvoiceRows
        .filter((row) => row.status === "issued")
        .reduce((total, row) => total + numeric(row.total), 0),
      paidValue: customerInvoiceRows
        .filter((row) => row.status === "paid")
        .reduce((total, row) => total + numeric(row.total), 0),
    },
    billing: {
      activeSubscriptions: organisationRows.filter((row) => row.subscriptionStatus === "active").length,
      trialSubscriptions: organisationRows.filter((row) => row.subscriptionStatus === "trial").length,
      pastDueOrganisations: organisationRows.filter((row) => row.subscriptionStatus === "past_due").length,
      platformInvoices: platformInvoiceRows.length,
      pendingInvoices: platformInvoiceRows.filter((row) => row.status === "pending").length,
      failedInvoices: platformInvoiceRows.filter((row) => row.status === "failed").length,
      paidInvoices: platformInvoiceRows.filter((row) => row.status === "paid").length,
      paidValue: platformInvoiceRows
        .filter((row) => row.status === "paid")
        .reduce((total, row) => total + numeric(row.amount), 0),
    },
    returnIssues: returnIssues.slice(0, 100),
    carbonIssues: carbonIssues.slice(0, 100),
    recentCustomerInvoices,
    recentPlatformInvoices,
  };
});

export async function getAdminOrganisationWorkflowHealth(
  organisationId: string,
  days = 90,
) {
  const data = await getAdminWorkflowHealth(days);
  return {
    summary:
      data.organisations.find((row) => row.id === organisationId) ?? null,
    quarter: data.quarter,
    returnIssues: data.returnIssues.filter(
      (row) => row.organisationId === organisationId,
    ),
    carbonIssues: data.carbonIssues.filter(
      (row) => row.organisationId === organisationId,
    ),
    customerInvoices: data.recentCustomerInvoices.filter(
      (row) => row.organisationId === organisationId,
    ),
    platformInvoices: data.recentPlatformInvoices.filter(
      (row) => row.organisationId === organisationId,
    ),
  };
}
