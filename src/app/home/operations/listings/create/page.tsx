import Link from "next/link";

import { getOrgTemplatesAction } from "@/modules/templates/actions/templateActions";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";
import {
  getDwtListingProfileReadiness,
  safeParseDwtListingProfile,
} from "@/modules/digital-waste-tracking/core/dwtListingProfile";

/* =========================================================
   PAGE
========================================================= */

export default async function CreateWasteListing() {
  /*
    PAGE PERMISSION GUARD

    Only departments/workspaces with listing:create can access this page.

    Under the updated matrix:
    - generator can create listings
    - manager cannot create listings
    - carrier cannot create listings
    - compliance cannot create listings

    Solo mode can still pass through this guard through the operational
    permission helper.
  */

  const context = await requireOperationalPermission("listing:create");

  const templates = (await getOrgTemplatesAction()) ?? [];

  const lockedTemplates = templates.filter((template) => template.isLocked);

  const dwtReadyTemplates = lockedTemplates.filter((template) => {
    const profile = safeParseDwtListingProfile(template.dwtProfileJson);
    const readiness = getDwtListingProfileReadiness(profile);

    return readiness.tone === "success";
  });

  const dwtPartialTemplates = lockedTemplates.filter((template) => {
    const profile = safeParseDwtListingProfile(template.dwtProfileJson);
    const readiness = getDwtListingProfileReadiness(profile);

    return readiness.tone === "warning";
  });

  const canManageTemplates =
    context.user.role === "administrator" ||
    context.user.role === "seniorManagement";

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-10 py-32 ">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Listings
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                Select Listing Template
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Choose a published template to create a new waste listing.
                DWT-ready templates can prefill compliance data later for the
                manager or receiver, reducing manual entry at intake.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <HeaderPill>Department: {context.departmentLabel}</HeaderPill>

                <HeaderPill>
                  Published templates: {lockedTemplates.length}
                </HeaderPill>

                <HeaderPill>
                  DWT ready: {dwtReadyTemplates.length}
                </HeaderPill>

                <HeaderPill>
                  Needs review: {dwtPartialTemplates.length}
                </HeaderPill>
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
            title="Review DWT Prefill"
            description="DWT-ready templates can prefill EWC, physical form, container, weight and hazard checks."
          />

          <InfoPanel
            label="Step 3"
            title="Assign or Publish"
            description="Open the listing to the marketplace or keep it internal depending on the workflow."
          />
        </section>

        {/* DWT EXPLAINER */}
        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-700">
                DWT-ready templates
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                Optional compliance prefill
              </h2>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-orange-900/70">
                These fields are optional. A template can help prefill the DWT
                receive movement later, but missing values will not block
                listing creation. The final receiver/manager still confirms the
                actual values before submission.
              </p>
            </div>

            <div className="grid min-w-[260px] grid-cols-2 gap-3 text-sm">
              <MiniStat label="Ready" value={String(dwtReadyTemplates.length)} />
              <MiniStat
                label="Partial"
                value={String(dwtPartialTemplates.length)}
              />
            </div>
          </div>
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
            {lockedTemplates.map((template) => {
              const dwtProfile = safeParseDwtListingProfile(
                template.dwtProfileJson,
              );

              const dwtReadiness =
                getDwtListingProfileReadiness(dwtProfile);

              return (
                <Link
                  key={template.id}
                  href={`/home/operations/listings/create/${template.id}`}
                  className="group rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                          Listing Template
                        </p>

                        <DwtReadinessBadge tone={dwtReadiness.tone}>
                          {dwtReadiness.label}
                        </DwtReadinessBadge>
                      </div>

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

                        <span className="rounded-full border border-black/10 bg-[#f7f3ed] px-3 py-1 text-xs font-semibold text-black/50">
                          {dwtReadiness.completedFields}/
                          {dwtReadiness.totalFields} DWT fields
                        </span>
                      </div>

                      <DwtTemplateSummary
                        missing={dwtReadiness.missing}
                        warnings={dwtReadiness.warnings}
                      />
                    </div>

                    <span className="shrink-0 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-orange-500 group-hover:text-black">
                      Use →
                    </span>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-orange-200 bg-white/70 p-4">
      <p className="text-[10px] uppercase tracking-widest text-orange-700/70">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold text-black">{value}</p>
    </div>
  );
}

function DwtReadinessBadge({
  tone,
  children,
}: {
  tone: "muted" | "warning" | "success" | "danger";
  children: React.ReactNode;
}) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-orange-200 bg-orange-50 text-orange-700"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-black/10 bg-[#f7f3ed] text-black/50";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

function DwtTemplateSummary({
  missing,
  warnings,
}: {
  missing: string[];
  warnings: string[];
}) {
  if (missing.length === 0 && warnings.length === 0) {
    return (
      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
        This template has enough DWT prefill data to create a strong receive
        movement draft later.
      </div>
    );
  }

  const previewMissing = missing.slice(0, 4);
  const remainingMissing = Math.max(missing.length - previewMissing.length, 0);

  return (
    <div className="mt-5 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm leading-6">
      <p className="font-semibold text-black">DWT prefill summary</p>

      {previewMissing.length > 0 && (
        <p className="mt-2 text-black/55">
          Missing: {previewMissing.join(", ")}
          {remainingMissing > 0 ? ` +${remainingMissing} more` : ""}
        </p>
      )}

      {warnings.length > 0 && (
        <p className="mt-2 text-orange-700">
          Review: {warnings.slice(0, 2).join(" ")}
        </p>
      )}
    </div>
  );
}