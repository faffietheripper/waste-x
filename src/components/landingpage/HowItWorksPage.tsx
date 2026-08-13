


"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  type MouseEvent as ReactMouseEvent,
  useRef,
} from "react";

const CURSOR_WIDTH = 32;
const HOVER_PADDING = 22;

const audienceCards = [
  {
    eyebrow: "GENERATORS",
    title: "Create & route work",
    text: "Build the waste record, choose the route and keep the job connected from the start.",
    href: "#create",
    image: "/waste-x/home/marketplace.jpg",
  },
  {
    eyebrow: "CARRIERS",
    title: "Accept & collect",
    text: "See assigned work, progress collections and keep movement status visible.",
    href: "#collect",
    image: "/waste-x/home/active-assignments.jpg",
  },
  {
    eyebrow: "RECEIVERS",
    title: "Receive & report",
    text: "Capture incoming waste and receipt information inside the operational workflow.",
    href: "#receive",
    image: "/waste-x/home/dwt-receipt.jpg",
  },
  {
    eyebrow: "FULL CHAIN",
    title: "Connect the whole journey",
    text: "One platform for organisations operating across generation, carriage, management and compliance.",
    href: "#full-chain",
    image: "/waste-x/home/hero-dashboard.jpg",
  },
];

const workflowSteps = [
  {
    number: "01",
    label: "CREATE",
    title: "Create the waste record",
    text: "Capture the site, material, quantity and movement details before the job begins.",
    image: "/waste-x/home/marketplace.jpg",
    alt: "Waste X marketplace and waste listings",
    id: "create",
    points: [
      "Structured waste information from the start",
      "Direct award, internal route or marketplace workflow",
    ],
  },
  {
    number: "02",
    label: "ROUTE",
    title: "Choose how the work moves",
    text: "Managers can route work internally or compare external carrier options with operational context.",
    image: "/waste-x/home/carrier-hub.jpg",
    alt: "Waste X Carrier Hub",
    id: "route",
    points: [
      "Internal and external assignment routes",
      "Carrier workload and operational history visible",
    ],
  },
  {
    number: "03",
    label: "COLLECT",
    title: "Collect and confirm",
    text: "Carriers see what has been assigned, what is active and what needs attention.",
    image: "/waste-x/home/active-assignments.jpg",
    alt: "Waste X active assignments",
    id: "collect",
    points: [
      "Clear job status and assignment ownership",
      "Collection progress becomes part of the movement history",
    ],
  },
  {
    number: "04",
    label: "RECEIVE",
    title: "Receive and structure the record",
    text: "Receiving teams capture receipt information where the movement is actually completed.",
    image: "/waste-x/home/dwt-receipt.jpg",
    alt: "Waste X Digital Waste Tracking receipt workflow",
    id: "receive",
    points: [
      "Receipt data captured inside the workflow",
      "Information shaped for digital reporting processes",
    ],
  },
  {
    number: "05",
    label: "PROVE",
    title: "Review the complete history",
    text: "Assignments, verification, incidents and receipt activity remain connected for review and audit.",
    image: "/waste-x/home/assignment-detail.jpg",
    alt: "Waste X assignment details and audit history",
    id: "audit",
    points: [
      "Connected chain-of-custody evidence",
      "Cleaner review, incident and audit preparation",
    ],
  },
];

