// src/app/home/materials/ewc/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  and,
  asc,
  eq,
  ilike,
  or,
  sql,
} from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { ewcCodes } from "@/db/schema";

import {
  formatEwcCode,
  normaliseEwcCode,
} from "@/lib/ewc";

/* =========================================================
   CONSTANTS
========================================================= */

const PAGE_SIZE = 50;

/* =========================================================
   TYPES
========================================================= */

type SearchParams = {
  q?: string | string[];
  hazardous?: string | string[];
  page?: string | string[];
};

/* =========================================================
   HELPERS
========================================================= */

function firstParam(
  value: string | string[] | undefined,
) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function buildHref(params: {
  q: string;
  hazardous: string;
  page: number;
}) {
  const search =
    new URLSearchParams();

  if (params.q) {
    search.set(
      "q",
      params.q,
    );
  }

  if (
    params.hazardous &&
    params.hazardous !== "all"
  ) {
    search.set(
      "hazardous",
      params.hazardous,
    );
  }

  if (params.page > 1) {
    search.set(
      "page",
      String(
        params.page,
      ),
    );
  }

  const query =
    search.toString();

  return query
    ? `/home/materials/ewc?${query}`
    : "/home/materials/ewc";
}

/* =========================================================
   PAGE
========================================================= */

