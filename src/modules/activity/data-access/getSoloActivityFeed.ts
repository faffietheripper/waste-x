import {
  and,
  desc,
  eq,
  gte,
  lt,
  or,
} from "drizzle-orm";

import { database } from "@/db/database";
import {
  auditEvents,
  jobLoads,
  jobs,
  reportExports,
  wasteTrackingSubmissions,
} from "@/db/schema";

export type ActivityCategory =
  | "job"
  | "load"
  | "dwt"
  | "billing"
  | "report"
  | "audit";

export type ActivityTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type SoloActivityItem = {
  id: string;
  occurredAt: Date;
  category: ActivityCategory;
  tone: ActivityTone;
  title: string;
  detail: string;
  reference: string;
  actorName: string | null;
  href: string | null;
};

export type ActivityRange = {
  from: Date;
  toExclusive: Date;
};

export type SoloActivityFeed = {
  range: ActivityRange;
  items: SoloActivityItem[];
  totals: Record<ActivityCategory, number> & {
    all: number;
  };
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeDate(value: string, fallback: Date) {
  if (!value) return fallback;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function defaultActivityRange(date = new Date()): ActivityRange {
  const toExclusive = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    ),
  );

  const from = new Date(toExclusive);
  from.setUTCDate(from.getUTCDate() - 30);

  return { from, toExclusive };
}

export function parseActivityRange(params: {
  from?: string | string[];
  to?: string | string[];
}): ActivityRange {
  const fallback = defaultActivityRange();
  const rawFrom = first(params.from);
  const rawTo = first(params.to);

  const from = safeDate(rawFrom, fallback.from);
  const inclusiveTo = safeDate(
    rawTo,
    new Date(fallback.toExclusive.getTime() - 86_400_000),
  );
  const toExclusive = new Date(inclusiveTo.getTime() + 86_400_000);

  if (from >= toExclusive) return fallback;

  return { from, toExclusive };
}

export function activityRangeToQuery(range: ActivityRange) {
  const inclusiveTo = new Date(range.toExclusive.getTime() - 86_400_000);

  return {
    from: range.from.toISOString().slice(0, 10),
    to: inclusiveTo.toISOString().slice(0, 10),
  };
}

function asDate(value: Date | null | undefined) {
  return value instanceof Date ? value : null;
}

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dwtTone(status: string): ActivityTone {
  if (status === "accepted") return "success";
  if (status === "accepted_with_warnings") return "warning";
  if (status === "rejected" || status === "failed") return "danger";
  return "info";
}

function auditTone(action: string): ActivityTone {
  const value = action.toLowerCase();

  if (
    value.includes("delete") ||
    value.includes("reject") ||
    value.includes("suspend") ||
    value.includes("cancel")
  ) {
    return "danger";
  }

  if (
    value.includes("complete") ||
    value.includes("approve") ||
    value.includes("create") ||
    value.includes("save") ||
    value.includes("update")
  ) {
    return "success";
  }

  return "neutral";
}

function inRange(value: Date | null, range: ActivityRange) {
  return Boolean(value && value >= range.from && value < range.toExclusive);
}

