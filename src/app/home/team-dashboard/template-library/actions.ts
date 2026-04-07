"use server";

import { database } from "@/db/database";
import {
  listingTemplates,
  listingTemplateSections,
  listingTemplateFields,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireOrgUser } from "@/lib/access/require-org-user";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   CREATE TEMPLATE
========================================================= */

export const createTemplate = withErrorHandling(
  async (name: string, description?: string) => {
    const user = await requireOrgUser();

    const [template] = await database
      .insert(listingTemplates)
      .values({
        organisationId: user.organisationId,
        name,
        description,
        createdByUserId: user.userId,
      })
      .returning();

    return template;
  },
  {
    actionName: "createTemplate",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);

/* =========================================================
   GET ORG TEMPLATES
========================================================= */

export const getOrgTemplates = withErrorHandling(
  async () => {
    const user = await requireOrgUser();

    return database
      .select()
      .from(listingTemplates)
      .where(eq(listingTemplates.organisationId, user.organisationId));
  },
  {
    actionName: "getOrgTemplates",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   ADD SECTION
========================================================= */

export const addSection = withErrorHandling(
  async (templateId: string, title: string) => {
    await requireOrgUser();
    await ensureTemplateEditable(templateId);

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
  },
  {
    actionName: "addSection",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* =========================================================
   DELETE SECTION
========================================================= */

export const deleteSection = withErrorHandling(
  async (sectionId: string) => {
    await requireOrgUser();

    const section = await database
      .select()
      .from(listingTemplateSections)
      .where(eq(listingTemplateSections.id, sectionId));

    await ensureTemplateEditable(section[0].templateId);

    await database
      .delete(listingTemplateFields)
      .where(eq(listingTemplateFields.sectionId, sectionId));

    await database
      .delete(listingTemplateSections)
      .where(eq(listingTemplateSections.id, sectionId));

    return { success: true };
  },
  {
    actionName: "deleteSection",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* =========================================================
   ADD FIELD
========================================================= */

export const addFieldToSection = withErrorHandling(
  async ({
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
  }) => {
    await requireOrgUser();
    await ensureTemplateEditable(templateId);

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
  },
  {
    actionName: "addFieldToSection",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* =========================================================
   UPDATE FIELD
========================================================= */

export const updateField = withErrorHandling(
  async (
    fieldId: string,
    updates: Partial<{ label: string; required: boolean }>,
  ) => {
    await requireOrgUser();

    await database
      .update(listingTemplateFields)
      .set(updates)
      .where(eq(listingTemplateFields.id, fieldId));

    return { success: true };
  },
  {
    actionName: "updateField",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   DELETE FIELD
========================================================= */

export const deleteField = withErrorHandling(
  async (fieldId: string) => {
    await requireOrgUser();

    await database
      .delete(listingTemplateFields)
      .where(eq(listingTemplateFields.id, fieldId));

    return { success: true };
  },
  {
    actionName: "deleteField",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* =========================================================
   TOGGLE LOCK
========================================================= */

export const toggleTemplateLock = withErrorHandling(
  async (templateId: string) => {
    await requireOrgUser();

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

    return { isLocked: newState };
  },
  {
    actionName: "toggleTemplateLock",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);

/* =========================================================
   REORDER SECTIONS
========================================================= */

export const reorderSections = withErrorHandling(
  async (templateId: string, orderedIds: string[]) => {
    await ensureTemplateEditable(templateId);

    for (let i = 0; i < orderedIds.length; i++) {
      await database
        .update(listingTemplateSections)
        .set({ orderIndex: i + 1 })
        .where(eq(listingTemplateSections.id, orderedIds[i]));
    }

    return { success: true };
  },
  {
    actionName: "reorderSections",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* =========================================================
   REORDER FIELDS
========================================================= */

export const reorderFields = withErrorHandling(
  async (sectionId: string, orderedFieldIds: string[]) => {
    await requireOrgUser();

    const section = await database
      .select()
      .from(listingTemplateSections)
      .where(eq(listingTemplateSections.id, sectionId));

    if (!section.length) throw new Error("Section not found");

    const templateId = section[0].templateId;

    await ensureTemplateEditable(templateId);

    for (let i = 0; i < orderedFieldIds.length; i++) {
      await database
        .update(listingTemplateFields)
        .set({ orderIndex: i + 1 })
        .where(eq(listingTemplateFields.id, orderedFieldIds[i]));
    }

    return { success: true };
  },
  {
    actionName: "reorderFields",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* =========================================================
   CLONE TEMPLATE
========================================================= */

export const cloneTemplate = withErrorHandling(
  async (templateId: string) => {
    const user = await requireOrgUser();

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
        organisationId: user.organisationId,
        name: `${original.name} (Clone)`,
        description: original.description,
        createdByUserId: user.userId,
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
  },
  {
    actionName: "cloneTemplate",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);

/* =========================================================
   INTERNAL HELPERS (NOT WRAPPED)
========================================================= */

async function ensureTemplateEditable(templateId: string) {
  const template = await database
    .select()
    .from(listingTemplates)
    .where(eq(listingTemplates.id, templateId));

  if (!template.length) {
    throw new Error("Template not found");
  }

  if (template[0].isLocked) {
    throw new Error("Template is locked and cannot be modified");
  }
}

async function bumpTemplateVersion(templateId: string) {
  await database
    .update(listingTemplates)
    .set({
      version: sql`${listingTemplates.version} + 1`,
    })
    .where(eq(listingTemplates.id, templateId));
}
