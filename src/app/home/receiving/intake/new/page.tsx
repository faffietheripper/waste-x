import Link from "next/link";

export default function NewReceivingIntakePage() {
  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-[17vh] text-black">
      <section className="rounded-[2rem] bg-black p-8 text-white shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
          Receiving
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          New Intake
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
          Receiving intake records are linked to assignments. Choose an
          assignment from the intake queue so Waste X can connect the received
          waste, carrier, listing and Digital Waste Tracking submission
          correctly.
        </p>
      </section>

      <section className="mt-8 rounded-[2rem] border border-black/10 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-black">
          Start from an assignment
        </h2>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-black/55">
          For audit safety, Waste X does not create a free-floating intake
          record. Every intake should belong to an operational assignment.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/home/receiving/intake"
            className="inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            Open intake queue →
          </Link>

          <Link
            href="/home/operations/assignments"
            className="inline-flex rounded-full border border-black/10 bg-[#f7f3ed] px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
          >
            View assignments
          </Link>
        </div>
      </section>
    </main>
  );
}