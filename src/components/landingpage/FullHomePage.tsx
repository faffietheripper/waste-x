"use client";

import {
  AnimatePresence,
  motion,
  type MotionValue,
  useScroll,
  useTransform,
} from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

/* ============================================================================
   WASTE X — MARKETING / PRODUCT HOME PAGE
   ----------------------------------------------------------------------------
   Required images in /public/waste-x/home/

   hero-dashboard.jpg
   active-assignments.jpg
   assignment-detail.jpg
   carrier-hub.jpg
   completed-jobs.jpg
   dwt-receipt.jpg
   marketplace.jpg
   dwt-pack-cover.png

   Optional guide PDF:
   /public/downloads/waste-x-dwt-guide.pdf
============================================================================ */

const productTour = [
  {
    eyebrow: "01 / OPERATE",
    title: "Run the waste operation from one live workspace.",
    text: "See sites, departments, assignments, marketplace activity and digital waste tracking without jumping between disconnected systems.",
    image: "/waste-x/home/hero-dashboard.jpg",
    alt: "Waste X dashboard showing organisation status, capabilities and workflow overview",
    tags: ["Multi-site", "Department aware", "One workspace"],
  },
  {
    eyebrow: "02 / ASSIGN",
    title: "Choose carriers with operational context — not guesswork.",
    text: "Compare workload, completion history, incidents and internal or external carrier options before assigning work.",
    image: "/waste-x/home/carrier-hub.jpg",
    alt: "Waste X Carrier Hub showing carrier options and operational context",
    tags: ["Carrier context", "Workload visibility", "Internal + external"],
  },
  {
    eyebrow: "03 / MOVE",
    title: "Keep active work visible from assignment to collection.",
    text: "Teams can see what is waiting, what is active and what needs attention from one operational queue.",
    image: "/waste-x/home/active-assignments.jpg",
    alt: "Waste X active assignments screen",
    tags: ["Live jobs", "Clear status", "Operational visibility"],
  },
  {
    eyebrow: "04 / RECEIVE",
    title: "Capture receipt information inside the workflow.",
    text: "Receiving teams can record movement and receipt information in a structured flow designed around digital reporting.",
    image: "/waste-x/home/dwt-receipt.jpg",
    alt: "Waste X Digital Waste Tracking receipt workflow",
    tags: ["Receipt workflow", "Structured records", "DWT"],
  },
  {
    eyebrow: "05 / PROVE",
    title: "Keep a connected record of every handover and decision.",
    text: "Assignments, status changes, verification and incidents stay linked so teams can understand what happened and when.",
    image: "/waste-x/home/assignment-detail.jpg",
    alt: "Waste X assignment detail page with movement and verification information",
    tags: ["Chain of custody", "Audit history", "Exceptions"],
  },
];

const roleFeatures = [
  {
    title: "Managers",
    kicker: "CONTROL THE FLOW",
    heading: "See the job, choose the route and keep work moving.",
    text: "Managers can oversee work, compare carrier options and keep assignment decisions visible from one place.",
    image: "/waste-x/home/carrier-hub.jpg",
    alt: "Waste X manager Carrier Hub",
    points: [
      "Route work internally or externally",
      "Compare carrier workload and history",
      "Track active and completed assignments",
    ],
  },
  {
    title: "Carriers",
    kicker: "WORK CLEARLY",
    heading: "Know what is assigned, active and complete.",
    text: "Carrier teams get a clear operational queue instead of chasing job details through calls, messages and spreadsheets.",
    image: "/waste-x/home/active-assignments.jpg",
    alt: "Waste X active assignments for carrier operations",
    points: [
      "Accept and progress assignments",
      "Confirm collection activity",
      "Keep job status visible to the wider chain",
    ],
  },
  {
    title: "Generators",
    kicker: "CREATE + ROUTE",
    heading: "Turn waste requirements into structured, actionable work.",
    text: "Generators can create listings, route work and keep movement information connected to the job from the start.",
    image: "/waste-x/home/marketplace.jpg",
    alt: "Waste X marketplace listings",
    points: [
      "Create structured waste listings",
      "Use direct award or market routes",
      "Keep listings linked to assignment records",
    ],
  },
  {
    title: "Compliance",
    kicker: "SEE THE EVIDENCE",
    heading: "Audit the operation without rebuilding the story.",
    text: "Compliance teams can review completed work and operational history without creating a second disconnected process.",
    image: "/waste-x/home/completed-jobs.jpg",
    alt: "Waste X completed jobs and audit view",
    points: [
      "Review completed movement history",
      "Follow incidents and verification evidence",
      "Prepare cleaner records for reporting",
    ],
  },
];

