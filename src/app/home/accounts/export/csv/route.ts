import { rowsToCsv } from "@/modules/admin-value/core/csv";
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

  const rows: unknown[][] = [
    [
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
      "Recorded Direct Cost",
      "Operational Margin",
      "Currency",
      "Billing Status",
      "Customer Invoice Reference",
      "Customer Invoiced At",
      "Pricing Issues",
    ],
    ...data.jobs.map((job) => [
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
    ]),
  ];

  const from = range.from.toISOString().slice(0, 10);
  const to = new Date(range.toExclusive.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  return new Response(`\uFEFF${rowsToCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="waste-x-commercial-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
