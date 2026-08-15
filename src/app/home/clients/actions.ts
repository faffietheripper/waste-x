// src/app/home/clients/actions.ts

"use server";

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
  counterparties,
  counterpartyRoles,
  counterpartySites,
  users,
} from "@/db/schema";

/* =========================================================
   TYPES
========================================================= */

type OrganisationContext = {
  userId: string;
  organisationId: string;
};

/* =========================================================
   AUTH

   Client/site master data is operational data.

   For the current MVP any active organisation member can
   manage it. The proper Admin / Operations / Accounts /
   Read-only permission layer comes later in Stage 7.
========================================================= */

async function requireOrganisationMember(): Promise<OrganisationContext> {
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
        isActive: true,
        isSuspended: true,
      },
    });

  if (
    !currentUser?.organisationId ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect(
      "/home?reason=account_unavailable",
    );
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

  return cleaned.length > 0
    ? cleaned
    : null;
}

function optionalInteger(
  value: FormDataEntryValue | null,
) {
  const cleaned =
    cleanString(value);

  if (!cleaned) {
    return null;
  }

  const number =
    Number(cleaned);

  if (
    !Number.isInteger(number) ||
    number < 0
  ) {
    return null;
  }

  return number;
}

function normalisePostcode(
  value: FormDataEntryValue | null,
) {
  const cleaned =
    optionalString(value);

  return cleaned
    ? cleaned.toUpperCase()
    : null;
}

/* =========================================================
   CLIENT VALIDATION
========================================================= */

async function getClient(
  organisationId: string,
  clientId: string,
) {
  const rows =
    await database
      .select({
        id: counterparties.id,
        isActive:
          counterparties.isActive,
      })
      .from(counterparties)

      .innerJoin(
        counterpartyRoles,
        and(
          eq(
            counterpartyRoles.counterpartyId,
            counterparties.id,
          ),
          eq(
            counterpartyRoles.role,
            "client",
          ),
        ),
      )

      .where(
        and(
          eq(
            counterparties.id,
            clientId,
          ),
          eq(
            counterparties.organisationId,
            organisationId,
          ),
        ),
      )

      .limit(1);

  return rows[0] ?? null;
}

/* =========================================================
   REDIRECT HELPERS
========================================================= */

function redirectNewError(
  error: string,
): never {
  redirect(
    `/home/clients/new?error=${encodeURIComponent(
      error,
    )}`,
  );
}

function redirectClientError(
  clientId: string,
  error: string,
): never {
  redirect(
    `/home/clients/${clientId}?error=${encodeURIComponent(
      error,
    )}`,
  );
}

function redirectEditError(
  clientId: string,
  error: string,
): never {
  redirect(
    `/home/clients/${clientId}/edit?error=${encodeURIComponent(
      error,
    )}`,
  );
}

function redirectClientSuccess(
  clientId: string,
  success: string,
): never {
  redirect(
    `/home/clients/${clientId}?success=${encodeURIComponent(
      success,
    )}`,
  );
}

/* =========================================================
   CREATE CLIENT
========================================================= */

