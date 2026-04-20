import { database } from "@/db/database";
import { listingTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrgUser } from "@/lib/access/require-org-user";
import TemplateEditorClient from "./TemplateEditorClient";
import { serialize } from "@/util/serialize";

export default async function TemplateEditor({
  params,
}: {
  params: { id: string };
}) {
  await requireOrgUser();

  const template = await database.query.listingTemplates.findFirst({
    where: eq(listingTemplates.id, params.id),
    with: {
      sections: {
        with: {
          fields: true,
        },
      },
    },
  });
  if (!template) return null;

  const normalizedTemplate = {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({
        ...field,
      })),
    })),
  };

  return <TemplateEditorClient template={serialize(normalizedTemplate)} />;
}
