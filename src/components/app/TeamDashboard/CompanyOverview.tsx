import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { organisations } from "@/db/schema";
import { getImageUrl } from "@/util/files";

/* =========================================================
   TYPES
========================================================= */

type Capability = "generator" | "carrier" | "manager";

/* =========================================================
   PAGE
========================================================= */

export default async function CompanyOverview() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!session.user.organisationId) {
    redirect("/home/team-dashboard/team-profile?reason=no-organisation");
  }

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, session.user.organisationId),
  });

  if (!organisation) {
    redirect("/home/team-dashboard/team-profile?reason=no-organisation");
  }

  const capabilities = Array.isArray(organisation.capabilities)
    ? (organisation.capabilities as Capability[])
    : [];

  return (
    <main className="mx-auto max-w-6xl space-y-8 rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
      {/* ================= HEADER ================= */}

      <section className="flex flex-col gap-6 border-b border-black/10 pb-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-3xl border border-black/10 bg-[#fbfaf7]">
            {organisation.profilePicture ? (
              <Image
                height={112}
                width={112}
                src={getImageUrl(organisation.profilePicture)}
                alt="Organisation profile"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/30">
                No Logo
              </span>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              Organisation Overview
            </p>

            <h1 className="mt-2 text-3xl font-semibold text-black">
              {organisation.teamName ?? "Unnamed Organisation"}
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
              Review the organisation details used across Waste X listings,
              assignments, compliance workflows and Digital Waste Tracking
              records.
            </p>
          </div>
        </div>

        <Link
          href="/home/team-dashboard/team-profile"
          className="rounded-full bg-black px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
        >
          Edit Profile
        </Link>
      </section>

      {/* ================= CAPABILITY SUMMARY ================= */}

      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-700">
          Operational Capabilities
        </p>

        <h2 className="mt-2 text-xl font-semibold text-black">
          What this organisation can do
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-800">
          Capabilities control which operational departments and workflows are
          available to this organisation.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          {capabilities.length > 0 ? (
            capabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-full border border-orange-300 bg-white px-4 py-2 text-xs font-semibold text-orange-700"
              >
                {formatCapability(capability)}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
              No capabilities configured
            </span>
          )}
        </div>
      </section>

      {/* ================= OVERVIEW GRID ================= */}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* COMPANY OVERVIEW */}
        <InfoPanel
          eyebrow="Company Overview"
          title="Business information"
          description="General organisation information used across the Waste X workspace."
        >
          <InfoRow
            label="Organisation Name"
            value={organisation.teamName}
          />

          <InfoRow label="Industry" value={organisation.industry} />

          <InfoRow
            label="Status"
            value={formatLabel(organisation.status ?? "Unknown")}
          />
        </InfoPanel>

        {/* CONTACT INFO */}
        <InfoPanel
          eyebrow="Contact Information"
          title="Primary contact details"
          description="These details support operational communication and compliance records."
        >
          <InfoRow label="Telephone" value={organisation.telephone} />

          <InfoRow
            label="Email Address"
            value={organisation.emailAddress}
          />

          <InfoRow label="Country" value={organisation.country} />
        </InfoPanel>
      </section>

      {/* ================= ADDRESS ================= */}

      <section className="rounded-3xl border border-black/10 bg-[#fbfaf7] p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
          Registered / Operating Address
        </p>

        <h2 className="mt-2 text-xl font-semibold text-black">
          Organisation address
        </h2>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoRow label="Street Address" value={organisation.streetAddress} />
          <InfoRow label="City" value={organisation.city} />
          <InfoRow label="Region" value={organisation.region} />
          <InfoRow label="Post Code" value={organisation.postCode} />
          <InfoRow label="Country" value={organisation.country} />
        </div>
      </section>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function InfoPanel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-black/10 bg-[#fbfaf7] p-6">
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-xl font-semibold text-black">{title}</h2>

      <p className="mt-2 text-sm leading-6 text-black/45">{description}</p>

      <div className="mt-6 space-y-4">{children}</div>
    </section>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-black">
        {value && value.trim().length > 0 ? value : "Not provided"}
      </p>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatCapability(value: Capability) {
  switch (value) {
    case "generator":
      return "Waste Generator";
    case "carrier":
      return "Waste Carrier";
    case "manager":
      return "Waste Manager";
    default:
      return value;
  }
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}