import { rowsToCsv } from "@/modules/admin-value/core/csv";
import { requireAdminValueAccess } from "@/modules/admin-value/core/requireAdminValueAccess";
import { parseQuarterSearchParams } from "@/modules/admin-value/core/quarterPeriods";
import { getQuarterlyWasteReturnData } from "@/modules/admin-value/data-access/getQuarterlyWasteReturnData";

export const runtime = "nodejs";

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

  const rows: unknown[][] = [
    [
      "Direction",
      "Event At",
      "Job Number",
      "Load Number",
      "Ticket Number",
      "Receiving Site",
      "Permit / Authorisation",
      "Regulator",
      "EWC Code",
      "Waste Description",
      "Tonnes",
      "Client / Source",
      "Client Site / Origin",
      "Third-party Destination",
      "Job Load ID",
    ],
    ...data.detailRows.map((row) => [
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
    ]),
  ];

  return new Response(`\uFEFF${rowsToCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="waste-x-return-prep-${period.label.replaceAll(" ", "-")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
