// src/app/home/rates/page.tsx
/* WASTE_X_JOB_SPECIFIC_PRICING_V2 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  or,
} from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartySites,
  materialProfiles,
  rates,
  sites,
  users,
} from "@/db/schema";

type SearchParams = {
  q?: string | string[];
  type?: string | string[];
  status?: string | string[];
  error?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function rateTypeLabel(value: string) {
  const labels: Record<string, string> = {
    customer_charge: "Customer charge",
    haulage_cost: "Haulage cost",
    tipping_cost: "External facility cost",
    material_sale: "Material sale",
    other: "Other",
  };

  return labels[value] ?? value;
}

function unitLabel(value: string) {
  return value === "tonne" ? "tonne" : value === "load" ? "load" : "job";
}

function periodStatus(from: Date | null, to: Date | null, now: Date) {
  if (from && from > now) {
    return "Upcoming";
  }

  if (to && to < now) {
    return "Expired";
  }

  return "Current";
}

function formatDate(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(value)
    : "Open";
}

export default async function RatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      organisationId: true,
      role: true,
    },
  });

  if (!currentUser?.organisationId) {
    redirect("/home/settings/organisation");
  }

  const organisationId = currentUser.organisationId;
  const query = firstParam(searchParams.q).trim();
  const type = firstParam(searchParams.type) || "all";
  const status = firstParam(searchParams.status) || "active";

  const filters = [eq(rates.organisationId, organisationId)];

  if (status === "active") {
    filters.push(eq(rates.isActive, true));
  }

  if (status === "archived") {
    filters.push(eq(rates.isActive, false));
  }

  if (
    type === "customer_charge" ||
    type === "haulage_cost" ||
    type === "tipping_cost" ||
    type === "material_sale" ||
    type === "other"
  ) {
    filters.push(eq(rates.rateType, type));
  }

  if (query) {
    filters.push(
      or(
        ilike(counterparties.name, `%${query}%`),
        ilike(counterpartySites.name, `%${query}%`),
        ilike(materialProfiles.name, `%${query}%`),
        ilike(sites.name, `%${query}%`),
        ilike(rates.notes, `%${query}%`),
      )!,
    );
  }

  const rows = await database
    .select({
      id: rates.id,
      rateType: rates.rateType,
      unit: rates.unit,
      amount: rates.amount,
      currency: rates.currency,
      effectiveFrom: rates.effectiveFrom,
      effectiveTo: rates.effectiveTo,
      isActive: rates.isActive,
      notes: rates.notes,
      counterpartyName: counterparties.name,
      counterpartySiteName: counterpartySites.name,
      materialName: materialProfiles.name,
      ownSiteName: sites.name,
    })
    .from(rates)
    .leftJoin(counterparties, eq(rates.counterpartyId, counterparties.id))
    .leftJoin(
      counterpartySites,
      eq(rates.counterpartySiteId, counterpartySites.id),
    )
    .leftJoin(
      materialProfiles,
      eq(rates.materialProfileId, materialProfiles.id),
    )
    .leftJoin(sites, eq(rates.ownSiteId, sites.id))
    .where(and(...filters))
    .orderBy(desc(rates.isActive), asc(rates.rateType), asc(counterparties.name));

  const allRates = await database
    .select({
      rateType: rates.rateType,
      isActive: rates.isActive,
      effectiveFrom: rates.effectiveFrom,
      effectiveTo: rates.effectiveTo,
    })
    .from(rates)
    .where(eq(rates.organisationId, organisationId));

  const now = new Date();
  const activeRates = allRates.filter((rate) => rate.isActive);
  const currentRates = activeRates.filter(
    (rate) => periodStatus(rate.effectiveFrom, rate.effectiveTo, now) === "Current",
  );
  const customerRates = activeRates.filter(
    (rate) => rate.rateType === "customer_charge",
  );
  const costRates = activeRates.filter(
    (rate) =>
      rate.rateType === "haulage_cost" || rate.rateType === "tipping_cost",
  );

  const canEdit =
    currentUser.role === "administrator" ||
    currentUser.role === "accounts" ||
    currentUser.role === "seniorManagement";

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
                Business Data
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Rate Library</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Keep useful customer, haulage, facility and material-sale prices
                as history and booking suggestions. Every Job can still have its own
                custom commercial terms, and the Job always wins.
              </p>
            </div>

            {canEdit && (
              <Link
                href="/home/rates/new"
                className="inline-flex shrink-0 justify-center rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                + New Rate
              </Link>
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Current rates" value={currentRates.length} />
          <Stat label="Customer charges" value={customerRates.length} />
          <Stat label="Haulage + facility costs" value={costRates.length} />
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <form className="grid gap-4 lg:grid-cols-[1fr_220px_180px_auto]">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search client, haulier, facility, material..."
              className="h-12 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none placeholder:text-black/30 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />

            <select
              name="type"
              defaultValue={type}
              className="h-12 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm"
            >
              <option value="all">All rate types</option>
              <option value="customer_charge">Customer charges</option>
              <option value="haulage_cost">Haulage costs</option>
              <option value="tipping_cost">External facility costs</option>
              <option value="material_sale">Material sales</option>
              <option value="other">Other</option>
            </select>

            <select
              name="status"
              defaultValue={status}
              className="h-12 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>

            <button
              type="submit"
              className="rounded-2xl bg-black px-6 text-sm font-semibold text-orange-400"
            >
              Search
            </button>
          </form>
        </section>

        {rows.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-black/15 bg-white p-12 text-center">
            <h2 className="text-xl font-semibold">No rates found</h2>
            <p className="mt-2 text-sm text-black/45">
              Create pricing rules now so Book a Job can reuse them later.
            </p>
            {canEdit && (
              <Link
                href="/home/rates/new"
                className="mt-6 inline-flex rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400"
              >
                Create First Rate
              </Link>
            )}
          </section>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
            <div className="divide-y divide-black/5">
              {rows.map((rate) => {
                const timing = periodStatus(
                  rate.effectiveFrom,
                  rate.effectiveTo,
                  now,
                );

                const scope = [
                  rate.counterpartyName,
                  rate.counterpartySiteName,
                  rate.materialName,
                  rate.ownSiteName,
                ].filter(Boolean);

                return (
                  <Link
                    key={rate.id}
                    href={`/home/rates/${rate.id}`}
                    className="grid gap-5 px-6 py-5 transition hover:bg-orange-50/40 lg:grid-cols-[1fr_1.2fr_0.65fr_0.75fr_auto] lg:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold uppercase text-orange-700">
                          {rateTypeLabel(rate.rateType)}
                        </span>
                        {!rate.isActive && (
                          <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase text-black/45">
                            Archived
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-xl font-semibold text-black">
                        £{Number(rate.amount).toFixed(2)}
                        <span className="ml-1 text-sm font-medium text-black/35">
                          / {unitLabel(rate.unit)}
                        </span>
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
                        Applies to
                      </p>
                      <p className="mt-1 text-sm leading-6 text-black/60">
                        {scope.length > 0 ? scope.join(" · ") : "Organisation default"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
                        Timing
                      </p>
                      <p className="mt-1 text-sm font-semibold text-black/60">
                        {timing}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
                        Period
                      </p>
                      <p className="mt-1 text-xs text-black/55">
                        {formatDate(rate.effectiveFrom)} → {formatDate(rate.effectiveTo)}
                      </p>
                    </div>

                    <span className="text-xl text-orange-500">→</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
            How rates will work
          </p>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-black/60">
            A general rate can exist alongside a more specific client, site or
            material rate. Stage 3 will resolve the best applicable rate when a
            job is booked, and the load will snapshot the commercial value so
            later rate changes do not rewrite history.
          </p>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
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
