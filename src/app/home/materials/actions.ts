// src/app/home/materials/actions.ts

"use server";

/* WASTE_X_MATERIAL_CLASSIFICATION_CATALOGUE_V1 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  and,
  eq,
  ne,
} from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  disposalRecoveryCodes,
  ewcCodes,
  materialProfiles,
  users,
} from "@/db/schema";

/* =========================================================
   TYPES
========================================================= */

type UserContext = {
  userId: string;
  organisationId: string;
};

type PhysicalForm =
  | "Gas"
  | "Liquid"
  | "Solid"
  | "Powder"
  | "Sludge"
  | "Mixed";

type WeightMetric =
  | "Grams"
  | "Kilograms"
  | "Tonnes";

type ComponentSource =
  | "NOT_PROVIDED"
  | "PROVIDED_WITH_WASTE"
  | "GUIDANCE"
  | "OWN_TESTING";

/* =========================================================
   VALID VALUES
========================================================= */

const PHYSICAL_FORMS: PhysicalForm[] = [
  "Gas",
  "Liquid",
  "Solid",
  "Powder",
  "Sludge",
  "Mixed",
];

const WEIGHT_METRICS: WeightMetric[] = [
  "Grams",
  "Kilograms",
  "Tonnes",
];

const COMPONENT_SOURCES: ComponentSource[] = [
  "NOT_PROVIDED",
  "PROVIDED_WITH_WASTE",
  "GUIDANCE",
  "OWN_TESTING",
];

/* =========================================================
   AUTH
========================================================= */

async function requireMasterDataEditor(): Promise<UserContext> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser =
    await database.query.users.findFirst({
      where: eq(
        users.id,
        session.user.id,
      ),

      columns: {
        id: true,
        organisationId: true,
        role: true,
        isActive: true,
        isSuspended: true,
      },
    });

  if (
    !currentUser?.organisationId ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect("/home?reason=account_unavailable");
  }

  if (
    currentUser.role !== "administrator" &&
    currentUser.role !== "seniorManagement"
  ) {
    redirect("/home?reason=unauthorised");
  }

  return {
    userId: currentUser.id,
    organisationId:
      currentUser.organisationId,
  };
}

/* =========================================================
   HELPERS
========================================================= */

function cleanString(
  value: FormDataEntryValue | null,
) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function optionalString(
  value: FormDataEntryValue | null,
) {
  const cleaned =
    cleanString(value);

  return cleaned
    ? cleaned
    : null;
}

function checkbox(
  value: FormDataEntryValue | null,
) {
  return (
    value === "on" ||
    value === "true" ||
    value === "1"
  );
}

function normaliseEwcCode(
  value: FormDataEntryValue | null,
) {
  return cleanString(value)
    .replace(/[^0-9]/g, "")
    .trim();
}

function normaliseDrCode(
  value: FormDataEntryValue | null,
) {
  return cleanString(value)
    .replace(/\s/g, "")
    .toUpperCase();
}

function normaliseContainerCode(
  value: FormDataEntryValue | null,
) {
  return cleanString(value)
    .replace(/\s/g, "")
    .toUpperCase();
}

function physicalForm(
  value: FormDataEntryValue | null,
): PhysicalForm {
  const cleaned =
    cleanString(
      value,
    ) as PhysicalForm;

  if (
    PHYSICAL_FORMS.includes(
      cleaned,
    )
  ) {
    return cleaned;
  }

  return "Solid";
}

function weightMetric(
  value: FormDataEntryValue | null,
): WeightMetric {
  const cleaned =
    cleanString(
      value,
    ) as WeightMetric;

  if (
    WEIGHT_METRICS.includes(
      cleaned,
    )
  ) {
    return cleaned;
  }

  return "Tonnes";
}

