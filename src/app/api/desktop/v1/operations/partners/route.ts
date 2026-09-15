import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  counterpartySiteAuthorisations,
  counterpartySites,
  drivers,
  vehicles,
} from "@/db/schema";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import { recordSyncChange } from "@/lib/client-api/change-feed";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

/* WASTE_X_DESKTOP_CLIENT_STABLE_PARTNER_IDS_V1 */

const optionalText = z.string().trim().max(4000).nullable().optional();

const haulierData = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(300),
  carrierRegistrationNumber: optionalText,
  email: optionalText,
  telephone: optionalText,
  fullAddress: optionalText,
  postcode: optionalText,
  notes: optionalText,
});

const companyData = z.object({
  id: z.string().trim().min(1).optional(),
  kind: z.enum(["source", "destination"]),
  name: z.string().trim().min(1).max(300),
  accountReference: optionalText,
  email: optionalText,
  telephone: optionalText,
  fullAddress: optionalText,
  postcode: optionalText,
  notes: optionalText,
});

const siteData = z.object({
  id: z.string().trim().min(1).optional(),
  kind: z.enum(["source", "destination"]),
  counterpartyId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(300),
  fullAddress: optionalText,
  postcode: optionalText,
  contactName: optionalText,
  contactEmail: optionalText,
  contactTelephone: optionalText,
  notes: optionalText,
});

const mutationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("haulier.create"),
    data: haulierData,
  }),
  z.object({
    operation: z.literal("haulier.update"),
    data: haulierData.extend({ id: z.string().trim().min(1) }),
  }),
  z.object({
    operation: z.literal("haulier.archive"),
    id: z.string().trim().min(1),
  }),
  z.object({
    operation: z.literal("haulier.restore"),
    id: z.string().trim().min(1),
  }),
  z.object({
    operation: z.literal("company.create"),
    data: companyData,
  }),
  z.object({
    operation: z.literal("site.create"),
    data: siteData,
  }),
  z.object({
    operation: z.literal("site.update"),
    data: siteData.extend({ id: z.string().trim().min(1) }),
  }),
  z.object({
    operation: z.literal("site.archive"),
    id: z.string().trim().min(1),
  }),
  z.object({
    operation: z.literal("site.restore"),
    id: z.string().trim().min(1),
  }),
]);

function nullable(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  return clean || null;
}

function normalisePostcode(value: string | null | undefined) {
  const clean = nullable(value);
  return clean ? clean.toUpperCase() : null;
}

function normaliseCarrierNumber(value: string | null | undefined) {
  const clean = nullable(value);
  return clean ? clean.toUpperCase().replace(/\s+/g, "") : null;
}

async function hasRole(
  organisationId: string,
  counterpartyId: string,
  role: "client" | "haulier" | "receiver" | "third_party_tip",
) {
  return database.query.counterpartyRoles.findFirst({
    where: and(
      eq(counterpartyRoles.organisationId, organisationId),
      eq(counterpartyRoles.counterpartyId, counterpartyId),
      eq(counterpartyRoles.role, role),
    ),
    columns: { role: true },
  });
}

async function addRoleIfMissing(
  organisationId: string,
  counterpartyId: string,
  role: "client" | "haulier" | "receiver" | "third_party_tip",
) {
  const existing = await hasRole(organisationId, counterpartyId, role);
  if (existing) return;

  await database.insert(counterpartyRoles).values({
    organisationId,
    counterpartyId,
    role,
    createdAt: new Date(),
  });
}

async function publishChange(input: {
  organisationId: string;
  siteId: string | null;
  entityType:
    | "counterparty"
    | "counterparty_role"
    | "counterparty_site"
    | "driver"
    | "vehicle";
  entityId: string;
  payload: unknown;
}) {
  try {
    await recordSyncChange({
      organisationId: input.organisationId,
      siteId: input.siteId,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload,
    });
    return false;
  } catch (error) {
    console.error("[DESKTOP_PARTNER_CHANGE_FEED]", {
      entityType: input.entityType,
      entityId: input.entityId,
      error,
    });
    return true;
  }
}

