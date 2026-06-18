"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const workflowSteps = [
  {
    number: "01",
    title: "Create Waste Record",
    text: "Generators create structured waste records with site details, material information, quantity, classification and supporting documents.",
  },
  {
    number: "02",
    title: "Route the Work",
    text: "Waste can be assigned internally, directly awarded to known partners, or opened to approved carriers through a controlled workflow.",
  },
  {
    number: "03",
    title: "Collect & Confirm",
    text: "Carriers receive clear assignments, confirm collection activity and maintain a digital record of the movement.",
  },
  {
    number: "04",
    title: "Receive & Manage",
    text: "Waste managers and receiving sites record incoming waste activity with data shaped for future Digital Waste Tracking requirements.",
  },
  {
    number: "05",
    title: "Audit & Report",
    text: "Every handover, status change, incident and receipt becomes part of a structured chain-of-custody record.",
  },
];

const operatingModes = [
  {
    title: "Single-role operators",
    text: "For organisations that only work in one part of the waste process, such as carriers, producers, brokers, receiving sites or waste managers.",
  },
  {
    title: "Full-chain organisations",
    text: "For larger companies that generate, collect, transport, receive and manage waste internally across departments or multiple locations.",
  },
  {
    title: "Compliance teams",
    text: "For environmental managers and internal audit teams that need visibility across waste movements, incidents and operational records.",
  },
];

const compliancePoints = [
  {
    title: "Digital Waste Tracking readiness",
    text: "Waste X is structured around the UK’s move towards mandatory digital waste reporting and cleaner waste movement data.",
  },
  {
    title: "Receipt-focused workflows",
    text: "Receiving sites and waste managers can capture structured receipt activity, supporting the direction of DEFRA’s Receipt of Waste service.",
  },
  {
    title: "Reduced paper dependency",
    text: "The platform helps replace disconnected spreadsheets, paper records, email trails and manual reconciliation with digital workflows.",
  },
  {
    title: "Role-based data capture",
    text: "Generators, carriers, receivers and compliance users each capture the information relevant to their responsibility in the waste chain.",
  },
];

