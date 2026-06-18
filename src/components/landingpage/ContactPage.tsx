"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

export default function ContactPage() {
  return (
    <main className="relative min-h-screen text-white">
      {/* ================= BACKGROUND IMAGE ================= */}
      <div className="fixed inset-0 -z-20">
        <Image
          src="https://images.unsplash.com/photo-1740635313618-35636018c870?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8d2FzdGUlMjBkaXNwb3NhbHxlbnwwfHwwfHx8MA%3D%3D"
          alt="Construction operations background"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      {/* ================= DARK OVERLAY ================= */}
      <div className="fixed inset-0 -z-10 bg-black/85" />

      {/* ================= CONTENT ================= */}
      <div className="pt-40 pb-36 px-6">
        {/* HEADER */}
        <motion.section
          className="max-w-4xl mx-auto text-center mb-24"
          initial="hidden"
          animate="show"
          variants={fadeUp}
        >
          <h1 className="font-[var(--font-heading)] text-6xl tracking-tight mb-6">
            Contact <span className="text-orange-500">Waste X</span>
          </h1>

          <p className="text-gray-300 text-lg leading-relaxed max-w-2xl mx-auto">
            Speak with us about pilot access, Digital Waste Tracking readiness,
            operational deployment, or how Waste X can support your organisation.
          </p>
        </motion.section>

        {/* CONTACT + INFO */}
        <section className="max-w-6xl mx-auto grid md:grid-cols-2 gap-20">
          {/* CONTACT CARD */}
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={fadeUp}
            className="bg-black/70 border border-gray-700 p-12 backdrop-blur-md"
          >
            <h2 className="font-[var(--font-heading)] text-3xl tracking-tight mb-6">
              Get in Touch
            </h2>

            <p className="text-gray-300 leading-relaxed mb-10">
              For enquiries about Waste X, pilot participation, organisation
              setup, or regulatory-aligned waste workflows, contact us directly
              by email.
            </p>

            <div className="border border-orange-500 p-6 mb-8">
              <p className="text-sm text-gray-400 uppercase tracking-wide mb-3">
                Email
              </p>

              <a
                href="mailto:tino@wastextracking.com"
                className="text-2xl font-semibold text-orange-500 hover:text-orange-400 transition break-all"
              >
                tino@wastextracking.com
              </a>
            </div>

            <a
              href="mailto:tino@wastextracking.com?subject=Waste X Enquiry"
              className="inline-flex w-full items-center justify-center bg-orange-500 hover:bg-orange-600 text-black px-6 py-4 font-semibold uppercase tracking-wide transition"
            >
              Email Waste X
            </a>
          </motion.div>

          {/* INFO */}
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={fadeUp}
            className="space-y-16"
          >
            <div>
              <h3 className="font-[var(--font-heading)] text-2xl tracking-tight mb-6">
                Pilot & Regulatory Coordination
              </h3>

              <p className="text-gray-300 leading-relaxed">
                Waste X supports structured waste movement documentation,
                carrier workflows, receipt logging, and compliance visibility
                aligned with the UK’s move towards Digital Waste Tracking.
              </p>
            </div>

            <div className="bg-black/70 border border-gray-700 p-10 backdrop-blur-md space-y-6">
              <InfoRow label="Contact" value="tino@wastextracking.com" />
              <InfoRow label="Operating Region" value="United Kingdom" />
              <InfoRow label="Platform Stage" value="MVP / Pilot Access" />
            </div>

            <div>
              <h3 className="font-[var(--font-heading)] text-2xl tracking-tight mb-6">
                Platform Scope
              </h3>

              <p className="text-gray-300 leading-relaxed">
                Waste X is designed for waste generators, licensed carriers,
                waste managers, receiving sites, full-chain operators, and
                compliance teams that need structured digital waste records.
              </p>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}

/* ================= COMPONENTS ================= */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 text-sm uppercase tracking-wide">
      <span className="text-gray-400">{label}</span>
      <span className="text-white text-right break-all">{value}</span>
    </div>
  );
}