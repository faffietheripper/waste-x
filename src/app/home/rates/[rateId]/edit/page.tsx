// src/app/home/rates/[rateId]/edit/page.tsx

import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { rates, users } from "@/db/schema";

import RateForm from "../../components/RateForm";
import { getRateFormOptions } from "../../lib/getRateFormOptions";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function dateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function errorMessage(error: string) {
  const messages: Record<string, string> = {
    invalid_rate_type: "Choose a valid rate type.",
    invalid_unit: "Choose a valid rate unit.",
    invalid_amount: "Enter a valid amount of zero or more.",
    invalid_start_date: "Choose a valid effective-from date.",
    invalid_end_date: "Choose a valid effective-to date.",
    end_before_start: "The effective-to date cannot be before the start date.",
    client_required: "Choose the client this customer charge applies to.",
    invalid_client: "That client is no longer available.",
    invalid_client_site: "That client site does not belong to the selected client.",
    haulier_required: "Choose the haulier this cost applies to.",
    invalid_haulier: "That haulier is no longer available.",
    external_facility_required: "Choose the external facility this tipping cost applies to.",
    invalid_external_facility: "That external facility is no longer available.",
    invalid_external_operator: "The selected facility is not linked to a valid external facility operator.",
    material_required: "Choose the material for a material-sale rate.",
    invalid_material: "That material profile is no longer available.",
    invalid_own_site: "That Waste X receiving site is no longer available.",
    invalid_counterparty: "That counterparty is no longer available.",
    overlapping_rate: "An active rate with the exact same scope and unit already overlaps this effective period.",
  };

  return messages[error] ?? "Waste X could not save this rate.";
}

export default async function EditRatePage({
  params,
  searchParams,
}: {
  params: { rateId: string };
  searchParams: { error?: string | string[] };
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

  const canEdit =
    currentUser.role === "administrator" ||
    currentUser.role === "accounts" ||
    currentUser.role === "seniorManagement";

  if (!canEdit) {
    redirect("/home/rates?error=unauthorised");
  }

  const rate = await database.query.rates.findFirst({
    where: and(
      eq(rates.id, params.rateId),
      eq(rates.organisationId, currentUser.organisationId),
    ),
  });

  if (!rate) {
    notFound();
  }

  const options = await getRateFormOptions(currentUser.organisationId);
  const error = firstParam(searchParams.error);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-6xl space-y-7">
        <section className="rounded-[2rem] bg-black p-8 text-white">
          <Link
            href={`/home/rates/${rate.id}`}
            className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400"
          >
            ← Rate
          </Link>
          <h1 className="mt-5 text-4xl font-semibold">Edit Rate</h1>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
            {errorMessage(error)}
          </div>
        )}

        <RateForm
          mode="edit"
          {...options}
          initial={{
            id: rate.id,
            rateType: rate.rateType,
            unit: rate.unit,
            amount: rate.amount,
            counterpartyId: rate.counterpartyId,
            counterpartySiteId: rate.counterpartySiteId,
            ownSiteId: rate.ownSiteId,
            materialProfileId: rate.materialProfileId,
            effectiveFrom: dateInput(rate.effectiveFrom),
            effectiveTo: dateInput(rate.effectiveTo),
            notes: rate.notes ?? "",
          }}
        />
      </div>
    </main>
  );
}
