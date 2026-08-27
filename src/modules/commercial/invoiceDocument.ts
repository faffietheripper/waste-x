import { and, asc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  customerInvoiceLines,
  customerInvoices,
} from "@/db/commercial-schema";

export async function getCustomerInvoiceDocument(params: {
  organisationId: string;
  invoiceId: string;
}) {
  const invoice = await database.query.customerInvoices.findFirst({
    where: and(
      eq(customerInvoices.id, params.invoiceId),
      eq(customerInvoices.organisationId, params.organisationId),
    ),
  });

  if (!invoice) return null;

  const lines = await database.query.customerInvoiceLines.findMany({
    where: and(
      eq(customerInvoiceLines.invoiceId, invoice.id),
      eq(customerInvoiceLines.organisationId, params.organisationId),
    ),
    orderBy: [
      asc(customerInvoiceLines.sortOrder),
      asc(customerInvoiceLines.createdAt),
    ],
  });

  return {
    invoice,
    lines,
  };
}
