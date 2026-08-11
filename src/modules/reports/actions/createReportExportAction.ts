"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { reportExports, sites } from "@/db/schema";
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

function normaliseOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : null;
}

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

  const requestedSiteId = normaliseOptionalString(formData.get("siteId"));

  let selectedSiteId: string | null = null;

  if (requestedSiteId) {
    const selectedSite = await database.query.sites.findFirst({
      where: and(
        eq(sites.id, requestedSiteId),
        eq(sites.organisationId, context.organisationId),
        eq(sites.status, "active"),
      ),
      columns: {
        id: true,
      },
    });

    if (!selectedSite) {
      return {
        ok: false,
        message: "The selected site is not available for this organisation.",
      };
    }

    selectedSiteId = selectedSite.id;
  }

  const format = normaliseReportFormat(formData.get("format"));
  const filters = parseReportFiltersFromForm(formData);

  const filtersWithSite = selectedSiteId
    ? {
        ...filters,
        siteId: selectedSiteId,
      }
    : filters;

  try {
    const dataset = await getReportDataset({
      organisationId: context.organisationId,
      reportType: reportTypeValue,
      filters: filtersWithSite,
    });

    if (dataset.rowCount === 0) {
      return {
        ok: false,
        message: getNoDataReportMessage(reportTypeValue),
      };
    }

    const title = buildReportTitle(reportTypeValue, filtersWithSite);

    const fileName = buildReportFileName({
      reportType: reportTypeValue,
      format,
      createdAt: new Date(),
    });

    const inserted = await database
      .insert(reportExports)
      .values({
        organisationId: context.organisationId,
        siteId: selectedSiteId,
        requestedByUserId: context.userId,
        departmentId: context.departmentId ?? null,
        reportType: reportTypeValue,
        format,
        status: "completed",
        title,
        filtersJson: stringifyReportFilters(filtersWithSite),
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