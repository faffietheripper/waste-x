// src/app/home/rates/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  counterpartySites,
  materialProfiles,
  rates,
  sites,
  users,
} from "@/db/schema";

type RateType =
  | "customer_charge"
  | "haulage_cost"
  | "tipping_cost"
  | "material_sale"
  | "other";

type RateUnit = "tonne" | "load" | "job";

type EditorContext = {
  userId: string;
  organisationId: string;
};

const RATE_TYPES: RateType[] = [
  "customer_charge",
  "haulage_cost",
  "tipping_cost",
  "material_sale",
  "other",
];

const RATE_UNITS: RateUnit[] = ["tonne", "load", "job"];

async function requireRateEditor(): Promise<EditorContext> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
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

  const canEdit =
    currentUser.role === "administrator" ||
    currentUser.role === "accounts" ||
    currentUser.role === "seniorManagement";

  if (!canEdit) {
    redirect("/home/rates?error=unauthorised");
  }

  return {
    userId: currentUser.id,
    organisationId: currentUser.organisationId,
  };
}

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);
  return cleaned ? cleaned : null;
}

function asRateType(value: FormDataEntryValue | null): RateType | null {
  const cleaned = cleanString(value) as RateType;
  return RATE_TYPES.includes(cleaned) ? cleaned : null;
}

function asRateUnit(value: FormDataEntryValue | null): RateUnit | null {
  const cleaned = cleanString(value) as RateUnit;
  return RATE_UNITS.includes(cleaned) ? cleaned : null;
}

