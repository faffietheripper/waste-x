"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const trustMarkers = [
  "DEFRA Digital Waste Tracking aligned",
  "Receipt of Waste API-ready data structure",
  "Built for single-role and full-chain operators",
];

const complianceTimeline = [
  {
    phase: "Public Beta",
    date: "Live from 28 April 2026",
    text: "Permitted and licensed waste receiving sites can start preparing and testing digital receipt workflows.",
  },
  {
    phase: "Phase 1",
    date: "October 2026 / January 2027",
    text: "Mandatory reporting begins for waste receivers in England, Wales and Northern Ireland, with Scotland following in January 2027.",
  },
  {
    phase: "Phase 2",
    date: "October 2027",
    text: "The wider rollout is expected to include collectors such as carriers, brokers and dealers.",
  },
];

const operatingModels = [
  {
    title: "For full-chain waste operators",
    description:
      "Built for larger organisations that generate, collect, transport, receive, process and manage waste internally across multiple teams, sites or departments.",
    items: [
      "Manage the full journey from generation to receipt",
      "Separate generator, carrier, manager and compliance teams",
      "Track internal transfers and external assignments",
      "Maintain one structured chain-of-custody record",
      "Prepare organisation-wide data for future digital reporting",
    ],
  },
  {
    title: "For single-role organisations",
    description:
      "Waste X also works for smaller firms that only operate in one part of the waste chain, such as licensed carriers, waste producers or receiving sites.",
    items: [
      "Use only the workflows relevant to your role",
      "Accept or manage carrier assignments",
      "Create waste listings as a producer",
      "Record receipt activity as a receiving site",
      "Build compliance-ready operational history over time",
    ],
  },
];

const processSteps = [
  {
    number: "01",
    title: "Generate",
    description:
      "Create structured waste records with material details, site information, estimated quantity and supporting documentation.",
  },
  {
    number: "02",
    title: "Assign",
    description:
      "Route work internally, directly award to known partners, or open opportunities to approved carriers.",
  },
  {
    number: "03",
    title: "Collect",
    description:
      "Carriers receive clear assignments, confirm activity and maintain a digital record of movement progress.",
  },
  {
    number: "04",
    title: "Receive",
    description:
      "Receiving sites and waste managers can record incoming waste activity with data shaped for future reporting requirements.",
  },
  {
    number: "05",
    title: "Audit",
    description:
      "Every action, incident, transfer and handover becomes part of a searchable chain-of-custody record.",
  },
];

const roleCards = [
  {
    title: "Waste Producers",
    text: "For contractors, developers, facilities teams and organisations generating waste across sites or projects.",
    items: [
      "Create structured waste listings",
      "Assign internal or external carriers",
      "Track collection progress",
      "Record incidents and exceptions",
    ],
  },
  {
    title: "Waste Carriers",
    text: "For licensed carriers managing collections, assignments and movement activity across multiple customers.",
    items: [
      "Receive clear job assignments",
      "Accept, reject or progress work",
      "Confirm collection activity",
      "Build operational performance history",
    ],
  },
  {
    title: "Waste Managers & Receivers",
    text: "For receiving sites, transfer stations, recycling facilities and waste management operators preparing for digital reporting.",
    items: [
      "Log received waste activity",
      "Maintain receipt-level records",
      "Support API-ready data capture",
      "Prepare for Digital Waste Tracking workflows",
    ],
  },
  {
    title: "Compliance Teams",
    text: "For internal compliance, environmental managers and audit teams that need oversight across the waste journey.",
    items: [
      "View chain-of-custody records",
      "Monitor incidents and resolution logs",
      "Review organisational activity",
      "Export audit-ready information",
    ],
  },
];

const compliancePoints = [
  {
    title: "API-led reporting direction",
    text: "Waste X is being structured around the data required to support software-led submission routes, reducing future reliance on manual re-entry.",
  },
  {
    title: "Digital audit trail",
    text: "Transfers, assignments, collections, receipts and incidents are recorded as operational events rather than disconnected documents.",
  },
  {
    title: "Role-based accountability",
    text: "Generators, carriers, receivers and compliance teams each work from their own operational context while contributing to the same waste record.",
  },
  {
    title: "Built for phased adoption",
    text: "Organisations can start with the part of the workflow they need today and expand as their responsibilities or regulatory requirements grow.",
  },
];

