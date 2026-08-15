// src/app/home/settings/data-readiness/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";

import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";

import {
  getSoloMasterData,
} from "@/modules/master-data/core/getSoloMasterData";
import {
  getStage2Readiness,
  type ReadinessState,
} from "@/modules/master-data/core/getStage2Readiness";

/* =========================================================
   STAGE 2.8 — DATA READINESS
   ---------------------------------------------------------
   Admin/setup readiness screen that proves the master-data
   layer is connected for Stage 3 Book a Job.
========================================================= */

export default async function DataReadinessPage() {
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
    redirect(
      "/home?reason=account_unavailable",
    );
  }

  if (
    currentUser.role !==
      "administrator" &&
    currentUser.role !==
      "seniorManagement" &&
    currentUser.role !==
      "platform_admin"
  ) {
    redirect(
      "/home?reason=unauthorised",
    );
  }

  const data =
    await getSoloMasterData(
      currentUser.organisationId,
    );

  const readiness =
    getStage2Readiness(data);

  const defaultClientSite =
    data.clientSites.find(
      (site) => site.isDefault,
    ) ?? data.clientSites[0] ?? null;

  const sampleClient =
    defaultClientSite
      ? data.clients.find(
          (client) =>
            client.id ===
            defaultClientSite.counterpartyId,
        ) ?? null
      : data.clients[0] ?? null;

  const sampleMaterial =
    data.materials.find(
      (material) =>
        material.isFavourite,
    ) ?? data.materials[0] ?? null;

  const sampleOwnDriver =
    data.drivers.find(
      (driver) => driver.haulierCounterpartyId === null,
    ) ?? null;

  const sampleOwnVehicle =
    sampleOwnDriver?.defaultVehicleId
      ? data.vehicles.find(
          (vehicle) =>
            vehicle.id === sampleOwnDriver.defaultVehicleId &&
            vehicle.haulierCounterpartyId === null,
        ) ??
        data.vehicles.find(
          (vehicle) => vehicle.haulierCounterpartyId === null,
        ) ??
        null
      : data.vehicles.find(
          (vehicle) => vehicle.haulierCounterpartyId === null,
        ) ?? null;

  const sampleHaulier = data.hauliers[0] ?? null;

  const sampleExternalDriver = sampleHaulier
    ? data.drivers.find(
        (driver) => driver.haulierCounterpartyId === sampleHaulier.id,
      ) ?? null
    : null;

  const sampleExternalVehicle =
    sampleExternalDriver?.defaultVehicleId
      ? data.vehicles.find(
          (vehicle) =>
            vehicle.id === sampleExternalDriver.defaultVehicleId &&
            vehicle.haulierCounterpartyId === sampleHaulier?.id,
        ) ??
        data.vehicles.find(
          (vehicle) => vehicle.haulierCounterpartyId === sampleHaulier?.id,
        ) ??
        null
      : data.vehicles.find(
          (vehicle) => vehicle.haulierCounterpartyId === sampleHaulier?.id,
        ) ?? null;

  const sampleUsesOwnTransport = Boolean(sampleOwnDriver || sampleOwnVehicle);
  const sampleDriver = sampleUsesOwnTransport ? sampleOwnDriver : sampleExternalDriver;
  const sampleVehicle = sampleUsesOwnTransport ? sampleOwnVehicle : sampleExternalVehicle;

  const sampleClientRate =
    sampleClient && sampleMaterial
      ? data.rates.find(
          (rate) =>
            rate.rateType ===
              "customer_charge" &&
            rate.counterpartyId ===
              sampleClient.id &&
            rate.materialProfileId ===
              sampleMaterial.id,
        ) ??
        data.rates.find(
          (rate) =>
            rate.rateType ===
              "customer_charge" &&
            rate.counterpartyId ===
              sampleClient.id,
        ) ??
        data.rates.find(
          (rate) =>
            rate.rateType ===
            "customer_charge",
        ) ??
        null
      : null;

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">
        {/* =================================================
            HEADER
        ================================================= */}

        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
                Stage 2.8 · Integration Check
              </p>

              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Solo Data Readiness
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                One screen to prove the reusable
                business-data layer is connected
                before Waste X starts creating
                Jobs and Loads.
              </p>
            </div>

            <div
              className={
                readiness.readyForBookJob
                  ? "rounded-2xl border border-green-400/20 bg-green-400/10 px-5 py-4"
                  : "rounded-2xl border border-orange-400/20 bg-orange-400/10 px-5 py-4"
              }
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                Book a Job readiness
              </p>

              <p className="mt-1 text-lg font-semibold">
                {readiness.readyForBookJob
                  ? "READY ✓"
                  : `${readiness.blockingFailures.length} blocking item${
                      readiness.blockingFailures.length === 1
                        ? ""
                        : "s"
                    }`}
              </p>
            </div>
          </div>
        </section>

        {/* =================================================
            WHAT THIS CHECK MEANS
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
            The test
          </p>

          <h2 className="mt-2 text-2xl font-semibold">
            Can Waste X assemble a job without retyping master data?
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <FlowStep
              number="01"
              title="Who"
              value={
                sampleClient?.name ??
                "Client missing"
              }
            />

            <FlowStep
              number="02"
              title="Where from"
              value={
                defaultClientSite?.name ??
                "Client site missing"
              }
            />

            <FlowStep
              number="03"
              title="What"
              value={
                sampleMaterial?.name ??
                "Material missing"
              }
            />

            <FlowStep
              number="04"
              title="Where to"
              value={
                data.receivingSite?.name ??
                "Receiving site missing"
              }
            />
          </div>
        </section>

        {/* =================================================
            CHECKS
        ================================================= */}

        <section className="grid gap-4 lg:grid-cols-2">
          {readiness.checks.map(
            (check) => (
              <Link
                key={check.key}
                href={check.href}
                className="rounded-[1.75rem] border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300"
              >
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-black">
                        {check.label}
                      </h2>

                      {check.blocking && (
                        <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase text-black/45">
                          Required
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-sm leading-6 text-black/45">
                      {check.detail}
                    </p>
                  </div>

                  <StatePill
                    state={check.state}
                  />
                </div>
              </Link>
            ),
          )}
        </section>

        {/* =================================================
            REUSE PREVIEW
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
            Stage 3 preview
          </p>

          <h2 className="mt-2 text-2xl font-semibold">
            Data Waste X can already reuse
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
            This is not a Job yet. It is a proof
            that the selectors and defaults Stage
            3 needs already exist in one connected
            data layer.
          </p>

          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PreviewField
              label="Client"
              value={
                sampleClient?.name ??
                "—"
              }
            />

            <PreviewField
              label="Client site"
              value={
                defaultClientSite
                  ? `${defaultClientSite.name}${
                      defaultClientSite.postcode
                        ? ` · ${defaultClientSite.postcode}`
                        : ""
                    }`
                  : "—"
              }
            />

            <PreviewField
              label="Material"
              value={
                sampleMaterial
                  ? `${sampleMaterial.name} · ${formatEwcCode(
                      sampleMaterial.ewcCode,
                    )}`
                  : "—"
              }
            />

            <PreviewField
              label="Transport"
              value={
                sampleUsesOwnTransport
                  ? "Own transport"
                  : sampleHaulier
                    ? `${sampleHaulier.name}${
                        sampleHaulier.carrierRegistrationNumber
                          ? ` · ${sampleHaulier.carrierRegistrationNumber}`
                          : ""
                      }`
                    : "Choose own transport or add an external haulier"
              }
            />

            <PreviewField
              label="Driver"
              value={
                sampleDriver?.name ??
                "Assign later"
              }
            />

            <PreviewField
              label="Vehicle"
              value={
                sampleVehicle?.registrationNumber ??
                "Assign later"
              }
            />

            <PreviewField
              label="Destination"
              value={
                data.receivingSite?.name ??
                "—"
              }
            />

            <PreviewField
              label="Permit"
              value={
                data.primaryPermit?.permitNumber ??
                "—"
              }
            />

            <PreviewField
              label="Reusable rate"
              value={
                sampleClientRate
                  ? `${formatMoney(
                      sampleClientRate.amount,
                      sampleClientRate.currency,
                    )} / ${sampleClientRate.unit}`
                  : "No matching example rate"
              }
            />
          </div>
        </section>

        {/* =================================================
            DIAGNOSTICS
        ================================================= */}

        {readiness.warningChecks.length > 0 && (
          <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
              Warnings
            </p>

            <h2 className="mt-2 text-xl font-semibold text-black">
              Not blockers, but clean these up
            </h2>

            <div className="mt-5 space-y-3">
              {readiness.warningChecks.map(
                (check) => (
                  <div
                    key={check.key}
                    className="rounded-2xl bg-white px-5 py-4"
                  >
                    <p className="font-semibold">
                      {check.label}
                    </p>

                    <p className="mt-1 text-sm leading-6 text-black/45">
                      {check.detail}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        )}

        {/* =================================================
            RESULT
        ================================================= */}

        <section
          className={
            readiness.readyForBookJob
              ? "rounded-[2rem] border border-green-200 bg-green-50 p-8"
              : "rounded-[2rem] border border-red-200 bg-red-50 p-8"
          }
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">
            Stage 2 result
          </p>

          <h2 className="mt-3 text-2xl font-semibold">
            {readiness.readyForBookJob
              ? "Stage 2 master data is ready for Book a Job."
              : "Finish the missing required data before Stage 3."}
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55">
            {readiness.readyForBookJob
              ? "Stage 3 can now consume Clients, Client Sites, Materials, Hauliers, Drivers, Vehicles, the Receiving Site, Permit and Rates without rebuilding those records inside the booking workflow."
              : "The readiness cards above link directly to the master-data area that needs attention."}
          </p>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   HELPERS
========================================================= */

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

function formatMoney(
  amount: string,
  currency: string,
) {
  const parsed = Number(amount);

  if (!Number.isFinite(parsed)) {
    return `${currency} ${amount}`;
  }

  return new Intl.NumberFormat(
    "en-GB",
    {
      style: "currency",
      currency,
    },
  ).format(parsed);
}

function StatePill({
  state,
}: {
  state: ReadinessState;
}) {
  const classes =
    state === "ready"
      ? "bg-green-50 text-green-700"
      : state === "warning"
        ? "bg-orange-50 text-orange-700"
        : "bg-red-50 text-red-700";

  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${classes}`}
    >
      {state === "ready"
        ? "Ready"
        : state === "warning"
          ? "Check"
          : "Missing"}
    </span>
  );
}

function FlowStep({
  number,
  title,
  value,
}: {
  number: string;
  title: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl bg-[#faf8f4] p-5">
      <span className="font-mono text-xs font-semibold text-orange-600">
        {number}
      </span>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
        {title}
      </p>

      <p className="mt-1 truncate text-sm font-semibold text-black/70">
        {value}
      </p>
    </article>
  );
}

function PreviewField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-black/5 bg-[#faf8f4] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold leading-6 text-black/65">
        {value}
      </p>
    </article>
  );
}
