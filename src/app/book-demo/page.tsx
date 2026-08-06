import Link from "next/link";

import BookDemoForm from "@/components/app/BookDemoForm";

export const metadata = {
  title: "Book a Demo | Waste X",
  description:
    "Book a Waste X demo for digital waste tracking, compliance reporting and operational workflows.",
};

export default function BookDemoPage() {
  return (
    <main className="min-h-screen bg-[#f7f3ed] text-black">
      {/* ================= NAV ================= */}
      <header className="border-b border-black/10 bg-[#f7f3ed]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight">
              Waste<span className="text-orange-500">X</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-bold text-black/70 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 sm:inline-flex"
            >
              Login
            </Link>

            <Link
              href="/register"
              className="rounded-2xl bg-black px-5 py-3 text-sm font-bold text-orange-400 transition hover:bg-orange-500 hover:text-black"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden bg-black text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.35),transparent_35%),linear-gradient(135deg,rgba(0,0,0,0.95),rgba(0,0,0,0.76))]" />

        <div className="absolute -right-24 top-10 h-72 w-72 rounded-full border border-orange-500/20" />
        <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-orange-500/10 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_0.95fr] lg:py-16">
          {/* ================= LEFT SIDE ================= */}
          <div className="flex flex-col justify-center">
            <div className="mb-6 h-1.5 w-44 bg-orange-500" />

            <p className="text-xs font-black uppercase tracking-[0.35em] text-orange-400">
              Waste X Demo
            </p>

            <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              Digital waste tracking built for real operations.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              Book a quick Waste X walkthrough and see how organisations can
              manage waste listings, assignments, carrier workflows, receipts,
              incidents and audit-ready compliance records in one place.
            </p>

            <div className="mt-10 grid gap-5">
              <DemoFeatureCard
                icon="tracking"
                title="Track movements from listing to completion"
                description="Follow operational activity across listings, assignments, carriers, collections and receipts."
              />

              <DemoFeatureCard
                icon="reporting"
                title="Export records for audits and compliance"
                description="Generate evidence for recordkeeping, internal reviews and Digital Waste Tracking preparation."
              />

              <DemoFeatureCard
                icon="teams"
                title="Built for generators, managers and carriers"
                description="Support hybrid organisations that need different teams and departments working in the same system."
              />
            </div>
          </div>

          {/* ================= RIGHT SIDE FORM ================= */}
          <div className="flex items-center">
            <div className="w-full rounded-[2rem] border border-white/10 bg-white p-4 text-black shadow-2xl sm:p-6">
              <div className="rounded-[1.5rem] border border-black/10 bg-white p-6 sm:p-8">
                <div className="mb-7">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-600">
                    Get access
                  </p>

                  <h2 className="mt-4 text-4xl font-black tracking-tight text-black sm:text-5xl">
                    Book a <span className="text-orange-500">Demo</span>
                  </h2>

                  <div className="mt-4 h-1.5 w-40 bg-orange-500" />

                  <p className="mt-5 text-sm leading-6 text-black/55">
                    Fill out the form below and the request will go directly to
                    Waste X. We’ll get back to you shortly.
                  </p>
                </div>

                <BookDemoForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= LOWER TRUST STRIP ================= */}
      <section className="border-y border-black/10 bg-[#f7f3ed]">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-8 sm:px-8 md:grid-cols-3">
          <TrustItem
            label="For operators"
            text="Designed around the daily workflows of waste generators, managers and carriers."
          />

          <TrustItem
            label="For compliance"
            text="Keep clearer records around assignments, incidents, receipts and movement evidence."
          />

          <TrustItem
            label="For growth"
            text="A cleaner digital workflow for teams moving away from spreadsheets and paper trails."
          />
        </div>
      </section>
    </main>
  );
}

function DemoFeatureCard({
  icon,
  title,
  description,
}: {
  icon: "tracking" | "reporting" | "teams";
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white p-6 text-black shadow-xl">
      <div className="flex gap-5">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-orange-600">
          <FeatureIcon type={icon} />
        </div>

        <div>
          <h3 className="text-xl font-black tracking-tight text-black">
            {title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-black/55">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureIcon({ type }: { type: "tracking" | "reporting" | "teams" }) {
  if (type === "reporting") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="h-7 w-7"
      >
        <path
          d="M5 20V4m0 16h15"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M9 16v-5m4 5V8m4 8v-3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === "teams") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="h-7 w-7"
      >
        <path
          d="M16 11a4 4 0 1 0-8 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M4 20a8 8 0 0 1 16 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M18 8a3 3 0 0 1 3 3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-7 w-7"
    >
      <path
        d="M4 7h10m-7 5h13m-9 5h7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17 4l3 3-3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrustItem({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-[1.5rem] border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-600">
        {label}
      </p>

      <p className="mt-3 text-sm leading-6 text-black/55">{text}</p>
    </div>
  );
}