const readinessPoints = [
  {
    number: "01",
    title: "Digital Waste Tracking",
    text: "Structure operational records around a more digital reporting future.",
  },
  {
    number: "02",
    title: "Receipt workflows",
    text: "Capture receiving-site information as part of normal operations.",
  },
  {
    number: "03",
    title: "Role-aware records",
    text: "Each team works in the context relevant to its responsibility.",
  },
  {
    number: "04",
    title: "Audit visibility",
    text: "Keep the history connected instead of rebuilding it later.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export default function HowItWorksPage() {
  return (
    <main className="bg-[#f6f1e9] text-[#0d0d0d]">
      <Hero />
      <AudienceOutlineCards />
      <WorkflowIntro />
      <WorkflowJourney />
      <FullChainSection />
      <ReadinessSection />
      <FinalCta />
    </main>
  );
}

/* ============================================================================
   HERO
============================================================================ */

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#090909] px-5 pb-20 pt-24 text-white sm:px-8 lg:px-10 lg:pb-28 lg:pt-28">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_5%,rgba(249,115,22,0.24),transparent_28%),radial-gradient(circle_at_82%_22%,rgba(249,115,22,0.10),transparent_24%)]" />

      <div className="relative mx-auto grid max-w-[1440px] items-center gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <div className="inline-flex items-center gap-3 rounded-full border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-orange-300">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            How Waste X works
          </div>

          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.97] tracking-[-0.055em] sm:text-6xl lg:text-7xl xl:text-[82px]">
            One movement.
            <span className="block text-orange-500">One connected record.</span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/60 sm:text-xl">
            Waste X connects creation, assignment, collection, receipt and audit
            so every organisation works from the stage that matters to them
            without breaking the wider chain.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="#workflow"
              className="inline-flex items-center justify-center rounded-full bg-orange-500 px-7 py-4 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:bg-orange-400"
            >
              See the workflow <span className="ml-2">↓</span>
            </a>

            <Link
              href="/book-demo"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-7 py-4 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
            >
              Book a demo
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.85,
            delay: 0.12,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="relative"
        >
          <div className="absolute -inset-10 rounded-[48px] bg-orange-500/10 blur-3xl" />

          <div className="relative rounded-[28px] border border-white/10 bg-[#171717] p-2 shadow-2xl shadow-black/50 sm:p-3">
            <BrowserBar label="Waste X / Connected operations" />

            <div className="relative aspect-[16/9] overflow-hidden rounded-[20px] bg-[#f6f1e9]">
              <Image
                src="/waste-x/home/hero-dashboard.jpg"
                alt="Waste X dashboard"
                fill
                priority
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover object-left-top"
              />
            </div>
          </div>

          <div className="absolute -bottom-6 left-4 rounded-2xl border border-white/10 bg-black/90 px-5 py-4 shadow-xl backdrop-blur md:left-[-28px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">
              From creation to audit
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              Every stage stays connected.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function BrowserBar({ label }: { label: string }) {
  return (
    <div className="mb-2 flex items-center justify-between px-3 py-2">
      <div className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
      </div>

      <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/35">
        {label}
      </span>
    </div>
  );
}

/* ============================================================================
   OUTLINE CARDS — ADAPTED FROM THE HOVER EFFECT YOU LIKED
============================================================================ */