export default function FullHomePage() {
  return (
    <main className="bg-white text-gray-900">
      {/* ================= HERO ================= */}
      <section className="relative bg-[#1f1f1f] text-white px-6 py-32 overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_left,_#f97316,_transparent_35%)]" />

        <div className="relative max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <motion.div initial="hidden" animate="show" variants={fadeUp}>
            <div className="inline-flex items-center border border-orange-500/40 bg-orange-500/10 text-orange-400 px-4 py-2 text-sm font-semibold mb-6">
              UK Digital Waste Tracking Ready
            </div>

            <h1 className="text-5xl font-bold leading-tight mb-6">
              One Platform for Every Role in the
              <span className="text-orange-500"> Waste Chain</span>
            </h1>

            <p className="text-gray-300 text-lg mb-6 leading-relaxed">
              Waste X provides digital infrastructure for organisations that
              generate, carry, receive, manage or oversee waste movements across
              the UK.
            </p>

            <p className="text-gray-400 mb-10 leading-relaxed">
              Built for both full-chain operators and single-role firms, Waste X
              helps teams replace fragmented paperwork, spreadsheets and manual
              handovers with structured, auditable workflows designed for the
              future of DEFRA Digital Waste Tracking.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <button className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 font-semibold transition">
                Create Organisation
              </button>
              <button className="border border-white/30 px-8 py-4 hover:bg-white/10 transition">
                View Platform Overview
              </button>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {trustMarkers.map((item) => (
                <div
                  key={item}
                  className="border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300"
                >
                  {item}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="relative h-[420px]"
          >
            <Image
              src="https://images.unsplash.com/photo-1711618732595-0c517e08d40c?q=80&w=2906&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
              alt="Industrial waste and construction operations"
              fill
              className="object-cover border-4 border-orange-500"
              priority
            />

            <div className="absolute -bottom-8 -left-8 max-w-sm bg-black border border-orange-500 p-6 shadow-2xl hidden md:block">
              <p className="text-orange-500 text-sm font-bold mb-2">
                DEFRA API DIRECTION
              </p>
              <p className="text-gray-300 text-sm leading-relaxed">
                Structured around the movement, receipt and audit data required
                for modern digital waste reporting workflows.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================= INDUSTRY CONTEXT ================= */}
      <section className="py-28 px-6 bg-gray-100 border-t-8 border-orange-500">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <h2 className="text-4xl font-bold">
            UK Waste Tracking Is Moving From Paper to Digital
          </h2>

          <p className="text-lg text-gray-600 leading-relaxed">
            The UK waste sector is entering a major transition. Digital Waste
            Tracking is being introduced to create clearer visibility over where
            waste comes from, who handles it, where it goes, and how it is
            received.
          </p>

          <p className="text-lg text-gray-600 leading-relaxed">
            For waste operators, this is more than a compliance change. It is an
            operational shift away from disconnected spreadsheets, paper transfer
            notes, email trails and manual reconciliation towards structured
            digital records.
          </p>

          <div className="grid md:grid-cols-3 gap-6 pt-10 text-left">
            {complianceTimeline.map((item) => (
              <TimelineCard
                key={item.phase}
                phase={item.phase}
                date={item.date}
                text={item.text}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ================= KEY RISKS ================= */}
      <section className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto mb-16 text-center">
          <h2 className="text-4xl font-bold mb-6">
            The Risk Is Not Just Compliance. It Is Poor Visibility.
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            When waste operations are split across paper, phone calls,
            spreadsheets and separate systems, it becomes harder to prove what
            happened, who was responsible and whether the movement was handled
            correctly.
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-12">
          <IndustrialCard
            title="Fragmented Records"
            text="Waste movements often rely on documents, emails and spreadsheets that are difficult to connect into one reliable chain of custody."
          />

          <IndustrialCard
            title="Role Handover Gaps"
            text="Producers, carriers and receiving sites each have different responsibilities. Without a shared workflow, key updates can be missed."
          />

          <IndustrialCard
            title="Regulatory Exposure"
            text="As digital reporting expands, organisations will need stronger audit trails, cleaner data and more consistent operational processes."
          />
        </div>
      </section>

      {/* ================= OPERATING MODELS ================= */}
      <section className="py-32 px-6 bg-[#2b2b2b] text-white">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mb-16">
            <p className="text-orange-500 font-bold mb-4">
              BUILT FOR DIFFERENT TYPES OF WASTE ORGANISATIONS
            </p>
            <h2 className="text-4xl font-bold mb-6">
              Full-chain operator or single-role firm — Waste X adapts to how
              you work.
            </h2>
            <p className="text-gray-300 text-lg leading-relaxed">
              Some organisations manage the entire waste lifecycle internally.
              Others only focus on one part of the chain, such as carrying,
              receiving or producing waste. Waste X is designed to support both.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {operatingModels.map((model) => (
              <SideBlock
                key={model.title}
                title={model.title}
                description={model.description}
                items={model.items}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ================= WHY WASTE X ================= */}
      <section className="relative py-40 text-white overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1642204705127-accc0dcc5779?auto=format&fit=crop&w=2000&q=80"
            alt="Construction waste background"
            fill
            sizes="100vw"
            className="object-cover scale-110"
            priority={false}
          />
        </div>

        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-black/70" />

        {/* Content */}
        <div className="relative max-w-6xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-20">
            Why <span className="text-orange-500">Waste X</span>
          </h2>

          <div className="grid md:grid-cols-2 gap-16">
            <BenefitBlock
              title="Replace Paper, Spreadsheets & Manual Handover"
              text="Waste X gives teams a structured digital workspace for listings, assignments, collections, incidents and receipts — reducing reliance on fragmented admin processes."
            />

            <BenefitBlock
              title="Prepare for DEFRA Digital Waste Tracking"
              text="The platform is being shaped around the UK’s move towards digital waste records, helping operators capture cleaner movement and receipt data from day one."
            />

            <BenefitBlock
              title="Support Multiple Organisation Roles"
              text="A company can operate as a generator, carrier, waste manager, receiver or multi-role organisation without needing separate disconnected systems."
            />

            <BenefitBlock
              title="Create Audit-Ready Chain-of-Custody Records"
              text="Every assignment, status update, verification point and incident record contributes to a clear operational history that can support reporting, reviews and compliance checks."
            />
          </div>
        </div>
      </section>

      {/* ================= PROCESS ================= */}
      <section className="py-32 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mb-16">
            <p className="text-orange-500 font-bold mb-4">
              FROM GENERATION TO RECEIPT
            </p>
            <h2 className="text-4xl font-bold mb-6">
              A structured workflow for the complete waste journey.
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Waste X connects operational activity into one digital record,
              giving each organisation the tools it needs for its own role while
              maintaining visibility across the wider movement.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-6">
            {processSteps.map((step) => (
              <ProcessStep
                key={step.number}
                number={step.number}
                title={step.title}
                description={step.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ================= FOR EVERY ROLE ================= */}
      <section className="py-32 px-6 bg-[#2b2b2b] text-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-4xl mx-auto mb-20">
            <h2 className="text-4xl font-bold mb-6">
              Services for Every Organisation in the Waste Chain
            </h2>
            <p className="text-gray-300 text-lg leading-relaxed">
              Waste X is not limited to one type of operator. It is built around
              the real structure of the waste sector, where each organisation
              may have different duties, permissions and workflows.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-10">
            {roleCards.map((role) => (
              <RoleCard
                key={role.title}
                title={role.title}
                text={role.text}
                items={role.items}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ================= COMPLIANCE ================= */}
      <section className="py-32 px-6 bg-white border-t-8 border-yellow-500">
        <div className="max-w-5xl mx-auto text-center space-y-6 mb-16">
          <h2 className="text-4xl font-bold">
            Regulatory-Ready Digital Waste Infrastructure
          </h2>

          <p className="text-lg text-gray-600 leading-relaxed">
            Compliance should not sit outside operations. Waste X embeds
            compliance activity into the same workflows teams use to create,
            assign, collect, receive and manage waste.
          </p>

          <p className="text-lg text-gray-600 leading-relaxed">
            As the UK moves towards mandatory Digital Waste Tracking, Waste X
            helps organisations build the data habits, audit trails and
            role-based processes needed for a more transparent waste sector.
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-6">
          {compliancePoints.map((point) => (
            <CompliancePoint
              key={point.title}
              title={point.title}
              text={point.text}
            />
          ))}
        </div>
      </section>

      {/* ================= FINAL POSITIONING ================= */}
      <section className="py-28 px-6 bg-gray-100">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-orange-500 font-bold mb-4">
              BUILT FOR THE NEXT PHASE OF WASTE OPERATIONS
            </p>
            <h2 className="text-4xl font-bold mb-6">
              Start with the workflow you need. Expand as your organisation
              grows.
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed mb-6">
              A small carrier can use Waste X to manage assignments and
              collection records. A receiving site can use it to prepare receipt
              workflows. A large infrastructure business can use it to connect
              internal generation, transport, management and compliance teams.
            </p>
            <p className="text-lg text-gray-600 leading-relaxed">
              The result is a flexible platform that supports today’s operations
              while preparing businesses for tomorrow’s digital reporting
              requirements.
            </p>
          </div>

          <div className="border-2 border-orange-500 bg-white p-10 shadow-sm">
            <h3 className="text-2xl font-bold mb-6">
              Waste X is designed for:
            </h3>

            <ul className="space-y-4 text-gray-700">
              <li>• Construction and demolition waste operations</li>
              <li>• Licensed waste carriers</li>
              <li>• Waste managers and receiving sites</li>
              <li>• Multi-site organisations</li>
              <li>• Compliance and environmental teams</li>
              <li>• Businesses preparing for Digital Waste Tracking</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="py-28 px-6 bg-orange-500 text-white text-center">
        <h2 className="text-4xl font-bold mb-6">
          Prepare Your Waste Operations for Digital Tracking
        </h2>

        <p className="text-lg mb-10 max-w-3xl mx-auto leading-relaxed">
          Built for operational clarity. Structured for audit visibility.
          Designed for the UK’s Digital Waste Tracking future.
        </p>

        <button className="bg-black px-10 py-4 font-semibold hover:bg-gray-900 transition">
          Start Your Organisation
        </button>
      </section>
    </main>
  );
}

/* ================= COMPONENTS ================= */

type IndustrialCardProps = {
  title: string;
  text: string;
};

function IndustrialCard({ title, text }: IndustrialCardProps) {
  return (
    <div className="border-2 border-gray-200 p-8 shadow-sm">
      <h3 className="text-xl font-bold mb-4 text-orange-500">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{text}</p>
    </div>
  );
}

type TimelineCardProps = {
  phase: string;
  date: string;
  text: string;
};

function TimelineCard({ phase, date, text }: TimelineCardProps) {
  return (
    <div className="bg-white border-2 border-gray-200 p-6 shadow-sm">
      <div className="text-orange-500 font-bold text-sm mb-3">{phase}</div>
      <h3 className="text-xl font-bold mb-4">{date}</h3>
      <p className="text-gray-600 leading-relaxed text-sm">{text}</p>
    </div>
  );
}

type ProcessStepProps = {
  number: string;
  title: string;
  description: string;
};

function ProcessStep({ number, title, description }: ProcessStepProps) {
  return (
    <div className="border-2 border-gray-200 p-6">
      <div className="text-4xl font-bold text-orange-500 mb-3">{number}</div>
      <div className="font-semibold mb-2">{title}</div>
      <div className="text-sm text-gray-600 leading-relaxed">
        {description}
      </div>
    </div>
  );
}

type SideBlockProps = {
  title: string;
  description: string;
  items: string[];
};

function SideBlock({ title, description, items }: SideBlockProps) {
  return (
    <div className="border border-white/10 bg-black/30 p-10">
      <h3 className="text-2xl font-bold mb-4 text-orange-500">{title}</h3>
      <p className="text-gray-300 mb-8 leading-relaxed">{description}</p>
      <ul className="space-y-4 text-gray-300">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

type BenefitBlockProps = {
  title: string;
  text: string;
};

function BenefitBlock({ title, text }: BenefitBlockProps) {
  return (
    <div className="border border-white/20 p-10 backdrop-blur-sm bg-black/40">
      <h3 className="text-2xl font-bold text-orange-500 mb-6">{title}</h3>
      <p className="text-gray-300 leading-relaxed">{text}</p>
    </div>
  );
}

type RoleCardProps = {
  title: string;
  text: string;
  items: string[];
};

function RoleCard({ title, text, items }: RoleCardProps) {
  return (
    <div className="border border-white/10 bg-black/30 p-8">
      <h3 className="text-2xl font-bold text-orange-500 mb-4">{title}</h3>
      <p className="text-gray-300 mb-8 leading-relaxed">{text}</p>

      <ul className="space-y-3 text-gray-300">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

type CompliancePointProps = {
  title: string;
  text: string;
};

function CompliancePoint({ title, text }: CompliancePointProps) {
  return (
    <div className="border-2 border-gray-200 p-6">
      <h3 className="font-bold text-orange-500 mb-4">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
    </div>
  );
}