export async function createClientAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationMember();

  const name =
    cleanString(
      formData.get("name"),
    );

  const accountReference =
    optionalString(
      formData.get(
        "accountReference",
      ),
    );

  const email =
    optionalString(
      formData.get("email"),
    );

  const telephone =
    optionalString(
      formData.get("telephone"),
    );

  const fullAddress =
    optionalString(
      formData.get(
        "fullAddress",
      ),
    );

  const postcode =
    normalisePostcode(
      formData.get("postcode"),
    );

  const paymentTermsDays =
    optionalInteger(
      formData.get(
        "paymentTermsDays",
      ),
    );

  const notes =
    optionalString(
      formData.get("notes"),
    );

  if (!name) {
    redirectNewError(
      "name_required",
    );
  }

  if (
    cleanString(
      formData.get(
        "paymentTermsDays",
      ),
    ) &&
    paymentTermsDays === null
  ) {
    redirectNewError(
      "invalid_payment_terms",
    );
  }

  /* =======================================================
     ACCOUNT REFERENCE MUST BE UNIQUE WHEN PROVIDED
  ======================================================= */

  if (accountReference) {
    const duplicateReference =
      await database.query.counterparties.findFirst({
        where: and(
          eq(
            counterparties.organisationId,
            context.organisationId,
          ),
          eq(
            counterparties.accountReference,
            accountReference,
          ),
        ),

        columns: {
          id: true,
        },
      });

    if (duplicateReference) {
      redirectNewError(
        "duplicate_account_reference",
      );
    }
  }

  /* =======================================================
     CREATE BUSINESS + CLIENT ROLE

     Important:
     We do NOT create a separate "client table".

     The business is a counterparty with a client role. This
     allows the same business to later also be a producer,
     haulier, broker, etc. without changing the core model.
  ======================================================= */

  const clientId =
    await database.transaction(
      async (tx) => {
        const [created] =
          await tx
            .insert(
              counterparties,
            )
            .values({
              organisationId:
                context.organisationId,

              name,

              accountReference,

              email,
              telephone,

              fullAddress,
              postcode,

              paymentTermsDays,

              notes,

              isActive: true,

              createdAt:
                new Date(),

              updatedAt:
                new Date(),
            })
            .returning({
              id:
                counterparties.id,
            });

        if (!created) {
          throw new Error(
            "CLIENT_CREATE_FAILED",
          );
        }

        await tx
          .insert(
            counterpartyRoles,
          )
          .values({
            organisationId:
              context.organisationId,

            counterpartyId:
              created.id,

            role: "client",

            createdAt:
              new Date(),
          });

        return created.id;
      },
    );

  revalidatePath(
    "/home/clients",
  );

  redirect(
    `/home/clients/${clientId}?success=client_created`,
  );
}

/* =========================================================
   UPDATE CLIENT
========================================================= */

export async function updateClientAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationMember();

  const clientId =
    cleanString(
      formData.get(
        "clientId",
      ),
    );

  if (!clientId) {
    redirect(
      "/home/clients?error=missing_client",
    );
  }

  const client =
    await getClient(
      context.organisationId,
      clientId,
    );

  if (!client) {
    redirect(
      "/home/clients?error=client_not_found",
    );
  }

  const name =
    cleanString(
      formData.get("name"),
    );

  const accountReference =
    optionalString(
      formData.get(
        "accountReference",
      ),
    );

  const email =
    optionalString(
      formData.get("email"),
    );

  const telephone =
    optionalString(
      formData.get("telephone"),
    );

  const fullAddress =
    optionalString(
      formData.get(
        "fullAddress",
      ),
    );

  const postcode =
    normalisePostcode(
      formData.get("postcode"),
    );

  const paymentTermsDays =
    optionalInteger(
      formData.get(
        "paymentTermsDays",
      ),
    );

  const notes =
    optionalString(
      formData.get("notes"),
    );

  if (!name) {
    redirectEditError(
      clientId,
      "name_required",
    );
  }

  if (
    cleanString(
      formData.get(
        "paymentTermsDays",
      ),
    ) &&
    paymentTermsDays === null
  ) {
    redirectEditError(
      clientId,
      "invalid_payment_terms",
    );
  }

  if (accountReference) {
    const duplicateReference =
      await database.query.counterparties.findFirst({
        where: and(
          eq(
            counterparties.organisationId,
            context.organisationId,
          ),

          eq(
            counterparties.accountReference,
            accountReference,
          ),

          ne(
            counterparties.id,
            clientId,
          ),
        ),

        columns: {
          id: true,
        },
      });

    if (duplicateReference) {
      redirectEditError(
        clientId,
        "duplicate_account_reference",
      );
    }
  }

  await database
    .update(counterparties)
    .set({
      name,

      accountReference,

      email,
      telephone,

      fullAddress,
      postcode,

      paymentTermsDays,

      notes,

      updatedAt:
        new Date(),
    })
    .where(
      and(
        eq(
          counterparties.id,
          clientId,
        ),

        eq(
          counterparties.organisationId,
          context.organisationId,
        ),
      ),
    );

  revalidatePath(
    "/home/clients",
  );

  revalidatePath(
    `/home/clients/${clientId}`,
  );

  revalidatePath(
    `/home/clients/${clientId}/edit`,
  );

  redirectClientSuccess(
    clientId,
    "client_updated",
  );
}

/* =========================================================
   ARCHIVE CLIENT
========================================================= */

