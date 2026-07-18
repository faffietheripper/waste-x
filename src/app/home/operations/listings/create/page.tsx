import Link from "next/link";

import { getOrgTemplatesAction } from "@/modules/templates/actions/templateActions";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

/* =========================================================
   PAGE
========================================================= */

export default async function CreateWasteListing() {
  /*
    PAGE PERMISSION GUARD

    Only departments with listing:create can access this page.

    Under the updated matrix:
    - generator can create listings
    - manager cannot create listings
    - carrier cannot create listings
    - compliance cannot create listings
  */

  const context = await requireOperationalPermission("listing:create");

  const templates = (await getOrgTemplatesAction()) ?? [];

  const lockedTemplates = templates.filter((template) => template.isLocked);

  const canManageTemplates =
    context.user.role === "administrator" ||
    context.user.role === "seniorManagement";

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-10 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Listings
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                Select Listing Template
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Choose a published template to create a new waste listing. This
                action is restricted to generator departments because waste
                listing creation starts from the waste producer.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
                  Department: {context.department.name}
                </span>

                <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-xs font-medium text-orange-300">
                  Published templates: {lockedTemplates.length}
                </span>
              </div>
            </div>

            <Link
              href="/home/operations/listings"
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/70 transition hover:border-orange-400/40 hover:text-orange-300"
            >
              Back to Listings
            </Link>
          </div>
        </section>

        {/* EXPLAINER */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <InfoPanel
            label="Step 1"
            title="Choose Template"
            description="Templates control the waste information collected for each listing."
          />

          <InfoPanel
            label="Step 2"
            title="Complete Listing"
            description="Fill out the structured form, upload evidence and set listing behaviour."
          />

          <InfoPanel
            label="Step 3"
            title="Assign or Publish"
            description="Open the listing to the marketplace or keep it internal depending on the workflow."
          />
        </section>

        {/* NO TEMPLATES STATE */}
        {lockedTemplates.length === 0 && (
          <section className="rounded-3xl border border-dashed border-black/20 bg-white p-10 shadow-sm">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                No Published Templates
              </p>

              <h2 className="mt-3 text-2xl font-semibold text-black">
                No templates available
              </h2>

              <p className="mt-4 text-sm leading-6 text-black/55">
                There are currently no published templates available for your
                organisation. A template must be locked/published before it can
                be used to create a waste listing.
              </p>

              <p className="mt-3 text-sm leading-6 text-black/55">
                Please ask your company administrator to publish a template so
                generator users can create waste listings safely and
                consistently.
              </p>

              {canManageTemplates && (
                <div className="mt-6">
                  <Link
                    href="/home/operations/templates"
                    className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                  >
                    Create or publish templates →
                  </Link>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TEMPLATE LIST */}
        {lockedTemplates.length > 0 && (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {lockedTemplates.map((template) => (
              <Link
                key={template.id}
                href={`/home/operations/listings/create/${template.id}`}
                className="group rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                      Listing Template
                    </p>

                    <h2 className="mt-3 text-xl font-semibold text-black">
                      {template.name}
                    </h2>

                    {template.description && (
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-black/50">
                        {template.description}
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap gap-3">
                      <span className="rounded-full border border-black/10 bg-[#f7f3ed] px-3 py-1 text-xs font-semibold text-black/50">
                        Version {template.version}
                      </span>

                      <span className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                        Published
                      </span>
                    </div>
                  </div>

                  <span className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-orange-500 group-hover:text-black">
                    Use →
                  </span>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function InfoPanel({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        {label}
      </p>

      <h2 className="mt-3 text-lg font-semibold text-black">{title}</h2>

      <p className="mt-2 text-sm leading-6 text-black/50">{description}</p>
    </div>
  );
}