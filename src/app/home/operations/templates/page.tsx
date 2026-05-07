import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  listingTemplates,
  listingTemplateSections,
  listingTemplateFields,
  wasteListings,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

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
  return "Active";
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
  const session = await auth();

  if (!session?.user?.organisationId) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">
          Unauthorized. You must belong to an organisation to view listing
          templates.
        </div>
      </main>
    );
  }

  const organisationId = session.user.organisationId;

  const templates = await database.query.listingTemplates.findMany({
    where: eq(listingTemplates.organisationId, organisationId),
    orderBy: desc(listingTemplates.createdAt),
  });

  /*
    Your current schema uses isActive / isLocked.
    There is no archived column on listingTemplates.

    Active templates:
      isActive === true

    Inactive templates:
      isActive === false

    Locked templates:
      cannot be safely edited without creating a new version.
  */

  const activeTemplates = templates.filter((template) => template.isActive);
  const inactiveTemplates = templates.filter((template) => !template.isActive);
  const lockedTemplates = templates.filter((template) => template.isLocked);

  /*
    Pull related records so we can show richer template cards:
    - sections count
    - fields count
    - how many listings use each template

    This keeps the page useful without hiding information.
  */

  const sections = await database.query.listingTemplateSections.findMany({
    where: undefined,
  });

  const fields = await database.query.listingTemplateFields.findMany({
    where: undefined,
  });

  const listings = await database.query.wasteListings.findMany({
    where: eq(wasteListings.organisationId, organisationId),
  });

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
    active: activeTemplates.length,
    inactive: inactiveTemplates.length,
    locked: lockedTemplates.length,
    totalSections: sections.filter((section) =>
      templates.some((template) => template.id === section.templateId),
    ).length,
    totalFields: fields.filter((field) =>
      templates.some((template) => template.id === field.templateId),
    ).length,
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
                Templates keep listings consistent, audit-ready and aligned with
                your organisation’s operational data requirements.
              </p>
            </div>

            <Link
              href="/home/operations/templates/create"
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              + Create Template
            </Link>
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total" value={metrics.total} />
          <MetricCard label="Active" value={metrics.active} />
          <MetricCard label="Inactive" value={metrics.inactive} />
          <MetricCard label="Locked" value={metrics.locked} />
          <MetricCard label="Sections" value={metrics.totalSections} />
          <MetricCard label="Fields" value={metrics.totalFields} />
        </section>

        {/* TEMPLATE GUIDANCE */}
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
              text="Locked templates protect historical listing data. If a template is already used in live workflows, prefer creating a new version instead of editing the original."
            />

            <GuidanceCard
              title="Audit Readiness"
              label="Compliance"
              text="Consistent template sections and fields make exports, reporting and chain-of-custody evidence easier to validate later."
            />
          </div>
        </section>

        {/* ACTIVE TEMPLATES */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Active Records
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                Active Templates
              </h2>
              <p className="mt-2 text-sm text-black/45">
                Templates currently available for new waste listings.
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400">
              {activeTemplates.length} active
            </span>
          </div>

          {activeTemplates.length === 0 ? (
            <EmptyState
              title="No active templates"
              text="Create your first template to start standardising waste listing data across your organisation."
              actionHref="/home/operations/templates/create"
              actionLabel="Create Template"
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {activeTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  stats={templateStatsById[template.id]}
                />
              ))}
            </div>
          )}
        </section>

        {/* LOCKED TEMPLATES */}
        {lockedTemplates.length > 0 && (
          <section className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Controlled Templates
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                Locked Templates
              </h2>
              <p className="mt-2 text-sm text-black/45">
                Locked templates are protected for operational consistency and
                historical record safety.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {lockedTemplates.map((template) => (
                <TemplateCard
                  key={`${template.id}-locked`}
                  template={template}
                  stats={templateStatsById[template.id]}
                  compact
                />
              ))}
            </div>
          </section>
        )}

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
                  key={`${template.id}-inactive`}
                  template={template}
                  stats={templateStatsById[template.id]}
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
  compact = false,
}: {
  template: TemplateRecord;
  stats?: TemplateStats;
  compact?: boolean;
}) {
  const sectionCount = stats?.sectionCount ?? 0;
  const fieldCount = stats?.fieldCount ?? 0;
  const listingUsageCount = stats?.listingUsageCount ?? 0;

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
          className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
        >
          View Template →
        </Link>
      </div>
    </div>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

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
  actionHref?: string;
  actionLabel?: string;
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
