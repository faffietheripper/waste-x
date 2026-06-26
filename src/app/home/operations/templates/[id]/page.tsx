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
  /*
    PAGE PERMISSION GUARD

    Users need template:view to open the template record.
    Editing is only allowed when:
    - user has template:edit
    - template is active
    - template is not locked
  */

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

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="space-y-8">
        {/* BACK */}
        <Link
          href="/home/operations/templates"
          className="text-sm font-medium text-black/45 transition hover:text-orange-600"
        >
          ← Back to template library
        </Link>

        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Template
              </p>

              <h1 className="mt-3 text-3xl font-semibold">{template.name}</h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Review this structured listing template. Editable templates can
                be updated before being locked. Locked templates are protected
                to preserve historical listing consistency.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <HeaderPill>Department: {context.department.name}</HeaderPill>
                <HeaderPill>Version: {template.version}</HeaderPill>
                <HeaderPill>
                  Edit Access: {isEditable ? "Yes" : "No"}
                </HeaderPill>
              </div>
            </div>

            <span
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${getTemplateStatusClass(
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

        {/* TEMPLATE SUMMARY */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
          <MetricCard
            label="Sections"
            value={String(template.sections?.length ?? 0)}
          />

          <MetricCard
            label="Fields"
            value={String(
              (template.sections ?? []).reduce(
                (total, section) => total + (section.fields?.length ?? 0),
                0,
              ),
            )}
          />

          <MetricCard label="Version" value={String(template.version)} />

          <MetricCard label="Created" value={formatDate(template.createdAt)} />
        </section>

        {!isEditable && (
          <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-sm leading-6 text-orange-800 shadow-sm">
            <p className="font-semibold">Read-only template</p>
            <p className="mt-1">
              This template cannot be edited from your current permission
              context, or it has been locked for operational safety. Locked
              templates should be preserved for audit consistency.
            </p>
          </section>
        )}

        {isEditable ? (
          <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
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
          <p className="mt-2 text-sm text-black/45">
            This template does not have sections or fields yet.
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
                          Key:{" "}
                          <span className="font-mono">{field.key}</span>
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
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>
      <p className="mt-3 text-lg font-semibold text-black">{value}</p>
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