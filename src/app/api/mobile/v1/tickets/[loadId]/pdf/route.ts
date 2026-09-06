import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { jobLoads } from "@/db/schema";
import { verifyMobileTicketLinkToken } from "@/lib/client-api/mobile-ticket-link";
import { getWeighbridgeTicketData } from "@/modules/operations/weighbridge/getWeighbridgeTicketData";
import { renderWeighbridgeTicketPdf } from "@/modules/operations/weighbridge/renderWeighbridgeTicketPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { loadId: string } },
) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const signed = verifyMobileTicketLinkToken(token);
  if (!signed || signed.loadId !== params.loadId) {
    return new Response("Ticket link is invalid or expired.", { status: 401 });
  }

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, params.loadId),
      eq(jobLoads.organisationId, signed.organisationId),
    ),
    columns: { id: true, status: true, ticketNumber: true },
  });
  if (!load || load.status !== "completed" || !load.ticketNumber?.trim()) {
    return new Response("Ticket not found or load is not completed.", { status: 404 });
  }

  const ticket = await getWeighbridgeTicketData({
    userId: signed.userId,
    loadId: params.loadId,
  });
  if (!ticket) {
    return new Response("Ticket is no longer available to this Waste X user.", {
      status: 403,
    });
  }

  const { body, fileName } = await renderWeighbridgeTicketPdf(ticket);

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