function parseMoney(value: FormDataEntryValue | null): string | null {
  const cleaned = cleanString(value).replace(/,/g, "");

  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed.toFixed(2);
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const cleaned = cleanString(value);

  if (!cleaned) {
    return null;
  }

  const parsed = new Date(`${cleaned}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function newError(error: string): never {
  redirect(`/home/rates/new?error=${encodeURIComponent(error)}`);
}

function editError(rateId: string, error: string): never {
  redirect(
    `/home/rates/${rateId}/edit?error=${encodeURIComponent(error)}`,
  );
}

function detailSuccess(rateId: string, success: string): never {
  redirect(`/home/rates/${rateId}?success=${encodeURIComponent(success)}`);
}

function detailError(rateId: string, error: string): never {
  redirect(`/home/rates/${rateId}?error=${encodeURIComponent(error)}`);
}

async function hasCounterpartyRole(
  organisationId: string,
  counterpartyId: string,
  role: "client" | "haulier" | "third_party_tip",
) {
  const row = await database.query.counterpartyRoles.findFirst({
    where: and(
      eq(counterpartyRoles.organisationId, organisationId),
      eq(counterpartyRoles.counterpartyId, counterpartyId),
      eq(counterpartyRoles.role, role),
    ),
    columns: { counterpartyId: true },
  });

  return Boolean(row);
}

async function validateOwnSite(organisationId: string, ownSiteId: string | null) {
  if (!ownSiteId) {
    return null;
  }

  return (
    (await database.query.sites.findFirst({
      where: and(
        eq(sites.id, ownSiteId),
        eq(sites.organisationId, organisationId),
      ),
      columns: { id: true },
    })) ?? null
  );
}

async function validateMaterial(
  organisationId: string,
  materialProfileId: string | null,
) {
  if (!materialProfileId) {
    return null;
  }

  return (
    (await database.query.materialProfiles.findFirst({
      where: and(
        eq(materialProfiles.id, materialProfileId),
        eq(materialProfiles.organisationId, organisationId),
      ),
      columns: { id: true },
    })) ?? null
  );
}

async function resolveScope({
  organisationId,
  rateType,
  submittedCounterpartyId,
  submittedCounterpartySiteId,
  ownSiteId,
  materialProfileId,
}: {
  organisationId: string;
  rateType: RateType;
  submittedCounterpartyId: string | null;
  submittedCounterpartySiteId: string | null;
  ownSiteId: string | null;
  materialProfileId: string | null;
}) {
  let counterpartyId = submittedCounterpartyId;
  let counterpartySiteId = submittedCounterpartySiteId;

  if (rateType === "customer_charge") {
    if (!counterpartyId) {
      return { error: "client_required" } as const;
    }

    if (!(await hasCounterpartyRole(organisationId, counterpartyId, "client"))) {
      return { error: "invalid_client" } as const;
    }

    if (counterpartySiteId) {
      const site = await database.query.counterpartySites.findFirst({
        where: and(
          eq(counterpartySites.id, counterpartySiteId),
          eq(counterpartySites.organisationId, organisationId),
          eq(counterpartySites.counterpartyId, counterpartyId),
        ),
        columns: { id: true },
      });

      if (!site) {
        return { error: "invalid_client_site" } as const;
      }
    }
  }

  if (rateType === "haulage_cost") {
    counterpartySiteId = null;

    if (!counterpartyId) {
      return { error: "haulier_required" } as const;
    }

    if (!(await hasCounterpartyRole(organisationId, counterpartyId, "haulier"))) {
      return { error: "invalid_haulier" } as const;
    }
  }

  if (rateType === "tipping_cost") {
    if (!counterpartySiteId) {
      return { error: "external_facility_required" } as const;
    }

    const facility = await database.query.counterpartySites.findFirst({
      where: and(
        eq(counterpartySites.id, counterpartySiteId),
        eq(counterpartySites.organisationId, organisationId),
        eq(counterpartySites.siteType, "third_party_tip"),
      ),
      columns: {
        id: true,
        counterpartyId: true,
      },
    });

    if (!facility) {
      return { error: "invalid_external_facility" } as const;
    }

    counterpartyId = facility.counterpartyId;

    if (!(await hasCounterpartyRole(organisationId, counterpartyId, "third_party_tip"))) {
      return { error: "invalid_external_operator" } as const;
    }
  }

  if (rateType === "material_sale" && !materialProfileId) {
    return { error: "material_required" } as const;
  }

  if (rateType === "material_sale" || rateType === "other") {
    counterpartySiteId = null;

    if (counterpartyId) {
      const party = await database.query.counterparties.findFirst({
        where: and(
          eq(counterparties.id, counterpartyId),
          eq(counterparties.organisationId, organisationId),
        ),
        columns: { id: true },
      });

      if (!party) {
        return { error: "invalid_counterparty" } as const;
      }
    }
  }

  if (ownSiteId && !(await validateOwnSite(organisationId, ownSiteId))) {
    return { error: "invalid_own_site" } as const;
  }

  if (
    materialProfileId &&
    !(await validateMaterial(organisationId, materialProfileId))
  ) {
    return { error: "invalid_material" } as const;
  }

  return {
    error: null,
    counterpartyId,
    counterpartySiteId,
    ownSiteId,
    materialProfileId,
  } as const;
}

function sameNullable(a: string | null, b: string | null) {
  return a === b;
}

function rangesOverlap(
  startA: Date | null,
  endA: Date | null,
  startB: Date | null,
  endB: Date | null,
) {
  const aStart = startA?.getTime() ?? Number.NEGATIVE_INFINITY;
  const aEnd = endA?.getTime() ?? Number.POSITIVE_INFINITY;
  const bStart = startB?.getTime() ?? Number.NEGATIVE_INFINITY;
  const bEnd = endB?.getTime() ?? Number.POSITIVE_INFINITY;

  return aStart <= bEnd && bStart <= aEnd;
}

async function hasConflictingRate({
  organisationId,
  excludeRateId,
  rateType,
  unit,
  counterpartyId,
  counterpartySiteId,
  ownSiteId,
  materialProfileId,
  effectiveFrom,
  effectiveTo,
}: {
  organisationId: string;
  excludeRateId?: string;
  rateType: RateType;
  unit: RateUnit;
  counterpartyId: string | null;
  counterpartySiteId: string | null;
  ownSiteId: string | null;
  materialProfileId: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}) {
  const candidates = await database
    .select({
      id: rates.id,
      counterpartyId: rates.counterpartyId,
      counterpartySiteId: rates.counterpartySiteId,
      ownSiteId: rates.ownSiteId,
      materialProfileId: rates.materialProfileId,
      effectiveFrom: rates.effectiveFrom,
      effectiveTo: rates.effectiveTo,
    })
    .from(rates)
    .where(
      and(
        eq(rates.organisationId, organisationId),
        eq(rates.rateType, rateType),
        eq(rates.unit, unit),
        eq(rates.isActive, true),
      ),
    );

  return candidates.some((candidate) => {
    if (excludeRateId && candidate.id === excludeRateId) {
      return false;
    }

    const sameScope =
      sameNullable(candidate.counterpartyId, counterpartyId) &&
      sameNullable(candidate.counterpartySiteId, counterpartySiteId) &&
      sameNullable(candidate.ownSiteId, ownSiteId) &&
      sameNullable(candidate.materialProfileId, materialProfileId);

    if (!sameScope) {
      return false;
    }

    return rangesOverlap(
      candidate.effectiveFrom,
      candidate.effectiveTo,
      effectiveFrom,
      effectiveTo,
    );
  });
}

function parseRateForm(formData: FormData) {
  return {
    rateType: asRateType(formData.get("rateType")),
    unit: asRateUnit(formData.get("unit")),
    amount: parseMoney(formData.get("amount")),
    counterpartyId: optionalString(formData.get("counterpartyId")),
    counterpartySiteId: optionalString(formData.get("counterpartySiteId")),
    ownSiteId: optionalString(formData.get("ownSiteId")),
    materialProfileId: optionalString(formData.get("materialProfileId")),
    effectiveFrom: parseDate(formData.get("effectiveFrom")),
    effectiveTo: parseDate(formData.get("effectiveTo")),
    rawEffectiveFrom: cleanString(formData.get("effectiveFrom")),
    rawEffectiveTo: cleanString(formData.get("effectiveTo")),
    notes: optionalString(formData.get("notes")),
  };
}

export async function createRateAction(formData: FormData) {
  const context = await requireRateEditor();
  const values = parseRateForm(formData);

  if (!values.rateType) {
    newError("invalid_rate_type");
  }

  if (!values.unit) {
    newError("invalid_unit");
  }

  if (values.amount === null) {
    newError("invalid_amount");
  }

  if (values.rawEffectiveFrom && !values.effectiveFrom) {
    newError("invalid_start_date");
  }

  if (values.rawEffectiveTo && !values.effectiveTo) {
    newError("invalid_end_date");
  }

  if (
    values.effectiveFrom &&
    values.effectiveTo &&
    values.effectiveTo < values.effectiveFrom
  ) {
    newError("end_before_start");
  }

  const scope = await resolveScope({
    organisationId: context.organisationId,
    rateType: values.rateType,
    submittedCounterpartyId: values.counterpartyId,
    submittedCounterpartySiteId: values.counterpartySiteId,
    ownSiteId: values.ownSiteId,
    materialProfileId: values.materialProfileId,
  });

  if (scope.error) {
    newError(scope.error);
  }

  const conflict = await hasConflictingRate({
    organisationId: context.organisationId,
    rateType: values.rateType,
    unit: values.unit,
    counterpartyId: scope.counterpartyId,
    counterpartySiteId: scope.counterpartySiteId,
    ownSiteId: scope.ownSiteId,
    materialProfileId: scope.materialProfileId,
    effectiveFrom: values.effectiveFrom,
    effectiveTo: values.effectiveTo,
  });

  if (conflict) {
    newError("overlapping_rate");
  }

  const [created] = await database
    .insert(rates)
    .values({
      organisationId: context.organisationId,
      rateType: values.rateType,
      unit: values.unit,
      amount: values.amount,
      currency: "GBP",
      counterpartyId: scope.counterpartyId,
      counterpartySiteId: scope.counterpartySiteId,
      ownSiteId: scope.ownSiteId,
      materialProfileId: scope.materialProfileId,
      effectiveFrom: values.effectiveFrom,
      effectiveTo: values.effectiveTo,
      isActive: true,
      notes: values.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: rates.id });

  if (!created) {
    newError("create_failed");
  }

  revalidatePath("/home/rates");
  detailSuccess(created.id, "created");
}

export async function updateRateAction(formData: FormData) {
  const context = await requireRateEditor();
  const rateId = cleanString(formData.get("rateId"));

  if (!rateId) {
    redirect("/home/rates?error=missing_rate");
  }

  const existing = await database.query.rates.findFirst({
    where: and(
      eq(rates.id, rateId),
      eq(rates.organisationId, context.organisationId),
    ),
  });

  if (!existing) {
    redirect("/home/rates?error=rate_not_found");
  }

  const values = parseRateForm(formData);

  if (!values.rateType) {
    editError(rateId, "invalid_rate_type");
  }

  if (!values.unit) {
    editError(rateId, "invalid_unit");
  }

  if (values.amount === null) {
    editError(rateId, "invalid_amount");
  }

  if (values.rawEffectiveFrom && !values.effectiveFrom) {
    editError(rateId, "invalid_start_date");
  }

  if (values.rawEffectiveTo && !values.effectiveTo) {
    editError(rateId, "invalid_end_date");
  }

  if (
    values.effectiveFrom &&
    values.effectiveTo &&
    values.effectiveTo < values.effectiveFrom
  ) {
    editError(rateId, "end_before_start");
  }

  const scope = await resolveScope({
    organisationId: context.organisationId,
    rateType: values.rateType,
    submittedCounterpartyId: values.counterpartyId,
    submittedCounterpartySiteId: values.counterpartySiteId,
    ownSiteId: values.ownSiteId,
    materialProfileId: values.materialProfileId,
  });

  if (scope.error) {
    editError(rateId, scope.error);
  }

  const conflict = await hasConflictingRate({
    organisationId: context.organisationId,
    excludeRateId: rateId,
    rateType: values.rateType,
    unit: values.unit,
    counterpartyId: scope.counterpartyId,
    counterpartySiteId: scope.counterpartySiteId,
    ownSiteId: scope.ownSiteId,
    materialProfileId: scope.materialProfileId,
    effectiveFrom: values.effectiveFrom,
    effectiveTo: values.effectiveTo,
  });

  if (conflict) {
    editError(rateId, "overlapping_rate");
  }

  await database
    .update(rates)
    .set({
      rateType: values.rateType,
      unit: values.unit,
      amount: values.amount,
      currency: "GBP",
      counterpartyId: scope.counterpartyId,
      counterpartySiteId: scope.counterpartySiteId,
      ownSiteId: scope.ownSiteId,
      materialProfileId: scope.materialProfileId,
      effectiveFrom: values.effectiveFrom,
      effectiveTo: values.effectiveTo,
      notes: values.notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rates.id, rateId),
        eq(rates.organisationId, context.organisationId),
      ),
    );

  revalidatePath("/home/rates");
  revalidatePath(`/home/rates/${rateId}`);
  revalidatePath(`/home/rates/${rateId}/edit`);
  detailSuccess(rateId, "updated");
}

export async function archiveRateAction(formData: FormData) {
  const context = await requireRateEditor();
  const rateId = cleanString(formData.get("rateId"));

  if (!rateId) {
    redirect("/home/rates?error=missing_rate");
  }

  await database
    .update(rates)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rates.id, rateId),
        eq(rates.organisationId, context.organisationId),
      ),
    );

  revalidatePath("/home/rates");
  revalidatePath(`/home/rates/${rateId}`);
  detailSuccess(rateId, "archived");
}

export async function restoreRateAction(formData: FormData) {
  const context = await requireRateEditor();
  const rateId = cleanString(formData.get("rateId"));

  if (!rateId) {
    redirect("/home/rates?error=missing_rate");
  }

  const existing = await database.query.rates.findFirst({
    where: and(
      eq(rates.id, rateId),
      eq(rates.organisationId, context.organisationId),
    ),
  });

  if (!existing) {
    redirect("/home/rates?error=rate_not_found");
  }

  const conflict = await hasConflictingRate({
    organisationId: context.organisationId,
    excludeRateId: rateId,
    rateType: existing.rateType,
    unit: existing.unit,
    counterpartyId: existing.counterpartyId,
    counterpartySiteId: existing.counterpartySiteId,
    ownSiteId: existing.ownSiteId,
    materialProfileId: existing.materialProfileId,
    effectiveFrom: existing.effectiveFrom,
    effectiveTo: existing.effectiveTo,
  });

  if (conflict) {
    detailError(rateId, "conflict_active_rate");
  }

  await database
    .update(rates)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rates.id, rateId),
        eq(rates.organisationId, context.organisationId),
      ),
    );

  revalidatePath("/home/rates");
  revalidatePath(`/home/rates/${rateId}`);
  detailSuccess(rateId, "restored");
}
