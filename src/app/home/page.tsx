import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

/* =========================================================
   TYPES
========================================================= */

type Capability = "generator" | "carrier" | "manager";

/* =========================================================
   PAGE
========================================================= */

export default async function AppHome() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  const organisation = dbUser?.organisationId
    ? await database.query.organisations.findFirst({
        where: eq(organisations.id, dbUser.organisationId),
      })
    : null;

  /* =========================================================
     NO ORGANISATION STATE
  ========================================================= */

  if (!organisation) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-8 py-32">
        <div className="space-y-8">
          <Hero name={dbUser?.name} />

          <InfoSection />

          <CreateOrgCTA />
        </div>
      </main>
    );
  }

  const capabilities = (organisation.capabilities as Capability[] | null) ?? [];

  /* =========================================================
     ORGANISATION EXISTS
  ========================================================= */

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-8 py-32">
      <div className="space-y-8">
        <Hero
          name={dbUser?.name}
          org={organisation.teamName}
          status={organisation.status ?? "PENDING"}
        />

        <OperationalSnapshot
          capabilities={capabilities}
          organisationStatus={organisation.status ?? "PENDING"}
        />

        <InfoSection />

        <QuickLinks />

        <GettingStarted capabilities={capabilities} />
      </div>
    </main>
  );
}

/* =========================================================
   HERO
========================================================= */

