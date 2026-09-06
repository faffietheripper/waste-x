import { auth } from "@/auth";
import { getWeighbridgeTicketData } from "@/modules/operations/weighbridge/getWeighbridgeTicketData";
import { renderWeighbridgeTicketPdf } from "@/modules/operations/weighbridge/renderWeighbridgeTicketPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { loadId: string } },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response("Unauthorised", { status: 401 });
  }

  const ticket = await getWeighbridgeTicketData({
    userId: session.user.id,
    loadId: params.loadId,
  });

  if (!ticket) {
    return new Response("Ticket not found or load is not completed.", {
      status: 404,
    });
  }

  const { body, fileName } = await renderWeighbridgeTicketPdf(ticket);

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
