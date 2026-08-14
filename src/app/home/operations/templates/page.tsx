import { database } from "@/db/database";
import {
  listingTemplates,
  listingTemplateSections,
  listingTemplateFields,
  wasteListings,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import {
  getDwtListingProfileReadiness,
  safeParseDwtListingProfile,
} from "@/modules/digital-waste-tracking/core/dwtListingProfile";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";
import { hasOperationalPermissionForOrganisation } from "@/modules/auth/core/permissions";

/* =========================================================
   TYPES
========================================================= */

type TemplateRecord = typeof listingTemplates.$inferSelect;

type TemplateStats = {
  sectionCount: number;
  fieldCount: number;
  listingUsageCount: number;
};

/* =========================================================
   FORMATTERS
========================================================= */

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTemplateStatusLabel(template: TemplateRecord) {
  if (!template.isActive) return "Inactive";
  if (template.isLocked) return "Locked";
  return "Editable";
}

function getTemplateStatusClass(template: TemplateRecord) {
  if (!template.isActive) {
    return "border-gray-300 bg-gray-100 text-gray-700";
  }

  if (template.isLocked) {
    return "border-orange-300 bg-orange-100 text-orange-700";
  }

  return "border-green-300 bg-green-100 text-green-700";
}

/* =========================================================
   PAGE
========================================================= */

export default async function TemplatesPage() {
  /*
    PAGE PERMISSION GUARD

    Only workspaces with template:view can access this page.

    With the updated permission matrix:
    - generator department can view templates
    - manager cannot create/view generator listing templates
    - carrier cannot access templates
    - compliance cannot access templates
  */

  const context = await requireOperationalPermission("template:view");

  const organisationId = context.user.organisationId!;

  const canCreateTemplates = hasOperationalPermissionForOrganisation({
    capabilities: context.capabilities,
    departmentType: context.storedDepartmentType ?? context.departmentType,
    permission: "template:create",
    operatingMode: context.organisation?.operatingMode ?? null,
  });

  const canEditTemplates = hasOperationalPermissionForOrganisation({
    capabilities: context.capabilities,
    departmentType: context.storedDepartmentType ?? context.departmentType,
    permission: "template:edit",
    operatingMode: context.organisation?.operatingMode ?? null,
  });

  const templates = await database.query.listingTemplates.findMany({
    where: eq(listingTemplates.organisationId, organisationId),
    orderBy: (templates, { desc }) => [desc(templates.createdAt)],
  });

  const templateIds = templates.map((template) => template.id);

  const sections =
    templateIds.length > 0
      ? await database.query.listingTemplateSections.findMany({
          where: inArray(listingTemplateSections.templateId, templateIds),
        })
      : [];

  const fields =
    templateIds.length > 0
      ? await database.query.listingTemplateFields.findMany({
          where: inArray(listingTemplateFields.templateId, templateIds),
        })
      : [];

  const listings = await database.query.wasteListings.findMany({
    where: eq(wasteListings.organisationId, organisationId),
  });

  const editableTemplates = templates.filter(
    (template) => template.isActive && !template.isLocked,
  );

  const lockedTemplates = templates.filter(
    (template) => template.isActive && template.isLocked,
  );

  const inactiveTemplates = templates.filter((template) => !template.isActive);

  const templateStatsById = templates.reduce<Record<string, TemplateStats>>(
    (acc, template) => {
      acc[template.id] = {
        sectionCount: sections.filter(
          (section) => section.templateId === template.id,
        ).length,

        fieldCount: fields.filter((field) => field.templateId === template.id)
          .length,

        listingUsageCount: listings.filter(
          (listing) => listing.templateId === template.id,
        ).length,
      };

      return acc;
    },
    {},
  );

  const metrics = {
    total: templates.length,
    editable: editableTemplates.length,
    locked: lockedTemplates.length,
    inactive: inactiveTemplates.length,
    totalSections: sections.length,
    totalFields: fields.length,
  };

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Operations
              </p>

              <h1 className="mt-3 text-3xl font-semibold">Template Library</h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Manage reusable listing templates for structured waste records.
                Templates keep generator listings consistent, audit-ready and
                aligned with your organisation’s operational requirements.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <HeaderPill>Department: {context.departmentLabel}</HeaderPill>
                <HeaderPill>Permission: template:view</HeaderPill>
                <HeaderPill>
                  Edit Access: {canEditTemplates ? "Yes" : "No"}
                </HeaderPill>
              </div>
            </div>

            {canCreateTemplates && (
              <Link
                href="/home/operations/templates/create"
                className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                + Create Template
              </Link>
            )}
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total" value={metrics.total} />
          <MetricCard label="Editable" value={metrics.editable} />
          <MetricCard label="Locked" value={metrics.locked} />
          <MetricCard label="Inactive" value={metrics.inactive} />
          <MetricCard label="Sections" value={metrics.totalSections} />
          <MetricCard label="Fields" value={metrics.totalFields} />
        </section>

        {/* GUIDANCE */}
        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-3">
            <GuidanceCard
              title="Structured Capture"
              label="Template Purpose"
              text="Templates define the fields your organisation needs when creating a waste listing. This keeps operational records consistent across teams and jobs."
            />

            <GuidanceCard
              title="Version Control"
              label="Operational Safety"
              text="Locked templates protect historical listing data. If a template is already used in live workflows, create a new version instead of editing the original."
            />

            <GuidanceCard
              title="Audit Readiness"
              label="Compliance"
              text="Consistent sections and fields make exports, reports and chain-of-custody evidence easier to validate later."
            />
          </div>
        </section>

        {/* EDITABLE TEMPLATES */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Editable Records
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                Editable Templates
              </h2>

              <p className="mt-2 text-sm text-black/45">
                Active templates that can still be edited before being locked
                for operational use.
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400">
              {editableTemplates.length} editable
            </span>
          </div>

          {editableTemplates.length === 0 ? (
            <EmptyState
              title="No editable templates"
              text="Create a new template or review locked templates already available for waste listing creation."
              actionHref={
                canCreateTemplates ? "/home/operations/templates/create" : null
              }
              actionLabel={canCreateTemplates ? "Create Template" : null}
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {editableTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  stats={templateStatsById[template.id]}
                  canEdit={canEditTemplates}
                />
              ))}
            </div>
          )}
        </section>

        {/* LOCKED TEMPLATES */}
        <section className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              Published Records
            </p>

            <h2 className="mt-2 text-xl font-semibold text-black">
              Locked Templates
            </h2>

            <p className="mt-2 text-sm text-black/45">
              Locked templates are protected for operational consistency and can
              be used to create waste listings.
            </p>
          </div>

          {lockedTemplates.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/20 bg-white p-8 text-sm text-black/45 shadow-sm">
              No locked templates yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {lockedTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  stats={templateStatsById[template.id]}
                  canEdit={false}
                  compact
                />
              ))}
            </div>
          )}
        </section>

        {/* INACTIVE TEMPLATES */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-black/35">
                Inactive Records
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                Inactive Templates
              </h2>

              <p className="mt-2 text-sm text-black/45">
                Templates no longer active for new listings, but retained for
                traceability and historical reference.
              </p>
            </div>

            <span className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black/45 ring-1 ring-black/10">
              {inactiveTemplates.length} inactive
            </span>
          </div>

          {inactiveTemplates.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/20 bg-white p-8 text-sm text-black/45 shadow-sm">
              No inactive templates.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 opacity-75 xl:grid-cols-3">
              {inactiveTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  stats={templateStatsById[template.id]}
                  canEdit={false}
                  compact
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   TEMPLATE CARD
========================================================= */

function TemplateCard({
  template,
  stats,
  canEdit,
  compact = false,
}: {
  template: TemplateRecord;
  stats?: TemplateStats;
  canEdit: boolean;
  compact?: boolean;
}) {
  const sectionCount = stats?.sectionCount ?? 0;
  const fieldCount = stats?.fieldCount ?? 0;
  const listingUsageCount = stats?.listingUsageCount ?? 0;

  const canOpenEditor = canEdit && template.isActive && !template.isLocked;
const dwtProfile = safeParseDwtListingProfile(template.dwtProfileJson);
const dwtReadiness = getDwtListingProfileReadiness(dwtProfile);

const dwtBadgeClass =
  dwtReadiness.tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : dwtReadiness.tone === "warning"
      ? "border-orange-200 bg-orange-50 text-orange-700"
      : "border-black/10 bg-[#fbfaf7] text-black/50";

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-orange-600">
            Listing Template
          </p>

          <h3 className="mt-3 text-lg font-semibold text-black">
            {template.name}
          </h3>

          {template.description && !compact && (
            <p className="mt-2 text-sm leading-6 text-black/50">
              {template.description}
            </p>
          )}
        </div>

        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getTemplateStatusClass(
            template,
          )}`}
        >
          {getTemplateStatusLabel(template)}
        </span>
        <span
  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${dwtBadgeClass}`}
>
  {dwtReadiness.label}
</span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <MiniStat label="Version" value={String(template.version)} />
        <MiniStat label="Sections" value={String(sectionCount)} />
        <MiniStat label="Fields" value={String(fieldCount)} />
      </div>

      {!compact && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <MiniStat label="Listings Used" value={String(listingUsageCount)} />
          <MiniStat label="Created" value={formatDate(template.createdAt)} />
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-black/5 pt-5">
        <div className="text-xs text-black/35">
          ID: <span className="font-mono">{template.id.slice(0, 10)}...</span>
        </div>

        <Link
          href={`/home/operations/templates/${template.id}`}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            canOpenEditor
              ? "bg-black text-white hover:bg-orange-500 hover:text-black"
              : "bg-[#f7f3ed] text-black/55 hover:bg-orange-100 hover:text-orange-700"
          }`}
        >
          {canOpenEditor ? "Edit Template →" : "View Template →"}
        </Link>
      </div>
    </div>
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

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
    </div>
  );
}

function GuidanceCard({
  label,
  title,
  text,
}: {
  label: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-orange-600">
        {label}
      </p>
      <h3 className="mt-3 text-base font-semibold text-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-black/50">{text}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-[10px] uppercase tracking-widest text-black/35">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function EmptyState({
  title,
  text,
  actionHref,
  actionLabel,
}: {
  title: string;
  text: string;
  actionHref?: string | null;
  actionLabel?: string | null;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-black/20 bg-white p-10 text-center shadow-sm">
      <p className="text-base font-semibold text-black">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
        {text}
      </p>

      {actionHref && actionLabel && (
        <div className="mt-6">
          <Link
            href={actionHref}
            className="inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            {actionLabel}
          </Link>
        </div>
      )}
    </div>
  );
}