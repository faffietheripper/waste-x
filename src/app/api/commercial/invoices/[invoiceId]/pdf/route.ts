import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { getCustomerInvoiceDocument } from "@/modules/commercial/invoiceDocument";
import { buildCustomerInvoicePdf } from "@/modules/commercial/invoicePdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set([
  "administrator",
  "accounts",
  "seniorManagement",
  "platform_admin",
]);

export async function GET(
  _request: Request,
  { params }: { params: { invoiceId: string } },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response("Unauthorised", { status: 401 });
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      organisationId: true,
      role: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (
    !currentUser?.organisationId ||
    !currentUser.isActive ||
    currentUser.isSuspended ||
    !ALLOWED_ROLES.has(currentUser.role)
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const document = await getCustomerInvoiceDocument({
    organisationId: currentUser.organisationId,
    invoiceId: params.invoiceId,
  });

  if (!document) {
    return new Response("Invoice not found", { status: 404 });
  }

  const bytes = await buildCustomerInvoicePdf(document);
  const fileBase =
    document.invoice.invoiceNumber ??
    `DRAFT-${document.invoice.id.slice(0, 8).toUpperCase()}`;

  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