function AudienceOutlineCards() {
  const cursorRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (event: ReactMouseEvent<HTMLElement>) => {
    const cursorEl = cursorRef.current;
    if (!cursorEl) return;

    const target = event.target as HTMLElement;
    const card = target.closest(".outline-card") as HTMLElement | null;

    cursorEl.style.opacity = "1";

    if (card) {
      const { width, height, top, left } = card.getBoundingClientRect();

      cursorEl.style.transition =
        "width 220ms ease, height 220ms ease, border-radius 220ms ease, top 220ms ease, left 220ms ease, opacity 160ms ease";
      cursorEl.style.width = `${width + HOVER_PADDING}px`;
      cursorEl.style.height = `${height + HOVER_PADDING}px`;
      cursorEl.style.borderRadius = "26px";
      cursorEl.style.top = `${top + height / 2}px`;
      cursorEl.style.left = `${left + width / 2}px`;
    } else {
      cursorEl.style.transition = "width 120ms ease, height 120ms ease, opacity 160ms ease";
      cursorEl.style.width = `${CURSOR_WIDTH}px`;
      cursorEl.style.height = `${CURSOR_WIDTH}px`;
      cursorEl.style.borderRadius = `${CURSOR_WIDTH}px`;
      cursorEl.style.top = `${event.clientY}px`;
      cursorEl.style.left = `${event.clientX}px`;
    }
  };

  const handleMouseLeave = () => {
    if (cursorRef.current) {
      cursorRef.current.style.opacity = "0";
    }
  };

  return (
    <section
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative overflow-hidden bg-[#fffaf4] px-5 py-24 lg:cursor-none sm:px-8 lg:px-10 lg:py-28"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              Start where you work
            </p>

            <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Different roles. One operational chain.
            </h2>
          </div>

          <p className="max-w-xl text-lg leading-8 text-black/50">
            Waste X does not force every organisation into the same workflow.
            Choose the part of the chain that looks like your operation.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {audienceCards.map((card) => (
            <OutlineCard key={card.title} {...card} />
          ))}
        </div>
      </div>

      <div
        ref={cursorRef}
        style={{
          width: 0,
          height: 0,
          borderRadius: CURSOR_WIDTH,
          top: 0,
          left: 0,
          opacity: 0,
        }}
        className="pointer-events-none fixed z-[80] hidden -translate-x-1/2 -translate-y-1/2 border border-black/55 lg:block"
      />
    </section>
  );
}

type OutlineCardProps = (typeof audienceCards)[number];

function OutlineCard({
  eyebrow,
  title,
  text,
  href,
  image,
}: OutlineCardProps) {
  return (
    <a
      href={href}
      className="outline-card group relative flex aspect-[4/5] w-full flex-col justify-end overflow-hidden rounded-[22px] bg-[#171717] shadow-[0_18px_50px_rgba(17,17,17,0.14)] lg:cursor-none"
    >
      <Image
        src={image}
        alt=""
        fill
        sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
        className="pointer-events-none object-cover object-left-top transition duration-700 ease-out group-hover:scale-[1.045]"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/28 to-transparent" />

      <div className="pointer-events-none relative z-10 p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">
          {eyebrow}
        </p>

        <div className="mt-2 flex items-end justify-between gap-4">
          <h3 className="text-2xl font-semibold tracking-[-0.03em] text-white">
            {title}
          </h3>

          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 text-lg text-white transition group-hover:border-orange-500 group-hover:bg-orange-500 group-hover:text-black">
            →
          </span>
        </div>

        <p className="mt-3 max-w-sm text-sm leading-6 text-white/55">
          {text}
        </p>
      </div>
    </a>
  );
}



/* ============================================================================
   WORKFLOW INTRO
============================================================================ */

function WorkflowIntro() {
  return (
    <section id="workflow" className="bg-[#f6f1e9] px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              The Waste X model
            </p>

            <h2 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Five stages.
              <span className="block text-black/35">One record.</span>
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-5">
            {workflowSteps.map((step, index) => (
              <a
                key={step.number}
                href={`#${step.id}`}
                className="group relative border-t border-black/15 py-5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-orange-500">
                    {step.number}
                  </span>
                  {index < workflowSteps.length - 1 && (
                    <span className="hidden text-black/20 sm:block">→</span>
                  )}
                </div>

                <p className="mt-8 text-sm font-semibold uppercase tracking-[0.12em] text-black/45 transition group-hover:text-black">
                  {step.label}
                </p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   PRODUCT-LED WORKFLOW JOURNEY
============================================================================ */

function WorkflowJourney() {
  return (
    <section className="bg-[#f6f1e9] pb-24 lg:pb-32">
      {workflowSteps.map((step, index) => (
        <WorkflowStage key={step.number} step={step} index={index} />
      ))}
    </section>
  );
}

function WorkflowStage({
  step,
  index,
}: {
  step: (typeof workflowSteps)[number];
  index: number;
}) {
  const dark = index % 2 === 1;

  return (
    <section
      id={step.id}
      className={`scroll-mt-20 px-5 py-12 sm:px-8 lg:px-10 lg:py-16 ${
        dark ? "bg-[#0a0a0a] text-white" : "bg-[#fffaf4] text-black"
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`mx-auto grid max-w-[1440px] items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
          index % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
        }`}
      >
        <div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-orange-500">
              {step.number}
            </span>
            <span
              className={`h-px w-12 ${
                dark ? "bg-white/20" : "bg-black/15"
              }`}
            />
            <span
              className={`text-[11px] font-bold uppercase tracking-[0.22em] ${
                dark ? "text-white/45" : "text-black/45"
              }`}
            >
              {step.label}
            </span>
          </div>

          <h3 className="mt-6 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-5xl">
            {step.title}
          </h3>

          <p
            className={`mt-5 max-w-xl text-lg leading-8 ${
              dark ? "text-white/50" : "text-black/50"
            }`}
          >
            {step.text}
          </p>

          <div className="mt-8 max-w-xl">
            {step.points.map((point) => (
              <div
                key={point}
                className={`flex items-start gap-3 border-t py-4 text-sm leading-6 ${
                  dark
                    ? "border-white/10 text-white/70"
                    : "border-black/10 text-black/65"
                }`}
              >
                <span className="text-orange-500">✓</span>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          className={`relative overflow-hidden rounded-[28px] border p-2 shadow-[0_24px_80px_rgba(17,17,17,0.10)] ${
            dark
              ? "border-white/10 bg-[#171717]"
              : "border-black/10 bg-white"
          }`}
        >
          <div className="relative aspect-[16/9] overflow-hidden rounded-[21px] bg-[#eee8df]">
            <Image
              src={step.image}
              alt={step.alt}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover object-left-top"
            />
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ============================================================================
   FULL-CHAIN SECTION
============================================================================ */

function FullChainSection() {
  return (
    <section
      id="full-chain"
      className="scroll-mt-20 bg-[#0a0a0a] px-5 py-24 text-white sm:px-8 lg:px-10 lg:py-32"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="grid items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              Full-chain organisations
            </p>

            <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              One company can play more than one role.
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-8 text-white/50">
              A larger organisation may generate, carry, receive and manage waste
              internally. Waste X can keep those teams separate operationally
              while connecting the movement history across the organisation.
            </p>

            <div className="mt-9 flex flex-wrap gap-2">
              {[
                "Generator",
                "Manager",
                "Carrier",
                "Receiver",
                "Compliance",
              ].map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/65"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#171717] p-2 shadow-2xl shadow-black/40">
            <BrowserBar label="Waste X / Multi-role operation" />

            <div className="relative aspect-[16/9] overflow-hidden rounded-[21px] bg-[#eee8df]">
              <Image
                src="/waste-x/home/hero-dashboard.jpg"
                alt="Waste X multi-role dashboard"
                fill
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover object-left-top"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   READINESS
============================================================================ */

function ReadinessSection() {
  return (
    <section className="bg-[#fffaf4] px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-14 grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              Digital reporting readiness
            </p>

            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Better reporting starts with better operations.
            </h2>
          </div>

          <p className="max-w-2xl text-lg leading-8 text-black/50">
            Waste X is designed to capture cleaner movement and receipt data as
            part of the day-to-day workflow, so reporting does not become a
            separate reconstruction exercise.
          </p>
        </div>

        <div className="border-t border-black/15">
          {readinessPoints.map((point) => (
            <div
              key={point.number}
              className="grid gap-3 border-b border-black/15 py-6 sm:grid-cols-[72px_1fr_1fr] sm:items-center sm:gap-8"
            >
              <span className="text-sm font-bold text-orange-500">
                {point.number}
              </span>

              <h3 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                {point.title}
              </h3>

              <p className="leading-7 text-black/45">{point.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   FINAL CTA
============================================================================ */

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-orange-500 px-5 py-24 text-black sm:px-8 lg:px-10 lg:py-32">
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-black/10" />
      <div className="absolute -right-8 -top-8 h-48 w-48 rounded-full border border-black/10" />

      <div className="relative mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-10 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-black/55">
            See the workflow in practice
          </p>

          <h2 className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
            See how Waste X fits your operation.
          </h2>
        </div>

        <Link
          href="/book-demo"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-black px-8 py-4 text-sm font-bold text-white transition hover:-translate-y-0.5"
        >
          Book a demo <span className="ml-2">→</span>
        </Link>
      </div>
    </section>
  );
}