"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import {
  createTemplateCore,
  getOrgTemplatesCore,
  addSectionCore,
  deleteSectionCore,
  addFieldCore,
  updateFieldCore,
  deleteFieldCore,
  toggleTemplateLockCore,
  reorderSectionsCore,
  reorderFieldsCore,
  cloneTemplateCore,
  ensureTemplateEditable,
} from "@/modules/templates/core/templateCore";

/* =========================================================
   TEMPLATE
========================================================= */

export async function createTemplateAction(name: string, description?: string) {
  const user = await requireOrgUser();

  return createTemplateCore({
    organisationId: user.organisationId,
    userId: user.userId,
    name,
    description,
  });
}

export async function getOrgTemplatesAction() {
  const user = await requireOrgUser();
  return getOrgTemplatesCore(user.organisationId);
}

/* =========================================================
   SECTION
========================================================= */

export async function addSectionAction(templateId: string, title: string) {
  await requireOrgUser();
  await ensureTemplateEditable(templateId);

  return addSectionCore(templateId, title);
}

export async function deleteSectionAction(sectionId: string) {
  await requireOrgUser();
  return deleteSectionCore(sectionId);
}

/* =========================================================
   FIELD
========================================================= */

export async function addFieldAction(input: any) {
  await requireOrgUser();
  await ensureTemplateEditable(input.templateId);

  return addFieldCore(input);
}

export async function updateFieldAction(fieldId: string, updates: any) {
  await requireOrgUser();
  return updateFieldCore(fieldId, updates);
}

export async function deleteFieldAction(fieldId: string) {
  await requireOrgUser();
  return deleteFieldCore(fieldId);
}

/* =========================================================
   STATE
========================================================= */

export async function toggleTemplateLockAction(templateId: string) {
  await requireOrgUser();
  return toggleTemplateLockCore(templateId);
}

/* =========================================================
   REORDER
========================================================= */

export async function reorderSectionsAction(
  templateId: string,
  orderedIds: string[],
) {
  await ensureTemplateEditable(templateId);
  return reorderSectionsCore(orderedIds);
}

export async function reorderFieldsAction(
  templateId: string,
  orderedIds: string[],
) {
  await ensureTemplateEditable(templateId);
  return reorderFieldsCore(orderedIds);
}

/* =========================================================
   CLONE
========================================================= */

export async function cloneTemplateAction(templateId: string) {
  const user = await requireOrgUser();

  return cloneTemplateCore(templateId, user.organisationId, user.userId);
}
