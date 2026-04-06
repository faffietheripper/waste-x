import React from "react";
import Link from "next/link";

export default function AppHome() {
  return (
    <div className="p-8 pl-[24vw] pt-32 space-y-10">
      <Hero />

      <InfoSection />

      <QuickLinks />

      <GettingStarted />
    </div>
  );
}

/* ===============================
   HERO
============================== */

function Hero() {
  return (
    <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-8 rounded-2xl shadow-xl">
      <h1 className="text-3xl font-bold mb-2">Welcome to Waste X</h1>

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
      <Card title="What is Waste X?">
        Waste X is a structured digital system designed to manage the full chain
        of custody for waste — from generation through to final processing.
      </Card>

      <Card title="How the System Works">
        Waste X connects waste generators, managers, and carriers into a single
        compliant workflow — ensuring traceability, accountability, and audit
        readiness.
      </Card>

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

function GettingStarted() {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border">
      <h2 className="text-lg font-semibold mb-4">Getting Started</h2>

      <div className="space-y-3 text-sm">
        <p>• Create and manage waste listings</p>
        <p>• Review and accept bids</p>
        <p>• Assign jobs to carriers</p>
        <p>• Track waste movement and compliance</p>
      </div>
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
