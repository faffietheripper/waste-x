"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-6 py-20 text-black">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-black/10 bg-white p-8 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-600">
          Waste X
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Something went wrong
        </h1>

        <p className="mt-3 text-sm leading-6 text-black/55">
          The page could not be loaded. You can retry, or return to the home
          dashboard.
        </p>

        {error?.digest && (
          <p className="mt-5 rounded-2xl border border-black/10 bg-[#f7f3ed] p-4 font-mono text-xs text-black/50">
            Error digest: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
          >
            Try again
          </button>

          <Link
            href="/home"
            className="rounded-full border border-black/10 bg-[#f7f3ed] px-5 py-3 text-sm font-semibold text-black/60 transition hover:border-orange-300 hover:text-orange-600"
          >
            Go home
          </Link>
        </div>
      </section>
    </main>
  );
}