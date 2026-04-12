import { database } from "@/db/database";
import { listingTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getTemplateWithStructure(templateId: string) {
  if (!templateId) {
    throw new Error("TEMPLATE_ID_REQUIRED");
  }

  const template = await database.query.listingTemplates.findFirst({
    where: eq(listingTemplates.id, templateId),
    with: {
      sections: {
        orderBy: (sections, { asc }) => [asc(sections.orderIndex)],
        with: {
          fields: {
            orderBy: (fields, { asc }) => [asc(fields.orderIndex)],
          },
        },
      },
    },
  });

  if (!template) {
    throw new Error("TEMPLATE_NOT_FOUND");
  }

  return template;
}
