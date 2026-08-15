import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createHaulierAction } from "../actions";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function errorMessage(key: string) {
  const messages: Record<string, string> = {
    name_required: "Enter the haulier name.",
    duplicate_haulier: "That business is already stored as a haulier.",
  };

  return messages[key] ?? "Waste X could not create the haulier.";
}

export default async function NewHaulierPage({
  searchParams,
}: {
  searchParams: { error?: string | string[] };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const error = firstParam(searchParams.error);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative">
            <Link href="/home/hauliers" className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">
              ← Hauliers
            </Link>
            <h1 className="mt-5 text-4xl font-semibold">New Haulier</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              Add the transport company once. Drivers and vehicles can then be attached to it and reused on jobs and loads.
            </p>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
            {errorMessage(error)}
          </div>
        )}

        <form action={createHaulierAction} className="space-y-7">
          <Card eyebrow="Haulier" title="Company Details">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Haulier name" name="name" placeholder="Example Haulage Ltd" required />
              <Field label="Waste carrier registration" name="carrierRegistrationNumber" placeholder="CBDU123456" />
              <Field label="Email" name="email" type="email" placeholder="operations@example.co.uk" />
              <Field label="Telephone" name="telephone" placeholder="01234..." />
            </div>
          </Card>

          <Card eyebrow="Address" title="Business Address">
            <div className="grid gap-5 md:grid-cols-[1fr_220px]">
              <Field label="Full address" name="fullAddress" placeholder="Haulier business address" />
              <Field label="Postcode" name="postcode" placeholder="IP1 1AA" />
            </div>
          </Card>

          <Card eyebrow="Internal" title="Notes">
            <TextArea label="Internal notes" name="notes" placeholder="Usual contact, booking instructions, account notes..." />
          </Card>

          <div className="flex justify-end gap-3">
            <Link href="/home/hauliers" className="rounded-2xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-black/55">
              Cancel
            </Link>
            <button type="submit" className="rounded-2xl bg-orange-500 px-7 py-3 text-sm font-semibold text-black transition hover:bg-orange-400">
              Create Haulier
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

const inputClass =
  "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function Card({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Field({ label, name, type = "text", placeholder, required = false }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span>
      <input type={type} name={name} placeholder={placeholder} required={required} className={inputClass} />
    </label>
  );
}

function TextArea({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span>
      <textarea name={name} placeholder={placeholder} rows={4} className="w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 py-3 text-sm outline-none placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
    </label>
  );
}
