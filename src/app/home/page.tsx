import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function AppHome() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  const organisation = dbUser?.organisationId
    ? await database.query.organisations.findFirst({
        where: eq(organisations.id, dbUser.organisationId),
      })
    : null;

  /* ===============================
     NO ORG STATE
  ============================== */

  if (!organisation) {
    return (
      <div className="p-8 pl-[24vw] pt-32 space-y-10">
        <Hero name={dbUser?.name} />

        <InfoSection />

        <CreateOrgCTA />
      </div>
    );
  }

  /* ===============================
     ORG EXISTS → INFO DASHBOARD
  ============================== */

  return (
    <div className="p-8 pl-[24vw] pt-32 space-y-10">
      <Hero name={dbUser?.name} org={organisation.teamName} />

      <InfoSection />

      <QuickLinks />

      <GettingStarted chain={organisation.chainOfCustody} />
    </div>
  );
}

/* ===============================
   HERO
============================== */

function Hero({ name, org }: { name?: string; org?: string }) {
  return (
    <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-8 rounded-2xl shadow-xl">
      <h1 className="text-3xl font-bold mb-2">
        Welcome to Waste X{name ? `, ${name}` : ""}
      </h1>

      {org && <p className="text-sm opacity-90">Organisation: {org}</p>}

      <p className="text-sm opacity-75 mt-2">
        Digital infrastructure for waste tracking, compliance, and operational
        execution.
      </p>
    </div>
  );
}

/* ===============================
   INFO SECTION
============================== */

function InfoSection() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* WHAT IS WASTE X */}
      <Card title="What is Waste X?">
        Waste X is a structured digital system designed to manage the full chain
        of custody for waste — from generation through to final processing.
      </Card>

      {/* HOW IT WORKS */}
      <Card title="How the System Works">
        Waste X connects waste generators, managers, and carriers into a single
        compliant workflow — ensuring traceability, accountability, and audit
        readiness.
      </Card>

      {/* COMPLIANCE */}
      <Card title="Compliance & Infrastructure">
        Built to align with UK digital waste tracking initiatives, Waste X
        provides audit-ready records and secure operational workflows.
      </Card>
    </div>
  );
}

/* ===============================
   QUICK LINKS
============================== */

function QuickLinks() {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border">
      <h2 className="text-lg font-semibold mb-4">Resources</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <a
          href="https://www.wastextracking.com/"
          target="_blank"
          className="border p-4 rounded-lg hover:bg-gray-50 transition"
        >
          🌐 Business Website
        </a>

        <Link
          href="/home/policies"
          className="border p-4 rounded-lg hover:bg-gray-50 transition"
        >
          📜 Policies & Compliance
        </Link>

        <Link
          href="/how-it-works"
          className="border p-4 rounded-lg hover:bg-gray-50 transition"
        >
          ⚙️ How It Works
        </Link>
      </div>
    </div>
  );
}

/* ===============================
   GETTING STARTED
============================== */

function GettingStarted({ chain }: { chain: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border">
      <h2 className="text-lg font-semibold mb-4">Getting Started</h2>

      <div className="space-y-3 text-sm">
        {chain === "wasteGenerator" && (
          <>
            <p>• Create and manage waste listings</p>
            <p>• Review and accept bids</p>
            <p>• Assign jobs to carriers</p>
          </>
        )}

        {chain === "wasteManager" && (
          <>
            <p>• Browse and bid on listings</p>
            <p>• Manage awarded jobs</p>
            <p>• Complete and track transfers</p>
          </>
        )}

        {chain === "wasteCarrier" && (
          <>
            <p>• View assigned jobs</p>
            <p>• Confirm collection</p>
            <p>• Complete waste transfers</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ===============================
   CREATE ORG CTA
============================== */

function CreateOrgCTA() {
  return (
    <div className="bg-white p-10 rounded-2xl shadow-sm border text-center">
      <h2 className="text-xl font-semibold mb-4">Get Started with Waste X</h2>

      <p className="text-sm text-gray-600 mb-6">
        Create your organisation to begin using the platform and accessing
        operational workflows.
      </p>

      <Link
        href="/home/team-dashboard"
        className="bg-blue-600 text-white px-6 py-3 rounded-md"
      >
        Create Organisation
      </Link>
    </div>
  );
}

/* ===============================
   CARD
============================== */

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <p className="text-sm text-gray-600">{children}</p>
    </div>
  );
}
