import { buildCommercialWorkbook } from "@/modules/admin-value/core/excel";
import { requireAdminValueAccess } from "@/modules/admin-value/core/requireAdminValueAccess";
import {
  getCommercialAdminData,
  parseCommercialDateRange,
} from "@/modules/admin-value/data-access/getCommercialAdminData";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireAdminValueAccess();
  const url = new URL(request.url);
  const range = parseCommercialDateRange({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const data = await getCommercialAdminData({
    organisationId: access.organisationId,
    range,
  });

  const buffer = await buildCommercialWorkbook({
    organisationName: access.organisationName,
    data,
  });

  const from = range.from.toISOString().slice(0, 10);
  const to = new Date(range.toExclusive.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="waste-x-commercial-${from}-to-${to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