async function readPartnerData(organisationId: string) {
  const roleRows = await database
    .select({
      counterpartyId: counterpartyRoles.counterpartyId,
      role: counterpartyRoles.role,
    })
    .from(counterpartyRoles)
    .where(
      and(
        eq(counterpartyRoles.organisationId, organisationId),
        inArray(counterpartyRoles.role, [
          "client",
          "haulier",
          "receiver",
          "third_party_tip",
        ]),
      ),
    );

  const roleMap = new Map<string, Set<string>>();

  for (const row of roleRows) {
    const current = roleMap.get(row.counterpartyId) ?? new Set<string>();
    current.add(row.role);
    roleMap.set(row.counterpartyId, current);
  }

  const allCounterparties = await database
    .select({
      id: counterparties.id,
      name: counterparties.name,
      accountReference: counterparties.accountReference,
      carrierRegistrationNumber:
        counterparties.carrierRegistrationNumber,
      email: counterparties.email,
      telephone: counterparties.telephone,
      fullAddress: counterparties.fullAddress,
      postcode: counterparties.postcode,
      notes: counterparties.notes,
      isActive: counterparties.isActive,
      createdAt: counterparties.createdAt,
      updatedAt: counterparties.updatedAt,
    })
    .from(counterparties)
    .where(eq(counterparties.organisationId, organisationId))
    .orderBy(asc(counterparties.name));

  const siteRows = await database
    .select({
      id: counterpartySites.id,
      counterpartyId: counterpartySites.counterpartyId,
      name: counterpartySites.name,
      siteType: counterpartySites.siteType,
      fullAddress: counterpartySites.fullAddress,
      postcode: counterpartySites.postcode,
      contactName: counterpartySites.contactName,
      contactEmail: counterpartySites.contactEmail,
      contactTelephone: counterpartySites.contactTelephone,
      authorisationNumber: counterpartySites.authorisationNumber,
      isDefault: counterpartySites.isDefault,
      isActive: counterpartySites.isActive,
      notes: counterpartySites.notes,
      createdAt: counterpartySites.createdAt,
      updatedAt: counterpartySites.updatedAt,
    })
    .from(counterpartySites)
    .where(
      and(
        eq(counterpartySites.organisationId, organisationId),
        inArray(counterpartySites.siteType, [
          "producer_site",
          "third_party_tip",
        ]),
      ),
    )
    .orderBy(asc(counterpartySites.name));

  const destinationIds = siteRows
    .filter((site) => site.siteType === "third_party_tip")
    .map((site) => site.id);

  const authorisationRows = destinationIds.length
    ? await database
        .select({
          counterpartySiteId:
            counterpartySiteAuthorisations.counterpartySiteId,
          status: counterpartySiteAuthorisations.status,
          authorisationNumber:
            counterpartySiteAuthorisations.authorisationNumber,
        })
        .from(counterpartySiteAuthorisations)
        .where(
          and(
            eq(
              counterpartySiteAuthorisations.organisationId,
              organisationId,
            ),
            inArray(
              counterpartySiteAuthorisations.counterpartySiteId,
              destinationIds,
            ),
          ),
        )
    : [];

  const authBySite = new Map<
    string,
    { active: boolean; authorisationNumbers: string[] }
  >();

  for (const row of authorisationRows) {
    const current = authBySite.get(row.counterpartySiteId) ?? {
      active: false,
      authorisationNumbers: [],
    };

    if (row.status === "active") current.active = true;
    if (row.authorisationNumber) {
      current.authorisationNumbers.push(row.authorisationNumber);
    }

    authBySite.set(row.counterpartySiteId, current);
  }

  const companies = allCounterparties.map((company) => ({
    ...company,
    roles: Array.from(roleMap.get(company.id) ?? new Set<string>()),
  }));

  return {
    hauliers: companies.filter((company) =>
      company.roles.includes("haulier"),
    ),
    sourceCompanies: companies.filter((company) =>
      company.roles.includes("client"),
    ),
    destinationCompanies: companies.filter(
      (company) =>
        company.roles.includes("receiver") ||
        company.roles.includes("third_party_tip"),
    ),
    sites: siteRows.map((site) => ({
      ...site,
      kind:
        site.siteType === "third_party_tip"
          ? ("destination" as const)
          : ("source" as const),
      companyName:
        allCounterparties.find(
          (company) => company.id === site.counterpartyId,
        )?.name ?? "Unknown company",
      hasActiveAuthorisation:
        authBySite.get(site.id)?.active ?? false,
      authorisationNumbers:
        authBySite.get(site.id)?.authorisationNumbers ?? [],
    })),
  };
}