export async function archiveClientAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationMember();

  const clientId =
    cleanString(
      formData.get(
        "clientId",
      ),
    );

  if (!clientId) {
    redirect(
      "/home/clients?error=missing_client",
    );
  }

  const client =
    await getClient(
      context.organisationId,
      clientId,
    );

  if (!client) {
    redirect(
      "/home/clients?error=client_not_found",
    );
  }

  /*
    Archive the master record, don't delete it.

    Historical jobs/loads can therefore continue pointing at
    the same client.
  */

  await database
    .update(counterparties)
    .set({
      isActive: false,
      updatedAt:
        new Date(),
    })
    .where(
      and(
        eq(
          counterparties.id,
          clientId,
        ),

        eq(
          counterparties.organisationId,
          context.organisationId,
        ),
      ),
    );

  revalidatePath(
    "/home/clients",
  );

  revalidatePath(
    `/home/clients/${clientId}`,
  );

  redirectClientSuccess(
    clientId,
    "client_archived",
  );
}

/* =========================================================
   RESTORE CLIENT
========================================================= */

export async function restoreClientAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationMember();

  const clientId =
    cleanString(
      formData.get(
        "clientId",
      ),
    );

  if (!clientId) {
    redirect(
      "/home/clients?error=missing_client",
    );
  }

  const client =
    await getClient(
      context.organisationId,
      clientId,
    );

  if (!client) {
    redirect(
      "/home/clients?error=client_not_found",
    );
  }

  await database
    .update(counterparties)
    .set({
      isActive: true,
      updatedAt:
        new Date(),
    })
    .where(
      and(
        eq(
          counterparties.id,
          clientId,
        ),

        eq(
          counterparties.organisationId,
          context.organisationId,
        ),
      ),
    );

  revalidatePath(
    "/home/clients",
  );

  revalidatePath(
    `/home/clients/${clientId}`,
  );

  redirectClientSuccess(
    clientId,
    "client_restored",
  );
}

/* =========================================================
   CREATE CLIENT SITE
========================================================= */

export async function createClientSiteAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationMember();

  const clientId =
    cleanString(
      formData.get(
        "clientId",
      ),
    );

  const name =
    cleanString(
      formData.get("name"),
    );

  const fullAddress =
    optionalString(
      formData.get(
        "fullAddress",
      ),
    );

  const postcode =
    normalisePostcode(
      formData.get("postcode"),
    );

  const contactName =
    optionalString(
      formData.get(
        "contactName",
      ),
    );

  const contactEmail =
    optionalString(
      formData.get(
        "contactEmail",
      ),
    );

  const contactTelephone =
    optionalString(
      formData.get(
        "contactTelephone",
      ),
    );

  const notes =
    optionalString(
      formData.get("notes"),
    );

  if (!clientId) {
    redirect(
      "/home/clients?error=missing_client",
    );
  }

  const client =
    await getClient(
      context.organisationId,
      clientId,
    );

  if (!client) {
    redirect(
      "/home/clients?error=client_not_found",
    );
  }

  if (!name) {
    redirectClientError(
      clientId,
      "site_name_required",
    );
  }

  /* =======================================================
     SITE NAME UNIQUE WITHIN CLIENT
  ======================================================= */

  const duplicate =
    await database.query.counterpartySites.findFirst({
      where: and(
        eq(
          counterpartySites.counterpartyId,
          clientId,
        ),

        eq(
          counterpartySites.name,
          name,
        ),
      ),

      columns: {
        id: true,
      },
    });

  if (duplicate) {
    redirectClientError(
      clientId,
      "duplicate_site_name",
    );
  }

  /* =======================================================
     FIRST ACTIVE SITE BECOMES DEFAULT
  ======================================================= */

  const existingDefault =
    await database.query.counterpartySites.findFirst({
      where: and(
        eq(
          counterpartySites.organisationId,
          context.organisationId,
        ),

        eq(
          counterpartySites.counterpartyId,
          clientId,
        ),

        eq(
          counterpartySites.isDefault,
          true,
        ),

        eq(
          counterpartySites.isActive,
          true,
        ),
      ),

      columns: {
        id: true,
      },
    });

  await database
    .insert(
      counterpartySites,
    )
    .values({
      organisationId:
        context.organisationId,

      counterpartyId:
        clientId,

      name,

      /*
        In the current Waste X workflow a Client Site is the
        origin / producer location for incoming waste.
      */
      siteType:
        "producer_site",

      fullAddress,
      postcode,

      contactName,
      contactEmail,
      contactTelephone,

      isDefault:
        !existingDefault,

      isActive: true,

      notes,

      createdAt:
        new Date(),

      updatedAt:
        new Date(),
    });

  revalidatePath(
    "/home/clients",
  );

  revalidatePath(
    `/home/clients/${clientId}`,
  );

  redirectClientSuccess(
    clientId,
    "site_created",
  );
}