export default async function EwcCataloguePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  /* =======================================================
     SEARCH PARAMS
  ======================================================= */

  const query =
    firstParam(
      searchParams.q,
    ).trim();

  const hazardousFilter =
    firstParam(
      searchParams.hazardous,
    ) || "all";

  const rawPage =
    Number(
      firstParam(
        searchParams.page,
      ) || "1",
    );

  const page =
    Number.isFinite(rawPage) &&
    rawPage > 0
      ? Math.floor(rawPage)
      : 1;

  const normalisedCode =
    normaliseEwcCode(
      query,
    );

  /* =======================================================
     FILTERS
  ======================================================= */

  const filters = [
    eq(
      ewcCodes.isActive,
      true,
    ),
  ];

  if (query) {
    const textSearch =
      `%${query}%`;

    /*
     * Text conditions always remain available.
     *
     * If somebody searches "soil", normaliseEwcCode("soil")
     * returns an empty string. We must NOT turn that into:
     *
     *   ewcCodes.code ILIKE '%%'
     *
     * because that would make every EWC row match.
     */
    const searchConditions = [
      ilike(
        ewcCodes.description,
        textSearch,
      ),

      ilike(
        ewcCodes.chapterDescription,
        textSearch,
      ),

      ilike(
        ewcCodes.subChapterDescription,
        textSearch,
      ),

      ilike(
        ewcCodes.entryType,
        textSearch,
      ),
    ];

    /*
     * Only include the canonical code condition if the query
     * contains numeric EWC data.
     *
     * Examples:
     *
     * 17 05 04   -> 170504
     * 170504     -> 170504
     * 17-05-04   -> 170504
     * 17 05 03*  -> 170503
     */
    if (
      normalisedCode.length > 0
    ) {
      searchConditions.unshift(
        ilike(
          ewcCodes.code,
          `%${normalisedCode}%`,
        ),
      );
    }

    filters.push(
      or(
        ...searchConditions,
      )!,
    );
  }

  if (
    hazardousFilter === "yes"
  ) {
    filters.push(
      eq(
        ewcCodes.isHazardous,
        true,
      ),
    );
  }

  if (
    hazardousFilter === "no"
  ) {
    filters.push(
      eq(
        ewcCodes.isHazardous,
        false,
      ),
    );
  }

  const where =
    and(
      ...filters,
    );

  /* =======================================================
     DATA
  ======================================================= */

  const [
    records,
    totalResult,
    hazardousResult,
  ] = await Promise.all([
    database
      .select()
      .from(ewcCodes)
      .where(where)
      .orderBy(
        asc(
          ewcCodes.code,
        ),
      )
      .limit(
        PAGE_SIZE,
      )
      .offset(
        (page - 1) *
          PAGE_SIZE,
      ),

    database
      .select({
        count:
          sql<number>`count(*)`,
      })
      .from(ewcCodes)
      .where(where),

    database
      .select({
        count:
          sql<number>`count(*)`,
      })
      .from(ewcCodes)
      .where(
        and(
          eq(
            ewcCodes.isActive,
            true,
          ),

          eq(
            ewcCodes.isHazardous,
            true,
          ),
        ),
      ),
  ]);

  const total =
    Number(
      totalResult[0]
        ?.count ?? 0,
    );

  const hazardousCount =
    Number(
      hazardousResult[0]
        ?.count ?? 0,
    );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total /
          PAGE_SIZE,
      ),
    );

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

          <div className="relative">
            <Link
              href="/home/materials"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400 transition hover:text-orange-300"
            >
              ← Materials
            </Link>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight">
              EWC Catalogue
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Search Waste X waste
              classification reference
              records by six-digit code,
              description or waste
              category.
            </p>
          </div>
        </section>

        {/* =================================================
            STATS
        ================================================= */}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat
            label="Matching codes"
            value={total}
          />

          <Stat
            label="Hazardous catalogue entries"
            value={
              hazardousCount
            }
          />

          <Stat
            label="Page"
            value={`${page} / ${totalPages}`}
          />
        </section>

        {/* =================================================
            SEARCH
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <form
            method="GET"
            className="flex flex-col gap-4 xl:flex-row"
          >
            <div className="flex-1">
              <label
                htmlFor="q"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-black/40"
              >
                Search
              </label>

              <input
                id="q"
                name="q"
                defaultValue={
                  query
                }
                placeholder="Try 17 09 04, soil, concrete, wood..."
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <div className="xl:w-56">
              <label
                htmlFor="hazardous"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-black/40"
              >
                Hazardous
              </label>

              <select
                id="hazardous"
                name="hazardous"
                defaultValue={
                  hazardousFilter
                }
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none focus:border-orange-400"
              >
                <option value="all">
                  All entries
                </option>

                <option value="no">
                  Non-hazardous
                </option>

                <option value="yes">
                  Hazardous
                </option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="h-12 rounded-2xl bg-black px-6 text-sm font-semibold text-orange-400 transition hover:bg-black/85"
              >
                Search
              </button>

              {(query ||
                hazardousFilter !==
                  "all") && (
                <Link
                  href="/home/materials/ewc"
                  className="grid h-12 place-items-center rounded-2xl border border-black/10 px-5 text-sm font-semibold text-black/55 transition hover:bg-black/5"
                >
                  Clear
                </Link>
              )}
            </div>
          </form>
        </section>

        {/* =================================================
            RESULTS
        ================================================= */}

        <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-black/10 px-6 py-5">
            <div>
              <p className="text-sm font-semibold text-black">
                Waste classification
                codes
              </p>

              <p className="mt-1 text-xs text-black/40">
                {total.toLocaleString()}{" "}
                matching records
              </p>
            </div>

            <span className="rounded-full bg-orange-50 px-3 py-1.5 text-[11px] font-semibold text-orange-700">
              Read-only reference data
            </span>
          </div>

          {records.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-lg font-semibold text-black">
                No EWC codes found
              </p>

              <p className="mt-2 text-sm text-black/45">
                Try another code or
                description.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {records.map(
                (
                  record,
                ) => (
                  <article
                    key={
                      record.id
                    }
                    className="grid gap-5 px-6 py-5 transition hover:bg-orange-50/40 lg:grid-cols-[170px_1fr_180px]"
                  >
                    <div>
                      <p className="font-mono text-lg font-semibold tracking-wide text-black">
                        {formatEwcCode(
                          record.code,
                          record.isHazardous ===
                            true,
                        )}
                      </p>

                      <p className="mt-1 text-xs text-black/35">
                        {
                          record.entryType
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-semibold leading-6 text-black">
                        {
                          record.description
                        }
                      </p>

                      {record.subChapterDescription && (
                        <p className="mt-2 text-xs leading-5 text-black/40">
                          {
                            record.subChapterDescription
                          }
                        </p>
                      )}

                      {record.chapterDescription && (
                        <p className="mt-1 text-[11px] leading-5 text-black/30">
                          Chapter{" "}
                          {
                            record.chapterCode
                          }{" "}
                          ·{" "}
                          {
                            record.chapterDescription
                          }
                        </p>
                      )}
                    </div>

                    <div className="lg:text-right">
                      <HazardBadge
                        hazardous={
                          record.isHazardous ===
                          true
                        }
                      />
                    </div>
                  </article>
                ),
              )}
            </div>
          )}

          {/* ===============================================
              PAGINATION
          =============================================== */}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-black/10 px-6 py-5">
              <div>
                {page > 1 ? (
                  <Link
                    href={buildHref({
                      q: query,
                      hazardous:
                        hazardousFilter,
                      page:
                        page - 1,
                    })}
                    className="inline-flex rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-black/60 transition hover:bg-black/5"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
              </div>

              <span className="text-xs font-medium text-black/40">
                Page {page} of{" "}
                {totalPages}
              </span>

              <div>
                {page <
                totalPages ? (
                  <Link
                    href={buildHref({
                      q: query,
                      hazardous:
                        hazardousFilter,
                      page:
                        page + 1,
                    })}
                    className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-orange-400 transition hover:bg-black/85"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   STAT
========================================================= */

function Stat({
  label,
  value,
}: {
  label: string;
  value:
    | number
    | string;
}) {
  return (
    <article className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>

      <p className="mt-3 text-2xl font-semibold text-black">
        {typeof value ===
        "number"
          ? value.toLocaleString()
          : value}
      </p>
    </article>
  );
}

/* =========================================================
   HAZARD BADGE
========================================================= */

function HazardBadge({
  hazardous,
}: {
  hazardous: boolean;
}) {
  if (hazardous) {
    return (
      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-700">
        Hazardous
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-green-700">
      Non-hazardous
    </span>
  );
}