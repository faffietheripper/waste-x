"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { reportExports } from "@/db/schema";
import { getReportDataset } from "../core/getReportData";
import {
  buildReportFileName,
  buildReportTitle,
  getNoDataReportMessage,
  isReportType,
  normaliseReportFormat,
  parseReportFiltersFromForm,
  stringifyReportFilters,
} from "../core/reportTypes";
import {
  canGenerateReport,
  getReportUserContextFromSession,
} from "../core/reportPermissions";

export type CreateReportExportActionResult = {
  ok: boolean;
  message: string;
  reportId?: string;
  downloadUrl?: string;
};

export async function createReportExportAction(
  formData: FormData,
): Promise<CreateReportExportActionResult> {
  const session = await auth();
  const context = getReportUserContextFromSession(session);

  if (!context.userId) {
    return {
      ok: false,
      message: "You need to be signed in to generate reports.",
    };
  }

  if (!context.organisationId) {
    return {
      ok: false,
      message: "Your account is not linked to an organisation.",
    };
  }

  const reportTypeValue = formData.get("reportType");

  if (!isReportType(reportTypeValue)) {
    return {
      ok: false,
      message: "Please choose a valid report type.",
    };
  }

  if (!canGenerateReport({ context, reportType: reportTypeValue })) {
    return {
      ok: false,
      message: "You do not have permission to generate this report.",
    };
  }

  const format = normaliseReportFormat(formData.get("format"));
  const filters = parseReportFiltersFromForm(formData);

  try {
    /*
      Generate the report data first.

      If data generation fails, or if there are no matching records, we do not
      create a bb_report_export row. Only real, downloadable reports should be
      saved in the report history.
    */
    const dataset = await getReportDataset({
      organisationId: context.organisationId,
      reportType: reportTypeValue,
      filters,
    });

    if (dataset.rowCount === 0) {
      return {
        ok: false,
        message: getNoDataReportMessage(reportTypeValue),
      };
    }

    const title = buildReportTitle(reportTypeValue, filters);

    const fileName = buildReportFileName({
      reportType: reportTypeValue,
      format,
      createdAt: new Date(),
    });

    const inserted = await database
      .insert(reportExports)
      .values({
        organisationId: context.organisationId,
        requestedByUserId: context.userId,
        departmentId: context.departmentId ?? null,
        reportType: reportTypeValue,
        format,
        status: "completed",
        title,
        filtersJson: stringifyReportFilters(filters),
        fileName,
        mimeType:
          format === "json"
            ? "application/json; charset=utf-8"
            : "text/csv; charset=utf-8",
        rowCount: dataset.rowCount,
        generatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({
        id: reportExports.id,
      });

    const reportId = inserted[0]?.id;

    if (!reportId) {
      return {
        ok: false,
        message:
          "The report was prepared, but we could not save the export record. Please try again.",
      };
    }

    revalidatePath("/home/reports");
    revalidatePath("/admin/reports");

    return {
      ok: true,
      message: "Report generated successfully.",
      reportId,
      downloadUrl: `/api/reports/${reportId}/download`,
    };
  } catch (error) {
    console.error("[CREATE_REPORT_EXPORT_ERROR]", error);

    return {
      ok: false,
      message:
        "We could not generate this report right now. Please check your filters and try again. If the problem continues, contact support.",
    };
  }
}