import ExcelJS from "exceljs";

import type { CommercialAdminData } from "../data-access/getCommercialAdminData";
import type { QuarterlyWasteReturnData } from "../data-access/getQuarterlyWasteReturnData";

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle" };
}

function autoWidth(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = 12;

    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value;
      const text = value === null || value === undefined ? "" : String(value);
      maxLength = Math.min(45, Math.max(maxLength, text.length + 2));
    });

    column.width = maxLength;
  });
}

function addCommercialSummarySheet(params: {
  workbook: ExcelJS.Workbook;
  organisationName: string;
  data: CommercialAdminData;
}) {
  const sheet = params.workbook.addWorksheet("Summary");

  sheet.addRow(["Waste X commercial export"]);
  sheet.addRow(["Organisation", params.organisationName]);
  sheet.addRow(["From", params.data.range.from]);
  sheet.addRow(["To (exclusive)", params.data.range.toExclusive]);
  sheet.addRow([]);
  sheet.addRow(["Completed jobs", params.data.totals.completedJobs]);
  sheet.addRow(["Completed loads", params.data.totals.completedLoads]);
  sheet.addRow(["Tonnes", params.data.totals.tonnes]);
  sheet.addRow(["Operational revenue", params.data.totals.revenue]);
  sheet.addRow(["Recorded direct costs", params.data.totals.directCost]);
  sheet.addRow(["Operational margin", params.data.totals.margin]);
  sheet.addRow(["Billed revenue", params.data.totals.billedRevenue]);
  sheet.addRow(["Unbilled revenue", params.data.totals.unbilledRevenue]);
  sheet.addRow([]);
  sheet.addRow([
    "Important",
    "Operational revenue/direct costs are calculated from Waste X job-load rate snapshots. This is not a statutory set of accounts and excludes overheads, VAT, tax, internal fleet costs unless explicitly recorded, and accounting adjustments.",
  ]);

  sheet.getColumn(1).font = { bold: true };
  sheet.getCell("B3").numFmt = "dd mmm yyyy";
  sheet.getCell("B4").numFmt = "dd mmm yyyy";
  sheet.getCell("B8").numFmt = "0.000";
  [9, 10, 11, 12, 13].forEach((rowNumber) => {
    sheet.getCell(rowNumber, 2).numFmt = "£#,##0.00";
  });
  autoWidth(sheet);
}