/* =========================================================
   UPDATE CLIENT SITE
========================================================= */

export async function updateClientSiteAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationMember();

  const clientId =
    cleanString(
      formData.get(
        "clientId",
      ),
    );

  const siteId =
    cleanString(
      formData.get(
        "siteId",
      ),
    );

  const name =
    cleanString(
      formData.get("name"),
    );

  const fullAddress =
    optionalString(
      formData.get(
        "fullAddress",
      ),
    );

  const postcode =
    normalisePostcode(
      formData.get("postcode"),
    );

  const contactName =
    optionalString(
      formData.get(
        "contactName",
      ),
    );

  const contactEmail =
    optionalString(
      formData.get(
        "contactEmail",
      ),
    );

  const contactTelephone =
    optionalString(
      formData.get(
        "contactTelephone",
      ),
    );

  const notes =
    optionalString(
      formData.get("notes"),
    );

  if (
    !clientId ||
    !siteId
  ) {
    redirect(
      "/home/clients?error=missing_site_context",
    );
  }

  const client =
    await getClient(
      context.organisationId,
      clientId,
    );

  if (!client) {
    redirect(
      "/home/clients?error=client_not_found",
    );
  }

  if (!name) {
    redirectClientError(
      clientId,
      "site_name_required",
    );
  }

  const existing =
    await database.query.counterpartySites.findFirst({
      where: and(
        eq(
          counterpartySites.id,
          siteId,
        ),

        eq(
          counterpartySites.counterpartyId,
          clientId,
        ),

        eq(
          counterpartySites.organisationId,
          context.organisationId,
        ),
      ),
    });

  if (!existing) {
    redirectClientError(
      clientId,
      "site_not_found",
    );
  }

  const duplicate =
    await database.query.counterpartySites.findFirst({
      where: and(
        eq(
          counterpartySites.counterpartyId,
          clientId,
        ),

        eq(
          counterpartySites.name,
          name,
        ),

        ne(
          counterpartySites.id,
          siteId,
        ),
      ),

      columns: {
        id: true,
      },
    });

  if (duplicate) {
    redirectClientError(
      clientId,
      "duplicate_site_name",
    );
  }

  await database
    .update(
      counterpartySites,
    )
    .set({
      name,

      siteType:
        "producer_site",

      fullAddress,
      postcode,

      contactName,
      contactEmail,
      contactTelephone,

      notes,

      updatedAt:
        new Date(),
    })
    .where(
      and(
        eq(
          counterpartySites.id,
          siteId,
        ),

        eq(
          counterpartySites.counterpartyId,
          clientId,
        ),

        eq(
          counterpartySites.organisationId,
          context.organisationId,
        ),
      ),
    );

  revalidatePath(
    `/home/clients/${clientId}`,
  );

  redirectClientSuccess(
    clientId,
    "site_updated",
  );
}

/* =========================================================
   SET DEFAULT CLIENT SITE
========================================================= */

export async function setDefaultClientSiteAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationMember();

  const clientId =
    cleanString(
      formData.get(
        "clientId",
      ),
    );

  const siteId =
    cleanString(
      formData.get(
        "siteId",
      ),
    );

  if (
    !clientId ||
    !siteId
  ) {
    redirect(
      "/home/clients?error=missing_site_context",
    );
  }

  const selectedSite =
    await database.query.counterpartySites.findFirst({
      where: and(
        eq(
          counterpartySites.id,
          siteId,
        ),

        eq(
          counterpartySites.counterpartyId,
          clientId,
        ),

        eq(
          counterpartySites.organisationId,
          context.organisationId,
        ),
      ),
    });

  if (
    !selectedSite ||
    !selectedSite.isActive
  ) {
    redirectClientError(
      clientId,
      "site_not_available",
    );
  }

  await database.transaction(
    async (tx) => {
      await tx
        .update(
          counterpartySites,
        )
        .set({
          isDefault:
            false,

          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              counterpartySites.organisationId,
              context.organisationId,
            ),

            eq(
              counterpartySites.counterpartyId,
              clientId,
            ),
          ),
        );

      await tx
        .update(
          counterpartySites,
        )
        .set({
          isDefault: true,
          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              counterpartySites.id,
              siteId,
            ),

            eq(
              counterpartySites.counterpartyId,
              clientId,
            ),
          ),
        );
    },
  );

  revalidatePath(
    `/home/clients/${clientId}`,
  );

  redirectClientSuccess(
    clientId,
    "default_site_updated",
  );
}

