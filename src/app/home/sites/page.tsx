// src/app/home/sites/page.tsx

import Link from "next/link";

import {
  and,
  asc,
  desc,
  eq,
  sql,
} from "drizzle-orm";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  permitEwcCodes,
  sitePermits,
  sites,
  users,
} from "@/db/schema";

import {
  createReceivingSiteAction,
} from "./actions";

/* =========================================================
   TYPES
========================================================= */

type SearchParams = {
  error?: string | string[];
  success?: string | string[];
};

/* =========================================================
   HELPERS
========================================================= */

function firstParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value)
    ? value[0] ?? ""
    : value ?? "";
}

function messageForError(
  value: string,
) {
  const messages: Record<
    string,
    string
  > = {
    site_name_required:
      "Enter a name for the receiving site.",

    site_create_failed:
      "Waste X could not create the receiving site.",

    site_not_found:
      "The receiving site could not be found.",

    receiving_site_already_exists:
      "A primary receiving site already exists.",

    duplicate_site_name:
      "A site with that name already exists.",
  };

  return (
    messages[value] ??
    "Something went wrong."
  );
}

function messageForSuccess(
  value: string,
) {
  const messages: Record<
    string,
    string
  > = {
    receiving_site_created:
      "Receiving site created.",
  };

  return (
    messages[value] ??
    "Changes saved."
  );
}

function permitStatusLabel(
  status: string | null,
) {
  if (!status) {
    return "Not configured";
  }

  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase(),
    );
}

/* =========================================================
   PAGE
========================================================= */

