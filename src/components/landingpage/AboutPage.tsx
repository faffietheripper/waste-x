"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  type MouseEvent as ReactMouseEvent,
  useRef,
} from "react";

/* ============================================================================
   WASTE X — ABOUT / INDUSTRY PAGE
   ----------------------------------------------------------------------------
   Purpose:
   - This is the "industry nerd" page.
   - It explains the operational reality behind Waste X.
   - It is intentionally broader than Digital Waste Tracking.
   - DWT appears as one part of the industry direction, not the whole story.

   Existing local assets used:
   /public/waste-x/home/hero-dashboard.jpg
   /public/waste-x/home/active-assignments.jpg
   /public/waste-x/home/carrier-hub.jpg
   /public/waste-x/home/dwt-receipt.jpg
   /public/waste-x/home/marketplace.jpg
   /public/waste-x/home/completed-jobs.jpg
   /public/waste-x/home/dwt-pack-cover.png

   Optional guide:
   /public/downloads/waste-x-dwt-guide.pdf
============================================================================ */

const CURSOR_WIDTH = 30;
const HOVER_PADDING = 20;

/* ============================================================================
   CONTENT
============================================================================ */

const industryPressureCards = [
  {
    eyebrow: "HANDOVERS",
    title: "Many hands. One movement.",
    text: "A single waste movement can involve a site team, manager, carrier, receiving site and compliance function. The operational challenge is keeping that story connected as responsibility changes.",
    image:
      "https://images.unsplash.com/photo-1574974671999-24b7dfbb0d53?w=1200&auto=format&fit=crop&q=80",
  },
  {
    eyebrow: "OPERATING MODELS",
    title: "No two operators look the same.",
    text: "Some businesses only carry waste. Others generate, transport, receive and manage it internally. The sector is made up of very different operating models using the same physical chain.",
    image:
      "https://images.unsplash.com/photo-1722482445685-91a6b17d5d02?w=1200&auto=format&fit=crop&q=80",
  },
  {
    eyebrow: "REALITY",
    title: "The planned job is not always the real job.",
    text: "Loads change, collections move, incidents happen, receiving details differ and sites need answers quickly. Good systems have to record the exception as well as the perfect workflow.",
    image:
      "https://images.unsplash.com/photo-1717667745836-145a38948ebf?w=1200&auto=format&fit=crop&q=80",
  },
];

const wasteDataFields = [
  {
    code: "01",
    title: "Waste identity",
    text: "The material description and classification that explain what the movement actually contains.",
    tags: ["description", "classification", "material"],
  },
  {
    code: "02",
    title: "Origin + site",
    text: "Where the waste originated, which organisation is responsible and the site or project connected to it.",
    tags: ["producer", "site", "project"],
  },
  {
    code: "03",
    title: "Quantity",
    text: "The amount of waste involved and the unit used to record or estimate that quantity.",
    tags: ["weight", "volume", "unit"],
  },
  {
    code: "04",
    title: "Custody + movement",
    text: "Who is responsible for the waste at each stage and when the operational handover takes place.",
    tags: ["carrier", "handover", "status"],
  },
  {
    code: "05",
    title: "Destination + receipt",
    text: "Where the material is going and the receiving-side information needed to close the movement properly.",
    tags: ["receiver", "destination", "receipt"],
  },
  {
    code: "06",
    title: "Exceptions + evidence",
    text: "The incidents, discrepancies and resolution history that explain what happened when the movement did not go exactly to plan.",
    tags: ["incident", "evidence", "resolution"],
  },
];

const operatingModels = [
  {
    number: "01",
    eyebrow: "SPECIALIST",
    title: "Single-role operators",
    text: "A carrier, producer, broker, manager or receiving site may only need the workflows directly connected to its own responsibility.",
    items: [
      "Use only the operational tools relevant to the organisation",
      "Maintain a clear history of the work it owns",
      "Connect with external organisations without copying their whole process",
    ],
  },
  {
    number: "02",
    eyebrow: "HYBRID",
    title: "Multi-role organisations",
    text: "Larger businesses can generate, carry, receive and manage waste internally across several teams, sites or departments.",
    items: [
      "Separate workflows by operational responsibility",
      "Route work internally or externally",
      "Keep one connected organisation-level movement history",
    ],
  },
  {
    number: "03",
    eyebrow: "OVERSIGHT",
    title: "Compliance + environmental teams",
    text: "Oversight teams need visibility across operational activity without becoming the team that manually reconstructs every movement afterwards.",
    items: [
      "Review the complete operational history",
      "Follow incidents and resolution",
      "Prepare cleaner evidence for review and reporting",
    ],
  },
];

