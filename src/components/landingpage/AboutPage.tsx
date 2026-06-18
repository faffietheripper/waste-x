"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

export default function AboutPage() {
  return (
    <main className="bg-white text-gray-900">
      {/* ================= HERO ================= */}
      <section className="relative bg-[#1f1f1f] text-white px-6 py-32 overflow-hidden">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="relative h-[420px]"
          >
            <Image
              src="https://images.unsplash.com/photo-1711618734168-9935518143a4?auto=format&fit=crop&w=1600&q=80"
              alt="Construction waste operations"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover border-4 border-orange-500"
            />
          </motion.div>

          <motion.div initial="hidden" animate="show" variants={fadeUp}>
            <p className="text-orange-500 font-bold mb-4">
              ABOUT WASTE X
            </p>

            <h1 className="text-5xl font-bold leading-tight mb-6">
              Built for the Future of Digital Waste Tracking
            </h1>

            <p className="text-gray-300 text-lg mb-6 leading-relaxed">
              Waste X exists to help UK organisations manage waste movements
              with better structure, clearer accountability and stronger
              audit visibility.
            </p>

            <p className="text-gray-400 mb-10 leading-relaxed">
              The platform is designed for both large organisations managing the
              full waste chain and smaller firms focused on one role, such as
              waste generation, collection, transport, receipt or compliance.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ================= INDUSTRY SHIFT ================= */}
      <section className="py-28 px-6 bg-gray-100 border-t-8 border-orange-500">
        <div className="max-w-5xl mx-auto text-center space-y-6 mb-16">
          <h2 className="text-4xl font-bold">The Industry Is Moving Digital</h2>

          <p className="text-lg text-gray-600 leading-relaxed">
            UK waste operations are shifting away from paper records,
            spreadsheets and disconnected handovers towards structured digital
            systems.
          </p>

          <p className="text-lg text-gray-600 leading-relaxed">
            As DEFRA Digital Waste Tracking develops, organisations will need
            cleaner data, role-based workflows and reliable audit trails across
            the waste journey.
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          <ImageBlock
            src="https://images.unsplash.com/photo-1574974671999-24b7dfbb0d53?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8d2FzdGUlMjBtYW5hZ2VtZW50fGVufDB8fDB8fHww"
            alt="Construction site logistics"
          />

          <ImageBlock
            src="https://images.unsplash.com/photo-1722482445685-91a6b17d5d02?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjB8fHdhc3RlJTIwbWFuYWdlbWVudHxlbnwwfHwwfHx8MA%3D%3D"
            alt="Material handling"
          />

          <ImageBlock
            src="https://images.unsplash.com/photo-1717667745836-145a38948ebf?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTJ8fHdhc3RlJTIwbWFuYWdlbWVudHxlbnwwfHwwfHx8MA%3D%3D"
            alt="Waste site management"
          />
        </div>
      </section>

      {/* ================= FOUNDATIONAL PROBLEMS ================= */}
      <section className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-12 mb-20">
          <IndustrialCard
            title="Disconnected Waste Records"
            text="Waste movements are often managed through emails, paper notes and spreadsheets that are difficult to audit."
          />

          <IndustrialCard
            title="Complex Organisation Roles"
            text="Some businesses manage the full waste process, while others only operate as generators, carriers or receivers."
          />

          <IndustrialCard
            title="Digital Compliance Pressure"
            text="Digital Waste Tracking is increasing the need for structured records, receipt data and reliable chain-of-custody visibility."
          />
        </div>

        <div className="max-w-6xl mx-auto relative h-[400px]">
          <Image
            src="https://images.unsplash.com/photo-1528323273322-d81458248d40?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fHdhc3RlJTIwbWFuYWdlbWVudHxlbnwwfHwwfHx8MA%3D%3D"
            alt="Construction waste transport"
            fill
            sizes="100vw"
            className="object-cover border border-gray-300"
          />
        </div>
      </section>

      {/* ================= SYSTEM ARCHITECTURE ================= */}
      <section className="py-32 px-6 bg-gray-50 border-t-4 border-gray-200">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-20">
            The Waste X Infrastructure Approach
          </h2>

          <div className="grid md:grid-cols-5 gap-8 text-center">
            <ProcessStep
              number="01"
              title="Generate"
              description="Waste is recorded digitally at source."
            />
            <Arrow />
            <ProcessStep
              number="02"
              title="Assign"
              description="Work is routed internally or to external carriers."
            />
            <Arrow />
            <ProcessStep
              number="03"
              title="Collect"
              description="Carriers confirm collection activity."
            />
          </div>

          <div className="grid md:grid-cols-5 gap-8 text-center mt-10">
            <ProcessStep
              number="04"
              title="Receive"
              description="Waste managers record receipt activity."
            />
            <Arrow />
            <ProcessStep
              number="05"
              title="Audit"
              description="The system builds a structured compliance record."
            />
          </div>
        </div>
      </section>

      {/* ================= WHO IT'S FOR ================= */}
      <section className="py-32 px-6 bg-[#2b2b2b] text-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-20 items-center">
          <SideBlock
            title="Built for Every Waste Operating Model"
            description="Waste X supports organisations that manage the full waste lifecycle and smaller firms focused on one part of the process."
            items={[
              "Waste generators and producers",
              "Licensed waste carriers",
              "Waste managers and receiving sites",
              "Full-chain internal waste operations",
              "Compliance and environmental teams",
            ]}
          />

          <div className="relative h-[420px]">
            <Image
              src="https://images.unsplash.com/photo-1600295168769-f5bc53f93b27?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8d2FzdGUlMjBkaXNwb3NhbHxlbnwwfHwwfHx8MA%3D%3D"
              alt="Site manager using tablet"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover border-4 border-orange-500"
            />
          </div>
        </div>
      </section>

      {/* ================= LONG TERM VISION ================= */}
      <section className="py-32 px-6 bg-white border-t-8 border-orange-500">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h2 className="text-4xl font-bold">
            Built for Long-Term Waste Infrastructure
          </h2>

          <p className="text-lg text-gray-600 leading-relaxed">
            Waste X is being developed as digital infrastructure for the next
            phase of UK waste operations — connecting daily workflows with
            compliance-ready records.
          </p>

          <p className="text-lg text-gray-600 leading-relaxed">
            Compliance should not sit outside operations. It should be embedded
            directly into how waste is generated, moved, received and managed.
          </p>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="py-28 px-6 bg-orange-500 text-white text-center">
        <h2 className="text-4xl font-bold mb-6">
          Digital Waste Infrastructure for Every Role
        </h2>

        <p className="text-lg mb-10">
          Built for operational clarity. Structured for audit visibility.
          Designed for Digital Waste Tracking readiness.
        </p>

        <button className="bg-black px-10 py-4 font-semibold hover:bg-gray-900 transition">
          Request Pilot Access
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

function Arrow() {
  return (
    <div className="hidden md:flex items-center justify-center text-3xl text-gray-400">
      →
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
    <div>
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

type ImageBlockProps = {
  src: string;
  alt: string;
};

function ImageBlock({ src, alt }: ImageBlockProps) {
  return (
    <div className="relative h-[260px]">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, 33vw"
        className="object-cover border border-gray-300"
      />
    </div>
  );
}