function componentSource(
  value: FormDataEntryValue | null,
): ComponentSource {
  const cleaned =
    cleanString(
      value,
    ) as ComponentSource;

  if (
    COMPONENT_SOURCES.includes(
      cleaned,
    )
  ) {
    return cleaned;
  }

  return "NOT_PROVIDED";
}

function numberOfContainers(
  value: FormDataEntryValue | null,
) {
  const parsed = Number(
    cleanString(value),
  );

  if (
    !Number.isInteger(parsed) ||
    parsed < 0
  ) {
    return null;
  }

  return parsed;
}

/* =========================================================
   REDIRECTS
========================================================= */

function redirectNewError(
  error: string,
): never {
  redirect(
    `/home/materials/new?error=${encodeURIComponent(
      error,
    )}`,
  );
}

function redirectMaterialError(
  materialId: string,
  error: string,
): never {
  redirect(
    `/home/materials/${materialId}/edit?error=${encodeURIComponent(
      error,
    )}`,
  );
}

/* =========================================================
   VALIDATE FACTUAL EWC CLASSIFICATION

   Material Profiles describe the waste itself. They are not
   an authorisation decision for a receiving site.
========================================================= */

async function getClassificationEwc(
  ewcCode: string,
) {
  return database.query.ewcCodes.findFirst({
    where: and(
      eq(
        ewcCodes.code,
        ewcCode,
      ),
      eq(
        ewcCodes.isActive,
        true,
      ),
      eq(
        ewcCodes.classificationUsable,
        true,
      ),
    ),
  });
}

/* =========================================================
   GET D/R CODE
========================================================= */

async function getDisposalRecoveryCode(
  code: string,
) {
  return database.query.disposalRecoveryCodes.findFirst({
    where: and(
      eq(
        disposalRecoveryCodes.code,
        code,
      ),
      eq(
        disposalRecoveryCodes.isActive,
        true,
      ),
    ),
  });
}

/* =========================================================
   CREATE MATERIAL PROFILE
========================================================= */

