import { and, desc, eq, gte, lt, or } from "drizzle-orm";

import { database } from "@/db/database";
import { wasteTrackingSubmissions } from "@/db/schema";
import { rowsToCsv } from "@/modules/admin-value/core/csv";
import { parseCommercialDateRange } from "@/modules/admin-value/data-access/getCommercialAdminData";
import { requireSoloWorkspaceAccess } from "@/modules/solo-workspace/core/requireSoloWorkspaceAccess";

export const runtime = "nodejs";

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

export async function GET(request: Request) {
  const access = await requireSoloWorkspaceAccess();
  const url = new URL(request.url);
  const range = parseCommercialDateRange({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const submissions = await database.query.wasteTrackingSubmissions.findMany({
    where: and(
      eq(wasteTrackingSubmissions.organisationId, access.organisationId),
      or(
        and(
          gte(wasteTrackingSubmissions.createdAt, range.from),
          lt(wasteTrackingSubmissions.createdAt, range.toExclusive),
        ),
        and(
          gte(wasteTrackingSubmissions.lastAttemptedAt, range.from),
          lt(wasteTrackingSubmissions.lastAttemptedAt, range.toExclusive),
        ),
      ),
    ),
    with: {
      jobLoad: {
        with: {
          job: {
            with: {
              ownSite: true,
            },
          },
          ewcCode: true,
        },
      },
      submittedByUser: true,
      site: true,
    },
    orderBy: [desc(wasteTrackingSubmissions.createdAt)],
  });

  const rows: unknown[][] = [
    [
      "Attempted At",
      "Status",
      "Waste Tracking ID",
      "Job",
      "Load",
      "EWC",
      "Receiving Site",
      "Method",
      "Endpoint",
      "Submitted By",
      "Submission ID",
    ],
    ...submissions.map((submission) => [
      submission.lastAttemptedAt ?? submission.createdAt,
      formatStatus(submission.status),
      submission.wasteTrackingId ?? "",
      submission.jobLoad?.job?.jobNumber ?? "Legacy / assignment submission",
      submission.jobLoad?.loadNumber ?? "",
      submission.jobLoad?.ewcCodeSnapshot ?? submission.jobLoad?.ewcCode?.code ?? "",
      submission.site?.name ?? submission.jobLoad?.job?.ownSite?.name ?? "",
      submission.method ?? "",
      submission.endpoint ?? "",
      submission.submittedByUser?.name ?? "",
      submission.id,
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
      "Content-Disposition": `attachment; filename="waste-x-dwt-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
