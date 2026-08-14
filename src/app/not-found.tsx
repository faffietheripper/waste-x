import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="min-h-screen bg-[#f7f3ed] px-6 py-20 text-black">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-black/10 bg-white p-8 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-600">
          Waste X
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Page not found
        </h1>

        <p className="mt-3 text-sm leading-6 text-black/55">
          This page does not exist or you do not have access to it.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/home"
            className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
          >
            Go home
          </Link>

          <Link
            href="/"
            className="rounded-full border border-black/10 bg-[#f7f3ed] px-5 py-3 text-sm font-semibold text-black/60 transition hover:border-orange-300 hover:text-orange-600"
          >
            Back to landing page
          </Link>
        </div>
      </section>
    </main>
  );
}