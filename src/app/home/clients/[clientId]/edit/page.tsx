// src/app/home/clients/[clientId]/edit/page.tsx

import Link from "next/link";

import {
  and,
  eq,
} from "drizzle-orm";

import {
  notFound,
  redirect,
} from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  counterparties,
  counterpartyRoles,
} from "@/db/schema";

import {
  updateClientAction,
} from "../../actions";

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

function errorMessage(
  value: string,
) {
  const messages: Record<
    string,
    string
  > = {
    name_required:
      "Enter the client name.",

    invalid_payment_terms:
      "Payment terms must be a whole number of days.",

    duplicate_account_reference:
      "That account reference is already being used.",
  };

  return (
    messages[value] ??
    "Waste X could not save the client."
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: {
    clientId: string;
  };

  searchParams: {
    error?: string | string[];
  };
}) {
  const session =
    await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const rows =
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

        fullAddress:
          counterparties.fullAddress,

        postcode:
          counterparties.postcode,

        paymentTermsDays:
          counterparties.paymentTermsDays,

        notes:
          counterparties.notes,
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
          counterparties.id,
          params.clientId,
        ),
      )

      .limit(1);

  const client =
    rows[0];

  if (!client) {
    notFound();
  }

  const error =
    firstParam(
      searchParams.error,
    );

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-5xl space-y-7">

        <section className="rounded-[2rem] bg-black p-8 text-white">
          <Link
            href={`/home/clients/${client.id}`}
            className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400"
          >
            ← Client
          </Link>

          <h1 className="mt-5 text-4xl font-semibold">
            Edit {client.name}
          </h1>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
            {errorMessage(
              error,
            )}
          </div>
        )}

        <form
          action={
            updateClientAction
          }
          className="space-y-7"
        >
          <input
            type="hidden"
            name="clientId"
            value={client.id}
          />

          <Card title="Business Details">
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Client name"
                name="name"
                defaultValue={
                  client.name
                }
                required
              />

              <Field
                label="Account reference"
                name="accountReference"
                defaultValue={
                  client.accountReference ??
                  ""
                }
              />

              <Field
                label="Email"
                name="email"
                type="email"
                defaultValue={
                  client.email ??
                  ""
                }
              />

              <Field
                label="Telephone"
                name="telephone"
                defaultValue={
                  client.telephone ??
                  ""
                }
              />
            </div>
          </Card>

          <Card title="Address">
            <div className="grid gap-5 md:grid-cols-[1fr_220px]">
              <Field
                label="Business / billing address"
                name="fullAddress"
                defaultValue={
                  client.fullAddress ??
                  ""
                }
              />

              <Field
                label="Postcode"
                name="postcode"
                defaultValue={
                  client.postcode ??
                  ""
                }
              />
            </div>
          </Card>

          <Card title="Commercial Defaults">
            <div className="max-w-sm">
              <Field
                label="Payment terms (days)"
                name="paymentTermsDays"
                type="number"
                min="0"
                defaultValue={
                  client.paymentTermsDays !==
                  null
                    ? String(
                        client.paymentTermsDays,
                      )
                    : ""
                }
              />
            </div>
          </Card>

          <Card title="Internal Notes">
            <TextArea
              label="Notes"
              name="notes"
              defaultValue={
                client.notes ??
                ""
              }
            />
          </Card>

          <div className="flex justify-end gap-3">
            <Link
              href={`/home/clients/${client.id}`}
              className="rounded-2xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="rounded-2xl bg-orange-500 px-7 py-3 text-sm font-semibold text-black"
            >
              Save Client
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

const inputClass =
  "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
      <h2 className="text-xl font-semibold">
        {title}
      </h2>

      <div className="mt-6">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  min,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  min?: string;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
        {label}
      </span>

      <input
        type={type}
        name={name}
        defaultValue={
          defaultValue
        }
        required={required}
        min={min}
        className={inputClass}
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
        {label}
      </span>

      <textarea
        name={name}
        defaultValue={
          defaultValue
        }
        rows={4}
        className="w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
    </label>
  );
}