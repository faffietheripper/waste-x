import type { ReportDataset } from "./getReportData";
import type { ReportFilters, ReportType } from "./reportTypes";

export function renderJsonReport({
  dataset,
  reportType,
  organisationId,
  filters,
}: {
  dataset: ReportDataset;
  reportType: ReportType;
  organisationId: string;
  filters: ReportFilters;
}) {
  return JSON.stringify(
    {
      generatedBy: "Waste X",
      reportType,
      organisationId,
      filters,
      rowCount: dataset.rowCount,
      generatedAt: new Date().toISOString(),
      columns: dataset.columns,
      rows: dataset.rows,
    },
    null,
    2,
  );
}