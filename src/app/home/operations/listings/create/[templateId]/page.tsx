import Link from "next/link";
import { notFound } from "next/navigation";

import { getTemplateWithStructure } from "@/modules/listings/queries/getTemplateWithStructure";
import DynamicWasteListingForm from "@/components/app/Templates/DynamicWasteListingForm";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

/* =========================================================
   PAGE
========================================================= */

export default async function TemplateCreatePage({
  params,
}: {
  params: { templateId: string };
}) {
  /* =========================================================
     PAGE PERMISSION GUARD

     Only users with listing:create can use a template to create a listing.
  ========================================================= */

  const context = await requireOperationalPermission("listing:create");

  const template = await getTemplateWithStructure(params.templateId);

  if (!template || !template.isLocked) {
    notFound();
  }

  /*
    Organisation safety check.

    A user should not be able to manually enter another organisation's
    template id and create a listing from it.
  */
  if (template.organisationId !== context.organisation.id) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-10 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Create Waste Listing
              </p>

              <h1 className="mt-3 text-3xl font-semibold">{template.name}</h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Complete the template below to create a new waste listing. This
                workflow is restricted to generator departments and will create
                the listing under your organisation.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
                  Department: {context.department.name}
                </span>

                <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-xs font-medium text-orange-300">
                  Version {template.version}
                </span>

                <span className="rounded-full border border-green-400/30 bg-green-500/10 px-4 py-2 text-xs font-medium text-green-300">
                  Published Template
                </span>
              </div>
            </div>

            <Link
              href="/home/operations/listings/create"
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/70 transition hover:border-orange-400/40 hover:text-orange-300"
            >
              Change Template
            </Link>
          </div>
        </section>

        {/* TEMPLATE CONTEXT */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <InfoPanel
            label="Organisation"
            value={context.organisation.teamName ?? "Your organisation"}
          />

          <InfoPanel label="Template Version" value={`Version ${template.version}`} />

          <InfoPanel
            label="Access"
            value="Generator listing creation"
          />
        </section>

        {/* FORM */}
        <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-8 border-b border-black/10 pb-6">
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              Listing Form
            </p>

            <h2 className="mt-2 text-2xl font-semibold text-black">
              Complete Listing Details
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
              Fill in all required fields. Once submitted, the listing will be
              created using this locked template structure.
            </p>
          </div>

          <DynamicWasteListingForm template={template} />
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function InfoPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-black/35">
        {label}
      </p>
      <p className="mt-3 text-lg font-semibold text-black">{value}</p>
    </div>
  );
}