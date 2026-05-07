import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";

import CreateTicketForm from "@/components/app/Support/CreateTicketForm";

/* =========================================================
   PAGE
========================================================= */

export default async function NewTicketPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser?.organisationId) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-8 text-orange-800 shadow-sm">
          <p className="font-semibold">No organisation found.</p>

          <p className="mt-2 text-sm leading-6">
            You need to belong to an organisation before creating a support
            ticket.
          </p>

          <Link
            href="/home/settings/organisation?reason=no-organisation"
            className="mt-5 inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            Create Organisation →
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="space-y-8">
        {/* BACK */}
        <Link
          href="/home/support"
          className="text-sm font-medium text-black/45 transition hover:text-orange-600"
        >
          ← Back to support tickets
        </Link>

        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Support
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                Create Support Ticket
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Raise a support request for technical issues, access problems,
                billing, compliance questions or workflow support. Add enough
                detail so the issue can be investigated quickly.
              </p>
            </div>

            <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-5 text-right lg:block">
              <p className="text-xs uppercase tracking-widest text-white/35">
                Organisation
              </p>

              <p className="mt-2 max-w-[240px] break-all font-mono text-xs text-orange-400">
                {dbUser.organisationId}
              </p>
            </div>
          </div>
        </section>

        {/* CONTENT */}
        <section className="grid grid-cols-1 gap-8 xl:grid-cols-12">
          {/* LEFT */}
          <aside className="space-y-6 xl:col-span-4">
            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Ticket Guidance
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                What to include
              </h2>

              <p className="mt-2 text-sm leading-6 text-black/45">
                Clear support tickets are easier to investigate. Include where
                the issue happened, what you expected, what actually happened
                and whether it blocks operations.
              </p>

              <div className="mt-6 space-y-3">
                <GuidanceItem text="Page or workflow affected." />
                <GuidanceItem text="Steps to reproduce the problem." />
                <GuidanceItem text="Screenshots or exact error text if available." />
                <GuidanceItem text="Whether this blocks assignments, compliance or billing." />
              </div>
            </div>

            <div className="rounded-3xl border border-black/10 bg-black p-6 text-white shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Priority Use
              </p>

              <h2 className="mt-2 text-xl font-semibold">Choose carefully</h2>

              <div className="mt-5 space-y-4 text-sm leading-6 text-white/55">
                <p>
                  <span className="font-semibold text-orange-300">Urgent</span>{" "}
                  should be used for issues blocking critical operations,
                  access, compliance or live assignment workflows.
                </p>

                <p>
                  <span className="font-semibold text-orange-300">High</span> is
                  for serious issues that need attention soon but are not fully
                  blocking.
                </p>

                <p>
                  <span className="font-semibold text-orange-300">Medium</span>{" "}
                  works for normal support requests.
                </p>
              </div>
            </div>
          </aside>

          {/* FORM */}
          <section className="xl:col-span-8">
            <CreateTicketForm organisationId={dbUser.organisationId} />
          </section>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function GuidanceItem({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-sm leading-6 text-black/55">{text}</p>
    </div>
  );
}