const architectureLayers = [
  {
    number: "01",
    eyebrow: "OPERATIONS",
    title: "Capture activity where it happens.",
    text: "Creation, assignment, collection, receipt and incidents should be recorded as operational events rather than left for somebody to reconstruct later.",
  },
  {
    number: "02",
    eyebrow: "CONNECTION",
    title: "Keep the stages tied to the same movement.",
    text: "Digitising five separate processes is not enough. The useful part is preserving the relationship between each handover, decision and update.",
  },
  {
    number: "03",
    eyebrow: "OVERSIGHT",
    title: "Give every team the view it needs.",
    text: "Operational teams need action. Managers need control. Compliance teams need evidence. The platform should support each without creating separate realities.",
  },
];

const dwtPoints = [
  "Digital receipt workflows",
  "Structured operational records",
  "Cleaner reporting data",
  "API-led direction",
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

/* ============================================================================
   PAGE
============================================================================ */

export default function AboutPage() {
  return (
    <main className="bg-[#f6f1e9] text-[#0d0d0d]">
      <Hero />
      <IndustryShift />
      <IndustryPressure />
      <WasteChainData />
      <OperatingModels />
      <ExceptionsSection />
      <InfrastructureApproach />
      <DigitalDirection />
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_5%,rgba(249,115,22,0.22),transparent_28%),radial-gradient(circle_at_82%_28%,rgba(249,115,22,0.08),transparent_24%)]" />

      <div className="relative mx-auto grid max-w-[1440px] items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <div className="inline-flex items-center gap-3 rounded-full border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-orange-300">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            Built around real waste operations
          </div>

          <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[0.97] tracking-[-0.055em] sm:text-6xl lg:text-7xl xl:text-[80px]">
            Built for the reality of
            <span className="block text-orange-500">modern waste operations.</span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/62 sm:text-xl">
            Waste movement sits across sites, people, carriers, receiving
            facilities, managers and compliance teams. Waste X is designed around
            that real operational chain — not a simplified version of it.
          </p>

          <p className="mt-5 max-w-2xl leading-7 text-white/38">
            The goal is simple: make it easier to create work, route it, move it,
            receive it, deal with exceptions and keep a reliable record of what
            happened.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="#industry"
              className="inline-flex items-center justify-center rounded-full bg-orange-500 px-7 py-4 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:bg-orange-400"
            >
              Explore the industry <span className="ml-2">↓</span>
            </a>

            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-7 py-4 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
            >
              See how Waste X works
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

          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#171717] p-2 shadow-2xl shadow-black/50">
            <BrowserBar label="Waste X / Operational workspace" />

            <div className="relative aspect-[16/9] overflow-hidden rounded-[22px] bg-[#eee8df]">
              <Image
                src="/waste-x/home/hero-dashboard.jpg"
                alt="Waste X dashboard"
                fill
                priority
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-cover object-left-top"
              />
            </div>
          </div>

          <div className="absolute -bottom-6 left-4 rounded-2xl border border-white/10 bg-black/90 px-5 py-4 shadow-xl backdrop-blur md:left-[-28px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">
              One operational workspace
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              Different roles. Connected movement.
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
   INDUSTRY SHIFT
============================================================================ */

function IndustryShift() {
  return (
    <section
      id="industry"
      className="scroll-mt-20 bg-[#fffaf4] px-5 py-24 sm:px-8 lg:px-10 lg:py-32"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              The industry context
            </p>

            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Waste is a physical operation with a complicated information trail.
            </h2>
          </div>

          <div className="space-y-8">
            <p className="max-w-3xl text-xl leading-9 text-black/60">
              A skip leaving a construction site looks simple from the outside.
              Operationally, it can involve a producer, project team, manager,
              carrier, receiving site, commercial arrangement, classification,
              quantity, handover, receipt and later compliance review.
            </p>

            <p className="max-w-3xl text-lg leading-8 text-black/48">
              The difficulty is rarely just moving the material. It is
              coordinating the people around the movement and preserving enough
              context that the business still understands the job days, weeks or
              months later.
            </p>

            <div className="grid gap-4 pt-3 sm:grid-cols-3">
              <SmallSignal label="PHYSICAL" value="Waste moves between sites" />
              <SmallSignal label="OPERATIONAL" value="Responsibility changes" />
              <SmallSignal label="RECORD" value="Evidence accumulates over time" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SmallSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-black/15 pt-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

/* ============================================================================
   INDUSTRY PRESSURE — OUTLINE CARDS
============================================================================ */

function IndustryPressure() {
  const cursorRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (event: ReactMouseEvent<HTMLElement>) => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    const target = event.target as HTMLElement;
    const card = target.closest(".industry-outline-card") as HTMLElement | null;

    cursor.style.opacity = "1";

    if (card) {
      const { width, height, top, left } = card.getBoundingClientRect();

      cursor.style.transition =
        "width 220ms ease, height 220ms ease, border-radius 220ms ease, top 220ms ease, left 220ms ease, opacity 150ms ease";
      cursor.style.width = `${width + HOVER_PADDING}px`;
      cursor.style.height = `${height + HOVER_PADDING}px`;
      cursor.style.borderRadius = "28px";
      cursor.style.top = `${top + height / 2}px`;
      cursor.style.left = `${left + width / 2}px`;
    } else {
      cursor.style.transition =
        "width 100ms ease, height 100ms ease, opacity 150ms ease";
      cursor.style.width = `${CURSOR_WIDTH}px`;
      cursor.style.height = `${CURSOR_WIDTH}px`;
      cursor.style.borderRadius = `${CURSOR_WIDTH}px`;
      cursor.style.top = `${event.clientY}px`;
      cursor.style.left = `${event.clientX}px`;
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
      className="relative overflow-hidden bg-[#f6f1e9] px-5 py-24 lg:cursor-none sm:px-8 lg:px-10 lg:py-32"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              Why the industry gets messy
            </p>

            <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              The difficult part is everything between the handovers.
            </h2>
          </div>

          <p className="max-w-xl text-lg leading-8 text-black/50">
            Waste operations are collaborative, distributed and often time
            sensitive. That is exactly where fragmented tools create friction.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {industryPressureCards.map((card) => (
            <IndustryPressureCard key={card.title} {...card} />
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
        className="pointer-events-none fixed z-[80] hidden -translate-x-1/2 -translate-y-1/2 border border-black/60 lg:block"
      />
    </section>
  );
}

function IndustryPressureCard({
  eyebrow,
  title,
  text,
  image,
}: (typeof industryPressureCards)[number]) {
  return (
    <article className="industry-outline-card group relative flex aspect-[4/5] overflow-hidden rounded-[24px] bg-black shadow-[0_22px_60px_rgba(17,17,17,0.14)] lg:cursor-none">
      <Image
        src={image}
        alt=""
        fill
        sizes="(min-width: 768px) 33vw, 100vw"
        className="pointer-events-none object-cover transition duration-700 group-hover:scale-[1.04]"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/5" />

      <div className="pointer-events-none relative z-10 mt-auto p-7 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">
          {eyebrow}
        </p>

        <h3 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
          {title}
        </h3>

        <p className="mt-4 max-w-md text-sm leading-6 text-white/58">{text}</p>
      </div>
    </article>
  );
}

/* ============================================================================
   THE RECORD BEHIND A MOVEMENT
============================================================================ */

function WasteChainData() {
  return (
    <section className="bg-[#fffaf4] px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              For the industry nerds
            </p>

            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              The record behind a movement is bigger than the job number.
            </h2>

            <p className="mt-6 max-w-lg text-lg leading-8 text-black/50">
              A useful operational record explains the waste, the origin, the
              quantity, the organisations involved, the handovers, the
              destination and anything unusual that happened on the way.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-[28px] border border-black/10 bg-black/10 sm:grid-cols-2">
            {wasteDataFields.map((field) => (
              <div key={field.code} className="bg-[#f9f4ed] p-7 sm:p-8">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-orange-500">
                    {field.code}
                  </span>
                  <span className="text-black/15">↘</span>
                </div>

                <h3 className="mt-8 text-2xl font-semibold tracking-[-0.025em]">
                  {field.title}
                </h3>

                <p className="mt-3 leading-7 text-black/48">{field.text}</p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {field.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-black/10 bg-white/50 px-3 py-1.5 text-[11px] font-medium text-black/45"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-center">
          <ChainNode
            label="GENERATOR"
            detail="creates the waste requirement"
          />
          <ChainArrow />
          <ChainNode
            label="MANAGER / CARRIER"
            detail="routes and moves the work"
          />
          <ChainArrow />
          <ChainNode
            label="RECEIVER"
            detail="records what actually arrives"
          />
          <ChainArrow />
          <ChainNode
            label="COMPLIANCE"
            detail="reviews the connected history"
          />
        </div>

        <p className="mt-5 max-w-3xl text-sm leading-6 text-black/40">
          In a full-chain organisation, several of these responsibilities can
          belong to the same company while still sitting with different teams or
          departments.
        </p>
      </div>
    </section>
  );
}

function ChainNode({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-[22px] border border-black/10 bg-white p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-500">
        {label}
      </p>
      <p className="mt-2 text-sm text-black/55">{detail}</p>
    </div>
  );
}

function ChainArrow() {
  return (
    <div className="hidden text-center text-2xl text-orange-500/50 lg:block">
      →
    </div>
  );
}

/* ============================================================================
   OPERATING MODELS
============================================================================ */

function OperatingModels() {
  return (
    <section className="bg-[#f6f1e9] px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-14 grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              Real-world operating models
            </p>

            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              The waste chain does not map neatly to one company type.
            </h2>
          </div>

          <p className="max-w-2xl text-lg leading-8 text-black/50">
            One business might only own a single stage. Another may own most of
            the chain internally. Waste X is designed around capabilities and
            responsibilities rather than forcing every organisation into the same
            shape.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {operatingModels.map((model) => (
            <div
              key={model.number}
              className="rounded-[28px] border border-black/10 bg-white p-7 shadow-[0_18px_50px_rgba(17,17,17,0.05)] sm:p-9"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-orange-500">
                  {model.number}
                </span>

                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/30">
                  {model.eyebrow}
                </span>
              </div>

              <h3 className="mt-8 text-3xl font-semibold tracking-[-0.035em]">
                {model.title}
              </h3>

              <p className="mt-4 leading-7 text-black/48">{model.text}</p>

              <div className="mt-8">
                {model.items.map((item) => (
                  <div
                    key={item}
                    className="flex gap-3 border-t border-black/10 py-4 text-sm leading-6 text-black/62"
                  >
                    <span className="text-orange-500">✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   INCIDENTS / EXCEPTIONS
============================================================================ */

function ExceptionsSection() {
  return (
    <section className="bg-[#fffaf4] px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              The exception matters too
            </p>

            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Real operations do not follow the happy path every time.
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-8 text-black/50">
              Waste X treats incidents and exceptions as part of the operational
              record. That means a problem can stay tied to the assignment it
              affected rather than becoming a detached email or note.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ExceptionCard
              number="01"
              title="Report"
              text="Record the issue against the movement while the operational context still exists."
            />
            <ExceptionCard
              number="02"
              title="Review"
              text="Give the right team visibility of what happened and what action is required."
            />
            <ExceptionCard
              number="03"
              title="Resolve"
              text="Keep resolution activity connected to the original assignment and incident."
            />
            <ExceptionCard
              number="04"
              title="Preserve"
              text="Retain the exception history as part of the final movement record."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ExceptionCard({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[24px] border border-black/10 bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-orange-500">{number}</span>
        <span className="text-black/15">↗</span>
      </div>

      <h3 className="mt-7 text-2xl font-semibold tracking-[-0.025em]">
        {title}
      </h3>

      <p className="mt-3 leading-7 text-black/48">{text}</p>
    </div>
  );
}

/* ============================================================================
   INFRASTRUCTURE APPROACH
============================================================================ */

function InfrastructureApproach() {
  return (
    <section className="bg-[#f6f1e9] px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-14 max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
            The Waste X infrastructure approach
          </p>

          <h2 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
            The useful record should be created by the operation itself.
          </h2>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-black/50">
            The system should not ask somebody to rebuild the story at the end.
            It should preserve the story as teams create, route, move, receive
            and manage the work.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {architectureLayers.map((layer) => (
            <div
              key={layer.number}
              className="relative overflow-hidden rounded-[28px] border border-black/10 bg-[#0a0a0a] p-8 text-white sm:p-10"
            >
              <span className="absolute right-5 top-2 text-[90px] font-semibold tracking-[-0.08em] text-white/[0.035]">
                {layer.number}
              </span>

              <p className="relative text-[10px] font-bold uppercase tracking-[0.22em] text-orange-500">
                {layer.eyebrow}
              </p>

              <h3 className="relative mt-8 text-3xl font-semibold leading-tight tracking-[-0.035em]">
                {layer.title}
              </h3>

              <p className="relative mt-5 leading-7 text-white/45">
                {layer.text}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-[30px] border border-black/10 bg-white p-6 sm:p-8">
          <div className="grid gap-6 sm:grid-cols-3 sm:items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-500">
                RESULT
              </p>
              <p className="mt-2 text-lg font-semibold">
                Less reconstruction after the event.
              </p>
            </div>

            <div className="border-t border-black/10 pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-500">
                RESULT
              </p>
              <p className="mt-2 text-lg font-semibold">
                Clearer operational ownership.
              </p>
            </div>

            <div className="border-t border-black/10 pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-500">
                RESULT
              </p>
              <p className="mt-2 text-lg font-semibold">
                Better evidence when it is needed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   DIGITAL DIRECTION — SMALLER, NOT THE WHOLE PAGE
============================================================================ */

function DigitalDirection() {
  return (
    <section className="bg-[#0a0a0a] px-5 py-24 text-white sm:px-8 lg:px-10 lg:py-28">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid overflow-hidden rounded-[32px] border border-white/10 bg-[#141414] lg:grid-cols-[0.72fr_1.28fr]">
          <div className="relative min-h-[380px] overflow-hidden bg-black lg:min-h-[520px]">
            <Image
              src="/waste-x/home/dwt-pack-cover.png"
              alt="Waste X Preparing for Digital Waste Tracking guide"
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-contain object-left-top p-6 sm:p-9"
            />
          </div>

          <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-16">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              One part of the wider direction
            </p>

            <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
              Digital Waste Tracking matters — but it is not the whole product.
            </h2>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/50">
              Waste X is being shaped to support the industry's move toward
              structured digital reporting, while the day-to-day product remains
              focused on the operational work that creates those records in the
              first place.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {dwtPoints.map((point) => (
                <span
                  key={point}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/55"
                >
                  {point}
                </span>
              ))}
            </div>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="/downloads/waste-x-dwt-guide.pdf"
                className="inline-flex items-center justify-center rounded-full bg-orange-500 px-7 py-4 text-sm font-bold text-black transition hover:bg-orange-400"
              >
                Read the DWT guide <span className="ml-2">↓</span>
              </a>

              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-7 py-4 text-sm font-bold text-white transition hover:border-white/30"
              >
                Explore the product <span className="ml-2">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   CTA
============================================================================ */

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-orange-500 px-5 py-24 text-black sm:px-8 lg:px-10 lg:py-32">
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-black/10" />
      <div className="absolute -right-8 -top-8 h-48 w-48 rounded-full border border-black/10" />

      <div className="relative mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-10 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-black/55">
            Waste operations, connected
          </p>

          <h2 className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
            Build the record while the work is happening.
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