/* =========================================================
   ARCHIVE CLIENT SITE
========================================================= */

export async function archiveClientSiteAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationMember();

  const clientId =
    cleanString(
      formData.get(
        "clientId",
      ),
    );

  const siteId =
    cleanString(
      formData.get(
        "siteId",
      ),
    );

  if (
    !clientId ||
    !siteId
  ) {
    redirect(
      "/home/clients?error=missing_site_context",
    );
  }

  const selectedSite =
    await database.query.counterpartySites.findFirst({
      where: and(
        eq(
          counterpartySites.id,
          siteId,
        ),

        eq(
          counterpartySites.counterpartyId,
          clientId,
        ),

        eq(
          counterpartySites.organisationId,
          context.organisationId,
        ),
      ),
    });

  if (!selectedSite) {
    redirectClientError(
      clientId,
      "site_not_found",
    );
  }

  await database.transaction(
    async (tx) => {
      await tx
        .update(
          counterpartySites,
        )
        .set({
          isActive: false,
          isDefault: false,

          updatedAt:
            new Date(),
        })
        .where(
          eq(
            counterpartySites.id,
            siteId,
          ),
        );

      /*
        If the archived site was the default, automatically
        promote another active site rather than leaving the
        client in a broken state.
      */

      if (
        selectedSite.isDefault
      ) {
        const replacement =
          await tx.query.counterpartySites.findFirst({
            where: and(
              eq(
                counterpartySites.organisationId,
                context.organisationId,
              ),

              eq(
                counterpartySites.counterpartyId,
                clientId,
              ),

              eq(
                counterpartySites.isActive,
                true,
              ),

              ne(
                counterpartySites.id,
                siteId,
              ),
            ),
          });

        if (replacement) {
          await tx
            .update(
              counterpartySites,
            )
            .set({
              isDefault:
                true,

              updatedAt:
                new Date(),
            })
            .where(
              eq(
                counterpartySites.id,
                replacement.id,
              ),
            );
        }
      }
    },
  );

  revalidatePath(
    `/home/clients/${clientId}`,
  );

  redirectClientSuccess(
    clientId,
    "site_archived",
  );
}

/* =========================================================
   RESTORE CLIENT SITE
========================================================= */

export async function restoreClientSiteAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationMember();

  const clientId =
    cleanString(
      formData.get(
        "clientId",
      ),
    );

  const siteId =
    cleanString(
      formData.get(
        "siteId",
      ),
    );

  if (
    !clientId ||
    !siteId
  ) {
    redirect(
      "/home/clients?error=missing_site_context",
    );
  }

  const site =
    await database.query.counterpartySites.findFirst({
      where: and(
        eq(
          counterpartySites.id,
          siteId,
        ),

        eq(
          counterpartySites.counterpartyId,
          clientId,
        ),

        eq(
          counterpartySites.organisationId,
          context.organisationId,
        ),
      ),
    });

  if (!site) {
    redirectClientError(
      clientId,
      "site_not_found",
    );
  }

  const currentDefault =
    await database.query.counterpartySites.findFirst({
      where: and(
        eq(
          counterpartySites.organisationId,
          context.organisationId,
        ),

        eq(
          counterpartySites.counterpartyId,
          clientId,
        ),

        eq(
          counterpartySites.isDefault,
          true,
        ),

        eq(
          counterpartySites.isActive,
          true,
        ),
      ),

      columns: {
        id: true,
      },
    });

  await database
    .update(
      counterpartySites,
    )
    .set({
      isActive: true,

      isDefault:
        !currentDefault,

      updatedAt:
        new Date(),
    })
    .where(
      eq(
        counterpartySites.id,
        siteId,
      ),
    );

  revalidatePath(
    `/home/clients/${clientId}`,
  );

  redirectClientSuccess(
    clientId,
    "site_restored",
  );
}