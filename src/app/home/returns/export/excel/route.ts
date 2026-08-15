import { buildWasteReturnWorkbook } from "@/modules/admin-value/core/excel";
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

  const buffer = await buildWasteReturnWorkbook({
    organisationName: access.organisationName,
    data,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="waste-x-return-prep-${period.label.replaceAll(" ", "-")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