function Hero({
  name,
  org,
  status,
}: {
  name?: string | null;
  org?: string | null;
  status?: string | null;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
      <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" />
      <div className="absolute -bottom-24 left-20 h-56 w-56 rounded-full bg-orange-400/10 blur-3xl" />

      <div className="relative z-10 flex items-start justify-between gap-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-orange-400">
            ACCESS NODE // WX-HOME-01
          </p>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight">
            Welcome to Waste X{name ? `, ${name}` : ""}
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
            Digital infrastructure for waste listings, manager-led assignments,
            carrier verification, incident handling and audit-ready operational
            records.
          </p>

          {org && (
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
                Organisation: {org}
              </span>

              {status && (
                <span
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    status === "ACTIVE"
                      ? "bg-green-500/15 text-green-300 border border-green-400/30"
                      : status === "REJECTED" || status === "SUSPENDED"
                        ? "bg-red-500/15 text-red-300 border border-red-400/30"
                        : "bg-orange-500/15 text-orange-300 border border-orange-400/30"
                  }`}
                >
                  Status: {status}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-5 text-right lg:block">
          <p className="text-xs uppercase tracking-widest text-white/35">
            Platform Mode
          </p>
          <p className="mt-2 text-lg font-semibold text-orange-400">MVP</p>
          <p className="mt-1 max-w-[180px] text-xs leading-5 text-white/45">
            Early operational build for workflow testing and pilot readiness.
          </p>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   OPERATIONAL SNAPSHOT
========================================================= */

function OperationalSnapshot({
  capabilities,
  organisationStatus,
}: {
  capabilities: Capability[];
  organisationStatus: string;
}) {
  return (
    <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
      <MetricCard
        label="Organisation Status"
        value={organisationStatus}
        detail="Platform access state"
      />

      <MetricCard
        label="Capabilities"
        value={capabilities.length ? String(capabilities.length) : "0"}
        detail={
          capabilities.length
            ? capabilities.map(formatCapability).join(" / ")
            : "No capabilities selected"
        }
      />

      <MetricCard
        label="Workflow Model"
        value="Chain"
        detail="Generator → Manager → Carrier → Compliance"
      />
    </section>
  );
}

/* =========================================================
   INFO SECTION
========================================================= */

function InfoSection() {
  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card title="Operational Control" eyebrow="What Waste X does">
        Waste X structures waste movement into controlled digital records:
        listings, assignment stages, carrier response, verification, incidents
        and completion history.
      </Card>

      <Card title="Manager-Led Workflows" eyebrow="External operations">
        External jobs can move through a manager organisation first, before a
        carrier is assigned for collection. This supports realistic industry
        workflows without forcing every job into a direct carrier model.
      </Card>

      <Card title="Compliance Infrastructure" eyebrow="Audit readiness">
        The system is designed around traceability: organisation IDs, assignment
        timestamps, verification codes, incident records and exportable
        compliance evidence.
      </Card>
    </section>
  );
}

/* =========================================================
   QUICK LINKS
========================================================= */

function QuickLinks() {
  return (
    <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
            Resources
          </p>
          <h2 className="mt-2 text-xl font-semibold text-black">
            Platform Links
          </h2>
        </div>

        <p className="max-w-md text-sm text-black/45">
          Useful routes for business information, compliance documents and
          platform guidance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
        <a
          href="https://www.wastextracking.com/"
          target="_blank"
          className="group rounded-2xl border border-black/10 bg-[#fbfaf7] p-5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-sm"
        >
          <p className="font-semibold text-black group-hover:text-orange-600">
            Business Website →
          </p>
          <p className="mt-2 text-xs leading-5 text-black/45">
            External Waste X site and product positioning.
          </p>
        </a>

        <Link
          href="/home/policies"
          className="group rounded-2xl border border-black/10 bg-[#fbfaf7] p-5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-sm"
        >
          <p className="font-semibold text-black group-hover:text-orange-600">
            Policies & Compliance →
          </p>
          <p className="mt-2 text-xs leading-5 text-black/45">
            Operational policies, audit expectations and compliance guidance.
          </p>
        </Link>

        <Link
          href="/how-it-works"
          className="group rounded-2xl border border-black/10 bg-[#fbfaf7] p-5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-sm"
        >
          <p className="font-semibold text-black group-hover:text-orange-600">
            How It Works →
          </p>
          <p className="mt-2 text-xs leading-5 text-black/45">
            Learn how listings, assignments, verification and completion work.
          </p>
        </Link>
      </div>
    </section>
  );
}

/* =========================================================
   GETTING STARTED
========================================================= */

function GettingStarted({ capabilities }: { capabilities: Capability[] }) {
  return (
    <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
          Getting Started
        </p>
        <h2 className="mt-2 text-xl font-semibold text-black">
          Your Operational Access
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-black/45">
          Your organisation capabilities control which workflows make sense for
          your team. Department selection controls the operational view each
          user works from.
        </p>
      </div>

      {capabilities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-6 text-sm text-black/50">
          No capabilities are currently configured for this organisation.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {capabilities.includes("generator") && (
            <CapabilityCard
              title="Generator"
              label="Waste Origin"
              items={[
                "Create waste listings",
                "Assign manager-led or direct jobs",
                "Hold verification codes for collection",
                "Track completion and compliance records",
              ]}
            />
          )}

          {capabilities.includes("manager") && (
            <CapabilityCard
              title="Manager"
              label="Operational Control"
              items={[
                "Receive manager-assigned jobs",
                "Accept or reject assigned listings",
                "Assign carrier organisations",
                "Confirm waste receipt and complete workflows",
              ]}
            />
          )}

          {capabilities.includes("carrier") && (
            <CapabilityCard
              title="Carrier"
              label="Collection & Transport"
              items={[
                "View assigned collection jobs",
                "Accept or reject carrier work",
                "Verify collection using secure codes",
                "Report incidents during active jobs",
              ]}
            />
          )}
        </div>
      )}
    </section>
  );
}

/* =========================================================
   CREATE ORGANISATION CTA
========================================================= */

function CreateOrgCTA() {
  return (
    <section className="rounded-3xl border border-black/10 bg-white p-10 text-center shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        Organisation Required
      </p>

      <h2 className="mt-3 text-2xl font-semibold text-black">
        Create your Waste X organisation
      </h2>

      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-black/50">
        To use Waste X operational workflows, you need an organisation profile.
        This sets your capabilities, approval status, departments and access to
        listings, assignments and compliance tooling.
      </p>

      <div className="mt-7">
        <Link
          href="/home/settings/organisation?reason=no-organisation"
          className="inline-flex rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
        >
          Create Organisation
        </Link>
      </div>
    </section>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
      <p className="mt-2 text-sm text-black/45">{detail}</p>
    </div>
  );
}

function Card({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-orange-600">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-lg font-semibold text-black">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-black/50">{children}</p>
    </div>
  );
}

function CapabilityCard({
  title,
  label,
  items,
}: {
  title: string;
  label: string;
  items: string[];
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-black/35">
            {label}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-black">{title}</h3>
        </div>

        <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-orange-400">
          Active
        </span>
      </div>

      <ul className="space-y-2 text-sm text-black/55">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-orange-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatCapability(capability: Capability) {
  switch (capability) {
    case "generator":
      return "Generator";
    case "manager":
      return "Manager";
    case "carrier":
      return "Carrier";
    default:
      return capability;
  }
}