export async function getSoloActivityFeed(params: {
  organisationId: string;
  range: ActivityRange;
  limit?: number;
}): Promise<SoloActivityFeed> {
  const { organisationId, range } = params;
  const perSourceLimit = Math.max(50, Math.min(params.limit ?? 250, 500));

  const [jobRows, loadRows, dwtRows, auditRows, reportRows] = await Promise.all([
    database.query.jobs.findMany({
      where: and(
        eq(jobs.organisationId, organisationId),
        or(
          and(gte(jobs.createdAt, range.from), lt(jobs.createdAt, range.toExclusive)),
          and(gte(jobs.completedAt, range.from), lt(jobs.completedAt, range.toExclusive)),
          and(
            gte(jobs.customerInvoicedAt, range.from),
            lt(jobs.customerInvoicedAt, range.toExclusive),
          ),
        ),
      ),
      with: {
        client: true,
        clientSite: true,
        createdBy: true,
      },
      orderBy: [desc(jobs.updatedAt)],
      limit: perSourceLimit,
    }),

    database.query.jobLoads.findMany({
      where: and(
        eq(jobLoads.organisationId, organisationId),
        or(
          and(
            gte(jobLoads.receivedAt, range.from),
            lt(jobLoads.receivedAt, range.toExclusive),
          ),
          and(
            gte(jobLoads.completedAt, range.from),
            lt(jobLoads.completedAt, range.toExclusive),
          ),
          and(
            gte(jobLoads.updatedAt, range.from),
            lt(jobLoads.updatedAt, range.toExclusive),
          ),
        ),
      ),
      with: {
        job: true,
        ewcCode: true,
        vehicle: true,
      },
      orderBy: [desc(jobLoads.updatedAt)],
      limit: perSourceLimit,
    }),

    database.query.wasteTrackingSubmissions.findMany({
      where: and(
        eq(wasteTrackingSubmissions.organisationId, organisationId),
        or(
          and(
            gte(wasteTrackingSubmissions.createdAt, range.from),
            lt(wasteTrackingSubmissions.createdAt, range.toExclusive),
          ),
          and(
            gte(wasteTrackingSubmissions.lastAttemptedAt, range.from),
            lt(wasteTrackingSubmissions.lastAttemptedAt, range.toExclusive),
          ),
        ),
      ),
      with: {
        jobLoad: {
          with: {
            job: true,
          },
        },
        submittedByUser: true,
      },
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
      limit: perSourceLimit,
    }),

    database.query.auditEvents.findMany({
      where: and(
        eq(auditEvents.organisationId, organisationId),
        gte(auditEvents.createdAt, range.from),
        lt(auditEvents.createdAt, range.toExclusive),
      ),
      with: {
        user: true,
      },
      orderBy: [desc(auditEvents.createdAt)],
      limit: perSourceLimit,
    }),

    database.query.reportExports.findMany({
      where: and(
        eq(reportExports.organisationId, organisationId),
        gte(reportExports.createdAt, range.from),
        lt(reportExports.createdAt, range.toExclusive),
      ),
      with: {
        requestedBy: true,
      },
      orderBy: [desc(reportExports.createdAt)],
      limit: perSourceLimit,
    }),
  ]);

  const items: SoloActivityItem[] = [];

  for (const job of jobRows) {
    const createdAt = asDate(job.createdAt);
    const completedAt = asDate(job.completedAt);
    const invoicedAt = asDate(job.customerInvoicedAt);
    const client = job.client?.name ?? "No client";
    const site = job.clientSite?.name ? ` · ${job.clientSite.name}` : "";

    if (inRange(createdAt, range)) {
      items.push({
        id: `job-created:${job.id}`,
        occurredAt: createdAt!,
        category: "job",
        tone: "info",
        title: `Job ${job.jobNumber} booked`,
        detail: `${client}${site}`,
        reference: job.jobNumber,
        actorName: job.createdBy?.name ?? null,
        href: `/home/jobs/${job.id}`,
      });
    }

    if (inRange(completedAt, range)) {
      items.push({
        id: `job-completed:${job.id}`,
        occurredAt: completedAt!,
        category: "job",
        tone: "success",
        title: `Job ${job.jobNumber} completed`,
        detail: `${client}${site}`,
        reference: job.jobNumber,
        actorName: null,
        href: `/home/jobs/${job.id}`,
      });
    }

    if (inRange(invoicedAt, range)) {
      items.push({
        id: `job-billed:${job.id}`,
        occurredAt: invoicedAt!,
        category: "billing",
        tone: "success",
        title: `Job ${job.jobNumber} marked billed`,
        detail: job.customerInvoiceReference
          ? `Invoice ${job.customerInvoiceReference}`
          : "Customer invoice marker recorded",
        reference: job.customerInvoiceReference ?? job.jobNumber,
        actorName: null,
        href: `/home/jobs/${job.id}`,
      });
    }
  }

  for (const load of loadRows) {
    const receivedAt = asDate(load.receivedAt);
    const completedAt = asDate(load.completedAt);
    const updatedAt = asDate(load.updatedAt);
    const jobNumber = load.job?.jobNumber ?? load.jobId;
    const ewc = clean(load.ewcCodeSnapshot ?? load.ewcCode?.code);
    const vehicle = load.vehicle?.registrationNumber
      ? ` · ${load.vehicle.registrationNumber}`
      : "";

    if (inRange(receivedAt, range)) {
      items.push({
        id: `load-received:${load.id}`,
        occurredAt: receivedAt!,
        category: "load",
        tone: "info",
        title: `${jobNumber} · Load ${load.loadNumber} received`,
        detail: `${ewc ? `EWC ${ewc}` : "Waste received"}${vehicle}`,
        reference: load.ticketNumber ?? `${jobNumber}-${load.loadNumber}`,
        actorName: null,
        href: `/home/jobs/${load.jobId}`,
      });
    }

    if (inRange(completedAt, range)) {
      items.push({
        id: `load-completed:${load.id}`,
        occurredAt: completedAt!,
        category: "load",
        tone: "success",
        title: `${jobNumber} · Load ${load.loadNumber} completed`,
        detail: `${ewc ? `EWC ${ewc}` : "Movement completed"}${vehicle}`,
        reference: load.ticketNumber ?? `${jobNumber}-${load.loadNumber}`,
        actorName: null,
        href: `/home/jobs/${load.jobId}`,
      });
    } else if (
      load.status === "rejected" &&
      inRange(updatedAt, range)
    ) {
      items.push({
        id: `load-rejected:${load.id}`,
        occurredAt: updatedAt!,
        category: "load",
        tone: "danger",
        title: `${jobNumber} · Load ${load.loadNumber} rejected`,
        detail: clean(load.notes) || "Waste load rejected at receiving stage",
        reference: load.ticketNumber ?? `${jobNumber}-${load.loadNumber}`,
        actorName: null,
        href: `/home/jobs/${load.jobId}`,
      });
    }
  }

  for (const submission of dwtRows) {
    const occurredAt =
      asDate(submission.lastAttemptedAt) ?? asDate(submission.createdAt);

    if (!occurredAt || !inRange(occurredAt, range)) continue;

    const jobNumber = submission.jobLoad?.job?.jobNumber;
    const loadNumber = submission.jobLoad?.loadNumber;
    const jobRef = jobNumber
      ? `${jobNumber}${loadNumber ? ` · Load ${loadNumber}` : ""}`
      : "DWT submission";

    items.push({
      id: `dwt:${submission.id}`,
      occurredAt,
      category: "dwt",
      tone: dwtTone(submission.status),
      title: `${jobRef} · ${formatStatus(submission.status)}`,
      detail: submission.wasteTrackingId
        ? `WTID ${submission.wasteTrackingId}`
        : "Waste Tracking Service submission attempt",
      reference: submission.wasteTrackingId ?? submission.id,
      actorName: submission.submittedByUser?.name ?? null,
      href: submission.jobLoadId
        ? `/home/dwt/intake/${submission.jobLoadId}`
        : "/home/dwt/submissions",
    });
  }

  for (const audit of auditRows) {
    const occurredAt = asDate(audit.createdAt);
    if (!occurredAt) continue;

    items.push({
      id: `audit:${audit.id}`,
      occurredAt,
      category: "audit",
      tone: auditTone(audit.action),
      title: `${formatStatus(audit.action)} · ${formatStatus(audit.entityType)}`,
      detail: `Organisation audit event for ${audit.entityType} ${audit.entityId}`,
      reference: audit.entityId,
      actorName: audit.user?.name ?? null,
      href: null,
    });
  }

  for (const report of reportRows) {
    const occurredAt =
      asDate(report.downloadedAt) ??
      asDate(report.generatedAt) ??
      asDate(report.createdAt);

    if (!occurredAt || !inRange(occurredAt, range)) continue;

    items.push({
      id: `report:${report.id}`,
      occurredAt,
      category: report.reportType === "billing_export" ? "billing" : "report",
      tone: report.status === "failed" ? "danger" : "neutral",
      title: report.title,
      detail:
        report.status === "failed"
          ? report.errorMessage ?? "Report generation failed"
          : `${formatStatus(report.reportType)} · ${report.rowCount ?? 0} rows`,
      reference: report.fileName ?? report.id,
      actorName: report.requestedBy?.name ?? null,
      href: "/home/reports",
    });
  }

  items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const limited = items.slice(0, params.limit ?? 250);
  const totals = {
    all: limited.length,
    job: 0,
    load: 0,
    dwt: 0,
    billing: 0,
    report: 0,
    audit: 0,
  } satisfies SoloActivityFeed["totals"];

  for (const item of limited) {
    totals[item.category] += 1;
  }

  return {
    range,
    items: limited,
    totals,
  };
}
