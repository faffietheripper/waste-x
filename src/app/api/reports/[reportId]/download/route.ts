import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { reportExports } from "@/db/schema";
import { markReportDownloaded } from "@/modules/reports/actions/markReportDownloadedAction";
import { getReportDataset } from "@/modules/reports/core/getReportData";
import {
  buildReportFileName,
  getReportFormatMeta,
  isReportFormat,
  isReportType,
  parseReportFiltersJson,
} from "@/modules/reports/core/reportTypes";
import {
  canDownloadReport,
  getReportUserContextFromSession,
} from "@/modules/reports/core/reportPermissions";
import { renderCsvReport } from "@/modules/reports/core/renderCsvReport";
import { renderJsonReport } from "@/modules/reports/core/renderJsonReport";

type RouteParams = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { reportId } = await params;

  const session = await auth();
  const context = getReportUserContextFromSession(session);

  if (!context.userId) {
    return new Response("Unauthorised", { status: 401 });
  }

  const report = await database.query.reportExports.findFirst({
    where: eq(reportExports.id, reportId),
  });

  if (!report) {
    return new Response("Report not found", { status: 404 });
  }

  if (
    !canDownloadReport({
      context,
      reportOrganisationId: report.organisationId,
    })
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  if (report.status !== "completed") {
    return new Response("Report is not ready for download.", { status: 409 });
  }

  if (!isReportType(report.reportType)) {
    return new Response("Invalid report type.", { status: 400 });
  }

  if (!isReportFormat(report.format)) {
    return new Response("Invalid report format.", { status: 400 });
  }

  const filters = parseReportFiltersJson(report.filtersJson);

  const dataset = await getReportDataset({
    organisationId: report.organisationId,
    reportType: report.reportType,
    filters,
  });

  const body =
    report.format === "json"
      ? renderJsonReport({
          dataset,
          reportType: report.reportType,
          organisationId: report.organisationId,
          filters,
        })
      : renderCsvReport(dataset);

  await markReportDownloaded(report.id);

  const formatMeta = getReportFormatMeta(report.format);

  const fileName =
    report.fileName ||
    buildReportFileName({
      reportType: report.reportType,
      format: report.format,
      createdAt: report.createdAt,
    });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": formatMeta?.mimeType ?? "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}