export async function createMaterialProfileAction(
  formData: FormData,
) {
  const context =
    await requireMasterDataEditor();

  const name = cleanString(
    formData.get("name"),
  );

  const ewcCode =
    normaliseEwcCode(
      formData.get("ewcCode"),
    );

  const wasteDescription =
    cleanString(
      formData.get(
        "wasteDescription",
      ),
    );

  const form =
    physicalForm(
      formData.get(
        "physicalForm",
      ),
    );

  const containers =
    numberOfContainers(
      formData.get(
        "defaultNumberOfContainers",
      ),
    );

  const containerType =
    normaliseContainerCode(
      formData.get(
        "defaultContainerType",
      ),
    );

  const drCode =
    normaliseDrCode(
      formData.get(
        "defaultDisposalRecoveryCode",
      ),
    );

  const metric =
    weightMetric(
      formData.get(
        "defaultWeightMetric",
      ),
    );

  const containsPops =
    checkbox(
      formData.get(
        "containsPops",
      ),
    );

  const popsSource =
    componentSource(
      formData.get(
        "popsSourceOfComponents",
      ),
    );

  const popsComponents =
    optionalString(
      formData.get(
        "popsComponents",
      ),
    );

  const hazardousSource =
    componentSource(
      formData.get(
        "hazardousSourceOfComponents",
      ),
    );

  const hazardousHazCodes =
    optionalString(
      formData.get(
        "hazardousHazCodes",
      ),
    );

  const hazardousComponents =
    optionalString(
      formData.get(
        "hazardousComponents",
      ),
    );

  const favourite =
    checkbox(
      formData.get(
        "isFavourite",
      ),
    );

  const notes =
    optionalString(
      formData.get("notes"),
    );

  /* =======================================================
     BASIC VALIDATION
  ======================================================= */

  if (!name) {
    redirectNewError(
      "name_required",
    );
  }

  if (
    ewcCode.length !== 6
  ) {
    redirectNewError(
      "invalid_ewc",
    );
  }

  if (!wasteDescription) {
    redirectNewError(
      "description_required",
    );
  }

  if (
    containers === null
  ) {
    redirectNewError(
      "invalid_container_count",
    );
  }

  if (!containerType) {
    redirectNewError(
      "container_type_required",
    );
  }

  if (!drCode) {
    redirectNewError(
      "dr_code_required",
    );
  }

  /* =======================================================
     EWC MUST BE A VALID FACTUAL CLASSIFICATION
  ======================================================= */

  const ewc =
    await getClassificationEwc(
      ewcCode,
    );

  if (!ewc) {
    redirectNewError(
      "invalid_ewc",
    );
  }

  /* =======================================================
     D/R VALIDATION
  ======================================================= */

  const disposalRecovery =
    await getDisposalRecoveryCode(
      drCode,
    );

  if (!disposalRecovery) {
    redirectNewError(
      "invalid_dr_code",
    );
  }

  /* =======================================================
     HAZARDOUS STATUS

     For the profile we derive this from the selected EWC
     catalogue entry rather than allowing contradictory input.
  ======================================================= */

  const containsHazardous =
    ewc.isHazardous === true;

  /* =======================================================
     POP VALIDATION
  ======================================================= */

  if (
    containsPops &&
    (
      popsSource ===
        "GUIDANCE" ||
      popsSource ===
        "OWN_TESTING"
    ) &&
    !popsComponents
  ) {
    redirectNewError(
      "pops_components_required",
    );
  }

  /* =======================================================
     HAZARDOUS VALIDATION
  ======================================================= */

  if (
    containsHazardous &&
    (
      hazardousSource ===
        "GUIDANCE" ||
      hazardousSource ===
        "OWN_TESTING"
    ) &&
    !hazardousComponents
  ) {
    redirectNewError(
      "hazardous_components_required",
    );
  }

  /* =======================================================
     DUPLICATE NAME
  ======================================================= */

  const duplicate =
    await database.query.materialProfiles.findFirst({
      where: and(
        eq(
          materialProfiles.organisationId,
          context.organisationId,
        ),
        eq(
          materialProfiles.name,
          name,
        ),
      ),

      columns: {
        id: true,
      },
    });

  if (duplicate) {
    redirectNewError(
      "duplicate_name",
    );
  }

  /* =======================================================
     CREATE
  ======================================================= */

  const [created] =
    await database
      .insert(materialProfiles)
      .values({
        organisationId:
          context.organisationId,

        siteId:
          null,

        name,

        ewcCodeId:
          ewc.id,

        wasteDescription,

        physicalForm:
          form,

        defaultNumberOfContainers:
          containers,

        defaultContainerType:
          containerType,

        containsPops,

        popsSourceOfComponents:
          containsPops
            ? popsSource
            : null,

        popsComponents:
          containsPops &&
          popsSource !==
            "NOT_PROVIDED"
            ? popsComponents
            : null,

        containsHazardous,

        hazardousSourceOfComponents:
          containsHazardous
            ? hazardousSource
            : null,

        hazardousHazCodes:
          containsHazardous
            ? hazardousHazCodes
            : null,

        hazardousComponents:
          containsHazardous &&
          hazardousSource !==
            "NOT_PROVIDED"
            ? hazardousComponents
            : null,

        defaultDisposalRecoveryCodeId:
          disposalRecovery.id,

        defaultWeightMetric:
          metric,

        isFavourite:
          favourite,

        isActive: true,

        notes,

        createdByUserId:
          context.userId,

        createdAt:
          new Date(),

        updatedAt:
          new Date(),
      })
      .returning({
        id:
          materialProfiles.id,
      });

  if (!created) {
    redirectNewError(
      "create_failed",
    );
  }

  revalidatePath(
    "/home/materials",
  );

  redirect(
    `/home/materials/${created.id}?success=created`,
  );
}

/* =========================================================
   UPDATE MATERIAL PROFILE
========================================================= */

