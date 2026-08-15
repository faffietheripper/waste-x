// src/app/home/materials/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  or,
  sql,
} from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  disposalRecoveryCodes,
  ewcCodes,
  materialProfiles,
  sites,
  users,
} from "@/db/schema";

/* =========================================================
   TYPES
========================================================= */

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
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

function formatEwcCode(
  code: string,
) {
  if (code.length !== 6) {
    return code;
  }

  return `${code.slice(
    0,
    2,
  )} ${code.slice(
    2,
    4,
  )} ${code.slice(4, 6)}`;
}

/* =========================================================
   PAGE
========================================================= */

export default async function MaterialsPage({
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
        id: true,
        organisationId: true,
        role: true,
      },
    });

  if (!currentUser?.organisationId) {
    redirect(
      "/home/settings/organisation?reason=no-organisation",
    );
  }

  const organisationId =
    currentUser.organisationId;

  const query = firstParam(
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
      materialProfiles.organisationId,
      organisationId,
    ),
  ];

  if (status === "active") {
    filters.push(
      eq(
        materialProfiles.isActive,
        true,
      ),
    );
  }

  if (status === "archived") {
    filters.push(
      eq(
        materialProfiles.isActive,
        false,
      ),
    );
  }

  if (query) {
    const normalisedCode =
      query.replace(
        /[^0-9]/g,
        "",
      );

    filters.push(
      or(
        ilike(
          materialProfiles.name,
          `%${query}%`,
        ),

        ilike(
          materialProfiles.wasteDescription,
          `%${query}%`,
        ),

        ilike(
          ewcCodes.code,
          `%${normalisedCode}%`,
        ),

        ilike(
          ewcCodes.description,
          `%${query}%`,
        ),
      )!,
    );
  }

  /* =======================================================
     PROFILES
  ======================================================= */

  const profiles =
    await database
      .select({
        id:
          materialProfiles.id,

        name:
          materialProfiles.name,

        description:
          materialProfiles.wasteDescription,

        physicalForm:
          materialProfiles.physicalForm,

        containerType:
          materialProfiles.defaultContainerType,

        containerCount:
          materialProfiles.defaultNumberOfContainers,

        containsPops:
          materialProfiles.containsPops,

        containsHazardous:
          materialProfiles.containsHazardous,

        isFavourite:
          materialProfiles.isFavourite,

        isActive:
          materialProfiles.isActive,

        ewcCode:
          ewcCodes.code,

        ewcDescription:
          ewcCodes.description,

        drCode:
          disposalRecoveryCodes.code,

        drDescription:
          disposalRecoveryCodes.description,

        siteName:
          sites.name,
      })
      .from(materialProfiles)

      .innerJoin(
        ewcCodes,
        eq(
          materialProfiles.ewcCodeId,
          ewcCodes.id,
        ),
      )

      .leftJoin(
        disposalRecoveryCodes,
        eq(
          materialProfiles.defaultDisposalRecoveryCodeId,
          disposalRecoveryCodes.id,
        ),
      )

      .leftJoin(
        sites,
        eq(
          materialProfiles.siteId,
          sites.id,
        ),
      )

      .where(
        and(...filters),
      )

      .orderBy(
        desc(
          materialProfiles.isFavourite,
        ),
        asc(
          materialProfiles.name,
        ),
      );

  /* =======================================================
     COUNTS
  ======================================================= */

  const [
    activeResult,
    favouriteResult,
    hazardousResult,
  ] = await Promise.all([
    database
      .select({
        count:
          sql<number>`count(*)`,
      })
      .from(materialProfiles)
      .where(
        and(
          eq(
            materialProfiles.organisationId,
            organisationId,
          ),
          eq(
            materialProfiles.isActive,
            true,
          ),
        ),
      ),

    database
      .select({
        count:
          sql<number>`count(*)`,
      })
      .from(materialProfiles)
      .where(
        and(
          eq(
            materialProfiles.organisationId,
            organisationId,
          ),
          eq(
            materialProfiles.isFavourite,
            true,
          ),
          eq(
            materialProfiles.isActive,
            true,
          ),
        ),
      ),

    database
      .select({
        count:
          sql<number>`count(*)`,
      })
      .from(materialProfiles)
      .where(
        and(
          eq(
            materialProfiles.organisationId,
            organisationId,
          ),
          eq(
            materialProfiles.containsHazardous,
            true,
          ),
          eq(
            materialProfiles.isActive,
            true,
          ),
        ),
      ),
  ]);

  const activeCount =
    Number(
      activeResult[0]?.count ??
        0,
    );

  const favouriteCount =
    Number(
      favouriteResult[0]?.count ??
        0,
    );

  const hazardousCount =
    Number(
      hazardousResult[0]?.count ??
        0,
    );

  const canEdit =
    currentUser.role ===
      "administrator" ||
    currentUser.role ===
      "seniorManagement";

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
                Materials
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Store the waste
                profiles your business
                handles repeatedly and
                reuse their EWC,
                descriptions, physical
                form, D/R treatment and
                DWT defaults.
              </p>
            </div>

            {canEdit && (
              <Link
                href="/home/materials/new"
                className="inline-flex shrink-0 justify-center rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                + New Material Profile
              </Link>
            )}
          </div>
        </section>

        {/* =================================================
            STATS
        ================================================= */}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat
            label="Active profiles"
            value={activeCount}
          />

          <Stat
            label="Favourites"
            value={favouriteCount}
          />

          <Stat
            label="Hazardous profiles"
            value={hazardousCount}
          />
        </section>

        {/* =================================================
            REFERENCE LINKS
        ================================================= */}

        <section className="grid gap-4 md:grid-cols-2">
          <ReferenceCard
            title="EWC Catalogue"
            description="Search the waste classification catalogue."
            href="/home/materials/ewc"
          />

          <ReferenceCard
            title="Disposal / Recovery"
            description="Browse D and R treatment operations."
            href="/home/materials/recovery-disposal"
          />
        </section>

        {/* =================================================
            SEARCH
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <form
            method="GET"
            className="flex flex-col gap-4 lg:flex-row"
          >
            <input
              name="q"
              defaultValue={query}
              placeholder="Search material, EWC code, description..."
              className="h-12 flex-1 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none transition placeholder:text-black/30 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />

            <select
              name="status"
              defaultValue={status}
              className="h-12 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none lg:w-48"
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
            PROFILES
        ================================================= */}

        {profiles.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-black/15 bg-white p-12 text-center">
            <h2 className="text-xl font-semibold text-black">
              No material profiles
              yet
            </h2>

            <p className="mt-2 text-sm text-black/45">
              Create reusable waste
              information once instead
              of typing it on every job.
            </p>

            {canEdit && (
              <Link
                href="/home/materials/new"
                className="mt-6 inline-flex rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400"
              >
                Create First Profile
              </Link>
            )}
          </section>
        ) : (
          <section className="grid gap-5 xl:grid-cols-2">
            {profiles.map(
              (profile) => (
                <Link
                  key={profile.id}
                  href={`/home/materials/${profile.id}`}
                  className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold text-black">
                          {
                            profile.name
                          }
                        </h2>

                        {profile.isFavourite && (
                          <Badge>
                            Favourite
                          </Badge>
                        )}

                        {!profile.isActive && (
                          <Badge>
                            Archived
                          </Badge>
                        )}
                      </div>

                      <p className="mt-2 font-mono text-sm font-semibold text-orange-600">
                        {formatEwcCode(
                          profile.ewcCode,
                        )}

                        {profile.containsHazardous
                          ? "*"
                          : ""}
                      </p>
                    </div>

                    <span className="text-xl text-orange-500">
                      →
                    </span>
                  </div>

                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-black/50">
                    {
                      profile.description
                    }
                  </p>

                  <div className="mt-6 grid gap-3 border-t border-black/5 pt-5 sm:grid-cols-3">
                    <Mini
                      label="Form"
                      value={
                        profile.physicalForm
                      }
                    />

                    <Mini
                      label="D/R"
                      value={
                        profile.drCode ??
                        "—"
                      }
                    />

                    <Mini
                      label="Site"
                      value={
                        profile.siteName ??
                        "Organisation"
                      }
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {profile.containsHazardous && (
                      <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase text-red-700">
                        Hazardous
                      </span>
                    )}

                    {profile.containsPops && (
                      <span className="rounded-full bg-purple-50 px-3 py-1 text-[10px] font-semibold uppercase text-purple-700">
                        POPs
                      </span>
                    )}
                  </div>
                </Link>
              ),
            )}
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

function ReferenceCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-3xl border border-black/10 bg-white p-5 shadow-sm transition hover:border-orange-300"
    >
      <div>
        <p className="font-semibold text-black">
          {title}
        </p>

        <p className="mt-1 text-sm text-black/40">
          {description}
        </p>
      </div>

      <span className="text-orange-500">
        →
      </span>
    </Link>
  );
}

function Mini({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
        {label}
      </p>

      <p className="mt-1 truncate text-xs font-semibold text-black/65">
        {value}
      </p>
    </div>
  );
}

function Badge({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold uppercase text-orange-700">
      {children}
    </span>
  );
}