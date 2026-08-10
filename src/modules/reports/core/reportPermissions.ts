import type { ReportType } from "./reportTypes";

export type ReportUserContext = {
  userId?: string | null;
  organisationId?: string | null;
  departmentId?: string | null;
  role?: string | null;
  activeDepartmentType?: string | null;
};

export function getReportUserContextFromSession(
  session: any,
): ReportUserContext {
  return {
    userId: session?.user?.id ?? null,
    organisationId: session?.user?.organisationId ?? null,
    departmentId:
      session?.user?.departmentId ??
      session?.user?.activeDepartment?.id ??
      null,
    role: session?.user?.role ?? null,
    activeDepartmentType: session?.user?.activeDepartment?.type ?? null,
  };
}

export function isPlatformAdmin(context: ReportUserContext) {
  return context.role === "platform_admin";
}

export function canViewOrganisationReports(context: ReportUserContext) {
  if (isPlatformAdmin(context)) return true;
  if (!context.organisationId) return false;

  return ["administrator", "seniorManagement", "employee"].includes(
    context.role ?? "",
  );
}

export function canDownloadReport({
  context,
  reportOrganisationId,
}: {
  context: ReportUserContext;
  reportOrganisationId: string;
}) {
  if (isPlatformAdmin(context)) return true;

  return (
    Boolean(context.organisationId) &&
    context.organisationId === reportOrganisationId &&
    canViewOrganisationReports(context)
  );
}

export function canGenerateReport({
  context,
  reportType,
}: {
  context: ReportUserContext;
  reportType: ReportType;
}) {
  if (isPlatformAdmin(context)) return true;
  if (!context.organisationId) return false;

  const role = context.role;
  const department = context.activeDepartmentType;

  if (role === "administrator" || role === "seniorManagement") {
    return true;
  }

  if (department === "compliance") {
    return [
      "assignment_summary",
      "chain_of_custody",
      "incident_log",
      "dwt_submissions",
      "waste_receipts",
      "listing_activity",
      "carrier_performance",
      "user_access_audit",
      "compliance_audit_pack",
    ].includes(reportType);
  }

  if (department === "generator") {
    return [
      "assignment_summary",
      "chain_of_custody",
      "incident_log",
      "listing_activity",
      "compliance_audit_pack",
    ].includes(reportType);
  }

  if (department === "manager") {
    return [
      "assignment_summary",
      "chain_of_custody",
      "incident_log",
      "dwt_submissions",
      "waste_receipts",
      "carrier_performance",
      "compliance_audit_pack",
    ].includes(reportType);
  }

  if (department === "carrier") {
    return [
      "assignment_summary",
      "chain_of_custody",
      "incident_log",
      "carrier_performance",
    ].includes(reportType);
  }

  return false;
}