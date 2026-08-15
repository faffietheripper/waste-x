import { rowsToCsv } from "@/modules/admin-value/core/csv";
import {
  parseCommercialDateRange,
} from "@/modules/admin-value/data-access/getCommercialAdminData";
import { getSoloReportsData } from "@/modules/reports/solo/getSoloReportsData";
import { requireSoloWorkspaceAccess } from "@/modules/solo-workspace/core/requireSoloWorkspaceAccess";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireSoloWorkspaceAccess();
  const url = new URL(request.url);
  const range = parseCommercialDateRange({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const data = await getSoloReportsData({
    organisationId: access.organisationId,
    range,
    includeCommercial: access.canSeeFinancials,
  });

  const rows: unknown[][] = [
    ["Waste X Operations Report"],
    ["Organisation", access.organisationName],
    ["From", range.from.toISOString().slice(0, 10)],
    ["To", new Date(range.toExclusive.getTime() - 86_400_000).toISOString().slice(0, 10)],
    [],
    ["Operational Summary"],
    ["Metric", "Value"],
    ["Jobs booked", data.operations.jobsBooked],
    ["Jobs completed", data.operations.jobsCompleted],
    ["Completed loads", data.operations.completedLoads],
    ["Received loads", data.operations.receivedLoads],
    ["Received tonnes", data.operations.receivedTonnes],
    ["Rejected loads", data.operations.rejectedLoads],
    ["Unique clients", data.operations.uniqueClients],
    [],
    ["Waste Received by EWC"],
    ["EWC", "Description", "Loads", "Tonnes"],
    ...data.ewcRows.map((row) => [
      row.ewcCode,
      row.description,
      row.loads,
      row.tonnes,
    ]),
    [],
    ["Client Activity"],
    [
      "Client",
      "Jobs",
      "Completed Loads",
      "Tonnes",
      ...(access.canSeeFinancials ? ["Revenue GBP"] : []),
    ],
    ...data.clientRows.map((row) => [
      row.clientName,
      row.jobs,
      row.completedLoads,
      row.tonnes,
      ...(access.canSeeFinancials ? [row.revenue] : []),
    ]),
  ];

  const csv = rowsToCsv(rows);
  const from = range.from.toISOString().slice(0, 10);
  const to = new Date(range.toExclusive.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="waste-x-operations-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
