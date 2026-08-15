// src/app/home/rates/[rateId]/page.tsx

import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

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

import {
  archiveRateAction,
  restoreRateAction,
} from "../actions";

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

function formatDate(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(value)
    : "Open ended";
}

function timingStatus(from: Date | null, to: Date | null) {
  const now = new Date();

  if (from && from > now) {
    return "Upcoming";
  }

  if (to && to < now) {
    return "Expired";
  }

  return "Current";
}

export default async function RateDetailPage({
  params,
  searchParams,
}: {
  params: { rateId: string };
  searchParams: {
    success?: string | string[];
    error?: string | string[];
  };
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
    redirect("/home");
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
      counterpartySitePostcode: counterpartySites.postcode,
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
    .where(
      and(
        eq(rates.id, params.rateId),
        eq(rates.organisationId, currentUser.organisationId),
      ),
    )
    .limit(1);

  const rate = rows[0];

  if (!rate) {
    notFound();
  }

  const success = firstParam(searchParams.success);
  const error = firstParam(searchParams.error);
  const canEdit =
    currentUser.role === "administrator" ||
    currentUser.role === "accounts" ||
    currentUser.role === "seniorManagement";

  const successMessage =
    success === "created"
      ? "Rate created."
      : success === "updated"
        ? "Rate updated."
        : success === "archived"
          ? "Rate archived."
          : success === "restored"
            ? "Rate restored."
            : "Changes saved.";

  const errorMessage =
    error === "conflict_active_rate"
      ? "This rate cannot be restored because another active rate with the exact same scope and unit overlaps its effective period."
      : "Something went wrong.";

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-6xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <Link
                href="/home/rates"
                className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400"
              >
                ← Rates
              </Link>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-semibold">
                  {rateTypeLabel(rate.rateType)}
                </h1>
                {!rate.isActive && (
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase text-white/60">
                    Archived
                  </span>
                )}
              </div>

              <p className="mt-4 text-3xl font-semibold text-orange-400">
                £{Number(rate.amount).toFixed(2)}
                <span className="ml-2 text-sm font-medium text-white/45">
                  / {unitLabel(rate.unit)}
                </span>
              </p>
            </div>

            {canEdit && (
              <Link
                href={`/home/rates/${rate.id}/edit`}
                className="inline-flex justify-center rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black"
              >
                Edit Rate
              </Link>
            )}
          </div>
        </section>

        {success && (
          <Message tone="success">{successMessage}</Message>
        )}

        {error && <Message tone="error">{errorMessage}</Message>}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Status" value={rate.isActive ? "Active" : "Archived"} />
          <Stat label="Timing" value={timingStatus(rate.effectiveFrom, rate.effectiveTo)} />
          <Stat label="Currency" value={rate.currency} />
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
            Scope
          </p>
          <h2 className="mt-2 text-xl font-semibold">Commercial rule</h2>

          <div className="mt-7 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            <Detail label="Rate type" value={rateTypeLabel(rate.rateType)} />
            <Detail label="Unit" value={`Per ${unitLabel(rate.unit)}`} />
            <Detail label="Amount" value={`£${Number(rate.amount).toFixed(2)}`} />
            <Detail label="Counterparty" value={rate.counterpartyName ?? "Any / not specified"} />
            <Detail
              label="Counterparty site"
              value={
                rate.counterpartySiteName
                  ? `${rate.counterpartySiteName}${
                      rate.counterpartySitePostcode
                        ? ` · ${rate.counterpartySitePostcode}`
                        : ""
                    }`
                  : "All / not specified"
              }
            />
            <Detail label="Material" value={rate.materialName ?? "All materials"} />
            <Detail label="Your site" value={rate.ownSiteName ?? "All own sites"} />
            <Detail label="Effective from" value={formatDate(rate.effectiveFrom)} />
            <Detail label="Effective to" value={formatDate(rate.effectiveTo)} />
          </div>
        </section>

        {rate.notes && (
          <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
            <Detail label="Internal notes" value={rate.notes} />
          </section>
        )}

        <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
            Historical safety
          </p>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-black/60">
            Editing this master rate later will not be allowed to rewrite a
            completed movement. Stage 4 snapshots the commercial amounts onto
            each load when the operational transaction is recorded.
          </p>
        </section>

        {canEdit && (
          <section className="flex flex-wrap gap-3 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            {rate.isActive ? (
              <form action={archiveRateAction}>
                <input type="hidden" name="rateId" value={rate.id} />
                <button
                  type="submit"
                  className="rounded-2xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-700"
                >
                  Archive Rate
                </button>
              </form>
            ) : (
              <form action={restoreRateAction}>
                <input type="hidden" name="rateId" value={rate.id} />
                <button
                  type="submit"
                  className="rounded-2xl border border-green-200 bg-green-50 px-6 py-3 text-sm font-semibold text-green-700"
                >
                  Restore Rate
                </button>
              </form>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>
      <p className="mt-3 truncate text-xl font-semibold text-black">{value}</p>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-black/30">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/65">
        {value}
      </p>
    </div>
  );
}

function Message({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "success"
          ? "rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-medium text-green-800"
          : "rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800"
      }
    >
      {children}
    </div>
  );
}
