import { database } from "@/db/database";
import { listingTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import TemplateEditorClient from "./TemplateEditorClient";
import { serialize } from "@/util/serialize";

import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";
import { hasOperationalPermission } from "@/modules/auth/core/permissions";

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

function getTemplateStatusLabel({
  isActive,
  isLocked,
}: {
  isActive: boolean | null;
  isLocked: boolean | null;
}) {
  if (!isActive) return "Inactive";
  if (isLocked) return "Locked";
  return "Editable";
}

function getTemplateStatusClass({
  isActive,
  isLocked,
}: {
  isActive: boolean | null;
  isLocked: boolean | null;
}) {
  if (!isActive) return "border-gray-300 bg-gray-100 text-gray-700";
  if (isLocked) return "border-orange-300 bg-orange-100 text-orange-700";
  return "border-green-300 bg-green-100 text-green-700";
}

/* =========================================================
   PAGE
========================================================= */

export default async function TemplateEditor({
  params,
}: {
  params: { id: string };
}) {
  const context = await requireOperationalPermission("template:view");

  const template = await database.query.listingTemplates.findFirst({
    where: eq(listingTemplates.id, params.id),
    with: {
      sections: {
        with: {
          fields: true,
        },
      },
    },
  });

  if (!template) {
    notFound();
  }

  if (template.organisationId !== context.user.organisationId) {
    notFound();
  }

  const canEditTemplate = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType: context.departmentType,
    permission: "template:edit",
  });

  const isEditable =
    canEditTemplate && Boolean(template.isActive) && !template.isLocked;

  const normalizedTemplate = {
    ...template,
    sections: (template.sections ?? []).map((section) => ({
      ...section,
      fields: (section.fields ?? []).map((field) => ({
        ...field,
      })),
    })),
  };

  const sectionCount = normalizedTemplate.sections.length;

  const fieldCount = normalizedTemplate.sections.reduce(
    (total, section) => total + (section.fields?.length ?? 0),
    0,
  );

  const requiredFieldCount = normalizedTemplate.sections.reduce(
    (total, section) =>
      total +
      (section.fields ?? []).filter((field) => Boolean(field.required)).length,
    0,
  );

  const isEmptyTemplate = sectionCount === 0 && fieldCount === 0;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-[17vh] pb-16 text-black">
      <div className="space-y-8">
        {/* BACK / TOP ACTIONS */}
        <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link
            href="/home/operations/templates"
            className="text-sm font-medium text-black/45 transition hover:text-orange-600"
          >
            ← Back to template library
          </Link>

          <div className="flex flex-wrap gap-3">
            <span className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/45">
              Active department: {context.departmentLabel}
            </span>

            <span
              className={`rounded-full border px-4 py-2 text-xs font-semibold ${getTemplateStatusClass(
                {
                  isActive: template.isActive,
                  isLocked: template.isLocked,
                },
              )}`}
            >
              {getTemplateStatusLabel({
                isActive: template.isActive,
                isLocked: template.isLocked,
              })}
            </span>
          </div>
        </section>

        {/* HEADER */}
        <section className="rounded-[2rem] border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-orange-400">
                Waste X Template Builder
              </p>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                {template.name}
              </h1>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
                Build the structured data capture used when your organisation
                creates waste listings. Sections group the form, fields capture
                operational data, and required fields make sure the listing has
                the minimum information needed for assignment, compliance and
                Digital Waste Tracking.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <HeaderPill>Version {template.version}</HeaderPill>

                <HeaderPill>
                  Edit Access: {isEditable ? "Yes" : "No"}
                </HeaderPill>

                <HeaderPill>
                  Created {formatDate(template.createdAt)}
                </HeaderPill>

                <HeaderPill>
                  Department: {context.departmentLabel}
                </HeaderPill>
              </div>
            </div>

            <div className="rounded-3xl border border-orange-400/20 bg-orange-500/10 p-5 text-sm leading-6 text-orange-100 xl:w-[360px]">
              <p className="font-semibold text-orange-300">
                Template structure
              </p>

              <p className="mt-2 text-white/55">
                Add sections first, then add fields inside each section. Once a
                template is locked, it should be protected so old listings keep
                their original structure.
              </p>
            </div>
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
          <MetricCard label="Sections" value={String(sectionCount)} />

          <MetricCard label="Fields" value={String(fieldCount)} />

          <MetricCard
            label="Required Fields"
            value={String(requiredFieldCount)}
          />

          <MetricCard label="Version" value={String(template.version)} />
        </section>

        {/* EMPTY TEMPLATE MESSAGE */}
        {isEmptyTemplate && isEditable && (
          <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-orange-800 shadow-sm">
            <p className="text-sm font-semibold">
              This template is empty — start by adding your first section.
            </p>

            <p className="mt-2 max-w-4xl text-sm leading-6">
              This is normal for a newly created template. Add sections such as
              Waste Details, Collection Site, Hazard Information or Pricing,
              then add fields inside those sections.
            </p>
          </section>
        )}

        {isEmptyTemplate && !isEditable && (
          <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-orange-800 shadow-sm">
            <p className="text-sm font-semibold">
              This template has no structure yet.
            </p>

            <p className="mt-2 max-w-4xl text-sm leading-6">
              No sections or fields have been added. You are currently viewing
              this template in read-only mode, so you cannot build the structure
              from this permission context.
            </p>
          </section>
        )}

        {/* READ ONLY MESSAGE */}
        {!isEditable && (
          <section className="rounded-3xl border border-black/10 bg-white p-6 text-sm leading-6 text-black/55 shadow-sm">
            <p className="font-semibold text-black">Read-only template</p>

            <p className="mt-1">
              This template cannot be edited from your current permission
              context, or it has been locked for operational safety. Locked
              templates should be preserved for audit consistency.
            </p>
          </section>
        )}

        {/* EDITOR / READONLY */}
        {isEditable ? (
          <section className="rounded-[2rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="mb-8 border-b border-black/10 pb-6">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Builder Workspace
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-black">
                Configure sections and fields
              </h2>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-black/45">
                Use this workspace to build the listing form structure. Changes
                here control what data your generator team captures when
                creating a waste listing.
              </p>
            </div>

            <TemplateEditorClient template={serialize(normalizedTemplate)} />
          </section>
        ) : (
          <ReadonlyTemplate template={normalizedTemplate} />
        )}
      </div>
    </main>
  );
}

