"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  counterpartySites,
  drivers,
  ewcCodes,
  materialProfiles,
  permitEwcCodes,
  sitePermits,
  sites,
  users,
  vehicles,
} from "@/db/schema";

import type {
  BookJobClient,
  BookJobClientSite,
  BookJobDriver,
  BookJobHaulier,
  BookJobMaterial,
  BookJobVehicle,
  QuickCreateResult,
} from "./lib/types";

type QuickCreateContext = {
  userId: string;
  organisationId: string;
};

async function requireQuickCreateAccess(): Promise<
  QuickCreateResult<QuickCreateContext>
> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ok: false, error: "Your session has expired. Sign in again." };
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
    return { ok: false, error: "Your organisation account is not available." };
  }

  const canCreate =
    currentUser.role === "administrator" ||
    currentUser.role === "operations" ||
    currentUser.role === "seniorManagement" ||
    currentUser.role === "employee";

  if (!canCreate) {
    return { ok: false, error: "You do not have permission to create operational data." };
  }

  return {
    ok: true,
    data: {
      userId: currentUser.id,
      organisationId: currentUser.organisationId,
    },
  };
}

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function normalisePostcode(value: FormDataEntryValue | null) {
  const cleaned = optionalString(value);
  return cleaned ? cleaned.toUpperCase() : null;
}

function normaliseCarrierNumber(value: FormDataEntryValue | null) {
  const cleaned = optionalString(value);
  return cleaned ? cleaned.toUpperCase().replace(/\s+/g, "") : null;
}

function normaliseRegistration(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);
  return cleaned ? cleaned.toUpperCase().replace(/\s+/g, " ") : "";
}