export async function updateMaterialProfileAction(
  formData: FormData,
) {
  const context =
    await requireMasterDataEditor();

  const materialId =
    cleanString(
      formData.get(
        "materialId",
      ),
    );

  if (!materialId) {
    redirect(
      "/home/materials?error=missing_material",
    );
  }

  const existing =
    await database.query.materialProfiles.findFirst({
      where: and(
        eq(
          materialProfiles.id,
          materialId,
        ),
        eq(
          materialProfiles.organisationId,
          context.organisationId,
        ),
      ),
    });

  if (!existing) {
    redirect(
      "/home/materials?error=material_not_found",
    );
  }

  const name = cleanString(
    formData.get("name"),
  );

  const ewcCode =
    normaliseEwcCode(
      formData.get(
        "ewcCode",
      ),
    );

  const wasteDescription =
    cleanString(
      formData.get(
        "wasteDescription",
      ),
    );

  const form =
    physicalForm(
      formData.get(
        "physicalForm",
      ),
    );

  const containers =
    numberOfContainers(
      formData.get(
        "defaultNumberOfContainers",
      ),
    );

  const containerType =
    normaliseContainerCode(
      formData.get(
        "defaultContainerType",
      ),
    );

  const drCode =
    normaliseDrCode(
      formData.get(
        "defaultDisposalRecoveryCode",
      ),
    );

  const metric =
    weightMetric(
      formData.get(
        "defaultWeightMetric",
      ),
    );

  const containsPops =
    checkbox(
      formData.get(
        "containsPops",
      ),
    );

  const popsSource =
    componentSource(
      formData.get(
        "popsSourceOfComponents",
      ),
    );

  const popsComponents =
    optionalString(
      formData.get(
        "popsComponents",
      ),
    );

  const hazardousSource =
    componentSource(
      formData.get(
        "hazardousSourceOfComponents",
      ),
    );

  const hazardousHazCodes =
    optionalString(
      formData.get(
        "hazardousHazCodes",
      ),
    );

  const hazardousComponents =
    optionalString(
      formData.get(
        "hazardousComponents",
      ),
    );

  const favourite =
    checkbox(
      formData.get(
        "isFavourite",
      ),
    );

  const notes =
    optionalString(
      formData.get("notes"),
    );

  /* =======================================================
     VALIDATE
  ======================================================= */

  if (!name) {
    redirectMaterialError(
      materialId,
      "name_required",
    );
  }

  if (
    ewcCode.length !== 6
  ) {
    redirectMaterialError(
      materialId,
      "invalid_ewc",
    );
  }

  if (!wasteDescription) {
    redirectMaterialError(
      materialId,
      "description_required",
    );
  }

  if (
    containers === null
  ) {
    redirectMaterialError(
      materialId,
      "invalid_container_count",
    );
  }

  if (!containerType) {
    redirectMaterialError(
      materialId,
      "container_type_required",
    );
  }

  if (!drCode) {
    redirectMaterialError(
      materialId,
      "dr_code_required",
    );
  }

  /* =======================================================
     FACTUAL EWC CLASSIFICATION

     Material Profiles are reusable classification records.
     Receiving-site acceptance is checked when they are used.
  ======================================================= */

  const ewc =
    await getClassificationEwc(
      ewcCode,
    );

  if (!ewc) {
    redirectMaterialError(
      materialId,
      "invalid_ewc",
    );
  }

  const dr =
    await getDisposalRecoveryCode(
      drCode,
    );

  if (!dr) {
    redirectMaterialError(
      materialId,
      "invalid_dr_code",
    );
  }

  const containsHazardous =
    ewc.isHazardous === true;

  if (
    containsPops &&
    (
      popsSource === "GUIDANCE" ||
      popsSource === "OWN_TESTING"
    ) &&
    !popsComponents
  ) {
    redirectMaterialError(
      materialId,
      "pops_components_required",
    );
  }

  if (
    containsHazardous &&
    (
      hazardousSource ===
        "GUIDANCE" ||
      hazardousSource ===
        "OWN_TESTING"
    ) &&
    !hazardousComponents
  ) {
    redirectMaterialError(
      materialId,
      "hazardous_components_required",
    );
  }

  const duplicate =
    await database.query.materialProfiles.findFirst({
      where: and(
        eq(
          materialProfiles.organisationId,
          context.organisationId,
        ),
        eq(
          materialProfiles.name,
          name,
        ),
        ne(
          materialProfiles.id,
          materialId,
        ),
      ),

      columns: {
        id: true,
      },
    });

  if (duplicate) {
    redirectMaterialError(
      materialId,
      "duplicate_name",
    );
  }

  /* =======================================================
     UPDATE
  ======================================================= */

  await database
    .update(materialProfiles)
    .set({
      name,

      ewcCodeId:
        ewc.id,

      wasteDescription,

      physicalForm:
        form,

      defaultNumberOfContainers:
        containers,

      defaultContainerType:
        containerType,

      containsPops,

      popsSourceOfComponents:
        containsPops
          ? popsSource
          : null,

      popsComponents:
        containsPops &&
        popsSource !==
          "NOT_PROVIDED"
          ? popsComponents
          : null,

      containsHazardous,

      hazardousSourceOfComponents:
        containsHazardous
          ? hazardousSource
          : null,

      hazardousHazCodes:
        containsHazardous
          ? hazardousHazCodes
          : null,

      hazardousComponents:
        containsHazardous &&
        hazardousSource !==
          "NOT_PROVIDED"
          ? hazardousComponents
          : null,

      defaultDisposalRecoveryCodeId:
        dr.id,

      defaultWeightMetric:
        metric,

      isFavourite:
        favourite,

      notes,

      updatedAt:
        new Date(),
    })
    .where(
      and(
        eq(
          materialProfiles.id,
          materialId,
        ),
        eq(
          materialProfiles.organisationId,
          context.organisationId,
        ),
      ),
    );

  revalidatePath(
    "/home/materials",
  );

  revalidatePath(
    `/home/materials/${materialId}`,
  );

  revalidatePath(
    `/home/materials/${materialId}/edit`,
  );

  redirect(
    `/home/materials/${materialId}?success=updated`,
  );
}

