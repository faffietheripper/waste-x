import ExcelJS from "exceljs";

import { requireAdminValueAccess } from "@/modules/admin-value/core/requireAdminValueAccess";
import { parseQuarterSearchParams } from "@/modules/admin-value/core/quarterPeriods";
import { getQuarterlyWasteReturnData } from "@/modules/admin-value/data-access/getQuarterlyWasteReturnData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", wrapText: true };
}

function autoWidth(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = 12;

    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const text = cell.value === null || cell.value === undefined ? "" : String(cell.value);
      maxLength = Math.min(48, Math.max(maxLength, text.length + 2));
    });

    column.width = maxLength;
  });
}

export async function GET(request: Request) {
  const access = await requireAdminValueAccess();
  const url = new URL(request.url);
  const period = parseQuarterSearchParams({
    year: url.searchParams.get("year") ?? undefined,
    quarter: url.searchParams.get("quarter") ?? undefined,
  });

  const data = await getQuarterlyWasteReturnData({
    organisationId: access.organisationId,
    period,
    requestedSiteId: url.searchParams.get("siteId"),
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Waste X";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.addRow(["Waste X EA-ready quarterly return preparation"]);
  summary.addRow(["Organisation", access.organisationName]);
  summary.addRow(["Period", data.period.label]);
  summary.addRow(["Site", data.selectedSite?.name ?? "No site"]);
  summary.addRow(["Permit", data.selectedSite?.primaryPermitNumber ?? "Not configured"]);
  summary.addRow(["Regulator", data.selectedSite?.regulator ?? "Unknown"]);
  summary.addRow(["EA form version", data.settings.formVersion]);
  summary.addRow([]);
  summary.addRow(["Incoming regulator rows", data.incomingRows.length]);
  summary.addRow(["Incoming tonnes", data.totals.receivedTonnes]);
  summary.addRow(["Outgoing regulator rows", data.outgoingRows.length]);
  summary.addRow(["Outgoing tonnes", data.totals.removedTonnes]);
  const excludedLoadCount = new Set(
    data.exceptions.map((item) => item.jobLoadId),
  ).size;

  summary.addRow(["Excluded Loads", excludedLoadCount]);
  summary.addRow(["Exception issues", data.exceptions.length]);
  summary.addRow([]);
  summary.addRow([
    "Important",
    "Preparation workbook only. Valid Loads are included even when other Loads have exceptions. The Exceptions sheet lists excluded Loads/issues. Transfer/use the prepared Incoming and Outgoing data with the Environment Agency's current official Version 17.0 submission workbook.",
  ]);
  summary.getColumn(1).font = { bold: true };
  autoWidth(summary);

  const incoming = workbook.addWorksheet("Incoming");
  const incomingHeader = incoming.addRow([
    "Origin",
    "EWC Code",
    "Disposal or Recovery Code",
    "Municipal Source? (Y/N)",
    "Degradable? (Y/N)",
    "State",
    "From Another Activity",
    "Amount in Tonnes",
    "Pre-treatment",
    "Underlying Loads",
  ]);
  styleHeader(incomingHeader);

  for (const row of data.incomingRows) {
    incoming.addRow([
      row.origin,
      `${row.ewcCode} ${row.wasteDescription}`.trim(),
      row.disposalRecoveryCode,
      row.municipalSource ? "Yes" : "No",
      row.degradable ? "Yes" : "No",
      row.state,
      row.fromAnotherActivity,
      row.tonnes,
      row.preTreatment,
      row.loadCount,
    ]);
  }
  incoming.getColumn(8).numFmt = "0.000";
  incoming.views = [{ state: "frozen", ySplit: 1 }];
  autoWidth(incoming);

  const outgoing = workbook.addWorksheet("Outgoing");
  const outgoingHeader = outgoing.addRow([
    "Destination",
    "EWC Code",
    "Municipal Source?",
    "State",
    "Disposal or Recovery Code",
    "Amount in Tonnes",
    "Underlying Loads",
  ]);
  styleHeader(outgoingHeader);

  for (const row of data.outgoingRows) {
    outgoing.addRow([
      row.destination,
      `${row.ewcCode} ${row.wasteDescription}`.trim(),
      row.municipalSource ? "Yes" : "No",
      row.state,
      row.disposalRecoveryCode,
      row.tonnes,
      row.loadCount,
    ]);
  }
  outgoing.getColumn(6).numFmt = "0.000";
  outgoing.views = [{ state: "frozen", ySplit: 1 }];
  autoWidth(outgoing);

  const detail = workbook.addWorksheet("Movement Detail");
  const detailHeader = detail.addRow([
    "Direction",
    "Event At",
    "Job Number",
    "Load",
    "Ticket",
    "Origin",
    "Destination",
    "EWC",
    "Waste Description",
    "D/R Code",
    "Municipal Source",
    "Degradable",
    "State",
    "From Another Activity",
    "Pre-treatment",
    "Tonnes",
    "Job Load ID",
  ]);
  styleHeader(detailHeader);

  for (const row of data.detailRows) {
    detail.addRow([
      row.direction,
      row.eventAt,
      row.jobNumber,
      row.loadNumber,
      row.ticketNumber,
      row.origin,
      row.destination,
      row.ewcCode,
      row.wasteDescription,
      row.disposalRecoveryCode,
      row.municipalSource ? "Yes" : "No",
      row.degradable === null ? "" : row.degradable ? "Yes" : "No",
      row.state,
      row.fromAnotherActivity,
      row.preTreatment,
      row.tonnes,
      row.jobLoadId,
    ]);
  }
  detail.getColumn(16).numFmt = "0.000";
  detail.views = [{ state: "frozen", ySplit: 1 }];
  autoWidth(detail);

  const exceptions = workbook.addWorksheet("Exceptions");
  styleHeader(
    exceptions.addRow(["Job Number", "Load", "Job Load ID", "Blocking", "Issue"]),
  );
  for (const item of data.exceptions) {
    exceptions.addRow([
      item.jobNumber,
      item.loadNumber,
      item.jobLoadId,
      item.blocking ? "Yes" : "No",
      item.issue,
    ]);
  }
  autoWidth(exceptions);

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer);
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="waste-x-ea-ready-${period.label.replaceAll(" ", "-")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
