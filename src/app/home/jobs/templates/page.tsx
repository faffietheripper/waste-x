import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobTemplates, users } from "@/db/schema";

import {
  archiveJobTemplateAction,
  restoreJobTemplateAction,
} from "./actions";

type SearchParams = {
  status?: string | string[];
  error?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: Date | null) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export default async function JobTemplatesPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      organisationId: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (!user?.organisationId || !user.isActive || user.isSuspended) {
    redirect("/home");
  }

  const showArchived = first(searchParams?.status) === "archived";

  const templates = await database.query.jobTemplates.findMany({
    where: and(
      eq(jobTemplates.organisationId, user.organisationId),
      eq(jobTemplates.isActive, !showArchived),
    ),
    with: {
      client: {
        columns: { name: true },
      },
      clientSite: {
        columns: { name: true, postcode: true },
      },
      haulier: {
        columns: { name: true },
      },
      driver: {
        columns: { name: true },
      },
      vehicle: {
        columns: { registrationNumber: true },
      },
      materialProfile: {
        columns: { name: true },
        with: {
          ewcCode: {
            columns: { code: true },
          },
        },
      },
    },
    orderBy: [desc(jobTemplates.lastUsedAt), desc(jobTemplates.updatedAt)],
  });

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
                Jobs · Reusable defaults
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Job Templates
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Save recurring operational setups once, then start the next booking with
                the same client, origin, material, transport and planned-load defaults.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/jobs"
                className="rounded-2xl border border-white/15 px-4 py-3 text-xs font-semibold text-white/75 transition hover:bg-white/10"
              >
                ← Jobs
              </Link>
              <Link
                href="/home/jobs/new"
                className="rounded-2xl bg-orange-500 px-5 py-3 text-xs font-bold text-black transition hover:bg-orange-400"
              >
                + Book a Job
              </Link>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap gap-2">
          <Link
            href="/home/jobs/templates"
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              !showArchived
                ? "border-black bg-black text-white"
                : "border-black/10 bg-white text-black/50 hover:border-orange-300"
            }`}
          >
            Active
          </Link>
          <Link
            href="/home/jobs/templates?status=archived"
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              showArchived
                ? "border-black bg-black text-white"
                : "border-black/10 bg-white text-black/50 hover:border-orange-300"
            }`}
          >
            Archived
          </Link>
        </section>

        {templates.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-black/15 bg-white px-8 py-16 text-center">
            <h2 className="text-xl font-semibold text-black">
              {showArchived ? "No archived templates" : "No job templates yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
              {showArchived
                ? "Archived templates will appear here."
                : "Open a booked job and choose Save as template. That keeps template creation tied to a real working setup rather than another setup form."}
            </p>
            {!showArchived && (
              <Link
                href="/home/jobs"
                className="mt-6 inline-flex rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black"
              >
                Open Jobs
              </Link>
            )}
          </section>
        ) : (
          <section className="grid gap-4 xl:grid-cols-2">
            {templates.map((template) => (
              <article
                key={template.id}
                className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                      {template.direction}
                    </p>
                    <h2 className="mt-2 truncate text-xl font-semibold text-black">
                      {template.name}
                    </h2>
                    <p className="mt-1 text-xs text-black/40">
                      Last used {formatDate(template.lastUsedAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-black/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/45">
                    {template.plannedLoads} load{template.plannedLoads === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Info label="Client" value={template.client?.name ?? "Not set"} />
                  <Info
                    label="Origin"
                    value={
                      [template.clientSite?.name, template.clientSite?.postcode]
                        .filter(Boolean)
                        .join(" · ") || "Not set"
                    }
                  />
                  <Info
                    label="Material"
                    value={
                      template.materialProfile
                        ? `${template.materialProfile.name}${
                            template.materialProfile.ewcCode?.code
                              ? ` · ${template.materialProfile.ewcCode.code}`
                              : ""
                          }`
                        : "Not set"
                    }
                  />
                  <Info
                    label="Transport"
                    value={template.haulier?.name ?? "Own transport"}
                  />
                  <Info label="Driver" value={template.driver?.name ?? "Assign later"} />
                  <Info
                    label="Vehicle"
                    value={template.vehicle?.registrationNumber ?? "Assign later"}
                  />
                </div>

                <div className="mt-6 flex flex-wrap gap-3 border-t border-black/5 pt-5">
                  {!showArchived ? (
                    <>
                      <Link
                        href={`/home/jobs/new?template=${template.id}`}
                        className="rounded-2xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black transition hover:bg-orange-400"
                      >
                        Use template
                      </Link>

                      <form action={archiveJobTemplateAction}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <button
                          type="submit"
                          className="rounded-2xl border border-black/10 px-4 py-2.5 text-xs font-semibold text-black/50 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        >
                          Archive
                        </button>
                      </form>
                    </>
                  ) : (
                    <form action={restoreJobTemplateAction}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <button
                        type="submit"
                        className="rounded-2xl bg-black px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                      >
                        Restore
                      </button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-[#faf8f4] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-black">{value}</p>
    </div>
  );
}
