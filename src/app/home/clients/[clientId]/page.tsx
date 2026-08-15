// src/app/home/clients/[clientId]/page.tsx

import Link from "next/link";

import {
  and,
  asc,
  desc,
  eq,
} from "drizzle-orm";

import {
  notFound,
  redirect,
} from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  counterparties,
  counterpartyRoles,
  counterpartySites,
  users,
} from "@/db/schema";

import {
  archiveClientAction,
  archiveClientSiteAction,
  createClientSiteAction,
  restoreClientAction,
  restoreClientSiteAction,
  setDefaultClientSiteAction,
  updateClientSiteAction,
} from "../actions";

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

function messageForSuccess(
  value: string,
) {
  const messages: Record<
    string,
    string
  > = {
    client_created:
      "Client created. Add their first job site below.",

    client_updated:
      "Client updated.",

    client_archived:
      "Client archived.",

    client_restored:
      "Client restored.",

    site_created:
      "Client site created.",

    site_updated:
      "Client site updated.",

    site_archived:
      "Client site archived.",

    site_restored:
      "Client site restored.",

    default_site_updated:
      "Default client site updated.",
  };

  return (
    messages[value] ??
    "Changes saved."
  );
}

function messageForError(
  value: string,
) {
  const messages: Record<
    string,
    string
  > = {
    site_name_required:
      "Enter a site name.",

    duplicate_site_name:
      "That client already has a site with this name.",

    site_not_found:
      "The client site could not be found.",

    site_not_available:
      "Only an active client site can be made the default.",
  };

  return (
    messages[value] ??
    "Something went wrong."
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: {
    clientId: string;
  };

  searchParams: {
    success?: string | string[];
    error?: string | string[];
  };
}) {
  const session =
    await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser =
    await database.query.users.findFirst({
      where: eq(
        users.id,
        session.user.id,
      ),

      columns: {
        organisationId: true,
      },
    });

  if (!currentUser?.organisationId) {
    redirect("/home");
  }

  const organisationId =
    currentUser.organisationId;

  /* =======================================================
     CLIENT
  ======================================================= */

  const clientRows =
    await database
      .select({
        id:
          counterparties.id,

        name:
          counterparties.name,

        accountReference:
          counterparties.accountReference,

        email:
          counterparties.email,

        telephone:
          counterparties.telephone,

        fullAddress:
          counterparties.fullAddress,

        postcode:
          counterparties.postcode,

        paymentTermsDays:
          counterparties.paymentTermsDays,

        notes:
          counterparties.notes,

        isActive:
          counterparties.isActive,
      })
      .from(counterparties)

      .innerJoin(
        counterpartyRoles,
        and(
          eq(
            counterpartyRoles.counterpartyId,
            counterparties.id,
          ),

          eq(
            counterpartyRoles.role,
            "client",
          ),
        ),
      )

      .where(
        and(
          eq(
            counterparties.id,
            params.clientId,
          ),

          eq(
            counterparties.organisationId,
            organisationId,
          ),
        ),
      )

      .limit(1);

  const client =
    clientRows[0];

  if (!client) {
    notFound();
  }

  /* =======================================================
     CLIENT SITES
  ======================================================= */

  const clientSites =
    await database
      .select()
      .from(
        counterpartySites,
      )
      .where(
        and(
          eq(
            counterpartySites.organisationId,
            organisationId,
          ),

          eq(
            counterpartySites.counterpartyId,
            client.id,
          ),
        ),
      )
      .orderBy(
        desc(
          counterpartySites.isActive,
        ),

        desc(
          counterpartySites.isDefault,
        ),

        asc(
          counterpartySites.name,
        ),
      );

  const activeSites =
    clientSites.filter(
      (site) =>
        site.isActive,
    );

  const defaultSite =
    activeSites.find(
      (site) =>
        site.isDefault,
    ) ?? null;

  const success =
    firstParam(
      searchParams.success,
    );

  const error =
    firstParam(
      searchParams.error,
    );

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">

        {/* =================================================
            HEADER
        ================================================= */}

        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <Link
                href="/home/clients"
                className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400"
              >
                ← Clients
              </Link>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-semibold">
                  {
                    client.name
                  }
                </h1>

                {!client.isActive && (
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase text-white/60">
                    Archived
                  </span>
                )}
              </div>

              <p className="mt-3 text-sm text-white/50">
                {client.accountReference
                  ? `Account ${client.accountReference}`
                  : "No account reference"}
              </p>
            </div>

            <Link
              href={`/home/clients/${client.id}/edit`}
              className="inline-flex justify-center rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black"
            >
              Edit Client
            </Link>
          </div>
        </section>

        {success && (
          <Message type="success">
            {messageForSuccess(
              success,
            )}
          </Message>
        )}

        {error && (
          <Message type="error">
            {messageForError(
              error,
            )}
          </Message>
        )}

        {/* =================================================
            CLIENT SUMMARY
        ================================================= */}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat
            label="Active Sites"
            value={String(
              activeSites.length,
            )}
          />

          <Stat
            label="Default Site"
            value={
              defaultSite?.name ??
              "Not set"
            }
          />

          <Stat
            label="Payment Terms"
            value={
              client.paymentTermsDays !==
              null
                ? `${client.paymentTermsDays} days`
                : "Not set"
            }
          />
        </section>

        {/* =================================================
            BUSINESS DETAILS
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <SectionTitle
            eyebrow="Client"
            title="Business Details"
          />

          <div className="mt-7 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            <Detail
              label="Email"
              value={
                client.email ??
                "Not set"
              }
            />

            <Detail
              label="Telephone"
              value={
                client.telephone ??
                "Not set"
              }
            />

            <Detail
              label="Account Reference"
              value={
                client.accountReference ??
                "Not set"
              }
            />

            <Detail
              label="Address"
              value={
                client.fullAddress ??
                "Not set"
              }
            />

            <Detail
              label="Postcode"
              value={
                client.postcode ??
                "Not set"
              }
            />

            <Detail
              label="Payment Terms"
              value={
                client.paymentTermsDays !==
                null
                  ? `${client.paymentTermsDays} days`
                  : "Not set"
              }
            />
          </div>

          {client.notes && (
            <div className="mt-7 border-t border-black/10 pt-6">
              <Detail
                label="Internal Notes"
                value={
                  client.notes
                }
              />
            </div>
          )}
        </section>

        {/* =================================================
            CLIENT SITES
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <SectionTitle
            eyebrow="Origins"
            title="Client Sites"
          />

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
            These are the client's
            waste-origin / job
            locations. When booking a
            job, selecting the client
            will let Waste X show these
            locations immediately.
          </p>

          {clientSites.length ===
          0 ? (
            <div className="mt-7 rounded-2xl border border-dashed border-black/15 bg-[#faf8f4] p-8 text-center">
              <p className="font-semibold">
                No client sites yet
              </p>

              <p className="mt-2 text-sm text-black/45">
                Add their first waste
                origin below.
              </p>
            </div>
          ) : (
            <div className="mt-7 space-y-4">
              {clientSites.map(
                (site) => (
                  <details
                    key={site.id}
                    className="group rounded-2xl border border-black/10 bg-[#faf8f4]"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 p-5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-black">
                            {
                              site.name
                            }
                          </h3>

                          {site.isDefault &&
                            site.isActive && (
                              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-semibold uppercase text-orange-700">
                                Default
                              </span>
                            )}

                          {!site.isActive && (
                            <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase text-black/40">
                              Archived
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-black/45">
                          {site.fullAddress ??
                            "No address"}

                          {site.postcode
                            ? ` · ${site.postcode}`
                            : ""}
                        </p>
                      </div>

                      <span className="text-lg text-orange-500">
                        +
                      </span>
                    </summary>

                    <div className="border-t border-black/10 p-5">
                      <form
                        action={
                          updateClientSiteAction
                        }
                        className="grid gap-5 md:grid-cols-2"
                      >
                        <input
                          type="hidden"
                          name="clientId"
                          value={
                            client.id
                          }
                        />

                        <input
                          type="hidden"
                          name="siteId"
                          value={
                            site.id
                          }
                        />

                        <Field
                          label="Site name"
                          name="name"
                          defaultValue={
                            site.name
                          }
                          required
                        />

                        <Field
                          label="Postcode"
                          name="postcode"
                          defaultValue={
                            site.postcode ??
                            ""
                          }
                        />

                        <div className="md:col-span-2">
                          <Field
                            label="Full address"
                            name="fullAddress"
                            defaultValue={
                              site.fullAddress ??
                              ""
                            }
                          />
                        </div>

                        <Field
                          label="Site contact"
                          name="contactName"
                          defaultValue={
                            site.contactName ??
                            ""
                          }
                        />

                        <Field
                          label="Contact telephone"
                          name="contactTelephone"
                          defaultValue={
                            site.contactTelephone ??
                            ""
                          }
                        />

                        <Field
                          label="Contact email"
                          name="contactEmail"
                          type="email"
                          defaultValue={
                            site.contactEmail ??
                            ""
                          }
                        />

                        <Field
                          label="Notes"
                          name="notes"
                          defaultValue={
                            site.notes ??
                            ""
                          }
                        />

                        <div className="flex flex-wrap gap-2 md:col-span-2">
                          {site.isActive && (
                            <button
                              type="submit"
                              className="rounded-xl bg-black px-4 py-2.5 text-xs font-semibold text-orange-400"
                            >
                              Save Site
                            </button>
                          )}
                        </div>
                      </form>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {site.isActive &&
                          !site.isDefault && (
                            <form
                              action={
                                setDefaultClientSiteAction
                              }
                            >
                              <input
                                type="hidden"
                                name="clientId"
                                value={
                                  client.id
                                }
                              />

                              <input
                                type="hidden"
                                name="siteId"
                                value={
                                  site.id
                                }
                              />

                              <button className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs font-semibold text-orange-700">
                                Make Default
                              </button>
                            </form>
                          )}

                        {site.isActive ? (
                          <form
                            action={
                              archiveClientSiteAction
                            }
                          >
                            <input
                              type="hidden"
                              name="clientId"
                              value={
                                client.id
                              }
                            />

                            <input
                              type="hidden"
                              name="siteId"
                              value={
                                site.id
                              }
                            />

                            <button className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
                              Archive Site
                            </button>
                          </form>
                        ) : (
                          <form
                            action={
                              restoreClientSiteAction
                            }
                          >
                            <input
                              type="hidden"
                              name="clientId"
                              value={
                                client.id
                              }
                            />

                            <input
                              type="hidden"
                              name="siteId"
                              value={
                                site.id
                              }
                            />

                            <button className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-xs font-semibold text-green-700">
                              Restore Site
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </details>
                ),
              )}
            </div>
          )}

          {/* ===============================================
              ADD SITE
          =============================================== */}

          {client.isActive && (
            <div className="mt-9 border-t border-black/10 pt-7">
              <h3 className="text-lg font-semibold">
                + Add Client Site
              </h3>

              <form
                action={
                  createClientSiteAction
                }
                className="mt-5 grid gap-5 md:grid-cols-2"
              >
                <input
                  type="hidden"
                  name="clientId"
                  value={client.id}
                />

                <Field
                  label="Site / project name"
                  name="name"
                  placeholder="Ipswich Housing Development"
                  required
                />

                <Field
                  label="Postcode"
                  name="postcode"
                  placeholder="IP3 9AA"
                />

                <div className="md:col-span-2">
                  <Field
                    label="Full address"
                    name="fullAddress"
                    placeholder="Waste origin / project address"
                  />
                </div>

                <Field
                  label="Site contact"
                  name="contactName"
                  placeholder="John Smith"
                />

                <Field
                  label="Contact telephone"
                  name="contactTelephone"
                  placeholder="07..."
                />

                <Field
                  label="Contact email"
                  name="contactEmail"
                  type="email"
                  placeholder="site@client.co.uk"
                />

                <Field
                  label="Notes"
                  name="notes"
                  placeholder="Gate instructions, project reference..."
                />

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="rounded-2xl bg-orange-500 px-6 py-3 text-sm font-semibold text-black"
                  >
                    Add Client Site
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>

        {/* =================================================
            FLOW EXPLANATION
        ================================================= */}

        <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
            Reused later
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <Flow
              number="01"
              title="Client"
              text={client.name}
            />

            <Flow
              number="02"
              title="Origin"
              text={
                defaultSite?.name ??
                "Choose a client site"
              }
            />

            <Flow
              number="03"
              title="Destination"
              text="Your primary receiving facility"
            />
          </div>
        </section>

        {/* =================================================
            CLIENT ARCHIVE
        ================================================= */}

        <section className="flex flex-wrap gap-3 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          {client.isActive ? (
            <form
              action={
                archiveClientAction
              }
            >
              <input
                type="hidden"
                name="clientId"
                value={
                  client.id
                }
              />

              <button className="rounded-2xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-700">
                Archive Client
              </button>
            </form>
          ) : (
            <form
              action={
                restoreClientAction
              }
            >
              <input
                type="hidden"
                name="clientId"
                value={
                  client.id
                }
              />

              <button className="rounded-2xl border border-green-200 bg-green-50 px-6 py-3 text-sm font-semibold text-green-700">
                Restore Client
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

const inputClass =
  "h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function SectionTitle({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-2xl font-semibold">
        {title}
      </h2>
    </div>
  );
}

function Stat({
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

      <p className="mt-3 truncate text-xl font-semibold">
        {value}
      </p>
    </article>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-black/30">
        {label}
      </p>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/65">
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
        {label}
      </span>

      <input
        name={name}
        type={type}
        defaultValue={
          defaultValue
        }
        placeholder={
          placeholder
        }
        required={required}
        className={inputClass}
      />
    </label>
  );
}

function Message({
  type,
  children,
}: {
  type:
    | "success"
    | "error";
  children:
    React.ReactNode;
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

function Flow({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-2xl bg-white p-5">
      <span className="font-mono text-xs font-semibold text-orange-600">
        {number}
      </span>

      <h3 className="mt-3 font-semibold">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-black/45">
        {text}
      </p>
    </article>
  );
}