export default async function ReceivingSitePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser =
    await database.query.users.findFirst(
      {
        where: eq(
          users.id,
          session.user.id,
        ),

        columns: {
          id: true,
          organisationId: true,
          role: true,
        },
      },
    );

  if (!currentUser?.organisationId) {
    redirect(
      "/home/settings/organisation?reason=no-organisation",
    );
  }

  const organisationId =
    currentUser.organisationId;

  const error = firstParam(
    searchParams.error,
  );

  const success = firstParam(
    searchParams.success,
  );

  /* =======================================================
     SITES
  ======================================================= */

  const organisationSites =
    await database
      .select()
      .from(sites)
      .where(
        and(
          eq(
            sites.organisationId,
            organisationId,
          ),

          eq(
            sites.status,
            "active",
          ),
        ),
      )
      .orderBy(
        desc(sites.isDefault),
        asc(sites.createdAt),
      );

  /*
    Solo MVP:

    Default site = normal receiving destination.

    If an older organisation has a site but it was never marked
    as default, use the first active site rather than forcing the
    user to create duplicate data.
  */

  const receivingSite =
    organisationSites.find(
      (site) => site.isDefault,
    ) ??
    organisationSites[0] ??
    null;

  /* =======================================================
     PERMIT SUMMARY
  ======================================================= */

  let primaryPermit:
    | typeof sitePermits.$inferSelect
    | null = null;

  let acceptedEwcCount = 0;

  if (receivingSite) {
    const permitRows =
      await database
        .select()
        .from(sitePermits)
        .where(
          and(
            eq(
              sitePermits.organisationId,
              organisationId,
            ),

            eq(
              sitePermits.siteId,
              receivingSite.id,
            ),
          ),
        )
        .orderBy(
          desc(
            sitePermits.isPrimary,
          ),
          desc(
            sitePermits.createdAt,
          ),
        )
        .limit(1);

    primaryPermit =
      permitRows[0] ?? null;

    if (primaryPermit) {
      const countRows =
        await database
          .select({
            count: sql<number>`count(*)`,
          })
          .from(
            permitEwcCodes,
          )
          .where(
            and(
              eq(
                permitEwcCodes.permitId,
                primaryPermit.id,
              ),

              eq(
                permitEwcCodes.isActive,
                true,
              ),
            ),
          );

      acceptedEwcCount =
        Number(
          countRows[0]?.count ??
            0,
        );
    }
  }

  /* =======================================================
     PERMISSIONS
  ======================================================= */

  const canEdit =
    currentUser.role ===
      "administrator" ||
    currentUser.role ===
      "seniorManagement";

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">

        {/* =================================================
            HEADER
        ================================================= */}

        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
              Compliance
            </p>

            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Receiving Site & Permit
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Configure the destination
              Waste X should normally use
              for incoming jobs, its
              environmental authorisation
              and the EWC codes the site
              is permitted to receive.
            </p>
          </div>
        </section>

        {/* =================================================
            MESSAGES
        ================================================= */}

        {error && (
          <Message
            type="error"
          >
            {messageForError(
              error,
            )}
          </Message>
        )}

        {success && (
          <Message
            type="success"
          >
            {messageForSuccess(
              success,
            )}
          </Message>
        )}

        {/* =================================================
            NO RECEIVING SITE
        ================================================= */}

        {!receivingSite && (
          <section className="rounded-[2rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
                First setup
              </p>

              <h2 className="mt-3 text-2xl font-semibold text-black">
                Add your receiving
                site
              </h2>

              <p className="mt-3 text-sm leading-6 text-black/50">
                This is your normal
                destination for incoming
                waste. Waste X will use it
                automatically when
                booking normal incoming
                jobs.
              </p>
            </div>

            {canEdit ? (
              <form
                action={
                  createReceivingSiteAction
                }
                className="mt-8 grid gap-5 lg:grid-cols-2"
              >
                <Field
                  label="Receiving site name"
                  name="name"
                  placeholder="Suffolk Waste Management"
                  required
                />

                <Field
                  label="Postcode"
                  name="postcode"
                  placeholder="IP1 1AA"
                />

                <div className="lg:col-span-2">
                  <Field
                    label="Full address"
                    name="fullAddress"
                    placeholder="Full operating site address"
                  />
                </div>

                <div className="lg:col-span-2">
                  <button
                    type="submit"
                    className="rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400 transition hover:bg-black/85"
                  >
                    Create Receiving
                    Site
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-7 rounded-2xl bg-orange-50 p-5 text-sm text-orange-800">
                An administrator needs
                to configure the
                receiving site.
              </div>
            )}
          </section>
        )}

        {/* =================================================
            RECEIVING SITE
        ================================================= */}

        {receivingSite && (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <StatCard
                label="Receiving site"
                value={
                  receivingSite.name
                }
              />

              <StatCard
                label="Permit"
                value={
                  primaryPermit
                    ?.permitNumber ??
                  "Not configured"
                }
              />

              <StatCard
                label="Accepted EWC codes"
                value={
                  acceptedEwcCount.toLocaleString()
                }
              />
            </section>

            <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
              <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold text-black">
                      {
                        receivingSite.name
                      }
                    </h2>

                    <span className="rounded-full bg-green-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-green-700">
                      Primary destination
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-black/50">
                    {receivingSite.fullAddress ??
                      "Address not configured"}

                    {receivingSite.postcode
                      ? ` · ${receivingSite.postcode}`
                      : ""}
                  </p>
                </div>

                <Link
                  href={`/home/sites/${receivingSite.id}`}
                  className="inline-flex shrink-0 justify-center rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-black/85"
                >
                  Manage Site & Permit
                </Link>
              </div>

              <div className="mt-8 grid gap-4 border-t border-black/10 pt-6 md:grid-cols-3">
                <MiniDetail
                  label="Site type"
                  value="Waste receiving site"
                />

                <MiniDetail
                  label="Permit status"
                  value={permitStatusLabel(
                    primaryPermit?.status ??
                      null,
                  )}
                />

                <MiniDetail
                  label="DWT destination"
                  value="Automatic"
                />
              </div>
            </section>

            {/* ===============================================
                SOLO BEHAVIOUR
            =============================================== */}

            <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">
                Solo Workspace
              </p>

              <h2 className="mt-3 text-xl font-semibold text-black">
                This destination will
                not need to be selected
                on every incoming job.
              </h2>

              <p className="mt-3 max-w-4xl text-sm leading-6 text-black/55">
                Waste X will treat this
                as the normal receiving
                destination and reuse the
                site and permit
                information automatically.
                A different destination
                only needs to be chosen
                when the actual job
                requires one.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>

      <p className="mt-3 truncate text-xl font-semibold text-black">
        {value}
      </p>
    </article>
  );
}

function MiniDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/30">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-black/70">
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-black/40">
        {label}
      </span>

      <input
        name={name}
        placeholder={placeholder}
        required={required}
        className="h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
    </label>
  );
}

function Message({
  type,
  children,
}: {
  type: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        type === "success"
          ? "rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-medium text-green-800"
          : "rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800"
      }
    >
      {children}
    </div>
  );
}