export default function HowItWorksPage() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);

  return (
    <main className="bg-white text-gray-900">
      {/* ================= HERO ================= */}
      <section className="relative bg-[#1f1f1f] text-white px-6 py-36 overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_left,_#f97316,_transparent_35%)]" />

        <div className="relative max-w-6xl mx-auto text-center">
          <motion.div initial="hidden" animate="show" variants={fadeUp}>
            <div className="inline-flex items-center border border-orange-500/40 bg-orange-500/10 text-orange-400 px-4 py-2 text-sm font-semibold mb-8">
              FROM GENERATION TO RECEIPT
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-8">
              How <span className="text-orange-500">Waste X</span> Works
            </h1>

            <p className="text-gray-300 text-lg max-w-3xl mx-auto leading-relaxed mb-6">
              Waste X connects the people, organisations and records involved in
              waste movement — from the moment waste is generated to collection,
              receipt, management and compliance review.
            </p>

            <p className="text-gray-400 max-w-3xl mx-auto leading-relaxed">
              Whether your organisation operates across the entire waste chain or
              only handles one role, Waste X provides the digital workflows
              needed to create structured, auditable and Digital Waste Tracking
              ready records.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ================= OPERATING MODEL INTRO ================= */}
      <section className="py-28 px-6 bg-gray-100 border-t-8 border-orange-500">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <h2 className="text-4xl font-bold mb-6">
              Built Around the Real Waste Chain
            </h2>

            <p className="text-lg text-gray-600 leading-relaxed">
              Waste X is not limited to one type of company. The platform is
              designed around the different roles that exist in waste operations:
              producers, carriers, receiving sites, waste managers and
              compliance teams.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            {operatingModes.map((mode) => (
              <OperatingModeCard
                key={mode.title}
                title={mode.title}
                text={mode.text}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ================= SYSTEM FLOW ================= */}
      <section className="py-32 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-4xl mx-auto mb-20">
            <p className="text-orange-500 font-bold mb-4">
              STRUCTURED OPERATIONAL WORKFLOW
            </p>

            <h2 className="text-4xl font-bold mb-6">
              One digital record across every stage of the movement.
            </h2>

            <p className="text-lg text-gray-600 leading-relaxed">
              Waste X turns waste activity into a clear operational sequence.
              Each organisation only sees the workflows relevant to its role,
              while the platform maintains a connected chain-of-custody record.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-8 text-center">
            {workflowSteps.map((step) => (
              <Step
                key={step.number}
                number={step.number}
                title={step.title}
                text={step.text}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ================= PARALLAX BREAK ================= */}
      <section ref={ref} className="relative h-[500px] overflow-hidden">
        <motion.div style={{ y }} className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1642204705127-accc0dcc5779?auto=format&fit=crop&w=2000&q=80"
            alt="Construction waste"
            fill
            sizes="100vw"
            className="object-cover scale-110"
          />
        </motion.div>

        <div className="absolute inset-0 bg-black/70" />

        <div className="relative h-full flex items-center justify-center text-white text-center px-6">
          <div className="max-w-4xl">
            <p className="text-orange-500 font-bold mb-4">
              OPERATIONAL CONTROL. COMPLIANCE VISIBILITY.
            </p>

            <h3 className="text-4xl md:text-5xl font-bold">
              Every transfer, assignment, receipt and incident becomes part of a
              traceable digital record.
            </h3>
          </div>
        </div>
      </section>

      {/* ================= ROLE SECTIONS ================= */}

      {/* WASTE GENERATORS */}
      <section
        id="waste-generators"
        className="py-32 px-6 bg-white border-t-8 border-orange-500"
      >
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-20 items-center">
          <div>
            <p className="text-orange-500 font-bold mb-4">
              FOR ORGANISATIONS THAT PRODUCE WASTE
            </p>

            <h2 className="text-4xl font-bold mb-8 text-orange-500">
              Waste Generators
            </h2>

            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Construction sites, contractors, facilities teams and industrial
              operators can digitise the first stage of the waste journey by
              creating structured waste records before collection takes place.
            </p>

            <ul className="space-y-4 text-gray-700">
              <li>• Create structured waste listings and movement records</li>
              <li>• Record material type, quantity, site and classification data</li>
              <li>• Assign work internally or to external carriers</li>
              <li>• Track collection progress and exceptions</li>
              <li>• Maintain audit-ready records for compliance review</li>
            </ul>
          </div>

          <div className="relative h-[400px]">
            <Image
              src="https://images.unsplash.com/photo-1770068511770-827727c2e433?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8d2FzdGUlMjBtYW5hZ2Vyc3xlbnwwfHwwfHx8MA%3D%3D"
              alt="Construction site manager"
              fill
              sizes="100vw"
              className="object-cover border-4 border-orange-500"
            />
          </div>
        </div>
      </section>

      {/* WASTE CARRIERS */}
      <section
        id="waste-carriers"
        className="py-32 px-6 bg-[#2b2b2b] text-white"
      >
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-20 items-center">
          <div className="relative h-[400px] order-2 md:order-1">
            <Image
              src="https://images.unsplash.com/photo-1608476524605-2ad765c3bd78?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8d2FzdGUlMjBjYXJyaWVyfGVufDB8fDB8fHww"
              alt="Waste carrier truck"
              fill
              sizes="100vw"
              className="object-cover border-4 border-orange-500"
            />
          </div>

          <div className="order-1 md:order-2">
            <p className="text-orange-500 font-bold mb-4">
              FOR LICENSED CARRIERS AND COLLECTION TEAMS
            </p>

            <h2 className="text-4xl font-bold mb-8 text-orange-500">
              Waste Carriers
            </h2>

            <p className="text-lg text-gray-300 leading-relaxed mb-6">
              Carriers can operate as standalone companies or as part of a
              larger internal waste operation. Waste X gives them clear
              assignment workflows, collection visibility and transfer history.
            </p>

            <ul className="space-y-4 text-gray-300">
              <li>• Access controlled work opportunities and assignments</li>
              <li>• Accept, reject or progress collection jobs</li>
              <li>• Confirm collection activity digitally</li>
              <li>• Report incidents or issues from the field</li>
              <li>• Maintain a searchable operational history</li>
            </ul>
          </div>
        </div>
      </section>

      {/* WASTE MANAGERS & RECEIVERS */}
      <section
        id="waste-managers"
        className="py-32 px-6 bg-gray-100 border-t-8 border-orange-500"
      >
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-20 items-center">
          <div>
            <p className="text-orange-500 font-bold mb-4">
              FOR RECEIVING SITES AND WASTE MANAGEMENT OPERATORS
            </p>

            <h2 className="text-4xl font-bold mb-8 text-orange-500">
              Waste Managers & Receivers
            </h2>

            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Receiving sites, recycling facilities, treatment sites and waste
              management teams can record incoming waste activity and build the
              structured data needed for the next phase of UK waste reporting.
            </p>

            <ul className="space-y-4 text-gray-700">
              <li>• Record received waste activity against movement records</li>
              <li>• Connect incoming waste to carrier and generator details</li>
              <li>• Maintain receipt-level operational history</li>
              <li>• Support site-level audit and compliance review</li>
              <li>• Prepare workflows for Digital Waste Tracking requirements</li>
            </ul>
          </div>

          <div className="relative h-[400px]">
            <Image
              src="https://images.unsplash.com/photo-1763315156830-07870b159121?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8d2FzdGUlMjBtYW5hZ2Vyc3xlbnwwfHwwfHx8MA%3D%3D"
              alt="Waste manager on site"
              fill
              sizes="100vw"
              className="object-cover border-4 border-orange-500"
            />
          </div>
        </div>
      </section>

      {/* FULL-CHAIN OPERATORS */}
      <section
        id="full-chain-operators"
        className="py-32 px-6 bg-[#2b2b2b] text-white"
      >
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-20 items-center">
          <div className="relative h-[400px] order-2 md:order-1">
            <Image
              src="https://images.unsplash.com/photo-1711618732595-0c517e08d40c?q=80&w=2906&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
              alt="Industrial waste operation"
              fill
              sizes="100vw"
              className="object-cover border-4 border-orange-500"
            />
          </div>

          <div className="order-1 md:order-2">
            <p className="text-orange-500 font-bold mb-4">
              FOR MULTI-ROLE ORGANISATIONS
            </p>

            <h2 className="text-4xl font-bold mb-8 text-orange-500">
              Full-Chain Operators
            </h2>

            <p className="text-lg text-gray-300 leading-relaxed mb-6">
              Some organisations manage the entire waste process internally,
              from generation to collection, transfer, receipt and final
              management. Waste X supports this model without forcing teams into
              separate disconnected systems.
            </p>

            <ul className="space-y-4 text-gray-300">
              <li>• Operate as generator, carrier and manager in one platform</li>
              <li>• Separate workflows by department or responsibility</li>
              <li>• Route work internally without unnecessary external bidding</li>
              <li>• Track the full chain of custody across the organisation</li>
              <li>• Give compliance teams visibility across every stage</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ================= COMPLIANCE READINESS ================= */}
      <section className="py-32 px-6 bg-white border-t-8 border-yellow-500">
        <div className="max-w-5xl mx-auto text-center mb-16">
          <p className="text-orange-500 font-bold mb-4">
            DEFRA DIGITAL WASTE TRACKING READINESS
          </p>

          <h2 className="text-4xl font-bold mb-6">
            Designed for the UK’s digital reporting future.
          </h2>

          <p className="text-lg text-gray-600 leading-relaxed mb-6">
            Waste X is being built around the operational reality of Digital
            Waste Tracking: cleaner records, role-based data capture, receipt
            logging, audit visibility and software-led reporting preparation.
          </p>

          <p className="text-lg text-gray-600 leading-relaxed">
            The platform helps organisations start building structured waste
            data now, before digital reporting becomes a normal part of daily
            waste operations.
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-6">
          {compliancePoints.map((point) => (
            <ComplianceCard
              key={point.title}
              title={point.title}
              text={point.text}
            />
          ))}
        </div>
      </section>

      {/* ================= PRACTICAL WORKFLOW EXAMPLE ================= */}
      <section className="py-32 px-6 bg-gray-100">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-orange-500 font-bold mb-4">
              HOW THIS WORKS IN PRACTICE
            </p>

            <h2 className="text-4xl font-bold mb-6">
              One movement can involve several organisations — or just one.
            </h2>

            <p className="text-lg text-gray-600 leading-relaxed mb-6">
              A small waste carrier may only use Waste X to receive assignments,
              confirm collections and maintain movement history. A receiving
              site may use it to record incoming waste and prepare receipt data.
            </p>

            <p className="text-lg text-gray-600 leading-relaxed">
              A larger construction, industrial or waste management organisation
              can use the same platform to manage internal generation, carrier
              activity, waste receipt, incidents and compliance oversight across
              multiple teams.
            </p>
          </div>

          <div className="border-2 border-orange-500 bg-white p-10 shadow-sm">
            <h3 className="text-2xl font-bold mb-6">
              Waste X supports workflows for:
            </h3>

            <ul className="space-y-4 text-gray-700">
              <li>• Waste generation and listing creation</li>
              <li>• Internal waste transfer management</li>
              <li>• External carrier assignment</li>
              <li>• Collection confirmation</li>
              <li>• Receiving site waste logging</li>
              <li>• Incident and exception reporting</li>
              <li>• Compliance review and audit history</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="py-28 px-6 bg-orange-500 text-white text-center">
        <h2 className="text-4xl font-bold mb-6">
          Digital Waste Workflows for Every Role in the Chain
        </h2>

        <p className="text-lg mb-10 max-w-3xl mx-auto leading-relaxed">
          Built for operational clarity. Structured for audit visibility.
          Designed for the UK’s Digital Waste Tracking future.
        </p>

        <button className="bg-black px-10 py-4 font-semibold hover:bg-gray-900 transition">
          Request Pilot Access
        </button>
      </section>
    </main>
  );
}

/* ================= COMPONENTS ================= */

type StepProps = {
  number: string;
  title: string;
  text: string;
};

function Step({ number, title, text }: StepProps) {
  return (
    <div className="border-2 border-gray-200 p-6">
      <div className="text-4xl font-bold text-orange-500 mb-4">{number}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
    </div>
  );
}

type OperatingModeCardProps = {
  title: string;
  text: string;
};

function OperatingModeCard({ title, text }: OperatingModeCardProps) {
  return (
    <div className="bg-white border-2 border-gray-200 p-8 shadow-sm">
      <h3 className="text-xl font-bold mb-4 text-orange-500">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{text}</p>
    </div>
  );
}

type ComplianceCardProps = {
  title: string;
  text: string;
};

function ComplianceCard({ title, text }: ComplianceCardProps) {
  return (
    <div className="border-2 border-gray-200 p-6">
      <h3 className="font-bold text-orange-500 mb-4">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
    </div>
  );
}