// src/app/home/materials/recovery-disposal/page.tsx

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

import {
  disposalRecoveryCodes,
} from "@/db/schema";

/* =========================================================
   TYPES
========================================================= */

type SearchParams = {
  q?: string | string[];
  type?: string | string[];
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

/* =========================================================
   PAGE
========================================================= */

export default async function RecoveryDisposalPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const query = firstParam(
    searchParams.q,
  ).trim();

  const typeFilter =
    firstParam(searchParams.type) ||
    "all";

  /* =======================================================
     FILTERS
  ======================================================= */

  const filters = [
    eq(
      disposalRecoveryCodes.isActive,
      true,
    ),
  ];

  if (query) {
    filters.push(
      or(
        ilike(
          disposalRecoveryCodes.code,
          `%${query}%`,
        ),

        ilike(
          disposalRecoveryCodes.description,
          `%${query}%`,
        ),
      )!,
    );
  }

  if (typeFilter === "recovery") {
    filters.push(
      eq(
        disposalRecoveryCodes.type,
        "recovery",
      ),
    );
  }

  if (typeFilter === "disposal") {
    filters.push(
      eq(
        disposalRecoveryCodes.type,
        "disposal",
      ),
    );
  }

  const where = and(...filters);

  /* =======================================================
     DATA
  ======================================================= */

  const [
    records,
    recoveryCountResult,
    disposalCountResult,
  ] = await Promise.all([
    database
      .select()
      .from(disposalRecoveryCodes)
      .where(where)
      .orderBy(
        asc(disposalRecoveryCodes.type),
        asc(disposalRecoveryCodes.code),
      ),

    database
      .select({
        count: sql<number>`count(*)`,
      })
      .from(disposalRecoveryCodes)
      .where(
        and(
          eq(
            disposalRecoveryCodes.isActive,
            true,
          ),

          eq(
            disposalRecoveryCodes.type,
            "recovery",
          ),
        ),
      ),

    database
      .select({
        count: sql<number>`count(*)`,
      })
      .from(disposalRecoveryCodes)
      .where(
        and(
          eq(
            disposalRecoveryCodes.isActive,
            true,
          ),

          eq(
            disposalRecoveryCodes.type,
            "disposal",
          ),
        ),
      ),
  ]);

  const recoveryCount = Number(
    recoveryCountResult[0]?.count ?? 0,
  );

  const disposalCount = Number(
    disposalCountResult[0]?.count ?? 0,
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
              Disposal / Recovery Codes
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Browse the disposal and
              recovery operations Waste X
              can attach to Material
              Profiles, loads and Digital
              Waste Tracking records.
            </p>
          </div>
        </section>

        {/* =================================================
            STATS
        ================================================= */}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat
            label="Recovery codes"
            value={recoveryCount}
          />

          <Stat
            label="Disposal codes"
            value={disposalCount}
          />

          <Stat
            label="Total"
            value={
              recoveryCount +
              disposalCount
            }
          />
        </section>

        {/* =================================================
            SEARCH / FILTER
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <form
            method="GET"
            className="flex flex-col gap-4 lg:flex-row"
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
                defaultValue={query}
                placeholder="Try R5, landfill, recycling..."
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <div className="lg:w-64">
              <label
                htmlFor="type"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-black/40"
              >
                Operation
              </label>

              <select
                id="type"
                name="type"
                defaultValue={typeFilter}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none focus:border-orange-400"
              >
                <option value="all">
                  All operations
                </option>

                <option value="recovery">
                  Recovery
                </option>

                <option value="disposal">
                  Disposal
                </option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="h-12 rounded-2xl bg-black px-6 text-sm font-semibold text-orange-400 transition hover:bg-black/85"
              >
                Filter
              </button>

              {(query ||
                typeFilter !== "all") && (
                <Link
                  href="/home/materials/recovery-disposal"
                  className="grid h-12 place-items-center rounded-2xl border border-black/10 px-5 text-sm font-semibold text-black/55 transition hover:bg-black/5"
                >
                  Clear
                </Link>
              )}
            </div>
          </form>
        </section>

        {/* =================================================
            CODES
        ================================================= */}

        <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-black/10 px-6 py-5">
            <div>
              <p className="text-sm font-semibold text-black">
                D / R Reference
              </p>

              <p className="mt-1 text-xs text-black/40">
                {records.length} matching
                operations
              </p>
            </div>

            <span className="rounded-full bg-orange-50 px-3 py-1.5 text-[11px] font-semibold text-orange-700">
              Read-only reference data
            </span>
          </div>

          {records.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-lg font-semibold text-black">
                No operations found
              </p>

              <p className="mt-2 text-sm text-black/45">
                Try another code or
                description.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {records.map(
                (record) => (
                  <article
                    key={record.id}
                    className="grid gap-4 px-6 py-5 transition hover:bg-orange-50/40 md:grid-cols-[100px_150px_1fr]"
                  >
                    <div>
                      <span className="font-mono text-xl font-bold text-black">
                        {record.code}
                      </span>
                    </div>

                    <div>
                      <OperationBadge
                        type={record.type}
                      />
                    </div>

                    <p className="text-sm leading-6 text-black/65">
                      {
                        record.description
                      }
                    </p>
                  </article>
                ),
              )}
            </div>
          )}
        </section>

        {/* =================================================
            NOTE
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
            How Waste X uses this
          </p>

          <p className="mt-3 max-w-4xl text-sm leading-6 text-black/50">
            A Material Profile can have
            a normal D/R operation stored
            as its default. The actual
            load can still override that
            value where the real
            treatment or destination
            differs.
          </p>
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

/* =========================================================
   BADGE
========================================================= */

function OperationBadge({
  type,
}: {
  type: "disposal" | "recovery";
}) {
  if (type === "recovery") {
    return (
      <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-green-700">
        Recovery
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-700">
      Disposal
    </span>
  );
}