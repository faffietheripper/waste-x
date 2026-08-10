export const REPORT_TYPES = [
  {
    value: "assignment_summary",
    label: "Assignment Summary",
    description:
      "Export assignment lifecycle data including generator, manager, carrier, status and key timestamps.",
  },
  {
    value: "chain_of_custody",
    label: "Chain of Custody",
    description:
      "Export movement evidence across listings, assignments, collection and receipt stages.",
  },
  {
    value: "incident_log",
    label: "Incident Log",
    description:
      "Export incident records, resolution status, corrective actions and compliance notes.",
  },
  {
    value: "dwt_submissions",
    label: "Digital Waste Tracking Submissions",
    description:
      "Export DWT submission records including WTIDs, payload status, warnings and errors.",
  },
  {
    value: "waste_receipts",
    label: "Waste Receipts",
    description:
      "Export waste receipt and received item records for audit and recordkeeping.",
  },
  {
    value: "listing_activity",
    label: "Listing Activity",
    description:
      "Export waste listing activity including bidding, assignment and marketplace status.",
  },
  {
    value: "carrier_performance",
    label: "Carrier Performance",
    description:
      "Export carrier workload and completion performance across assigned jobs.",
  },
  {
    value: "user_access_audit",
    label: "User Access Audit",
    description:
      "Export organisation users, roles, departments and account status.",
  },
  {
    value: "compliance_audit_pack",
    label: "Compliance Audit Pack",
    description:
      "Export a wider audit pack combining assignments, incidents, receipts and DWT evidence.",
  },
] as const;

export const REPORT_FORMATS = [
  {
    value: "csv",
    label: "CSV",
    mimeType: "text/csv; charset=utf-8",
    extension: "csv",
  },
  {
    value: "json",
    label: "JSON",
    mimeType: "application/json; charset=utf-8",
    extension: "json",
  },
] as const;

export type ReportType = (typeof REPORT_TYPES)[number]["value"];
export type ReportFormat = (typeof REPORT_FORMATS)[number]["value"];

export type ReportFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string | null;
};

export function isReportType(value: unknown): value is ReportType {
  return REPORT_TYPES.some((report) => report.value === value);
}

export function isReportFormat(value: unknown): value is ReportFormat {
  return REPORT_FORMATS.some((format) => format.value === value);
}

export function getReportTypeMeta(reportType: ReportType) {
  return REPORT_TYPES.find((report) => report.value === reportType);
}

export function getReportFormatMeta(format: ReportFormat) {
  return REPORT_FORMATS.find((item) => item.value === format);
}

export function normaliseReportFormat(value: unknown): ReportFormat {
  if (isReportFormat(value)) return value;
  return "csv";
}

export function parseReportFiltersFromForm(formData: FormData): ReportFilters {
  const dateFrom = cleanOptionalString(formData.get("dateFrom"));
  const dateTo = cleanOptionalString(formData.get("dateTo"));
  const status = cleanOptionalString(formData.get("status"));

  return {
    dateFrom,
    dateTo,
    status: status === "all" ? null : status,
  };
}

export function parseReportFiltersJson(value: string | null | undefined) {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as ReportFilters;

    return {
      dateFrom: cleanOptionalString(parsed.dateFrom),
      dateTo: cleanOptionalString(parsed.dateTo),
      status: cleanOptionalString(parsed.status),
    };
  } catch {
    return {};
  }
}

export function stringifyReportFilters(filters: ReportFilters) {
  return JSON.stringify({
    dateFrom: filters.dateFrom || null,
    dateTo: filters.dateTo || null,
    status: filters.status || null,
  });
}

export function buildReportTitle(reportType: ReportType, filters: ReportFilters) {
  const meta = getReportTypeMeta(reportType);
  const label = meta?.label ?? "Waste X Report";

  const dateLabel =
    filters.dateFrom || filters.dateTo
      ? ` (${filters.dateFrom ?? "Start"} to ${filters.dateTo ?? "Today"})`
      : "";

  return `${label}${dateLabel}`;
}

export function buildReportFileName({
  reportType,
  format,
  createdAt,
}: {
  reportType: ReportType;
  format: ReportFormat;
  createdAt?: Date | string | null;
}) {
  const meta = getReportTypeMeta(reportType);
  const formatMeta = getReportFormatMeta(format);

  const safeName = (meta?.label ?? reportType)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const date =
    createdAt instanceof Date
      ? createdAt
      : createdAt
        ? new Date(createdAt)
        : new Date();

  const dateStamp = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);

  return `waste-x-${safeName}-${dateStamp}.${formatMeta?.extension ?? format}`;
}

function cleanOptionalString(value: unknown) {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();

  return cleaned.length ? cleaned : null;
}