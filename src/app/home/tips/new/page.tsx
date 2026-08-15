import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createExternalFacilityAction } from "../actions";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function errorMessage(value: string) {
  const map: Record<string, string> = {
    operator_required: "Enter the facility operator/company name.",
    facility_required: "Enter the facility/site name.",
    authorisation_required: "Enter the permit, licence or exemption number.",
  };
  return map[value] ?? "Waste X could not create the facility.";
}

export default async function NewThirdPartyFacilityPage({
  searchParams,
}: {
  searchParams: { error?: string | string[] };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const error = first(searchParams.error);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative">
            <Link href="/home/tips" className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">
              ← Third-Party Facilities
            </Link>
            <h1 className="mt-5 text-4xl font-semibold">New Third-Party Facility</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Add the external operator, physical facility and environmental authorisation. Permitted EWC codes are configured after saving.
            </p>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">{errorMessage(error)}</div>}

        <form action={createExternalFacilityAction} className="space-y-7">
          <Card eyebrow="Operator" title="Waste Facility Operator">
            <Field label="Operator / company name" name="operatorName" placeholder="Greenfield Recycling Ltd" required />
          </Card>

          <Card eyebrow="Facility" title="Site Details">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Facility / site name" name="facilityName" placeholder="Greenfield Recycling Centre" required />
              <Field label="Postcode" name="postcode" placeholder="IP4 5AA" />
              <div className="md:col-span-2">
                <Field label="Full address" name="fullAddress" placeholder="External waste facility address" />
              </div>
              <Field label="Site contact" name="contactName" />
              <Field label="Contact telephone" name="contactTelephone" />
              <Field label="Contact email" name="contactEmail" type="email" />
              <Field label="Internal notes" name="notes" placeholder="Opening times, booking notes, tip instructions..." />
            </div>
          </Card>

          <Card eyebrow="Compliance" title="Environmental Authorisation">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Permit / licence / exemption number" name="authorisationNumber" placeholder="EPR/AB1234CD" required />
              <Select label="Regulator" name="regulator" defaultValue="EA" options={[
                ["EA", "Environment Agency"],
                ["NRW", "Natural Resources Wales"],
                ["SEPA", "SEPA"],
                ["NIEA", "NIEA"],
                ["other", "Other"],
              ]} />
              <Select label="Authorisation type" name="authorisationType" defaultValue="permit" options={[
                ["permit", "Permit"],
                ["licence", "Licence"],
                ["exemption", "Exemption"],
                ["other", "Other"],
              ]} />
              <Select label="Status" name="status" defaultValue="active" options={[
                ["active", "Active"],
                ["unknown", "Unknown / not checked"],
                ["expired", "Expired"],
                ["suspended", "Suspended"],
                ["revoked", "Revoked"],
              ]} />
              <Field label="Valid from" name="validFrom" type="date" />
              <Field label="Expiry date" name="expiresAt" type="date" />
              <Field label="Verification source" name="verificationSource" placeholder="EA public register / permit PDF / customer evidence" />
              <Field label="Verified on" name="verifiedAt" type="date" />
            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Link href="/home/tips" className="rounded-2xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-black/55">Cancel</Link>
            <button type="submit" className="rounded-2xl bg-orange-500 px-7 py-3 text-sm font-semibold text-black transition hover:bg-orange-400">Create Facility</button>
          </div>
        </form>
      </div>
    </main>
  );
}

const inputClass = "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

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

function Select({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: Array<[string, string]> }) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span>
      <select name={name} defaultValue={defaultValue} className={inputClass}>
        {options.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}
      </select>
    </label>
  );
}
