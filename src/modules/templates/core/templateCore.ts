import { database } from "@/db/database";
import {
  listingTemplates,
  listingTemplateSections,
  listingTemplateFields,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/* =========================================================
   CREATE TEMPLATE
========================================================= */

export async function createTemplateCore({
  organisationId,
  userId,
  name,
  description,
}: {
  organisationId: string;
  userId: string;
  name: string;
  description?: string;
}) {
  const [template] = await database
    .insert(listingTemplates)
    .values({
      organisationId,
      name,
      description,
      createdByUserId: userId,
    })
    .returning();

  return template;
}

/* =========================================================
   GET ORG TEMPLATES
========================================================= */

export async function getOrgTemplatesCore(organisationId: string) {
  return database
    .select()
    .from(listingTemplates)
    .where(eq(listingTemplates.organisationId, organisationId));
}

/* =========================================================
   SECTION LOGIC
========================================================= */

export async function addSectionCore(templateId: string, title: string) {
  const existingSections = await database
    .select()
    .from(listingTemplateSections)
    .where(eq(listingTemplateSections.templateId, templateId));

  const nextOrder =
    existingSections.length === 0
      ? 1
      : Math.max(...existingSections.map((s) => s.orderIndex)) + 1;

  const [section] = await database
    .insert(listingTemplateSections)
    .values({
      templateId,
      title,
      orderIndex: nextOrder,
    })
    .returning();

  return section;
}

export async function deleteSectionCore(sectionId: string) {
  await database
    .delete(listingTemplateFields)
    .where(eq(listingTemplateFields.sectionId, sectionId));

  await database
    .delete(listingTemplateSections)
    .where(eq(listingTemplateSections.id, sectionId));
}

/* =========================================================
   FIELD LOGIC
========================================================= */

export async function addFieldCore({
  templateId,
  sectionId,
  key,
  label,
  fieldType,
  required,
}: {
  templateId: string;
  sectionId: string;
  key: string;
  label: string;
  fieldType: "text" | "number" | "dropdown" | "boolean" | "file";
  required?: boolean;
}) {
  const existingFields = await database
    .select()
    .from(listingTemplateFields)
    .where(eq(listingTemplateFields.sectionId, sectionId));

  const nextOrder =
    existingFields.length === 0
      ? 1
      : Math.max(...existingFields.map((f) => f.orderIndex)) + 1;

  const [field] = await database
    .insert(listingTemplateFields)
    .values({
      templateId,
      sectionId,
      key,
      label,
      fieldType,
      required,
      orderIndex: nextOrder,
    })
    .returning();

  return field;
}

export async function updateFieldCore(
  fieldId: string,
  updates: Partial<{ label: string; required: boolean }>,
) {
  await database
    .update(listingTemplateFields)
    .set(updates)
    .where(eq(listingTemplateFields.id, fieldId));
}

export async function deleteFieldCore(fieldId: string) {
  await database
    .delete(listingTemplateFields)
    .where(eq(listingTemplateFields.id, fieldId));
}

/* =========================================================
   TEMPLATE STATE
========================================================= */

export async function toggleTemplateLockCore(templateId: string) {
  const template = await database
    .select()
    .from(listingTemplates)
    .where(eq(listingTemplates.id, templateId));

  if (!template.length) throw new Error("Template not found");

  const newState = !template[0].isLocked;

  await database
    .update(listingTemplates)
    .set({ isLocked: newState })
    .where(eq(listingTemplates.id, templateId));

  return newState;
}

/* =========================================================
   REORDER
========================================================= */

export async function reorderSectionsCore(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await database
      .update(listingTemplateSections)
      .set({ orderIndex: i + 1 })
      .where(eq(listingTemplateSections.id, orderedIds[i]));
  }
}

export async function reorderFieldsCore(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await database
      .update(listingTemplateFields)
      .set({ orderIndex: i + 1 })
      .where(eq(listingTemplateFields.id, orderedIds[i]));
  }
}

/* =========================================================
   CLONE
========================================================= */

export async function cloneTemplateCore(
  templateId: string,
  organisationId: string,
  userId: string,
) {
  const original = await database.query.listingTemplates.findFirst({
    where: eq(listingTemplates.id, templateId),
    with: {
      sections: {
        with: { fields: true },
      },
    },
  });

  if (!original) throw new Error("Template not found");

  const [newTemplate] = await database
    .insert(listingTemplates)
    .values({
      organisationId,
      name: `${original.name} (Clone)`,
      description: original.description,
      createdByUserId: userId,
      version: 1,
      isLocked: false,
    })
    .returning();

  for (const section of original.sections) {
    const [newSection] = await database
      .insert(listingTemplateSections)
      .values({
        templateId: newTemplate.id,
        title: section.title,
        orderIndex: section.orderIndex,
      })
      .returning();

    for (const field of section.fields) {
      await database.insert(listingTemplateFields).values({
        templateId: newTemplate.id,
        sectionId: newSection.id,
        key: field.key,
        label: field.label,
        fieldType: field.fieldType,
        required: field.required,
        orderIndex: field.orderIndex,
        optionsJson: field.optionsJson,
      });
    }
  }

  return newTemplate;
}

/* =========================================================
   GUARD
========================================================= */

export async function ensureTemplateEditable(templateId: string) {
  const template = await database
    .select()
    .from(listingTemplates)
    .where(eq(listingTemplates.id, templateId));

  if (!template.length) throw new Error("Template not found");

  if (template[0].isLocked) {
    throw new Error("TEMPLATE_LOCKED");
  }
}
