import Link from "next/link";
import { redirect } from "next/navigation";

import { createTemplateAction } from "@/modules/templates/actions/templateActions";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

/* =========================================================
   SERVER ACTION
========================================================= */

async function createTemplate(formData: FormData) {
  "use server";

  /*
    Server-side protection.

    This prevents users without template:create from bypassing the UI
    and manually submitting a request.
  */
  await requireOperationalPermission("template:create");

  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirect("/home/operations/templates/create?error=missing-name");
  }

  /*
    Your existing createTemplateAction currently accepts only name.

    If you later update it to accept description too, you can also read:
    const description = String(formData.get("description") ?? "").trim();
  */
  const template = await createTemplateAction(name);

  if (!template?.id) {
    redirect("/home/operations/templates/create?error=create-failed");
  }

  redirect(`/home/operations/templates/${template.id}`);
}

/* =========================================================
   PAGE
========================================================= */

export default async function CreateTemplatePage({
  searchParams,
}: {
  searchParams?: {
    error?: string;
  };
}) {
  /*
    Page-level protection.

    Only users with template:create can access this page.

    Under the updated matrix:
    - generator department can create templates
    - manager cannot create listing templates
    - carrier cannot create templates
    - compliance cannot create templates
  */
  const context = await requireOperationalPermission("template:create");

  const error = searchParams?.error;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="max-w-5xl space-y-8">
        {/* BACK */}
        <Link
          href="/home/operations/templates"
          className="text-sm font-medium text-black/45 transition hover:text-orange-600"
        >
          ← Back to template library
        </Link>

        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
            Waste X Templates
          </p>

          <h1 className="mt-3 text-3xl font-semibold">
            Create Listing Template
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
            Create a reusable template for structured waste listing data.
            Templates help your organisation keep listings consistent,
            audit-ready and aligned with operational requirements.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <HeaderPill>Organisation: {context.organisation.teamName}</HeaderPill>
            <HeaderPill>Department: {context.departmentLabel}</HeaderPill>
            <HeaderPill>Permission: template:create</HeaderPill>
          </div>
        </section>

        {/* GRID */}
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-6">
          {/* FORM */}
          <section className="xl:col-span-4">
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-8">
                <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                  Template Setup
                </p>

                <h2 className="mt-2 text-xl font-semibold text-black">
                  Basic Template Details
                </h2>

                <p className="mt-2 text-sm leading-6 text-black/45">
                  Start with a clear template name. After creation, you’ll be
                  taken into the template builder where sections and fields can
                  be added.
                </p>
              </div>

              {error === "missing-name" && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  Template name is required.
                </div>
              )}

              {error === "create-failed" && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  Something went wrong while creating the template. Please try
                  again.
                </div>
              )}

              <form action={createTemplate} className="space-y-6">
                {/* NAME */}
                <div>
                  <label
                    htmlFor="name"
                    className="text-sm font-medium text-black"
                  >
                    Template Name <span className="text-orange-600">*</span>
                  </label>

                  <p className="mt-1 text-xs text-black/40">
                    Use a name your team will recognise when creating waste
                    listings.
                  </p>

                  <input
                    id="name"
                    name="name"
                    required
                    placeholder="Example: Construction Waste Collection"
                    className="mt-3 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
                  />
                </div>

                {/* DESCRIPTION */}
                <div>
                  <label
                    htmlFor="description"
                    className="text-sm font-medium text-black"
                  >
                    Description
                  </label>

                  <p className="mt-1 text-xs text-black/40">
                    Optional for now. This is included in the form, but your
                    current create action only saves the template name.
                  </p>

                  <textarea
                    id="description"
                    name="description"
                    placeholder="Describe what this template should be used for..."
                    rows={4}
                    className="mt-3 w-full resize-none rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
                  />
                </div>

                {/* ACTIONS */}
                <div className="flex items-center justify-between gap-4 border-t border-black/5 pt-6">
                  <div className="text-xs text-black/40">
                    You can add sections, fields and required data rules after
                    creating the template.
                  </div>

                  <button
                    type="submit"
                    className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
                  >
                    Create Template
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* RIGHT PANEL */}
          <aside className="xl:col-span-2 space-y-6">
            <GuidanceCard
              label="Step 01"
              title="Create Template"
              text="Create the base template record. This stores ownership, versioning and active state."
            />

            <GuidanceCard
              label="Step 02"
              title="Add Sections"
              text="Break the template into operational sections such as waste details, collection site, hazards, documents or pricing."
            />

            <GuidanceCard
              label="Step 03"
              title="Add Fields"
              text="Add structured fields so listings capture consistent data every time they are created."
            />

            <GuidanceCard
              label="Compliance Note"
              title="Keep it structured"
              text="Avoid free-text-only templates. Structured fields make audit exports, verification and reporting much stronger."
              highlighted
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function HeaderPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
      {children}
    </span>
  );
}

function GuidanceCard({
  label,
  title,
  text,
  highlighted = false,
}: {
  label: string;
  title: string;
  text: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-6 shadow-sm ${
        highlighted
          ? "border-orange-300 bg-orange-50"
          : "border-black/10 bg-white"
      }`}
    >
      <p
        className={`text-xs uppercase tracking-[0.25em] ${
          highlighted ? "text-orange-700" : "text-orange-600"
        }`}
      >
        {label}
      </p>

      <h3 className="mt-3 text-base font-semibold text-black">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-black/50">{text}</p>
    </div>
  );
}