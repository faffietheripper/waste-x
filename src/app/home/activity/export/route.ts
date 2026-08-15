import { rowsToCsv } from "@/modules/admin-value/core/csv";
import {
  getSoloActivityFeed,
  parseActivityRange,
  type ActivityCategory,
} from "@/modules/activity/data-access/getSoloActivityFeed";
import { requireSoloWorkspaceAccess } from "@/modules/solo-workspace/core/requireSoloWorkspaceAccess";

export const runtime = "nodejs";

const CATEGORIES = new Set<ActivityCategory>([
  "job",
  "load",
  "dwt",
  "billing",
  "report",
  "audit",
]);

export async function GET(request: Request) {
  const access = await requireSoloWorkspaceAccess();

  if (!access.canExportAudit) {
    return new Response("You do not have permission to export organisation activity.", {
      status: 403,
    });
  }

  const url = new URL(request.url);
  const range = parseActivityRange({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const requestedCategory = url.searchParams.get("category") ?? "";
  const category = CATEGORIES.has(requestedCategory as ActivityCategory)
    ? (requestedCategory as ActivityCategory)
    : null;
  const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const feed = await getSoloActivityFeed({
    organisationId: access.organisationId,
    range,
    limit: 1000,
  });

  const items = feed.items.filter((item) => {
    if (category && item.category !== category) return false;
    if (!search) return true;

    return [
      item.title,
      item.detail,
      item.reference,
      item.actorName ?? "",
      item.category,
    ].some((value) => value.toLowerCase().includes(search));
  });

  const rows: unknown[][] = [
    [
      "Occurred At",
      "Category",
      "Title",
      "Detail",
      "Reference",
      "Actor",
      "Link",
    ],
    ...items.map((item) => [
      item.occurredAt,
      item.category,
      item.title,
      item.detail,
      item.reference,
      item.actorName ?? "",
      item.href ?? "",
    ]),
  ];

  const csv = rowsToCsv(rows);
  const fileName = `waste-x-activity-${range.from.toISOString().slice(0, 10)}-to-${new Date(
    range.toExclusive.getTime() - 86_400_000,
  )
    .toISOString()
    .slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