export async function buildCommercialWorkbook(params: {
  organisationName: string;
  data: CommercialAdminData;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Waste X";
  workbook.created = new Date();

  addCommercialSummarySheet({
    workbook,
    organisationName: params.organisationName,
    data: params.data,
  });

  const jobsSheet = workbook.addWorksheet("Jobs");
  const jobsHeader = jobsSheet.addRow([
    "Job ID",
    "Job Number",
    "Job Date",
    "Completed At",
    "Client",
    "Client Site",
    "Customer PO",
    "Customer Reference",
    "Matched Rate",
    "Completed Loads",
    "Tonnes",
    "Revenue",
    "Haulage Cost",
    "Tipping Cost",
    "Direct Cost",
    "Margin",
    "Currency",
    "Billing Status",
    "Customer Invoice Reference",
    "Customer Invoiced At",
    "Pricing Issue",
  ]);
  styleHeader(jobsHeader);

  for (const job of params.data.jobs) {
    jobsSheet.addRow([
      job.id,
      job.jobNumber,
      job.jobDate,
      job.completedAt,
      job.clientName,
      job.clientSiteName,
      job.purchaseOrder,
      job.customerReference,
      job.customerRateLabel,
      job.completedLoads,
      job.tonnes,
      job.revenue,
      job.haulageCost,
      job.tippingCost,
      job.directCost,
      job.margin,
      job.currency,
      job.isBilled ? "Billed" : "Unbilled",
      job.customerInvoiceReference,
      job.customerInvoicedAt,
      [
        job.missingCustomerPrice ? "No customer charge snapshot" : "",
        ...job.pricingIssues,
      ]
        .filter(Boolean)
        .join(" | "),
    ]);
  }

  [12, 13, 14, 15, 16].forEach((columnNumber) => {
    jobsSheet.getColumn(columnNumber).numFmt = "£#,##0.00";
  });

  jobsSheet.getColumn(11).numFmt = "0.000";
  jobsSheet.views = [{ state: "frozen", ySplit: 1 }];
  autoWidth(jobsSheet);

  const unbilledSheet = workbook.addWorksheet("Unbilled Jobs");
  const unbilledHeader = unbilledSheet.addRow([
    "Job Number",
    "Completed At",
    "Client",
    "Customer PO",
    "Loads",
    "Tonnes",
    "Revenue",
    "Recorded Direct Cost",
    "Margin",
  ]);
  styleHeader(unbilledHeader);

  for (const job of params.data.unbilledJobs) {
    unbilledSheet.addRow([
      job.jobNumber,
      job.completedAt,
      job.clientName,
      job.purchaseOrder,
      job.completedLoads,
      job.tonnes,
      job.revenue,
      job.directCost,
      job.margin,
    ]);
  }

  [7, 8, 9].forEach((columnNumber) => {
    unbilledSheet.getColumn(columnNumber).numFmt = "£#,##0.00";
  });
  unbilledSheet.getColumn(6).numFmt = "0.000";
  autoWidth(unbilledSheet);

  return workbook.xlsx.writeBuffer();
}

export async function buildWasteReturnWorkbook(params: {
  organisationName: string;
  data: QuarterlyWasteReturnData;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Waste X";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.addRow(["Waste X quarterly waste-return preparation"]);
  summary.addRow(["Organisation", params.organisationName]);
  summary.addRow(["Period", params.data.period.label]);
  summary.addRow(["Period dates", params.data.period.periodLabel]);
  summary.addRow(["Site", params.data.selectedSite?.name ?? "No site"]);
  summary.addRow([
    "Permit / authorisation",
    params.data.selectedSite?.primaryPermitNumber ?? "Not configured",
  ]);
  summary.addRow(["Regulator", params.data.selectedSite?.regulator ?? "Unknown"]);
  summary.addRow([]);
  summary.addRow(["Waste received - loads", params.data.totals.receivedLoads]);
  summary.addRow(["Waste received - tonnes", params.data.totals.receivedTonnes]);
  summary.addRow(["Waste removed - loads", params.data.totals.removedLoads]);
  summary.addRow(["Waste removed - tonnes", params.data.totals.removedTonnes]);
  summary.addRow(["Blocking data exceptions", params.data.exceptions.length]);
  summary.addRow([]);
  summary.addRow([
    "Important",
    "Preparation workbook only. It is not the Environment Agency submission workbook and must not be emailed as the official return. Reconcile the data, resolve exceptions, then complete the regulator's current official return format.",
  ]);
  summary.getColumn(1).font = { bold: true };
  autoWidth(summary);

  const aggregates = workbook.addWorksheet("EWC Summary");
  const aggregateHeader = aggregates.addRow([
    "EWC Code",
    "Waste Description",
    "Received Loads",
    "Received Tonnes",
    "Removed Loads",
    "Removed Tonnes",
  ]);
  styleHeader(aggregateHeader);

  for (const row of params.data.aggregateRows) {
    aggregates.addRow([
      row.ewcCode,
      row.wasteDescription,
      row.receivedLoads,
      row.receivedTonnes,
      row.removedLoads,
      row.removedTonnes,
    ]);
  }
  aggregates.getColumn(4).numFmt = "0.000";
  aggregates.getColumn(6).numFmt = "0.000";
  aggregates.views = [{ state: "frozen", ySplit: 1 }];
  autoWidth(aggregates);

  const detail = workbook.addWorksheet("Movement Detail");
  const detailHeader = detail.addRow([
    "Direction",
    "Event At",
    "Job Number",
    "Load",
    "Ticket",
    "Site",
    "Permit",
    "Regulator",
    "EWC Code",
    "Waste Description",
    "Tonnes",
    "Client / Source",
    "Client Site / Origin",
    "Third-party Destination",
    "Job Load ID",
  ]);
  styleHeader(detailHeader);

  for (const row of params.data.detailRows) {
    detail.addRow([
      row.direction,
      row.eventAt,
      row.jobNumber,
      row.loadNumber,
      row.ticketNumber,
      row.siteName,
      row.permitNumber,
      row.regulator,
      row.ewcCode,
      row.wasteDescription,
      row.tonnes,
      row.counterpartyName,
      row.counterpartySiteName,
      row.thirdPartyDestination,
      row.jobLoadId,
    ]);
  }
  detail.getColumn(11).numFmt = "0.000";
  detail.views = [{ state: "frozen", ySplit: 1 }];
  autoWidth(detail);

  const exceptions = workbook.addWorksheet("Exceptions");
  const exceptionHeader = exceptions.addRow([
    "Job Number",
    "Load",
    "Job Load ID",
    "Blocking",
    "Issue",
  ]);
  styleHeader(exceptionHeader);

  for (const item of params.data.exceptions) {
    exceptions.addRow([
      item.jobNumber,
      item.loadNumber,
      item.jobLoadId,
      item.blocking ? "Yes" : "No",
      item.issue,
    ]);
  }
  autoWidth(exceptions);

  return workbook.xlsx.writeBuffer();
}