function parsePositiveInt(
  value: FormDataEntryValue | null,
  fallback: number,
  min: number,
  max: number,
) {
  const cleaned = cleanString(value);
  if (!cleaned) return fallback;

  const parsed = Number(cleaned);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

async function activeCounterpartyRole(
  organisationId: string,
  counterpartyId: string,
  role: "client" | "haulier",
) {
  const rows = await database
    .select({ id: counterparties.id })
    .from(counterparties)
    .innerJoin(
      counterpartyRoles,
      and(
        eq(counterpartyRoles.counterpartyId, counterparties.id),
        eq(counterpartyRoles.organisationId, organisationId),
        eq(counterpartyRoles.role, role),
      ),
    )
    .where(
      and(
        eq(counterparties.id, counterpartyId),
        eq(counterparties.organisationId, organisationId),
        eq(counterparties.isActive, true),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

function refreshQuickCreatePaths() {
  revalidatePath("/home/jobs/new");
  revalidatePath("/home/settings/data-readiness");
}

export async function quickCreateClientAction(
  formData: FormData,
): Promise<
  QuickCreateResult<{
    client: BookJobClient;
    site: BookJobClientSite | null;
  }>
> {
  const contextResult = await requireQuickCreateAccess();
  if (!contextResult.ok) return contextResult;

  const { organisationId } = contextResult.data;

  const name = cleanString(formData.get("name"));
  const accountReference = optionalString(formData.get("accountReference"));
  const email = optionalString(formData.get("email"));
  const telephone = optionalString(formData.get("telephone"));

  const siteName = cleanString(formData.get("siteName"));
  const siteAddress = optionalString(formData.get("siteAddress"));
  const sitePostcode = normalisePostcode(formData.get("sitePostcode"));

  if (!name) {
    return { ok: false, error: "Client name is required." };
  }

  if ((siteAddress || sitePostcode) && !siteName) {
    return {
      ok: false,
      error: "Add a site/project name when entering an origin address.",
    };
  }

  const sameName = await database.query.counterparties.findFirst({
    where: and(
      eq(counterparties.organisationId, organisationId),
      eq(counterparties.name, name),
    ),
  });

  if (sameName) {
    const role = await database.query.counterpartyRoles.findFirst({
      where: and(
        eq(counterpartyRoles.organisationId, organisationId),
        eq(counterpartyRoles.counterpartyId, sameName.id),
        eq(counterpartyRoles.role, "client"),
      ),
      columns: { role: true },
    });

    if (role) {
      return {
        ok: false,
        error: "That client already exists. Close this window and select it from the list.",
      };
    }
  }

  const reusedBusinessExistingSite =
    sameName && siteName
      ? await database.query.counterpartySites.findFirst({
          where: and(
            eq(counterpartySites.organisationId, organisationId),
            eq(counterpartySites.counterpartyId, sameName.id),
            eq(counterpartySites.isActive, true),
          ),
          columns: { id: true },
        })
      : null;

  if (sameName && siteName) {
    const duplicateSite = await database.query.counterpartySites.findFirst({
      where: and(
        eq(counterpartySites.organisationId, organisationId),
        eq(counterpartySites.counterpartyId, sameName.id),
        eq(counterpartySites.name, siteName),
      ),
      columns: { id: true },
    });

    if (duplicateSite) {
      return {
        ok: false,
        error: "That business already has a site with this name. Add the client role first, then select the existing site from the client record.",
      };
    }
  }

  const created = await database.transaction(async (tx) => {
    let clientId: string;

    if (sameName) {
      clientId = sameName.id;

      await tx
        .update(counterparties)
        .set({
          accountReference: accountReference ?? sameName.accountReference,
          email: email ?? sameName.email,
          telephone: telephone ?? sameName.telephone,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(counterparties.id, sameName.id),
            eq(counterparties.organisationId, organisationId),
          ),
        );

      await tx.insert(counterpartyRoles).values({
        organisationId,
        counterpartyId: clientId,
        role: "client",
        createdAt: new Date(),
      });
    } else {
      const [row] = await tx
        .insert(counterparties)
        .values({
          organisationId,
          name,
          accountReference,
          email,
          telephone,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: counterparties.id });

      if (!row) throw new Error("QUICK_CLIENT_CREATE_FAILED");
      clientId = row.id;

      await tx.insert(counterpartyRoles).values({
        organisationId,
        counterpartyId: clientId,
        role: "client",
        createdAt: new Date(),
      });
    }

    let site: BookJobClientSite | null = null;

    if (siteName) {
      const [siteRow] = await tx
        .insert(counterpartySites)
        .values({
          organisationId,
          counterpartyId: clientId,
          name: siteName,
          siteType: "producer_site",
          fullAddress: siteAddress,
          postcode: sitePostcode,
          isDefault: !reusedBusinessExistingSite,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({
          id: counterpartySites.id,
          counterpartyId: counterpartySites.counterpartyId,
          name: counterpartySites.name,
          fullAddress: counterpartySites.fullAddress,
          postcode: counterpartySites.postcode,
          isDefault: counterpartySites.isDefault,
        });

      if (!siteRow) throw new Error("QUICK_CLIENT_SITE_CREATE_FAILED");
      site = siteRow;
    }

    return {
      client: {
        id: clientId,
        name,
        accountReference,
      },
      site,
    };
  });

  revalidatePath("/home/clients");
  refreshQuickCreatePaths();

  return { ok: true, data: created };
}

export async function quickCreateClientSiteAction(
  formData: FormData,
): Promise<QuickCreateResult<BookJobClientSite>> {
  const contextResult = await requireQuickCreateAccess();
  if (!contextResult.ok) return contextResult;

  const { organisationId } = contextResult.data;

  const clientId = cleanString(formData.get("clientId"));
  const name = cleanString(formData.get("name"));
  const fullAddress = optionalString(formData.get("fullAddress"));
  const postcode = normalisePostcode(formData.get("postcode"));
  const contactName = optionalString(formData.get("contactName"));
  const contactEmail = optionalString(formData.get("contactEmail"));
  const contactTelephone = optionalString(formData.get("contactTelephone"));

  if (!clientId) return { ok: false, error: "Choose a client first." };
  if (!name) return { ok: false, error: "Site / project name is required." };

  const client = await activeCounterpartyRole(organisationId, clientId, "client");
  if (!client) return { ok: false, error: "That client is no longer available." };

  const duplicate = await database.query.counterpartySites.findFirst({
    where: and(
      eq(counterpartySites.organisationId, organisationId),
      eq(counterpartySites.counterpartyId, clientId),
      eq(counterpartySites.name, name),
    ),
    columns: { id: true },
  });

  if (duplicate) {
    return { ok: false, error: "That client already has a site with this name." };
  }

  const existingSite = await database.query.counterpartySites.findFirst({
    where: and(
      eq(counterpartySites.organisationId, organisationId),
      eq(counterpartySites.counterpartyId, clientId),
      eq(counterpartySites.isActive, true),
    ),
    columns: { id: true },
  });

  const [created] = await database
    .insert(counterpartySites)
    .values({
      organisationId,
      counterpartyId: clientId,
      name,
      siteType: "producer_site",
      fullAddress,
      postcode,
      contactName,
      contactEmail,
      contactTelephone,
      isDefault: !existingSite,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({
      id: counterpartySites.id,
      counterpartyId: counterpartySites.counterpartyId,
      name: counterpartySites.name,
      fullAddress: counterpartySites.fullAddress,
      postcode: counterpartySites.postcode,
      isDefault: counterpartySites.isDefault,
    });

  if (!created) return { ok: false, error: "The client site could not be created." };

  revalidatePath(`/home/clients/${clientId}`);
  revalidatePath("/home/clients");
  refreshQuickCreatePaths();

  return { ok: true, data: created };
}

export async function quickCreateHaulierAction(
  formData: FormData,
): Promise<QuickCreateResult<BookJobHaulier>> {
  const contextResult = await requireQuickCreateAccess();
  if (!contextResult.ok) return contextResult;

  const { organisationId } = contextResult.data;

  const name = cleanString(formData.get("name"));
  const carrierRegistrationNumber = normaliseCarrierNumber(
    formData.get("carrierRegistrationNumber"),
  );
  const email = optionalString(formData.get("email"));
  const telephone = optionalString(formData.get("telephone"));

  if (!name) return { ok: false, error: "Haulier name is required." };

  const sameName = await database.query.counterparties.findFirst({
    where: and(
      eq(counterparties.organisationId, organisationId),
      eq(counterparties.name, name),
    ),
  });

  if (sameName) {
    const role = await database.query.counterpartyRoles.findFirst({
      where: and(
        eq(counterpartyRoles.organisationId, organisationId),
        eq(counterpartyRoles.counterpartyId, sameName.id),
        eq(counterpartyRoles.role, "haulier"),
      ),
      columns: { role: true },
    });

    if (role) {
      return {
        ok: false,
        error: "That haulier already exists. Close this window and select it from the list.",
      };
    }

    await database.transaction(async (tx) => {
      await tx
        .update(counterparties)
        .set({
          carrierRegistrationNumber:
            carrierRegistrationNumber ?? sameName.carrierRegistrationNumber,
          email: email ?? sameName.email,
          telephone: telephone ?? sameName.telephone,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(counterparties.id, sameName.id),
            eq(counterparties.organisationId, organisationId),
          ),
        );

      await tx.insert(counterpartyRoles).values({
        organisationId,
        counterpartyId: sameName.id,
        role: "haulier",
        createdAt: new Date(),
      });
    });

    const result: BookJobHaulier = {
      id: sameName.id,
      name,
      carrierRegistrationNumber:
        carrierRegistrationNumber ?? sameName.carrierRegistrationNumber,
    };

    revalidatePath("/home/hauliers");
    refreshQuickCreatePaths();
    return { ok: true, data: result };
  }

  const created = await database.transaction(async (tx) => {
    const [row] = await tx
      .insert(counterparties)
      .values({
        organisationId,
        name,
        carrierRegistrationNumber,
        email,
        telephone,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({
        id: counterparties.id,
        name: counterparties.name,
        carrierRegistrationNumber: counterparties.carrierRegistrationNumber,
      });

    if (!row) throw new Error("QUICK_HAULIER_CREATE_FAILED");

    await tx.insert(counterpartyRoles).values({
      organisationId,
      counterpartyId: row.id,
      role: "haulier",
      createdAt: new Date(),
    });

    return row;
  });

  revalidatePath("/home/hauliers");
  refreshQuickCreatePaths();

  return { ok: true, data: created };
}

export async function quickCreateDriverAction(
  formData: FormData,
): Promise<QuickCreateResult<BookJobDriver>> {
  const contextResult = await requireQuickCreateAccess();
  if (!contextResult.ok) return contextResult;

  const { organisationId } = contextResult.data;

  const name = cleanString(formData.get("name"));
  const telephone = optionalString(formData.get("telephone"));
  const email = optionalString(formData.get("email"));
  const ownerMode = cleanString(formData.get("ownerMode"));
  const requestedHaulierId = optionalString(formData.get("haulierCounterpartyId"));

  if (!name) return { ok: false, error: "Driver name is required." };
  if (ownerMode !== "own" && ownerMode !== "external") {
    return { ok: false, error: "Choose a valid transport arrangement." };
  }

  const haulierId = ownerMode === "external" ? requestedHaulierId : null;

  if (ownerMode === "external" && !haulierId) {
    return { ok: false, error: "Choose the external haulier before adding its driver." };
  }

  if (haulierId) {
    const haulier = await activeCounterpartyRole(organisationId, haulierId, "haulier");
    if (!haulier) return { ok: false, error: "That haulier is no longer available." };
  }

  const [created] = await database
    .insert(drivers)
    .values({
      organisationId,
      haulierCounterpartyId: haulierId,
      name,
      telephone,
      email,
      defaultVehicleId: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({
      id: drivers.id,
      name: drivers.name,
      haulierCounterpartyId: drivers.haulierCounterpartyId,
      defaultVehicleId: drivers.defaultVehicleId,
    });

  if (!created) return { ok: false, error: "The driver could not be created." };

  revalidatePath("/home/transport");
  if (haulierId) revalidatePath(`/home/hauliers/${haulierId}`);
  refreshQuickCreatePaths();

  return { ok: true, data: created };
}

export async function quickCreateVehicleAction(
  formData: FormData,
): Promise<QuickCreateResult<BookJobVehicle>> {
  const contextResult = await requireQuickCreateAccess();
  if (!contextResult.ok) return contextResult;

  const { organisationId } = contextResult.data;

  const registrationNumber = normaliseRegistration(formData.get("registrationNumber"));
  const vehicleType = optionalString(formData.get("vehicleType"));
  const ownerMode = cleanString(formData.get("ownerMode"));
  const requestedHaulierId = optionalString(formData.get("haulierCounterpartyId"));

  if (!registrationNumber) {
    return { ok: false, error: "Vehicle registration is required." };
  }
  if (ownerMode !== "own" && ownerMode !== "external") {
    return { ok: false, error: "Choose a valid transport arrangement." };
  }

  const haulierId = ownerMode === "external" ? requestedHaulierId : null;

  if (ownerMode === "external" && !haulierId) {
    return { ok: false, error: "Choose the external haulier before adding its vehicle." };
  }

  if (haulierId) {
    const haulier = await activeCounterpartyRole(organisationId, haulierId, "haulier");
    if (!haulier) return { ok: false, error: "That haulier is no longer available." };
  }

  const duplicate = await database.query.vehicles.findFirst({
    where: and(
      eq(vehicles.organisationId, organisationId),
      eq(vehicles.registrationNumber, registrationNumber),
    ),
    columns: { id: true },
  });

  if (duplicate) {
    return { ok: false, error: "That vehicle registration is already saved." };
  }

  const [created] = await database
    .insert(vehicles)
    .values({
      organisationId,
      haulierCounterpartyId: haulierId,
      registrationNumber,
      vehicleType,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({
      id: vehicles.id,
      registrationNumber: vehicles.registrationNumber,
      vehicleType: vehicles.vehicleType,
      haulierCounterpartyId: vehicles.haulierCounterpartyId,
    });

  if (!created) return { ok: false, error: "The vehicle could not be created." };

  revalidatePath("/home/transport");
  if (haulierId) revalidatePath(`/home/hauliers/${haulierId}`);
  refreshQuickCreatePaths();

  return { ok: true, data: created };
}

export async function quickCreateMaterialAction(
  formData: FormData,
): Promise<QuickCreateResult<BookJobMaterial>> {
  const contextResult = await requireQuickCreateAccess();
  if (!contextResult.ok) return contextResult;

  const { userId, organisationId } = contextResult.data;

  const name = cleanString(formData.get("name"));
  const ewcCodeId = cleanString(formData.get("ewcCodeId"));
  const wasteDescription = cleanString(formData.get("wasteDescription"));
  const physicalForm = cleanString(formData.get("physicalForm"));
  const defaultNumberOfContainers = parsePositiveInt(
    formData.get("defaultNumberOfContainers"),
    1,
    1,
    10000,
  );
  const defaultContainerType = cleanString(formData.get("defaultContainerType"));
  const defaultWeightMetric = cleanString(formData.get("defaultWeightMetric"));
  const containsHazardous = formData.get("containsHazardous") === "on";
  const containsPops = formData.get("containsPops") === "on";

  if (!name) return { ok: false, error: "Material profile name is required." };
  if (!ewcCodeId) return { ok: false, error: "Choose an EWC code." };
  if (!wasteDescription) return { ok: false, error: "Waste description is required." };
  if (!defaultNumberOfContainers) {
    return { ok: false, error: "Enter a valid default number of containers." };
  }
  if (!defaultContainerType) {
    return { ok: false, error: "Default container type is required." };
  }

  const allowedPhysicalForms = ["Gas", "Liquid", "Solid", "Powder", "Sludge", "Mixed"];
  if (!allowedPhysicalForms.includes(physicalForm)) {
    return { ok: false, error: "Choose a valid physical form." };
  }

  const allowedWeightMetrics = ["Grams", "Kilograms", "Tonnes"];
  if (!allowedWeightMetrics.includes(defaultWeightMetric)) {
    return { ok: false, error: "Choose a valid default weight unit." };
  }

  const duplicate = await database.query.materialProfiles.findFirst({
    where: and(
      eq(materialProfiles.organisationId, organisationId),
      eq(materialProfiles.name, name),
    ),
    columns: { id: true },
  });

  if (duplicate) {
    return { ok: false, error: "A material profile with this name already exists." };
  }

  const receivingSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.organisationId, organisationId),
      eq(sites.status, "active"),
      eq(sites.siteType, "waste_receiving_site"),
      eq(sites.isDefault, true),
    ),
    columns: { id: true },
  });

  if (!receivingSite) {
    return { ok: false, error: "No active receiving site is configured." };
  }

  const primaryPermit = await database.query.sitePermits.findFirst({
    where: and(
      eq(sitePermits.organisationId, organisationId),
      eq(sitePermits.siteId, receivingSite.id),
      eq(sitePermits.isPrimary, true),
      eq(sitePermits.status, "active"),
    ),
    columns: { id: true },
  });

  if (!primaryPermit) {
    return { ok: false, error: "No active receiving permit is configured." };
  }

  const [ewc] = await database
    .select({
      id: ewcCodes.id,
      code: ewcCodes.code,
    })
    .from(ewcCodes)
    .innerJoin(
      permitEwcCodes,
      and(
        eq(permitEwcCodes.ewcCodeId, ewcCodes.id),
        eq(permitEwcCodes.organisationId, organisationId),
        eq(permitEwcCodes.permitId, primaryPermit.id),
        eq(permitEwcCodes.isActive, true),
      ),
    )
    .where(
      and(
        eq(ewcCodes.id, ewcCodeId),
        eq(ewcCodes.isActive, true),
      ),
    )
    .limit(1);

  if (!ewc) {
    return {
      ok: false,
      error:
        "For quick-create on this incoming booking, choose an EWC accepted by the current receiving permit. The full Materials screen can store wider reusable profiles.",
    };
  }

  const [created] = await database
    .insert(materialProfiles)
    .values({
      organisationId,
      siteId: null,
      name,
      ewcCodeId,
      wasteDescription,
      physicalForm: physicalForm as
        | "Gas"
        | "Liquid"
        | "Solid"
        | "Powder"
        | "Sludge"
        | "Mixed",
      defaultNumberOfContainers,
      defaultContainerType,
      containsPops,
      containsHazardous,
      defaultDisposalRecoveryCodeId: null,
      defaultWeightMetric: defaultWeightMetric as
        | "Grams"
        | "Kilograms"
        | "Tonnes",
      isFavourite: false,
      isActive: true,
      createdByUserId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({
      id: materialProfiles.id,
      name: materialProfiles.name,
      ewcCodeId: materialProfiles.ewcCodeId,
      wasteDescription: materialProfiles.wasteDescription,
      physicalForm: materialProfiles.physicalForm,
      defaultWeightMetric: materialProfiles.defaultWeightMetric,
      isFavourite: materialProfiles.isFavourite,
    });

  if (!created) return { ok: false, error: "The material profile could not be created." };

  revalidatePath("/home/materials");
  refreshQuickCreatePaths();

  return {
    ok: true,
    data: {
      ...created,
      ewcCode: ewc.code,
    },
  };
}
