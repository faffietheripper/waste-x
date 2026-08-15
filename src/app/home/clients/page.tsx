// src/app/home/clients/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
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

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  error?: string | string[];
};

/* =========================================================
   HELPERS
========================================================= */

function firstParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value)
    ? value[0] ?? ""
    : value ?? "";
}

/* =========================================================
   PAGE
========================================================= */

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
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
        organisationId: true,
      },
    });

  if (!currentUser?.organisationId) {
    redirect(
      "/home/settings/organisation",
    );
  }

  const organisationId =
    currentUser.organisationId;

  const query =
    firstParam(
      searchParams.q,
    ).trim();

  const status =
    firstParam(
      searchParams.status,
    ) || "active";

  /* =======================================================
     FILTERS
  ======================================================= */

  const filters = [
    eq(
      counterparties.organisationId,
      organisationId,
    ),

    eq(
      counterpartyRoles.role,
      "client",
    ),
  ];

  if (status === "active") {
    filters.push(
      eq(
        counterparties.isActive,
        true,
      ),
    );
  }

  if (status === "archived") {
    filters.push(
      eq(
        counterparties.isActive,
        false,
      ),
    );
  }

  if (query) {
    filters.push(
      or(
        ilike(
          counterparties.name,
          `%${query}%`,
        ),

        ilike(
          counterparties.accountReference,
          `%${query}%`,
        ),

        ilike(
          counterparties.email,
          `%${query}%`,
        ),

        ilike(
          counterparties.postcode,
          `%${query}%`,
        ),
      )!,
    );
  }

  /* =======================================================
     CLIENTS
  ======================================================= */

  const clients =
    await database
      .select({
        id:
          counterparties.id,

        name:
          counterparties.name,

        accountReference:
          counterparties.accountReference,

        email:
          counterparties.email,

        telephone:
          counterparties.telephone,

        postcode:
          counterparties.postcode,

        isActive:
          counterparties.isActive,

        updatedAt:
          counterparties.updatedAt,
      })
      .from(counterparties)

      .innerJoin(
        counterpartyRoles,
        eq(
          counterpartyRoles.counterpartyId,
          counterparties.id,
        ),
      )

      .where(
        and(...filters),
      )

      .orderBy(
        desc(
          counterparties.isActive,
        ),

        asc(
          counterparties.name,
        ),
      );

  /* =======================================================
     CLIENT SITES
  ======================================================= */

  const clientIds =
    clients.map(
      (client) => client.id,
    );

  const siteRows =
    clientIds.length > 0
      ? await database
          .select({
            id:
              counterpartySites.id,

            counterpartyId:
              counterpartySites.counterpartyId,

            name:
              counterpartySites.name,

            postcode:
              counterpartySites.postcode,

            isDefault:
              counterpartySites.isDefault,

            isActive:
              counterpartySites.isActive,
          })
          .from(
            counterpartySites,
          )
          .where(
            and(
              eq(
                counterpartySites.organisationId,
                organisationId,
              ),

              inArray(
                counterpartySites.counterpartyId,
                clientIds,
              ),
            ),
          )
      : [];

  const siteSummary =
    new Map<
      string,
      {
        active: number;
        defaultSite:
          | {
              name: string;
              postcode:
                | string
                | null;
            }
          | null;
      }
    >();

  for (const client of clients) {
    siteSummary.set(
      client.id,
      {
        active: 0,
        defaultSite: null,
      },
    );
  }

  for (const site of siteRows) {
    const summary =
      siteSummary.get(
        site.counterpartyId,
      );

    if (!summary) {
      continue;
    }

    if (site.isActive) {
      summary.active += 1;
    }

    if (
      site.isActive &&
      site.isDefault
    ) {
      summary.defaultSite = {
        name: site.name,
        postcode:
          site.postcode,
      };
    }
  }

  /* =======================================================
     COUNTS
  ======================================================= */

  const allClientRows =
    await database
      .select({
        id:
          counterparties.id,

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
        eq(
          counterparties.organisationId,
          organisationId,
        ),
      );

  const activeCount =
    allClientRows.filter(
      (client) =>
        client.isActive,
    ).length;

  const archivedCount =
    allClientRows.filter(
      (client) =>
        !client.isActive,
    ).length;

  const activeSiteCount =
    siteRows.filter(
      (site) =>
        site.isActive,
    ).length;

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">

        {/* =================================================
            HEADER
        ================================================= */}

        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
                Business Data
              </p>

              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Clients
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Store customers and
                their waste-origin sites
                once so Book a Job can
                reuse the same details
                without repetitive
                typing.
              </p>
            </div>

            <Link
              href="/home/clients/new"
              className="inline-flex shrink-0 justify-center rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              + New Client
            </Link>
          </div>
        </section>

        {/* =================================================
            STATS
        ================================================= */}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat
            label="Active clients"
            value={activeCount}
          />

          <Stat
            label="Client sites"
            value={
              activeSiteCount
            }
          />

          <Stat
            label="Archived"
            value={
              archivedCount
            }
          />
        </section>

        {/* =================================================
            SEARCH
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <form className="flex flex-col gap-4 lg:flex-row">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search client, account reference, postcode..."
              className="h-12 flex-1 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none placeholder:text-black/30 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />

            <select
              name="status"
              defaultValue={status}
              className="h-12 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm lg:w-48"
            >
              <option value="active">
                Active
              </option>

              <option value="archived">
                Archived
              </option>

              <option value="all">
                All
              </option>
            </select>

            <button
              type="submit"
              className="rounded-2xl bg-black px-6 text-sm font-semibold text-orange-400"
            >
              Search
            </button>
          </form>
        </section>

        {/* =================================================
            LIST
        ================================================= */}

        {clients.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-black/15 bg-white p-12 text-center">
            <h2 className="text-xl font-semibold text-black">
              No clients found
            </h2>

            <p className="mt-2 text-sm text-black/45">
              Add your first client and
              their job sites.
            </p>

            <Link
              href="/home/clients/new"
              className="mt-6 inline-flex rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400"
            >
              + Add Client
            </Link>
          </section>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
            <div className="divide-y divide-black/5">
              {clients.map(
                (client) => {
                  const summary =
                    siteSummary.get(
                      client.id,
                    );

                  return (
                    <Link
                      key={
                        client.id
                      }
                      href={`/home/clients/${client.id}`}
                      className="grid gap-5 px-6 py-5 transition hover:bg-orange-50/40 lg:grid-cols-[1.3fr_0.7fr_0.8fr_auto] lg:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-black">
                            {
                              client.name
                            }
                          </h2>

                          {!client.isActive && (
                            <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase text-black/45">
                              Archived
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-black/40">
                          {client.accountReference
                            ? `Account ${client.accountReference}`
                            : "No account reference"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
                          Client Sites
                        </p>

                        <p className="mt-1 text-sm font-semibold text-black/65">
                          {summary?.active ??
                            0}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
                          Default Site
                        </p>

                        <p className="mt-1 truncate text-sm text-black/60">
                          {summary?.defaultSite
                            ? `${summary.defaultSite.name}${
                                summary
                                  .defaultSite
                                  .postcode
                                  ? ` · ${summary.defaultSite.postcode}`
                                  : ""
                              }`
                            : "Not set"}
                        </p>
                      </div>

                      <span className="text-xl text-orange-500">
                        →
                      </span>
                    </Link>
                  );
                },
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function Stat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>

      <p className="mt-3 text-2xl font-semibold text-black">
        {value.toLocaleString()}
      </p>
    </article>
  );
}