const benefitRows = [
  {
    number: "01",
    title: "Less fragmented admin",
    text: "Move away from disconnected emails, spreadsheets and paper handovers.",
  },
  {
    number: "02",
    title: "Better visibility",
    text: "See who created, assigned, collected and received each movement.",
  },
  {
    number: "03",
    title: "Clear accountability",
    text: "Role-aware workflows make ownership of each stage easier to understand.",
  },
  {
    number: "04",
    title: "Faster audit preparation",
    text: "Keep movement history, incidents and receipt records in one structured system.",
  },
  {
    number: "05",
    title: "Scalable operations",
    text: "Support generators, carriers, managers, receivers and compliance teams in one platform.",
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

export default function FullHomePage() {
  return (
    <main className="bg-[#f6f1e9] text-[#0d0d0d]">
      <Hero />
      <MovementStrip />
      <DisappearingProductTour />
      <RoleSwitcher />
      <DwtGuide />
      <Benefits />
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(249,115,22,0.22),transparent_28%),radial-gradient(circle_at_85%_28%,rgba(249,115,22,0.10),transparent_24%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/10" />

      <div className="relative mx-auto grid max-w-[1440px] items-center gap-14 lg:grid-cols-[0.86fr_1.14fr] lg:gap-16">
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-orange-300">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            Digital waste operations, connected
          </div>

          <h1 className="max-w-3xl text-5xl font-semibold leading-[0.97] tracking-[-0.055em] sm:text-6xl lg:text-7xl xl:text-[82px]">
            Control every waste movement.
            <span className="block text-orange-500">Prove every handover.</span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/65 sm:text-xl">
            Waste X connects generators, managers, carriers, receiving sites and
            compliance teams in one operational workflow — from creation to
            receipt and audit.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/book-demo"
              className="inline-flex items-center justify-center rounded-full bg-orange-500 px-7 py-4 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:bg-orange-400"
            >
              Book a demo <span className="ml-2">→</span>
            </Link>

            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-7 py-4 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
            >
              Sign in
            </Link>
          </div>

          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/45">
            <span>✓ Multi-role organisations</span>
            <span>✓ Chain-of-custody records</span>
            <span>✓ Digital reporting workflows</span>
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
            <BrowserBar label="Waste X / Live product" />

            <div className="relative aspect-[16/9] overflow-hidden rounded-[20px] bg-[#f6f1e9]">
              <Image
                src="/waste-x/home/hero-dashboard.jpg"
                alt="Waste X dashboard interface"
                fill
                priority
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-cover object-left-top"
              />
            </div>
          </div>

          <div className="absolute -bottom-6 left-4 rounded-2xl border border-white/10 bg-black/90 px-5 py-4 shadow-xl backdrop-blur md:left-[-28px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">
              Connected chain of custody
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              One record across each stage.
            </p>
          </div>

          <div className="absolute -right-3 top-16 hidden rounded-2xl border border-orange-500/30 bg-[#17120e]/95 px-5 py-4 shadow-xl backdrop-blur sm:block lg:right-[-26px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">
              DWT workflow
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              Receipt data captured in-product.
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
   MOVEMENT STRIP
============================================================================ */

function MovementStrip() {
  const stages = ["Generate", "Assign", "Collect", "Receive", "Report", "Audit"];

  return (
    <section className="border-b border-black/10 border-t border-black/10 bg-[#fffaf4] px-5 py-5 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs font-bold uppercase tracking-[0.2em] text-black/50 sm:justify-between sm:text-sm">
        {stages.map((stage, index) => (
          <div key={stage} className="contents">
            <span>{stage}</span>
            {index < stages.length - 1 && (
              <span className="text-orange-500">→</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================================
   DISAPPEARING PRODUCT TOUR
============================================================================ */

function DisappearingProductTour() {
  return (
    <section className="relative bg-[#f6f1e9] px-5 sm:px-8 lg:px-10">
      <div className="relative mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
        <ProductTourCopy />
        <ProductTourCarousel />
      </div>
    </section>
  );
}

function ProductTourCopy() {
  return (
    <div className="flex h-fit w-full flex-col justify-center py-20 lg:sticky lg:top-0 lg:h-screen lg:py-0">
      <span className="w-fit rounded-full bg-black px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-orange-400">
        Product tour
      </span>

      <h2 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
        One platform.
        <span className="block text-orange-500">
          Every stage of the movement.
        </span>
      </h2>

      <p className="mt-6 max-w-lg text-lg leading-8 text-black/55">
        Create the record, assign the work, manage the movement and keep the
        evidence connected from start to finish.
      </p>

      <div className="mt-9 hidden max-w-md border-l-2 border-orange-500 pl-5 text-sm leading-6 text-black/45 lg:block">
        Scroll through Waste X to see how each part of the operation connects.
      </div>
    </div>
  );
}

function ProductTourCarousel() {
  const ref = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  return (
    <div className="relative w-full pb-24 lg:pb-36">
      <div className="sticky top-0 z-20 hidden h-24 w-full bg-gradient-to-b from-[#f6f1e9] via-[#f6f1e9] to-[#f6f1e9]/0 lg:block" />

      <div
        ref={ref}
        className="relative z-10 flex flex-col gap-8 lg:gap-14"
      >
        {productTour.map((item, index) => (
          <TourCard
            key={item.title}
            item={item}
            position={index + 1}
            numItems={productTour.length}
            scrollYProgress={scrollYProgress}
          />
        ))}
      </div>

      <div className="h-12 lg:h-24" />
    </div>
  );
}

type TourCardProps = {
  item: (typeof productTour)[number];
  position: number;
  numItems: number;
  scrollYProgress: MotionValue<number>;
};

function TourCard({
  item,
  position,
  numItems,
  scrollYProgress,
}: TourCardProps) {
  const stepSize = 1 / numItems;
  const end = stepSize * position;
  const start = end - stepSize;

  const opacity = useTransform(scrollYProgress, [start, end], [1, 0]);
  const scale = useTransform(scrollYProgress, [start, end], [1, 0.8]);
  const y = useTransform(scrollYProgress, [start, end], [0, -32]);

  return (
    <motion.article
      style={{ opacity, scale, y }}
      className="origin-center overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-[0_24px_80px_rgba(17,17,17,0.08)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-black/10 bg-[#eee8df]">
        <Image
          src={item.image}
          alt={item.alt}
          fill
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover object-left-top"
        />
      </div>

      <div className="p-6 sm:p-8">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-500">
          {item.eyebrow}
        </div>

        <h3 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {item.title}
        </h3>

        <p className="mt-3 max-w-2xl leading-7 text-black/55">
          {item.text}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-black/10 bg-[#faf7f2] px-3 py-1.5 text-xs font-medium text-black/55"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </motion.article>
  );
}

/* ============================================================================
   ROLE SWITCHER
============================================================================ */

function RoleSwitcher() {
  const [selected, setSelected] = useState(0);
  const active = roleFeatures[selected];

  return (
    <section className="bg-[#0a0a0a] px-5 py-24 text-white sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-12 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
            Built around real roles
          </p>

          <h2 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
            The right view for the people doing the work.
          </h2>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-white/50">
            Waste X can support one-role businesses or organisations operating
            across several parts of the waste chain.
          </p>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[270px_1fr] lg:gap-12">
          <RoleTabs selected={selected} setSelected={setSelected} />

          <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[#141414]">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.3 }}
              >
                <div className="relative aspect-[16/9] overflow-hidden border-b border-white/10 bg-[#eee8df]">
                  <Image
                    src={active.image}
                    alt={active.alt}
                    fill
                    sizes="(min-width: 1024px) 70vw, 100vw"
                    className="object-cover object-left-top"
                  />
                </div>

                <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_0.8fr] lg:p-12">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-orange-500">
                      {active.kicker}
                    </p>

                    <h3 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.035em] lg:text-4xl">
                      {active.heading}
                    </h3>

                    <p className="mt-5 max-w-xl leading-7 text-white/50">
                      {active.text}
                    </p>
                  </div>

                  <div className="space-y-3 lg:pt-2">
                    {active.points.map((point) => (
                      <div
                        key={point}
                        className="flex items-start gap-3 border-t border-white/10 pt-4 text-sm leading-6 text-white/75"
                      >
                        <span className="mt-0.5 text-orange-500">✓</span>
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function RoleTabs({
  selected,
  setSelected,
}: {
  selected: number;
  setSelected: (index: number) => void;
}) {
  return (
    <div className="overflow-x-auto lg:overflow-visible">
      <div className="flex min-w-max lg:block lg:min-w-0">
        {roleFeatures.map((feature, index) => {
          const isSelected = selected === index;

          return (
            <div key={feature.title} className="group relative">
              <button
                type="button"
                onClick={() => setSelected(index)}
                className="relative z-10 flex min-w-[180px] items-center border-b border-white/10 px-5 py-5 text-left transition lg:w-full lg:min-w-0 lg:border-b-0 lg:border-l lg:px-7 lg:py-7"
              >
                <span
                  className={`text-xl font-semibold tracking-[-0.02em] transition sm:text-2xl ${
                    isSelected
                      ? "text-white"
                      : "text-white/35 group-hover:text-white/65"
                  }`}
                >
                  {feature.title}
                </span>
              </button>

              {isSelected && (
                <motion.span
                  layoutId="waste-x-role-slider"
                  className="absolute bottom-0 left-0 right-0 z-20 h-0.5 bg-orange-500 lg:bottom-0 lg:right-auto lg:top-0 lg:h-full lg:w-1"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
   DWT GUIDE
============================================================================ */

function DwtGuide() {
  return (
    <section className="bg-[#fffaf4] px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1440px] overflow-hidden rounded-[34px] border border-black/10 bg-white shadow-[0_24px_80px_rgba(17,17,17,0.06)]">
        <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
          <div className="relative min-h-[460px] overflow-hidden bg-[#0a0a0a] lg:min-h-[640px]">
            <Image
              src="/waste-x/home/dwt-pack-cover.png"
              alt="Waste X Preparing for Digital Waste Tracking guide cover"
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-contain object-left-top p-5 sm:p-8"
            />
          </div>

          <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-16">
            <div className="w-fit rounded-full bg-orange-500 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-black">
              Free Waste X guide
            </div>

            <h2 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Preparing for Digital Waste Tracking?
            </h2>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-black/55">
              A practical readiness guide for UK waste operations covering the
              reporting shift, receipt routes, operational preparation and how
              Waste X fits into a software-led workflow.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                "Requirements + timelines",
                "Receipt reporting routes",
                "Operational readiness",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-black/10 bg-[#faf7f2] p-4 text-sm font-semibold"
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="/downloads/waste-x-dwt-guide.pdf"
                className="inline-flex items-center justify-center rounded-full bg-black px-7 py-4 text-sm font-bold text-white transition hover:bg-orange-500 hover:text-black"
              >
                Download the guide <span className="ml-2">↓</span>
              </a>

              <Link
                href="/book-demo"
                className="inline-flex items-center justify-center rounded-full border border-black/15 px-7 py-4 text-sm font-bold transition hover:border-black/30"
              >
                Talk to Waste X <span className="ml-2">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   BENEFITS
============================================================================ */

function Benefits() {
  return (
    <section className="bg-[#0a0a0a] px-5 py-24 text-white sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
              Why Waste X
            </p>

            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Build compliance into the workflow.
            </h2>

            <p className="mt-6 max-w-lg text-lg leading-8 text-white/50">
              Waste X keeps operational evidence inside the same workflow teams
              use to create, assign, collect, receive and review waste movements.
            </p>
          </div>

          <div className="border-t border-white/15">
            {benefitRows.map((item) => (
              <div
                key={item.number}
                className="grid gap-3 border-b border-white/15 py-6 sm:grid-cols-[70px_1fr_1fr] sm:items-center sm:gap-8"
              >
                <span className="text-sm font-bold text-orange-500">
                  {item.number}
                </span>

                <h3 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                  {item.title}
                </h3>

                <p className="leading-7 text-white/45">{item.text}</p>
              </div>
            ))}
          </div>
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
            See Waste X in your workflow
          </p>

          <h2 className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
            Less chasing. More visibility. A cleaner digital record.
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