export async function GET(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    return clientApiJson({
      ok: true,
      ...(await readPartnerData(context.organisationId)),
      boundary: {
        destinationAuthorisations: "WEB_ONLY",
        permittedEwcConfiguration: "WEB_ONLY",
        advancedCounterpartyCompliance: "WEB_ONLY",
      },
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const parsed = mutationSchema.safeParse(await request.json());

    if (!parsed.success) {
      return clientApiError(
        "INVALID_PARTNER_MASTER_DATA",
        400,
        "The company / site details are invalid.",
        parsed.error.flatten(),
      );
    }

    const mutation = parsed.data;
    let syncFeedWarning = false;
    let entityType: "haulier" | "company" | "site";
    let entityId: string;
    let action: "created" | "updated" | "archived" | "restored";

    if (
      mutation.operation === "haulier.create" ||
      mutation.operation === "haulier.update"
    ) {
      const data = mutation.data;
      const carrierRegistrationNumber = normaliseCarrierNumber(
        data.carrierRegistrationNumber,
      );
      const postcode = normalisePostcode(data.postcode);

      if (mutation.operation === "haulier.create") {
        const requestedId = data.id ?? null;
        const requestedExisting = requestedId
          ? await database.query.counterparties.findFirst({
              where: and(
                eq(counterparties.id, requestedId),
                eq(counterparties.organisationId, context.organisationId),
              ),
            })
          : null;

        if (requestedExisting) {
          if (requestedExisting.name !== data.name.trim()) {
            return clientApiError(
              "DESKTOP_HAULIER_ID_COLLISION",
              409,
              "That Desktop Haulier identity belongs to a different company.",
            );
          }

          await database
            .update(counterparties)
            .set({
              carrierRegistrationNumber,
              email: nullable(data.email) ?? requestedExisting.email,
              telephone:
                nullable(data.telephone) ?? requestedExisting.telephone,
              fullAddress:
                nullable(data.fullAddress) ??
                requestedExisting.fullAddress,
              postcode: postcode ?? requestedExisting.postcode,
              notes: nullable(data.notes) ?? requestedExisting.notes,
              isActive: true,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(counterparties.id, requestedExisting.id),
                eq(
                  counterparties.organisationId,
                  context.organisationId,
                ),
              ),
            );

          await addRoleIfMissing(
            context.organisationId,
            requestedExisting.id,
            "haulier",
          );

          entityType = "haulier";
          entityId = requestedExisting.id;
          action = "created";
        } else {
          const sameName = await database.query.counterparties.findFirst({
            where: and(
              eq(counterparties.organisationId, context.organisationId),
              eq(counterparties.name, data.name.trim()),
            ),
          });

          if (sameName && requestedId) {
            return clientApiError(
              "DESKTOP_HAULIER_NAME_COLLISION",
              409,
              "A different Waste X company already uses that Haulier name.",
            );
          }

          if (sameName) {
            const existingRole = await hasRole(
              context.organisationId,
              sameName.id,
              "haulier",
            );

            if (existingRole) {
              return clientApiError(
                "DUPLICATE_HAULIER",
                409,
                "That haulier already exists.",
              );
            }

            await database
              .update(counterparties)
              .set({
                carrierRegistrationNumber,
                email: nullable(data.email) ?? sameName.email,
                telephone:
                  nullable(data.telephone) ?? sameName.telephone,
                fullAddress:
                  nullable(data.fullAddress) ?? sameName.fullAddress,
                postcode: postcode ?? sameName.postcode,
                notes: nullable(data.notes) ?? sameName.notes,
                isActive: true,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(counterparties.id, sameName.id),
                  eq(
                    counterparties.organisationId,
                    context.organisationId,
                  ),
                ),
              );

            await addRoleIfMissing(
              context.organisationId,
              sameName.id,
              "haulier",
            );

            entityType = "haulier";
            entityId = sameName.id;
            action = "created";
          } else {
            const [created] = await database
              .insert(counterparties)
              .values({
                ...(requestedId ? { id: requestedId } : {}),
                organisationId: context.organisationId,
                name: data.name.trim(),
                carrierRegistrationNumber,
                email: nullable(data.email),
                telephone: nullable(data.telephone),
                fullAddress: nullable(data.fullAddress),
                postcode,
                notes: nullable(data.notes),
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .returning({ id: counterparties.id });

            if (!created) {
              return clientApiError(
                "HAULIER_CREATE_FAILED",
                500,
                "Waste X could not create the haulier.",
              );
            }

            await addRoleIfMissing(
              context.organisationId,
              created.id,
              "haulier",
            );

            entityType = "haulier";
            entityId = created.id;
            action = "created";
          }
        }
      } else {
        const existing = await database.query.counterparties.findFirst({
          where: and(
            eq(counterparties.id, mutation.data.id),
            eq(counterparties.organisationId, context.organisationId),
          ),
        });

        if (!existing) {
          return clientApiError(
            "HAULIER_NOT_FOUND",
            404,
            "That haulier was not found.",
          );
        }

        const role = await hasRole(
          context.organisationId,
          mutation.data.id,
          "haulier",
        );

        if (!role) {
          return clientApiError(
            "HAULIER_NOT_FOUND",
            404,
            "That company is not a haulier.",
          );
        }

        const duplicate = await database.query.counterparties.findFirst({
          where: and(
            eq(counterparties.organisationId, context.organisationId),
            eq(counterparties.name, data.name.trim()),
            ne(counterparties.id, mutation.data.id),
          ),
          columns: { id: true },
        });

        if (duplicate) {
          return clientApiError(
            "DUPLICATE_COMPANY_NAME",
            409,
            "Another company already uses that name.",
          );
        }

        await database
          .update(counterparties)
          .set({
            name: data.name.trim(),
            carrierRegistrationNumber,
            email: nullable(data.email),
            telephone: nullable(data.telephone),
            fullAddress: nullable(data.fullAddress),
            postcode,
            notes: nullable(data.notes),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(counterparties.id, mutation.data.id),
              eq(counterparties.organisationId, context.organisationId),
            ),
          );

        entityType = "haulier";
        entityId = mutation.data.id;
        action = "updated";
      }
    } else if (
      mutation.operation === "haulier.archive" ||
      mutation.operation === "haulier.restore"
    ) {
      const haulier = await database.query.counterparties.findFirst({
        where: and(
          eq(counterparties.id, mutation.id),
          eq(counterparties.organisationId, context.organisationId),
        ),
      });

      if (!haulier) {
        return clientApiError(
          "HAULIER_NOT_FOUND",
          404,
          "That haulier was not found.",
        );
      }

      const role = await hasRole(
        context.organisationId,
        mutation.id,
        "haulier",
      );

      if (!role) {
        return clientApiError(
          "HAULIER_NOT_FOUND",
          404,
          "That company is not a haulier.",
        );
      }

      const restoring = mutation.operation === "haulier.restore";

      if (!restoring) {
        /*
          Canonical Web rule: counterparties.isActive belongs to the whole
          business record. A multi-role company cannot be archived from the
          Hauliers surface because that would disable its client/producer/etc.
          uses too.
        */
        const otherRole = await database.query.counterpartyRoles.findFirst({
          where: and(
            eq(
              counterpartyRoles.organisationId,
              context.organisationId,
            ),
            eq(counterpartyRoles.counterpartyId, mutation.id),
            ne(counterpartyRoles.role, "haulier"),
          ),
          columns: { role: true },
        });

        if (otherRole) {
          return clientApiError(
            "MULTI_ROLE_ARCHIVE_BLOCKED",
            409,
            "This company has other Waste X roles and cannot be archived from Hauliers. Manage the shared business record on Web.",
          );
        }

        await database.transaction(async (tx) => {
          await tx
            .update(counterparties)
            .set({ isActive: false, updatedAt: new Date() })
            .where(
              and(
                eq(counterparties.id, mutation.id),
                eq(
                  counterparties.organisationId,
                  context.organisationId,
                ),
              ),
            );

          await tx
            .update(drivers)
            .set({ isActive: false, updatedAt: new Date() })
            .where(
              and(
                eq(drivers.organisationId, context.organisationId),
                eq(drivers.haulierCounterpartyId, mutation.id),
              ),
            );

          await tx
            .update(vehicles)
            .set({ isActive: false, updatedAt: new Date() })
            .where(
              and(
                eq(vehicles.organisationId, context.organisationId),
                eq(vehicles.haulierCounterpartyId, mutation.id),
              ),
            );
        });
      } else {
        await database
          .update(counterparties)
          .set({ isActive: true, updatedAt: new Date() })
          .where(
            and(
              eq(counterparties.id, mutation.id),
              eq(counterparties.organisationId, context.organisationId),
            ),
          );
      }

      entityType = "haulier";
      entityId = mutation.id;
      action = restoring ? "restored" : "archived";
    } else if (mutation.operation === "company.create") {
      const data = mutation.data;
      const name = data.name.trim();
      const requestedId = data.id ?? null;
      const requestedExisting = requestedId
        ? await database.query.counterparties.findFirst({
            where: and(
              eq(counterparties.id, requestedId),
              eq(counterparties.organisationId, context.organisationId),
            ),
          })
        : null;

      let companyId: string;

      if (requestedExisting) {
        if (requestedExisting.name !== name) {
          return clientApiError(
            "DESKTOP_COMPANY_ID_COLLISION",
            409,
            "That Desktop company identity belongs to a different company.",
          );
        }

        companyId = requestedExisting.id;

        await database
          .update(counterparties)
          .set({
            accountReference:
              nullable(data.accountReference) ??
              requestedExisting.accountReference,
            email: nullable(data.email) ?? requestedExisting.email,
            telephone:
              nullable(data.telephone) ?? requestedExisting.telephone,
            fullAddress:
              nullable(data.fullAddress) ??
              requestedExisting.fullAddress,
            postcode:
              normalisePostcode(data.postcode) ??
              requestedExisting.postcode,
            notes: nullable(data.notes) ?? requestedExisting.notes,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(counterparties.id, requestedExisting.id),
              eq(counterparties.organisationId, context.organisationId),
            ),
          );
      } else {
        const sameName = await database.query.counterparties.findFirst({
          where: and(
            eq(counterparties.organisationId, context.organisationId),
            eq(counterparties.name, name),
          ),
        });

        if (sameName && requestedId) {
          return clientApiError(
            "DESKTOP_COMPANY_NAME_COLLISION",
            409,
            "A different Waste X company already uses that name.",
          );
        }

        if (sameName) {
          companyId = sameName.id;

          await database
            .update(counterparties)
            .set({
              accountReference:
                nullable(data.accountReference) ??
                sameName.accountReference,
              email: nullable(data.email) ?? sameName.email,
              telephone:
                nullable(data.telephone) ?? sameName.telephone,
              fullAddress:
                nullable(data.fullAddress) ?? sameName.fullAddress,
              postcode:
                normalisePostcode(data.postcode) ?? sameName.postcode,
              notes: nullable(data.notes) ?? sameName.notes,
              isActive: true,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(counterparties.id, sameName.id),
                eq(counterparties.organisationId, context.organisationId),
              ),
            );
        } else {
          const [created] = await database
            .insert(counterparties)
            .values({
              ...(requestedId ? { id: requestedId } : {}),
              organisationId: context.organisationId,
              name,
              accountReference: nullable(data.accountReference),
              email: nullable(data.email),
              telephone: nullable(data.telephone),
              fullAddress: nullable(data.fullAddress),
              postcode: normalisePostcode(data.postcode),
              notes: nullable(data.notes),
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning({ id: counterparties.id });

          if (!created) {
            return clientApiError(
              "COMPANY_CREATE_FAILED",
              500,
              "Waste X could not create the company.",
            );
          }

          companyId = created.id;
        }
      }

      if (data.kind === "source") {
        await addRoleIfMissing(
          context.organisationId,
          companyId,
          "client",
        );
      } else {
        await addRoleIfMissing(
          context.organisationId,
          companyId,
          "receiver",
        );
        await addRoleIfMissing(
          context.organisationId,
          companyId,
          "third_party_tip",
        );
      }

      entityType = "company";
      entityId = companyId;
      action = "created";
    } else if (
      mutation.operation === "site.create" ||
      mutation.operation === "site.update"
    ) {
      const data = mutation.data;
      const siteType =
        data.kind === "destination"
          ? ("third_party_tip" as const)
          : ("producer_site" as const);

      const company = await database.query.counterparties.findFirst({
        where: and(
          eq(counterparties.id, data.counterpartyId),
          eq(counterparties.organisationId, context.organisationId),
          eq(counterparties.isActive, true),
        ),
        columns: { id: true },
      });

      if (!company) {
        return clientApiError(
          "COMPANY_NOT_AVAILABLE",
          400,
          "Choose an active company for this site.",
        );
      }

      const requiredRole =
        data.kind === "source" ? "client" : "third_party_tip";

      const role = await hasRole(
        context.organisationId,
        data.counterpartyId,
        requiredRole,
      );

      if (!role) {
        return clientApiError(
          "COMPANY_ROLE_MISMATCH",
          400,
          data.kind === "source"
            ? "That company is not configured as a source/client."
            : "That company is not configured as a destination operator.",
        );
      }

      if (mutation.operation === "site.create") {
        const requestedId = data.id ?? null;
        const requestedExisting = requestedId
          ? await database.query.counterpartySites.findFirst({
              where: and(
                eq(counterpartySites.id, requestedId),
                eq(
                  counterpartySites.organisationId,
                  context.organisationId,
                ),
              ),
            })
          : null;

        if (requestedExisting) {
          if (
            requestedExisting.counterpartyId !== data.counterpartyId ||
            requestedExisting.siteType !== siteType ||
            requestedExisting.name !== data.name.trim()
          ) {
            return clientApiError(
              "DESKTOP_SITE_ID_COLLISION",
              409,
              "That Desktop Site identity belongs to a different site.",
            );
          }

          await database
            .update(counterpartySites)
            .set({
              fullAddress: nullable(data.fullAddress),
              postcode: normalisePostcode(data.postcode),
              contactName: nullable(data.contactName),
              contactEmail: nullable(data.contactEmail),
              contactTelephone: nullable(data.contactTelephone),
              isActive: true,
              notes: nullable(data.notes),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(counterpartySites.id, requestedExisting.id),
                eq(
                  counterpartySites.organisationId,
                  context.organisationId,
                ),
              ),
            );

          entityType = "site";
          entityId = requestedExisting.id;
          action = "created";
        } else {
          const duplicate =
            await database.query.counterpartySites.findFirst({
              where: and(
                eq(
                  counterpartySites.organisationId,
                  context.organisationId,
                ),
                eq(
                  counterpartySites.counterpartyId,
                  data.counterpartyId,
                ),
                eq(counterpartySites.name, data.name.trim()),
              ),
              columns: { id: true },
            });

          if (duplicate) {
            return clientApiError(
              requestedId
                ? "DESKTOP_SITE_NAME_COLLISION"
                : "DUPLICATE_SITE",
              409,
              "That company already has a site with this name.",
            );
          }

          const existingSite =
            await database.query.counterpartySites.findFirst({
              where: and(
                eq(
                  counterpartySites.organisationId,
                  context.organisationId,
                ),
                eq(
                  counterpartySites.counterpartyId,
                  data.counterpartyId,
                ),
                eq(counterpartySites.isActive, true),
              ),
              columns: { id: true },
            });

          const [created] = await database
            .insert(counterpartySites)
            .values({
              ...(requestedId ? { id: requestedId } : {}),
              organisationId: context.organisationId,
              counterpartyId: data.counterpartyId,
              name: data.name.trim(),
              siteType,
              fullAddress: nullable(data.fullAddress),
              postcode: normalisePostcode(data.postcode),
              contactName: nullable(data.contactName),
              contactEmail: nullable(data.contactEmail),
              contactTelephone: nullable(data.contactTelephone),
              isDefault: !existingSite,
              isActive: true,
              notes: nullable(data.notes),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning({ id: counterpartySites.id });

          if (!created) {
            return clientApiError(
              "SITE_CREATE_FAILED",
              500,
              "Waste X could not create the site.",
            );
          }

          entityType = "site";
          entityId = created.id;
          action = "created";
        }
      } else {
        const existing = await database.query.counterpartySites.findFirst({
          where: and(
            eq(counterpartySites.id, mutation.data.id),
            eq(
              counterpartySites.organisationId,
              context.organisationId,
            ),
          ),
        });

        if (!existing) {
          return clientApiError(
            "SITE_NOT_FOUND",
            404,
            "That site was not found.",
          );
        }

        /*
          Do not silently convert a producer site into a regulated
          third-party destination (or vice versa). That changes compliance
          meaning. Create the correct new site instead.
        */
        if (existing.siteType !== siteType) {
          return clientApiError(
            "SITE_TYPE_CHANGE_BLOCKED",
            409,
            "Desktop does not convert source sites into destination facilities. Create a new operational site with the correct type.",
          );
        }

        const duplicate = await database.query.counterpartySites.findFirst({
          where: and(
            eq(
              counterpartySites.organisationId,
              context.organisationId,
            ),
            eq(counterpartySites.counterpartyId, data.counterpartyId),
            eq(counterpartySites.name, data.name.trim()),
            ne(counterpartySites.id, mutation.data.id),
          ),
          columns: { id: true },
        });

        if (duplicate) {
          return clientApiError(
            "DUPLICATE_SITE",
            409,
            "That company already has another site with this name.",
          );
        }

        await database
          .update(counterpartySites)
          .set({
            counterpartyId: data.counterpartyId,
            name: data.name.trim(),
            fullAddress: nullable(data.fullAddress),
            postcode: normalisePostcode(data.postcode),
            contactName: nullable(data.contactName),
            contactEmail: nullable(data.contactEmail),
            contactTelephone: nullable(data.contactTelephone),
            notes: nullable(data.notes),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(counterpartySites.id, mutation.data.id),
              eq(
                counterpartySites.organisationId,
                context.organisationId,
              ),
            ),
          );

        entityType = "site";
        entityId = mutation.data.id;
        action = "updated";
      }
    } else {
      const site = await database.query.counterpartySites.findFirst({
        where: and(
          eq(counterpartySites.id, mutation.id),
          eq(
            counterpartySites.organisationId,
            context.organisationId,
          ),
        ),
      });

      if (!site) {
        return clientApiError(
          "SITE_NOT_FOUND",
          404,
          "That site was not found.",
        );
      }

      const restoring = mutation.operation === "site.restore";

      await database
        .update(counterpartySites)
        .set({
          isActive: restoring,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(counterpartySites.id, mutation.id),
            eq(
              counterpartySites.organisationId,
              context.organisationId,
            ),
          ),
        );

      entityType = "site";
      entityId = mutation.id;
      action = restoring ? "restored" : "archived";
    }

    if (entityType === "haulier" || entityType === "company") {
      const changed = await database.query.counterparties.findFirst({
        where: and(
          eq(counterparties.id, entityId),
          eq(counterparties.organisationId, context.organisationId),
        ),
      });

      if (changed) {
        syncFeedWarning =
          (await publishChange({
            organisationId: context.organisationId,
            siteId: context.defaultSiteId ?? null,
            entityType: "counterparty",
            entityId,
            payload: changed,
          })) || syncFeedWarning;
      }
    } else {
      const changed = await database.query.counterpartySites.findFirst({
        where: and(
          eq(counterpartySites.id, entityId),
          eq(
            counterpartySites.organisationId,
            context.organisationId,
          ),
        ),
      });

      if (changed) {
        syncFeedWarning =
          (await publishChange({
            organisationId: context.organisationId,
            siteId: context.defaultSiteId ?? null,
            entityType: "counterparty_site",
            entityId,
            payload: changed,
          })) || syncFeedWarning;
      }
    }

    return clientApiJson({
      ok: true,
      action,
      entityType,
      entityId,
      syncFeedWarning,
      data: await readPartnerData(context.organisationId),
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
