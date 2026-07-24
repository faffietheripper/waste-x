// src/app/rejected/page.tsx

import Link from "next/link";
import { signOut } from "@/auth";

export default async function RejectedPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <section className="w-full max-w-xl rounded-[2rem] border border-neutral-800 bg-neutral-950 p-8 text-center shadow-2xl shadow-black/40">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-2xl">
            ⚠️
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-400">
            WX-ONBOARDING
          </p>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
            Organisation Not Approved
          </h1>

          <p className="mt-4 text-sm leading-6 text-neutral-400">
            Unfortunately, your organisation was not approved for access to
            Waste X at this stage.
          </p>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-black/40 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Current Status
            </p>

            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-neutral-300">
                Organisation approval
              </span>

              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300">
                Rejected
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 text-left">
            <p className="text-sm font-semibold text-white">
              Think this is a mistake?
            </p>

            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Contact the Waste X support team and include your organisation
              name, account email and any details that may help us review the
              decision.
            </p>

            <a
              href="mailto:tino@wastextracking.com?subject=Waste%20X%20Organisation%20Approval%20Review"
              className="mt-4 inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-300 transition hover:bg-orange-500/20"
            >
              tino@wastextracking.com
            </a>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link
              href="/"
              className="rounded-2xl border border-neutral-700 bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:border-orange-500/50 hover:bg-neutral-800"
            >
              Back to main website
            </Link>

            <Link
              href="/login"
              className="rounded-2xl border border-neutral-700 bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:border-orange-500/50 hover:bg-neutral-800"
            >
              Go to login page
            </Link>
          </div>

          <form
            action={async () => {
              "use server";

              await signOut({
                redirectTo: "/",
              });
            }}
            className="mt-3"
          >
            <button
              type="submit"
              className="w-full rounded-2xl bg-orange-500 px-5 py-3 text-sm font-bold text-black transition hover:bg-orange-400"
            >
              Sign out and return home
            </button>
          </form>

          <p className="mt-6 text-xs leading-5 text-neutral-600">
            WX-ONBOARDING // STATUS: REJECTED
          </p>
        </section>
      </div>
    </main>
  );
}