/* =========================================================
   READ ONLY TEMPLATE
========================================================= */

function ReadonlyTemplate({ template }: { template: any }) {
  const sections = template.sections ?? [];

  return (
    <section className="space-y-6">
      {sections.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-black/20 bg-white p-10 text-center shadow-sm">
          <p className="text-base font-semibold text-black">
            No template structure found.
          </p>

          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-black/45">
            This template does not have sections or fields yet. A generator user
            with template edit permission can add structure while the template is
            active and unlocked.
          </p>
        </div>
      ) : (
        sections.map((section: any) => (
          <div
            key={section.id}
            className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm"
          >
            <div className="mb-6 border-b border-black/10 pb-5">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Template Section
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                {section.title}
              </h2>
            </div>

            {section.fields?.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {section.fields.map((field: any) => (
                  <div
                    key={field.id}
                    className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-black">
                          {field.label}
                        </p>

                        <p className="mt-1 text-xs text-black/45">
                          Key: <span className="font-mono">{field.key}</span>
                        </p>
                      </div>

                      {field.required && (
                        <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                          Required
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <MiniStat label="Type" value={field.fieldType} />
                      <MiniStat
                        label="Order"
                        value={String(field.orderIndex)}
                      />
                    </div>

                    {field.helpText && (
                      <p className="mt-4 text-sm leading-6 text-black/50">
                        {field.helpText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-6 text-sm text-black/45">
                No fields in this section.
              </div>
            )}
          </div>
        ))
      )}
    </section>
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/40">
        {label}
      </p>

      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-3">
      <p className="text-[10px] uppercase tracking-widest text-black/35">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold capitalize text-black">
        {value}
      </p>
    </div>
  );
}