/* =========================================================
   ARCHIVE
========================================================= */

export async function archiveMaterialProfileAction(
  formData: FormData,
) {
  const context =
    await requireMasterDataEditor();

  const materialId =
    cleanString(
      formData.get(
        "materialId",
      ),
    );

  if (!materialId) {
    redirect(
      "/home/materials?error=missing_material",
    );
  }

  await database
    .update(materialProfiles)
    .set({
      isActive: false,
      isFavourite: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(
          materialProfiles.id,
          materialId,
        ),
        eq(
          materialProfiles.organisationId,
          context.organisationId,
        ),
      ),
    );

  revalidatePath(
    "/home/materials",
  );

  revalidatePath(
    `/home/materials/${materialId}`,
  );

  redirect(
    `/home/materials/${materialId}?success=archived`,
  );
}

/* =========================================================
   RESTORE
========================================================= */

export async function restoreMaterialProfileAction(
  formData: FormData,
) {
  const context =
    await requireMasterDataEditor();

  const materialId =
    cleanString(
      formData.get(
        "materialId",
      ),
    );

  if (!materialId) {
    redirect(
      "/home/materials?error=missing_material",
    );
  }

  await database
    .update(materialProfiles)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(
          materialProfiles.id,
          materialId,
        ),
        eq(
          materialProfiles.organisationId,
          context.organisationId,
        ),
      ),
    );

  revalidatePath(
    "/home/materials",
  );

  revalidatePath(
    `/home/materials/${materialId}`,
  );

  redirect(
    `/home/materials/${materialId}?success=restored`,
  );
}
